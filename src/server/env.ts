import type { Room } from "./room";
import type { Doc } from "./doc";

export interface Env {
  Room: DurableObjectNamespace<Room>;
  Doc: DurableObjectNamespace<Doc>;
  ASSETS: Fetcher;
  DB?: D1Database;
  /** Cloudflare Workers AI binding (free daily allowance). Optional. */
  AI?: Ai;
  /**
   * Self-hosted model via Ollama on your own GPU: no rate or token limits. Local dev can use
   * http://localhost:11434; a deployed Worker needs a public tunnel URL to your PC.
   */
  OLLAMA_BASE_URL?: string;
  OLLAMA_MODEL?: string;
  /** reasoning_effort for the self-hosted model (default "none" = fast, no hidden thinking). */
  OLLAMA_REASONING?: string;
  /** Shared secret sent as a Bearer token; required in front of a public tunnel. */
  OLLAMA_API_KEY?: string;
  GROQ_API_KEY?: string;
  CEREBRAS_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  TAVILY_API_KEY?: string;
  JINA_API_KEY?: string;
  ADMIN_TOKEN?: string;
  MOCK_AI?: string;
  /** Log every AI step and tool call to the server console. */
  DEBUG_AI?: string;
  ROOM_DAILY_AI_LIMIT?: string;
  /** Cloud AI turns per day across the whole deployment (default 5000). */
  GLOBAL_DAILY_AI_LIMIT?: string;
  /** Rooms one IP may create per hour (default 20). */
  ROOMS_PER_IP_HOUR?: string;
  // Optional model overrides (swap in newer open-weight models without code changes)
  GROQ_MODEL?: string;
  /** Second Groq model with its own rate-limit bucket ("off" to disable). */
  GROQ_FALLBACK_MODEL?: string;
  CEREBRAS_MODEL?: string;
  OPENROUTER_MODEL?: string;
  WORKERS_AI_MODEL?: string;
}
