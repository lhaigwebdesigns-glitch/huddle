import { Extension } from "@tiptap/core";

/**
 * Line spacing and indent, per paragraph (like Google Docs, where spacing belongs to the
 * paragraph, not to the letters in it). Both are plain attributes on paragraphs and headings,
 * so they travel with copy and paste and into the Word and PDF exports as inline styles.
 */

/** The choices people see, and the CSS each one means. A "single" line of text is about 1.2em tall. */
export const LINE_SPACING = [
  { label: "Single", value: "1.2" },
  { label: "1.15", value: "1.38" },
  { label: "1.5", value: "1.8" },
  { label: "Double", value: "2.4" },
] as const;

export const MAX_INDENT = 8;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraphFormat: {
      /** null goes back to the doc's normal spacing. */
      setLineSpacing: (value: string | null) => ReturnType;
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

const TYPES = ["paragraph", "heading"];

export const ParagraphFormat = Extension.create({
  name: "paragraphFormat",
  addGlobalAttributes() {
    return [
      {
        types: TYPES,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) => {
              const v = (el as HTMLElement).style.lineHeight;
              return /^\d(\.\d+)?$/.test(v) ? v : null;
            },
            renderHTML: (attrs) => (attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {}),
          },
          indent: {
            default: 0,
            parseHTML: (el) => {
              const m = /^([\d.]+)in$/.exec((el as HTMLElement).style.marginLeft);
              return m ? Math.min(MAX_INDENT, Math.round(Number(m[1]) / 0.5)) : 0;
            },
            // Half an inch a step, like a tab stop.
            renderHTML: (attrs) => (attrs.indent ? { style: `margin-left: ${attrs.indent * 0.5}in` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    // Change an attribute on every paragraph or heading the selection touches.
    const each =
      (fn: (attrs: Record<string, unknown>) => Record<string, unknown> | null) =>
      () =>
      ({ tr, state, dispatch }: { tr: import("@tiptap/pm/state").Transaction; state: import("@tiptap/pm/state").EditorState; dispatch?: unknown }) => {
        let changed = false;
        const { from, to } = state.selection;
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (!TYPES.includes(node.type.name)) return;
          const next = fn(node.attrs);
          if (!next) return;
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...next });
          changed = true;
        });
        if (changed && dispatch) (dispatch as (t: typeof tr) => void)(tr);
        return changed;
      };
    return {
      setLineSpacing: (value) => each(() => ({ lineHeight: value }))(),
      indent: each((a) => ((a.indent as number) < MAX_INDENT ? { indent: (a.indent as number) + 1 } : null)),
      outdent: each((a) => ((a.indent as number) > 0 ? { indent: (a.indent as number) - 1 } : null)),
    };
  },
});
