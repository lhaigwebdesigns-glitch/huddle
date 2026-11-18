/** Composer slash commands: shortcuts that expand into a request for the AI. */

export interface SlashCommand {
  name: string;
  hint: string;
  description: string;
  expand: (arg: string) => string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "doc", hint: "topic", description: "AI writes a doc everyone can edit", expand: (a) => `@ai Create a doc: ${a}` },
  { name: "search", hint: "question", description: "AI searches the web with sources", expand: (a) => `@ai Search the web for: ${a}` },
  { name: "sheet", hint: "what to track", description: "AI builds a spreadsheet", expand: (a) => `@ai Create a spreadsheet: ${a}` },
  { name: "slides", hint: "topic", description: "AI makes a slide deck", expand: (a) => `@ai Create a slide deck: ${a}` },
  { name: "whiteboard", hint: "what to draw", description: "AI sketches a diagram on a whiteboard", expand: (a) => `@ai Draw on a whiteboard: ${a}` },
  { name: "form", hint: "what to ask", description: "AI builds a form people can fill in", expand: (a) => `@ai Create a form: ${a}` },
  { name: "poll", hint: "Question | option | option", description: "Quick poll for the room", expand: (a) => `/poll ${a}` },
];

/** Commands whose name starts with what's typed after "/" (for the composer menu). */
export function matchSlash(text: string): SlashCommand[] {
  const m = /^\/(\w*)$/.exec(text.trim());
  if (!m) return [];
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(m[1].toLowerCase()));
}

/**
 * Turn "/doc bake sale plan" into the message actually sent. Unknown commands and plain
 * text pass through unchanged. Returns null when a command is missing its argument.
 */
export function expandSlash(text: string): string | null {
  const m = /^\/(\w+)\s*([\s\S]*)$/.exec(text.trim());
  if (!m) return text;
  const cmd = SLASH_COMMANDS.find((c) => c.name === m[1].toLowerCase());
  if (!cmd) return text;
  const arg = m[2].trim();
  if (!arg) return null;
  return cmd.expand(arg);
}

/** Parse "/poll Question | a | b" into a poll, or null if it isn't one. */
export function parsePoll(text: string): { question: string; options: string[] } | null {
  const m = /^\/poll\s+([\s\S]+)$/i.exec(text.trim());
  if (!m) return null;
  const [question, ...options] = m[1].split("|").map((s) => s.trim()).filter(Boolean);
  if (!question || options.length < 2) return null;
  return { question: question.slice(0, 200), options: options.slice(0, 10).map((o) => o.slice(0, 80)) };
}
