// Local mode: run an open-weight model entirely in the browser with WebLLM (WebGPU).
// Free and unlimited — the host's device does the work and the room relays the tokens.
import type { MLCEngine } from "@mlc-ai/web-llm";

export const LOCAL_MODELS = [
  { id: "Qwen3-4B-q4f16_1-MLC", label: "Qwen3 4B (balanced, ~3GB)" },
  { id: "Qwen3-1.7B-q4f16_1-MLC", label: "Qwen3 1.7B (fast, ~1.3GB)" },
  { id: "Qwen3-8B-q4f16_1-MLC", label: "Qwen3 8B (smartest, ~5.5GB)" },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Llama 3.2 3B (~2.3GB)" },
  { id: "Phi-3.5-mini-instruct-q4f16_1-MLC", label: "Phi 3.5 mini (~2.5GB)" },
];

export const hasWebGPU = () => typeof navigator !== "undefined" && "gpu" in navigator;

let engine: MLCEngine | null = null;
let loadedModel = "";
let loading: Promise<MLCEngine> | null = null;

export async function getEngine(model: string, onProgress: (text: string, pct: number) => void) {
  if (engine && loadedModel === model) return engine;
  if (loading && loadedModel === model) return loading;
  loadedModel = model;
  loading = (async () => {
    const webllm = await import("@mlc-ai/web-llm");
    if (engine) await engine.reload(model);
    else
      engine = await webllm.CreateMLCEngine(model, {
        initProgressCallback: (r) => onProgress(r.text, r.progress),
      });
    onProgress("ready", 1);
    return engine!;
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}

export async function generateLocal(
  model: string,
  messages: { role: string; content: string }[],
  onDelta: (t: string) => void,
  onProgress: (text: string, pct: number) => void,
) {
  const eng = await getEngine(model, onProgress);
  const isQwen3 = /qwen3/i.test(model);
  const msgs = messages.map((m) => ({ role: m.role as "system" | "user" | "assistant", content: m.content }));
  // Qwen3 "thinks" by default; ask it not to so answers stream quickly.
  if (isQwen3 && msgs[0]?.role === "system") msgs[0].content += "\n/no_think";
  const stream = await eng.chat.completions.create({ messages: msgs, stream: true, temperature: 0.7 });
  let inThink = false;
  let buf = "";
  for await (const chunk of stream) {
    buf += chunk.choices[0]?.delta?.content ?? "";
    // Strip <think>...</think> blocks while streaming.
    for (;;) {
      if (inThink) {
        const end = buf.indexOf("</think>");
        if (end === -1) {
          buf = buf.slice(-8);
          break;
        }
        buf = buf.slice(end + 8).replace(/^\s+/, "");
        inThink = false;
      } else {
        const start = buf.indexOf("<think>");
        if (start === -1) {
          const safe = buf.length - 7; // keep a partial "<think" tail
          if (safe > 0) {
            onDelta(buf.slice(0, safe));
            buf = buf.slice(safe);
          }
          break;
        }
        if (start > 0) onDelta(buf.slice(0, start));
        buf = buf.slice(start + 7);
        inThink = true;
      }
    }
  }
  if (!inThink && buf) onDelta(buf);
}

export function interruptLocal() {
  engine?.interruptGenerate();
}
