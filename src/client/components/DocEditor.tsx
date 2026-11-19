import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import * as Y from "yjs";
import YProvider from "y-partyserver/provider";
import type { RoomFile } from "../../shared/protocol";
import type { Identity } from "../lib/identity";
import { download } from "../lib/download";
import { Bold, Code2, Download, Heading1, Heading2, Heading3, Italic, List, ListOrdered, Quote, Redo2, Strikethrough, Undo2 } from "lucide-react";

function Btn({ on, active, children, title }: { on: () => void; active?: boolean; children: React.ReactNode; title: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      className={`press flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-fg-muted hover:bg-accent-soft hover:text-fg ${active ? "bg-accent-soft text-fg" : ""}`}
    >
      {children}
    </button>
  );
}

const ic = "h-4 w-4";

function Toolbar({ editor }: { editor: Editor }) {
  const c = () => editor.chain().focus();
  const sep = <span className="mx-1 my-1.5 w-px bg-line" aria-hidden />;
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-2 py-1" role="toolbar" aria-label="Formatting">
      <Btn title="Undo" on={() => c().undo().run()}><Undo2 className={ic} /></Btn>
      <Btn title="Redo" on={() => c().redo().run()}><Redo2 className={ic} /></Btn>
      {sep}
      <Btn title="Heading 1" active={editor.isActive("heading", { level: 1 })} on={() => c().toggleHeading({ level: 1 }).run()}><Heading1 className={ic} /></Btn>
      <Btn title="Heading 2" active={editor.isActive("heading", { level: 2 })} on={() => c().toggleHeading({ level: 2 }).run()}><Heading2 className={ic} /></Btn>
      <Btn title="Heading 3" active={editor.isActive("heading", { level: 3 })} on={() => c().toggleHeading({ level: 3 }).run()}><Heading3 className={ic} /></Btn>
      {sep}
      <Btn title="Bold" active={editor.isActive("bold")} on={() => c().toggleBold().run()}><Bold className={ic} /></Btn>
      <Btn title="Italic" active={editor.isActive("italic")} on={() => c().toggleItalic().run()}><Italic className={ic} /></Btn>
      <Btn title="Strikethrough" active={editor.isActive("strike")} on={() => c().toggleStrike().run()}><Strikethrough className={ic} /></Btn>
      {sep}
      <Btn title="Bullet list" active={editor.isActive("bulletList")} on={() => c().toggleBulletList().run()}><List className={ic} /></Btn>
      <Btn title="Numbered list" active={editor.isActive("orderedList")} on={() => c().toggleOrderedList().run()}><ListOrdered className={ic} /></Btn>
      <Btn title="Quote" active={editor.isActive("blockquote")} on={() => c().toggleBlockquote().run()}><Quote className={ic} /></Btn>
      <Btn title="Code block" active={editor.isActive("codeBlock")} on={() => c().toggleCodeBlock().run()}><Code2 className={ic} /></Btn>
    </div>
  );
}

export function DocEditor({
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
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5 text-xs text-fg-subtle">
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${synced ? "bg-emerald-500" : "bg-fg-subtle"}`} aria-hidden />
          {synced ? "Live, edits sync for everyone" : "Connecting…"}
        </span>
        <span className="flex gap-2">
          <button
            className="press inline-flex items-center gap-1 rounded px-1 hover:text-fg"
            onClick={() =>
              download(
                `${safeName}.doc`,
                "application/msword",
                `<html><head><meta charset="utf-8"><title>${safeName}</title></head><body>${editor.getHTML()}</body></html>`,
              )
            }
          >
            <Download className="h-3.5 w-3.5" /> Word
          </button>
          <button
            className="press inline-flex items-center gap-1 rounded px-1 hover:text-fg"
            onClick={() => download(`${safeName}.txt`, "text/plain", editor.getText({ blockSeparator: "\n\n" }))}
          >
            <Download className="h-3.5 w-3.5" /> Text
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

