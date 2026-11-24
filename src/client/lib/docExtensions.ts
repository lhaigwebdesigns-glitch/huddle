import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import TextAlign from "@tiptap/extension-text-align";

/** What a Cairn doc can hold. Shared by the editor and the Word importer so they always agree. */
export function docExtensions() {
  return [
    StarterKit.configure({ undoRedo: false, trailingNode: false, link: { openOnClick: false, protocols: ["https", "http", "mailto"] } }),
    Image.configure({ allowBase64: false }),
    TableKit.configure({ table: { resizable: false } }),
    TextStyle,
    Color,
    Highlight,
    TaskList,
    TaskItem.configure({ nested: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
  ];
}
