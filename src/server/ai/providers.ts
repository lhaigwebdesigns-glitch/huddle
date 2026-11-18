import type { Env } from "../env";
import { getProviders, type ProviderConfig } from "./models";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}
export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
  provider: string;
  model: string;
}
interface ChatArgs {
  messages: LlmMessage[];
  tools?: ToolDef[];
  signal?: AbortSignal;
  onDelta: (text: string) => void;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public status = 0,
    /** Seconds the provider asked us to wait (from Retry-After or the error text). */
    public retryAfter?: number,
  ) {
    super(message);
  }
}

/**
 * Longest rate-limit wait we'll sit through before moving to the next provider. Groq's
 * per-minute token window often resets within ~20s, and waiting for the strong model beats
 * handing a multi-step task to a weaker one. The room sees the typing indicator meanwhile.
 */
const MAX_RETRY_WAIT_S = 20;

/** Reads "try again in 4.125s" (Groq) or a Retry-After header into seconds. */
export function parseRetryAfter(text: string, header?: string | null): number | undefined {
  const h = Number(header);
  if (header && Number.isFinite(h)) return h;
  const m = text.match(/try again in (?:(\d+)m)?(\d+(?:\.\d+)?)s/i);
  if (!m) return undefined;
  return Number(m[1] ?? 0) * 60 + Number(m[2]);
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), reject(new Error("aborted"))), { once: true });
  });

// Providers that hit a rate limit are skipped for a while (per isolate).
const cooldownUntil = new Map<string, number>();

export function availableProviders(env: Env): ProviderConfig[] {
  const now = Date.now();
  return getProviders(env).filter((p) => (cooldownUntil.get(p.id) ?? 0) < now);
}

/**
 * Try each free provider in order until one answers. Only falls through to the next
 * provider if nothing has been streamed yet, so users never see a half-answer twice.
 */
export async function chatWithFallback(env: Env, args: ChatArgs): Promise<ChatResult> {
  const providers = availableProviders(env);
  if (providers.length === 0) throw new ProviderError("NO_PROVIDERS");
  let lastErr: unknown;
  for (const p of providers) {
    let emitted = false;
    const attempt = () =>
      chatOnce(p, {
        ...args,
        tools: p.supportsTools ? args.tools : undefined,
        onDelta: (t) => {
          emitted = true;
          args.onDelta(t);
        },
      });
    try {
      try {
        return await attempt();
      } catch (err) {
        // A short per-minute token limit (common on Groq's free tier): wait it out once
        // rather than dropping to a weaker model for the rest of the minute.
        const wait = err instanceof ProviderError && err.status === 429 ? err.retryAfter : undefined;
        if (emitted || args.signal?.aborted || wait === undefined || wait > MAX_RETRY_WAIT_S) throw err;
        console.warn(`provider ${p.id} rate-limited, retrying in ${wait}s`);
        await sleep(wait * 1000 + 250, args.signal);
        return await attempt();
      }
    } catch (err) {
      if (args.signal?.aborted) throw err;
      lastErr = err;
      const status = err instanceof ProviderError ? err.status : 0;
      const msg = String(err);
      const cooldown = /run remotely/i.test(msg)
        ? 24 * 3_600_000 // Workers AI binding in local dev without a Cloudflare login: never works this session
        : status === 429
          ? Math.max(60, (err as ProviderError).retryAfter ?? 0) * 1000
          : 15_000;
      cooldownUntil.set(p.id, Date.now() + cooldown);
      console.warn(`provider ${p.id} failed`, status, msg.slice(0, 200));
      if (emitted) throw err;
    }
  }
  console.warn("all providers failed", String(lastErr));
  throw new ProviderError("ALL_FAILED");
}

async function chatOnce(p: ProviderConfig, args: ChatArgs): Promise<ChatResult> {
  if (p.kind === "mock") return mockChat(args);
  if (p.kind === "workers-ai") return workersAiChat(p, args);
  return openAiCompatChat(p, args);
}

async function openAiCompatChat(p: ProviderConfig, args: ChatArgs): Promise<ChatResult> {
  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: "POST",
    signal: args.signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${p.apiKey}`,
      ...p.extraHeaders,
    },
    body: JSON.stringify({
      model: p.model,
      messages: args.messages,
      tools: args.tools?.length ? args.tools : undefined,
      stream: true,
      temperature: 0.6,
      max_tokens: 4096,
      // gpt-oss "thinks" before answering; those hidden tokens count against free
      // tokens-per-minute limits. Low effort keeps tool use reliable and quota usage small.
      ...(/gpt-oss/.test(p.model) ? { reasoning_effort: "low" } : {}),
    }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new ProviderError(
      `${p.id} ${res.status}: ${text.slice(0, 300)}`,
      res.status,
      res.status === 429 ? parseRetryAfter(text, res.headers.get("retry-after")) : undefined,
    );
  }

  let content = "";
  const calls: ToolCall[] = [];
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let json: any;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      if (json.error) throw new ProviderError(`${p.id}: ${JSON.stringify(json.error).slice(0, 300)}`, 500);
      const delta = json.choices?.[0]?.delta;
      if (!delta) continue;
      if (typeof delta.content === "string" && delta.content) {
        content += delta.content;
        args.onDelta(delta.content);
      }
      for (const tc of delta.tool_calls ?? []) {
        const i = tc.index ?? calls.length;
        calls[i] ??= { id: tc.id ?? `call_${i}`, type: "function", function: { name: "", arguments: "" } };
        if (tc.id) calls[i].id = tc.id;
        if (tc.function?.name) calls[i].function.name += tc.function.name;
        if (tc.function?.arguments) calls[i].function.arguments += tc.function.arguments;
      }
    }
  }
  return { content, toolCalls: calls.filter(Boolean), provider: p.label, model: p.model };
}

async function workersAiChat(p: ProviderConfig, args: ChatArgs): Promise<ChatResult> {
  // Workers AI is stricter about tool-call history, so flatten it into plain text turns.
  const messages = args.messages.map((m) => {
    if (m.role === "tool") return { role: "user", content: `TOOL RESULT:\n${m.content}` };
    if (m.role === "assistant" && m.tool_calls?.length)
      return {
        role: "assistant",
        content: `${m.content ?? ""}\n(called tools: ${m.tool_calls
          .map((c) => `${c.function.name}(${c.function.arguments})`)
          .join(", ")})`,
      };
    return { role: m.role, content: m.content ?? "" };
  });
  if (!p.binding) throw new ProviderError("workers-ai not bound");
  let out: any;
  try {
    out = await p.binding.run(p.model as any, {
      messages,
      tools: args.tools?.length ? args.tools : undefined,
      max_tokens: 4096,
    } as any);
  } catch (err) {
    const msg = String(err);
    throw new ProviderError(`workers-ai: ${msg.slice(0, 300)}`, /limit|quota|429|neuron/i.test(msg) ? 429 : 500);
  }
  const toolCalls: ToolCall[] = (out?.tool_calls ?? []).map((c: any, i: number) => ({
    id: c.id ?? `wai_${i}`,
    type: "function" as const,
    function: {
      name: c.name ?? c.function?.name,
      arguments:
        typeof (c.arguments ?? c.function?.arguments) === "string"
          ? c.arguments ?? c.function?.arguments
          : JSON.stringify(c.arguments ?? c.function?.arguments ?? {}),
    },
  }));
  const content: string = typeof out?.response === "string" ? out.response : "";
  if (content) {
    // Non-streaming API: emit in small chunks so the room still sees it "type".
    for (const chunk of content.match(/[\s\S]{1,24}/g) ?? []) args.onDelta(chunk);
  }
  return { content, toolCalls, provider: p.label, model: p.model };
}

function mockChat(args: ChatArgs): Promise<ChatResult> {
  const lastUser = [...args.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const lastIsTool = args.messages[args.messages.length - 1]?.role === "tool";
  if (!lastIsTool && /make a doc/i.test(lastUser) && args.tools?.some((t) => t.function.name === "create_doc")) {
    return Promise.resolve({
      content: "",
      toolCalls: [
        {
          id: "mock_1",
          type: "function",
          function: {
            name: "create_doc",
            arguments: JSON.stringify({
              title: "Mock plan",
              markdown: "# Mock plan\n\nThis doc was written by the **mock AI**.\n\n- First point\n- Second point",
            }),
          },
        },
      ],
      provider: "Mock AI (dev)",
      model: "mock",
    });
  }
  const text = lastIsTool
    ? "Done! I created the document — it's open in the side panel for everyone."
    : `🤖 (mock AI) I heard: "${lastUser.slice(0, 200)}". Configure a free provider key to get real answers.`;
  return (async () => {
    for (const word of text.split(/(?<= )/)) {
      if (args.signal?.aborted) throw new Error("aborted");
      args.onDelta(word);
      await new Promise((r) => setTimeout(r, 15));
    }
    return { content: text, toolCalls: [], provider: "Mock AI (dev)", model: "mock" };
  })();
}
