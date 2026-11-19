import { getServerByName, Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import type { Env } from "./env";
import {
  REACTIONS,
  type ChatMessage,
  type ClientMsg,
  type Member,
  type RoomFile,
  type RoomSettings,
  type ServerMsg,
  type Source,
  type Step,
} from "../shared/protocol";
import { availableProviders, chatWithFallback, ProviderError, type LlmMessage, type ToolCall } from "./ai/providers";
import { claimsImage, compactDocArgs, wantsImage, wantsResearch, withFreshNote } from "./ai/turn";
import { aiTurnsToday, countAiTurn } from "./db";
import { FILE_INFO, isFileKind, type FileKind } from "../shared/files";
import { colName } from "../shared/formula";
import { chunkText, ftsQuery } from "../shared/knowledge";
import { parseCsv } from "../shared/sheet-model";
import { AVATAR_URL_RE, type Attachment, type Ban, type ModerationAction, type PartyPerson } from "../shared/protocol";
import { deleteBlob } from "./blobs";
import { bump, bumpLater, markActive } from "./stats";
import { SKILLS } from "./ai/skills";
import { runTool, TOOL_DEFS } from "./ai/tools";
import { collectUrls, stripUnverifiedLinks } from "./ai/citations";
import { getProviders as getProvidersConfigured } from "./ai/models";
import { aiEnv } from "./ai/pc";

const MAX_FILES = 100;

/** One line per file type the AI can create, for the system prompt. */
const FILE_GUIDE = [
  `- doc (create_doc/read_doc/edit_doc): writing, plans, reports, essays, notes. edit_doc mode "append" adds a section.`,
  `- sheet (create_sheet/read_sheet/edit_sheet): tables, budgets, trackers, numbers. Use formulas (=SUM, =AVERAGE, =IF…) for totals and add a chart when it helps.`,
  `- slides (create_slides/read_slides/edit_slides): presentations and pitches. 5–10 slides, short bullets (max ~6 words each), speaker notes for detail; load the slide-deck-design skill first.`,
  `- artifact (make_artifact/read_artifact): interactive things to look at or use: mini apps, calculators, games, quizzes, data visualizations, page mockups. One self-contained HTML file; it renders live beside the chat.`,
  `- form (create_form/read_form_responses): sign-ups, surveys, RSVPs, quizzes, feedback. It gets a public link anyone can fill in; summarize responses on request.`,
  `- whiteboard (draw_whiteboard/read_whiteboard): diagrams, flows, mind maps, architectures, timelines, drawn from Mermaid (flowchart/sequenceDiagram/classDiagram). People can then rearrange the shapes.`,
];

interface ConnState {
  uid: string;
  name: string;
  color: string;
  avatar?: string;
  typing?: boolean;
}

const MAX_ROOM_SIZE = 12;
const MAX_STEPS = 6;
/** Deep Research mode: room for several searches and page reads before writing. */
const DEEP_RESEARCH_STEPS = 15;
const MAX_MEMORY_FACTS = 50;

/**
 * Before a doc is written, unlink any URL the model didn't actually see in a tool result or a
 * message, so a doc's Sources list never links to an invented page.
 */
function unlinkInventedUrls(call: ToolCall, llm: LlmMessage[], sources: Source[]) {
  if (!/^(create|edit)_doc$/.test(call.function.name)) return;
  try {
    const args = JSON.parse(call.function.arguments);
    if (typeof args.markdown !== "string") return;
    const allowed = collectUrls([...llm.filter((m) => m.role !== "system").map((m) => m.content), ...sources.map((x) => x.url)]);
    const { text, removed } = stripUnverifiedLinks(args.markdown, allowed);
    if (!removed.length) return;
    console.warn(`unlinked ${removed.length} unverified URL(s) in ${call.function.name}`, removed);
    call.function.arguments = JSON.stringify({ ...args, markdown: text });
  } catch {
    // malformed arguments: the tool reports that itself
  }
}
const HISTORY_FOR_AI = 30;
const USER_AI_PER_HOUR = 40;

/**
 * One Durable Object per party code. It is the single source of truth for the room:
 * who's here, the chat log, the file list, and the AI's turns (streamed to everyone).
 */
export class Room extends Server<Env> {
  static options = { hibernate: true };

  private settings: RoomSettings | null = null;
  private aiBusy = false;
  private aiPending = false;
  private abort: AbortController | null = null;
  private streaming: ChatMessage | null = null;
  private localWaiter: { id: string; resolve: (err?: string) => void } | null = null;
  private userHits = new Map<string, number[]>();

  async onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, role TEXT, author_id TEXT, author_name TEXT,
      content TEXT, created_at INTEGER, meta TEXT)`;
    this.sql`CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY, kind TEXT, title TEXT, created_at INTEGER, created_by TEXT)`;
    this.settings = (await this.ctx.storage.get<RoomSettings>("settings")) ?? null;
    // Uploaded text, searchable by the AI. FTS5 when available, plain LIKE otherwise.
    try {
      this.sql`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge USING fts5(name, chunk, upload_id UNINDEXED)`;
      this.fts = true;
    } catch {
      this.sql`CREATE TABLE IF NOT EXISTS knowledge (name TEXT, chunk TEXT, upload_id TEXT)`;
      this.fts = false;
    }
  }

  private fts = true;

  // ---------- RPC: knowledge (uploads) ----------

  async exists() {
    return !!this.settings;
  }

  /** A read-only snapshot of the chat for a public share link (host only). */
  async shareSnapshot(uid: string) {
    if (!this.settings || uid !== this.settings.hostId) return null;
    const messages = this.loadMessages(300)
      .filter((m) => !m.meta?.streaming)
      .map((m) => ({
        role: m.role,
        authorName: m.authorName,
        content: m.content,
        createdAt: m.createdAt,
        sources: m.meta?.sources,
        poll: m.meta?.poll ? { question: m.meta.poll.question, options: m.meta.poll.options } : undefined,
      }));
    return { title: this.settings.title, messages };
  }

  async indexText(uploadId: string, name: string, text: string) {
    const chunks = chunkText(text);
    for (const c of chunks) this.sql`INSERT INTO knowledge (name, chunk, upload_id) VALUES (${name}, ${c}, ${uploadId})`;
    return chunks.length;
  }

  async searchKnowledge(q: string): Promise<{ name: string; chunk: string }[]> {
    const query = ftsQuery(q);
    if (!query) return [];
    if (this.fts) {
      try {
        return this.sql<{ name: string; chunk: string }>`SELECT name, chunk FROM knowledge WHERE knowledge MATCH ${query} ORDER BY bm25(knowledge) LIMIT 6`;
      } catch (e) {
        console.warn("fts search failed", e);
      }
    }
    const word = `%${query.split(" OR ")[0].replace(/"/g, "")}%`;
    return this.sql<{ name: string; chunk: string }>`SELECT name, chunk FROM knowledge WHERE chunk LIKE ${word} LIMIT 6`;
  }

  async knowledgeSources() {
    return this.sql<{ name: string; n: number }>`SELECT name, COUNT(*) AS n FROM knowledge GROUP BY name`;
  }

  // ---------- RPC (called from the HTTP API) ----------

  async init(hostId: string, title: string) {
    if (this.settings) return { ok: false as const };
    this.settings = {
      hostId,
      title: title.slice(0, 80) || "Untitled room",
      aiMode: "always",
      engine: "auto",
      localModel: "Qwen3-4B-q4f16_1-MLC",
      locked: false,
      disabledSkills: [],
    };
    await this.ctx.storage.put("settings", this.settings);
    return { ok: true as const };
  }

  async info() {
    if (!this.settings) return { exists: false as const };
    return {
      exists: true as const,
      title: this.settings.title,
      locked: this.settings.locked,
      members: this.members().length,
    };
  }

  /** Version history for one of this room's files. */
  async fileVersions(fileId: string) {
    const f = this.files().find((x) => x.id === fileId);
    if (!f) return null;
    const stub = await getServerByName(this.env.Doc, `${this.name}--${f.id}`);
    return stub.listVersions();
  }

  async saveFileVersion(fileId: string) {
    const f = this.files().find((x) => x.id === fileId);
    if (!f) return { ok: false };
    const stub = await getServerByName(this.env.Doc, `${this.name}--${f.id}`);
    return stub.saveVersion();
  }

  async restoreFileVersion(fileId: string, at: number) {
    const f = this.files().find((x) => x.id === fileId);
    if (!f) return { ok: false, error: "No such file" };
    const stub = await getServerByName(this.env.Doc, `${this.name}--${f.id}`);
    return stub.restoreVersion(at, f.kind);
  }

  /** Public view of a form (questions only, never responses). */
  async publicForm(fileId: string) {
    const f = this.files().find((x) => x.id === fileId && x.kind === "form");
    if (!f) return null;
    return (await getServerByName(this.env.Doc, `${this.name}--${f.id}`)).getPublicForm(f.title);
  }

  async submitForm(fileId: string, answers: unknown) {
    const f = this.files().find((x) => x.id === fileId && x.kind === "form");
    if (!f) return { ok: false as const, error: "This form doesn't exist anymore." };
    return (await getServerByName(this.env.Doc, `${this.name}--${f.id}`)).submitForm(f.title, answers);
  }

  // ---------- RPC: Manage party (host only) ----------

  async isHost(uid: string) {
    return !!this.settings && uid === this.settings.hostId;
  }

  /** Everyone who has been here, who's online now, and who's banned. */
  async manageState(uid: string) {
    if (!(await this.isHost(uid))) return null;
    const online = new Set(this.members().map((m) => m.uid));
    const people = Object.entries((await this.ctx.storage.get<Record<string, Omit<PartyPerson, "uid">>>("people")) ?? {})
      .map(([id, p]) => ({ uid: id, ...p, online: online.has(id), isHost: id === this.settings!.hostId }))
      .sort((a, b) => Number(b.online) - Number(a.online) || b.lastSeen - a.lastSeen)
      .slice(0, 200);
    return { title: this.settings!.title, people, bans: await this.bans() };
  }

  /** Kick (can rejoin with the code), ban (blocked from rejoining) or unban. Host only. */
  async moderate(byUid: string, action: ModerationAction, target: string) {
    if (!this.settings || byUid !== this.settings.hostId || !target || target === this.settings.hostId) return { ok: false };
    const bans = await this.bans();
    if (action === "unban") {
      await this.ctx.storage.put("bans", bans.filter((b) => b.uid !== target));
    } else {
      if (action === "ban" && !bans.some((b) => b.uid === target)) {
        const people = (await this.ctx.storage.get<Record<string, { name: string }>>("people")) ?? {};
        bans.push({ uid: target, name: people[target]?.name ?? "Guest", at: Date.now() });
        await this.ctx.storage.put("bans", bans.slice(-500));
      }
      for (const c of this.getConnections<ConnState>()) {
        if (c.state?.uid !== target) continue;
        this.send(c, { t: "kicked", reason: action });
        c.close(4003, action === "ban" ? "The host banned you from this room." : "The host removed you from this room.");
      }
      this.broadcastPresence();
    }
    const now = await this.bans();
    for (const c of this.getConnections<ConnState>()) if (c.state?.uid === this.settings.hostId) this.send(c, { t: "bans", bans: now });
    return { ok: true };
  }

  /**
   * Delete the room for good (host only): everyone inside is sent out, then every file,
   * upload and message is erased. Returns false if `uid` isn't the host.
   */
  async destroy(uid: string) {
    if (!(await this.isHost(uid))) return false;
    for (const c of this.getConnections<ConnState>()) {
      this.send(c, { t: "kicked", reason: "deleted" });
      c.close(4003, "The host deleted this room.");
    }
    this.abort?.abort();
    const files = this.files();
    const uploads = new Set<string>();
    const re = new RegExp(`/api/rooms/${this.name}/blobs/([a-z0-9]{16})`, "g");
    for (const r of this.sql<{ content: string; meta: string | null }>`SELECT content, meta FROM messages`)
      for (const m of `${r.content} ${r.meta ?? ""}`.matchAll(re)) uploads.add(m[1]);
    await Promise.all([
      ...files.map((f) => getServerByName(this.env.Doc, `${this.name}--${f.id}`).then((s) => s.wipe()).catch(() => {})),
      ...[...uploads].map((id) => deleteBlob(this.env, `rooms/${this.name}/${id}`).catch(() => {})),
    ]);
    await this.ctx.storage.deleteAll();
    this.settings = null;
    return true;
  }

  private async bans(): Promise<Ban[]> {
    let bans = await this.ctx.storage.get<Ban[]>("bans");
    if (!bans) {
      // Rooms from before kick/ban were split: their "kicked" list was really a ban list.
      const old = (await this.ctx.storage.get<string[]>("kicked")) ?? [];
      bans = old.map((uid) => ({ uid, name: "Guest", at: 0 }));
      await this.ctx.storage.put("bans", bans);
    }
    return bans;
  }

  private async rememberPerson(uid: string, name: string, color: string) {
    const people = (await this.ctx.storage.get<Record<string, Omit<PartyPerson, "uid">>>("people")) ?? {};
    people[uid] = { name, color, lastSeen: Date.now() };
    const ids = Object.keys(people);
    if (ids.length > 500) for (const id of ids.sort((a, b) => people[a].lastSeen - people[b].lastSeen).slice(0, ids.length - 500)) delete people[id];
    await this.ctx.storage.put("people", people);
  }

  // ---------- connections ----------

  async onConnect(conn: Connection<ConnState>, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url);
    const uid = (url.searchParams.get("uid") ?? "").slice(0, 64);
    const name = (url.searchParams.get("name") ?? "Guest").trim().slice(0, 32) || "Guest";
    const color = /^#[0-9a-f]{6}$/i.test(url.searchParams.get("color") ?? "")
      ? url.searchParams.get("color")!
      : "#6366f1";

    if (!this.settings) return conn.close(4004, "Room not found");
    if (!uid) return conn.close(4000, "Missing user id");
    if ((await this.bans()).some((b) => b.uid === uid)) return conn.close(4003, "The host banned you from this room.");
    const known = (await this.ctx.storage.get<string[]>("members")) ?? [];
    if (this.settings.locked && uid !== this.settings.hostId && !known.includes(uid))
      return conn.close(4003, "This room is locked");
    if (this.members().filter((m) => m.uid !== uid).length >= MAX_ROOM_SIZE)
      return conn.close(4001, "Room is full");
    if (!known.includes(uid)) await this.ctx.storage.put("members", [...known, uid].slice(-500));
    await this.rememberPerson(uid, name, color);

    const avatarParam = (url.searchParams.get("avatar") ?? "").slice(0, 500);
    const avatar = AVATAR_URL_RE.test(avatarParam) ? avatarParam : undefined;
    conn.setState({ uid, name, color, avatar });
    this.ctx.waitUntil(markActive(this.env, uid));
    bumpLater(this.env, "joins", 1, (p) => this.ctx.waitUntil(p));
    const messages = this.loadMessages(200);
    if (this.streaming) messages.push(this.streaming);
    this.send(conn, {
      t: "init",
      you: this.toMember(conn.state!),
      members: this.members(),
      messages,
      settings: this.settings,
      files: this.files(),
      skills: SKILLS.map(({ name, description }) => ({ name, description })),
      providers: availableProviders(this.env).map((p) => `${p.label} · ${p.model}`),
      memory: (await this.ctx.storage.get<string[]>("memory")) ?? [],
    });
    if (uid === this.settings.hostId) this.send(conn, { t: "bans", bans: await this.bans() });
    this.broadcastPresence();
  }

  onClose(conn: Connection<ConnState>) {
    // If the local-mode host leaves mid-answer, fail that turn gracefully.
    if (this.localWaiter && conn.state?.uid === this.settings?.hostId)
      this.localWaiter.resolve("The host disconnected while generating.");
    this.broadcastPresence();
  }

  async onMessage(conn: Connection<ConnState>, raw: WSMessage) {
    if (typeof raw !== "string" || !conn.state || !this.settings) return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const me = conn.state;
    const isHost = me.uid === this.settings.hostId;

    switch (msg.t) {
      case "say": {
        const text = String(msg.text ?? "").trim().slice(0, 8000);
        // Only accept attachments that point at this room's own uploads.
        const attachments: Attachment[] = (Array.isArray(msg.attachments) ? msg.attachments : [])
          .filter((a) => a && typeof a.url === "string" && a.url.startsWith(`/api/rooms/${this.name}/blobs/`))
          .slice(0, 10)
          .map((a) => ({ id: String(a.id).slice(0, 40), name: String(a.name).slice(0, 120), type: String(a.type).slice(0, 60), size: Number(a.size) || 0, url: a.url, indexed: !!a.indexed }));
        if (!text && !attachments.length) return;
        const m: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          authorId: me.uid,
          authorName: me.name,
          content: text,
          createdAt: Date.now(),
          ...(attachments.length ? { meta: { attachments } } : {}),
        };
        this.saveMessage(m);
        this.broadcastMsg({ t: "msg", message: m });
        const wait = (p: Promise<unknown>) => this.ctx.waitUntil(p);
        bumpLater(this.env, "messages", 1, wait);
        bumpLater(this.env, `msg_h${String(new Date().getUTCHours()).padStart(2, "0")}`, 1, wait);
        if (me.typing) {
          conn.setState({ ...me, typing: false });
          this.broadcastPresence();
        }
        const wantsAi = this.settings.aiMode === "always" || /@ai\b/i.test(text);
        if (wantsAi) {
          if (!this.allowAi(me.uid)) {
            this.send(conn, { t: "error", message: "You've hit the hourly AI limit for the free beta. Try again soon." });
            return;
          }
          this.queueAi();
        }
        return;
      }
      case "typing":
        conn.setState({ ...me, typing: !!msg.on });
        this.broadcastPresence();
        return;
      case "stop":
        this.abort?.abort();
        this.localWaiter?.resolve("Stopped.");
        return;
      case "edit": {
        const text = String(msg.text ?? "").trim().slice(0, 8000);
        const recent = this.loadMessages(200);
        const idx = recent.findIndex((m) => m.id === msg.id);
        const original = recent[idx];
        if (!text || !original || original.role !== "user" || original.authorId !== me.uid) return;
        if (text === original.content) return;
        const edited: ChatMessage = { ...original, content: text, meta: { ...original.meta, edited: true } };
        this.saveMessage(edited);
        this.broadcastMsg({ t: "msg", message: edited });
        // If this was the last thing anyone said, swap the AI's answer to it for a new one.
        const after = recent.slice(idx + 1);
        if (this.aiBusy || after.some((m) => m.role === "user")) return;
        const wantsAi = this.settings.aiMode === "always" || /@ai\b/i.test(text);
        if (!wantsAi) return;
        if (!this.allowAi(me.uid))
          return this.send(conn, { t: "error", message: "You've hit the hourly AI limit for the free beta. Try again soon." });
        this.removeMessages(after.map((m) => m.id));
        this.queueAi();
        return;
      }
      case "react": {
        if (!(REACTIONS as readonly string[]).includes(msg.emoji)) return;
        const m = this.loadMessages(300).find((x) => x.id === msg.id);
        if (!m || m.meta?.streaming) return;
        const reactions = { ...(m.meta?.reactions ?? {}) };
        const who = new Set(reactions[msg.emoji] ?? []);
        if (who.has(me.uid)) who.delete(me.uid);
        else who.add(me.uid);
        if (who.size) reactions[msg.emoji] = [...who];
        else delete reactions[msg.emoji];
        const next: ChatMessage = { ...m, meta: { ...m.meta, reactions } };
        this.saveMessage(next);
        this.broadcastMsg({ t: "msg", message: next });
        return;
      }
      case "poll": {
        const question = String(msg.question ?? "").trim().slice(0, 200);
        const options = (Array.isArray(msg.options) ? msg.options : []).map((o) => String(o).trim().slice(0, 80)).filter(Boolean).slice(0, 10);
        if (!question || options.length < 2) return;
        const m: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          authorId: me.uid,
          authorName: me.name,
          content: `📊 Poll: ${question}`,
          createdAt: Date.now(),
          meta: { poll: { question, options, votes: {} } },
        };
        this.saveMessage(m);
        this.broadcastMsg({ t: "msg", message: m });
        return;
      }
      case "vote": {
        const m = this.loadMessages(300).find((x) => x.id === msg.id);
        const poll = m?.meta?.poll;
        if (!m || !poll || !(msg.option >= 0 && msg.option < poll.options.length)) return;
        const votes: Record<string, string[]> = {};
        for (const [k, uids] of Object.entries(poll.votes)) votes[k] = uids.filter((u) => u !== me.uid);
        const key = String(Math.floor(msg.option));
        const already = (poll.votes[key] ?? []).includes(me.uid);
        if (!already) votes[key] = [...(votes[key] ?? []), me.uid]; // clicking your vote again removes it
        const next: ChatMessage = { ...m, meta: { ...m.meta, poll: { ...poll, votes } } };
        this.saveMessage(next);
        this.broadcastMsg({ t: "msg", message: next });
        return;
      }
      case "forget": {
        const facts = (await this.ctx.storage.get<string[]>("memory")) ?? [];
        if (!(msg.index >= 0 && msg.index < facts.length)) return;
        facts.splice(msg.index, 1);
        await this.ctx.storage.put("memory", facts);
        this.broadcastMsg({ t: "memory", facts });
        return;
      }
      case "regenerate": {
        if (this.aiBusy) return this.send(conn, { t: "error", message: "The AI is still answering — try again when it's done." });
        const [last] = this.loadMessages(1);
        if (!last || last.role !== "assistant") return;
        if (!this.allowAi(me.uid))
          return this.send(conn, { t: "error", message: "You've hit the hourly AI limit for the free beta. Try again soon." });
        this.removeMessages([last.id]);
        this.queueAi();
        return;
      }
      case "settings": {
        if (!isHost) return this.send(conn, { t: "error", message: "Only the host can change room settings." });
        const p = msg.patch ?? {};
        const s = this.settings;
        if (p.aiMode === "always" || p.aiMode === "mention") s.aiMode = p.aiMode;
        if (p.engine === "auto" || p.engine === "local") s.engine = p.engine;
        if (typeof p.localModel === "string") s.localModel = p.localModel.slice(0, 100);
        if (typeof p.locked === "boolean") s.locked = p.locked;
        if (typeof p.title === "string") s.title = p.title.slice(0, 80) || s.title;
        if (Array.isArray(p.disabledSkills)) s.disabledSkills = p.disabledSkills.map(String).slice(0, 100);
        if (typeof p.deepResearch === "boolean") s.deepResearch = p.deepResearch;
        if (typeof p.memory === "boolean") s.memory = p.memory;
        if (p.assistant === null || (p.assistant && typeof p.assistant === "object")) {
          const name = String(p.assistant?.name ?? "").trim().slice(0, 40);
          const instructions = String(p.assistant?.instructions ?? "").trim().slice(0, 4000);
          s.assistant = name || instructions ? { name, instructions } : undefined;
        }
        await this.ctx.storage.put("settings", s);
        this.broadcastMsg({ t: "settings", settings: s });
        return;
      }
      case "new_file": {
        const kind = isFileKind(msg.kind) && msg.kind !== "artifact" ? msg.kind : "doc";
        if (this.files().length >= MAX_FILES)
          return this.send(conn, { t: "error", message: `Rooms can hold up to ${MAX_FILES} files. Delete some to make room.` });
        const f = this.createFile(kind, String(msg.title ?? "") || FILE_INFO[kind].untitled, me.uid);
        // Seed starter content on the server so two people opening it at once don't both add it.
        if (kind === "slides") {
          const stub = await getServerByName(this.env.Doc, `${this.name}--${f.id}`);
          await stub.slideOps([{ op: "insert", slide: { layout: "title", title: "", body: "" } }]);
        }
        this.send(conn, { t: "open_file", id: f.id });
        return;
      }
      case "import_csv": {
        if (this.files().length >= MAX_FILES) return;
        const rows = parseCsv(String(msg.csv ?? "").slice(0, 2_000_000));
        if (!rows.length) return;
        const sheet = this.createFile("sheet", String(msg.title ?? "Imported sheet").slice(0, 120), me.uid);
        const width = Math.max(1, ...rows.slice(0, 50).map((r) => r.length));
        await (await getServerByName(this.env.Doc, `${this.name}--${sheet.id}`)).sheetOps([
          { op: "set_range", start: "A1", rows: rows.map((r) => r.map((v) => (/^[=+\-@]/.test(v) && !/^-?\d/.test(v) ? `'${v}` : v))) },
          { op: "format", range: `A1:${colName(width - 1)}1`, bold: true, bg: "#eef2ff" },
        ]);
        this.send(conn, { t: "open_file", id: sheet.id });
        return;
      }
      case "form_to_sheet": {
        const form = this.files().find((x) => x.id === msg.id && x.kind === "form");
        if (!form || this.files().length >= MAX_FILES) return;
        const rows = await (await getServerByName(this.env.Doc, `${this.name}--${form.id}`)).formRows();
        const sheet = this.createFile("sheet", `${form.title} — responses`.slice(0, 120), me.uid);
        const width = Math.max(1, rows[0]?.length ?? 1);
        await (await getServerByName(this.env.Doc, `${this.name}--${sheet.id}`)).sheetOps([
          // Prefix answers that look like formulas so they stay plain text.
          { op: "set_range", start: "A1", rows: rows.map((r) => r.map((v) => (/^[=+\-@]/.test(v) ? `'${v}` : v))) },
          { op: "format", range: `A1:${colName(width - 1)}1`, bold: true, bg: "#eef2ff" },
          { op: "col_width", col: "A", width: 140 },
        ]);
        this.send(conn, { t: "open_file", id: sheet.id });
        return;
      }
      case "duplicate_file": {
        const src = this.files().find((x) => x.id === msg.id);
        if (!src || this.files().length >= MAX_FILES) return;
        const copy = this.createFile(src.kind, `Copy of ${src.title}`.slice(0, 120), me.uid);
        const from = await getServerByName(this.env.Doc, `${this.name}--${src.id}`);
        const to = await getServerByName(this.env.Doc, `${this.name}--${copy.id}`);
        await to.importState(await from.exportState(), src.kind);
        this.send(conn, { t: "open_file", id: copy.id });
        return;
      }
      case "rename_file": {
        const title = String(msg.title ?? "").slice(0, 120);
        if (!title) return;
        this.sql`UPDATE files SET title = ${title} WHERE id = ${msg.id}`;
        this.broadcastMsg({ t: "files", files: this.files() });
        return;
      }
      case "delete_file": {
        const f = this.files().find((x) => x.id === msg.id);
        if (!f || (!isHost && f.createdBy !== me.uid)) return;
        this.sql`DELETE FROM files WHERE id = ${msg.id}`;
        this.broadcastMsg({ t: "files", files: this.files() });
        // Free the file's storage too.
        this.ctx.waitUntil(getServerByName(this.env.Doc, `${this.name}--${f.id}`).then((s) => s.wipe()));
        return;
      }
      case "kick":
      case "ban":
      case "unban": {
        await this.moderate(me.uid, msg.t, String(msg.uid ?? ""));
        return;
      }
      case "local_delta": {
        if (!isHost || !this.streaming || msg.id !== this.streaming.id) return;
        this.streaming.content += msg.delta;
        this.broadcastMsg({ t: "ai_delta", id: msg.id, delta: msg.delta });
        return;
      }
      case "local_done": {
        if (!isHost || this.localWaiter?.id !== msg.id) return;
        this.localWaiter.resolve(msg.error);
        return;
      }
    }
  }

  // ---------- AI ----------

  private allowAi(uid: string) {
    const now = Date.now();
    const hits = (this.userHits.get(uid) ?? []).filter((t) => now - t < 3_600_000);
    if (hits.length >= USER_AI_PER_HOUR) return false;
    hits.push(now);
    this.userHits.set(uid, hits);
    return true;
  }

  private queueAi() {
    if (this.aiBusy) {
      // Messages that arrive mid-answer are batched into the AI's next turn.
      this.aiPending = true;
      return;
    }
    this.aiBusy = true;
    // Keep the DO alive while generating.
    this.ctx.waitUntil(
      (async () => {
        try {
          do {
            this.aiPending = false;
            await this.aiTurn();
            // Only run another turn if someone spoke after this turn read the history;
            // otherwise the AI would re-answer messages it just handled.
          } while (this.aiPending && this.hasUnseenUserMessages());
        } finally {
          this.aiBusy = false;
        }
      })(),
    );
  }

  /** createdAt cutoff of the history the last AI turn read. */
  private aiSeenUpTo = 0;

  private hasUnseenUserMessages() {
    const [row] = this.sql<{ n: number }>`SELECT COUNT(*) AS n FROM messages WHERE role = 'user' AND created_at > ${this.aiSeenUpTo}`;
    return (row?.n ?? 0) > 0;
  }

  /** "ok", or which free allowance is used up today: this room's, or the whole site's. */
  private async dailyBudget(): Promise<"ok" | "room" | "global"> {
    const day = new Date().toISOString().slice(0, 10);
    const key = `ai-count:${day}`;
    const n = ((await this.ctx.storage.get<number>(key)) ?? 0) + 1;
    await this.ctx.storage.put(key, n);
    if (n > Number(this.env.ROOM_DAILY_AI_LIMIT || 300)) return "room";
    // Local mode runs on the host's device, so it doesn't spend shared cloud quota.
    if (this.settings?.engine !== "local" && (await aiTurnsToday(this.env.DB)) >= Number(this.env.GLOBAL_DAILY_AI_LIMIT || 5000))
      return "global";
    return "ok";
  }

  /** Banner for everyone in the room when the shared cloud AI can't answer. */
  private noticeAiUnavailable(text: string) {
    this.broadcastMsg({ t: "notice", kind: "ai_unavailable", text });
  }

  private async aiTurn() {
    const s = this.settings!;
    const turnStartedAt = Date.now();
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      authorId: "ai",
      authorName: s.assistant?.name || "Huddle AI",
      content: "",
      createdAt: Date.now(),
      meta: { streaming: true, steps: [], sources: [] },
    };
    this.streaming = msg;
    this.broadcastMsg({ t: "msg", message: msg });

    const sources: Source[] = [];
    let pendingDelta = "";
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      flushTimer = null;
      if (!pendingDelta) return;
      this.broadcastMsg({ t: "ai_delta", id: msg.id, delta: pendingDelta });
      pendingDelta = "";
    };
    const onDelta = (d: string) => {
      msg.content += d;
      pendingDelta += d;
      flushTimer ??= setTimeout(flush, 40);
    };
    const step = (st: Step) => {
      msg.meta!.steps!.push(st);
      flush();
      this.broadcastMsg({ t: "ai_step", id: msg.id, step: st });
    };

    let llm: LlmMessage[] = [];
    try {
      const tBudget = Date.now();
      const budget = await this.dailyBudget();
      if (this.env.DEBUG_AI) console.log(`[ai] budget check ${Date.now() - tBudget}ms`);
      // Everything saved up to now is part of this turn. Re-stamp the reply so it sorts
      // after the messages it answers (some may have landed during the await above).
      this.aiSeenUpTo = Date.now();
      msg.createdAt = this.aiSeenUpTo + 1;
      if (budget !== "ok") {
        msg.content =
          budget === "room"
            ? "This room has used today's free AI allowance. 💤 The host can switch to **Local mode** (runs on their own device, unlimited) in Room settings, or try again tomorrow."
            : "Huddle has used today's shared free AI allowance across all rooms. 💤 The host can switch to **Local mode** (runs on their own device, unlimited) in Room settings, or try again tomorrow.";
        msg.meta!.error = true;
        this.noticeAiUnavailable(
          budget === "room" ? "This room used today's free cloud AI allowance." : "Today's shared free cloud AI allowance is used up.",
        );
      } else if (s.engine === "local") {
        await this.localTurn(msg);
      } else {
        this.abort = new AbortController();
        const memory = (await this.ctx.storage.get<string[]>("memory")) ?? [];
        // Asking for research ("deep research… cite the sites") turns research on for this turn,
        // even when the room's Deep Research switch is off.
        const research = s.deepResearch || wantsResearch(this.lastUserText());
        llm = [{ role: "system", content: this.systemPrompt(true, memory, research) }, ...withFreshNote(this.history())];
        let emptyRetried = false;
        // Models sometimes say "here's your image" without calling generate_image. Catch that once.
        const askedForImage = wantsImage(this.lastUserText());
        let imageNudged = false;
        const maxSteps = research ? DEEP_RESEARCH_STEPS : MAX_STEPS;
        // Only offer tools that can do something in this room (every definition costs tokens).
        const hasKnowledge = (this.sql<{ n: number }>`SELECT COUNT(*) AS n FROM knowledge`[0]?.n ?? 0) > 0;
        const hasImages = this.loadMessages(HISTORY_FOR_AI).some((m) => m.meta?.attachments?.some((a) => a.type.startsWith("image/")));
        const tools = TOOL_DEFS.filter(
          (t) =>
            (t.function.name !== "remember" || s.memory) &&
            (t.function.name !== "search_knowledge" || hasKnowledge) &&
            (t.function.name !== "describe_image" || hasImages),
        );
        // Skips the host PC when "Use my PC for AI" is off in /admin.
        const routerEnv = await aiEnv(this.env);
        for (let i = 0; i < maxSteps; i++) {
          const tCall = Date.now();
          const stepStart = msg.content.length;
          if (this.env.DEBUG_AI) console.log(`[ai] step ${i} calling model at +${tCall - msg.createdAt}ms`);
          const res = await chatWithFallback(routerEnv, {
            messages: llm,
            tools,
            signal: this.abort.signal,
            onDelta,
          });
          msg.meta!.model = `${res.provider} · ${res.model}`;
          // The model wrote a tool call as text mid-reply: drop that text (ai_done resyncs everyone).
          if (res.replacedContent) msg.content = msg.content.slice(0, stepStart) + res.content;
          if (this.env.DEBUG_AI)
            console.log(`[ai] step ${i} ${res.model} took ${Date.now() - tCall}ms: ${res.content.length} chars, tools: ${res.toolCalls.map((c) => `${c.function.name}(${c.function.arguments.slice(0, 400)})`).join(" | ") || "none"}`);
          if (!res.toolCalls.length && !res.content.trim() && !emptyRetried) {
            // Occasionally a model returns nothing at all; ask once more rather than showing "(no response)".
            emptyRetried = true;
            llm.push({ role: "user", content: "(Huddle: your last reply was empty. Please answer the request above, using a tool if needed.)" });
            continue;
          }
          const imageMissing =
            !res.toolCalls.length &&
            !msg.meta!.images?.length &&
            tools.some((t) => t.function.name === "generate_image") &&
            (askedForImage || claimsImage(res.content));
          if (imageMissing && !imageNudged) {
            imageNudged = true;
            // Take back the reply that claimed an image, and have the model actually make it.
            msg.content = msg.content.slice(0, stepStart);
            this.broadcastMsg({ t: "ai_done", message: { ...msg, meta: { ...msg.meta, streaming: true } } });
            llm.push({ role: "assistant", content: res.content || null });
            llm.push({
              role: "user",
              content: "(Huddle: no image exists yet, because generate_image was not called. Call generate_image now with a detailed visual prompt, then reply in one or two sentences. Don't describe an image you haven't made.)",
            });
            continue;
          }
          if (imageMissing && claimsImage(res.content))
            onDelta("\n\n_(No image was actually created this time. Ask again and I'll make it.)_");
          if (!res.toolCalls.length) break;
          if (res.content && !/\s$/.test(msg.content)) onDelta("\n\n");
          llm.push({ role: "assistant", content: res.content || null, tool_calls: res.toolCalls });
          for (const call of res.toolCalls) {
            unlinkInventedUrls(call, llm, sources);
            const output = await runTool(call.function.name, call.function.arguments, {
              env: this.env,
              roomCode: this.name,
              files: () => this.files(),
              createFile: (kind, title) => this.createFile(kind, title, "ai"),
              openFile: (id) => this.broadcastMsg({ t: "open_file", id }),
              step,
              sources,
              remember: s.memory ? (fact) => this.remember(fact) : undefined,
              searchKnowledge: (q) => this.searchKnowledge(q),
              addImage: (a) => {
                msg.meta!.images = [...(msg.meta!.images ?? []), a];
                this.broadcastMsg({ t: "ai_step", id: msg.id, step: { kind: "other", label: `Image ready: ${a.name}` } });
              },
            });
            llm.push({ role: "tool", tool_call_id: call.id, content: output });
            if (this.env.DEBUG_AI) console.log(`[ai] ${call.function.name} -> ${output.slice(0, 300)}`);
            compactDocArgs(call);
          }
          if (i === maxSteps - 2) {
            // As a user-role note: gpt-oss/Qwen largely ignore system messages mid-conversation.
            llm.push({ role: "user", content: "(Huddle: tool budget reached. Write your final answer now without calling tools.)" });
          }
        }
      }
    } catch (err) {
      if (this.abort?.signal.aborted) {
        msg.content += msg.content ? "\n\n_(stopped)_" : "_(stopped)_";
      } else if (err instanceof ProviderError && (err.message === "NO_PROVIDERS" || err.message === "ALL_FAILED")) {
        const did = msg.meta!.steps!.length
          ? "The steps above did run, but I couldn't write my reply. "
          : "";
        const outOfQuota =
          getProvidersConfigured(this.env).length === 0
            ? "No free AI provider is configured on this server."
            : "The free AI models are busy or have hit their per-minute limits.";
        msg.content =
          (msg.content.trim() ? msg.content + "\n\n" : "") +
          `⚠️ ${outOfQuota} ${did}Try again in a minute, or the host can switch this room to **Local mode** (the AI runs in their browser, free and unlimited) from Room settings.`;
        msg.meta!.error = true;
        this.noticeAiUnavailable(outOfQuota);
      } else {
        console.error("AI turn failed", err);
        msg.content += `\n\n⚠️ The AI hit an error: ${String(err).slice(0, 200)}`;
        msg.meta!.error = true;
      }
    } finally {
      if (flushTimer) clearTimeout(flushTimer);
      flush();
      this.abort = null;
      this.streaming = null;
    }

    msg.meta!.streaming = false;
    msg.meta!.sources = dedupeSources(sources);
    if (llm.length) {
      // Unlink any URL the model invented (not seen in tool results or user messages).
      const { text, removed } = stripUnverifiedLinks(
        msg.content,
        collectUrls([...llm.filter((m) => m.role !== "system").map((m) => m.content), ...sources.map((s) => s.url)]),
      );
      if (removed.length) console.warn(`unlinked ${removed.length} unverified citation(s)`, removed);
      msg.content = text;
    }
    if (!msg.content.trim()) msg.content = "_(no response)_";
    // Count cloud turns site-wide (shown in /admin; enforces GLOBAL_DAILY_AI_LIMIT).
    if (llm.length && msg.meta!.model && !msg.meta!.error) {
      this.ctx.waitUntil(countAiTurn(this.env.DB, msg.meta!.model.split(" · ")[0]));
      // Reply time, for the admin dashboard's "average AI reply" (ms summed; divided by ai_timed).
      const wait = (p: Promise<unknown>) => this.ctx.waitUntil(p);
      bumpLater(this.env, "ai_ms", Date.now() - turnStartedAt, wait);
      bumpLater(this.env, "ai_timed", 1, wait);
    } else if (msg.meta!.error) this.ctx.waitUntil(bump(this.env, "ai_errors"));
    this.saveMessage(msg);
    this.broadcastMsg({ t: "ai_done", message: msg });
    if (this.env.DEBUG_AI) console.log(`[ai] turn done at +${Date.now() - msg.createdAt}ms`);
  }

  /** Local mode: the host's browser runs an open model with WebLLM; we relay its tokens to everyone. */
  private async localTurn(msg: ChatMessage) {
    const s = this.settings!;
    const host = [...this.getConnections<ConnState>()].find((c) => c.state?.uid === s.hostId);
    if (!host) {
      msg.content = "Local mode needs the room host to be online — their device runs the AI.";
      msg.meta!.error = true;
      return;
    }
    msg.meta!.model = `Local (host's device) · ${s.localModel}`;
    const messages = [
      { role: "system", content: this.systemPrompt(false) },
      ...this.history(12).map((m) => ({ role: m.role, content: m.content ?? "" })),
    ];
    const err = await new Promise<string | undefined>((resolve) => {
      const timer = setTimeout(() => resolve("Local model timed out."), 5 * 60_000);
      this.localWaiter = {
        id: msg.id,
        resolve: (e) => {
          clearTimeout(timer);
          this.localWaiter = null;
          resolve(e);
        },
      };
      this.send(host, { t: "local_request", id: msg.id, model: s.localModel, messages });
    });
    if (err) {
      msg.content += `${msg.content ? "\n\n" : ""}⚠️ ${err}`;
      msg.meta!.error = true;
    }
  }

  private history(limit = HISTORY_FOR_AI): LlmMessage[] {
    const msgs = this.loadMessages(limit).filter((m) => !m.meta?.error);
    const lastAi = msgs.map((m) => m.role).lastIndexOf("assistant");
    return msgs.map((m, i) => {
      if (m.role !== "assistant") {
        // Tell the model what was attached and how to use it.
        const att = (m.meta?.attachments ?? [])
          .map((a) =>
            a.type.startsWith("image/")
              ? `[Image attached: "${a.name}" (image_id ${a.id}); use describe_image to see it]`
              : `[File attached: "${a.name}"${a.indexed ? "; its text is searchable with search_knowledge" : ""}]`,
          )
          .join(" ");
        return { role: "user" as const, content: `${m.authorName}: ${m.content}${att ? ` ${att}` : ""}` };
      }
      // Free tiers allow only a few thousand tokens per minute, so older AI replies are
      // clipped (the full text stays in the chat; docs hold the long-form work anyway).
      const cap = i === lastAi ? 4000 : 1200;
      const content = m.content.length > cap ? m.content.slice(0, cap) + " …(earlier reply clipped)" : m.content;
      return { role: "assistant" as const, content };
    });
  }

  /** Text of the newest message from a person, for spotting requests like "do deep research". */
  private lastUserText(): string {
    return this.history().filter((m) => m.role === "user").at(-1)?.content ?? "";
  }

  private systemPrompt(withTools: boolean, memory: string[] = [], research = false) {
    const s = this.settings!;
    const people = [...new Set(this.members().map((m) => m.name))].join(", ") || "nobody";
    const files = this.files();
    const skills = SKILLS.filter((k) => !s.disabledSkills.includes(k.name));
    const lines = [
      `You are Huddle AI, a helpful, capable assistant inside a multiplayer workspace room.`,
      `Several people can be in the chat at once. Each user message is prefixed with the speaker's name ("Name: message"). Address people by name when helpful, keep track of who asked what, and when several people talk at once, answer each of them.`,
      `Respond to the messages that arrived after your last reply. Earlier messages are context only: never redo or re-answer a request you already handled.`,
      `Format with Markdown (headings, lists, tables, fenced code with language tags, LaTeX with $...$). Be concise by default and expand when asked.`,
    ];
    // Things that change between turns go last, so self-hosted models can reuse their cached
    // prompt prefix (much faster replies on your own GPU).
    const volatile = [
      ...(s.assistant
        ? [
            `In this room you are "${s.assistant.name || "Huddle AI"}", set up by the host with these instructions (follow them unless they conflict with the rules above):\n${s.assistant.instructions}`,
          ]
        : []),
      `This room is called "${s.title}". Today's date: ${new Date().toISOString().slice(0, 10)}. People here now: ${people}.`,
    ];
    if (withTools) {
      lines.push(
        `You have tools: web_search and fetch_url for current or factual info, tools that create and edit live files everyone in the room co-edits, and load_skill for expert playbooks.`,
        `Use web_search for anything recent or time-sensitive (news, prices, releases, "this week"). Don't use tools for small talk.`,
        `Accuracy matters more than sounding sure. For specific facts you aren't certain of (numbers, dates, names, quotes, statistics, how-to steps for a particular product), run web_search first. If you still don't know, say so plainly. Never invent facts, quotes, sources, or results of tools you didn't call, and never claim you did something (made a file or image, searched) unless a tool result shows it.`,
        `Citations: only link URLs that appear word-for-word in your tool results. Never build, guess or "fix" a URL, and only call fetch_url on URLs from search results or from the users. If you can't find a source, say so.`,
        `Call tools only through the tool-calling interface. Never write a tool call (JSON, function tags) into your reply text.`,
        `Files you can make (pick the one that fits the request):`,
        ...FILE_GUIDE,
        `After making or changing a file, reply in chat with one or two sentences about what you did; don't repeat its content. To change an existing file, use its edit tool (read it first when rewriting).`,
        `file_id values are internal; never show them to people, refer to files by title.`,
        `Before specialised tasks, call load_skill with the most relevant skill. Available skills:`,
        ...skills.map((k) => `- ${k.name}: ${k.description}`),
      );
      if (research)
        volatile.push(
          `DEEP RESEARCH MODE is on. For questions that need research: load the deep-research skill, run several web_search queries from different angles, read the best 3–6 sources with fetch_url, then write the findings as a doc with create_doc (summary first, then sections, then a Sources list of the real URLs you read). In chat, give a short summary and point to the doc. Small talk still gets a normal short reply.`,
        );
      if (s.memory)
        volatile.push(
          memory.length
            ? `Room memory (facts people asked you to keep; use them, and call remember to add new lasting facts like names, roles, goals, deadlines or preferences):\n${memory.map((f) => `- ${f}`).join("\n")}`
            : `Room memory is on but empty. When people share lasting facts (names, roles, goals, deadlines, preferences) or ask you to remember something, call remember.`,
        );
      volatile.push(
        files.length
          ? `Files in this room:\n${files.map((f) => `- ${f.kind} "${f.title}" (file_id ${f.id})`).join("\n")}`
          : `There are no files in this room yet.`,
      );
    }
    return [...lines, ...volatile].join("\n");
  }

  // ---------- storage helpers ----------

  private loadMessages(limit: number): ChatMessage[] {
    const rows = this.sql<any>`SELECT * FROM messages ORDER BY created_at DESC LIMIT ${limit}`;
    return rows.reverse().map((r) => ({
      id: r.id,
      role: r.role,
      authorId: r.author_id,
      authorName: r.author_name,
      content: r.content,
      createdAt: r.created_at,
      meta: r.meta ? JSON.parse(r.meta) : undefined,
    }));
  }

  private saveMessage(m: ChatMessage) {
    this.sql`INSERT OR REPLACE INTO messages (id, role, author_id, author_name, content, created_at, meta)
      VALUES (${m.id}, ${m.role}, ${m.authorId}, ${m.authorName}, ${m.content}, ${m.createdAt}, ${m.meta ? JSON.stringify(m.meta) : null})`;
  }

  /** Save a fact the AI should keep in mind in future turns (room memory must be on). */
  private async remember(fact: string): Promise<string> {
    const clean = fact.replace(/\s+/g, " ").trim().slice(0, 300);
    if (!clean) return "Error: empty fact.";
    const facts = (await this.ctx.storage.get<string[]>("memory")) ?? [];
    if (facts.some((f) => f.toLowerCase() === clean.toLowerCase())) return "Already remembered.";
    facts.push(clean);
    while (facts.length > MAX_MEMORY_FACTS) facts.shift();
    await this.ctx.storage.put("memory", facts);
    this.broadcastMsg({ t: "memory", facts });
    return `Remembered. The room can see and delete it in Room settings → Memory (${facts.length}/${MAX_MEMORY_FACTS}).`;
  }

  private removeMessages(ids: string[]) {
    if (!ids.length) return;
    for (const id of ids) this.sql`DELETE FROM messages WHERE id = ${id}`;
    this.broadcastMsg({ t: "remove", ids });
  }

  private files(): RoomFile[] {
    return this.sql<any>`SELECT * FROM files ORDER BY created_at DESC`.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      createdAt: r.created_at,
      createdBy: r.created_by,
    }));
  }

  private createFile(kind: FileKind, title: string, by: string): RoomFile {
    const f: RoomFile = {
      id: crypto.randomUUID().slice(0, 12),
      kind,
      title: title.slice(0, 120) || "Untitled",
      createdAt: Date.now(),
      createdBy: by,
    }
    this.ctx.waitUntil(bump(this.env, `files_${kind}`));;
    this.sql`INSERT INTO files (id, kind, title, created_at, created_by) VALUES (${f.id}, ${f.kind}, ${f.title}, ${f.createdAt}, ${f.createdBy})`;
    this.broadcastMsg({ t: "files", files: this.files() });
    return f;
  }

  // ---------- presence & messaging ----------

  private toMember(s: ConnState): Member {
    return { uid: s.uid, name: s.name, color: s.color, avatar: s.avatar, isHost: s.uid === this.settings?.hostId, typing: !!s.typing };
  }

  private members(): Member[] {
    const byUid = new Map<string, Member>();
    for (const c of this.getConnections<ConnState>()) {
      if (!c.state) continue;
      const prev = byUid.get(c.state.uid);
      const m = this.toMember(c.state);
      byUid.set(c.state.uid, prev ? { ...m, typing: prev.typing || m.typing } : m);
    }
    return [...byUid.values()];
  }

  private broadcastPresence() {
    this.broadcastMsg({ t: "presence", members: this.members() });
  }

  private broadcastMsg(m: ServerMsg) {
    this.broadcast(JSON.stringify(m));
  }

  private send(c: Connection, m: ServerMsg) {
    c.send(JSON.stringify(m));
  }
}

function dedupeSources(list: Source[]): Source[] {
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true))).slice(0, 10);
}
