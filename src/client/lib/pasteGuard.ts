import { useEffect, useRef } from "react";

/** Pastes this short are always fine: names, numbers, a link, a word. */
export const SHORT_PASTE = 20;
const REMEMBER = 20;

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Remembers text copied inside Huddle, and decides whether a paste came from outside.
 * Kept separate from the DOM so it can be tested.
 */
export class PasteGuard {
  private copied: string[] = [];

  noteCopy(text: string) {
    const t = norm(text);
    if (!t) return;
    this.copied = [t, ...this.copied.filter((c) => c !== t)].slice(0, REMEMBER);
  }

  /** True when the paste may go through. */
  allows(text: string) {
    const t = norm(text);
    if (t.length < SHORT_PASTE) return true;
    // Pasting part of something copied here (or all of it) is copying inside the project.
    return this.copied.some((c) => c.includes(t) || (t.includes(c) && c.length >= t.length * 0.9));
  }
}

/**
 * While on, blocks pasting (and dropping) text that wasn't copied inside Huddle, across the
 * whole room: the chat box and every file editor. The person always sees why.
 */
export function usePasteGuard(on: boolean, onBlocked: () => void) {
  const guard = useRef(new PasteGuard());
  const notify = useRef(onBlocked);
  notify.current = onBlocked;
  useEffect(() => {
    if (!on) return;
    const selectionText = () => window.getSelection()?.toString() ?? "";
    const onCopy = (e: ClipboardEvent) => {
      // Inputs and textareas don't report their selection through getSelection.
      const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
      const fromField =
        el && typeof el.selectionStart === "number" && typeof el.value === "string"
          ? el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0)
          : "";
      guard.current.noteCopy(fromField || selectionText() || e.clipboardData?.getData("text/plain") || "");
    };
    const block = (e: Event, text: string) => {
      if (guard.current.allows(text)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      notify.current();
    };
    const onPaste = (e: ClipboardEvent) => block(e, e.clipboardData?.getData("text/plain") ?? "");
    const onDrop = (e: DragEvent) => {
      const text = e.dataTransfer?.getData("text/plain") ?? "";
      if (text) block(e, text);
    };
    // Dragging selected text to move it inside a file counts as copying it here.
    const onDragStart = () => guard.current.noteCopy(selectionText());
    document.addEventListener("copy", onCopy, true);
    document.addEventListener("cut", onCopy, true);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("dragstart", onDragStart, true);
    return () => {
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("copy", onCopy, true);
      document.removeEventListener("cut", onCopy, true);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("drop", onDrop, true);
    };
  }, [on]);
}
