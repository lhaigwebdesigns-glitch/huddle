import type { LlmMessage, ToolCall } from "./providers";

/**
 * Several people can talk while the AI is answering, and models tend to either answer only
 * the first speaker or re-answer everything. Tell the model exactly whom to answer.
 *
 * The note is appended to the newest user message rather than sent as a trailing system
 * message: gpt-oss (and other "harmony"-format models) largely ignore system text placed
 * after the conversation has started.
 */
export function withFreshNote(hist: LlmMessage[]): LlmMessage[] {
  const lastAi = hist.map((m) => m.role).lastIndexOf("assistant");
  const fresh = hist.slice(lastAi + 1).filter((m) => m.role === "user");
  if (!fresh.length) return hist;
  const speakers = [...new Set(fresh.map((m) => String(m.content).split(":")[0]))];
  // On a room's first turn the note only matters when several people spoke at once.
  if (lastAi < 0 && speakers.length < 2) return hist;
  const names = speakers.join(" and ");
  const note =
    speakers.length > 1
      ? `[Huddle note: ${names} have each sent a message since your last reply. Answer every one of them, by name.${lastAi >= 0 ? " Don't repeat earlier answers." : ""}]`
      : `[Huddle note: reply only to the message(s) from ${names} after your last reply; earlier messages were already answered.]`;
  const lastUser = hist.map((m) => m.role).lastIndexOf("user");
  return hist.map((m, i) => (i === lastUser ? { ...m, content: `${m.content}\n\n${note}` } : m));
}

/** "Do deep research", "cite the sites", "find reputable sources"… asks for the research workflow. */
export function wantsResearch(text: string): boolean {
  return /\b(deep[- ]?research|research|cite|citations?|cited|reputable|(?:with|find|list|include) (?:the |real )?sources)\b/i.test(text);
}

/**
 * Once a doc write has run, the model doesn't need its own Markdown echoed back on the next
 * step; replacing it with a short note saves ~1–2k tokens per step on free per-minute limits.
 */
const BULKY_FIELDS = ["markdown", "csv", "html", "mermaid"];

export function compactDocArgs(call: ToolCall) {
  if (!/^(create|edit)_/.test(call.function.name) && call.function.name !== "draw_whiteboard") return;
  try {
    const args = JSON.parse(call.function.arguments);
    let changed = false;
    for (const f of BULKY_FIELDS) {
      if (typeof args[f] === "string" && args[f].length > 300) {
        args[f] = `[${args[f].length} characters, already written to the file]`;
        changed = true;
      }
    }
    for (const f of ["ops", "slides", "questions"]) {
      if (Array.isArray(args[f]) && JSON.stringify(args[f]).length > 600) {
        args[f] = `[${args[f].length} items, already applied]`;
        changed = true;
      }
    }
    if (changed) call.function.arguments = JSON.stringify(args);
  } catch {
    // leave malformed arguments as they were
  }
}
