/**
 * Guards against invented citations. Open models sometimes write plausible-looking links
 * (e.g. a made-up article id on a real news site). We only keep a Markdown link if its URL
 * actually appeared in the conversation (tool results or user messages); other links are
 * turned back into plain text so nobody clicks a fake source.
 */

const URL_RE = /https?:\/\/[^\s<>()"'`\]]+/gi;

export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u.replace(/[.,;:!?]+$/, ""));
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return u;
  }
}

/** Every URL mentioned in the given texts, normalized. */
export function collectUrls(texts: (string | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const t of texts) for (const m of t?.match(URL_RE) ?? []) out.add(normalizeUrl(m));
  return out;
}

/** Replace `[text](url)` with `text` when url isn't in `allowed`. Images and code are left alone. */
export function stripUnverifiedLinks(markdown: string, allowed: Set<string>): { text: string; removed: string[] } {
  const removed: string[] = [];
  const parts = markdown.split(/(```[\s\S]*?```|`[^`\n]*`)/); // odd indexes are code
  const text = parts
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(/(!?)\[([^\]\n]*)\]\((https?:\/\/[^\s)]+)\)/g, (whole, bang, label, url) => {
            if (bang || allowed.has(normalizeUrl(url))) return whole;
            removed.push(url);
            return label;
          }),
    )
    .join("");
  return { text, removed };
}
