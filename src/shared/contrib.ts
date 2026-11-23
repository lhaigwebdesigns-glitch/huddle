import * as Y from "yjs";
import type { FileKind } from "./files";
import { cellsOf } from "./sheet-model";
import { slidesOf } from "./slides-model";
import { questionsOf } from "./forms-model";
import { elementsOf } from "./whiteboard-model";

/** Who wrote part of a file. uid "ai" is Huddle AI. */
export interface Author {
  uid: string;
  name: string;
}
export const AI_AUTHOR: Author = { uid: "ai", name: "Huddle AI" };

/** What one person has in a file right now: words still in it, plus slides / cells / questions / shapes. */
export interface Share {
  words: number;
  units: number;
}

/** What a "unit" is for each kind of file (docs only count words). */
export const UNIT_LABEL: Partial<Record<FileKind, [string, string]>> = {
  slides: ["slide", "slides"],
  sheet: ["cell", "cells"],
  form: ["question", "questions"],
  whiteboard: ["shape", "shapes"],
};

const countWords = (s: string) => s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;

/**
 * Credits what is in a file *now* to the people who wrote it, using Yjs' own record of which
 * client inserted each piece. Deleted text doesn't count, so pasting a lot and deleting it
 * earns nothing, and rewriting someone's sentence moves the credit to whoever wrote the new one.
 */
export function sharesOf(doc: Y.Doc, kind: FileKind, authorOf: (client: number) => string | null): Record<string, Share> {
  const unitParent: Y.AbstractType<any> | null =
    kind === "sheet" ? cellsOf(doc) : kind === "slides" ? slidesOf(doc) : kind === "form" ? questionsOf(doc) : kind === "whiteboard" ? elementsOf(doc) : null;
  const out: Record<string, Share> = {};
  const add = (who: string, words: number, units: number) => {
    const s = (out[who] ??= { words: 0, units: 0 });
    s.words += words;
    s.units += units;
  };
  // Words: read every text in document order, in runs by the same writer, so a word is
  // counted once however the editor split it into pieces.
  const seen = new Set<Y.AbstractType<any>>();
  const walk = (type: Y.AbstractType<any>) => {
    if (seen.has(type)) return;
    seen.add(type);
    let run = "";
    let runClient = -1;
    const flush = () => {
      const who = runClient >= 0 ? authorOf(runClient) : null;
      if (who && run) add(who, countWords(run), 0);
      run = "";
      runClient = -1;
    };
    for (let item = type._start; item; item = item.right) {
      if (item.deleted) continue;
      if (item.content instanceof Y.ContentString) {
        if (item.id.client !== runClient) flush(), (runClient = item.id.client);
        run += item.content.str;
      } else if (item.content instanceof Y.ContentType) {
        flush();
        walk(item.content.type);
      } else if (!(item.content instanceof Y.ContentFormat)) flush();
    }
    flush();
    type._map.forEach((item) => {
      if (!item.deleted && item.content instanceof Y.ContentType) walk(item.content.type);
    });
  };
  doc.share.forEach((t) => walk(t));
  // Units: slides, cells, questions and shapes each person made that are still there.
  if (unitParent)
    doc.store.clients.forEach((structs, client) => {
      const who = authorOf(client);
      if (!who) return;
      let units = 0;
      for (const s of structs) if (s instanceof Y.Item && !s.deleted && s.parent === unitParent) units += s.parentSub != null ? 1 : s.length;
      if (units) add(who, 0, units);
    });
  for (const [k, v] of Object.entries(out)) if (!v.words && !v.units) delete out[k];
  return out;
}

/** "Mon, Nov 23" style key for a timeline day (UTC, so every server agrees). */
export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** An insert this big in one go is shown on the work timeline as a paste. */
export const PASTE_CHARS = 300;

/**
 * Characters of text one client added since `fromClock` (what a single edit typed or pasted).
 * New pieces are at the end of the client's list, so this walks backwards and stops early.
 */
export function insertedChars(doc: Y.Doc, client: number, fromClock: number): number {
  const structs = doc.store.clients.get(client);
  if (!structs) return 0;
  let chars = 0;
  for (let i = structs.length - 1; i >= 0; i--) {
    const s = structs[i];
    if (s.id.clock + s.length <= fromClock) break;
    if (s instanceof Y.Item && s.content instanceof Y.ContentString) {
      // Only the part of this piece that's new in this edit.
      const start = Math.max(0, fromClock - s.id.clock);
      chars += Math.max(0, s.content.str.length - start);
    }
  }
  return chars;
}
