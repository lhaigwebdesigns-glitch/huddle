import { Hono } from "hono";
import { getServerByName, routePartykitRequest } from "partyserver";
import type { Env } from "./env";
import { isValidCode, makeCode, normalizeCode } from "../shared/code";
import { availableProviders } from "./ai/providers";
import { SKILLS } from "./ai/skills";
import { clientIp, ensureTables, hit, usageByDay } from "./db";

export { Room } from "./room";
export { Doc } from "./doc";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    providers: availableProviders(c.env).map((p) => ({ id: p.id, label: p.label, model: p.model })),
    search: [c.env.TAVILY_API_KEY && "tavily", c.env.JINA_API_KEY && "jina", "duckduckgo (best effort)"].filter(Boolean).join(" → "),
    skills: SKILLS.length,
  }),
);

app.post("/api/rooms", async (c) => {
  if (!(await hit(c.env.DB, `rooms:${clientIp(c.req.raw)}`, Number(c.env.ROOMS_PER_IP_HOUR || 20), 3600)))
    return c.json({ error: "You've created a lot of rooms in the last hour. Please wait a bit and try again." }, 429);
  const body = await c.req.json<{ uid?: string; title?: string }>().catch(() => ({}) as any);
  const uid = String(body.uid ?? "").slice(0, 64);
  if (!uid) return c.json({ error: "uid required" }, 400);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    const stub = await getServerByName(c.env.Room, code);
    const res = await stub.init(uid, String(body.title ?? ""));
    if (res.ok) return c.json({ code });
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

app.get("/api/admin/feedback", async (c) => {
  const token = c.req.header("x-admin-token") ?? "";
  if (!c.env.ADMIN_TOKEN || token !== c.env.ADMIN_TOKEN) return c.json({ error: "unauthorized" }, 401);
  if (!c.env.DB) return c.json({ items: [] });
  await ensureTables(c.env.DB);
  const { results } = await c.env.DB.prepare(`SELECT * FROM feedback ORDER BY id DESC LIMIT 500`).all();
  return c.json({ items: results });
});

app.get("/api/admin/usage", async (c) => {
  const token = c.req.header("x-admin-token") ?? "";
  if (!c.env.ADMIN_TOKEN || token !== c.env.ADMIN_TOKEN) return c.json({ error: "unauthorized" }, 401);
  if (!c.env.DB) return c.json({ rows: [], limit: 0 });
  return c.json({ rows: await usageByDay(c.env.DB), limit: Number(c.env.GLOBAL_DAILY_AI_LIMIT || 5000) });
});

app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/parties/")) {
      return (await routePartykitRequest(request, env as any)) ?? new Response("Not found", { status: 404 });
    }
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
