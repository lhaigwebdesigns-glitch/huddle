import { isHuman, NOT_HUMAN } from "./turnstile";
import { Hono } from "hono";
import { getServerByName, routePartykitRequest } from "partyserver";
import type { Env } from "./env";
import { isValidCode, makeCode, normalizeCode } from "../shared/code";
import { availableProviders } from "./ai/providers";
import { SKILLS } from "./ai/skills";
import { checkKeys } from "./keyhealth";
import { bump, readStats } from "./stats";
import { aiEnv, hasPc, pcAiEnabled, pcStatus, setPcAi, unloadPcModels } from "./ai/pc";
import { clientIp, ensureTables, hit, usageByDay } from "./db";
import { auth, currentUser, enabledProviders, isAdminUser, rememberRoomForUser, signInRequired } from "./auth";
import { MAX_UPLOAD_BYTES, safeFileName, UPLOAD_TYPES } from "../shared/knowledge";
import { getBlob, putBlob } from "./blobs";
import { classes } from "./classes";
import { clearModelAlerts, readModelAlerts } from "./ai/router-health";

export { Room } from "./room";
export { Doc } from "./doc";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", async (c) =>
  c.json({
    ok: true,
    providers: availableProviders(await aiEnv(c.env)).map((p) => ({ id: p.id, label: p.label, model: p.model })),
    search: [c.env.TAVILY_API_KEY && "tavily", c.env.JINA_API_KEY && "jina", "duckduckgo (best effort)"].filter(Boolean).join(" → "),
    skills: SKILLS.length,
  }),
);

app.route("/api/auth", auth);
app.route("/api/classes", classes);

app.post("/api/rooms", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  if ((signInRequired(c.env) || (c.env.REQUIRE_SIGNIN_TO_CREATE === "1" && enabledProviders(c.env).length)) && !user)
    return c.json({ error: "Sign in to start a room.", signIn: true }, 401);
  if (!(await hit(c.env.DB, `rooms:${clientIp(c.req.raw)}`, Number(c.env.ROOMS_PER_IP_HOUR || 20), 3600)))
    return c.json({ error: "You've created a lot of rooms in the last hour. Please wait a bit and try again." }, 429);
  const body = await c.req.json<{ uid?: string; title?: string; project?: Record<string, unknown>; template?: string; human?: string }>().catch(() => ({}) as any);
  if (!(await isHuman(c.env, body.human, clientIp(c.req.raw)))) return c.json({ error: NOT_HUMAN }, 403);
  // Signed-in people always host under their account's identity.
  const uid = user?.uid ?? String(body.uid ?? "").slice(0, 64);
  if (!uid) return c.json({ error: "uid required" }, 400);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    const stub = await getServerByName(c.env.Room, code);
    const project = body.project && typeof body.project === "object" ? body.project : undefined;
    const res = await stub.init(uid, String(body.title ?? ""), project, typeof body.template === "string" ? body.template : undefined);
    if (res.ok) {
      if (user) c.executionCtx.waitUntil(rememberRoomForUser(c.env, user, code, String(body.title ?? ""), true));
      c.executionCtx.waitUntil(bump(c.env, "rooms_created"));
      return c.json({ code });
    }
  }
  return c.json({ error: "Could not allocate a room code, try again." }, 500);
});

app.get("/api/rooms/:code", async (c) => {
  const code = normalizeCode(c.req.param("code"));
  if (!isValidCode(code)) return c.json({ exists: false }, 404);
  const stub = await getServerByName(c.env.Room, code);
  const info = await stub.info();
  return c.json(info, info.exists ? 200 : 404);
});

// ---- Host tools for the dashboard: Manage party and Delete room (signed-in host only) ----

async function hostRoom(c: { env: Env; req: { raw: Request; param: (k: string) => string } }) {
  const user = await currentUser(c.env, c.req.raw);
  const code = normalizeCode(c.req.param("code"));
  if (!user || !isValidCode(code)) return null;
  const stub = await getServerByName(c.env.Room, code);
  return (await stub.isHost(user.uid)) ? { user, code, stub } : null;
}

app.get("/api/rooms/:code/manage", async (c) => {
  const h = await hostRoom(c);
  if (!h) return c.json({ error: "Only the room's host can manage it." }, 403);
  return c.json(await h.stub.manageState(h.user.uid));
});

app.post("/api/rooms/:code/manage", async (c) => {
  const h = await hostRoom(c);
  if (!h) return c.json({ error: "Only the room's host can manage it." }, 403);
  const b = await c.req.json<{ action?: string; uid?: string }>().catch(() => ({}) as { action?: string; uid?: string });
  if (b.action !== "kick" && b.action !== "ban" && b.action !== "unban") return c.json({ error: "Unknown action" }, 400);
  await h.stub.moderate(h.user.uid, b.action, String(b.uid ?? "").slice(0, 64));
  return c.json(await h.stub.manageState(h.user.uid));
});

app.delete("/api/rooms/:code", async (c) => {
  const h = await hostRoom(c);
  if (!h) return c.json({ error: "Only the room's host can delete it." }, 403);
  if (!(await h.stub.destroy(h.user.uid))) return c.json({ error: "Couldn't delete the room." }, 500);
  // Gone from everyone's dashboard too.
  if (c.env.DB) c.executionCtx.waitUntil(c.env.DB.prepare(`DELETE FROM user_rooms WHERE code = ?1`).bind(h.code).run());
  return c.json({ ok: true });
});

// ---- File version history (the party code is the room's secret, as for WebSockets) ----

app.get("/api/rooms/:code/files/:id/versions", async (c) => {
  const code = normalizeCode(c.req.param("code"));
  if (!isValidCode(code)) return c.json({ error: "bad code" }, 404);
  const versions = await (await getServerByName(c.env.Room, code)).fileVersions(c.req.param("id"));
  return versions ? c.json({ versions }) : c.json({ error: "not found" }, 404);
});

app.post("/api/rooms/:code/files/:id/versions", async (c) => {
  const code = normalizeCode(c.req.param("code"));
  if (!isValidCode(code)) return c.json({ error: "bad code" }, 404);
  const body = await c.req.json<{ restore?: number }>().catch(() => ({}) as { restore?: number });
  const room = await getServerByName(c.env.Room, code);
  const res = body.restore ? await room.restoreFileVersion(c.req.param("id"), Number(body.restore)) : await room.saveFileVersion(c.req.param("id"));
  return c.json(res, res.ok ? 200 : 404);
});

// ---- Uploads (R2). Text from PDFs/CSV/text is extracted in the browser and indexed for the AI. ----

app.post("/api/rooms/:code/upload", async (c) => {
  const code = normalizeCode(c.req.param("code"));
  if (!isValidCode(code)) return c.json({ error: "Room not found" }, 404);
  if (!(await hit(c.env.DB, `upload:${clientIp(c.req.raw)}`, 60, 3600))) return c.json({ error: "Too many uploads this hour. Try again later." }, 429);
  const room = await getServerByName(c.env.Room, code);
  if (!(await room.exists())) return c.json({ error: "Room not found" }, 404);
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return c.json({ error: "No file" }, 400);
  const type = file.type || "application/octet-stream";
  if (!UPLOAD_TYPES[type]) return c.json({ error: "That file type isn't supported. Try an image, PDF, CSV or text file." }, 415);
  if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: "Files can be up to 10 MB." }, 413);
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const name = safeFileName(file.name);
  await putBlob(c.env, `rooms/${code}/${id}`, new Uint8Array(await file.arrayBuffer()), type, name);
  c.executionCtx.waitUntil(bump(c.env, "uploads"));
  const text = String(form?.get("text") ?? "");
  let indexed = false;
  if (UPLOAD_TYPES[type].text && text.trim()) indexed = (await room.indexText(id, name, text)) > 0;
  return c.json({ id, name, type, size: file.size, url: `/api/rooms/${code}/blobs/${id}`, indexed });
});

app.get("/api/rooms/:code/blobs/:id", async (c) => {
  const code = normalizeCode(c.req.param("code"));
  const id = c.req.param("id");
  if (!isValidCode(code) || !/^[a-z0-9]{16}$/.test(id)) return c.text("Not found", 404);
  const obj = await getBlob(c.env, `rooms/${code}/${id}`);
  if (!obj) return c.text("Not found", 404);
  const { type, name } = obj;
  return new Response(obj.bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      "content-type": type,
      // Images and PDFs open inline; everything else downloads. Never let a file run scripts here.
      "content-disposition": `${/^image\/|^application\/pdf$/.test(type) ? "inline" : "attachment"}; filename="${name.replace(/"/g, "")}"`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "cache-control": "private, max-age=86400",
    },
  });
});

// ---- Profile pictures uploaded on the profile page (public, like any avatar URL) ----
app.get("/api/avatars/:user/:id", async (c) => {
  const { user, id } = c.req.param();
  if (!/^[\w-]{6,32}$/.test(user) || !/^[a-z0-9]{1,16}$/.test(id)) return c.text("Not found", 404);
  const obj = await getBlob(c.env, `avatars/${user}/${id}`);
  if (!obj) return c.text("Not found", 404);
  return new Response(obj.bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      "content-type": obj.type,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
});

// ---- Custom assistants, shareable by a 6-character code ----

app.post("/api/assistants", async (c) => {
  if (!c.env.DB) return c.json({ error: "Not available" }, 503);
  if (!(await hit(c.env.DB, `assistant:${clientIp(c.req.raw)}`, 30, 3600))) return c.json({ error: "Too many saves this hour." }, 429);
  const b = await c.req.json<{ name?: string; instructions?: string }>().catch(() => ({}) as { name?: string; instructions?: string });
  const data = { name: String(b.name ?? "").trim().slice(0, 40), instructions: String(b.instructions ?? "").trim().slice(0, 4000) };
  if (!data.name && !data.instructions) return c.json({ error: "Give the assistant a name or instructions first." }, 400);
  await ensureTables(c.env.DB);
  const code = makeCode();
  await c.env.DB.prepare(`INSERT INTO assistants (code, created_at, data) VALUES (?1, ?2, ?3)`).bind(code, Date.now(), JSON.stringify(data)).run();
  return c.json({ code });
});

app.get("/api/assistants/:code", async (c) => {
  const code = normalizeCode(c.req.param("code"));
  if (!isValidCode(code) || !c.env.DB) return c.json({ error: "not found" }, 404);
  await ensureTables(c.env.DB);
  const row = await c.env.DB.prepare(`SELECT data FROM assistants WHERE code = ?1`).bind(code).first<{ data: string }>();
  return row ? c.json(JSON.parse(row.data)) : c.json({ error: "No assistant with that code." }, 404);
});

// ---- Read-only share links (a snapshot of the chat, made by the host) ----

app.post("/api/rooms/:code/share", async (c) => {
  const code = normalizeCode(c.req.param("code"));
  if (!isValidCode(code) || !c.env.DB) return c.json({ error: "Sharing isn't available" }, 404);
  if (!(await hit(c.env.DB, `share:${clientIp(c.req.raw)}`, 20, 3600))) return c.json({ error: "Too many share links this hour." }, 429);
  const body = await c.req.json<{ uid?: string }>().catch(() => ({}) as { uid?: string });
  const user = await currentUser(c.env, c.req.raw);
  const snap = await (await getServerByName(c.env.Room, code)).shareSnapshot(user?.uid ?? String(body.uid ?? ""));
  if (!snap) return c.json({ error: "Only the room's host can create a share link." }, 403);
  await ensureTables(c.env.DB);
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  const json = JSON.stringify(snap.messages).slice(0, 1_500_000);
  await c.env.DB.prepare(`INSERT INTO shares (id, created_at, title, messages) VALUES (?1, ?2, ?3, ?4)`).bind(id, Date.now(), snap.title, json).run();
  return c.json({ id, url: `/s/${id}` });
});

app.get("/api/share/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[a-f0-9]{20}$/.test(id) || !c.env.DB) return c.json({ error: "not found" }, 404);
  await ensureTables(c.env.DB);
  const row = await c.env.DB.prepare(`SELECT title, created_at, messages FROM shares WHERE id = ?1`).bind(id).first<{ title: string; created_at: number; messages: string }>();
  if (!row) return c.json({ error: "This share link doesn't exist (or was removed)." }, 404);
  let messages: unknown = [];
  try {
    messages = JSON.parse(row.messages);
  } catch {
    /* truncated snapshot */
  }
  return c.json({ title: row.title, createdAt: row.created_at, messages });
});

// ---- Public forms: anyone with the link can fill one in, without joining the room ----

app.get("/api/forms/:code/:id", async (c) => {
  const code = normalizeCode(c.req.param("code"));
  if (!isValidCode(code)) return c.json({ error: "not found" }, 404);
  const form = await (await getServerByName(c.env.Room, code)).publicForm(c.req.param("id"));
  return form ? c.json(form) : c.json({ error: "This form doesn't exist anymore." }, 404);
});

app.post("/api/forms/:code/:id", async (c) => {
  const code = normalizeCode(c.req.param("code"));
  if (!isValidCode(code)) return c.json({ ok: false, error: "not found" }, 404);
  const id = c.req.param("id").slice(0, 40);
  if (!(await hit(c.env.DB, `form:${code}:${id}:${clientIp(c.req.raw)}`, 20, 3600)))
    return c.json({ ok: false, error: "Too many submissions from your network. Try again later." }, 429);
  const body = await c.req.json<{ answers?: unknown }>().catch(() => ({}) as { answers?: unknown });
  const res = await (await getServerByName(c.env.Room, code)).submitForm(id, body.answers);
  return c.json(res, res.ok ? 200 : 400);
});

// ---- Teacher pilot sign-ups (from the landing page) ----

app.post("/api/pilot", async (c) => {
  if (!c.env.DB) return c.json({ ok: false, error: "No database bound" }, 500);
  if (!(await hit(c.env.DB, `pilot:${clientIp(c.req.raw)}`, 10, 3600)))
    return c.json({ ok: false, error: "Too many sign-ups from this network in the last hour. Please try again later." }, 429);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  if (!(await isHuman(c.env, b.human, clientIp(c.req.raw)))) return c.json({ ok: false, error: NOT_HUMAN }, 403);
  const field = (k: string, max: number) => String(b[k] ?? "").trim().slice(0, max);
  const email = field("email", 200);
  const problem = field("problem", 2000);
  if (!field("name", 80) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ ok: false, error: "Add your name and a working email so we can reply." }, 400);
  if (problem.length < 10) return c.json({ ok: false, error: "Tell us a little about the last group project problem you dealt with." }, 400);
  await ensureTables(c.env.DB);
  await c.env.DB.prepare(
    `INSERT INTO pilot_signups (created_at, name, email, school, grade, subject, class_size, classroom, problem) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(Date.now(), field("name", 80), email, field("school", 120), field("grade", 40), field("subject", 80), field("classSize", 20), field("classroom", 20), problem)
    .run();
  return c.json({ ok: true });
});

app.get("/api/admin/pilot", async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: "unauthorized" }, 401);
  if (!c.env.DB) return c.json({ signups: [] });
  await ensureTables(c.env.DB);
  const { results } = await c.env.DB.prepare(`SELECT * FROM pilot_signups ORDER BY created_at DESC LIMIT 200`).all();
  return c.json({ signups: results });
});

// ---- Feedback (stored in the free D1 database) ----

app.post("/api/feedback", async (c) => {
  if (!c.env.DB) return c.json({ ok: false, error: "No database bound" }, 500);
  if (!(await hit(c.env.DB, `feedback:${clientIp(c.req.raw)}`, 30, 3600)))
    return c.json({ ok: false, error: "Too much feedback from this network in the last hour — thank you though!" }, 429);
  const b = await c.req.json<any>().catch(() => ({}));
  await ensureTables(c.env.DB);
  await c.env.DB.prepare(
    `INSERT INTO feedback (created_at, room, uid, name, message_id, rating, comment, excerpt, page)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      Date.now(),
      String(b.room ?? "").slice(0, 10),
      String(b.uid ?? "").slice(0, 64),
      String(b.name ?? "").slice(0, 40),
      String(b.messageId ?? "").slice(0, 64),
      b.rating === 1 ? 1 : b.rating === -1 ? -1 : 0,
      String(b.comment ?? "").slice(0, 4000),
      String(b.excerpt ?? "").slice(0, 500),
      String(b.page ?? "").slice(0, 200),
    )
    .run();
  return c.json({ ok: true });
});

/**
 * Admin access: the ADMIN_TOKEN password (x-admin-token header), or being signed in with a
 * Google account listed in ADMIN_EMAILS. The session cookie is SameSite=Lax, so other sites
 * can't make admin POSTs on your behalf.
 */
async function isAdmin(c: { env: Env; req: { raw: Request; header: (n: string) => string | undefined } }) {
  if (c.env.ADMIN_TOKEN && (c.req.header("x-admin-token") ?? "") === c.env.ADMIN_TOKEN) return true;
  return isAdminUser(c.env, await currentUser(c.env, c.req.raw));
}

app.get("/api/admin/feedback", async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: "unauthorized" }, 401);
  if (!c.env.DB) return c.json({ items: [] });
  await ensureTables(c.env.DB);
  const { results } = await c.env.DB.prepare(`SELECT * FROM feedback ORDER BY id DESC LIMIT 500`).all();
  return c.json({ items: results });
});

app.get("/api/admin/usage", async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: "unauthorized" }, 401);
  if (!c.env.DB) return c.json({ rows: [], limit: 0 });
  return c.json({ rows: await usageByDay(c.env.DB), limit: Number(c.env.GLOBAL_DAILY_AI_LIMIT || 5000) });
});

// Models a provider retired: the router already skips them; this lists them for /admin.
app.get("/api/admin/model-alerts", async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: "unauthorized" }, 401);
  return c.json({ alerts: await readModelAlerts(c.env) });
});
app.delete("/api/admin/model-alerts", async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: "unauthorized" }, 401);
  await clearModelAlerts(c.env);
  return c.json({ ok: true });
});

// "Use my PC for AI" switch: off frees the GPU (for games) and skips Ollama everywhere.

app.get("/api/admin/pc", async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: "unauthorized" }, 401);
  if (!hasPc(c.env)) return c.json({ configured: false, enabled: false, online: false, loaded: [] });
  return c.json({ configured: true, enabled: await pcAiEnabled(c.env), ...(await pcStatus(c.env)) });
});

app.post("/api/admin/pc", async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: "unauthorized" }, 401);
  if (!hasPc(c.env)) return c.json({ error: "No PC is connected to this site." }, 400);
  const { enabled } = (await c.req.json().catch(() => ({}))) as { enabled?: boolean };
  await setPcAi(c.env, enabled !== false);
  // Turning it off also empties the GPU now instead of after Ollama's 5-minute idle timer.
  const unloaded = enabled === false ? await unloadPcModels(c.env) : 0;
  return c.json({ configured: true, enabled: enabled !== false, unloaded, ...(await pcStatus(c.env)) });
});

// Usage analytics for the admin dashboard (?days=7|30|90).
app.get("/api/admin/stats", async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: "unauthorized" }, 401);
  if (!c.env.DB) return c.json({ error: "No database" }, 503);
  const days = [7, 30, 90].includes(Number(c.req.query("days"))) ? Number(c.req.query("days")) : 30;
  return c.json(await readStats(c.env, days));
});

// Test every configured API key (results only; key values never leave the server).
app.post("/api/admin/keys", async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: "unauthorized" }, 401);
  return c.json({ checks: await checkKeys(c.env, new URL(c.req.url).origin) });
});

app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/parties/")) {
      // Live connections (rooms and their files) are for signed-in people only, and a room
      // always sees the account's identity, never one the browser claims.
      if (signInRequired(env)) {
        const user = await currentUser(env, request);
        if (!user) return new Response("Sign in to join.", { status: 401 });
        if (url.pathname.startsWith("/parties/room/")) {
          url.searchParams.set("uid", user.uid);
          request = new Request(url.toString(), request);
        }
      }
      return (await routePartykitRequest(request, env as any)) ?? new Response("Not found", { status: 404 });
    }
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
