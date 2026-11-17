import { afterEach, describe, expect, it, vi } from "vitest";
import { chatWithFallback } from "./providers";

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
    expect(calls[0]).toContain("groq");
    expect(calls[1]).toContain("cerebras");
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
});

describe("all providers down", () => {
  it("throws ALL_FAILED so the room can suggest Local mode", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 503 }));
    await expect(
      chatWithFallback({ CEREBRAS_API_KEY: "a" } as any, { messages: [], onDelta: () => {} }), // (Groq is in cooldown from the first test)
    ).rejects.toThrow("ALL_FAILED");
  });
});
