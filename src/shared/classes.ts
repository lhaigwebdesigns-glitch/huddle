import type { ProjectSettings, Receipt } from "./protocol";

/** A teacher's class: students join it with its code. */
export interface ClassInfo {
  id: string;
  code: string;
  name: string;
  createdAt: number;
  students?: number;
  assignments?: number;
}

export interface ClassStudent {
  uid: string;
  name: string;
  joinedAt: number;
}

/** A group's progress, as numbers only: never the chat. */
export interface GroupStatus {
  /** Students in the group who have opened the room. */
  joined: number;
  tasksDone: number;
  tasksTotal: number;
  lastActivity?: number;
  turnedInAt?: number;
  files: number;
}

export interface RubricRow {
  label: string;
  max: number;
}

export interface GradeData {
  rows: RubricRow[];
  /** One score per rubric row. */
  scores: (number | null)[];
  /** uid → a different grade for that student (out of the rubric total), if the teacher set one. */
  students: Record<string, number>;
  comment: string;
  gradedAt?: number;
}

export interface GroupInfo {
  roomCode: string;
  name: string;
  members: string[];
  status?: GroupStatus;
  grade?: GradeData;
}

export interface Assignment {
  id: string;
  title: string;
  project: Pick<ProjectSettings, "instructions" | "rubric" | "ai" | "dueAt" | "pasteGuard" | "reflection">;
  template?: string;
  createdAt: number;
  /** Solo: every student gets their own room. Groups: students share a room. */
  mode: AssignmentMode;
  groupSize: number;
  /** Rooms that exist so far (solo rooms appear when a student first opens the assignment). */
  groups: GroupInfo[];
}

export type AssignmentMode = "solo" | "groups";

/** A group whose room hasn't been made yet (it's made when the first member opens the assignment). */
export const PENDING = "pending-";
export const isPending = (roomCode: string) => roomCode.startsWith(PENDING);

/**
 * Where a student who joined after groups were made should go: the group with the most
 * space that isn't full yet (-1 means start a new group).
 */
export function placeLateJoiner(groups: { members: string[] }[], size: number): number {
  let best = -1;
  groups.forEach((g, i) => {
    if (g.members.length >= size) return;
    if (best < 0 || g.members.length < groups[best].members.length) best = i;
  });
  return best;
}

/** The link a teacher posts to Classroom: every student who opens it lands in their own (or their group's) room. */
export const assignmentPath = (classCode: string, assignmentId: string) => `/c/${classCode}/a/${assignmentId}`;

/** About how many words a number of typed characters is (for the work timeline). */
export const wordsFromChars = (chars: number) => Math.round(chars / 6);

/** Everything the teacher's dashboard needs. */
export interface ClassView {
  class: ClassInfo;
  students: ClassStudent[];
  assignments: Assignment[];
}

/** What the grading screen needs for one group. */
export interface GradingView {
  class: ClassInfo;
  assignment: Assignment;
  group: GroupInfo;
  names: Record<string, string>;
  files: { id: string; title: string; kind: string }[];
  receipt: Receipt | null;
  /** The other groups, for "Next group". */
  order: string[];
}

/** A student's view of a class: just their own assignments and rooms. */
export interface StudentClassView {
  name: string;
  joined: boolean;
  assignments: { id: string; title: string; dueAt?: number; mode: AssignmentMode; roomCode?: string; groupName?: string; turnedIn?: boolean }[];
}

export const CLASS_LIMITS = { name: 80, students: 200, groupSize: 10 } as const;

/**
 * Turns a rubric written as text into rows with points:
 * "Research 40% · Slides 30% · Delivery 30%", "Sources — 20 pts", one row per line…
 * Anything that doesn't parse becomes one "Overall" row out of 100.
 */
export function parseRubric(text: string): RubricRow[] {
  const rows: RubricRow[] = [];
  for (const piece of text.split(/\n|·|•|;|\|/)) {
    const m = piece.trim().match(/^(.*?)[\s:—–-]*\(?(\d+(?:\.\d+)?)\s*(%|pts?\.?|points?|marks?)\)?\.?$/i);
    if (!m) continue;
    const label = m[1].replace(/^[-*\d.)\s]+/, "").trim();
    const max = Number(m[2]);
    if (label && max > 0) rows.push({ label: label.slice(0, 60), max });
  }
  return rows.length ? rows : [{ label: "Overall", max: 100 }];
}

export const rubricMax = (rows: RubricRow[]) => rows.reduce((t, r) => t + r.max, 0);

/** The group's score: the sum of the rows scored so far (null until any row is scored). */
export function gradeTotal(g: Pick<GradeData, "scores">): number | null {
  const scored = g.scores.filter((s): s is number => typeof s === "number");
  return scored.length ? Math.round(scored.reduce((t, s) => t + s, 0) * 100) / 100 : null;
}

/** Shuffles students into groups of about `size`, as even as possible. */
export function makeGroups(uids: string[], size: number, random = Math.random): string[][] {
  const list = [...uids];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  const n = Math.max(1, Math.round(list.length / Math.max(1, size)));
  const groups: string[][] = Array.from({ length: n }, () => []);
  list.forEach((uid, i) => groups[i % n].push(uid));
  return groups;
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote anything with commas, quotes or line breaks, and stop spreadsheets running formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/**
 * Google Classroom's share link: opens Classroom so the teacher can post this link to a
 * class as an assignment, material or announcement. No Google API access needed.
 */
export function classroomShareUrl(url: string, title: string, body?: string): string {
  const q = new URLSearchParams({ url, title: title.slice(0, 120) });
  if (body) q.set("body", body.slice(0, 500));
  return `https://classroom.google.com/share?${q}`;
}
