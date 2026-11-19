import { afterEach, describe, expect, it, vi } from "vitest";
import { chatWithFallback, parseRetryAfter, resetCooldowns } from "./providers";

const sse = (chunks: string[]) =>
  new Response(chunks.map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join("") + "data: [DONE]\n\n", {
    headers: { "content-type": "text/event-stream" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  resetCooldowns();
});

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
    // Groq's three models (each its own rate-limit bucket), then Cerebras.
    expect(calls).toHaveLength(4);
    expect(calls.slice(0, 3).every((u) => u.includes("groq"))).toBe(true);
    expect(calls[3]).toContain("cerebras");
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

  it("returns at the [DONE] marker even if the connection stays open", async () => {
    vi.stubGlobal("fetch", async () => {
      const enc = new TextEncoder();
      const body = new ReadableStream({
        start(c) {
          c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "fast" } }] })}\n\ndata: [DONE]\n\n`));
          // never closes
        },
      });
      return new Response(body);
    });
    const res = await Promise.race([
      chatWithFallback({ OPENROUTER_API_KEY: "k" } as any, { messages: [], onDelta: () => {} }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("hung waiting for close")), 1000)),
    ]);
    expect((res as any).content).toBe("fast");
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

describe("tool calls written as text", () => {
  const names = new Set(["create_doc", "web_search"]);

  it("recovers the Llama-style JSON call from a real bad reply", async () => {
    const { recoverTextToolCalls } = await import("./providers");
    const reply = `{"type": "function", "name": "create_doc", "parameters": {"title": "Thermodynamics Report", "markdown": "## Intro\nHeat {and} work."}}`;
    const { calls, rest } = recoverTextToolCalls(reply, names);
    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe("create_doc");
    expect(JSON.parse(calls[0].function.arguments)).toEqual({ title: "Thermodynamics Report", markdown: "## Intro\nHeat {and} work." });
    expect(rest).toBe("");
  });

  it("handles <function=…> tags, fences and surrounding prose", async () => {
    const { recoverTextToolCalls } = await import("./providers");
    const a = recoverTextToolCalls('Let me look.\n<function=web_search>{"query": "entropy"}</function>', names);
    expect(a.calls[0].function.name).toBe("web_search");
    expect(a.rest).toBe("Let me look.");
    const b = recoverTextToolCalls('```json\n{"name": "web_search", "arguments": {"query": "x"}}\n```', names);
    expect(b.calls).toHaveLength(1);
    expect(b.rest).toBe("");
  });

  it("leaves ordinary JSON and unknown tools alone", async () => {
    const { recoverTextToolCalls } = await import("./providers");
    const text = 'Use this config: {"name": "my-app", "version": 2}';
    expect(recoverTextToolCalls(text, names)).toEqual({ calls: [], rest: text });
  });

  it("runs the call and never streams the raw JSON to the room", async () => {
    const json = JSON.stringify({ type: "function", name: "create_doc", parameters: { title: "T", markdown: "# T" } });
    vi.stubGlobal("fetch", async () => sse([json.slice(0, 20), json.slice(20)]));
    let streamed = "";
    const res = await chatWithFallback({ CEREBRAS_API_KEY: "b" } as any, {
      messages: [{ role: "user", content: "make a doc" }],
      tools: [{ type: "function", function: { name: "create_doc", description: "", parameters: {} } }],
      onDelta: (d) => (streamed += d),
    });
    expect(streamed).toBe("");
    expect(res.toolCalls[0].function.name).toBe("create_doc");
    expect(res.content).toBe("");
  });

  it("still streams normal answers when tools are offered", async () => {
    vi.stubGlobal("fetch", async () => sse(["Hello", " there"]));
    let streamed = "";
    const res = await chatWithFallback({ CEREBRAS_API_KEY: "b" } as any, {
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", function: { name: "create_doc", description: "", parameters: {} } }],
      onDelta: (d) => (streamed += d),
    });
    expect(streamed).toBe("Hello there");
    expect(res.toolCalls).toHaveLength(0);
  });
});
