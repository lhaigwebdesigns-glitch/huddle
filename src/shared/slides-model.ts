import * as Y from "yjs";

/**
 * Deck storage (shared by the editor and the AI tools):
 *   Y.Array "slides": one Y.Map per slide { id, layout, title: Y.Text, body: Y.Text,
 *                     body2: Y.Text, notes: Y.Text, image: string }
 *   Y.Map "deck":     theme
 * Text fields are Y.Text so two people typing in the same box merge instead of clobbering.
 */

export const LAYOUTS = ["title", "bullets", "two", "quote", "section", "image"] as const;
export type Layout = (typeof LAYOUTS)[number];
export const LAYOUT_LABEL: Record<Layout, string> = {
  title: "Title",
  bullets: "Title + bullets",
  two: "Two columns",
  quote: "Quote",
  section: "Section header",
  image: "Image + text",
};

export const THEMES = {
  light: { bg: "#ffffff", fg: "#18181b", accent: "#4f46e5", muted: "#52525b", font: "Inter, system-ui, sans-serif" },
  dark: { bg: "#18181b", fg: "#fafafa", accent: "#a5b4fc", muted: "#a1a1aa", font: "Inter, system-ui, sans-serif" },
  indigo: { bg: "#312e81", fg: "#ffffff", accent: "#fbbf24", muted: "#c7d2fe", font: "Inter, system-ui, sans-serif" },
  sunset: { bg: "#fff7ed", fg: "#431407", accent: "#ea580c", muted: "#9a3412", font: "Georgia, serif" },
  forest: { bg: "#052e16", fg: "#f0fdf4", accent: "#4ade80", muted: "#bbf7d0", font: "Inter, system-ui, sans-serif" },
} as const;
export type ThemeName = keyof typeof THEMES;

export const TEXT_FIELDS = ["title", "body", "body2", "notes"] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

export interface SlideData {
  id?: string;
  layout?: Layout;
  title?: string;
  body?: string;
  body2?: string;
  notes?: string;
  image?: string;
}

export const slidesOf = (doc: Y.Doc) => doc.getArray<Y.Map<any>>("slides");
export const deckOf = (doc: Y.Doc) => doc.getMap<any>("deck");

export const themeOf = (doc: Y.Doc): ThemeName => {
  const t = deckOf(doc).get("theme");
  return t in THEMES ? t : "light";
};

const safeImage = (u: unknown) => (typeof u === "string" && /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : "");

/** Models sometimes send bullets as an array instead of lines of text; accept both. */
const asText = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x)).join("\n") : String(v ?? "")).slice(0, 4000);

export function makeSlide(d: SlideData): Y.Map<any> {
  const m = new Y.Map<any>();
  m.set("id", d.id ?? Math.random().toString(36).slice(2, 10));
  m.set("layout", LAYOUTS.includes(d.layout as Layout) ? d.layout : "bullets");
  for (const f of TEXT_FIELDS) m.set(f, new Y.Text(asText(d[f])));
  m.set("image", safeImage(d.image));
  return m;
}

export function readSlide(m: Y.Map<any>): Required<SlideData> {
  const text = (f: TextField) => (m.get(f) instanceof Y.Text ? (m.get(f) as Y.Text).toString() : String(m.get(f) ?? ""));
  return {
    id: m.get("id"),
    layout: m.get("layout") ?? "bullets",
    title: text("title"),
    body: text("body"),
    body2: text("body2"),
    notes: text("notes"),
    image: m.get("image") ?? "",
  };
}

/** Replace a Y.Text's content with `next` using the smallest edit (keeps others' cursors stable). */
export function setText(t: Y.Text, next: string) {
  const prev = t.toString();
  if (prev === next) return;
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let endPrev = prev.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) endPrev--, endNext--;
  t.doc!.transact(() => {
    if (endPrev > start) t.delete(start, endPrev - start);
    if (endNext > start) t.insert(start, next.slice(start, endNext));
  });
}

export function updateSlide(m: Y.Map<any>, d: SlideData) {
  if (d.layout && LAYOUTS.includes(d.layout)) m.set("layout", d.layout);
  for (const f of TEXT_FIELDS) {
    if (d[f] === undefined) continue;
    const t = m.get(f);
    if (t instanceof Y.Text) setText(t, asText(d[f]));
    else m.set(f, new Y.Text(asText(d[f])));
  }
  if (d.image !== undefined) m.set("image", safeImage(d.image));
}

/** Plain-text outline of a deck for the AI. */
export function deckOutline(doc: Y.Doc): string {
  const slides = slidesOf(doc).toArray().map(readSlide);
  if (!slides.length) return "(empty deck)";
  return [
    `Theme: ${themeOf(doc)}`,
    ...slides.map(
      (s, i) =>
        `Slide ${i + 1} [${s.layout}] ${s.title}${s.body ? `\n  ${s.body.replace(/\n/g, "\n  ")}` : ""}${s.body2 ? `\n  (right) ${s.body2.replace(/\n/g, "\n  ")}` : ""}${s.image ? `\n  image: ${s.image}` : ""}${s.notes ? `\n  notes: ${s.notes}` : ""}`,
    ),
  ].join("\n");
}

export type SlideOp =
  | { op: "update"; index: number; slide: SlideData }
  | { op: "insert"; index?: number; slide: SlideData }
  | { op: "delete"; index: number }
  | { op: "move"; from: number; to: number }
  | { op: "theme"; theme: ThemeName };

/** Apply AI edits as one change. Slide indexes are 1-based, like people count them. */
export function applySlideOps(doc: Y.Doc, ops: SlideOp[]): string[] {
  const slides = slidesOf(doc);
  const done: string[] = [];
  const idx = (n: number) => {
    const i = Math.round(Number(n)) - 1;
    if (!(i >= 0 && i < slides.length)) throw new Error(`There is no slide ${n} (deck has ${slides.length}).`);
    return i;
  };
  doc.transact(() => {
    for (const o of ops.slice(0, 200)) {
      switch (o.op) {
        case "update":
          updateSlide(slides.get(idx(o.index)), o.slide ?? {});
          done.push(`updated slide ${o.index}`);
          break;
        case "insert": {
          if (slides.length >= 100) throw new Error("Decks are limited to 100 slides.");
          const at = o.index === undefined ? slides.length : Math.max(0, Math.min(slides.length, Math.round(o.index) - 1));
          slides.insert(at, [makeSlide(o.slide ?? {})]);
          done.push(`inserted slide ${at + 1}`);
          break;
        }
        case "delete":
          slides.delete(idx(o.index), 1);
          done.push(`deleted slide ${o.index}`);
          break;
        case "move": {
          const from = idx(o.from);
          const data = readSlide(slides.get(from));
          slides.delete(from, 1);
          const to = Math.max(0, Math.min(slides.length, Math.round(o.to) - 1));
          slides.insert(to, [makeSlide(data)]);
          done.push(`moved slide ${o.from} to ${to + 1}`);
          break;
        }
        case "theme":
          if (!(o.theme in THEMES)) throw new Error(`Unknown theme "${o.theme}". Themes: ${Object.keys(THEMES).join(", ")}.`);
          deckOf(doc).set("theme", o.theme);
          done.push(`theme ${o.theme}`);
          break;
        default:
          throw new Error(`Unknown op ${(o as any).op}`);
      }
    }
  }, "ai");
  return done;
}

/** Bullet lines of a body ("- a\n- b" or plain lines). */
export const bullets = (body: string) =>
  body
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s?/, "").trimEnd())
    .filter((l) => l.trim());
