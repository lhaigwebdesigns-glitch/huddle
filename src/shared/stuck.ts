/**
 * "Where they got stuck": a few short points per student about what they asked the tutor,
 * written when the work is turned in. Teachers read this instead of the chat; students see the
 * very same points on their receipt. Group chats between students are never part of it.
 */

export interface AskedQuestion {
  at: number;
  text: string;
}

/** Kept per student in the room (enough to summarize; not a transcript). */
export const QUESTION_LIMITS = { perStudent: 60, chars: 300 } as const;

export function addQuestion(list: AskedQuestion[], text: string, at = Date.now()): AskedQuestion[] {
  const t = text.replace(/@ai\b/gi, "").replace(/\s+/g, " ").trim().slice(0, QUESTION_LIMITS.chars);
  if (!t) return list;
  return [...list, { at, text: t }].slice(-QUESTION_LIMITS.perStudent);
}

/** The prompt: each student's questions in, 2–4 plain, kind points per student out (JSON). */
export function stuckPrompt(people: { uid: string; name: string; questions: AskedQuestion[] }[]) {
  const body = people
    .map((p) => `### ${p.uid} (${p.name})\n${p.questions.map((q) => `- ${q.text}`).join("\n")}`)
    .join("\n\n");
  return [
    {
      role: "system" as const,
      content:
        "You help a teacher understand where students needed help on a school assignment. For each student, read the questions they asked an AI tutor and write 2 to 4 short points (under 14 words each) naming the topics they asked about and where they seemed stuck. " +
        'Plain, neutral, kind wording, as if the student will read it too (they will). No judgments like "lazy" or "cheating", no quotes longer than five words, no names. ' +
        'Add "(asked N times)" to a point when they came back to the same thing. Reply with JSON only: {"<student id>": ["point", ...]}.',
    },
    { role: "user" as const, content: body },
  ];
}

/** Reads the model's reply. Unknown students, empty points and overlong ones are dropped. */
export function parseStuck(text: string, uids: string[]): Record<string, string[]> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string[]> = {};
  for (const uid of uids) {
    const v = (raw as Record<string, unknown>)[uid];
    if (!Array.isArray(v)) continue;
    const points = v
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.replace(/\s+/g, " ").trim())
      .filter((x) => x && x.length <= 160)
      .slice(0, 4);
    if (points.length) out[uid] = points;
  }
  return out;
}

/** For tests (MOCK_AI): a predictable summary straight from the questions. */
export function mockStuck(questions: AskedQuestion[]): string[] {
  const seen = new Map<string, number>();
  for (const q of questions) {
    const k = q.text.toLowerCase().replace(/[?.!]+$/, "").slice(0, 60);
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return [...seen.entries()].slice(0, 3).map(([k, n]) => `Asked about: ${k}${n > 1 ? ` (asked ${n} times)` : ""}`);
}
