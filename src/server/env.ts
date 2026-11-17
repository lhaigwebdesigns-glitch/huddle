import type { Room } from "./room";
import type { Doc } from "./doc";

export interface Env {
  Room: DurableObjectNamespace<Room>;
  Doc: DurableObjectNamespace<Doc>;
  ASSETS: Fetcher;
  DB?: D1Database;
  /** Cloudflare Workers AI binding (free daily allowance). Optional. */
  AI?: Ai;
  GROQ_API_KEY?: string;
  CEREBRAS_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  TAVILY_API_KEY?: string;
  JINA_API_KEY?: string;
  ADMIN_TOKEN?: string;
  MOCK_AI?: string;
  ROOM_DAILY_AI_LIMIT?: string;
  // Optional model overrides (swap in newer open-weight models without code changes)
  GROQ_MODEL?: string;
  CEREBRAS_MODEL?: string;
  OPENROUTER_MODEL?: string;
  WORKERS_AI_MODEL?: string;
}
