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

/** "Make / draw / generate … a picture / logo / poster…": the person wants a new image. */
export function wantsImage(text: string): boolean {
  return (
    /\b(make|create|generate|draw|design|paint|render|sketch|show me|give me|can you do|produce)\b/i.test(text) &&
    /\b(image|picture|pic|photo|drawing|illustration|logo|poster|wallpaper|artwork|art|icon|banner|sticker|meme)s?\b/i.test(text)
  );
}

/** The reply says an image was made ("Here's your image", "I've created a logo…"). */
export function claimsImage(text: string): boolean {
  return /\b(here('s| is| are)|i('ve| have)?\s+(just\s+)?(made|created|generated|drawn|designed|painted|rendered))\b[^.!?\n]{0,60}\b(image|picture|pic|photo|drawing|illustration|logo|poster|wallpaper|artwork|icon|banner)s?\b/i.test(
    text,
  );
}

/** Tools that only look things up or read files: the tutor can use these. */
const LOOKUP_TOOLS = new Set(["web_search", "fetch_url", "load_skill", "search_knowledge", "describe_image", "remember"]);

/**
 * Whether the AI may use a tool under a project's AI setting.
 * Tutor mode can only look things up and read, so it can't write the students' work.
 * After a project is turned in, nothing may create or change files.
 */
export function toolAllowed(name: string, ai: "off" | "tutor" | "full", turnedIn = false): boolean {
  if (ai === "off") return false;
  // Planning who does what isn't doing the work, so tutors can add tasks too.
  if (name === "add_tasks") return !turnedIn;
  const lookup = LOOKUP_TOOLS.has(name) || name.startsWith("read_");
  if (ai === "tutor") return lookup;
  if (turnedIn) return lookup || name === "generate_image";
  return true;
}

/** System-prompt lines for a project: the assignment, rubric, due date and AI rules. */
export function projectPrompt(
  p: { instructions: string; rubric: string; dueAt?: number; ai: "off" | "tutor" | "full"; turnedInAt?: number; turnedInBy?: string },
  now = Date.now(),
  board?: { tasks: { title: string; ownerUid?: string; dueAt?: number; done: boolean }[]; roles: Record<string, string> },
  nameOf: (uid: string) => string = () => "someone",
): string[] {
  const lines = [
    `This room is a school group project. The teacher set it up; the people chatting are the students in the group.`,
  ];
  if (p.instructions.trim()) lines.push(`Project instructions from the teacher:\n${p.instructions.trim()}`);
  if (p.rubric.trim()) lines.push(`Grading rubric:\n${p.rubric.trim()}\nWhen students ask how their work is doing, check it against this rubric and say what to improve.`);
  if (p.dueAt) {
    const left = p.dueAt - now;
    const when = new Date(p.dueAt).toISOString().replace("T", " ").slice(0, 16) + " UTC";
    lines.push(left > 0 ? `Due: ${when} (in about ${Math.max(1, Math.round(left / 3_600_000))} hours).` : `Due: ${when} (the due date has passed).`);
  }
  if (board) {
    const roles = Object.entries(board.roles).map(([uid, r]) => `${nameOf(uid)}: ${r}`);
    if (roles.length) lines.push(`Roles in the group: ${roles.join("; ")}.`);
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    lines.push(
      board.tasks.length
        ? `The group's task list (use it to remind people what's theirs and what's due; add tasks with add_tasks when they plan or split up work):\n${board.tasks
            .map((t) => `- [${t.done ? "x" : " "}] ${t.title}${t.ownerUid ? ` (owner: ${nameOf(t.ownerUid)})` : " (no owner yet)"}${t.dueAt ? ` due ${day(t.dueAt)}` : ""}`)
            .join("\n")}`
        : "The group has no tasks yet. If they plan the project or ask how to split it up, suggest tasks and add them with add_tasks.",
    );
  }
  if (p.turnedInAt) lines.push(`The group turned this project in${p.turnedInBy ? ` (${p.turnedInBy})` : ""}. Its files are locked; you can still talk, but don't create or change files.`);
  if (p.ai === "tutor")
    lines.push(
      `TUTOR MODE (the teacher's rule for this project): you are a tutor, not a writer. Explain ideas, ask guiding questions, give one hint at a time, and check the students' reasoning. Never write finished answers, essays, paragraphs, slide text, code or solutions for them, even if they ask, insist or say the teacher allows it. If asked to do the work, say kindly that this project is tutor-only and help them take the next step themselves. You cannot create or edit files in this project.`,
    );
  return lines;
}
