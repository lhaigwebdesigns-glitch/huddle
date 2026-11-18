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
  };
}

export interface Member {
  uid: string;
  name: string;
  color: string;
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
}

export interface SkillInfo {
  name: string;
  description: string;
}

export type ClientMsg =
  | { t: "say"; text: string }
  | { t: "typing"; on: boolean }
  | { t: "stop" }
  | { t: "settings"; patch: Partial<Omit<RoomSettings, "hostId">> }
  | { t: "new_file"; kind: FileKind; title: string }
  | { t: "rename_file"; id: string; title: string }
  | { t: "delete_file"; id: string }
  | { t: "duplicate_file"; id: string }
  /** Copy a form's responses into a new sheet. */
  | { t: "form_to_sheet"; id: string }
  | { t: "kick"; uid: string }
  | { t: "local_delta"; id: string; delta: string }
  | { t: "local_done"; id: string; error?: string }
  /** Change your own message; the AI re-answers if it was the latest thing it replied to. */
  | { t: "edit"; id: string; text: string }
  /** Replace the latest AI reply with a fresh one. */
  | { t: "regenerate" };

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
    }
  | { t: "presence"; members: Member[] }
  | { t: "msg"; message: ChatMessage }
  | { t: "ai_delta"; id: string; delta: string }
  | { t: "ai_step"; id: string; step: Step }
  | { t: "ai_done"; message: ChatMessage }
  | { t: "settings"; settings: RoomSettings }
  | { t: "files"; files: RoomFile[] }
  | { t: "open_file"; id: string }
  | { t: "local_request"; id: string; model: string; messages: { role: string; content: string }[] }
  | { t: "remove"; ids: string[] }
  /** Room-wide banner, e.g. when the free cloud AI is unavailable. */
  | { t: "notice"; kind: "ai_unavailable"; text: string }
  | { t: "kicked" }
  | { t: "error"; message: string };
