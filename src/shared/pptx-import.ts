import JSZip from "jszip";
import { CANVAS, type ElementData, type SlideData } from "./slides-model";

/**
 * Reads a PowerPoint (.pptx) into free-layout slides: every text box, picture and filled
 * shape at its own spot, with the slide's background color, text sizes, colors and bold, and
 * the speaker notes. Themes and masters, charts, SmartArt, animations and video don't come
 * through; tables become a text box, one row per line.
 *
 * Runs in the browser (DOMParser) and in tests (@xmldom), so the XML parser is passed in.
 */

export interface PptxImage {
  name: string;
  type: string;
  bytes: Uint8Array;
}
export interface PptxOptions {
  parse: (xml: string) => Document;
  /** Stores a picture and returns its URL, or null to leave it out. */
  image?: (img: PptxImage) => Promise<string | null>;
}
export interface ImportedDeck {
  slides: SlideData[];
  /** Things that didn't come through, for a short note after the import ("2 charts"). */
  skipped: string[];
}

const EMU_PER_PT = 12700;
const MAX_SLIDES = 100;
const MAX_ELEMENTS = 60;

type El = Element;
const kids = (e: El | Document | null | undefined, name?: string): El[] => {
  if (!e) return [];
  const out: El[] = [];
  const list = e.childNodes;
  for (let i = 0; i < list.length; i++) {
    const n = list[i] as El;
    if (n.nodeType === 1 && (!name || n.nodeName === name)) out.push(n);
  }
  return out;
};
const kid = (e: El | Document | null | undefined, name: string): El | null => kids(e, name)[0] ?? null;
const path = (e: El | Document | null | undefined, ...names: string[]): El | null => {
  let cur: El | Document | null | undefined = e;
  for (const n of names) cur = kid(cur, n);
  return (cur as El) ?? null;
};
/** Every descendant with this tag (document order). */
const all = (e: El | Document | null | undefined, name: string): El[] => (e ? Array.from(e.getElementsByTagName(name)) : []);
const num = (v: string | null | undefined, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/** "ppt/slides/slide1.xml" + "../media/image1.png" → "ppt/media/image1.png". */
export function resolvePart(from: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = from.split("/").slice(0, -1);
  for (const p of target.split("/")) {
    if (p === "..") parts.pop();
    else if (p && p !== ".") parts.push(p);
  }
  return parts.join("/");
}
const relsPath = (part: string) => {
  const i = part.lastIndexOf("/");
  return `${part.slice(0, i)}/_rels/${part.slice(i + 1)}.rels`;
};

interface Rel {
  type: string;
  target: string;
}

const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** Group shapes have their own coordinate space; this maps a child's box into the slide's. */
interface Frame {
  map: (b: Box) => Box;
}
const IDENTITY: Frame = { map: (b) => b };

function boxOf(xfrm: El | null): Box | null {
  const off = kid(xfrm, "a:off");
  const ext = kid(xfrm, "a:ext");
  if (!off || !ext) return null;
  return { x: num(off.getAttribute("x")), y: num(off.getAttribute("y")), w: num(ext.getAttribute("cx")), h: num(ext.getAttribute("cy")) };
}

type Scheme = Record<string, string>;
const SCHEME_ALIASES: Record<string, string> = { bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2" };

/** A color from <a:srgbClr>, <a:schemeClr> or <a:sysClr> (tints and shades are ignored). */
function colorOf(holder: El | null, scheme: Scheme): string | undefined {
  if (!holder) return undefined;
  const srgb = kid(holder, "a:srgbClr");
  if (srgb) return `#${(srgb.getAttribute("val") ?? "").toLowerCase()}`;
  const sys = kid(holder, "a:sysClr");
  if (sys) return `#${(sys.getAttribute("lastClr") ?? "000000").toLowerCase()}`;
  const sch = kid(holder, "a:schemeClr");
  if (sch) {
    const v = sch.getAttribute("val") ?? "";
    return scheme[SCHEME_ALIASES[v] ?? v];
  }
  return undefined;
}
const validHex = (c: string | undefined) => (c && /^#[0-9a-f]{6}$/.test(c) ? c : undefined);

function readScheme(theme: Document | null): Scheme {
  const out: Scheme = {};
  const cs = all(theme, "a:clrScheme")[0];
  for (const c of kids(cs)) {
    const v = validHex(colorOf(c, {}));
    if (v) out[c.nodeName.replace(/^a:/, "")] = v;
  }
  return out;
}

function backgroundOf(doc: Document | null, scheme: Scheme): string | undefined {
  const bg = all(doc, "p:bg")[0];
  if (!bg) return undefined;
  const fill = path(bg, "p:bgPr", "a:solidFill");
  if (fill) return validHex(colorOf(fill, scheme));
  const ref = kid(bg, "p:bgRef");
  return ref ? validHex(colorOf(ref, scheme)) : undefined;
}

interface Placeholder {
  type: string;
  idx: string;
}
function placeholderOf(sp: El): Placeholder | null {
  const ph = all(sp, "p:ph")[0];
  if (!ph) return null;
  return { type: ph.getAttribute("type") ?? "body", idx: ph.getAttribute("idx") ?? "" };
}
const isTitle = (t: string) => t === "title" || t === "ctrTitle";
const family = (t: string) => (isTitle(t) ? "title" : t === "subTitle" || t === "obj" ? "body" : t);

/** A placeholder's spot on the layout or master, when the slide doesn't say. */
function inheritedBox(ph: Placeholder, layout: Document | null, master: Document | null): Box | null {
  const find = (doc: Document | null, byIdx: boolean) => {
    for (const sp of all(doc, "p:sp")) {
      const p = placeholderOf(sp);
      if (!p) continue;
      const match = byIdx ? ph.idx && p.idx === ph.idx : family(p.type) === family(ph.type);
      if (!match) continue;
      const b = boxOf(path(sp, "p:spPr", "a:xfrm"));
      if (b) return b;
    }
    return null;
  };
  return find(layout, true) ?? find(layout, false) ?? find(master, false);
}

interface TextRun {
  text: string;
  sizePt?: number;
  color?: string;
  bold: boolean;
}

function readText(body: El | null, scheme: Scheme, bulletsByDefault: boolean): TextRun {
  const lines: string[] = [];
  let sizePt: number | undefined;
  let color: string | undefined;
  let bold = false;
  let boldSeen = false;
  for (const p of kids(body, "a:p")) {
    let line = "";
    for (const r of kids(p)) {
      if (r.nodeName === "a:br") line += "\n";
      if (r.nodeName !== "a:r" && r.nodeName !== "a:fld") continue;
      const t = kid(r, "a:t")?.textContent ?? "";
      line += t;
      const pr = kid(r, "a:rPr");
      if (t.trim() && pr) {
        if (sizePt === undefined && pr.getAttribute("sz")) sizePt = num(pr.getAttribute("sz")) / 100;
        if (color === undefined) color = validHex(colorOf(kid(pr, "a:solidFill"), scheme));
        if (!boldSeen) (bold = pr.getAttribute("b") === "1"), (boldSeen = true);
      }
    }
    const ppr = kid(p, "a:pPr");
    const bullet = !!kid(ppr, "a:buChar") || !!kid(ppr, "a:buAutoNum") || (bulletsByDefault && !kid(ppr, "a:buNone"));
    if (sizePt === undefined) {
      const end = kid(p, "a:endParaRPr");
      if (end?.getAttribute("sz") && line.trim()) sizePt = num(end.getAttribute("sz")) / 100;
    }
    lines.push(bullet && line.trim() ? `• ${line}` : line);
  }
  // Drop blank lines at the ends, keep the ones in between.
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  while (lines.length && !lines[0].trim()) lines.shift();
  return { text: lines.join("\n"), sizePt, color, bold };
}

export async function readPptx(data: ArrayBuffer | Uint8Array, opts: PptxOptions): Promise<ImportedDeck> {
  const zip = await JSZip.loadAsync(data);
  const xml = async (part: string): Promise<Document | null> => {
    const f = zip.file(part);
    return f ? opts.parse(await f.async("string")) : null;
  };
  const rels = async (part: string): Promise<Map<string, Rel>> => {
    const out = new Map<string, Rel>();
    const doc = await xml(relsPath(part));
    for (const r of all(doc, "Relationship")) {
      const target = r.getAttribute("Target") ?? "";
      out.set(r.getAttribute("Id") ?? "", {
        type: (r.getAttribute("Type") ?? "").split("/").pop() ?? "",
        target: r.getAttribute("TargetMode") === "External" ? target : resolvePart(part, target),
      });
    }
    return out;
  };
  const relOfType = (m: Map<string, Rel>, type: string) => [...m.values()].find((r) => r.type === type)?.target;

  const pres = await xml("ppt/presentation.xml");
  if (!pres) throw new Error("That doesn't look like a PowerPoint file.");
  const size = all(pres, "p:sldSz")[0];
  const cx = num(size?.getAttribute("cx"), 12192000);
  const cy = num(size?.getAttribute("cy"), 6858000);
  // Fit the slide inside the 960×540 canvas (4:3 decks get centered).
  const scale = Math.min(CANVAS.w / cx, CANVAS.h / cy);
  const offX = (CANVAS.w - cx * scale) / 2;
  const offY = (CANVAS.h - cy * scale) / 2;
  const toCanvas = (b: Box): Box => ({ x: offX + b.x * scale, y: offY + b.y * scale, w: b.w * scale, h: b.h * scale });
  const ptToPx = (pt: number) => pt * EMU_PER_PT * scale;

  const presRels = await rels("ppt/presentation.xml");
  const order = all(pres, "p:sldId")
    .map((s) => presRels.get(s.getAttribute("r:id") ?? "")?.target)
    .filter((t): t is string => !!t);

  const skipped = new Map<string, number>();
  const skip = (what: string) => skipped.set(what, (skipped.get(what) ?? 0) + 1);
  const imageCache = new Map<string, string | null>();
  const slides: SlideData[] = [];

  for (const part of order.slice(0, MAX_SLIDES)) {
    const slide = await xml(part);
    if (!slide) continue;
    const sRels = await rels(part);
    const layoutPart = relOfType(sRels, "slideLayout");
    const layout = layoutPart ? await xml(layoutPart) : null;
    const masterPart = layoutPart ? relOfType(await rels(layoutPart), "slideMaster") : undefined;
    const master = masterPart ? await xml(masterPart) : null;
    const themePart = masterPart ? relOfType(await rels(masterPart), "theme") : undefined;
    const scheme = readScheme(themePart ? await xml(themePart) : null);

    const elements: ElementData[] = [];
    const bg = backgroundOf(slide, scheme) ?? backgroundOf(layout, scheme) ?? backgroundOf(master, scheme);
    if (bg && bg !== "#ffffff") elements.push({ type: "rect", x: 0, y: 0, w: CANVAS.w, h: CANVAS.h, fill: bg });
    let title = "";

    const picture = async (embed: string, box: Box) => {
      const rel = sRels.get(embed);
      if (!rel || !opts.image) return skip("picture");
      const ext = rel.target.split(".").pop()?.toLowerCase() ?? "";
      const type = IMAGE_TYPES[ext];
      if (!type) return skip("picture");
      if (!imageCache.has(rel.target)) {
        const f = zip.file(rel.target);
        imageCache.set(rel.target, f ? await opts.image({ name: rel.target.split("/").pop() ?? "image", type, bytes: await f.async("uint8array") }).catch(() => null) : null);
      }
      const src = imageCache.get(rel.target);
      if (!src) return skip("picture");
      elements.push({ type: "image", ...round(toCanvas(box)), src });
    };

    const walk = async (tree: El | null, frame: Frame) => {
      for (const node of kids(tree)) {
        switch (node.nodeName) {
          case "p:sp": {
            const ph = placeholderOf(node);
            // Slide numbers, dates and footers come from the master; leave them out.
            if (ph && ["sldNum", "dt", "ftr"].includes(ph.type)) break;
            const own = boxOf(path(node, "p:spPr", "a:xfrm"));
            const raw = own ? frame.map(own) : ph ? inheritedBox(ph, layout, master) : null;
            if (!raw) break;
            const box = toCanvas(raw);
            const spPr = kid(node, "p:spPr");
            const geom = path(spPr, "a:prstGeom")?.getAttribute("prst") ?? "rect";
            const fill = validHex(colorOf(kid(spPr, "a:solidFill"), scheme));
            if (fill) elements.push({ type: geom === "ellipse" ? "ellipse" : "rect", ...round(box), fill });
            // Body placeholders are bulleted unless a paragraph says otherwise.
            const body = readText(kid(node, "p:txBody"), scheme, !!ph && family(ph.type) === "body" && ph.type !== "subTitle");
            if (body.text.trim()) {
              const pt = body.sizePt ?? (ph && isTitle(ph.type) ? 40 : ph ? 24 : 18);
              if (ph && isTitle(ph.type) && !title) title = body.text.replace(/\n/g, " ").slice(0, 200);
              elements.push({
                type: "text",
                ...round(box),
                text: body.text.slice(0, 2000),
                size: Math.round(ptToPx(pt)),
                ...(body.color ? { color: body.color } : {}),
                ...(body.bold || (ph && isTitle(ph.type)) ? { bold: true } : {}),
              });
            }
            break;
          }
          case "p:pic": {
            const own = boxOf(path(node, "p:spPr", "a:xfrm"));
            const embed = all(node, "a:blip")[0]?.getAttribute("r:embed");
            if (own && embed) await picture(embed, frame.map(own));
            break;
          }
          case "p:grpSp": {
            const x = path(node, "p:grpSpPr", "a:xfrm");
            const b = boxOf(x);
            const chOff = kid(x, "a:chOff");
            const chExt = kid(x, "a:chExt");
            if (!b || !chOff || !chExt) {
              await walk(node, frame);
              break;
            }
            const sx = b.w / (num(chExt.getAttribute("cx"), 1) || 1);
            const sy = b.h / (num(chExt.getAttribute("cy"), 1) || 1);
            const ox = num(chOff.getAttribute("x"));
            const oy = num(chOff.getAttribute("y"));
            await walk(node, { map: (c) => frame.map({ x: b.x + (c.x - ox) * sx, y: b.y + (c.y - oy) * sy, w: c.w * sx, h: c.h * sy }) });
            break;
          }
          case "p:graphicFrame": {
            const own = boxOf(kid(node, "p:xfrm"));
            const tbl = all(node, "a:tbl")[0];
            if (!own) break;
            if (!tbl) {
              const uri = all(node, "a:graphicData")[0]?.getAttribute("uri") ?? "";
              skip(uri.includes("chart") ? "chart" : uri.includes("diagram") ? "SmartArt graphic" : "object");
              break;
            }
            const rows = all(tbl, "a:tr").map((tr) => kids(tr, "a:tc").map((tc) => readText(kid(tc, "a:txBody"), scheme, false).text.replace(/\n/g, " ")).join("  |  "));
            if (rows.some((r) => r.trim()))
              elements.push({ type: "text", ...round(toCanvas(frame.map(own))), text: rows.join("\n").slice(0, 2000), size: Math.round(ptToPx(14)) });
            break;
          }
          case "mc:AlternateContent": {
            // Newer shapes come with a fallback version older readers understand; use that.
            const fb = kid(node, "mc:Fallback");
            if (fb) await walk(fb, frame);
            break;
          }
          default:
            break;
        }
      }
    };
    await walk(path(slide, "p:sld", "p:cSld", "p:spTree"), IDENTITY);

    // Speaker notes.
    let notes = "";
    const notesPart = relOfType(sRels, "notesSlide");
    if (notesPart) {
      const nd = await xml(notesPart);
      for (const sp of all(nd, "p:sp")) {
        if (placeholderOf(sp)?.type !== "body") continue;
        notes = readText(kid(sp, "p:txBody"), {}, false).text;
      }
    }

    if (elements.length > MAX_ELEMENTS) skip("extra box");
    slides.push({ layout: "free", title, notes: notes.slice(0, 4000), elements: elements.slice(0, MAX_ELEMENTS) });
  }
  if (order.length > MAX_SLIDES) skipped.set(`slide after ${MAX_SLIDES}`, order.length - MAX_SLIDES);

  return {
    slides,
    skipped: [...skipped].map(([what, n]) => `${n} ${what}${n === 1 ? "" : "s"}`),
  };
}

const round = (b: Box) => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.max(20, Math.round(b.w)), h: Math.max(20, Math.round(b.h)) });
