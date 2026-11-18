import { Hono, type Context } from "hono";
import type { Env } from "./env";

/**
 * Optional sign-in. Guests can always join rooms; an account adds "My rooms" across devices
 * and (with REQUIRE_SIGNIN_TO_CREATE=1) gates room creation to protect free quotas.
 *
 * Minimal OAuth 2.0 (GitHub, Google) with no extra dependencies. Sessions are random tokens
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

const PROVIDERS: Record<string, Provider> = {
  github: {
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
    clientId: (e) => e.GITHUB_CLIENT_ID,
    clientSecret: (e) => e.GITHUB_CLIENT_SECRET,
    async profile(token) {
      const h = { authorization: `Bearer ${token}`, "user-agent": "Huddle", accept: "application/vnd.github+json" };
      const u: any = await (await fetch("https://api.github.com/user", { headers: h })).json();
      let email: string | null = u.email ?? null;
      if (!email) {
        const emails = (await (await fetch("https://api.github.com/user/emails", { headers: h })).json().catch(() => [])) as any[];
        email = emails.find?.((x) => x.primary && x.verified)?.email ?? null;
      }
      return { id: String(u.id), name: u.name || u.login, email, avatar: u.avatar_url ?? null };
    },
  },
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    clientId: (e) => e.GOOGLE_CLIENT_ID,
    clientSecret: (e) => e.GOOGLE_CLIENT_SECRET,
    async profile(token) {
      const u: any = await (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${token}` } })).json();
      return { id: String(u.sub), name: u.name || u.email, email: u.email ?? null, avatar: u.picture ?? null };
    },
  },
};

export function enabledProviders(env: Env): string[] {
  const out = Object.keys(PROVIDERS).filter((p) => PROVIDERS[p].clientId(env) && PROVIDERS[p].clientSecret(env));
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

/** Only allow same-site relative return paths (no open redirects). */
export const safeReturn = (p: unknown) => (typeof p === "string" && /^\/(?!\/)[\w\-/.?=&%]*$/.test(p) ? p : "/");

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
    `SELECT u.id, u.uid, u.name, u.email, u.avatar, u.provider FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > ?2`,
  )
    .bind(await sha256(token), Date.now())
    .first<User>();
  return row ?? null;
}

async function upsertUser(db: D1Database, provider: string, p: { id: string; name: string; email: string | null; avatar: string | null }, guestUid: string) {
  await ensureAuthTables(db);
  const existing = await db.prepare(`SELECT id, uid FROM users WHERE provider = ?1 AND provider_id = ?2`).bind(provider, p.id).first<{ id: string; uid: string }>();
  if (existing) {
    await db.prepare(`UPDATE users SET name = ?1, email = ?2, avatar = ?3 WHERE id = ?4`).bind(p.name.slice(0, 60), p.email, p.avatar, existing.id).run();
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

export async function rememberRoomForUser(env: Env, user: User, code: string, title: string) {
  if (!env.DB) return;
  await ensureAuthTables(env.DB);
  await env.DB.prepare(
    `INSERT INTO user_rooms (user_id, code, title, last_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(user_id, code) DO UPDATE SET title = excluded.title, last_at = excluded.last_at`,
  )
    .bind(user.id, code, title.slice(0, 80), Date.now())
    .run();
}

// ---------- routes ----------

export const auth = new Hono<{ Bindings: Env }>();

auth.get("/providers", (c) => c.json({ providers: enabledProviders(c.env), requireSignInToCreate: c.env.REQUIRE_SIGNIN_TO_CREATE === "1" }));

auth.get("/me", async (c) => c.json({ user: await currentUser(c.env, c.req.raw) }));

auth.get("/login/:provider", async (c) => {
  const name = c.req.param("provider");
  if (!enabledProviders(c.env).includes(name) || !c.env.DB) return c.text("This sign-in method isn't set up.", 404);
  const guestUid = (c.req.query("uid") ?? "").slice(0, 64);
  const to = safeReturn(c.req.query("return"));
  const secure = new URL(c.req.url).protocol === "https:";
  if (name === "dev") {
    // Local testing only (DEV_AUTH=1): sign in as any name, no password.
    const display = (c.req.query("name") ?? "Dev user").slice(0, 40);
    const userId = await upsertUser(c.env.DB, "dev", { id: display.toLowerCase(), name: display, email: null, avatar: null }, guestUid);
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

auth.get("/rooms", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  if (!user || !c.env.DB) return c.json({ rooms: [] });
  const { results } = await c.env.DB.prepare(`SELECT code, title, last_at FROM user_rooms WHERE user_id = ?1 ORDER BY last_at DESC LIMIT 50`).bind(user.id).all();
  return c.json({ rooms: results });
});

auth.post("/rooms", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  if (!user) return c.json({ ok: false }, 401);
  const b = await c.req.json<{ code?: string; title?: string }>().catch(() => ({}) as { code?: string; title?: string });
  if (!/^[A-Z0-9]{6}$/.test(b.code ?? "")) return c.json({ ok: false }, 400);
  await rememberRoomForUser(c.env, user, b.code!, String(b.title ?? ""));
  return c.json({ ok: true });
});
