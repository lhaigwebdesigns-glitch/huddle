import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import type { Env } from "./env";
import type {
  ChatMessage,
  ClientMsg,
  Member,
  RoomFile,
  RoomSettings,
  ServerMsg,
  Source,
  Step,
} from "../shared/protocol";
import { availableProviders, chatWithFallback, ProviderError, type LlmMessage } from "./ai/providers";
import { compactDocArgs, withFreshNote } from "./ai/turn";
import { SKILLS } from "./ai/skills";
import { runTool, TOOL_DEFS } from "./ai/tools";
import { collectUrls, stripUnverifiedLinks } from "./ai/citations";
import { getProviders as getProvidersConfigured } from "./ai/models";

interface ConnState {
  uid: string;
  name: string;
  color: string;
  typing?: boolean;
}

const MAX_ROOM_SIZE = 12;
const MAX_STEPS = 6;
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
    const kicked = (await this.ctx.storage.get<string[]>("kicked")) ?? [];
    if (kicked.includes(uid)) return conn.close(4003, "You were removed from this room");
    const known = (await this.ctx.storage.get<string[]>("members")) ?? [];
    if (this.settings.locked && uid !== this.settings.hostId && !known.includes(uid))
      return conn.close(4003, "This room is locked");
    if (this.members().filter((m) => m.uid !== uid).length >= MAX_ROOM_SIZE)
      return conn.close(4001, "Room is full");
    if (!known.includes(uid)) await this.ctx.storage.put("members", [...known, uid].slice(-500));

    conn.setState({ uid, name, color });
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
    });
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
        if (!text) return;
        const m: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          authorId: me.uid,
          authorName: me.name,
          content: text,
          createdAt: Date.now(),
        };
        this.saveMessage(m);
        this.broadcastMsg({ t: "msg", message: m });
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
        await this.ctx.storage.put("settings", s);
        this.broadcastMsg({ t: "settings", settings: s });
        return;
      }
      case "new_file": {
        const f = this.createFile("doc", String(msg.title ?? "Untitled doc"), me.uid);
        this.send(conn, { t: "open_file", id: f.id });
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
        return;
      }
      case "kick": {
        if (!isHost || msg.uid === me.uid) return;
        const kicked = (await this.ctx.storage.get<string[]>("kicked")) ?? [];
        await this.ctx.storage.put("kicked", [...kicked, msg.uid]);
        for (const c of this.getConnections<ConnState>()) {
          if (c.state?.uid === msg.uid) {
            this.send(c, { t: "kicked" });
            c.close(4003, "Removed by host");
          }
        }
        this.broadcastPresence();
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

  private async dailyBudgetOk() {
    const day = new Date().toISOString().slice(0, 10);
    const key = `ai-count:${day}`;
    const n = ((await this.ctx.storage.get<number>(key)) ?? 0) + 1;
    await this.ctx.storage.put(key, n);
    return n <= Number(this.env.ROOM_DAILY_AI_LIMIT || 300);
  }

  private async aiTurn() {
    const s = this.settings!;
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      authorId: "ai",
      authorName: "Huddle AI",
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
      const budgetOk = await this.dailyBudgetOk();
      // Everything saved up to now is part of this turn. Re-stamp the reply so it sorts
      // after the messages it answers (some may have landed during the await above).
      this.aiSeenUpTo = Date.now();
      msg.createdAt = this.aiSeenUpTo + 1;
      if (!budgetOk) {
        msg.content =
          "This room has used today's free AI allowance. 💤 The host can switch to **Local mode** (runs on their own device, unlimited) in Room settings, or try again tomorrow.";
        msg.meta!.error = true;
      } else if (s.engine === "local") {
        await this.localTurn(msg);
      } else {
        this.abort = new AbortController();
        llm = [{ role: "system", content: this.systemPrompt(true) }, ...withFreshNote(this.history())];
        for (let i = 0; i < MAX_STEPS; i++) {
          const res = await chatWithFallback(this.env, {
            messages: llm,
            tools: TOOL_DEFS,
            signal: this.abort.signal,
            onDelta,
          });
          msg.meta!.model = `${res.provider} · ${res.model}`;
          if (!res.toolCalls.length) break;
          if (res.content && !/\s$/.test(msg.content)) onDelta("\n\n");
          llm.push({ role: "assistant", content: res.content || null, tool_calls: res.toolCalls });
          for (const call of res.toolCalls) {
            const output = await runTool(call.function.name, call.function.arguments, {
              env: this.env,
              roomCode: this.name,
              files: () => this.files(),
              createFile: (kind, title) => this.createFile(kind, title, "ai"),
              openFile: (id) => this.broadcastMsg({ t: "open_file", id }),
              step,
              sources,
            });
            llm.push({ role: "tool", tool_call_id: call.id, content: output });
            compactDocArgs(call);
          }
          if (i === MAX_STEPS - 2) {
            llm.push({ role: "system", content: "Tool budget reached. Write your final answer now without calling tools." });
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
    this.saveMessage(msg);
    this.broadcastMsg({ t: "ai_done", message: msg });
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
      if (m.role !== "assistant") return { role: "user" as const, content: `${m.authorName}: ${m.content}` };
      // Free tiers allow only a few thousand tokens per minute, so older AI replies are
      // clipped (the full text stays in the chat; docs hold the long-form work anyway).
      const cap = i === lastAi ? 4000 : 1200;
      const content = m.content.length > cap ? m.content.slice(0, cap) + " …(earlier reply clipped)" : m.content;
      return { role: "assistant" as const, content };
    });
  }

  private systemPrompt(withTools: boolean) {
    const s = this.settings!;
    const people = [...new Set(this.members().map((m) => m.name))].join(", ") || "nobody";
    const files = this.files();
    const skills = SKILLS.filter((k) => !s.disabledSkills.includes(k.name));
    const lines = [
      `You are Huddle AI, a helpful, capable assistant inside a multiplayer workspace room called "${s.title}".`,
      `Several people can be in the chat at once. Each user message is prefixed with the speaker's name ("Name: message"). Address people by name when helpful, keep track of who asked what, and when several people talk at once, answer each of them.`,
      `Respond to the messages that arrived after your last reply. Earlier messages are context only: never redo or re-answer a request you already handled.`,
      `People here now: ${people}. Today's date: ${new Date().toISOString().slice(0, 10)}.`,
      `Format with Markdown (headings, lists, tables, fenced code with language tags, LaTeX with $...$). Be concise by default and expand when asked.`,
    ];
    if (withTools) {
      lines.push(
        `You have tools: web_search and fetch_url for current or factual info, create_doc / read_doc / edit_doc for collaborative documents everyone can co-edit live, and load_skill for expert playbooks.`,
        `Use web_search for anything recent or time-sensitive (news, prices, releases, "this week"). Don't use tools for small talk.`,
        `Citations: only link URLs that appear word-for-word in your tool results. Never build, guess or "fix" a URL, and only call fetch_url on URLs from search results or from the users. If you can't find a source, say so.`,
        `Use create_doc when people ask you to write, draft, plan, outline or produce something substantial (reports, essays, plans, notes, slide outlines). Afterwards reply in chat with one or two sentences about what you made; don't repeat the doc's content.`,
        `To change an existing doc, use edit_doc with mode "append" to add a section, or read_doc then mode "replace" to rewrite it.`,
        `Docs are the only file type so far: don't offer spreadsheets, slides or other files. file_id values are internal; never show them to people, refer to docs by title.`,
        `Before specialised tasks, call load_skill with the most relevant skill. Available skills:`,
        ...skills.map((k) => `- ${k.name}: ${k.description}`),
        files.length
          ? `Files in this room:\n${files.map((f) => `- ${f.kind} "${f.title}" (file_id ${f.id})`).join("\n")}`
          : `There are no files in this room yet.`,
      );
    }
    return lines.join("\n");
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

  private files(): RoomFile[] {
    return this.sql<any>`SELECT * FROM files ORDER BY created_at DESC`.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      createdAt: r.created_at,
      createdBy: r.created_by,
    }));
  }

  private createFile(kind: "doc", title: string, by: string): RoomFile {
    const f: RoomFile = {
      id: crypto.randomUUID().slice(0, 12),
      kind,
      title: title.slice(0, 120) || "Untitled",
      createdAt: Date.now(),
      createdBy: by,
    };
    this.sql`INSERT INTO files (id, kind, title, created_at, created_by) VALUES (${f.id}, ${f.kind}, ${f.title}, ${f.createdAt}, ${f.createdBy})`;
    this.broadcastMsg({ t: "files", files: this.files() });
    return f;
  }

  // ---------- presence & messaging ----------

  private toMember(s: ConnState): Member {
    return { uid: s.uid, name: s.name, color: s.color, isHost: s.uid === this.settings?.hostId, typing: !!s.typing };
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
