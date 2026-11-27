import { alertDialog, promptDialog } from "./Dialogs";
import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import Collaboration from "@tiptap/extension-collaboration";
import { Placeholder } from "@tiptap/extensions";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { docExtensions } from "../lib/docExtensions";
import { LINE_SPACING } from "../lib/paragraphFormat";
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
  ChevronDown,
  Plus,
  Highlighter,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Underline as UnderlineIcon,
  UnfoldVertical,
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

/** A toolbar dropdown: shows the current choice, opens a short list. */
function Pick({ label, title, items, testId }: { label: React.ReactNode; title: string; items: { label: React.ReactNode; active: boolean; on: () => void; title: string; testId?: string }[]; testId?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  // Close on a click anywhere else, or Escape (the button never takes focus, so the editor keeps its selection).
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <span className="relative" ref={ref}>
      <button
        type="button"
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className={`press flex h-8 items-center gap-1 rounded-md px-2 text-sm text-fg-muted hover:bg-accent-soft hover:text-fg ${open ? "bg-accent-soft text-fg" : ""}`}
        data-testid={testId}
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <span className="pop absolute left-0 top-full z-20 mt-1 block max-h-80 min-w-[11rem] overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lg [--origin:top_left]" role="menu">
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              role="menuitemradio"
              aria-checked={it.active}
              title={it.title}
              data-testid={it.testId}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                it.on();
                setOpen(false);
              }}
              className={`press flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-2 ${it.active ? "bg-surface-2 font-semibold" : ""}`}
            >
              {it.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

const ic = "h-4 w-4";
const COLORS = ["#18181b", "#dc2626", "#ea580c", "#16a34a", "#2563eb", "#7c3aed", "#db2777"];
const SMALL = "press rounded-md px-1.5 py-1 text-fg-muted hover:bg-accent-soft hover:text-fg";
/** A short list of fonts every computer has, including the ones teachers ask for (MLA: Times New Roman 12). */
const FONTS = [
  { label: "Default", css: null },
  { label: "Arial", css: "Arial, Helvetica, sans-serif" },
  { label: "Times New Roman", css: '"Times New Roman", Times, serif' },
  { label: "Georgia", css: "Georgia, serif" },
  { label: "Verdana", css: "Verdana, Geneva, sans-serif" },
  { label: "Courier New", css: '"Courier New", Courier, monospace' },
] as const;
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 24, 30, 36, 48, 60, 72];

function Toolbar({ editor, onImage }: { editor: Editor; onImage: () => void }) {
  const c = () => editor.chain().focus();
  const [colors, setColors] = useState(false);
  const sep = <span className="mx-0.5 my-1.5 w-px bg-line" aria-hidden />;
  const inTable = editor.isActive("table");
  const setLink = async () => {
    const prev = (editor.getAttributes("link").href as string | undefined) ?? "";
    const url = await promptDialog({ title: prev ? "Edit link" : "Add a link", label: "Link to (leave empty to remove the link)", defaultValue: prev || "https://", confirmLabel: "Save" });
    if (url === null) return;
    if (!url.trim() || url.trim() === "https://") return c().extendMarkRange("link").unsetLink().run();
    if (!/^(https?:|mailto:)/i.test(url.trim())) return void alertDialog({ title: "That link won't work", message: "Links must start with https://, http:// or mailto:" });
    c().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };
  const keep = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div className="relative flex flex-wrap items-center gap-0.5 border-b border-line px-2 py-1" role="toolbar" aria-label="Formatting">
      <Btn title="Undo" on={() => c().undo().run()}><Undo2 className={ic} /></Btn>
      <Btn title="Redo" on={() => c().redo().run()}><Redo2 className={ic} /></Btn>
      {sep}
      <Pick
        title="Text style"
        testId="doc-style"
        label={<span className="text-left">{editor.isActive("heading", { level: 1 }) ? "Title" : editor.isActive("heading", { level: 2 }) ? "Heading" : editor.isActive("heading", { level: 3 }) ? "Subheading" : "Normal text"}</span>}
        items={[
          { title: "Normal text", label: "Normal text", active: editor.isActive("paragraph"), on: () => c().setParagraph().run() },
          { title: "Heading 1", label: <span className="font-display text-lg font-extrabold">Title</span>, active: editor.isActive("heading", { level: 1 }), on: () => c().setHeading({ level: 1 }).run() },
          { title: "Heading 2", label: <span className="text-base font-bold">Heading</span>, active: editor.isActive("heading", { level: 2 }), on: () => c().setHeading({ level: 2 }).run() },
          { title: "Heading 3", label: <span className="text-sm font-bold">Subheading</span>, active: editor.isActive("heading", { level: 3 }), on: () => c().setHeading({ level: 3 }).run() },
        ]}
      />
      <Pick
        title="Font"
        testId="doc-font"
        label={<span className="max-w-[7.5rem] truncate text-left">{FONTS.find((x) => x.css && editor.isActive("textStyle", { fontFamily: x.css }))?.label ?? "Default"}</span>}
        items={FONTS.map((x) => ({
          title: x.label,
          testId: `font-${x.label.toLowerCase().replace(/\s+/g, "-")}`,
          label: <span style={{ fontFamily: x.css ?? undefined }}>{x.label}</span>,
          active: x.css ? editor.isActive("textStyle", { fontFamily: x.css }) : !editor.getAttributes("textStyle").fontFamily,
          on: () => (x.css ? c().setFontFamily(x.css).run() : c().unsetFontFamily().run()),
        }))}
      />
      <Pick
        title="Font size"
        testId="doc-size"
        label={<span className="w-6 text-left tabular-nums">{String(editor.getAttributes("textStyle").fontSize ?? "12pt").replace("pt", "")}</span>}
        items={SIZES.map((n) => ({
          title: `${n} point`,
          testId: `size-${n}`,
          label: <span className="tabular-nums">{n}</span>,
          active: (editor.getAttributes("textStyle").fontSize ?? "12pt") === `${n}pt`,
          // 12 is the doc's normal size, so it clears the setting instead of storing it.
          on: () => (n === 12 ? c().unsetFontSize().run() : c().setFontSize(`${n}pt`).run()),
        }))}
      />
      {sep}
      <Btn title="Bold" active={editor.isActive("bold")} on={() => c().toggleBold().run()}><Bold className={ic} /></Btn>
      <Btn title="Italic" active={editor.isActive("italic")} on={() => c().toggleItalic().run()}><Italic className={ic} /></Btn>
      <Btn title="Underline" active={editor.isActive("underline")} on={() => c().toggleUnderline().run()} testId="doc-underline"><UnderlineIcon className={ic} /></Btn>
      <Btn title="Strikethrough" active={editor.isActive("strike")} on={() => c().toggleStrike().run()}><Strikethrough className={ic} /></Btn>
      <Btn title="Highlight" active={editor.isActive("highlight")} on={() => c().toggleHighlight().run()} testId="doc-highlight"><Highlighter className={ic} /></Btn>
      <Btn title="Text color" active={colors} on={() => setColors((o) => !o)}><Palette className={ic} /></Btn>
      <Btn title="Link" active={editor.isActive("link")} on={setLink}><Link2 className={ic} /></Btn>
      {sep}
      <Pick
        title="Align"
        testId="doc-align"
        label={editor.isActive({ textAlign: "center" }) ? <AlignCenter className={ic} /> : editor.isActive({ textAlign: "right" }) ? <AlignRight className={ic} /> : <AlignLeft className={ic} />}
        items={[
          { title: "Align left", label: <><AlignLeft className={ic} /> Left</>, active: !editor.isActive({ textAlign: "center" }) && !editor.isActive({ textAlign: "right" }), on: () => c().setTextAlign("left").run() },
          { title: "Align center", label: <><AlignCenter className={ic} /> Center</>, active: editor.isActive({ textAlign: "center" }), on: () => c().setTextAlign("center").run() },
          { title: "Align right", label: <><AlignRight className={ic} /> Right</>, active: editor.isActive({ textAlign: "right" }), on: () => c().setTextAlign("right").run() },
        ]}
      />
      <Pick
        title="Line spacing"
        testId="doc-spacing"
        label={<UnfoldVertical className={ic} />}
        items={[
          ...LINE_SPACING.map((x) => ({
            title: `${x.label} spacing`,
            testId: `spacing-${x.label.toLowerCase()}`,
            label: x.label,
            active: editor.getAttributes(editor.isActive("heading") ? "heading" : "paragraph").lineHeight === x.value,
            on: () => c().setLineSpacing(x.value).run(),
          })),
          { title: "Normal spacing", label: "Normal", active: !editor.getAttributes(editor.isActive("heading") ? "heading" : "paragraph").lineHeight, on: () => c().setLineSpacing(null).run() },
        ]}
      />
      <Btn title="Decrease indent" on={() => (editor.isActive("listItem") || editor.isActive("taskItem") ? c().liftListItem(editor.isActive("taskItem") ? "taskItem" : "listItem").run() : c().outdent().run())} testId="doc-outdent"><IndentDecrease className={ic} /></Btn>
      <Btn title="Increase indent" on={() => (editor.isActive("listItem") || editor.isActive("taskItem") ? c().sinkListItem(editor.isActive("taskItem") ? "taskItem" : "listItem").run() : c().indent().run())} testId="doc-indent"><IndentIncrease className={ic} /></Btn>
      {sep}
      <Btn title="Bullet list" active={editor.isActive("bulletList")} on={() => c().toggleBulletList().run()}><List className={ic} /></Btn>
      <Btn title="Numbered list" active={editor.isActive("orderedList")} on={() => c().toggleOrderedList().run()}><ListOrdered className={ic} /></Btn>
      <Btn title="Checklist" active={editor.isActive("taskList")} on={() => c().toggleTaskList().run()} testId="doc-checklist"><ListChecks className={ic} /></Btn>
      {sep}
      <Pick
        title="Insert"
        testId="doc-insert"
        label={<><Plus className={ic} /> Insert</>}
        items={[
          { title: "Insert image", testId: "doc-image", label: <><ImagePlus className={ic} /> Image</>, active: false, on: onImage },
          { title: "Insert table", testId: "doc-table", label: <><TableIcon className={ic} /> Table</>, active: inTable, on: () => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
          { title: "Quote", label: <><Quote className={ic} /> Quote</>, active: editor.isActive("blockquote"), on: () => c().toggleBlockquote().run() },
          { title: "Code block", label: <><Code2 className={ic} /> Code block</>, active: editor.isActive("codeBlock"), on: () => c().toggleCodeBlock().run() },
        ]}
      />
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

/** Words in the doc, and in the selection when something is selected. Essays have word limits. */
function WordCount({ editor }: { editor: Editor }) {
  const [, force] = useState(0);
  useEffect(() => {
    const up = () => force((n) => n + 1);
    editor.on("update", up);
    editor.on("selectionUpdate", up);
    return () => {
      editor.off("update", up);
      editor.off("selectionUpdate", up);
    };
  }, [editor]);
  const total = editor.storage.characterCount.words() as number;
  const { from, to, empty } = editor.state.selection;
  const picked = empty ? 0 : editor.state.doc.textBetween(from, to, " ", " ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const words = (n: number) => `${n.toLocaleString()} ${n === 1 ? "word" : "words"}`;
  return (
    <div className="flex justify-end border-t border-line px-3 py-1 text-xs tabular-nums text-fg-subtle" aria-live="polite" data-testid="doc-words">
      {picked ? `${picked.toLocaleString()} of ${words(total)}` : words(total)}
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
        ...docExtensions(),
        Placeholder.configure({ placeholder: readOnly ? "" : "Start writing… (pick a style like Title or Heading from the toolbar)" }),
        Collaboration.configure({ document: ydoc }),
        // Keep uid in the presence "user" field: the server uses it to credit edits on the receipt.
        CollaborationCaret.configure({ provider, user: { name: me.name, color: me.color, uid: me.uid } }),
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
  const exportPaper = async (kind: "word" | "pdf") => {
    const names = await promptDialog({
      title: kind === "word" ? "Save as Word" : "Save as PDF",
      message: "These go at the top of the page, with the date and title.",
      label: "Names (separate with commas)",
      defaultValue: me.name,
      confirmLabel: "Save",
    });
    if (names === null) return;
    const html = schoolPaper(file.title, names, editor.getHTML(), kind === "pdf");
    if (kind === "word") return download(`${name}.doc`, "application/msword", html);
    const w = window.open("", "_blank", "width=850,height=1000");
    if (!w) return void alertDialog({ title: "Pop-ups are blocked", message: "Allow pop-ups for Cairn in your browser, then try Save as PDF again." });
    w.document.write(html);
    w.document.close();
  };
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5 text-xs text-fg-subtle">
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${synced ? "bg-green" : "bg-fg-subtle"}`} aria-hidden />
          {uploadNote || (synced ? (readOnly ? "Read-only" : "Saves as you type") : "Connecting…")}
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
      <WordCount editor={editor} />
    </>
  );
}
