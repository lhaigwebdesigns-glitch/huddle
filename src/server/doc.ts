import { YServer } from "y-partyserver";
import * as Y from "yjs";
import type { Env } from "./env";
import type { FileKind, FileVersion } from "../shared/protocol";
import { readMarkdown, writeMarkdown } from "./markdown-yjs";
import { chunk, docFromState, replaceContent, unchunk } from "./yjs-files";
import { applySheetOps, cellsOf, readSheet, type SheetOp } from "../shared/sheet-model";
import { applySlideOps, deckOutline, slidesOf, type SlideOp } from "../shared/slides-model";
import { boardSummary, queueDrawing } from "../shared/whiteboard-model";
import { addVersion, latestHtml } from "../shared/artifact-model";
import { AI_AUTHOR, dayKey, sharesOf, type Author } from "../shared/contrib";
import {
  addResponse,
  formMetaOf,
  makeQuestion,
  publicForm,
  questionsOf,
  responseRows,
  summarize,
  validateAnswers,
  type PublicForm,
  type Question,
} from "../shared/forms-model";

const freshClientId = () => crypto.getRandomValues(new Uint32Array(1))[0];

/** Take a version-history snapshot at most this often while people edit. */
const SNAPSHOT_EVERY_MS = 10 * 60_000;
const MAX_VERSIONS = 30;

/**
 * One Durable Object per file ("<ROOMCODE>--<fileId>"), for every kind of file: docs,
 * sheets, slides, whiteboards, forms and artifacts. It holds one Yjs document; people edit
 * it through their editor over WebSocket, the AI edits it through the RPC methods here,
 * and everyone sees changes live. (Named "Doc" for compatibility with the original binding.)
 */
export class Doc extends YServer<Env> {
  static callbackOptions = { debounceWait: 1500, debounceMaxWait: 8000 };

  /** Turned-in projects lock their files: edits from people's editors are refused. */
  private locked = false;

  // ---------- who wrote what (contribution receipts) ----------

  /** Yjs client id → the person (or Huddle AI) whose edits carry it. */
  private authors = new Map<number, Author>();
  /** day → uid (or "c:<client>" until we learn who that is) → edits that day. */
  private activity: Record<string, Record<string, number>> = {};
  /** Who server-side changes count for: the AI by default; null = nobody (restores, copies, starter content). */
  private actor: Author | null = AI_AUTHOR;

  async onStart() {
    await super.onStart();
    this.document.on("afterTransaction", (tr: Y.Transaction) => this.attribute(tr));
    // People announce themselves (uid, name) in awareness, keyed by the same client id.
    this.document.awareness.on("change", () => this.learnAuthors());
  }

  private personFor(client: number): Author | null {
    const user = this.document.awareness.getStates().get(client)?.user as { uid?: unknown; name?: unknown } | undefined;
    return user && typeof user.uid === "string" && user.uid
      ? { uid: user.uid.slice(0, 64), name: String(user.name ?? "Someone").slice(0, 40) }
      : null;
  }

  private attribute(tr: Y.Transaction) {
    const changed: number[] = [];
    tr.afterState.forEach((clock, client) => {
      if (clock > (tr.beforeState.get(client) ?? 0)) changed.push(client);
    });
    if (!changed.length) return;
    const fromPerson = !!tr.origin && typeof (tr.origin as { send?: unknown }).send === "function";
    let learned = false;
    const day = dayKey(Date.now());
    for (const client of changed) {
      let who = this.authors.get(client);
      if (!who) {
        const found = fromPerson ? this.personFor(client) : this.actor;
        if (found) {
          this.authors.set(client, found);
          who = found;
          learned = true;
        } else if (!fromPerson) continue; // a restore or copy: nobody's new work
      }
      const key = who?.uid ?? `c:${client}`;
      const today = (this.activity[day] ??= {});
      today[key] = (today[key] ?? 0) + 1;
    }
    if (learned) this.ctx.waitUntil(this.ctx.storage.put("authors", [...this.authors]));
  }

  /** Edits that arrived before the person's name did get credited once they show up. */
  private learnAuthors() {
    let learned = false;
    for (const day of Object.values(this.activity))
      for (const key of Object.keys(day)) {
        if (!key.startsWith("c:")) continue;
        const client = Number(key.slice(2));
        const who = this.authors.get(client) ?? this.personFor(client);
        if (!who) continue;
        if (!this.authors.has(client)) this.authors.set(client, who), (learned = true);
        day[who.uid] = (day[who.uid] ?? 0) + day[key];
        delete day[key];
      }
    if (learned) this.ctx.waitUntil(this.ctx.storage.put("authors", [...this.authors]));
  }

  /** Run a server-side change credited to `actor` (null: credited to nobody). */
  private as<T>(actor: Author | null, fn: () => T): T {
    const prev = this.actor;
    this.actor = actor;
    // A fresh client id per credited change, so each one maps to exactly one author.
    this.document.clientID = freshClientId();
    try {
      return fn();
    } finally {
      this.actor = prev;
      this.document.clientID = freshClientId();
    }
  }

  /** What each person has in this file now, plus which days they worked on it. */
  async contributions(kind: FileKind) {
    this.learnAuthors();
    const shares = sharesOf(this.document, kind, (c) => this.authors.get(c)?.uid ?? null);
    const names: Record<string, string> = {};
    for (const a of this.authors.values()) names[a.uid] = a.name;
    const days: Record<string, string[]> = {};
    for (const [day, people] of Object.entries(this.activity))
      days[day] = Object.keys(people).filter((k) => !k.startsWith("c:"));
    return { shares, names, days };
  }

  isReadOnly() {
    return this.locked;
  }

  async setLocked(on: boolean) {
    this.locked = on;
    await this.ctx.storage.put("locked", on);
    return { ok: true };
  }

  async onLoad() {
    this.locked = !!(await this.ctx.storage.get<boolean>("locked"));
    this.authors = new Map((await this.ctx.storage.get<[number, Author][]>("authors")) ?? []);
    this.activity = (await this.ctx.storage.get<Record<string, Record<string, number>>>("activity")) ?? {};
    const state = await this.readState("ydoc");
    if (state) return docFromState(state);
  }

  async onSave() {
    const state = Y.encodeStateAsUpdate(this.document);
    await this.writeState("ydoc", state);
    await this.ctx.storage.put("activity", this.activity);
    // Version history: snapshot periodically while the file is being edited.
    const versions = (await this.ctx.storage.get<FileVersion[]>("versions")) ?? [];
    const lastAt = versions[versions.length - 1]?.at ?? 0;
    if (Date.now() - lastAt >= SNAPSHOT_EVERY_MS) await this.snapshot(versions, state);
  }

  // ---------- chunked storage (single values are size-capped) ----------

  private async readState(key: string): Promise<Uint8Array | null> {
    const count = await this.ctx.storage.get<number>(`${key}:n`);
    if (count === undefined) {
      // Files saved before chunking stored one value.
      const single = await this.ctx.storage.get<Uint8Array>(key);
      return single ? new Uint8Array(single) : null;
    }
    const keys = Array.from({ length: count }, (_, i) => `${key}:${i}`);
    const parts = await this.ctx.storage.get<Uint8Array>(keys);
    return unchunk(keys.map((k) => new Uint8Array(parts.get(k) ?? new Uint8Array())));
  }

  private async writeState(key: string, state: Uint8Array) {
    const parts = chunk(state);
    const prev = (await this.ctx.storage.get<number>(`${key}:n`)) ?? 0;
    const entries: Record<string, unknown> = { [`${key}:n`]: parts.length };
    parts.forEach((p, i) => (entries[`${key}:${i}`] = p));
    // storage.put(object) accepts up to 128 keys per call.
    const all = Object.entries(entries);
    for (let i = 0; i < all.length; i += 100) await this.ctx.storage.put(Object.fromEntries(all.slice(i, i + 100)));
    const stale = Array.from({ length: Math.max(0, prev - parts.length) }, (_, i) => `${key}:${parts.length + i}`);
    if (stale.length) await this.ctx.storage.delete(stale);
    if (!prev) await this.ctx.storage.delete(key); // drop the old unchunked value
  }

  private async snapshot(versions: FileVersion[], state: Uint8Array) {
    const at = Date.now();
    await this.writeState(`v${at}`, state);
    versions.push({ at, size: state.length });
    while (versions.length > MAX_VERSIONS) {
      const old = versions.shift()!;
      const n = (await this.ctx.storage.get<number>(`v${old.at}:n`)) ?? 0;
      await this.ctx.storage.delete([`v${old.at}:n`, ...Array.from({ length: n }, (_, i) => `v${old.at}:${i}`)]);
    }
    await this.ctx.storage.put("versions", versions);
  }

  // ---------- RPC: generic file operations ----------

  async listVersions(): Promise<FileVersion[]> {
    return ((await this.ctx.storage.get<FileVersion[]>("versions")) ?? []).slice().reverse();
  }

  /** Save a version now (e.g. before the AI rewrites a file, or from the History panel). */
  async saveVersion() {
    const versions = (await this.ctx.storage.get<FileVersion[]>("versions")) ?? [];
    await this.snapshot(versions, Y.encodeStateAsUpdate(this.document));
    return { ok: true };
  }

  async restoreVersion(at: number, kind: FileKind) {
    const state = await this.readState(`v${at}`);
    if (!state) return { ok: false as const, error: "Version not found" };
    // Keep the current state as a version too, so a restore can be undone.
    await this.saveVersion();
    // Restored text keeps no author: it isn't anyone's new work.
    this.as(null, () => replaceContent(this.document, docFromState(state), kind));
    await this.onSave();
    return { ok: true as const };
  }

  async exportState(): Promise<Uint8Array> {
    return Y.encodeStateAsUpdate(this.document);
  }

  /** Copy another file's content into this (new, empty) file. */
  async importState(state: Uint8Array, kind: FileKind) {
    this.as(null, () => replaceContent(this.document, docFromState(new Uint8Array(state)), kind, "duplicate"));
    await this.onSave();
    return { ok: true };
  }

  async wipe() {
    for (const conn of this.getConnections()) conn.close(4004, "File deleted");
    await this.ctx.storage.deleteAll();
    return { ok: true };
  }

  // ---------- RPC: stored uploads (when there's no R2 bucket; see blobs.ts) ----------

  async putBlob(bytes: Uint8Array, type: string, name: string) {
    const CHUNK = 1_000_000; // stays under the 2 MB per-value limit
    const data = new Uint8Array(bytes);
    const parts: Record<string, unknown> = { "blob:meta": { type, name, n: Math.ceil(data.length / CHUNK) } };
    for (let i = 0; i * CHUNK < data.length; i++) parts[`blob:${i}`] = data.slice(i * CHUNK, (i + 1) * CHUNK);
    await this.ctx.storage.put(parts);
    return { ok: true };
  }

  async getBlob(): Promise<{ bytes: Uint8Array; type: string; name: string } | null> {
    const meta = await this.ctx.storage.get<{ type: string; name: string; n: number }>("blob:meta");
    if (!meta) return null;
    const keys = Array.from({ length: meta.n }, (_, i) => `blob:${i}`);
    const got = await this.ctx.storage.get<Uint8Array>(keys);
    const parts = keys.map((k) => got.get(k) ?? new Uint8Array());
    const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let at = 0;
    for (const p of parts) out.set(p, at), (at += p.length);
    return { bytes: out, type: meta.type, name: meta.name };
  }

  // ---------- RPC: docs ----------

  async setMarkdown(markdown: string, mode: "replace" | "append" = "replace") {
    // Keep what people had before the AI rewrites a doc (skip brand-new empty docs).
    if (mode === "replace" && this.document.getXmlFragment("default").length) await this.saveVersion();
    writeMarkdown(this.document, markdown, mode);
    await this.onSave();
    return { ok: true };
  }

  async getMarkdown() {
    return readMarkdown(this.document);
  }

  // ---------- RPC: sheets ----------

  async sheetOps(ops: SheetOp[], snapshotFirst = false, actor: Author | null = AI_AUTHOR) {
    if (snapshotFirst && cellsOf(this.document).size) await this.saveVersion();
    const done = this.as(actor, () => applySheetOps(this.document, ops));
    await this.onSave();
    return done;
  }

  async readSheet(range?: string) {
    return readSheet(this.document, range);
  }

  // ---------- RPC: slides ----------

  async slideOps(ops: SlideOp[], snapshotFirst = false, actor: Author | null = AI_AUTHOR) {
    if (snapshotFirst && slidesOf(this.document).length) await this.saveVersion();
    const done = this.as(actor, () => applySlideOps(this.document, ops));
    await this.onSave();
    return done;
  }

  async readDeck() {
    return deckOutline(this.document);
  }

  // ---------- RPC: whiteboards ----------

  async queueDrawing(d: { mermaid?: string; shapes?: unknown[] }) {
    const id = queueDrawing(this.document, d);
    await this.onSave();
    return id;
  }

  async readBoard() {
    return boardSummary(this.document);
  }

  // ---------- RPC: forms ----------

  async setupForm(description: string, questions: Partial<Question>[]) {
    this.document.transact(() => {
      if (description) formMetaOf(this.document).set("description", description.slice(0, 2000));
      formMetaOf(this.document).set("accepting", true);
      questionsOf(this.document).push(questions.slice(0, 50).map(makeQuestion));
    }, "ai");
    await this.onSave();
    return questionsOf(this.document).length;
  }

  async getPublicForm(title: string): Promise<PublicForm> {
    return publicForm(this.document, title);
  }

  async submitForm(title: string, input: unknown) {
    const form = publicForm(this.document, title);
    if (!form.accepting) return { ok: false as const, error: "This form is no longer accepting responses." };
    if (!form.questions.length) return { ok: false as const, error: "This form has no questions yet." };
    const v = validateAnswers(form.questions, input);
    if (!v.ok) return v;
    // Form responses come from outside the group: nobody's project work.
    this.as(null, () => addResponse(this.document, v.answers));
    await this.onSave();
    return { ok: true as const };
  }

  async formSummary() {
    return summarize(this.document);
  }

  async formRows() {
    return responseRows(this.document);
  }

  // ---------- RPC: artifacts ----------

  async addArtifactVersion(html: string, note: string, by: string) {
    const n = addVersion(this.document, html, note, by);
    await this.onSave();
    return n;
  }

  async artifactHtml() {
    return latestHtml(this.document);
  }
}
