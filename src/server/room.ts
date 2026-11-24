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
import { claimsImage, compactDocArgs, projectPrompt, toolAllowed, wantsImage, wantsResearch, withFreshNote } from "./ai/turn";
import { aiTurnsToday, countAiTurn } from "./db";
import { FILE_INFO, isFileKind, type FileKind } from "../shared/files";
import { colName } from "../shared/formula";
import { chunkText, ftsQuery } from "../shared/knowledge";
import { parseCsv } from "../shared/sheet-model";
import {
  AVATAR_URL_RE,
  cleanProject,
  type AiSetting,
  type Attachment,
  type Ban,
  type ModerationAction,
  type PartyPerson,
  type ProjectSettings,
  type Report,
  type Task,
  type TaskBoard,
  TASK_LIMITS,
  type Receipt,
  type ReceiptDay,
  type ReceiptFile,
  type ReceiptPerson,
} from "../shared/protocol";
import { deleteBlob } from "./blobs";
import { bump, bumpLater, markActive } from "./stats";
import { SKILLS } from "./ai/skills";
import { runTool, TOOL_DEFS } from "./ai/tools";
import { collectUrls, stripUnverifiedLinks } from "./ai/citations";
import { getProviders as getProvidersConfigured } from "./ai/models";
import { templateById, type ProjectTemplate } from "../shared/templates";
import { wordsFromChars } from "../shared/classes";
import { checkMessage, safetyReply, SCHOOL_RULES } from "./ai/safety";
import { accessState, dueFor, type AccessOverride, type TimeRequest } from "../shared/schedule";
import { aiEnv } from "./ai/pc";

const MAX_FILES = 100;
/** Messages that change files or tasks: refused while a project is turned in. */
const FILE_CHANGES = new Set<ClientMsg["t"]>([
  "new_file", "import_csv", "form_to_sheet", "duplicate_file", "rename_file", "delete_file",
  "task_add", "task_update", "task_delete", "set_role",
]);

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
    // Timed assignments: open or close the work for the current time.
    if (this.settings?.project) await this.applyAccess();
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

  async init(hostId: string, title: string, project?: Partial<ProjectSettings>, templateId?: string) {
    if (this.settings) return { ok: false as const };
    this.settings = {
      hostId,
      title: title.slice(0, 80) || (project ? "Untitled project" : "Untitled room"),
      aiMode: "always",
      engine: "auto",
      localModel: "Qwen3-4B-q4f16_1-MLC",
      locked: false,
      disabledSkills: [],
      ...(project && typeof project === "object" ? { project: cleanProject(project) } : {}),
    };
    await this.ctx.storage.put("settings", this.settings);
    const template = this.settings.project ? templateById(templateId) : undefined;
    if (template) await this.applyTemplate(template, hostId);
    if (this.settings.project) await this.applyAccess(true);
    return { ok: true as const };
  }

  /** A template's starter files (credited to nobody: it's not the group's work) and tasks. */
  private async applyTemplate(t: ProjectTemplate, hostId: string) {
    for (const f of t.files) {
      const file = this.createFile(f.kind, f.title, hostId);
      const stub = await getServerByName(this.env.Doc, `${this.name}--${file.id}`);
      if (f.markdown) await stub.setMarkdown(f.markdown, "replace", null);
      if (f.kind === "slides") await stub.slideOps([{ op: "insert", slide: { layout: "title", title: this.settings!.title, body: "" } }], false, null);
    }
    await this.addTasks(t.tasks.map((title) => ({ title })), hostId);
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
    const isNew = people[uid]?.name !== name;
    people[uid] = { name, color, lastSeen: Date.now() };
    const ids = Object.keys(people);
    if (ids.length > 500) for (const id of ids.sort((a, b) => people[a].lastSeen - people[b].lastSeen).slice(0, ids.length - 500)) delete people[id];
    await this.ctx.storage.put("people", people);
    // Someone new can now be given tasks: refresh everyone's list of names.
    if (isNew && this.settings?.project) this.broadcastMsg({ t: "tasks", board: await this.boardWithPeople(await this.board()) });
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
    // A teacher never sits in a class group's room (they never see its chat): send them to grading.
    const link = this.settings.classLink;
    if (link && uid === this.settings.hostId) {
      this.send(conn, { t: "redirect", to: `/classes/${link.classId}/a/${link.assignmentId}/${this.name}` });
      return conn.close(4010, "Teachers grade from the class page");
    }
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
      ...(this.settings.project ? { board: await this.boardWithPeople(await this.board()) } : {}),
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
    if (this.settings.project?.turnedInAt && FILE_CHANGES.has(msg.t))
      return this.send(conn, { t: "error", message: "This project was turned in, so its files are locked. The teacher can reopen it." });
    if (this.settings.project?.status?.open === false && FILE_CHANGES.has(msg.t))
      return this.send(conn, { t: "error", message: "This assignment is closed right now. You can still chat; the files open again at the set time." });

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
        if (this.aiSetting() === "off") {
          if (/@ai\b/i.test(text)) this.send(conn, { t: "error", message: "AI is turned off for this project." });
          return;
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
        if (this.aiBusy || after.some((m) => m.role === "user") || this.aiSetting() === "off") return;
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
        if (this.aiSetting() === "off") return this.send(conn, { t: "error", message: "AI is turned off for this project." });
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
        if ("project" in p) {
          const wasTurnedIn = !!s.project?.turnedInAt;
          s.project = cleanProject(p.project, s.project);
          // Clearing a turned-in project unlocks its files again.
          if (wasTurnedIn && !s.project) await this.lockFiles(false);
        }
        await this.ctx.storage.put("settings", s);
        if (s.project) await this.applyAccess(true);
        this.broadcastMsg({ t: "settings", settings: s });
        return;
      }
      case "receipt": {
        const p = this.settings.project;
        if (!p) return;
        // Privacy: the teacher sees the receipt only once the group turns the project in.
        if (isHost && !p.turnedInAt)
          return this.send(conn, { t: "error", message: "You'll see the receipt once the group turns the project in." });
        const frozen = p.turnedInAt ? await this.ctx.storage.get<Receipt>("receipt:final") : undefined;
        this.send(conn, { t: "receipt", receipt: frozen ?? (await this.buildReceipt()) });
        return;
      }
      case "receipt_note": {
        const p = this.settings.project;
        if (!p) return;
        if (p.turnedInAt) return this.send(conn, { t: "error", message: "The project was turned in, so notes are locked." });
        const notes = (await this.ctx.storage.get<Record<string, string>>("receiptNotes")) ?? {};
        const text = String(msg.text ?? "").trim().slice(0, 500);
        if (text) notes[me.uid] = text;
        else delete notes[me.uid];
        await this.ctx.storage.put("receiptNotes", notes);
        this.send(conn, { t: "receipt", receipt: await this.buildReceipt() });
        return;
      }
      case "task_add": {
        if (!this.settings.project) return;
        const title = String(msg.title ?? "").trim().slice(0, TASK_LIMITS.title);
        if (!title) return;
        await this.addTasks([{ title, ownerUid: msg.ownerUid, dueAt: msg.dueAt }], me.uid);
        return;
      }
      case "task_update": {
        const b = await this.board();
        const t = b.tasks.find((x) => x.id === msg.id);
        if (!t) return;
        if (typeof msg.title === "string" && msg.title.trim()) t.title = msg.title.trim().slice(0, TASK_LIMITS.title);
        if (msg.ownerUid === null) delete t.ownerUid;
        else if (typeof msg.ownerUid === "string") t.ownerUid = msg.ownerUid.slice(0, 64);
        if (msg.dueAt === null) delete t.dueAt;
        else if (typeof msg.dueAt === "number" && msg.dueAt > 0) t.dueAt = Math.round(msg.dueAt);
        if (typeof msg.done === "boolean" && msg.done !== t.done) {
          t.done = msg.done;
          if (t.done) t.doneAt = Date.now();
          else delete t.doneAt;
        }
        await this.saveBoard(b);
        return;
      }
      case "task_delete": {
        const b = await this.board();
        const before = b.tasks.length;
        b.tasks = b.tasks.filter((x) => x.id !== msg.id);
        if (b.tasks.length !== before) await this.saveBoard(b);
        return;
      }
      case "set_role": {
        if (!this.settings.project) return;
        const b = await this.board();
        const role = String(msg.role ?? "").trim().slice(0, TASK_LIMITS.role);
        if (role) b.roles[me.uid] = role;
        else delete b.roles[me.uid];
        await this.saveBoard(b);
        return;
      }
      case "report": {
        // The teacher never sees the chat, except a message a student chooses to report.
        if (!this.settings.classLink) return this.send(conn, { t: "error", message: "Reports go to a teacher, and this room isn't part of a class." });
        const m = this.loadMessages(300).find((x) => x.id === msg.id);
        if (!m || m.role === "system") return;
        const reports = (await this.ctx.storage.get<Report[]>("reports")) ?? [];
        if (reports.some((r) => r.message.createdAt === m.createdAt && r.byUid === me.uid)) return this.send(conn, { t: "error", message: "You already reported that message." });
        reports.push({
          id: crypto.randomUUID().slice(0, 8),
          at: Date.now(),
          byUid: me.uid,
          byName: me.name,
          reason: String(msg.reason ?? "").trim().slice(0, 500),
          message: { authorName: m.authorName, content: m.content.slice(0, 2000), createdAt: m.createdAt, fromAi: m.role === "assistant" },
        });
        await this.ctx.storage.put("reports", reports.slice(-100));
        this.send(conn, { t: "error", message: "Reported to your teacher. Only that message was sent." });
        return;
      }
      case "time_request": {
        const p = this.settings.project;
        if (!p) return;
        if (isHost) return;
        const requests = (await this.ctx.storage.get<TimeRequest[]>("timeRequests")) ?? [];
        if (requests.some((r) => r.byUid === me.uid)) return this.send(conn, { t: "error", message: "You already asked for more time. Your teacher will answer soon." });
        const kind = msg.kind === "extend" ? "extend" : "open";
        requests.push({
          id: crypto.randomUUID().slice(0, 8),
          at: Date.now(),
          byUid: me.uid,
          byName: me.name,
          kind,
          ...(kind === "extend" ? { days: Math.max(1, Math.min(7, Math.round(Number(msg.days) || 1))) } : {}),
          reason: String(msg.reason ?? "").trim().slice(0, 300),
        });
        await this.ctx.storage.put("timeRequests", requests.slice(-20));
        this.send(conn, { t: "error", message: "Sent to your teacher. You'll see their answer here." });
        return;
      }
      case "turn_in": {
        const p = this.settings.project;
        if (!p) return;
        if (p.turnedInAt) return;
        p.turnedInAt = Date.now();
        p.turnedInBy = me.name;
        await this.ctx.storage.put("settings", this.settings);
        await this.lockFiles(true);
        // The receipt is frozen with the files: this is the version the teacher grades.
        await this.ctx.storage.put("receipt:final", await this.buildReceipt(true));
        this.broadcastMsg({ t: "settings", settings: this.settings });
        this.notice(`${me.name} turned in the project. Its files are locked now.`);
        return;
      }
      case "reopen": {
        if (!this.settings.project?.turnedInAt) return;
        if (!isHost) return this.send(conn, { t: "error", message: "Only the teacher (the host) can reopen a turned-in project." });
        await this.reopen(me.name);
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
          // Starter content isn't anyone's work, so it's credited to nobody.
          await stub.slideOps([{ op: "insert", slide: { layout: "title", title: "", body: "" } }], false, null);
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
        ], false, { uid: me.uid, name: me.name });
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
        ], false, null);
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

  // ---------- projects ----------

  private aiSetting(): AiSetting {
    return this.settings?.project?.ai ?? "full";
  }

  /** Lock or unlock every file (a turned-in project's work stays as submitted). */
  private async lockFiles(on: boolean) {
    await Promise.all(
      this.files().map((f) =>
        getServerByName(this.env.Doc, `${this.name}--${f.id}`)
          .then((s) => s.setLocked(on))
          .catch(() => {}),
      ),
    );
  }

  /**
   * The project's contribution receipt: what each student has in the files now, the files they
   * made, how much they chatted (counts only, never what was said), the days they worked, how
   * often they asked the AI to make or change files, and their own note. The teacher isn't listed.
   */
  private async buildReceipt(final = false): Promise<Receipt> {
    const s = this.settings!;
    const files = this.files();
    const perFile = await Promise.all(
      files.map((f) =>
        getServerByName(this.env.Doc, `${this.name}--${f.id}`)
          .then((st) => st.contributions(f.kind))
          .catch(() => null),
      ),
    );
    const known = (await this.ctx.storage.get<Record<string, Omit<PartyPerson, "uid">>>("people")) ?? {};
    const notes = (await this.ctx.storage.get<Record<string, string>>("receiptNotes")) ?? {};
    const asks = (await this.ctx.storage.get<Record<string, number>>("aiAsks")) ?? {};
    const people = new Map<string, ReceiptPerson>();
    const person = (uid: string, name?: string) => {
      let p = people.get(uid);
      if (!p) {
        p = { uid, name: known[uid]?.name ?? name ?? "Someone", words: 0, units: {}, filesCreated: 0, messages: 0, daysActive: 0, aiAsks: asks[uid] ?? 0 };
        people.set(uid, p);
      }
      return p;
    };
    const days: Record<string, ReceiptDay["people"]> = {};
    const workedOn = (day: string, uid: string) => ((days[day] ??= {})[uid] ??= { files: [], messages: 0 });
    let aiWords = 0;
    let aiUnits = 0;
    const receiptFiles: ReceiptFile[] = [];
    files.forEach((f, i) => {
      const c = perFile[i];
      if (!c) return;
      receiptFiles.push({ id: f.id, title: f.title, kind: f.kind, shares: c.shares });
      for (const [uid, share] of Object.entries(c.shares)) {
        if (uid === "ai") {
          aiWords += share.words;
          aiUnits += share.units;
          continue;
        }
        const p = person(uid, c.names[uid]);
        p.words += share.words;
        if (share.units) p.units[f.kind] = (p.units[f.kind] ?? 0) + share.units;
      }
      for (const [day, uids] of Object.entries(c.days))
        for (const uid of uids) {
          if (uid === "ai") continue;
          person(uid, c.names[uid]);
          const e = workedOn(day, uid);
          if (!e.files.includes(f.title)) e.files.push(f.title);
        }
      // Work timeline: about how many words each person typed each day, and large pastes.
      for (const [day, people] of Object.entries(c.typing ?? {}))
        for (const [uid, t] of Object.entries(people)) {
          if (uid === "ai") continue;
          person(uid, c.names[uid]);
          const e = workedOn(day, uid);
          e.words = (e.words ?? 0) + wordsFromChars(t.chars);
          for (const p of t.pastes) (e.pastes ??= []).push({ at: p.at, words: wordsFromChars(p.chars) });
        }
    });
    for (const f of files) if (f.createdBy && f.createdBy !== "ai") person(f.createdBy).filesCreated++;
    const chat = this.sql<{ uid: string; name: string; day: string; n: number }>`
      SELECT author_id AS uid, MAX(author_name) AS name, date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS n
      FROM messages WHERE role = 'user' GROUP BY author_id, day`;
    for (const r of chat) {
      person(r.uid, r.name).messages += r.n;
      workedOn(r.day, r.uid).messages += r.n;
    }
    for (const uid of Object.keys(asks)) person(uid);
    for (const [uid, note] of Object.entries(notes)) if (note) person(uid).note = note;
    const board = await this.board();
    for (const [uid, role] of Object.entries(board.roles)) if (role) person(uid).role = role;
    for (const t of board.tasks)
      if (t.ownerUid) (person(t.ownerUid).tasks ??= []).push({ title: t.title, done: t.done });
    // The teacher sets the project up; they aren't graded on it.
    if (s.project) {
      people.delete(s.hostId);
      for (const d of Object.values(days)) delete d[s.hostId];
    }
    for (const p of people.values()) p.daysActive = Object.values(days).filter((d) => d[p.uid]).length;
    return {
      title: s.title,
      generatedAt: Date.now(),
      final,
      ...(s.project?.turnedInAt ? { turnedInAt: s.project.turnedInAt } : {}),
      people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)),
      files: receiptFiles,
      days: Object.entries(days)
        .filter(([, p]) => Object.keys(p).length)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, p]) => ({ day, people: p })),
      aiWords,
      aiUnits,
    };
  }

  /** Last-read task board and people's names, for the AI's (synchronous) system prompt. */
  private boardCache?: TaskBoard;
  private nameCache: Record<string, string> = {};

  private async board(): Promise<TaskBoard> {
    this.boardCache = (await this.ctx.storage.get<TaskBoard>("board")) ?? { tasks: [], roles: {} };
    return this.boardCache;
  }

  private async saveBoard(b: TaskBoard) {
    const { people: _omit, ...stored } = b;
    await this.ctx.storage.put("board", stored);
    this.boardCache = stored;
    this.broadcastMsg({ t: "tasks", board: await this.boardWithPeople(stored) });
  }

  /** The board plus the group's names (not the teacher), so owners show even when offline. */
  private async boardWithPeople(b: TaskBoard): Promise<TaskBoard> {
    const known = (await this.ctx.storage.get<Record<string, { name: string }>>("people")) ?? {};
    const people = Object.fromEntries(Object.entries(known).filter(([uid]) => uid !== this.settings?.hostId).map(([uid, p]) => [uid, p.name]));
    return { ...b, people };
  }

  /** Adds tasks (from a person, the AI or a template). Owners can be uids or names of people in the room. */
  private async addTasks(items: { title: string; ownerUid?: string; owner?: string; dueAt?: number }[], by: string) {
    const b = await this.board();
    const known = (await this.ctx.storage.get<Record<string, { name: string }>>("people")) ?? {};
    const byName = (n: string) => Object.entries(known).find(([, p]) => p.name.toLowerCase() === n.trim().toLowerCase())?.[0];
    const now = Date.now();
    const added: Task[] = [];
    for (const it of items) {
      const title = String(it.title ?? "").trim().slice(0, TASK_LIMITS.title);
      if (!title || b.tasks.length >= TASK_LIMITS.tasks) continue;
      const ownerUid = typeof it.ownerUid === "string" && it.ownerUid ? it.ownerUid.slice(0, 64) : it.owner ? byName(String(it.owner)) : undefined;
      const t: Task = { id: crypto.randomUUID().slice(0, 8), title, done: false, createdBy: by, createdAt: now };
      if (ownerUid) t.ownerUid = ownerUid;
      if (typeof it.dueAt === "number" && it.dueAt > 0) t.dueAt = Math.round(it.dueAt);
      b.tasks.push(t);
      added.push(t);
    }
    if (added.length) await this.saveBoard(b);
    return added;
  }

  /** Credits a turn's file-making AI help to the students who asked for it. */
  private async creditAiAsk(uids: string[]) {
    if (!uids.length) return;
    const asks = (await this.ctx.storage.get<Record<string, number>>("aiAsks")) ?? {};
    for (const uid of uids) asks[uid] = (asks[uid] ?? 0) + 1;
    await this.ctx.storage.put("aiAsks", asks);
  }

  private async reopen(byName: string) {
    const p = this.settings?.project;
    if (!p?.turnedInAt) return false;
    delete p.turnedInAt;
    delete p.turnedInBy;
    await this.ctx.storage.put("settings", this.settings);
    await this.lockFiles(false);
    await this.ctx.storage.delete("receipt:final");
    await this.applyAccess(true);
    this.broadcastMsg({ t: "settings", settings: this.settings! });
    this.notice(`${byName} reopened the project. The group can edit again.`);
    return true;
  }

  // ---------- timed assignments ----------

  /**
   * Opens or closes the work for the current time: outside the set times (or past the due
   * date, if the teacher chose that) the files are read-only. Chat always works. Schedules
   * an alarm for the next change. Turned-in work stays locked regardless.
   */
  private async applyAccess(force = false) {
    const p = this.settings?.project;
    if (!p) return;
    const now = Date.now();
    // Extra time that has run out is forgotten.
    if (p.access?.openUntil && p.access.openUntil <= now) delete p.access.openUntil;
    if (p.access && !p.access.openUntil && !p.access.dueAt) delete p.access;
    const timed = !!p.schedule || !!p.access?.openUntil;
    const state = timed ? accessState(p.schedule, p.dueAt, p.access, now) : undefined;
    const before = p.status?.open;
    if (state) p.status = state;
    else delete p.status;
    const changed = before !== state?.open || force;
    if (changed) {
      await this.ctx.storage.put("settings", this.settings);
      if (!p.turnedInAt) await this.lockFiles(state ? !state.open : false);
      this.broadcastMsg({ t: "settings", settings: this.settings! });
    }
    if (state?.nextChange) await this.ctx.storage.setAlarm(state.nextChange + 500);
    else await this.ctx.storage.deleteAlarm();
  }

  async onAlarm() {
    if (!this.settings) this.settings = (await this.ctx.storage.get<RoomSettings>("settings")) ?? null;
    if (!this.settings?.project) return;
    const wasOpen = this.settings.project.status?.open;
    await this.applyAccess();
    const nowOpen = this.settings.project.status?.open;
    if (wasOpen !== nowOpen && nowOpen !== undefined)
      this.notice(nowOpen ? "The assignment is open. You can work on the files now." : "The assignment is closed for now. The files are read-only; chat still works.");
  }

  /** The teacher changes the due date or the set times for this room (from the class page). */
  async setTiming(patch: { dueAt?: number | null; schedule?: unknown }) {
    if (!this.settings?.project) return { ok: false };
    this.settings.project = cleanProject(patch, this.settings.project)!;
    await this.applyAccess(true);
    return { ok: true };
  }

  /** The teacher gives this room extra time: open it now for a while, or move its own due date. */
  async grantTime(g: { openMinutes?: number; extendDays?: number; dueAt?: number | null }, note = true) {
    const p = this.settings?.project;
    if (!p) return { ok: false };
    const now = Date.now();
    const access: AccessOverride = { ...(p.access ?? {}) };
    const said: string[] = [];
    if (g.openMinutes && g.openMinutes > 0) {
      access.openUntil = now + Math.min(24 * 60, g.openMinutes) * 60_000;
      said.push(`it's open for the next ${g.openMinutes >= 60 ? `${Math.round(g.openMinutes / 60)} hour${g.openMinutes >= 120 ? "s" : ""}` : `${g.openMinutes} minutes`}`);
    }
    if (g.extendDays && g.extendDays > 0) {
      const base = dueFor(p.dueAt, access) ?? now;
      access.dueAt = Math.max(base, now) + Math.min(30, g.extendDays) * 86_400_000;
      said.push(`your due date moved ${g.extendDays} day${g.extendDays === 1 ? "" : "s"} later`);
    }
    if (g.dueAt === null) delete access.dueAt;
    else if (typeof g.dueAt === "number" && g.dueAt > 0) {
      access.dueAt = Math.round(g.dueAt);
      said.push("your due date changed");
    }
    p.access = access;
    await this.applyAccess(true);
    if (note && said.length) this.notice(`Your teacher gave you more time: ${said.join(", and ")}.`);
    return { ok: true };
  }

  async timeRequests() {
    return (await this.ctx.storage.get<TimeRequest[]>("timeRequests")) ?? [];
  }

  /** Approve (applies what the student asked for) or decline a request for more time. */
  async answerTimeRequest(id: string, approve: boolean) {
    const requests = (await this.ctx.storage.get<TimeRequest[]>("timeRequests")) ?? [];
    const r = requests.find((x) => x.id === id);
    if (!r) return { ok: false };
    await this.ctx.storage.put("timeRequests", requests.filter((x) => x.id !== id));
    if (approve) await this.grantTime(r.kind === "extend" ? { extendDays: r.days ?? 1 } : { openMinutes: 60 });
    else this.notice(`Your teacher said no to ${r.byName}'s request for more time.`);
    return { ok: true };
  }

  // ---------- RPC for the teacher's class pages (counts and turned-in work only, never the chat) ----------

  async setClassLink(link: { classId: string; assignmentId: string; group: string }) {
    if (!this.settings) return { ok: false };
    this.settings.classLink = link;
    await this.ctx.storage.put("settings", this.settings);
    return { ok: true };
  }

  async groupStatus(memberUids: string[]) {
    const s = this.settings;
    if (!s) return null;
    const known = (await this.ctx.storage.get<Record<string, { lastSeen: number }>>("people")) ?? {};
    const board = await this.board();
    const [last] = this.sql<{ at: number }>`SELECT MAX(created_at) AS at FROM messages WHERE role = 'user'`;
    const seen = memberUids.map((u) => known[u]?.lastSeen ?? 0).filter(Boolean);
    const lastActivity = Math.max(last?.at ?? 0, ...seen, 0) || undefined;
    return {
      joined: memberUids.filter((u) => known[u]).length,
      tasksDone: board.tasks.filter((t) => t.done).length,
      tasksTotal: board.tasks.length,
      ...(lastActivity ? { lastActivity } : {}),
      ...(s.project?.turnedInAt ? { turnedInAt: s.project.turnedInAt } : {}),
      ...(dueFor(s.project?.dueAt, s.project?.access) ? { dueAt: dueFor(s.project?.dueAt, s.project?.access) } : {}),
      ...(s.project?.access?.dueAt ? { extended: true } : {}),
      ...(s.project?.status ? { open: s.project.status.open } : {}),
      timeRequests: ((await this.ctx.storage.get<TimeRequest[]>("timeRequests")) ?? []).length,
      files: this.files().length,
    };
  }

  /** The submitted files and frozen receipt, only once the group turned the project in. */
  async submitted() {
    if (!this.settings?.project?.turnedInAt) return { turnedIn: false as const, files: this.files().map(({ id, title, kind }) => ({ id, title, kind })), receipt: null };
    return {
      turnedIn: true as const,
      files: this.files().map(({ id, title, kind }) => ({ id, title, kind })),
      receipt: (await this.ctx.storage.get<Receipt>("receipt:final")) ?? null,
    };
  }

  async reports() {
    return (await this.ctx.storage.get<Report[]>("reports")) ?? [];
  }

  async dismissReport(id: string) {
    const reports = (await this.ctx.storage.get<Report[]>("reports")) ?? [];
    await this.ctx.storage.put("reports", reports.filter((r) => r.id !== id));
    return { ok: true };
  }

  /** The teacher removed this student from the class: send them out and keep them out. */
  async removeStudent(teacherUid: string, uid: string) {
    return this.moderate(teacherUid, "ban", uid);
  }

  async teacherReopen(name: string) {
    return { ok: await this.reopen(name || "Your teacher") };
  }

  /** A line from Cairn itself in the chat ("Maya turned in the project"). */
  private notice(text: string) {
    const m: ChatMessage = { id: crypto.randomUUID(), role: "system", authorId: "huddle", authorName: "Cairn", content: text, createdAt: Date.now() };
    this.saveMessage(m);
    this.broadcastMsg({ t: "msg", message: m });
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
    if (this.aiSetting() === "off") return;
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
      authorName: s.assistant?.name || "Cairn AI",
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
      // The people this turn answers: everyone who spoke since the AI's last reply.
      const recent = this.loadMessages(30);
      const lastAiAt = recent.map((m) => m.role).lastIndexOf("assistant");
      const askers = [...new Set(recent.slice(lastAiAt + 1).filter((m) => m.role === "user").map((m) => m.authorId))];
      let creditedAsk = false;
      msg.createdAt = this.aiSeenUpTo + 1;
      // School projects: a safety model checks the student's message before the AI answers.
      const safety = s.project && budget === "ok" ? await checkMessage(this.env, this.lastUserText()) : ({ safe: true } as const);
      if (budget !== "ok") {
        msg.content =
          budget === "room"
            ? "This room has used today's free AI allowance. 💤 The host can switch to **Local mode** (runs on their own device, unlimited) in Room settings, or try again tomorrow."
            : "Cairn has used today's shared free AI allowance across all rooms. 💤 The host can switch to **Local mode** (runs on their own device, unlimited) in Room settings, or try again tomorrow.";
        msg.meta!.error = true;
        this.noticeAiUnavailable(
          budget === "room" ? "This room used today's free cloud AI allowance." : "Today's shared free cloud AI allowance is used up.",
        );
      } else if (!safety.safe) {
        msg.content = safetyReply(safety.category);
        msg.meta!.model = "Cairn safety";
      } else if (s.engine === "local") {
        await this.localTurn(msg);
      } else {
        this.abort = new AbortController();
        const memory = (await this.ctx.storage.get<string[]>("memory")) ?? [];
        if (s.project) {
          await this.board();
          const known = (await this.ctx.storage.get<Record<string, { name: string }>>("people")) ?? {};
          this.nameCache = Object.fromEntries(Object.entries(known).map(([uid, p]) => [uid, p.name]));
        }
        // Asking for research ("deep research… cite the sites") turns research on for this turn,
        // even when the room's Deep Research switch is off.
        const aiRule = this.aiSetting();
        const turnedIn = !!s.project?.turnedInAt || s.project?.status?.open === false;
        // Tutor projects never research-and-write a doc for the students.
        const research = aiRule === "full" && !turnedIn && (s.deepResearch || wantsResearch(this.lastUserText()));
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
            toolAllowed(t.function.name, aiRule, turnedIn) &&
            (t.function.name !== "remember" || s.memory) &&
            (t.function.name !== "add_tasks" || !!s.project) &&
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
            llm.push({ role: "user", content: "(Cairn: your last reply was empty. Please answer the request above, using a tool if needed.)" });
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
              content: "(Cairn: no image exists yet, because generate_image was not called. Call generate_image now with a detailed visual prompt, then reply in one or two sentences. Don't describe an image you haven't made.)",
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
            // A model can still name a tool it wasn't offered; the project's rules win.
            // School projects: image prompts get the same safety check as messages.
            if (s.project && call.function.name === "generate_image") {
              let prompt = "";
              try {
                prompt = String(JSON.parse(call.function.arguments || "{}").prompt ?? "");
              } catch {}
              const check = await checkMessage(this.env, prompt);
              if (!check.safe) {
                llm.push({ role: "tool", tool_call_id: call.id, content: "Refused: that image isn't appropriate for a school project. Tell the student kindly and offer a school-appropriate idea." });
                continue;
              }
            }
            if (!toolAllowed(call.function.name, this.aiSetting(), !!this.settings?.project?.turnedInAt || this.settings?.project?.status?.open === false)) {
              llm.push({
                role: "tool",
                tool_call_id: call.id,
                content: "Not allowed in this project (the teacher's AI rules). Help the students without creating or changing files.",
              });
              continue;
            }
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
              addTasks: s.project ? (tasks) => this.addTasks(tasks, "ai").then((a) => a.length) : undefined,
              addImage: (a) => {
                msg.meta!.images = [...(msg.meta!.images ?? []), a];
                this.broadcastMsg({ t: "ai_step", id: msg.id, step: { kind: "other", label: `Image ready: ${a.name}` } });
              },
            });
            llm.push({ role: "tool", tool_call_id: call.id, content: output });
            // On the receipt, AI-made work counts as AI help for whoever asked (once per turn).
            if (!creditedAsk && /^(create_|edit_|draw_|make_)/.test(call.function.name)) {
              creditedAsk = true;
              await this.creditAiAsk(askers);
            }
            if (this.env.DEBUG_AI) console.log(`[ai] ${call.function.name} -> ${output.slice(0, 300)}`);
            compactDocArgs(call);
          }
          if (i === maxSteps - 2) {
            // As a user-role note: gpt-oss/Qwen largely ignore system messages mid-conversation.
            llm.push({ role: "user", content: "(Cairn: tool budget reached. Write your final answer now without calling tools.)" });
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
    // Cairn's own notices ("Maya turned in the project") aren't part of the conversation.
    const msgs = this.loadMessages(limit).filter((m) => !m.meta?.error && m.role !== "system");
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
      `You are Cairn AI, a helpful, capable assistant inside a multiplayer workspace room.`,
      `Several people can be in the chat at once. Each user message is prefixed with the speaker's name ("Name: message"). Address people by name when helpful, keep track of who asked what, and when several people talk at once, answer each of them.`,
      `Respond to the messages that arrived after your last reply. Earlier messages are context only: never redo or re-answer a request you already handled.`,
      `Format with Markdown (headings, lists, tables, fenced code with language tags, LaTeX with $...$). Be concise by default and expand when asked.`,
    ];
    // Things that change between turns go last, so self-hosted models can reuse their cached
    // prompt prefix (much faster replies on your own GPU).
    const volatile = [
      ...(s.assistant
        ? [
            `In this room you are "${s.assistant.name || "Cairn AI"}", set up by the host with these instructions (follow them unless they conflict with the rules above):\n${s.assistant.instructions}`,
          ]
        : []),
      `This room is called "${s.title}". Today's date: ${new Date().toISOString().slice(0, 10)}. People here now: ${people}.`,
      ...(s.project ? [SCHOOL_RULES, ...projectPrompt(s.project, Date.now(), this.boardCache, (uid) => this.nameCache[uid] ?? "someone")] : []),
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
