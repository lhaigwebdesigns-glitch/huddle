import * as Y from "yjs";

/**
 * Artifacts: small web pages / apps the AI writes (HTML + CSS + JS in one document) that
 * render live beside the chat in a sandboxed iframe. Every edit is a new version.
 *   Y.Array "versions": { html, note, at, by }
 */
export interface ArtifactVersion {
  html: string;
  note: string;
  at: number;
  by: string;
}

export const MAX_ARTIFACT_BYTES = 200_000;
export const MAX_VERSIONS = 30;

export const versionsOf = (doc: Y.Doc) => doc.getArray<ArtifactVersion>("versions");

/** Wrap a fragment in a full document so it renders predictably. */
export function normalizeHtml(html: string): string {
  const s = html.trim().replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "");
  if (/<html[\s>]/i.test(s) || /<!doctype/i.test(s)) return s;
  return `<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n<style>body{font-family:system-ui,sans-serif;margin:16px}</style></head>\n<body>\n${s}\n</body></html>`;
}

export function addVersion(doc: Y.Doc, html: string, note: string, by: string): number {
  const clean = normalizeHtml(html);
  if (new TextEncoder().encode(clean).length > MAX_ARTIFACT_BYTES) throw new Error(`The page is too big (max ${MAX_ARTIFACT_BYTES / 1000} KB). Simplify it.`);
  const versions = versionsOf(doc);
  doc.transact(() => {
    versions.push([{ html: clean, note: note.slice(0, 200), at: Date.now(), by: by.slice(0, 40) }]);
    if (versions.length > MAX_VERSIONS) versions.delete(0, versions.length - MAX_VERSIONS);
  }, "ai");
  return versions.length;
}

export function latestHtml(doc: Y.Doc): string {
  const v = versionsOf(doc);
  return v.length ? v.get(v.length - 1).html : "";
}
