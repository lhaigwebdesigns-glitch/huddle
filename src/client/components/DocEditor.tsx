import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import TextAlign from "@tiptap/extension-text-align";
import * as Y from "yjs";
import YProvider from "y-partyserver/provider";
import type { RoomFile } from "../../shared/protocol";
import type { Identity } from "../lib/identity";
import { download, safeName } from "../lib/download";
import { uploadFile } from "../lib/uploads";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code2,
  Download,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Palette,
  Printer,
  Quote,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  Trash2,
  Undo2,
} from "lucide-react";

function Btn({ on, active, children, title, testId }: { on: () => void; active?: boolean; children: React.ReactNode; title: string; testId?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      data-testid={testId}
      className={`press flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-fg-muted hover:bg-accent-soft hover:text-fg ${active ? "bg-accent-soft text-fg" : ""}`}
    >
      {children}
    </button>
  );
}

const ic = "h-4 w-4";
const COLORS = ["#18181b", "#dc2626", "#ea580c", "#16a34a", "#2563eb", "#7c3aed", "#db2777"];
const SMALL = "press rounded-md px-1.5 py-1 text-fg-muted hover:bg-accent-soft hover:text-fg";

function Toolbar({ editor, onImage }: { editor: Editor; onImage: () => void }) {
  const c = () => editor.chain().focus();
  const [colors, setColors] = useState(false);
  const sep = <span className="mx-1 my-1.5 w-px bg-line" aria-hidden />;
  const inTable = editor.isActive("table");
  const setLink = () => {
    const prev = (editor.getAttributes("link").href as string | undefined) ?? "";
    const url = prompt("Link to (leave empty to remove the link):", prev || "https://");
    if (url === null) return;
    if (!url.trim() || url.trim() === "https://") return c().extendMarkRange("link").unsetLink().run();
    if (!/^(https?:|mailto:)/i.test(url.trim())) return alert("Links must start with https://, http:// or mailto:");
    c().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };
  const keep = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div className="relative flex flex-wrap items-center gap-0.5 border-b border-line px-2 py-1" role="toolbar" aria-label="Formatting">
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
      <Btn title="Highlight" active={editor.isActive("highlight")} on={() => c().toggleHighlight().run()} testId="doc-highlight"><Highlighter className={ic} /></Btn>
      <Btn title="Text color" active={colors} on={() => setColors((o) => !o)}><Palette className={ic} /></Btn>
      <Btn title="Link" active={editor.isActive("link")} on={setLink}><Link2 className={ic} /></Btn>
      {sep}
      <Btn title="Align left" active={editor.isActive({ textAlign: "left" })} on={() => c().setTextAlign("left").run()}><AlignLeft className={ic} /></Btn>
      <Btn title="Align center" active={editor.isActive({ textAlign: "center" })} on={() => c().setTextAlign("center").run()}><AlignCenter className={ic} /></Btn>
      <Btn title="Align right" active={editor.isActive({ textAlign: "right" })} on={() => c().setTextAlign("right").run()}><AlignRight className={ic} /></Btn>
      {sep}
      <Btn title="Bullet list" active={editor.isActive("bulletList")} on={() => c().toggleBulletList().run()}><List className={ic} /></Btn>
      <Btn title="Numbered list" active={editor.isActive("orderedList")} on={() => c().toggleOrderedList().run()}><ListOrdered className={ic} /></Btn>
      <Btn title="Checklist" active={editor.isActive("taskList")} on={() => c().toggleTaskList().run()} testId="doc-checklist"><ListChecks className={ic} /></Btn>
      <Btn title="Quote" active={editor.isActive("blockquote")} on={() => c().toggleBlockquote().run()}><Quote className={ic} /></Btn>
      <Btn title="Code block" active={editor.isActive("codeBlock")} on={() => c().toggleCodeBlock().run()}><Code2 className={ic} /></Btn>
      {sep}
      <Btn title="Insert image" on={onImage} testId="doc-image"><ImagePlus className={ic} /></Btn>
      <Btn title="Insert table" active={inTable} on={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} testId="doc-table"><TableIcon className={ic} /></Btn>
      {inTable && (
        <span className="flex items-center gap-0.5 text-xs" data-testid="table-tools">
          <button type="button" onMouseDown={keep} onClick={() => c().addRowAfter().run()} className={SMALL}>+ Row</button>
          <button type="button" onMouseDown={keep} onClick={() => c().addColumnAfter().run()} className={SMALL}>+ Column</button>
          <button type="button" onMouseDown={keep} onClick={() => c().deleteRow().run()} className={SMALL}>− Row</button>
          <button type="button" onMouseDown={keep} onClick={() => c().deleteColumn().run()} className={SMALL}>− Column</button>
          <Btn title="Delete table" on={() => c().deleteTable().run()}><Trash2 className={ic} /></Btn>
        </span>
      )}
      {colors && (
        <div className="pop absolute left-2 top-full z-20 mt-1 flex gap-1 rounded-xl border border-line bg-surface p-1.5 shadow-lg" role="menu" aria-label="Text colors">
          {COLORS.map((col) => (
            <button
              key={col}
              type="button"
              role="menuitem"
              aria-label={col === COLORS[0] ? "Default color" : `Color ${col}`}
              onMouseDown={keep}
              onClick={() => {
                if (col === COLORS[0]) c().unsetColor().run();
                else c().setColor(col).run();
                setColors(false);
              }}
              className="press h-6 w-6 rounded-full border border-line"
              style={{ background: col }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** A school-paper copy of the doc: names and date at the top, a centered title, then the doc. */
export function schoolPaper(title: string, names: string, body: string, forPrint: boolean) {
  const date = new Date().toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
  const heading = names
    .split(/,|\n/)
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => `<p>${esc(n)}</p>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 2; color: #000; max-width: 6.5in; margin: ${forPrint ? "0 auto" : "1in"}; }
  @page { margin: 1in; }
  .head p { margin: 0; }
  h1.title { text-align: center; font-size: 12pt; font-weight: normal; margin: 0; }
  h1, h2, h3 { font-size: 12pt; }
  img { max-width: 100%; }
  table { border-collapse: collapse; width: 100%; line-height: 1.4; }
  td, th { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
  ul[data-type="taskList"] { list-style: none; padding-left: 0; }
  mark { background: #fde68a; }
</style></head><body>
<div class="head">${heading}<p>${esc(date)}</p></div>
<h1 class="title">${esc(title)}</h1>
${body}
${forPrint ? `<script>window.onload = () => { window.print(); }</script>` : ""}
</body></html>`;
}

export function DocEditor({
  ydoc,
  provider,
  file,
  me,
  synced,
  room,
  readOnly = false,
}: {
  ydoc: Y.Doc;
  provider: YProvider;
  file: RoomFile;
  me: Identity;
  synced: boolean;
  room: string;
  readOnly?: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadNote, setUploadNote] = useState("");
  const editorRef = useRef<Editor | null>(null);

  /** Uploads images to the room (like chat uploads) and puts them at the cursor or drop point. */
  const insertImages = async (files: File[], at?: number) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length || !editorRef.current) return;
    setUploadNote(`Uploading ${images.length} image${images.length === 1 ? "" : "s"}…`);
    try {
      for (const f of images) {
        const a = await uploadFile(room, f);
        const chain = editorRef.current.chain().focus();
        (at !== undefined ? chain.insertContentAt(at, { type: "image", attrs: { src: a.url, alt: a.name } }) : chain.setImage({ src: a.url, alt: a.name })).run();
      }
      setUploadNote("");
    } catch (e) {
      setUploadNote(String((e as Error).message));
    }
  };

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ undoRedo: false, trailingNode: false, link: { openOnClick: false, protocols: ["https", "http", "mailto"] } }),
        Collaboration.configure({ document: ydoc }),
        // Keep uid in the presence "user" field: the server uses it to credit edits on the receipt.
        CollaborationCaret.configure({ provider, user: { name: me.name, color: me.color, uid: me.uid } }),
        Image.configure({ allowBase64: false }),
        TableKit.configure({ table: { resizable: false } }),
        TextStyle,
        Color,
        Highlight,
        TaskList,
        TaskItem.configure({ nested: true }),
        TextAlign.configure({ types: ["heading", "paragraph"] }),
      ],
      editorProps: {
        attributes: { class: "prose prose-zinc dark:prose-invert max-w-none px-6 py-6 md:px-10", "data-testid": "doc-editor" },
        handlePaste: (_view, event) => {
          const files = [...(event.clipboardData?.files ?? [])];
          if (!files.some((f) => f.type.startsWith("image/"))) return false;
          void insertImages(files);
          return true;
        },
        handleDrop: (view, event) => {
          const drag = event as DragEvent;
          const files = [...(drag.dataTransfer?.files ?? [])];
          if (!files.some((f) => f.type.startsWith("image/"))) return false;
          const pos = view.posAtCoords({ left: drag.clientX, top: drag.clientY })?.pos;
          void insertImages(files, pos);
          return true;
        },
      },
    },
    [ydoc, provider],
  );
  editorRef.current = editor;
  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  if (!editor) return null;
  const name = safeName(file.title, "document");
  const exportPaper = (kind: "word" | "pdf") => {
    const names = prompt("Names for the top of the page (separate with commas):", me.name);
    if (names === null) return;
    const html = schoolPaper(file.title, names, editor.getHTML(), kind === "pdf");
    if (kind === "word") return download(`${name}.doc`, "application/msword", html);
    const w = window.open("", "_blank", "width=850,height=1000");
    if (!w) return alert("Allow pop-ups for Huddle to save a PDF.");
    w.document.write(html);
    w.document.close();
  };
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5 text-xs text-fg-subtle">
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${synced ? "bg-emerald-500" : "bg-fg-subtle"}`} aria-hidden />
          {uploadNote || (synced ? (readOnly ? "Read-only" : "Live, edits sync for everyone") : "Connecting…")}
        </span>
        <span className="flex gap-2">
          <button className="press inline-flex items-center gap-1 rounded px-1 hover:text-fg" onClick={() => exportPaper("pdf")} data-testid="doc-pdf">
            <Printer className="h-3.5 w-3.5" /> PDF
          </button>
          <button className="press inline-flex items-center gap-1 rounded px-1 hover:text-fg" onClick={() => exportPaper("word")} data-testid="doc-word">
            <Download className="h-3.5 w-3.5" /> Word
          </button>
          <button
            className="press inline-flex items-center gap-1 rounded px-1 hover:text-fg"
            onClick={() => download(`${name}.txt`, "text/plain", editor.getText({ blockSeparator: "\n\n" }))}
          >
            <Download className="h-3.5 w-3.5" /> Text
          </button>
        </span>
      </div>
      {!readOnly && <Toolbar editor={editor} onImage={() => fileInput.current?.click()} />}
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        hidden
        data-testid="doc-image-input"
        onChange={(e) => {
          if (e.target.files) void insertImages([...e.target.files]);
          e.target.value = "";
        }}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </>
  );
}
