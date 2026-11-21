import type { Env } from "../env";

/**
 * Safety checks for school projects. Students' messages are checked by Llama Guard (a small
 * safety model on Cloudflare Workers AI) before the AI answers. If the check can't run, the
 * AI's own safety rules (in the system prompt) still apply: this never blocks a message just
 * because the checker is down.
 */

export type SafetyResult = { safe: true } | { safe: false; category: string };

/** Llama Guard 3's hazard categories. */
const CATEGORIES: Record<string, string> = {
  S1: "violent crimes",
  S2: "non-violent crimes",
  S3: "sex-related crimes",
  S4: "child sexual exploitation",
  S5: "defamation",
  S6: "specialized advice",
  S7: "privacy",
  S8: "intellectual property",
  S9: "indiscriminate weapons",
  S10: "hate",
  S11: "self-harm",
  S12: "sexual content",
  S13: "elections",
  S14: "code interpreter abuse",
};

/** Categories that are fine in a school project ("research the 2024 election", "write a defamation case study"). */
const ALLOWED = new Set(["S5", "S6", "S8", "S13", "S14"]);

/** Reads Llama Guard's answer, which can come back as text ("unsafe\nS11") or as an object. */
export function parseGuard(out: unknown): SafetyResult {
  const r = (out as { response?: unknown })?.response ?? out;
  if (r && typeof r === "object" && "safe" in r) {
    const o = r as { safe: boolean; categories?: string[] };
    if (o.safe) return { safe: true };
    const code = (o.categories ?? []).map((c) => String(c).match(/S\d+/)?.[0]).find(Boolean) ?? "S0";
    return ALLOWED.has(code) ? { safe: true } : { safe: false, category: code };
  }
  const text = String(r ?? "").trim().toLowerCase();
  if (!text.startsWith("unsafe")) return { safe: true };
  const code = text.toUpperCase().match(/S\d+/)?.[0] ?? "S0";
  return ALLOWED.has(code) ? { safe: true } : { safe: false, category: code };
}

export async function checkMessage(env: Env, text: string): Promise<SafetyResult> {
  if (!text.trim()) return { safe: true };
  // Tests: a fixed phrase stands in for a harmful message.
  if (env.MOCK_AI === "true") return /MOCK_SELF_HARM/.test(text) ? { safe: false, category: "S11" } : /MOCK_UNSAFE/.test(text) ? { safe: false, category: "S1" } : { safe: true };
  if (!env.AI) return { safe: true };
  try {
    const out = await Promise.race([
      env.AI.run("@cf/meta/llama-guard-3-8b" as any, { messages: [{ role: "user", content: text.slice(0, 4000) }] } as any),
      new Promise((_, reject) => setTimeout(() => reject(new Error("safety check timed out")), 4000)),
    ]);
    return parseGuard(out);
  } catch (err) {
    console.warn("safety check unavailable", String(err).slice(0, 200));
    return { safe: true };
  }
}

/** What the AI says instead of answering a message the check stopped. */
export function safetyReply(category: string): string {
  if (category === "S11")
    return [
      "It sounds like you might be going through something really hard, and I'm glad you said something.",
      "",
      "I'm not the right one to help with this, but people are, right now:",
      "- **Call or text 988** (Suicide & Crisis Lifeline, US) any time, day or night. It's free and private.",
      "- **Text HOME to 741741** to reach the Crisis Text Line.",
      "- If you're in danger right now, call **911**.",
      "- Talk to a trusted adult: a parent, a teacher, or your school counselor.",
      "",
      "You don't have to go through this alone.",
    ].join("\n");
  const what = CATEGORIES[category] ?? "that topic";
  return `I can't help with that here. This is a school project, and that request looks like it's about ${what}. If something is worrying you, please talk to a teacher or another trusted adult. I'm happy to help with the project itself.`;
}

/** Extra system-prompt rules for school projects (students are 13 and up). */
export const SCHOOL_RULES = `This is a school project for students aged 13 and up. Keep everything appropriate for school: no sexual content, no graphic violence or gore, no instructions for weapons, drugs, self-harm or anything dangerous or illegal, no hate or harassment, and no help bullying anyone. If a student seems upset, unsafe or mentions self-harm, respond kindly, encourage them to talk to a trusted adult or school counselor, and share the 988 Suicide & Crisis Lifeline (call or text 988 in the US). Images you make must be school-appropriate.`;
