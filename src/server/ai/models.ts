import type { Env } from "../env";

/**
 * Free, open-weight model lineup. Every provider here has a no-credit-card free tier.
 * Order = preference. The router skips providers that aren't configured or are rate-limited.
 * Override any model with an env var (e.g. GROQ_MODEL) when better open models ship.
 */
export interface ProviderConfig {
  id: string;
  label: string;
  kind: "openai" | "workers-ai" | "mock";
  baseUrl?: string;
  apiKey?: string;
  model: string;
  supportsTools: boolean;
  extraHeaders?: Record<string, string>;
  binding?: Ai;
}

export function getProviders(env: Env): ProviderConfig[] {
  if (env.MOCK_AI === "true") {
    return [{ id: "mock", label: "Mock AI (dev)", kind: "mock", model: "mock", supportsTools: true }];
  }
  const list: ProviderConfig[] = [];
  if (env.GROQ_API_KEY) {
    list.push({
      id: "groq",
      label: "Groq",
      kind: "openai",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: env.GROQ_API_KEY,
      model: env.GROQ_MODEL || "openai/gpt-oss-120b",
      supportsTools: true,
    });
  }
  if (env.CEREBRAS_API_KEY) {
    list.push({
      id: "cerebras",
      label: "Cerebras",
      kind: "openai",
      baseUrl: "https://api.cerebras.ai/v1",
      apiKey: env.CEREBRAS_API_KEY,
      model: env.CEREBRAS_MODEL || "gpt-oss-120b",
      supportsTools: true,
    });
  }
  if (env.AI) {
    list.push({
      id: "workers-ai",
      label: "Cloudflare Workers AI",
      kind: "workers-ai",
      binding: env.AI,
      model: env.WORKERS_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      supportsTools: true,
    });
  }
  if (env.OPENROUTER_API_KEY) {
    list.push({
      id: "openrouter",
      label: "OpenRouter (free models)",
      kind: "openai",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: env.OPENROUTER_API_KEY,
      // Only ":free" variants cost $0. Check https://openrouter.ai/models?max_price=0
      model: env.OPENROUTER_MODEL || "deepseek/deepseek-chat-v3.1:free",
      supportsTools: true,
      extraHeaders: { "X-Title": "Huddle" },
    });
  }
  return list;
}
