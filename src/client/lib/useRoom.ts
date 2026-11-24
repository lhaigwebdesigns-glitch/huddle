import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import PartySocket from "partysocket";
import type {
  Receipt,
  TaskBoard,
  ChatMessage,
  ClientMsg,
  Member,
  RoomFile,
  RoomSettings,
  ServerMsg,
  SkillInfo,
  Ban,
} from "../../shared/protocol";
import type { Identity } from "./identity";
import { generateLocal, interruptLocal } from "./local-llm";

export interface RoomState {
  status: "connecting" | "open" | "reconnecting" | "closed";
  closeReason?: string;
  /** Why you were sent out, when it was the host: kicked (may rejoin), banned, or room deleted. */
  closeKind?: "kick" | "ban" | "deleted";
  /** Host only: who's banned. */
  bans: Ban[];
  you?: Member;
  members: Member[];
  messages: ChatMessage[];
  settings?: RoomSettings;
  files: RoomFile[];
  skills: SkillInfo[];
  providers: string[];
  openFileId?: string;
  openFileNonce: number;
  /** The ref sent with new_file, echoed back (so an import knows its file). */
  openFileRef?: string;
  toast?: string;
  /** Room banner (e.g. the free cloud AI is unavailable); cleared when dismissed or when Local mode is on. */
  notice?: string;
  /** The latest contribution receipt the server sent (projects). */
  receipt?: Receipt;
  /** Project tasks and roles. */
  board?: TaskBoard;
  /** Facts the AI remembers for this room (when memory is on). */
  memory: string[];
}

type Action =
  | { type: "server"; msg: ServerMsg }
  | { type: "status"; status: RoomState["status"]; reason?: string }
  | { type: "toast"; text?: string }
  | { type: "notice"; text?: string };

function reducer(s: RoomState, a: Action): RoomState {
  if (a.type === "status") return { ...s, status: a.status, closeReason: a.reason ?? s.closeReason };
  if (a.type === "toast") return { ...s, toast: a.text };
  if (a.type === "notice") return { ...s, notice: a.text };
  const m = a.msg;
  switch (m.t) {
    case "init":
      return {
        ...s,
        status: "open",
        you: m.you,
        members: m.members,
        messages: m.messages,
        settings: m.settings,
        files: m.files,
        skills: m.skills,
        providers: m.providers,
        memory: m.memory ?? [],
        board: m.board,
      };
    case "memory":
      return { ...s, memory: m.facts };
    case "tasks":
      return { ...s, board: m.board };
    case "redirect":
      if (m.to.startsWith("/")) window.location.replace(m.to);
      return s;
    case "presence":
      return { ...s, members: m.members };
    case "msg":
      // Edits replace the message in place; new messages go at the end.
      return s.messages.some((x) => x.id === m.message.id)
        ? { ...s, messages: s.messages.map((x) => (x.id === m.message.id ? m.message : x)) }
        : { ...s, messages: [...s.messages, m.message] };
    case "remove":
      return { ...s, messages: s.messages.filter((x) => !m.ids.includes(x.id)) };
    case "notice":
      return { ...s, notice: m.text };
    case "ai_delta":
      return {
        ...s,
        messages: s.messages.map((x) => (x.id === m.id ? { ...x, content: x.content + m.delta } : x)),
      };
    case "ai_step":
      return {
        ...s,
        messages: s.messages.map((x) =>
          x.id === m.id ? { ...x, meta: { ...x.meta, steps: [...(x.meta?.steps ?? []), m.step] } } : x,
        ),
      };
    case "ai_done":
      return { ...s, messages: s.messages.map((x) => (x.id === m.message.id ? m.message : x)) };
    case "settings":
      return { ...s, settings: m.settings, notice: m.settings.engine === "local" ? undefined : s.notice };
    case "files":
      return { ...s, files: m.files };
    case "open_file":
      return { ...s, openFileId: m.id, openFileNonce: s.openFileNonce + 1, openFileRef: m.ref };
    case "kicked":
      return {
        ...s,
        status: "closed",
        closeKind: m.reason ?? "ban",
        closeReason:
          m.reason === "deleted"
            ? "The host deleted this room."
            : m.reason === "kick"
              ? "The host removed you from this room."
              : "The host banned you from this room.",
      };
    case "receipt":
      return { ...s, receipt: m.receipt };
    case "bans":
      return { ...s, bans: m.bans };
    case "error":
      return { ...s, toast: m.message };
    default:
      return s;
  }
}

export function useRoom(code: string, me: Identity) {
  const [state, dispatch] = useReducer(reducer, {
    status: "connecting",
    members: [],
    messages: [],
    files: [],
    skills: [],
    providers: [],
    openFileNonce: 0,
    memory: [],
    bans: [],
  });
  const [localProgress, setLocalProgress] = useState<{ text: string; pct: number } | null>(null);
  const sock = useRef<PartySocket | null>(null);

  useEffect(() => {
    const ws = new PartySocket({
      host: location.host,
      party: "room",
      room: code,
      query: { uid: me.uid, name: me.name, color: me.color, ...(me.avatar ? { avatar: me.avatar } : {}) },
    });
    sock.current = ws;
    let opened = false;
    ws.addEventListener("open", () => {
      opened = true;
    });
    ws.addEventListener("message", async (e) => {
      const msg = JSON.parse(e.data) as ServerMsg;
      if (msg.t === "local_request") {
        // We're the host and the room is in Local mode: run the model on this device.
        try {
          await generateLocal(
            msg.model,
            msg.messages,
            (delta) => ws.send(JSON.stringify({ t: "local_delta", id: msg.id, delta } satisfies ClientMsg)),
            (text, pct) => setLocalProgress(pct >= 1 ? null : { text, pct }),
          );
          ws.send(JSON.stringify({ t: "local_done", id: msg.id } satisfies ClientMsg));
        } catch (err) {
          setLocalProgress(null);
          ws.send(
            JSON.stringify({
              t: "local_done",
              id: msg.id,
              error: `Local model failed on the host's device: ${String(err).slice(0, 200)}`,
            } satisfies ClientMsg),
          );
        }
        return;
      }
      dispatch({ type: "server", msg });
    });
    ws.addEventListener("close", (e: CloseEvent) => {
      if (e.code >= 4000) {
        ws.close();
        dispatch({ type: "status", status: "closed", reason: e.reason || "Disconnected" });
      } else dispatch({ type: "status", status: opened ? "reconnecting" : "connecting" });
    });
    return () => ws.close();
  }, [code, me.uid, me.name, me.color, me.avatar]);

  const send = useCallback((m: ClientMsg) => {
    if (m.t === "stop") interruptLocal();
    sock.current?.send(JSON.stringify(m));
  }, []);

  const clearToast = useCallback(() => dispatch({ type: "toast" }), []);
  const showToast = useCallback((text: string) => dispatch({ type: "toast", text }), []);
  const dismissNotice = useCallback(() => dispatch({ type: "notice" }), []);

  return { state, send, localProgress, clearToast, showToast, dismissNotice };
}
