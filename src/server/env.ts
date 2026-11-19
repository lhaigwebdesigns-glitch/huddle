import type { Room } from "./room";
import type { Doc } from "./doc";

export interface Env {
  Room: DurableObjectNamespace<Room>;
  Doc: DurableObjectNamespace<Doc>;
  ASSETS: Fetcher;
  DB?: D1Database;
  /** R2 bucket for uploads and AI images (simulated on disk in local dev). */
  FILES?: R2Bucket;
  // ---- Accounts (optional; guests can always join) ----
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** "1" = only signed-in people can create rooms (needs a provider configured). */
  REQUIRE_SIGNIN_TO_CREATE?: string;
  /** "1" = a passwordless "dev" sign-in for local testing. Never set this in production. */
  DEV_AUTH?: string;
  /** Cloudflare Workers AI binding (free daily allowance). Optional. */
  AI?: Ai;
  /**
   * Self-hosted model via Ollama on your own GPU: no rate or token limits. Local dev can use
   * http://localhost:11434; the deployed Worker uses OLLAMA_VPC below instead.
   */
  OLLAMA_BASE_URL?: string;
  /**
   * Private link to Ollama on your PC (Workers VPC over a Cloudflare Tunnel). It has no public
   * address: only this Worker can reach it. Used when OLLAMA_BASE_URL isn't set.
   */
  OLLAMA_VPC?: Fetcher;
  OLLAMA_MODEL?: string;
  /** reasoning_effort for the self-hosted model (default "none" = fast, no hidden thinking). */
  OLLAMA_REASONING?: string;
  /** Shared secret sent as a Bearer token; required in front of a public tunnel. */
  OLLAMA_API_KEY?: string;
  GROQ_API_KEY?: string;
  /** Third Groq model (own free rate-limit bucket); "off" disables. */
  GROQ_THIRD_MODEL?: string;
  CEREBRAS_API_KEY?: string;
  NVIDIA_API_KEY?: string;
  NVIDIA_MODEL?: string;
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
