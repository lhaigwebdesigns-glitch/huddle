import * as Y from "yjs";

/**
 * Whiteboard storage:
 *   Y.Map "elements": Excalidraw element id -> element JSON (deleted ones keep isDeleted)
 *   Y.Array "pending": drawings the AI asked for { id, mermaid?, shapes?, at }. Mermaid needs a
 *                      browser to lay out, so the first open whiteboard converts and removes them.
 */
export const elementsOf = (doc: Y.Doc) => doc.getMap<any>("elements");
export const pendingOf = (doc: Y.Doc) => doc.getArray<any>("pending");

export interface PendingDrawing {
  id: string;
  mermaid?: string;
  shapes?: unknown[];
  at: number;
}

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/**
 * Give converted elements ids/seeds derived from the drawing id, so if two browsers convert
 * the same drawing at once they produce identical elements (and Yjs merges them as one).
 */
export function remapIds<T extends Record<string, any>>(elements: T[], prefix: string): T[] {
  const ids = new Map<string, string>();
  elements.forEach((e, i) => ids.set(e.id, `${prefix}-${i}`));
  const groups = new Map<string, string>();
  const gid = (g: string) => {
    if (!groups.has(g)) groups.set(g, `${prefix}-g${groups.size}`);
    return groups.get(g)!;
  };
  const re = (id: unknown) => (typeof id === "string" ? (ids.get(id) ?? id) : id);
  return elements.map((e, i) => {
    const out: Record<string, any> = { ...e, id: ids.get(e.id), seed: hash(`${prefix}:${i}`), versionNonce: hash(`${prefix}:${i}:n`), version: 1 };
    if (e.containerId) out.containerId = re(e.containerId);
    if (e.frameId) out.frameId = re(e.frameId);
    if (Array.isArray(e.boundElements)) out.boundElements = e.boundElements.map((b: any) => ({ ...b, id: re(b.id) }));
    if (e.startBinding) out.startBinding = { ...e.startBinding, elementId: re(e.startBinding.elementId) };
    if (e.endBinding) out.endBinding = { ...e.endBinding, elementId: re(e.endBinding.elementId) };
    if (Array.isArray(e.groupIds)) out.groupIds = e.groupIds.map(gid);
    return out as T;
  });
}

/** Text labels on a board, for the AI to "read" it. */
export function boardSummary(doc: Y.Doc): string {
  const live = [...elementsOf(doc).values()].filter((e) => e && !e.isDeleted);
  if (!live.length) return "(empty whiteboard)";
  const counts: Record<string, number> = {};
  for (const e of live) counts[e.type] = (counts[e.type] ?? 0) + 1;
  const texts = live.filter((e) => e.type === "text" && e.text).map((e) => `- ${String(e.text).replace(/\n/g, " ")}`);
  return `Shapes: ${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(", ")}\nText on the board:\n${texts.slice(0, 200).join("\n") || "(none)"}`;
}

export function queueDrawing(doc: Y.Doc, d: Omit<PendingDrawing, "id" | "at">) {
  const id = `ai${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  pendingOf(doc).push([{ id, at: Date.now(), ...d }]);
  return id;
}
