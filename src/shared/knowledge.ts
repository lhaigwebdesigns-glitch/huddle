/** Helpers for room knowledge (uploaded text the AI can search). */

export const UPLOAD_TYPES: Record<string, { label: string; text: boolean }> = {
  "image/png": { label: "image", text: false },
  "image/jpeg": { label: "image", text: false },
  "image/webp": { label: "image", text: false },
  "image/gif": { label: "image", text: false },
  "application/pdf": { label: "PDF", text: true },
  "text/csv": { label: "CSV", text: true },
  "text/plain": { label: "text", text: true },
  "text/markdown": { label: "Markdown", text: true },
};
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_INDEX_CHARS = 300_000;

/** Split text into ~800-char chunks on paragraph/sentence boundaries, with a little overlap. */
export function chunkText(text: string, size = 800, overlap = 120): string[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_INDEX_CHARS);
  if (!clean) return [];
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(clean.length, i + size);
    if (end < clean.length) {
      const window = clean.slice(i + size / 2, end);
      const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "), window.lastIndexOf("\n"));
      if (cut > 0) end = i + size / 2 + cut + 1;
    }
    out.push(clean.slice(i, end).trim());
    if (end >= clean.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return out.filter(Boolean);
}

/** Turn a free-text question into a safe FTS5 query: words OR'ed, quoted, no operators. */
export function ftsQuery(q: string): string {
  const words = q
    .toLowerCase()
    .match(/[\p{L}\p{N}]{2,}/gu)
    ?.filter((w) => !STOP.has(w))
    .slice(0, 12);
  return words?.length ? words.map((w) => `"${w}"`).join(" OR ") : "";
}

const STOP = new Set(
  "the a an and or of to in on for with is are was were be what which who how when where why does do did it this that these those from at by as about into our your my their can could should would please tell me".split(
    " ",
  ),
);

export const safeFileName = (n: string) => n.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "file";
