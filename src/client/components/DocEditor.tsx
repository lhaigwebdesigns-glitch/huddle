import { memo, useEffect, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import * as Y from "yjs";
import YProvider from "y-partyserver/provider";
import type { RoomFile } from "../../shared/protocol";
import type { Identity } from "../lib/identity";

function Btn({ on, active, children, title }: { on: () => void; active?: boolean; children: React.ReactNode; title: string }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      className={`rounded px-2 py-1 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-800 ${active ? "bg-zinc-200 dark:bg-zinc-800" : ""}`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const c = () => editor.chain().focus();
  return (
    <div className="flex flex-wrap gap-0.5 border-b border-zinc-200 px-2 py-1 dark:border-zinc-800">
      <Btn title="Undo" on={() => c().undo().run()}>↶</Btn>
      <Btn title="Redo" on={() => c().redo().run()}>↷</Btn>
      <span className="mx-1 w-px bg-zinc-200 dark:bg-zinc-800" />
      <Btn title="Heading 1" active={editor.isActive("heading", { level: 1 })} on={() => c().toggleHeading({ level: 1 }).run()}>H1</Btn>
      <Btn title="Heading 2" active={editor.isActive("heading", { level: 2 })} on={() => c().toggleHeading({ level: 2 }).run()}>H2</Btn>
      <Btn title="Heading 3" active={editor.isActive("heading", { level: 3 })} on={() => c().toggleHeading({ level: 3 }).run()}>H3</Btn>
      <Btn title="Bold" active={editor.isActive("bold")} on={() => c().toggleBold().run()}><b>B</b></Btn>
      <Btn title="Italic" active={editor.isActive("italic")} on={() => c().toggleItalic().run()}><i>I</i></Btn>
      <Btn title="Strikethrough" active={editor.isActive("strike")} on={() => c().toggleStrike().run()}><s>S</s></Btn>
      <Btn title="Bullet list" active={editor.isActive("bulletList")} on={() => c().toggleBulletList().run()}>• List</Btn>
      <Btn title="Numbered list" active={editor.isActive("orderedList")} on={() => c().toggleOrderedList().run()}>1. List</Btn>
      <Btn title="Quote" active={editor.isActive("blockquote")} on={() => c().toggleBlockquote().run()}>❝</Btn>
      <Btn title="Code block" active={editor.isActive("codeBlock")} on={() => c().toggleCodeBlock().run()}>{"</>"}</Btn>
    </div>
  );
}

function download(name: string, mime: string, content: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function CollabEditor({ room, file, me }: { room: string; file: RoomFile; me: Identity }) {
  // Create the Yjs doc + provider inside an effect so React StrictMode's
  // mount/unmount/mount cycle doesn't leave us holding a destroyed provider.
  const [conn, setConn] = useState<{ ydoc: Y.Doc; provider: YProvider } | null>(null);
  const [synced, setSynced] = useState(false); // live connection state (for the indicator)
  const [ready, setReady] = useState(false); // first sync done — editor stays mounted after this
  useEffect(() => {
    setReady(false);
    const ydoc = new Y.Doc();
    const provider = new YProvider(location.host, `${room}--${file.id}`, ydoc, { party: "doc" });
    const onSync = (s: boolean) => {
      setSynced(s);
      if (s) setReady(true);
    };
    provider.on("sync", onSync);
    setConn({ ydoc, provider });
    return () => {
      provider.off("sync", onSync);
      provider.destroy();
      ydoc.destroy();
      setConn(null);
    };
  }, [room, file.id]);
  // Wait for the first sync so the editor never seeds an empty doc that then merges
  // with the real content (which would add stray paragraphs and jump cursors).
  if (!conn || !ready) return <div className="p-6 text-sm text-zinc-500">Connecting to document…</div>;
  return <EditorInner {...conn} file={file} me={me} synced={synced} />;
}

function EditorInner({
  ydoc,
  provider,
  file,
  me,
  synced,
}: {
  ydoc: Y.Doc;
  provider: YProvider;
  file: RoomFile;
  me: Identity;
  synced: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false, trailingNode: false, link: { openOnClick: false } }),
      Collaboration.configure({ document: ydoc }),
      CollaborationCaret.configure({ provider, user: { name: me.name, color: me.color } }),
    ],
    editorProps: {
      attributes: { class: "prose prose-zinc dark:prose-invert max-w-none px-6 py-6 md:px-10", "data-testid": "doc-editor" },
    },
  }, [ydoc, provider]);

  if (!editor) return null;
  const safeName = file.title.replace(/[^\w\- ]+/g, "").trim() || "document";
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-3 py-1 text-xs text-zinc-500 dark:border-zinc-800">
        <span>{synced ? "● Live — edits sync for everyone" : "Connecting…"}</span>
        <span className="flex gap-2">
          <button
            className="hover:text-zinc-900 dark:hover:text-zinc-100"
            onClick={() =>
              download(
                `${safeName}.doc`,
                "application/msword",
                `<html><head><meta charset="utf-8"><title>${safeName}</title></head><body>${editor.getHTML()}</body></html>`,
              )
            }
          >
            ⬇ Word
          </button>
          <button
            className="hover:text-zinc-900 dark:hover:text-zinc-100"
            onClick={() => download(`${safeName}.txt`, "text/plain", editor.getText({ blockSeparator: "\n\n" }))}
          >
            ⬇ Text
          </button>
        </span>
      </div>
      <Toolbar editor={editor} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </>
  );
}

export const DocPanel = memo(function DocPanel({
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
  useEffect(() => setTitle(file.title), [file.title]);
  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-zinc-900">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <span>📄</span>
        <input
          className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== file.title && onRename(title.trim())}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <button onClick={onClose} className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Close">
          ✕
        </button>
      </div>
      <CollabEditor key={file.id} room={room} file={file} me={me} />
    </div>
  );
});
