import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { EditorContent, useEditor } from "@tiptap/react";
import Collaboration from "@tiptap/extension-collaboration";
import { Pause, Play, RotateCcw, X } from "lucide-react";
import { docExtensions } from "../lib/docExtensions";
import { PASTE_STEP, ReplayBuilder, replayFromJson, sessions, stepDelays, type ReplayJson, type ReplayLog } from "../../shared/replay";
import { wordsFromChars } from "../../shared/classes";
import type { RoomFile } from "../../shared/protocol";

/**
 * Writing replay: the doc played back the way it was written, like a sped-up video. It shows
 * what happened (typing, pasting, the AI writing); it doesn't judge it. Students see their own
 * docs' replay, and the teacher sees the same thing when grading.
 */

const SPEEDS = [1, 4, 16] as const;
const when = (ms: number) => new Date(ms).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** The doc at one moment of the replay, read-only. */
function Frame({ doc }: { doc: Y.Doc }) {
  const editor = useEditor({ editable: false, extensions: [...docExtensions(), Collaboration.configure({ document: doc })] }, [doc]);
  return <EditorContent editor={editor} className="prose prose-zinc max-w-none px-6 py-6 dark:prose-invert md:px-10" data-testid="replay-doc" />;
}

export default function ReplayView({ room, file, onClose }: { room: string; file: RoomFile; onClose: () => void }) {
  const [log, setLog] = useState<ReplayLog | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    fetch(`/api/rooms/${room}/files/${file.id}/replay`)
      .then(async (r) => {
        const d = (await r.json()) as ReplayJson & { error?: string };
        if (!r.ok) throw new Error(d.error ?? "Couldn't load the replay.");
        if (live) setLog(replayFromJson(d));
      })
      .catch((e: Error) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, [room, file.id]);

  if (err) return <Shell onClose={onClose}><p className="p-6 text-sm text-fg-muted">{err}</p></Shell>;
  if (!log) return <Shell onClose={onClose}><p className="p-6 text-sm text-fg-subtle">Loading the replay…</p></Shell>;
  return <Player log={log} onClose={onClose} />;
}

function Shell({ onClose, children, bar }: { onClose: () => void; children: React.ReactNode; bar?: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="replay">
      <div className="flex items-center gap-2 border-b border-line bg-sidebar px-4 py-2 text-sm">
        <span className="font-semibold">Writing replay</span>
        <span className="hidden text-xs text-fg-subtle sm:inline">How this doc was written, step by step. The writer sees this too.</span>
        <span className="flex-1" />
        <button onClick={onClose} className="press rounded-md p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label="Close replay" data-testid="replay-close">
          <X className="h-4 w-4" />
        </button>
      </div>
      {bar}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function Player({ log, onClose }: { log: ReplayLog; onClose: () => void }) {
  const n = log.entries.length;
  const builder = useMemo(() => new ReplayBuilder(log), [log]);
  const [pos, setPos] = useState(0);
  const [doc, setDoc] = useState(() => builder.at(0));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(4);
  const posRef = useRef(0);
  const delays = useMemo(() => stepDelays(log.entries, speed), [log, speed]);
  const parts = useMemo(() => sessions(log.entries), [log]);
  const pastes = useMemo(() => log.entries.map((e, i) => (e.chars >= PASTE_STEP && e.by && e.by !== "ai" ? i : -1)).filter((i) => i >= 0), [log]);

  const seek = (to: number) => {
    const k = Math.max(0, Math.min(n, to));
    posRef.current = k;
    setPos(k);
    setDoc(builder.at(k));
  };
  // Playing: apply the next step to the doc on screen (no rebuild), at the step's own pace.
  useEffect(() => {
    if (!playing) return;
    if (posRef.current >= n) return setPlaying(false);
    const t = setTimeout(() => {
      const i = posRef.current;
      Y.applyUpdate(doc, log.entries[i].u);
      posRef.current = i + 1;
      setPos(i + 1);
    }, delays[posRef.current] ?? 16);
    return () => clearTimeout(t);
  }, [playing, pos, doc, delays, log, n]);
  useEffect(() => () => doc.destroy(), [doc]);

  const step = pos > 0 ? log.entries[pos - 1] : null;
  const who = (by: string | null) => (by ? (log.names[by] ?? "Someone") : null);
  const what = !step
    ? n
      ? "Start: the doc before any recorded changes."
      : "Nothing recorded yet. Replay records from the first change on."
    : !step.by
      ? "Copied in or restored (nobody's new work)"
      : step.by === "ai"
        ? `${who(step.by)} wrote ${step.chars ? `about ${Math.max(1, wordsFromChars(step.chars))} words` : "in the doc"}`
        : step.chars >= PASTE_STEP
          ? `${who(step.by)} pasted about ${wordsFromChars(step.chars)} words`
          : `${who(step.by)} ${step.chars ? "typing" : "editing"}`;

  const bar = (
    <div className="border-b border-line px-4 py-2.5" data-testid="replay-bar">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            if (playing) return setPlaying(false);
            if (pos >= n) seek(0);
            setPlaying(true);
          }}
          disabled={!n}
          className="press inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-40"
          aria-label={playing ? "Pause the replay" : "Play the replay"}
          data-testid="replay-play"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : pos >= n && n ? <RotateCcw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {playing ? "Pause" : pos >= n && n ? "Again" : "Play"}
        </button>
        <div className="flex rounded-lg border border-line p-0.5 text-[11px] font-semibold" role="radiogroup" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button key={s} role="radio" aria-checked={speed === s} onClick={() => setSpeed(s)} className={`press rounded-md px-2 py-0.5 ${speed === s ? "bg-surface-2 text-fg" : "text-fg-subtle hover:text-fg"}`}>
              {s}×
            </button>
          ))}
        </div>
        <span className="min-w-0 flex-1 truncate text-xs text-fg-muted" aria-live="polite" data-testid="replay-step">
          {step && <span className="tabular text-fg-subtle">{when(step.at)} · </span>}
          {what}
        </span>
        <span className="text-xs text-fg-subtle tabular">
          {pos}/{n}
        </span>
      </div>
      <div className="relative mt-2">
        <input
          type="range"
          min={0}
          max={n}
          step={1}
          value={pos}
          disabled={!n}
          onChange={(e) => {
            setPlaying(false);
            seek(Number(e.target.value));
          }}
          aria-label="Move through the replay"
          aria-valuetext={step ? when(step.at) : "Start"}
          className="w-full accent-[var(--color-green)]"
          data-testid="replay-scrub"
        />
        {/* Pastes and new sessions, marked on the timeline. */}
        <div className="pointer-events-none absolute inset-x-[8px] -bottom-1 h-1.5" aria-hidden>
          {pastes.map((i) => (
            <span key={i} className="absolute h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-peri" style={{ left: `${((i + 1) / n) * 100}%` }} data-testid="replay-paste" />
          ))}
          {parts.slice(1).map((p) => (
            <span key={p.from} className="absolute h-2 w-px -translate-x-1/2 bg-fg-subtle" style={{ left: `${(p.from / n) * 100}%` }} />
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-fg-subtle" data-testid="replay-summary">
        {n
          ? `${parts.length} work session${parts.length === 1 ? "" : "s"}, from ${when(log.entries[0].at)} to ${when(log.entries[n - 1].at)}. ${pastes.length ? `${pastes.length} large paste${pastes.length === 1 ? "" : "s"} (dots).` : "No large pastes."}`
          : "Changes made from now on will play back here."}
        {log.truncated && " This doc got very long, so the replay stopped recording partway."}
      </p>
    </div>
  );

  return (
    <Shell onClose={onClose} bar={bar}>
      <Frame doc={doc} />
    </Shell>
  );
}
