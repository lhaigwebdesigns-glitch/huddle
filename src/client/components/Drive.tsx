import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import type { ClientMsg, RoomFile } from "../../shared/protocol";
import { CREATABLE_KINDS, FILE_INFO } from "../../shared/files";
import { FileIcon } from "./FileIcon";

const MENU = "pop absolute z-30 mt-1 overflow-hidden rounded-xl border border-line bg-surface p-1 text-[13.5px] shadow-[0_16px_40px_-12px_rgba(0,0,0,0.25)]";
const ITEM = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-fg transition-colors hover:bg-surface-2";

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement & HTMLLIElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

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
  const ref = useOutside(menu, () => setMenu(false));
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
          className="w-full rounded-lg border border-fg bg-bg px-2.5 py-1.5 text-[13.5px] outline-none"
        />
      </li>
    );
  return (
    <li ref={ref} className="group relative flex items-center" data-testid="drive-file">
      <button
        onClick={onOpen}
        className={`press flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] ${
          open ? "bg-accent-soft text-fg" : "text-fg-muted hover:bg-accent-soft hover:text-fg"
        }`}
        title={`${FILE_INFO[f.kind].label}: ${f.title}`}
      >
        <FileIcon kind={f.kind} className="h-4 w-4 shrink-0" />
        <span className="truncate">{f.title}</span>
      </button>
      <button
        onClick={() => setMenu((m) => !m)}
        className={`absolute right-1 rounded-md p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg focus:opacity-100 group-hover:opacity-100 ${menu ? "opacity-100" : "opacity-0"}`}
        aria-label={`More actions for ${f.title}`}
        aria-expanded={menu}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {menu && (
        <div className={`${MENU} right-0 top-full w-40`} role="menu">
          <button role="menuitem" className={ITEM} onClick={() => (setMenu(false), setRenaming(true))}>
            Rename
          </button>
          <button role="menuitem" className={ITEM} onClick={() => (setMenu(false), send({ t: "duplicate_file", id: f.id }))}>
            Duplicate
          </button>
          {canDelete && (
            <button
              role="menuitem"
              className={`${ITEM} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40`}
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
  const menuRef = useOutside(newMenu, () => setNewMenu(false));
  const shown = files.filter((f) => !q || f.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="px-3" data-testid="drive">
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setNewMenu((m) => !m)}
          className="press flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] font-medium text-fg hover:bg-accent-soft"
          aria-expanded={newMenu}
          data-testid="new-file"
        >
          <Plus className="h-4 w-4" /> New file
        </button>
        {newMenu && (
          <div className={`${MENU} left-0 w-52 [--origin:top_left]`} role="menu">
            {CREATABLE_KINDS.map((k) => (
              <button
                key={k}
                role="menuitem"
                className={ITEM}
                onClick={() => {
                  setNewMenu(false);
                  send({ t: "new_file", kind: k, title: FILE_INFO[k].untitled });
                }}
              >
                <FileIcon kind={k} className="h-4 w-4 text-fg-muted" /> {FILE_INFO[k].label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 px-2.5 text-xs font-medium text-fg-subtle">Files</div>
      {files.length > 5 && (
        <label className="mt-1.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-fg-subtle focus-within:bg-accent-soft">
          <Search className="h-3.5 w-3.5" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search files…"
            aria-label="Search files"
            className="w-full bg-transparent text-[13.5px] text-fg outline-none"
          />
        </label>
      )}
      <ul className="mt-1 max-h-64 space-y-px overflow-y-auto">
        {files.length === 0 && <li className="px-2.5 py-1.5 text-[13px] leading-snug text-fg-subtle">No files yet. Make one, or ask the AI.</li>}
        {files.length > 0 && shown.length === 0 && <li className="px-2.5 py-1.5 text-[13px] text-fg-subtle">No files match “{q}”.</li>}
        {shown.map((f) => (
          <FileRow key={f.id} f={f} open={openId === f.id} canDelete={isHost || f.createdBy === myUid} onOpen={() => onOpen(f.id)} send={send} />
        ))}
      </ul>
    </div>
  );
}
