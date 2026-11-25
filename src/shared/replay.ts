import * as Y from "yjs";

/**
 * Writing replay: every change to a doc, in order, so the doc can be played back like a sped-up
 * video of it being written. It shows what happened (typing, pasting, the AI writing); it
 * never guesses who "really" wrote something. Students see the replay of their own docs, and
 * the teacher sees it when grading.
 */

/** One step of the replay: a Yjs update, when it happened, and who made it. */
export interface ReplayEntry {
  at: number;
  /** The person's uid, "ai" for Cairn AI, or null for changes that are nobody's work (copies, restores). */
  by: string | null;
  /** Characters typed or pasted in this step. */
  chars: number;
  u: Uint8Array;
}

export interface ReplayLog {
  /** The doc as it was when recording began. */
  base: Uint8Array;
  entries: ReplayEntry[];
  /** Recording stopped because the doc's replay got too long. */
  truncated: boolean;
  names: Record<string, string>;
}

/** Characters added by an update (text only), for marking pastes on the timeline. */
export function charsInUpdate(update: Uint8Array): number {
  let n = 0;
  for (const s of Y.decodeUpdate(update).structs) if (s instanceof Y.Item && s.content instanceof Y.ContentString) n += s.content.str.length;
  return n;
}

/** Steps closer together than this, by the same person, are played as one (keeps logs small). */
export const MERGE_MS = 1000;

/** Joins quick runs of edits by the same person into one step each. */
export function mergeSteps(entries: ReplayEntry[]): ReplayEntry[] {
  const out: ReplayEntry[] = [];
  let run: ReplayEntry[] = [];
  const flush = () => {
    if (!run.length) return;
    const last = run[run.length - 1];
    out.push(run.length === 1 ? last : { at: last.at, by: last.by, chars: run.reduce((s, e) => s + e.chars, 0), u: Y.mergeUpdates(run.map((e) => e.u)) });
    run = [];
  };
  for (const e of entries) {
    const prev = run[run.length - 1];
    // A step covers at most a second of typing, so steady typing still plays back as typing.
    if (prev && (prev.by !== e.by || e.at - run[0].at > MERGE_MS || prev.chars >= PASTE_STEP || e.chars >= PASTE_STEP)) flush();
    run.push(e);
  }
  flush();
  return out;
}

/** A step that adds this many characters at once reads as a paste (matches the work record). */
export const PASTE_STEP = 300;

/**
 * How long to wait before each step when playing at `speed`. Typing plays at its real pace
 * (times speed), and pauses are squeezed so a week of work plays in a minute or two.
 */
export function stepDelays(entries: Pick<ReplayEntry, "at">[], speed: number): number[] {
  return entries.map((e, i) => {
    if (i === 0) return 0;
    const gap = Math.max(0, e.at - entries[i - 1].at);
    // Up to 2 s of real time plays as is (sped up); longer breaks become a short beat.
    const shown = gap <= 2000 ? gap : 2000 + Math.min(1200, Math.log10(gap / 2000) * 400);
    return Math.max(16, shown / Math.max(0.25, speed));
  });
}

/** Breaks longer than this split the replay into sessions on the timeline. */
export const SESSION_GAP_MS = 20 * 60_000;

export function sessions(entries: Pick<ReplayEntry, "at">[]): { start: number; end: number; from: number; to: number }[] {
  const out: { start: number; end: number; from: number; to: number }[] = [];
  entries.forEach((e, i) => {
    const cur = out[out.length - 1];
    if (!cur || e.at - cur.end > SESSION_GAP_MS) out.push({ start: e.at, end: e.at, from: i, to: i });
    else (cur.end = e.at), (cur.to = i);
  });
  return out;
}

/** The doc after the first `n` steps, built from the nearest saved checkpoint. */
export class ReplayBuilder {
  private checkpoints: { n: number; state: Uint8Array }[] = [];
  constructor(
    private log: Pick<ReplayLog, "base" | "entries">,
    private every = 200,
  ) {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, log.base);
    this.checkpoints.push({ n: 0, state: Y.encodeStateAsUpdate(doc) });
    log.entries.forEach((e, i) => {
      Y.applyUpdate(doc, e.u);
      if ((i + 1) % every === 0) this.checkpoints.push({ n: i + 1, state: Y.encodeStateAsUpdate(doc) });
    });
    doc.destroy();
  }
  /** A fresh doc showing the first `n` steps. */
  at(n: number): Y.Doc {
    const k = Math.max(0, Math.min(n, this.log.entries.length));
    const cp = [...this.checkpoints].reverse().find((c) => c.n <= k)!;
    const doc = new Y.Doc();
    Y.applyUpdate(doc, cp.state);
    for (let i = cp.n; i < k; i++) Y.applyUpdate(doc, this.log.entries[i].u);
    return doc;
  }
}

// ---------- sending a log over HTTP (JSON, updates as base64) ----------

const b64 = (u: Uint8Array) => {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export interface ReplayJson {
  base: string;
  entries: { at: number; by: string | null; chars: number; u: string }[];
  truncated: boolean;
  names: Record<string, string>;
}
export const replayToJson = (l: ReplayLog): ReplayJson => ({ ...l, base: b64(l.base), entries: l.entries.map((e) => ({ ...e, u: b64(e.u) })) });
export const replayFromJson = (j: ReplayJson): ReplayLog => ({ ...j, base: unb64(j.base), entries: j.entries.map((e) => ({ ...e, u: unb64(e.u) })) });
