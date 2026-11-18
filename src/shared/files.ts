/**
 * Every file in a room is one Yjs document in its own Durable Object ("<ROOM>--<fileId>").
 * The kind decides which editor opens it and which top-level Yjs types it uses.
 */

export const FILE_KINDS = ["doc", "sheet", "slides", "whiteboard", "form", "artifact"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const FILE_INFO: Record<FileKind, { label: string; icon: string; untitled: string }> = {
  doc: { label: "Doc", icon: "📄", untitled: "Untitled doc" },
  sheet: { label: "Sheet", icon: "📊", untitled: "Untitled sheet" },
  slides: { label: "Slides", icon: "🖼️", untitled: "Untitled deck" },
  whiteboard: { label: "Whiteboard", icon: "🎨", untitled: "Untitled whiteboard" },
  form: { label: "Form", icon: "📝", untitled: "Untitled form" },
  artifact: { label: "Artifact", icon: "✨", untitled: "Untitled artifact" },
};

/** Kinds people can create from the Drive "+ New" menu (artifacts come from the AI). */
export const CREATABLE_KINDS: FileKind[] = ["doc", "sheet", "slides", "whiteboard", "form"];

export function isFileKind(k: unknown): k is FileKind {
  return typeof k === "string" && (FILE_KINDS as readonly string[]).includes(k);
}

/**
 * Top-level Yjs types each kind stores its content in. Version history restores exactly
 * these, so every editor must keep its state inside them.
 */
export const FILE_SCHEMA: Record<FileKind, { name: string; type: "xml" | "map" | "array" | "text" }[]> = {
  doc: [{ name: "default", type: "xml" }],
  sheet: [
    { name: "cells", type: "map" }, // "A1" -> { v: raw input, b?: bold, a?: align, bg?: color }
    { name: "sheetMeta", type: "map" }, // rows, cols, colWidths, charts
  ],
  slides: [
    { name: "slides", type: "array" }, // Y.Map per slide
    { name: "deck", type: "map" }, // theme
  ],
  whiteboard: [
    { name: "elements", type: "map" }, // Excalidraw element id -> element JSON
    { name: "pending", type: "array" }, // AI drawings waiting for a browser to lay them out
  ],
  form: [
    { name: "questions", type: "array" }, // Y.Map per question
    { name: "formMeta", type: "map" }, // description, accepting
    { name: "responses", type: "array" }, // { id, at, answers }
  ],
  artifact: [{ name: "versions", type: "array" }], // { html, title, at, by }
};
