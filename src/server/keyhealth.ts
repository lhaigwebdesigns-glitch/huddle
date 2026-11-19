import type { Env } from "./env";
import { getProviders } from "./ai/models";
import { pcAiEnabled, pcStatus } from "./ai/pc";

/**
 * /admin "Check API keys": tests every configured key with the cheapest call that proves it
 * works (a model list, a 1-token reply, or an OAuth exchange with a fake code). Key values never
 * leave the server; only ok / problem and a short reason are returned.
 */
export interface KeyCheck {
  name: string;
  what: string;
  status: "ok" | "problem" | "warning" | "not set";
  detail: string;
}

const TIMEOUT = 15_000;
const get = (url: string, key: string) => fetch(url, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(TIMEOUT) });

async function errText(r: Response) {
  const t = await r.text().catch(() => "");
  try {
    const j = JSON.parse(t);
    return String(j.error?.message ?? j.error_description ?? j.error ?? j.detail ?? j.message ?? t).slice(0, 160);
  } catch {
    return t.slice(0, 160) || r.statusText;
  }
}

/** A one-token chat reply: proves the key, the model name and tool-free access all work. */
async function tinyChat(baseUrl: string, key: string, model: string, extra: Record<string, unknown> = {}): Promise<[boolean, string]> {
  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: "Say ok" }], max_tokens: 16, ...extra }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (r.ok) return [true, `${model} replied`];
  return [false, `${model}: ${r.status} ${await errText(r)}`];
}

async function oauthCheck(tokenUrl: string, id: string, secret: string, origin: string, provider: string): Promise<[boolean, string]> {
  const body = new URLSearchParams({
    client_id: id,
    client_secret: secret,
    code: "huddle-key-check",
    grant_type: "authorization_code",
    redirect_uri: `${origin}/api/auth/callback/${provider}`,
  });
  const r = await fetch(tokenUrl, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const j = (await r.json().catch(() => ({}))) as { error?: string };
  // A fake code with a correct ID + secret gets "bad code"; wrong credentials get "bad client".
  if (j.error === "bad_verification_code" || j.error === "invalid_grant") return [true, "ID and secret accepted"];
  if (j.error === "incorrect_client_credentials" || j.error === "invalid_client" || j.error === "unauthorized_client")
    return [false, "ID or secret is wrong"];
  if (j.error === "Not Found") return [false, "client ID not found"]; // GitHub's answer to an unknown ID
  return [false, `unexpected answer: ${j.error ?? r.status}`];
}

export async function checkKeys(env: Env, origin: string): Promise<KeyCheck[]> {
  const models = Object.fromEntries(getProviders(env).map((p) => [p.id, p.model]));
  const checks: [string, string, string | undefined, () => Promise<[boolean, string] | [boolean, string, "warning"]>][] = [
    [
      "GROQ_API_KEY",
      "Main AI (Groq)",
      env.GROQ_API_KEY,
      async () => {
        const r = await get("https://api.groq.com/openai/v1/models", env.GROQ_API_KEY!);
        if (!r.ok) return [false, `${r.status} ${await errText(r)}`];
        const have = new Set(((await r.json()) as { data: { id: string }[] }).data.map((m) => m.id));
        const want = ["groq", "groq-fallback", "groq-third"].map((id) => models[id]).filter(Boolean);
        const missing = want.filter((m) => !have.has(m));
        return missing.length ? [false, `key works, but these models are gone: ${missing.join(", ")}`] : [true, `key works · ${want.join(", ")} available`];
      },
    ],
    ["NVIDIA_API_KEY", "Backup AI (NVIDIA)", env.NVIDIA_API_KEY, () => tinyChat("https://integrate.api.nvidia.com/v1", env.NVIDIA_API_KEY!, models.nvidia)],
    [
      "OPENROUTER_API_KEY",
      "Backup AI (OpenRouter)",
      env.OPENROUTER_API_KEY,
      async () => {
        const k = await get("https://openrouter.ai/api/v1/key", env.OPENROUTER_API_KEY!);
        if (!k.ok) return [false, `${k.status} ${await errText(k)}`];
        const info = ((await k.json()) as { data?: { limit?: number | null; is_free_tier?: boolean; expires_at?: string | null } }).data ?? {};
        const [ok, detail] = await tinyChat("https://openrouter.ai/api/v1", env.OPENROUTER_API_KEY!, models.openrouter);
        const exp = info.expires_at ? ` · expires ${info.expires_at.slice(0, 10)}` : "";
        return ok && info.expires_at ? [true, `${detail}${exp}`, "warning"] : [ok, `${detail}${exp}`];
      },
    ],
    ["CEREBRAS_API_KEY", "Backup AI (Cerebras)", env.CEREBRAS_API_KEY, () => tinyChat("https://api.cerebras.ai/v1", env.CEREBRAS_API_KEY!, models.cerebras)],
    [
      "TAVILY_API_KEY",
      "Web search (Tavily)",
      env.TAVILY_API_KEY,
      async () => {
        const r = await get("https://api.tavily.com/usage", env.TAVILY_API_KEY!);
        if (!r.ok) return [false, `${r.status} ${await errText(r)}`];
        const u = ((await r.json()) as { key?: { usage?: number; limit?: number | null }; account?: { plan_usage?: number; plan_limit?: number } });
        const used = u.account?.plan_usage ?? u.key?.usage;
        const limit = u.account?.plan_limit ?? u.key?.limit;
        if (used != null && limit) {
          const detail = `key works · ${used} of ${limit} searches used this month`;
          return used >= limit ? [false, detail] : used / limit > 0.8 ? [true, detail, "warning"] : [true, detail];
        }
        return [true, "key works"];
      },
    ],
    [
      "GITHUB_CLIENT_ID / SECRET",
      "Sign in with GitHub",
      env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET,
      () => oauthCheck("https://github.com/login/oauth/access_token", env.GITHUB_CLIENT_ID!, env.GITHUB_CLIENT_SECRET!, origin, "github"),
    ],
    [
      "GOOGLE_CLIENT_ID / SECRET",
      "Sign in with Google",
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET,
      () => oauthCheck("https://oauth2.googleapis.com/token", env.GOOGLE_CLIENT_ID!, env.GOOGLE_CLIENT_SECRET!, origin, "google"),
    ],
  ];

  const results = await Promise.all(
    checks.map(async ([name, what, value, run]): Promise<KeyCheck> => {
      if (!value) return { name, what, status: "not set", detail: "not added (optional)" };
      try {
        const [ok, detail, warn] = await run();
        return { name, what, status: !ok ? "problem" : warn ? "warning" : "ok", detail };
      } catch (err) {
        return { name, what, status: "problem", detail: `no answer: ${String(err).slice(0, 120)}` };
      }
    }),
  );

  // Not keys, but part of the same AI chain.
  if (env.AI) {
    try {
      await env.AI.run("@cf/meta/llama-3.2-1b-instruct" as any, { messages: [{ role: "user", content: "Say ok" }], max_tokens: 4 } as any);
      results.push({ name: "AI (binding)", what: "Backup AI (Cloudflare)", status: "ok", detail: "Workers AI replied" });
    } catch (err) {
      results.push({ name: "AI (binding)", what: "Backup AI (Cloudflare)", status: "problem", detail: String(err).slice(0, 160) });
    }
  }
  if (env.OLLAMA_BASE_URL || env.OLLAMA_VPC) {
    const [on, pc] = await Promise.all([pcAiEnabled(env), pcStatus(env)]);
    results.unshift({
      name: "Tunnel (OLLAMA_VPC)",
      what: "Your PC (Ollama)",
      status: !on ? "warning" : pc.online ? "ok" : "warning",
      detail: !on ? "switched off in admin" : pc.online ? "reachable through the private tunnel" : "offline (PC asleep, Ollama closed, or tunnel stopped)",
    });
  }
  results.push({ name: "ADMIN_TOKEN", what: "Admin password", status: "ok", detail: "works (you're signed in to admin)" });
  return results;
}
