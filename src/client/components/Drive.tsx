import { useEffect, useRef, useState } from "react";
import type { ClientMsg, RoomFile } from "../../shared/protocol";
import { CREATABLE_KINDS, FILE_INFO } from "../../shared/files";

function FileRow({
  f,
  open,
  canDelete,
  onOpen,
  send,
}: {
  f: RoomFile;
  open: boolean;
  canDelete: boolean;
  onOpen: () => void;
  send: (m: ClientMsg) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(f.title);
  useEffect(() => setName(f.title), [f.title]);
  if (renaming)
    return (
      <li>
        <input
          autoFocus
          aria-label="New file name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name !== f.title) send({ t: "rename_file", id: f.id, title: name.trim() });
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") (setName(f.title), setRenaming(false));
          }}
          className="w-full rounded border border-indigo-300 bg-transparent px-2 py-1 text-sm dark:border-indigo-700"
        />
      </li>
    );
  return (
    <li className="group relative flex items-center" data-testid="drive-file">
      <button
        onClick={onOpen}
        className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${open ? "bg-zinc-100 font-medium dark:bg-zinc-800" : ""}`}
        title={`${FILE_INFO[f.kind].label}: ${f.title}`}
      >
        <span aria-hidden>{FILE_INFO[f.kind].icon}</span> {f.title}
      </button>
      <button
        onClick={() => setMenu((m) => !m)}
        className="rounded px-1.5 text-zinc-400 opacity-0 hover:bg-zinc-200 hover:text-zinc-700 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
        aria-label={`More actions for ${f.title}`}
        aria-expanded={menu}
      >
        ⋯
      </button>
      {menu && (
        <div
          className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-zinc-200 bg-white text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          role="menu"
          onMouseLeave={() => setMenu(false)}
        >
          <button role="menuitem" className="block w-full px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => (setMenu(false), setRenaming(true))}>
            Rename
          </button>
          <button role="menuitem" className="block w-full px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => (setMenu(false), send({ t: "duplicate_file", id: f.id }))}>
            Duplicate
          </button>
          {canDelete && (
            <button
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              onClick={() => {
                setMenu(false);
                if (confirm(`Delete “${f.title}” for everyone? This can't be undone.`)) send({ t: "delete_file", id: f.id });
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function Drive({
  files,
  openId,
  isHost,
  myUid,
  onOpen,
  send,
}: {
  files: RoomFile[];
  openId: string | null;
  isHost: boolean;
  myUid: string;
  onOpen: (id: string) => void;
  send: (m: ClientMsg) => void;
}) {
  const [q, setQ] = useState("");
  const [newMenu, setNewMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!newMenu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setNewMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [newMenu]);
  const shown = files.filter((f) => !q || f.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="px-3 pt-2" data-testid="drive">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Files</div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setNewMenu((m) => !m)}
            className="rounded px-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
            aria-expanded={newMenu}
            data-testid="new-file"
          >
            + New
          </button>
          {newMenu && (
            <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-zinc-200 bg-white text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900" role="menu">
              {CREATABLE_KINDS.map((k) => (
                <button
                  key={k}
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  onClick={() => {
                    setNewMenu(false);
                    send({ t: "new_file", kind: k, title: FILE_INFO[k].untitled });
                  }}
                >
                  <span aria-hidden>{FILE_INFO[k].icon}</span> {FILE_INFO[k].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {files.length > 5 && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search files…"
          aria-label="Search files"
          className="mt-1 w-full rounded-md border border-zinc-200 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
        />
      )}
      <ul className="mt-1 max-h-64 space-y-0.5 overflow-y-auto">
        {files.length === 0 && <li className="py-1 text-sm text-zinc-400">No files yet. Make one, or ask the AI.</li>}
        {files.length > 0 && shown.length === 0 && <li className="py-1 text-sm text-zinc-400">No files match “{q}”.</li>}
        {shown.map((f) => (
          <FileRow key={f.id} f={f} open={openId === f.id} canDelete={isHost || f.createdBy === myUid} onOpen={() => onOpen(f.id)} send={send} />
        ))}
      </ul>
    </div>
  );
}
