import type { Env } from "../env";
import { ensureTables } from "../db";

/**
 * The "Use my PC for AI" switch on /admin. Off = Cairn never calls Ollama (so the GPU is free
 * for games) and the router goes straight to the hosted free models. Stored in D1 so every
 * room sees it; each isolate re-reads it at most every few seconds.
 */
const CACHE_MS = 5_000;
let cached: { on: boolean; at: number } | null = null;

export const hasPc = (env: Env) => Boolean(env.OLLAMA_BASE_URL || env.OLLAMA_VPC);

export async function pcAiEnabled(env: Env): Promise<boolean> {
  if (!hasPc(env) || !env.DB) return hasPc(env);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.on;
  try {
    await ensureTables(env.DB);
    const row = await env.DB.prepare(`SELECT value FROM app_settings WHERE key = 'pc_ai'`).first<{ value: string }>();
    cached = { on: row?.value !== "off", at: Date.now() };
  } catch {
    cached = { on: true, at: Date.now() };
  }
  return cached.on;
}

export async function setPcAi(env: Env, on: boolean) {
  if (!env.DB) return;
  await ensureTables(env.DB);
  await env.DB.prepare(`INSERT INTO app_settings (key, value) VALUES ('pc_ai', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1`)
    .bind(on ? "on" : "off")
    .run();
  cached = { on, at: Date.now() };
}

/** The env the AI router should use right now: without the PC when the switch is off. */
export async function aiEnv(env: Env): Promise<Env> {
  return (await pcAiEnabled(env)) ? env : { ...env, OLLAMA_BASE_URL: undefined, OLLAMA_VPC: undefined };
}

/** Talk to Ollama's own API (not the /v1 chat one), over the private tunnel when deployed. */
function ollamaFetch(env: Env, path: string, init: RequestInit = {}, timeoutMs = 4_000) {
  const base = env.OLLAMA_BASE_URL ? env.OLLAMA_BASE_URL.replace(/\/+$/, "") : "http://127.0.0.1:11434";
  const signal = AbortSignal.timeout(timeoutMs);
  const req = { ...init, signal };
  return env.OLLAMA_BASE_URL || !env.OLLAMA_VPC ? fetch(base + path, req) : env.OLLAMA_VPC.fetch(base + path, req);
}

/** Whether the PC answers, and which model is loaded in GPU memory (if any). */
export async function pcStatus(env: Env): Promise<{ online: boolean; loaded: string[] }> {
  if (!hasPc(env)) return { online: false, loaded: [] };
  try {
    const r = await ollamaFetch(env, "/api/ps");
    if (!r.ok) return { online: false, loaded: [] };
    const j = (await r.json()) as { models?: { name: string }[] };
    return { online: true, loaded: (j.models ?? []).map((m) => m.name) };
  } catch {
    return { online: false, loaded: [] };
  }
}

/** Ask Ollama to drop every loaded model from GPU memory right away (best effort). */
export async function unloadPcModels(env: Env): Promise<number> {
  const { online, loaded } = await pcStatus(env);
  if (!online) return 0;
  await Promise.all(
    loaded.map((model) =>
      ollamaFetch(env, "/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, keep_alive: 0 }),
      }).catch(() => null),
    ),
  );
  return loaded.length;
}
