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

/**
 * Once a doc write has run, the model doesn't need its own Markdown echoed back on the next
 * step; replacing it with a short note saves ~1–2k tokens per step on free per-minute limits.
 */
export function compactDocArgs(call: ToolCall) {
  if (call.function.name !== "create_doc" && call.function.name !== "edit_doc") return;
  try {
    const args = JSON.parse(call.function.arguments);
    if (typeof args.markdown === "string" && args.markdown.length > 300) {
      args.markdown = `[${args.markdown.length} characters of Markdown, already written to the doc]`;
      call.function.arguments = JSON.stringify(args);
    }
  } catch {
    // leave malformed arguments as they were
  }
}
