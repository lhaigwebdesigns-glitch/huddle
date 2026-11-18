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

  async onLoad() {
    const state = await this.readState("ydoc");
    if (state) return docFromState(state);
  }

  async onSave() {
    const state = Y.encodeStateAsUpdate(this.document);
    await this.writeState("ydoc", state);
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
    replaceContent(this.document, docFromState(state), kind);
    await this.onSave();
    return { ok: true as const };
  }

  async exportState(): Promise<Uint8Array> {
    return Y.encodeStateAsUpdate(this.document);
  }

  /** Copy another file's content into this (new, empty) file. */
  async importState(state: Uint8Array, kind: FileKind) {
    replaceContent(this.document, docFromState(new Uint8Array(state)), kind, "duplicate");
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

  async sheetOps(ops: SheetOp[], snapshotFirst = false) {
    if (snapshotFirst && cellsOf(this.document).size) await this.saveVersion();
    const done = applySheetOps(this.document, ops);
    await this.onSave();
    return done;
  }

  async readSheet(range?: string) {
    return readSheet(this.document, range);
  }

  // ---------- RPC: slides ----------

  async slideOps(ops: SlideOp[], snapshotFirst = false) {
    if (snapshotFirst && slidesOf(this.document).length) await this.saveVersion();
    const done = applySlideOps(this.document, ops);
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
    addResponse(this.document, v.answers);
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
