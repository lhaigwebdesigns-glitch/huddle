import * as Y from "yjs";

/**
 * Form storage:
 *   Y.Array "questions": Y.Map { id, type, title, required, options: string[], max }
 *   Y.Map "formMeta":    description, accepting (bool)
 *   Y.Array "responses": { id, at, answers: { [questionId]: string | string[] | number } }
 */
export const QUESTION_TYPES = ["short", "long", "choice", "checkbox", "scale", "date"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const QUESTION_LABEL: Record<QuestionType, string> = {
  short: "Short answer",
  long: "Paragraph",
  choice: "Multiple choice",
  checkbox: "Checkboxes",
  scale: "Linear scale",
  date: "Date",
};

export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  required?: boolean;
  options?: string[];
  max?: number; // scale: 1..max
}

export interface FormResponse {
  id: string;
  at: number;
  answers: Record<string, string | string[] | number>;
}

export interface PublicForm {
  title: string;
  description: string;
  accepting: boolean;
  questions: Question[];
}

export const MAX_RESPONSES = 5000;

export const questionsOf = (doc: Y.Doc) => doc.getArray<Y.Map<any>>("questions");
export const formMetaOf = (doc: Y.Doc) => doc.getMap<any>("formMeta");
export const responsesOf = (doc: Y.Doc) => doc.getArray<FormResponse>("responses");

const hasOptions = (t: QuestionType) => t === "choice" || t === "checkbox";

export function makeQuestion(q: Partial<Question>): Y.Map<any> {
  const m = new Y.Map<any>();
  const type: QuestionType = QUESTION_TYPES.includes(q.type as QuestionType) ? (q.type as QuestionType) : "short";
  m.set("id", q.id ?? Math.random().toString(36).slice(2, 10));
  m.set("type", type);
  m.set("title", String(q.title ?? "").slice(0, 300));
  m.set("required", !!q.required);
  m.set("options", hasOptions(type) ? (q.options?.length ? q.options : ["Option 1", "Option 2"]).map((o) => String(o).slice(0, 120)).slice(0, 20) : []);
  if (type === "scale") m.set("max", Math.max(2, Math.min(10, Math.round(Number(q.max) || 5))));
  return m;
}

export function readQuestion(m: Y.Map<any>): Question {
  return {
    id: m.get("id"),
    type: m.get("type") ?? "short",
    title: m.get("title") ?? "",
    required: !!m.get("required"),
    options: m.get("options") ?? [],
    max: m.get("max") ?? 5,
  };
}

export function publicForm(doc: Y.Doc, title: string): PublicForm {
  const meta = formMetaOf(doc);
  return {
    title,
    description: meta.get("description") ?? "",
    accepting: meta.get("accepting") !== false,
    questions: questionsOf(doc).toArray().map(readQuestion),
  };
}

/** Check and clean a submission. Returns the cleaned answers, or a message for the person filling it in. */
export function validateAnswers(questions: Question[], input: unknown): { ok: true; answers: FormResponse["answers"] } | { ok: false; error: string } {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const answers: FormResponse["answers"] = {};
  for (const q of questions) {
    const v = raw[q.id];
    const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    if (empty) {
      if (q.required) return { ok: false, error: `"${q.title || "Untitled question"}" is required.` };
      continue;
    }
    switch (q.type) {
      case "short":
      case "long":
        answers[q.id] = String(v).slice(0, q.type === "short" ? 500 : 5000);
        break;
      case "choice":
        if (!q.options?.includes(String(v))) return { ok: false, error: `Pick one of the options for "${q.title}".` };
        answers[q.id] = String(v);
        break;
      case "checkbox": {
        const picked = (Array.isArray(v) ? v : [v]).map(String).filter((o) => q.options?.includes(o));
        if (!picked.length && q.required) return { ok: false, error: `"${q.title}" is required.` };
        if (picked.length) answers[q.id] = [...new Set(picked)];
        break;
      }
      case "scale": {
        const n = Math.round(Number(v));
        if (!(n >= 1 && n <= (q.max ?? 5))) return { ok: false, error: `Pick a number from 1 to ${q.max ?? 5} for "${q.title}".` };
        answers[q.id] = n;
        break;
      }
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return { ok: false, error: `Enter a date for "${q.title}".` };
        answers[q.id] = String(v);
        break;
    }
  }
  return { ok: true, answers };
}

export function addResponse(doc: Y.Doc, answers: FormResponse["answers"]): FormResponse {
  const r: FormResponse = { id: Math.random().toString(36).slice(2, 12), at: Date.now(), answers };
  doc.transact(() => {
    const rs = responsesOf(doc);
    rs.push([r]);
    if (rs.length > MAX_RESPONSES) rs.delete(0, rs.length - MAX_RESPONSES);
  }, "submit");
  return r;
}

const show = (v: FormResponse["answers"][string] | undefined) => (v === undefined ? "" : Array.isArray(v) ? v.join("; ") : String(v));

/** Responses as rows (header first): Submitted, then one column per question. */
export function responseRows(doc: Y.Doc): string[][] {
  const qs = questionsOf(doc).toArray().map(readQuestion);
  return [
    ["Submitted", ...qs.map((q) => q.title || "Untitled question")],
    ...responsesOf(doc)
      .toArray()
      .map((r) => [new Date(r.at).toISOString().replace("T", " ").slice(0, 16), ...qs.map((q) => show(r.answers[q.id]))]),
  ];
}

/** Per-question summary for people and for the AI. */
export function summarize(doc: Y.Doc): string {
  const qs = questionsOf(doc).toArray().map(readQuestion);
  const rs = responsesOf(doc).toArray();
  if (!rs.length) return "No responses yet.";
  const lines = [`${rs.length} response${rs.length === 1 ? "" : "s"}.`];
  for (const q of qs) {
    const vals = rs.map((r) => r.answers[q.id]).filter((v) => v !== undefined);
    if (q.type === "choice" || q.type === "checkbox") {
      const counts = new Map<string, number>((q.options ?? []).map((o) => [o, 0]));
      for (const v of vals) for (const o of Array.isArray(v) ? v : [v]) counts.set(String(o), (counts.get(String(o)) ?? 0) + 1);
      lines.push(`${q.title}: ${[...counts].map(([o, n]) => `${o} ${n}`).join(", ")}`);
    } else if (q.type === "scale") {
      const nums = vals.map(Number).filter(Number.isFinite);
      lines.push(`${q.title}: average ${nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : "–"} of ${q.max ?? 5} (${nums.length} answers)`);
    } else {
      lines.push(`${q.title}:\n${vals.slice(-30).map((v) => `  - ${show(v)}`).join("\n")}`);
    }
  }
  return lines.join("\n");
}
