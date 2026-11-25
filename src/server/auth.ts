import { Hono, type Context } from "hono";
import type { Env } from "./env";
import { turnstileOn } from "./turnstile";
import { addTour, ALL_TOURS, checkOnboarding, cleanTeach, parseTours, type Teach } from "../shared/onboarding";

/**
 * Sign-in. Everyone signs in (Google) to use rooms and classes whenever a sign-in method is set
 * up, unless REQUIRE_SIGNIN=0. The account is who you are everywhere: rooms, classes, rosters.
 *
 * Minimal OAuth 2.0 (Google) with no extra dependencies. Sessions are random tokens
 * in an HttpOnly cookie; only their SHA-256 hash is stored in D1.
 */

export interface User {
  id: string;
  /** The room identity this account uses everywhere (claimed from the first guest id). */
  uid: string;
  name: string;
  email: string | null;
  avatar: string | null;
  provider: string;
  /** Your room color (cursor, avatar ring); null = this device picks one. */
  color?: string | null;
  /**
   * Teacher or student, set once. Joining a class as a student makes it a student account;
   * choosing "I'm a teacher" (or making a class) makes it a teacher account. Students never
   * get teacher tools. null = not chosen yet.
   */
  role?: "teacher" | "student" | null;
  /** Finished the first-time welcome. */
  onboarded?: boolean;
  /** What a teacher teaches (orders the assignment templates). */
  teach?: Teach | null;
  /** Tours already seen or skipped. */
  tours?: string[];
}

export type Role = "teacher" | "student";

/** Sets the account type, only if it isn't set yet. Returns the account's type afterwards. */
export async function claimRole(env: Env, user: User, role: Role): Promise<Role> {
  if (user.role) return user.role;
  await env.DB!.prepare(`UPDATE users SET role = ?1 WHERE id = ?2 AND role IS NULL`).bind(role, user.id).run();
  const row = await env.DB!.prepare(`SELECT role FROM users WHERE id = ?1`).bind(user.id).first<{ role: Role | null }>();
  user.role = row?.role ?? role;
  return user.role;
}

const SESSION_COOKIE = "huddle_session";
const STATE_COOKIE = "huddle_oauth";
const SESSION_DAYS = 30;

type Provider = {
  authorize: string;
  token: string;
  scope: string;
  clientId: (e: Env) => string | undefined;
  clientSecret: (e: Env) => string | undefined;
  profile: (token: string) => Promise<{ id: string; name: string; email: string | null; avatar: string | null }>;
};

// Google only: schools run on Google accounts, and students use their school one.
const PROVIDERS: Record<string, Provider> = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    clientId: (e) => e.GOOGLE_CLIENT_ID,
    clientSecret: (e) => e.GOOGLE_CLIENT_SECRET,
    async profile(token) {
      const u: any = await (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${token}` } })).json();
      // Only keep emails Google has verified (admin access is granted by email).
      return { id: String(u.sub), name: u.name || u.email, email: u.email_verified === false ? null : (u.email ?? null), avatar: u.picture ?? null };
    },
  },
};

export function enabledProviders(env: Env): string[] {
  const out = Object.keys(PROVIDERS).filter(
    (p) => PROVIDERS[p] && PROVIDERS[p].clientId(env) && PROVIDERS[p].clientSecret(env),
  );
  if (env.DEV_AUTH === "1") out.push("dev");
  return out;
}

// ---------- small helpers (exported for tests) ----------

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookie(name: string, value: string, opts: { maxAge: number; secure: boolean }) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${opts.maxAge}${opts.secure ? "; Secure" : ""}`;
}

export async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const randomToken = (bytes = 32) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Only allow same-site relative return paths (no open redirects). The landing page sends you to your dashboard. */
export const safeReturn = (p: unknown) => {
  const to = typeof p === "string" && /^\/(?!\/)[\w\-/.?=&%]*$/.test(p) ? p : "/";
  return to === "/" ? "/dashboard" : to;
};

// ---------- storage ----------

let ready: Promise<void> | null = null;
export function ensureAuthTables(db: D1Database) {
  ready ??= db
    .batch([
      db.prepare(
        `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, uid TEXT, provider TEXT, provider_id TEXT, name TEXT, email TEXT, avatar TEXT, created_at INTEGER, UNIQUE(provider, provider_id))`,
      ),
      db.prepare(`CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER)`),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS user_rooms (user_id TEXT, code TEXT, title TEXT, last_at INTEGER, PRIMARY KEY (user_id, code))`,
      ),
    ])
    // Added later: whether this user hosts the room (1), only joined it (0), or unknown (NULL, older rows).
    .then(() => db.prepare(`ALTER TABLE user_rooms ADD COLUMN host INTEGER`).run().catch(() => {}))
    // Added later: profile edits. custom_* = 1 once you change it, so signing in again keeps it.
    .then(() =>
      Promise.all(
        [
          `ALTER TABLE users ADD COLUMN color TEXT`,
          `ALTER TABLE users ADD COLUMN custom_name INTEGER`,
          `ALTER TABLE users ADD COLUMN custom_avatar INTEGER`,
          // Added in Build 14: teacher or student.
          `ALTER TABLE users ADD COLUMN role TEXT`,
          // Added with onboarding: what a teacher teaches, and the tours seen.
          `ALTER TABLE users ADD COLUMN teach TEXT`,
          `ALTER TABLE users ADD COLUMN tours TEXT`,
        ].map((q) =>
          db.prepare(q).run().catch(() => {}),
        ),
      ),
    )
    // Added with onboarding. Everyone who already had an account when it shipped counts as
    // welcomed: the column is added exactly once, and only that run marks them.
    .then(() =>
      db
        .prepare(`ALTER TABLE users ADD COLUMN onboarded INTEGER`)
        .run()
        .then(
          () => db.prepare(`UPDATE users SET onboarded = 1`).run(),
          () => {},
        ),
    )
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

export async function currentUser(env: Env, req: Request): Promise<User | null> {
  const token = parseCookies(req.headers.get("cookie"))[SESSION_COOKIE];
  if (!token || !env.DB) return null;
  await ensureAuthTables(env.DB);
  const row = await env.DB.prepare(
    `SELECT u.id, u.uid, u.name, u.email, u.avatar, u.provider, u.color, u.role, u.onboarded, u.teach, u.tours FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > ?2`,
  )
    .bind(await sha256(token), Date.now())
    .first<Omit<User, "onboarded" | "teach" | "tours"> & { onboarded: number | null; teach: string | null; tours: string | null }>();
  if (!row) return null;
  let teach: Teach | null = null;
  try {
    teach = row.teach ? cleanTeach(JSON.parse(row.teach)) : null;
  } catch {
    /* ignore */
  }
  return { ...row, onboarded: row.onboarded === 1, teach, tours: parseTours(row.tours) };
}

async function upsertUser(db: D1Database, provider: string, p: { id: string; name: string; email: string | null; avatar: string | null }, guestUid: string) {
  await ensureAuthTables(db);
  const existing = await db.prepare(`SELECT id, uid FROM users WHERE provider = ?1 AND provider_id = ?2`).bind(provider, p.id).first<{ id: string; uid: string }>();
  if (existing) {
    // Keep a name or picture you set yourself; otherwise refresh them from Google.
    await db
      .prepare(
        `UPDATE users SET email = ?2,
           name = CASE WHEN custom_name = 1 THEN name ELSE ?1 END,
           avatar = CASE WHEN custom_avatar = 1 THEN avatar ELSE ?3 END
         WHERE id = ?4`,
      )
      .bind(p.name.slice(0, 60), p.email, p.avatar, existing.id)
      .run();
    return existing.id;
  }
  const id = randomToken(12);
  // The first sign-in claims the guest identity, so rooms you hosted stay yours.
  const uid = /^[\w-]{8,64}$/.test(guestUid) ? guestUid : crypto.randomUUID();
  await db
    .prepare(`INSERT INTO users (id, uid, provider, provider_id, name, email, avatar, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`)
    .bind(id, uid, provider, p.id, p.name.slice(0, 60), p.email, p.avatar, Date.now())
    .run();
  return id;
}

async function startSession(c: Context<{ Bindings: Env }>, userId: string, to: string) {
  const token = randomToken();
  await c.env.DB!.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1, ?2, ?3)`)
    .bind(await sha256(token), userId, Date.now() + SESSION_DAYS * 86_400_000)
    .run();
  const secure = new URL(c.req.url).protocol === "https:";
  const headers = new Headers({ location: to });
  headers.append("set-cookie", cookie(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400, secure }));
  headers.append("set-cookie", cookie(STATE_COOKIE, "", { maxAge: 0, secure }));
  return new Response(null, { status: 302, headers });
}

export async function rememberRoomForUser(env: Env, user: User, code: string, title: string, host?: boolean) {
  if (!env.DB) return;
  await ensureAuthTables(env.DB);
  await env.DB.prepare(
    `INSERT INTO user_rooms (user_id, code, title, last_at, host) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(user_id, code) DO UPDATE SET title = excluded.title, last_at = excluded.last_at,
       host = COALESCE(MAX(user_rooms.host, excluded.host), user_rooms.host, excluded.host)`,
  )
    .bind(user.id, code, title.slice(0, 80), Date.now(), host === undefined ? null : host ? 1 : 0)
    .run();
}

// ---------- routes ----------

export const auth = new Hono<{ Bindings: Env }>();

/** Everyone must be signed in to join or create rooms and classes. */
export const signInRequired = (env: Env) => env.REQUIRE_SIGNIN !== "0" && enabledProviders(env).length > 0;

auth.get("/providers", (c) =>
  c.json({
    providers: enabledProviders(c.env),
    requireSignIn: signInRequired(c.env),
    requireSignInToCreate: signInRequired(c.env) || c.env.REQUIRE_SIGNIN_TO_CREATE === "1",
    turnstileSiteKey: turnstileOn(c.env) ? c.env.TURNSTILE_SITE_KEY : null,
  }),
);

/** Admin by account: a Google sign-in whose verified email is listed in ADMIN_EMAILS. */
export function isAdminUser(env: Env, user: User | null): boolean {
  if (!user || user.provider !== "google" || !user.email) return false;
  const list = (env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(user.email.toLowerCase());
}

/** Choose teacher or student, once. A student account can't become a teacher account. */
auth.post("/role", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "Sign in first." }, 401);
  const body = await c.req.json<{ role?: string }>().catch(() => ({}) as { role?: string });
  if (body.role !== "teacher" && body.role !== "student") return c.json({ error: "Pick teacher or student." }, 400);
  const role = await claimRole(c.env, user, body.role);
  if (role !== body.role) return c.json({ error: role === "student" ? "This is a student account, so it can't use teacher tools." : "This is already a teacher account.", role }, 409);
  return c.json({ ok: true, role });
});

/**
 * Finish the first-time welcome: teacher or student (once; a student account stays a student),
 * the name people see, and what a teacher teaches.
 */
auth.post("/onboarding", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  if (!user || !c.env.DB) return c.json({ error: "Sign in first." }, 401);
  const check = checkOnboarding(await c.req.json().catch(() => null), !!user.role);
  if (!check.ok) return c.json({ error: check.error }, 400);
  const b = check.value;
  const role = await claimRole(c.env, user, b.role);
  if (role !== b.role) return c.json({ error: role === "student" ? "This is a student account, so it can't use teacher tools." : "This is already a teacher account.", role }, 409);
  if (b.name) await c.env.DB.prepare(`UPDATE users SET name = ?1, custom_name = 1 WHERE id = ?2`).bind(b.name, user.id).run();
  if (b.teach) await c.env.DB.prepare(`UPDATE users SET teach = ?1 WHERE id = ?2`).bind(JSON.stringify(b.teach), user.id).run();
  await c.env.DB.prepare(`UPDATE users SET onboarded = 1 WHERE id = ?1`).bind(user.id).run();
  return c.json({ user: await currentUser(c.env, c.req.raw) });
});

/** A tour was finished or skipped (`id: "*"` turns tips off, `reset` shows them all again). */
auth.post("/tours", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  if (!user || !c.env.DB) return c.json({ error: "Sign in first." }, 401);
  const b = await c.req.json<{ id?: unknown; reset?: unknown }>().catch(() => ({}) as { id?: unknown; reset?: unknown });
  const list = b.reset === true ? [] : addTour(user.tours ?? [], typeof b.id === "string" ? b.id : "");
  await c.env.DB.prepare(`UPDATE users SET tours = ?1 WHERE id = ?2`).bind(JSON.stringify(list), user.id).run();
  return c.json({ tours: list });
});

auth.get("/me", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  return c.json({ user, isAdmin: isAdminUser(c.env, user) });
});

auth.get("/login/:provider", async (c) => {
  const name = c.req.param("provider");
  if (!enabledProviders(c.env).includes(name) || !c.env.DB) return c.text("This sign-in method isn't set up.", 404);
  const guestUid = (c.req.query("uid") ?? "").slice(0, 64);
  const to = safeReturn(c.req.query("return"));
  const secure = new URL(c.req.url).protocol === "https:";
  if (name === "dev") {
    // Local testing only (DEV_AUTH=1): sign in as any name, no password. `key` keeps test
    // accounts apart; `email` lets tests act as a student on a class list.
    const display = (c.req.query("name") ?? "Dev user").slice(0, 40);
    const key = (c.req.query("key") ?? "").slice(0, 64);
    const email = (c.req.query("email") ?? "").trim().toLowerCase().slice(0, 200);
    const userId = await upsertUser(
      c.env.DB,
      "dev",
      { id: key || display.toLowerCase(), name: display, email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null, avatar: null },
      guestUid,
    );
    // Tests can skip the welcome and the tours.
    if (c.req.query("onboarded") === "1") await c.env.DB.prepare(`UPDATE users SET onboarded = 1 WHERE id = ?1`).bind(userId).run();
    if (c.req.query("tours") === "off") await c.env.DB.prepare(`UPDATE users SET tours = ?1 WHERE id = ?2`).bind(JSON.stringify([ALL_TOURS]), userId).run();
    return startSession(c, userId, to);
  }
  const p = PROVIDERS[name];
  const state = randomToken(16);
  const url = new URL(p.authorize);
  url.searchParams.set("client_id", p.clientId(c.env)!);
  url.searchParams.set("redirect_uri", `${new URL(c.req.url).origin}/api/auth/callback/${name}`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", p.scope);
  url.searchParams.set("state", state);
  const headers = new Headers({ location: url.toString() });
  headers.append("set-cookie", cookie(STATE_COOKIE, JSON.stringify({ state, guestUid, to, provider: name }), { maxAge: 600, secure }));
  return new Response(null, { status: 302, headers });
});

auth.get("/callback/:provider", async (c) => {
  const name = c.req.param("provider");
  const p = PROVIDERS[name];
  if (!p || !c.env.DB) return c.text("Unknown sign-in method.", 404);
  let saved: { state: string; guestUid: string; to: string; provider: string };
  try {
    saved = JSON.parse(parseCookies(c.req.header("cookie") ?? null)[STATE_COOKIE] ?? "");
  } catch {
    return c.text("Sign-in expired. Please try again.", 400);
  }
  if (!saved?.state || saved.state !== c.req.query("state") || saved.provider !== name) return c.text("Sign-in check failed. Please try again.", 400);
  const code = c.req.query("code");
  if (!code) return c.text("Sign-in was cancelled.", 400);
  const res = await fetch(p.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      client_id: p.clientId(c.env)!,
      client_secret: p.clientSecret(c.env)!,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${new URL(c.req.url).origin}/api/auth/callback/${name}`,
    }),
  });
  const tok: any = await res.json().catch(() => ({}));
  if (!tok.access_token) return c.text("Sign-in failed while talking to the provider. Please try again.", 400);
  const profile = await p.profile(tok.access_token);
  const userId = await upsertUser(c.env.DB, name, profile, saved.guestUid);
  return startSession(c, userId, safeReturn(saved.to));
});

auth.post("/logout", async (c) => {
  const token = parseCookies(c.req.header("cookie") ?? null)[SESSION_COOKIE];
  if (token && c.env.DB) await c.env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?1`).bind(await sha256(token)).run();
  const secure = new URL(c.req.url).protocol === "https:";
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "set-cookie": cookie(SESSION_COOKIE, "", { maxAge: 0, secure }) },
  });
});

/** Your rooms for the dashboard: whether you host each one, and who's in it right now. */
// ---------- profile ----------

const COLOR_RE = /^#[0-9a-f]{6}$/i;
const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** Change your display name and/or color (the color your cursor and avatar use in rooms). */
auth.patch("/profile", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  if (!user || !c.env.DB) return c.json({ error: "Sign in first." }, 401);
  const b = await c.req.json<{ name?: string; color?: string }>().catch(() => ({}) as { name?: string; color?: string });
  const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ").slice(0, 32) : undefined;
  if (name !== undefined && !name) return c.json({ error: "Your name can't be empty." }, 400);
  if (b.color !== undefined && !COLOR_RE.test(b.color)) return c.json({ error: "Pick one of the colors." }, 400);
  if (name !== undefined) await c.env.DB.prepare(`UPDATE users SET name = ?1, custom_name = 1 WHERE id = ?2`).bind(name, user.id).run();
  if (b.color !== undefined) await c.env.DB.prepare(`UPDATE users SET color = ?1 WHERE id = ?2`).bind(b.color, user.id).run();
  return c.json({ user: await currentUser(c.env, c.req.raw) });
});

/** Upload a profile picture (PNG, JPEG, WebP or GIF, up to 2 MB). */
auth.post("/avatar", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  if (!user || !c.env.DB) return c.json({ error: "Sign in first." }, 401);
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return c.json({ error: "No picture was sent." }, 400);
  if (!AVATAR_TYPES.includes(file.type)) return c.json({ error: "Use a PNG, JPEG, WebP or GIF picture." }, 415);
  if (file.size > MAX_AVATAR_BYTES) return c.json({ error: "Pictures can be up to 2 MB." }, 413);
  // Loaded here so this module stays importable in unit tests (blobs needs the Workers runtime).
  const { putBlob } = await import("./blobs");
  const id = randomToken(8).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "pic";
  await putBlob(c.env, `avatars/${user.id}/${id}`, new Uint8Array(await file.arrayBuffer()), file.type, "avatar");
  const url = `/api/avatars/${user.id}/${id}`;
  await c.env.DB.prepare(`UPDATE users SET avatar = ?1, custom_avatar = 1 WHERE id = ?2`).bind(url, user.id).run();
  return c.json({ user: await currentUser(c.env, c.req.raw) });
});

/** Remove your picture (rooms show your initial instead). */
auth.delete("/avatar", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  if (!user || !c.env.DB) return c.json({ error: "Sign in first." }, 401);
  await c.env.DB.prepare(`UPDATE users SET avatar = NULL, custom_avatar = 1 WHERE id = ?1`).bind(user.id).run();
  return c.json({ user: await currentUser(c.env, c.req.raw) });
});

auth.get("/rooms", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  if (!user || !c.env.DB) return c.json({ rooms: [] });
  await ensureAuthTables(c.env.DB);
  // Loaded here so this module stays importable in unit tests (partyserver needs the Workers runtime).
  const { getServerByName } = await import("partyserver");
  const { results } = await c.env.DB.prepare(`SELECT code, title, last_at, host FROM user_rooms WHERE user_id = ?1 ORDER BY last_at DESC LIMIT 100`)
    .bind(user.id)
    .all<{ code: string; title: string; last_at: number; host: number | null }>();
  const rooms = await Promise.all(
    results.map(async (r) => {
      const stub = await getServerByName(c.env.Room, r.code);
      const info = await stub.info().catch(() => null);
      if (!info?.exists) return null; // deleted by its host
      let host = r.host;
      if (host === null) {
        host = (await stub.isHost(user.uid).catch(() => false)) ? 1 : 0;
        c.executionCtx.waitUntil(c.env.DB!.prepare(`UPDATE user_rooms SET host = ?1 WHERE user_id = ?2 AND code = ?3`).bind(host, user.id, r.code).run());
      }
      return { code: r.code, title: info.title || r.title, lastAt: r.last_at, isHost: host === 1, online: info.members, locked: info.locked };
    }),
  );
  const gone = results.filter((_, i) => !rooms[i]).map((r) => r.code);
  if (gone.length)
    c.executionCtx.waitUntil(
      c.env.DB.batch(gone.map((code) => c.env.DB!.prepare(`DELETE FROM user_rooms WHERE user_id = ?1 AND code = ?2`).bind(user.id, code))),
    );
  return c.json({ rooms: rooms.filter(Boolean) });
});

/** Take a room off your dashboard (doesn't affect the room or anyone else). */
auth.delete("/rooms/:code", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  if (!user || !c.env.DB) return c.json({ ok: false }, 401);
  await c.env.DB.prepare(`DELETE FROM user_rooms WHERE user_id = ?1 AND code = ?2`).bind(user.id, c.req.param("code").toUpperCase()).run();
  return c.json({ ok: true });
});

auth.post("/rooms", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  if (!user) return c.json({ ok: false }, 401);
  const b = await c.req.json<{ code?: string; title?: string }>().catch(() => ({}) as { code?: string; title?: string });
  if (!/^[A-Z0-9]{6}$/.test(b.code ?? "")) return c.json({ ok: false }, 400);
  await rememberRoomForUser(c.env, user, b.code!, String(b.title ?? ""));
  return c.json({ ok: true });
});
