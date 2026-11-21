import * as Y from "yjs";

/**
 * Deck storage (shared by the editor and the AI tools):
 *   Y.Array "slides": one Y.Map per slide { id, layout, title: Y.Text, body: Y.Text,
 *                     body2: Y.Text, notes: Y.Text, image: string }
 *   Y.Map "deck":     theme
 * Text fields are Y.Text so two people typing in the same box merge instead of clobbering.
 */

export const LAYOUTS = ["title", "bullets", "two", "quote", "section", "image", "free"] as const;
export type Layout = (typeof LAYOUTS)[number];
export const LAYOUT_LABEL: Record<Layout, string> = {
  title: "Title",
  bullets: "Title + bullets",
  two: "Two columns",
  quote: "Quote",
  section: "Section header",
  image: "Image + text",
  free: "Free layout (drag anything)",
};

/** A box on a free-layout slide, in canvas pixels (960×540). */
export type ElementType = "text" | "image" | "rect" | "ellipse";
export interface ElementData {
  id?: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  src?: string;
  fill?: string;
  size?: number;
}
export const CANVAS = { w: 960, h: 540 } as const;

const clamp = (n: unknown, lo: number, hi: number, d: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d;
};
/** Images on slides: https links, or files uploaded to this room. */
const safeSrc = (u: unknown) =>
  typeof u === "string" && (/^https:\/\/[^\s"'<>]+$/i.test(u) || /^\/api\/rooms\/[A-Z0-9]{6}\/blobs\/[a-z0-9]{16}$/.test(u)) ? u : "";
const safeFill = (c: unknown) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c : "#4f46e5");

export function makeElement(e: ElementData): Y.Map<any> {
  const m = new Y.Map<any>();
  const type: ElementType = ["text", "image", "rect", "ellipse"].includes(e.type) ? e.type : "text";
  m.set("id", e.id ?? Math.random().toString(36).slice(2, 10));
  m.set("type", type);
  m.set("x", clamp(e.x, -400, CANVAS.w, 80));
  m.set("y", clamp(e.y, -400, CANVAS.h, 80));
  m.set("w", clamp(e.w, 20, CANVAS.w * 2, 300));
  m.set("h", clamp(e.h, 20, CANVAS.h * 2, 80));
  if (type === "text") {
    m.set("text", new Y.Text(String(e.text ?? "").slice(0, 2000)));
    m.set("size", clamp(e.size, 10, 120, 28));
  }
  if (type === "image") m.set("src", safeSrc(e.src));
  if (type === "rect" || type === "ellipse") m.set("fill", safeFill(e.fill));
  return m;
}

export function readElement(m: Y.Map<any>): Required<Omit<ElementData, "text" | "src" | "fill" | "size">> & Pick<ElementData, "text" | "src" | "fill" | "size"> {
  const t = m.get("text");
  return {
    id: m.get("id"),
    type: m.get("type") ?? "text",
    x: m.get("x") ?? 0,
    y: m.get("y") ?? 0,
    w: m.get("w") ?? 100,
    h: m.get("h") ?? 60,
    ...(t !== undefined ? { text: t instanceof Y.Text ? t.toString() : String(t) } : {}),
    ...(m.get("src") !== undefined ? { src: m.get("src") } : {}),
    ...(m.get("fill") !== undefined ? { fill: m.get("fill") } : {}),
    ...(m.get("size") !== undefined ? { size: m.get("size") } : {}),
  };
}

export const elementsOf = (slide: Y.Map<any>): Y.Array<Y.Map<any>> | undefined => slide.get("elements");

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
  /** Free-layout slides: the boxes on the slide. */
  elements?: ElementData[];
  /** Who's responsible for this slide ("Alex: slides 4–6"). */
  owner?: { uid: string; name: string } | null;
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
  const els = new Y.Array<Y.Map<any>>();
  els.push((d.elements ?? []).slice(0, 60).map(makeElement));
  m.set("elements", els);
  if (d.owner && typeof d.owner.uid === "string") m.set("owner", { uid: d.owner.uid.slice(0, 64), name: String(d.owner.name ?? "").slice(0, 40) });
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
    elements: (elementsOf(m)?.toArray() ?? []).map(readElement),
    owner: m.get("owner") ?? null,
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
