/**
 * First-time setup: teacher or student, a name, and (for teachers) what they teach. Only what
 * Cairn uses is asked: the subject orders the assignment templates and fills the example title.
 */

export const SUBJECTS = [
  { id: "english", label: "English" },
  { id: "science", label: "Science" },
  { id: "math", label: "Math" },
  { id: "social-studies", label: "Social Studies" },
  { id: "other", label: "Something else" },
] as const;
export const GRADES = [
  { id: "6-8", label: "6–8" },
  { id: "9-10", label: "9–10" },
  { id: "11-12", label: "11–12" },
  { id: "college", label: "College" },
] as const;

export type Subject = (typeof SUBJECTS)[number]["id"];
export type Grade = (typeof GRADES)[number]["id"];
export interface Teach {
  subjects: Subject[];
  grades: Grade[];
}

const SUBJECT_IDS = new Set<string>(SUBJECTS.map((s) => s.id));
const GRADE_IDS = new Set<string>(GRADES.map((g) => g.id));

/** Keeps only known subjects and grades; null when nothing valid is left. */
export function cleanTeach(x: unknown): Teach | null {
  if (!x || typeof x !== "object") return null;
  const pick = (v: unknown, ok: Set<string>) => (Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === "string" && ok.has(s)))] : []);
  const subjects = pick((x as Teach).subjects, SUBJECT_IDS) as Subject[];
  const grades = pick((x as Teach).grades, GRADE_IDS) as Grade[];
  return subjects.length || grades.length ? { subjects, grades } : null;
}

export const cleanName = (s: unknown) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").slice(0, 32) : "");

export interface OnboardingRequest {
  role: "teacher" | "student";
  name?: string;
  teach?: Teach;
  /** "I'm 13 or older": required for a new student account. */
  ageOk?: boolean;
}

/**
 * Checks a finished onboarding. `hadRole` = the account was already a student or teacher (a
 * student who joined through a link already confirmed their age and name there).
 */
export function checkOnboarding(b: unknown, hadRole: boolean): { ok: true; value: OnboardingRequest } | { ok: false; error: string } {
  const x = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
  if (x.role !== "teacher" && x.role !== "student") return { ok: false, error: "Pick teacher or student." };
  const out: OnboardingRequest = { role: x.role };
  if (x.name !== undefined) {
    const name = cleanName(x.name);
    if (!name) return { ok: false, error: "Your name can't be empty." };
    out.name = name;
  }
  if (x.role === "student" && !hadRole && x.ageOk !== true) return { ok: false, error: "Cairn is for people 13 and older." };
  if (x.role === "teacher") {
    const teach = cleanTeach(x.teach);
    if (teach) out.teach = teach;
  }
  return { ok: true, value: out };
}

// ---------- tours ----------

export const TOUR_IDS = ["teacher-today", "teacher-class", "teacher-grading", "student-class", "student-room"] as const;
export type TourId = (typeof TOUR_IDS)[number];
/** Stored instead of ids when someone turns tips off. */
export const ALL_TOURS = "*";

const TOUR_SET = new Set<string>([...TOUR_IDS, ALL_TOURS]);

/** Reads the stored list, dropping anything unknown. */
export function parseTours(raw: unknown): string[] {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === "string" && TOUR_SET.has(s)))] : [];
}

/** Marks a tour seen (or all of them). Unknown ids leave the list unchanged. */
export function addTour(list: string[], id: string): string[] {
  if (id === ALL_TOURS) return [ALL_TOURS];
  if (!TOUR_SET.has(id) || list.includes(ALL_TOURS) || list.includes(id)) return list;
  return [...list, id];
}

export const tourSeen = (list: string[], id: TourId) => list.includes(ALL_TOURS) || list.includes(id);

// ---------- using what teachers told us ----------

const TEMPLATE_ORDER: Record<Subject, string[]> = {
  english: ["research-paper", "debate-prep", "presentation"],
  science: ["science-lab", "research-paper", "presentation"],
  math: ["survey-project", "presentation"],
  "social-studies": ["research-paper", "debate-prep", "presentation"],
  other: [],
};

/** Template ids, the ones that fit the teacher's subjects first (stable otherwise). */
export function orderTemplates<T extends { id: string }>(templates: T[], teach: Teach | null | undefined): T[] {
  const first = [...new Set((teach?.subjects ?? []).flatMap((s) => TEMPLATE_ORDER[s] ?? []))];
  const rank = (id: string) => {
    const i = first.indexOf(id);
    return i < 0 ? first.length : i;
  };
  return templates.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t.id) - rank(b.t.id) || a.i - b.i).map((x) => x.t);
}

const EXAMPLE_TITLE: Record<Subject, string> = {
  english: "e.g. Argument essay: Is social media good for teens?",
  science: "e.g. Pendulum lab",
  math: "e.g. How do students get to school? (survey)",
  "social-studies": "e.g. Causes of World War I",
  other: "e.g. Causes of World War I",
};

export const exampleTitle = (teach: Teach | null | undefined) => EXAMPLE_TITLE[teach?.subjects[0] ?? "social-studies"];
