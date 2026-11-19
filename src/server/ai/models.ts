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
  /** Give up (and fall through to the next provider) if no response starts within this time. */
  responseTimeoutMs?: number;
  /** OpenAI-style reasoning_effort for "thinking" models (none | low | medium | high). */
  reasoningEffort?: string;
  /** Send requests through this binding instead of the public internet (Workers VPC). */
  fetcher?: Fetcher;
}

export function getProviders(env: Env): ProviderConfig[] {
  if (env.MOCK_AI === "true") {
    return [{ id: "mock", label: "Mock AI (dev)", kind: "mock", model: "mock", supportsTools: true }];
  }
  const list: ProviderConfig[] = [];
  if (env.OLLAMA_BASE_URL || env.OLLAMA_VPC) {
    // Your own GPU first: unlimited and free. If the PC is off or busy past the timeout,
    // the router moves on to the hosted free tiers below. Deployed, it's reached through a
    // private tunnel (OLLAMA_VPC) with no public address; local dev talks to localhost.
    list.push({
      id: "ollama",
      label: "Self-hosted",
      kind: "openai",
      baseUrl: env.OLLAMA_BASE_URL ? `${env.OLLAMA_BASE_URL.replace(/\/+$/, "")}/v1` : "http://127.0.0.1:11434/v1",
      fetcher: env.OLLAMA_BASE_URL ? undefined : env.OLLAMA_VPC,
      apiKey: env.OLLAMA_API_KEY || "ollama",
      // "huddle" = qwen3:14b with a 16k context window, built from ollama/Modelfile.
      model: env.OLLAMA_MODEL || "huddle",
      supportsTools: true,
      // Covers loading the model into GPU memory on the first request after idle.
      responseTimeoutMs: 60_000,
      // Qwen3 "thinks" by default; off, it answers in ~2s instead of ~20s and still uses tools well.
      reasoningEffort: env.OLLAMA_REASONING || "none",
    });
  }
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
    // Groq's free tier rate-limits each model separately (e.g. 8k tokens/min), so a second
    // model on the same key absorbs bursts. Set GROQ_FALLBACK_MODEL="off" to disable.
    const fallback = env.GROQ_FALLBACK_MODEL || "openai/gpt-oss-20b";
    if (fallback !== "off" && fallback !== list[list.length - 1].model) {
      list.push({
        id: "groq-fallback",
        label: "Groq",
        kind: "openai",
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: env.GROQ_API_KEY,
        model: fallback,
        supportsTools: true,
      });
    }
    // A third model on the same key, with its own free bucket. Thinking off saves tokens/minute.
    const third = env.GROQ_THIRD_MODEL || "qwen/qwen3.8-27b";
    if (third !== "off" && !list.some((p) => p.model === third)) {
      list.push({
        id: "groq-third",
        label: "Groq",
        kind: "openai",
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: env.GROQ_API_KEY,
        model: third,
        supportsTools: true,
        reasoningEffort: /qwen/i.test(third) ? "none" : undefined,
      });
    }
  }
  if (env.NVIDIA_API_KEY) {
    // NVIDIA NIM free API (build.nvidia.com, NVIDIA Developer Program): high daily limits.
    list.push({
      id: "nvidia",
      label: "NVIDIA",
      kind: "openai",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      apiKey: env.NVIDIA_API_KEY,
      model: env.NVIDIA_MODEL || "openai/gpt-oss-120b",
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
      // Free open models with tool support (Nov 2026): nemotron-3-ultra, gemma-4-31b-it.
      model: env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free",
      supportsTools: true,
      extraHeaders: { "X-Title": "Huddle" },
    });
  }
  return list;
}
