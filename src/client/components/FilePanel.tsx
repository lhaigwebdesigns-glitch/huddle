import { lazy, memo, Suspense, useEffect, useState, type ComponentType } from "react";
import type { FileVersion, RoomFile } from "../../shared/protocol";
import { FILE_INFO, type FileKind } from "../../shared/files";
import type { Identity } from "../lib/identity";
import { useYDoc, type YConn } from "../lib/useYDoc";
import { DocEditor } from "./DocEditor";

export interface EditorProps extends YConn {
  room: string;
  file: RoomFile;
  me: Identity;
  synced: boolean;
}

// Heavier editors load on first use so the chat stays fast.
const EDITORS: Partial<Record<FileKind, ComponentType<EditorProps>>> = {
  doc: DocEditor,
};

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
    <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950" data-testid="history">
      <div className="flex items-center gap-2">
        <span className="font-semibold">Version history</span>
        <button disabled={busy} onClick={() => post({})} className="rounded bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white disabled:opacity-50">
          Save version now
        </button>
        <span className="flex-1" />
        <button onClick={onClose} className="rounded px-1 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800" aria-label="Close history">
          ✕
        </button>
      </div>
      <p className="mt-1 text-xs text-zinc-500">Snapshots are saved every 10 minutes while people edit, and before the AI rewrites a file.</p>
      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
        {versions === null && <li className="text-zinc-500">Loading…</li>}
        {versions?.length === 0 && <li className="text-zinc-500">No saved versions yet.</li>}
        {versions?.map((v) => (
          <li key={v.at} className="flex items-center gap-2">
            <span className="flex-1">{timeAgo(v.at)}</span>
            <span className="text-xs text-zinc-400">{Math.max(1, Math.round(v.size / 1024))} KB</span>
            <button
              disabled={busy}
              onClick={() => confirm("Restore this version for everyone? The current version is saved first, so you can undo this.") && post({ restore: v.at })}
              className="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-white disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Restore
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Body({ room, file, me }: { room: string; file: RoomFile; me: Identity }) {
  const { conn, synced } = useYDoc(room, file.id, me);
  const Editor = EDITORS[file.kind];
  if (!Editor) return <div className="p-6 text-sm text-zinc-500">This file type isn't supported in this version of Huddle.</div>;
  if (!conn) return <div className="p-6 text-sm text-zinc-500">Connecting to {FILE_INFO[file.kind].label.toLowerCase()}…</div>;
  return (
    <Suspense fallback={<div className="p-6 text-sm text-zinc-500">Loading editor…</div>}>
      <Editor {...conn} room={room} file={file} me={me} synced={synced} />
    </Suspense>
  );
}

export const FilePanel = memo(function FilePanel({
  room,
  file,
  me,
  onClose,
  onRename,
}: {
  room: string;
  file: RoomFile;
  me: Identity;
  onClose: () => void;
  onRename: (title: string) => void;
}) {
  const [title, setTitle] = useState(file.title);
  const [history, setHistory] = useState(false);
  useEffect(() => setTitle(file.title), [file.title]);
  useEffect(() => setHistory(false), [file.id]);
  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-zinc-900" data-testid="file-panel" data-kind={file.kind}>
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <span aria-hidden>{FILE_INFO[file.kind].icon}</span>
        <input
          aria-label="File name"
          className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== file.title && onRename(title.trim())}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <button
          onClick={() => setHistory((h) => !h)}
          className={`rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${history ? "bg-zinc-100 dark:bg-zinc-800" : ""}`}
          title="Version history"
          aria-label="Version history"
          aria-pressed={history}
        >
          🕘
        </button>
        <button onClick={onClose} className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Close" aria-label="Close file">
          ✕
        </button>
      </div>
      {history && <History room={room} file={file} onClose={() => setHistory(false)} />}
      <Body key={file.id} room={room} file={file} me={me} />
    </div>
  );
});
