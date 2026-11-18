import { afterEach, describe, expect, it, vi } from "vitest";
import { chatWithFallback, parseRetryAfter } from "./providers";

const sse = (chunks: string[]) =>
  new Response(chunks.map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join("") + "data: [DONE]\n\n", {
    headers: { "content-type": "text/event-stream" },
  });

afterEach(() => vi.unstubAllGlobals());

describe("free provider router", () => {
  it("falls through to the next provider on a 429 rate limit", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      if (url.includes("groq")) return new Response("rate limited", { status: 429 });
      return sse(["Hello", " world"]);
    });
    let streamed = "";
    const res = await chatWithFallback({ GROQ_API_KEY: "a", CEREBRAS_API_KEY: "b" } as any, {
      messages: [{ role: "user", content: "hi" }],
      onDelta: (d) => (streamed += d),
    });
    // Groq's main model, then Groq's fallback model (separate rate-limit bucket), then Cerebras.
    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain("groq");
    expect(calls[1]).toContain("groq");
    expect(calls[2]).toContain("cerebras");
    expect(res.content).toBe("Hello world");
    expect(streamed).toBe("Hello world");
    expect(res.provider).toBe("Cerebras");
  });

  it("reports NO_PROVIDERS when nothing is configured", async () => {
    await expect(chatWithFallback({} as any, { messages: [], onDelta: () => {} })).rejects.toThrow("NO_PROVIDERS");
  });

  it("assembles streamed tool calls", async () => {
    vi.stubGlobal("fetch", async () => {
      const parts = [
        { tool_calls: [{ index: 0, id: "c1", function: { name: "web_search", arguments: '{"que' } }] },
        { tool_calls: [{ index: 0, function: { arguments: 'ry":"cats"}' } }] },
      ];
      return new Response(parts.map((d) => `data: ${JSON.stringify({ choices: [{ delta: d }] })}\n\n`).join(""));
    });
    const res = await chatWithFallback({ OPENROUTER_API_KEY: "k" } as any, { messages: [], onDelta: () => {} });
    expect(res.toolCalls[0].function).toEqual({ name: "web_search", arguments: '{"query":"cats"}' });
  });

  it("waits out a short per-minute rate limit and retries the same provider", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async () =>
      ++n === 1
        ? new Response('{"error":{"message":"Rate limit reached ... Please try again in 0.01s."}}', { status: 429 })
        : sse(["ok"]),
    );
    const res = await chatWithFallback({ CEREBRAS_API_KEY: "b" } as any, { messages: [], onDelta: () => {} });
    expect(n).toBe(2);
    expect(res.content).toBe("ok");
  });

  it("parses Groq/OpenAI-style retry hints", () => {
    expect(parseRetryAfter("Please try again in 4.125s.")).toBe(4.125);
    expect(parseRetryAfter("Please try again in 1m30s.")).toBe(90);
    expect(parseRetryAfter("nope", "7")).toBe(7);
    expect(parseRetryAfter("nope")).toBeUndefined();
  });

  it("ignores gpt-oss reasoning deltas (Groq `reasoning`, Cerebras `reasoning_content`)", async () => {
    vi.stubGlobal("fetch", async () => {
      const parts = [
        { role: "assistant", reasoning: "The user greets. I should" },
        { reasoning_content: " respond briefly." },
        { content: "Hi" },
        { reasoning: " (more thinking)", content: " there!" },
      ];
      return new Response(parts.map((d) => `data: ${JSON.stringify({ choices: [{ delta: d }] })}\n\n`).join("") + "data: [DONE]\n\n");
    });
    let streamed = "";
    const res = await chatWithFallback({ OPENROUTER_API_KEY: "k" } as any, {
      messages: [{ role: "user", content: "hi" }],
      onDelta: (d) => (streamed += d),
    });
    expect(streamed).toBe("Hi there!");
    expect(res.content).toBe("Hi there!");
  });
});

describe("all providers down", () => {
  it("throws ALL_FAILED so the room can suggest Local mode", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 503 }));
    await expect(
      chatWithFallback({ CEREBRAS_API_KEY: "a" } as any, { messages: [], onDelta: () => {} }), // (Groq is in cooldown from the first test)
    ).rejects.toThrow("ALL_FAILED");
  });
});
