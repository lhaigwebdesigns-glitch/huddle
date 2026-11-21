import { lazy, memo, Suspense, useEffect, useState, type ComponentType } from "react";
import type { FileVersion, RoomFile } from "../../shared/protocol";
import { FILE_INFO, type FileKind } from "../../shared/files";
import { History as HistoryIcon, Lock, X } from "lucide-react";
import { FileIcon } from "./FileIcon";
import type { Identity } from "../lib/identity";
import { useYDoc, type YConn } from "../lib/useYDoc";
import { LivePointers } from "./LivePointers";

export interface EditorProps extends YConn {
  room: string;
  file: RoomFile;
  me: Identity;
  synced: boolean;
  /** The project was turned in: show the file but don't allow edits. */
  readOnly?: boolean;
}

// Every editor loads on first use (see src/client/editors.ts) so the chat stays fast.
const EDITORS: Partial<Record<FileKind, ComponentType<EditorProps>>> = {};

export function registerEditor(kind: FileKind, loader: () => Promise<{ default: ComponentType<EditorProps> }>) {
  EDITORS[kind] = lazy(loader);
}

function timeAgo(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function History({ room, file, onClose }: { room: string; file: RoomFile; onClose: () => void }) {
  const [versions, setVersions] = useState<FileVersion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const url = `/api/rooms/${room}/files/${file.id}/versions`;
  const load = () =>
    fetch(url)
      .then((r) => r.json() as Promise<{ versions?: FileVersion[] }>)
      .then((d) => setVersions(d.versions ?? []));
  useEffect(() => void load(), [file.id]);
  const post = async (body: object) => {
    setBusy(true);
    await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    await load();
    setBusy(false);
  };
  return (
    <div className="border-b border-line bg-sidebar px-4 py-3 text-sm" data-testid="history">
      <div className="flex items-center gap-2">
        <span className="font-semibold">Version history</span>
        <button disabled={busy} onClick={() => post({})} className="press rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-40">
          Save version now
        </button>
        <span className="flex-1" />
        <button onClick={onClose} className="press rounded-md p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label="Close history">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-fg-subtle">Snapshots are saved every 10 minutes while people edit, and before the AI rewrites a file.</p>
      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
        {versions === null && <li className="text-fg-subtle">Loading…</li>}
        {versions?.length === 0 && <li className="text-fg-subtle">No saved versions yet.</li>}
        {versions?.map((v) => (
          <li key={v.at} className="flex items-center gap-2">
            <span className="flex-1 tabular">{timeAgo(v.at)}</span>
            <span className="text-xs text-fg-subtle tabular">{Math.max(1, Math.round(v.size / 1024))} KB</span>
            <button
              disabled={busy}
              onClick={() => confirm("Restore this version for everyone? The current version is saved first, so you can undo this.") && post({ restore: v.at })}
              className="press rounded-full border border-line-strong px-2.5 py-0.5 text-xs hover:bg-bg disabled:opacity-40"
            >
              Restore
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Body({ room, file, me, locked }: { room: string; file: RoomFile; me: Identity; locked: boolean }) {
  const { conn, synced } = useYDoc(room, file.id, me);
  const Editor = EDITORS[file.kind];
  if (!Editor) return <div className="p-6 text-sm text-fg-subtle">This file type isn't supported in this version of Huddle.</div>;
  if (!conn) return <div className="p-6 text-sm text-fg-subtle">Connecting to {FILE_INFO[file.kind].label.toLowerCase()}…</div>;
  return (
    <Suspense fallback={<div className="p-6 text-sm text-fg-subtle">Loading editor…</div>}>
      {/* Whiteboards draw their own live pointers on the canvas. */}
      <LivePointers provider={conn.provider} enabled={file.kind !== "whiteboard"}>
        {/* The server refuses edits to a locked file; disabling the controls makes that clear. */}
        <fieldset disabled={locked} className="contents">
          <Editor {...conn} room={room} file={file} me={me} synced={synced} readOnly={locked} />
        </fieldset>
      </LivePointers>
    </Suspense>
  );
}

export const FilePanel = memo(function FilePanel({
  room,
  file,
  me,
  onClose,
  onRename,
  locked = false,
}: {
  room: string;
  file: RoomFile;
  me: Identity;
  onClose: () => void;
  onRename: (title: string) => void;
  locked?: boolean;
}) {
  const [title, setTitle] = useState(file.title);
  const [history, setHistory] = useState(false);
  useEffect(() => setTitle(file.title), [file.title]);
  useEffect(() => setHistory(false), [file.id]);
  return (
    <div className="panel-in flex h-full min-h-0 flex-col bg-bg" data-testid="file-panel" data-kind={file.kind}>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <FileIcon kind={file.kind} className="h-4 w-4 shrink-0 text-fg-muted" />
        <input
          aria-label="File name"
          disabled={locked}
          className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-[15px] font-semibold tracking-tight outline-none hover:bg-surface-2 focus:bg-surface-2"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== file.title && onRename(title.trim())}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <button
          onClick={() => setHistory((h) => !h)}
          className={`press rounded-lg p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg ${history ? "bg-surface-2 text-fg" : ""}`}
          title="Version history"
          aria-label="Version history"
          aria-pressed={history}
        >
          <HistoryIcon className="h-4 w-4" />
        </button>
        <button onClick={onClose} className="press rounded-lg p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg" title="Close" aria-label="Close file">
          <X className="h-4 w-4" />
        </button>
      </div>
      {history && !locked && <History room={room} file={file} onClose={() => setHistory(false)} />}
      {locked && (
        <div className="flex items-center gap-2 border-b border-line bg-sidebar px-4 py-2 text-xs text-fg-muted" role="status" data-testid="locked-banner">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          This project was turned in, so this file is read-only. Ask your teacher to reopen it to make changes.
        </div>
      )}
      <Body key={file.id} room={room} file={file} me={me} locked={locked} />
    </div>
  );
});
