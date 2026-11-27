import { useEffect, useState } from "react";
import * as Y from "yjs";

/**
 * Undo and redo for a shared file, like Ctrl+Z in Google Sheets or Slides.
 *
 * It only undoes what *you* did on this device: changes from teammates and the AI arrive from
 * the server with the provider as their origin, so the manager never tracks them. Changes made
 * within mergeMs of each other count as one step (typing in a slide); 0 keeps every edit its own
 * step (a sheet, where each cell you change is one thing to undo).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useYUndo(types: Y.AbstractType<any>[], mergeMs = 500) {
  const [manager, setManager] = useState<Y.UndoManager | null>(null);
  const [, bump] = useState(0);
  useEffect(() => {
    if (!types.length) return;
    const m = new Y.UndoManager(types, { trackedOrigins: new Set([null, "user"]), captureTimeout: mergeMs });
    const up = () => bump((n) => n + 1);
    m.on("stack-item-added", up);
    m.on("stack-item-popped", up);
    m.on("stack-cleared", up);
    setManager(m);
    return () => {
      m.destroy();
      setManager(null);
    };
    // The shared types live as long as the file is open; compare them one by one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, types);
  return {
    undo: () => void manager?.undo(),
    redo: () => void manager?.redo(),
    canUndo: !!manager && manager.undoStack.length > 0,
    canRedo: !!manager && manager.redoStack.length > 0,
  };
}

/** Is focus in something with its own undo (a text box, or text being edited)? */
export const typingInField = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

/** Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y. Returns "undo", "redo" or null. */
export function undoKey(e: KeyboardEvent | React.KeyboardEvent): "undo" | "redo" | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (k === "z") return e.shiftKey ? "redo" : "undo";
  if (k === "y" && !e.shiftKey) return "redo";
  return null;
}
