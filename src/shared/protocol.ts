// Messages exchanged over the room WebSocket.

export type Role = "user" | "assistant" | "system";

export interface Source {
  title: string;
  url: string;
}

export interface Step {
  kind: "search" | "fetch" | "skill" | "doc" | "other";
  label: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: number;
  meta?: {
    model?: string;
    steps?: Step[];
    sources?: Source[];
    streaming?: boolean;
    error?: boolean;
    /** The author changed this message after sending it. */
    edited?: boolean;
    /** emoji -> uids who reacted */
    reactions?: Record<string, string[]>;
    poll?: Poll;
    attachments?: Attachment[];
    /** AI-generated images (stored like uploads). */
    images?: Attachment[];
  };
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  /** Same-origin URL to view/download it. */
  url: string;
  /** Its text was indexed for search_knowledge (PDF, CSV, text). */
  indexed?: boolean;
}

export interface Poll {
  question: string;
  options: string[];
  /** option index (as string) -> uids */
  votes: Record<string, string[]>;
}

export const REACTIONS = ["👍", "❤️", "😂", "🎉", "🤔", "👀"] as const;

/** Someone who has been in the room (for the host's Manage party list). */
export interface PartyPerson {
  uid: string;
  name: string;
  color: string;
  lastSeen: number;
  online?: boolean;
  isHost?: boolean;
}
export interface Ban {
  uid: string;
  name: string;
  at: number;
}
export type ModerationAction = "kick" | "ban" | "unban";

/** Profile pictures rooms will show: ones uploaded to Cairn, or Google/GitHub's. */
export const AVATAR_URL_RE =
  /^(\/api\/avatars\/[\w-]{6,32}\/[a-z0-9]{1,16}|https:\/\/(lh\d\.googleusercontent\.com|avatars\.githubusercontent\.com)\/[\w\-./?=&%]{1,400})$/;

export interface Member {
  uid: string;
  name: string;
  color: string;
  /** Profile picture URL (signed-in people who have one). */
  avatar?: string;
  isHost: boolean;
  typing?: boolean;
}

import type { FileKind } from "./files";
export type { FileKind } from "./files";

export interface RoomFile {
  id: string;
  kind: FileKind;
  title: string;
  createdAt: number;
  createdBy: string;
}

export interface FileVersion {
  at: number;
  /** Approximate size of the snapshot in bytes. */
  size: number;
}

export type AiMode = "mention" | "always";

export interface RoomSettings {
  hostId: string;
  aiMode: AiMode;
  /** "auto" = best free hosted model, "local" = run on the host's device (WebLLM). */
  engine: "auto" | "local";
  localModel: string;
  locked: boolean;
  disabledSkills: string[];
  title: string;
  /** Deep Research: more tool steps, multiple searches, and a cited doc at the end. */
  deepResearch?: boolean;
  /** Room memory: the AI may save facts (with the remember tool) that it sees in every turn. */
  memory?: boolean;
  /** Custom assistant: a name and standing instructions from the host. */
  assistant?: AssistantProfile;
  /** Set when the room is a school project: the teacher (host) sets its rules. */
  project?: ProjectSettings;
  /** Set when the room is a group's room in a teacher's class. */
  /** classCode: the class page students get back to (rooms made before it was added have none). */
  classLink?: { classId: string; assignmentId: string; group: string; classCode?: string };
  /**
   * Set when the room is an assignment's worksheet: only the teacher comes in. Every file in it
   * except the answer key is copied into each student's (or group's) room when they first open it.
   */
  worksheet?: { classId: string; assignmentId: string; keyId?: string };
}

/** What the AI may do in a project: nothing, coach only, or full help. */
import { cleanSchedule, type AccessOverride, type AccessState, type Schedule } from "./schedule";

export type AiSetting = "off" | "tutor" | "full";

export interface ProjectSettings {
  instructions: string;
  rubric: string;
  dueAt?: number;
  ai: AiSetting;
  /** Block pasting text that wasn't copied inside Cairn (AI off / tutor projects). */
  pasteGuard: boolean;
  /** People allowed to paste anyway (dictation and other accessibility tools). */
  pasteExempt: string[];
  turnedInAt?: number;
  turnedInBy?: string;
  /** When the teacher graded the turned-in work. After that, students can't unsubmit. */
  gradedAt?: number;
  /** Asked at turn in ("What was hardest?"); the student's answer is their receipt note. */
  reflection?: string;
  /** When students may work on it (e.g. class time only); none = any time. */
  schedule?: Schedule;
  /** This room's exceptions from the teacher: extra time now, or its own due date. Server-set. */
  access?: AccessOverride;
  /** Open or closed right now, worked out by the server. */
  status?: AccessState;
}

export const PROJECT_LIMITS = { instructions: 6000, rubric: 4000, exempt: 100 } as const;

/** Check and clamp a project patch from a client. Returns the merged project, or undefined to clear it. */
export function cleanProject(patch: unknown, prev?: ProjectSettings): ProjectSettings | undefined {
  if (patch === null) return undefined;
  if (!patch || typeof patch !== "object") return prev;
  const p = patch as Partial<ProjectSettings>;
  const base: ProjectSettings = prev ?? { instructions: "", rubric: "", ai: "full", pasteGuard: false, pasteExempt: [] };
  const next: ProjectSettings = { ...base };
  if (typeof p.instructions === "string") next.instructions = p.instructions.slice(0, PROJECT_LIMITS.instructions);
  if (typeof p.rubric === "string") next.rubric = p.rubric.slice(0, PROJECT_LIMITS.rubric);
  if (p.dueAt === null || p.dueAt === undefined) {
    if ("dueAt" in p) delete next.dueAt;
  } else if (typeof p.dueAt === "number" && Number.isFinite(p.dueAt) && p.dueAt > 0) next.dueAt = Math.round(p.dueAt);
  if (p.ai === "off" || p.ai === "tutor" || p.ai === "full") next.ai = p.ai;
  if ("schedule" in p) {
    const sch = cleanSchedule(p.schedule);
    if (sch) next.schedule = sch;
    else delete next.schedule;
  }
  if (typeof p.reflection === "string") {
    const q = p.reflection.trim().slice(0, 300);
    if (q) next.reflection = q;
    else delete next.reflection;
  }
  if (typeof p.pasteGuard === "boolean") next.pasteGuard = p.pasteGuard;
  if (Array.isArray(p.pasteExempt))
    next.pasteExempt = [...new Set(p.pasteExempt.map(String).map((s) => s.slice(0, 64)))].slice(0, PROJECT_LIMITS.exempt);
  // Paste blocking only makes sense when the AI can't write the work.
  if (next.ai === "full") next.pasteGuard = false;
  return next;
}

export interface AssistantProfile {
  name: string;
  instructions: string;
}

export interface SkillInfo {
  name: string;
  description: string;
}

/** A piece of the project's work, owned by one person. */
export interface Task {
  id: string;
  title: string;
  ownerUid?: string;
  dueAt?: number;
  done: boolean;
  doneAt?: number;
  createdBy: string;
  createdAt: number;
}

/** Tasks plus each person's role ("Researcher", "Designer"…). */
export interface TaskBoard {
  tasks: Task[];
  /** uid → role */
  roles: Record<string, string>;
  /** uid → name for everyone in the group (sent by the server; not stored). */
  people?: Record<string, string>;
}

/** A message a student sent to the teacher with the Report button. */
export interface Report {
  id: string;
  at: number;
  byUid: string;
  byName: string;
  reason: string;
  message: { authorName: string; content: string; createdAt: number; fromAi: boolean };
}

export const TASK_LIMITS = { tasks: 60, title: 140, role: 30 } as const;

/** One person's part of a project, as the group and the teacher see it. */
export interface ReceiptPerson {
  uid: string;
  name: string;
  /** Words they wrote that are still in the files (docs, slides, forms…). */
  words: number;
  /** Slides, cells, questions and shapes they made that are still there, by file kind. */
  units: Partial<Record<FileKind, number>>;
  filesCreated: number;
  messages: number;
  /** Days they worked on the project (edited a file or chatted). */
  daysActive: number;
  /** Times they asked the AI to make or change files (full-help projects). */
  aiAsks: number;
  /**
   * Where they got stuck: a few short points about what they asked the tutor, written when the
   * work is turned in. The student sees exactly what the teacher sees.
   */
  stuck?: string[];
  /** How many questions they asked the tutor. */
  tutorQuestions?: number;
  note?: string;
  role?: string;
  /** Titles of the tasks they own, and which are done. */
  tasks?: { title: string; done: boolean }[];
}
export interface ReceiptFile {
  id: string;
  title: string;
  kind: FileKind;
  /** uid (or "ai") → what they have in this file now. */
  shares: Record<string, { words: number; units: number }>;
}
export interface ReceiptDay {
  day: string;
  /** uid → which files they worked on that day, and how many chat messages they sent. */
  /** words: about how many words they added that day; pastes: large pastes (time, about how many words). */
  people: Record<string, { files: string[]; messages: number; words?: number; pastes?: { at: number; words: number }[] }>;
}
export interface Receipt {
  title: string;
  generatedAt: number;
  /** Frozen when the project was turned in. */
  final: boolean;
  turnedInAt?: number;
  people: ReceiptPerson[];
  files: ReceiptFile[];
  days: ReceiptDay[];
  /** Words written by Cairn AI that are still in the files. */
  aiWords: number;
  aiUnits: number;
  /** Set once Cairn has tried to write "what they asked the tutor about" (after turn-in). */
  tutorSummaryDone?: boolean;
}

export type ClientMsg =
  /** Ask for the project's contribution receipt (answered with { t: "receipt" }). */
  | { t: "receipt" }
  /** Your own note on the receipt ("I did the research at the library"). */
  | { t: "receipt_note"; text: string }
  /** Project tasks: anyone in the group can add, assign, finish or remove them. */
  | { t: "task_add"; title: string; ownerUid?: string; dueAt?: number }
  | { t: "task_update"; id: string; title?: string; ownerUid?: string | null; dueAt?: number | null; done?: boolean }
  | { t: "task_delete"; id: string }
  /** Set your own role in the group ("" clears it). */
  | { t: "set_role"; role: string }
  /** Class rooms: send one message to the teacher, with a reason. */
  | { t: "report"; id: string; reason: string }
  /** Ask the teacher for more time: open it now for an hour, or move the due date. */
  | { t: "time_request"; kind: "open" | "extend"; days?: number; reason: string }
  | { t: "say"; text: string; attachments?: Attachment[] }
  /** Turn an uploaded CSV into a live sheet. */
  | { t: "import_csv"; title: string; csv: string }
  | { t: "typing"; on: boolean }
  | { t: "stop" }
  | { t: "settings"; patch: Partial<Omit<RoomSettings, "hostId" | "project">> & { project?: Partial<ProjectSettings> | null } }
  /** Lock the project's files as the submitted version (anyone); the host can reopen. */
  | { t: "turn_in" }
  | { t: "reopen" }
  /** Take back a turn-in (anyone in the group), until it's graded and while the work is open. */
  | { t: "unsubmit" }
  /** `ref` comes back on the open_file reply, so the sender knows which file is theirs (imports). */
  | { t: "new_file"; kind: FileKind; title: string; ref?: string }
  | { t: "rename_file"; id: string; title: string }
  | { t: "delete_file"; id: string }
  | { t: "duplicate_file"; id: string }
  /** Copy a form's responses into a new sheet. */
  | { t: "form_to_sheet"; id: string }
  /** Host only: remove now (can rejoin), ban (blocked), or lift a ban. */
  | { t: "kick"; uid: string }
  | { t: "ban"; uid: string }
  | { t: "unban"; uid: string }
  | { t: "local_delta"; id: string; delta: string }
  | { t: "local_done"; id: string; error?: string }
  /** Change your own message; the AI re-answers if it was the latest thing it replied to. */
  | { t: "edit"; id: string; text: string }
  /** Replace the latest AI reply with a fresh one. */
  | { t: "regenerate" }
  /** Toggle your reaction on a message. */
  | { t: "react"; id: string; emoji: string }
  | { t: "poll"; question: string; options: string[] }
  | { t: "vote"; id: string; option: number }
  /** Remove a remembered fact (anyone in the room; the list is visible in settings). */
  | { t: "forget"; index: number };

export type ServerMsg =
  | {
      t: "init";
      you: Member;
      members: Member[];
      messages: ChatMessage[];
      settings: RoomSettings;
      files: RoomFile[];
      skills: SkillInfo[];
      providers: string[];
      memory: string[];
      /** Project tasks and roles (projects only). */
      board?: TaskBoard;
    }
  | { t: "presence"; members: Member[] }
  | { t: "msg"; message: ChatMessage }
  | { t: "ai_delta"; id: string; delta: string }
  | { t: "ai_step"; id: string; step: Step }
  | { t: "ai_done"; message: ChatMessage }
  | { t: "settings"; settings: RoomSettings }
  | { t: "files"; files: RoomFile[] }
  | { t: "open_file"; id: string; ref?: string }
  | { t: "local_request"; id: string; model: string; messages: { role: string; content: string }[] }
  | { t: "remove"; ids: string[] }
  | { t: "memory"; facts: string[] }
  /** Room-wide banner, e.g. when the free cloud AI is unavailable. */
  | { t: "notice"; kind: "ai_unavailable"; text: string }
  /** You were removed: kicked (may rejoin), banned, or the host deleted the room. */
  | { t: "kicked"; reason?: "kick" | "ban" | "deleted" }
  /** Host only: the banned list. */
  | { t: "bans"; bans: Ban[] }
  | { t: "receipt"; receipt: Receipt }
  | { t: "tasks"; board: TaskBoard }
  /** Go somewhere else instead (a teacher opening a group's room goes to grading). */
  | { t: "redirect"; to: string }
  /**
   * You can't come in (sent just before the room closes your connection). The close itself can
   * get lost on the way while the connection is still opening, so the page goes by this.
   */
  | { t: "refused"; reason: string }
  | { t: "error"; message: string };
