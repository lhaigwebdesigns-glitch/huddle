import { afterEach, describe, expect, it, vi } from "vitest";
import { chatWithFallback } from "./providers";
import { getProviders } from "./models";

const sse = (text: string) =>
  new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("self-hosted Ollama provider", () => {
  it("comes first, ahead of the hosted free tiers", () => {
    const list = getProviders({ OLLAMA_BASE_URL: "http://localhost:11434/", GROQ_API_KEY: "g" } as any);
    expect(list[0]).toMatchObject({ id: "ollama", baseUrl: "http://localhost:11434/v1", model: "huddle" });
    expect(list[1].id).toBe("groq");
  });

  it("sends the shared secret when one is set", async () => {
    let auth = "";
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      auth = (init.headers as Record<string, string>).authorization;
      return sse("hi");
    });
    await chatWithFallback({ OLLAMA_BASE_URL: "https://ai.example.test", OLLAMA_API_KEY: "s3cret" } as any, {
      messages: [],
      onDelta: () => {},
    });
    expect(auth).toBe("Bearer s3cret");
  });

  it("falls through to Groq when the PC is offline", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("offline.test")) throw new TypeError("fetch failed: connection refused");
      return sse("from groq");
    });
    const res = await chatWithFallback({ OLLAMA_BASE_URL: "http://offline.test:11434", GROQ_API_KEY: "g" } as any, {
      messages: [],
      onDelta: () => {},
    });
    expect(res.content).toBe("from groq");
    expect(res.provider).toBe("Groq");
  });

  it("gives up on a PC that doesn't start answering in time", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", (url: string, init: RequestInit) =>
      url.includes("slow.test")
        ? new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted"))))
        : Promise.resolve(sse("from cerebras")),
    );
    const p = chatWithFallback({ OLLAMA_BASE_URL: "http://slow.test", CEREBRAS_API_KEY: "c" } as any, {
      messages: [],
      onDelta: () => {},
    });
    await vi.advanceTimersByTimeAsync(61_000);
    const res = await p;
    expect(res.content).toBe("from cerebras");
  });
});
