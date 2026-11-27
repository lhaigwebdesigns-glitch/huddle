import JSZip from "jszip";
import { CANVAS, type ElementData, type SlideData } from "./slides-model";

/**
 * Reads a PowerPoint (.pptx) into free-layout slides: every text box, picture and shape at its
 * own spot, looking as close to the original as Cairn's slides can: text size, color, font,
 * bold/italic/underline, alignment (inherited from the slide master and layout when the slide
 * doesn't say), shrink-to-fit, theme colors (with their lighter and darker variants), backgrounds
 * (color, gradient or picture), rounded corners and outlines, rotation, and the speaker notes.
 * Charts, SmartArt, animations and video don't come through; tables become a text box.
 *
 * Pictures upload a few at a time (big decks are mostly pictures). Runs in the browser
 * (DOMParser) and in tests (@xmldom), so the XML parser is passed in.
 */

export interface PptxImage {
  name: string;
  type: string;
  bytes: Uint8Array;
}
export interface PptxProgress {
  stage: "slides" | "pictures";
  done: number;
  total: number;
}
export interface PptxOptions {
  parse: (xml: string) => Document;
  /** Stores a picture and returns its URL, or null to leave it out. */
  image?: (img: PptxImage) => Promise<string | null>;
  /** How far along it is ("slide 4 of 25", "picture 9 of 30"). */
  progress?: (p: PptxProgress) => void;
}
export interface ImportedDeck {
  slides: SlideData[];
  /** Things that didn't come through, for a short note after the import ("2 charts"). */
  skipped: string[];
}

const EMU_PER_PT = 12700;
const MAX_SLIDES = 100;
const MAX_ELEMENTS = 60;
/** Pictures uploading at once. */
const UPLOADS_AT_ONCE = 4;

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
  return v !== null && v !== undefined && v !== "" && Number.isFinite(n) ? n : d;
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
/** Rotation in degrees (PowerPoint stores 60000ths of a degree). */
const rotOf = (xfrm: El | null) => Math.round(num(xfrm?.getAttribute("rot")) / 60000);

// ---------- Colors ----------

interface Theme {
  colors: Record<string, string>;
  /** Heading and body fonts ("+mj-lt" and "+mn-lt" point at these). */
  major?: string;
  minor?: string;
}
const SCHEME_ALIASES: Record<string, string> = { bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2" };

const hexToRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const rgbToHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (!s) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
/** Theme colors are often "Text 1, 35% lighter": lumMod/lumOff, tint and shade. */
function adjust(hex: string, node: El): string {
  let [r, g, b] = hexToRgb(hex);
  for (const m of kids(node)) {
    const v = num(m.getAttribute("val")) / 100000;
    if (m.nodeName === "a:tint") [r, g, b] = [r, g, b].map((c) => c + (1 - c) * (1 - v)) as [number, number, number];
    if (m.nodeName === "a:shade") [r, g, b] = [r, g, b].map((c) => c * v) as [number, number, number];
  }
  const lumMod = kid(node, "a:lumMod");
  const lumOff = kid(node, "a:lumOff");
  if (lumMod || lumOff) {
    const [h, s, l] = rgbToHsl(r, g, b);
    const l2 = Math.max(0, Math.min(1, l * (lumMod ? num(lumMod.getAttribute("val")) / 100000 : 1) + (lumOff ? num(lumOff.getAttribute("val")) / 100000 : 0)));
    [r, g, b] = hslToRgb(h, s, l2);
  }
  return rgbToHex(r, g, b);
}

/** A color from <a:srgbClr>, <a:schemeClr> or <a:sysClr>, with its lighter/darker adjustments. */
function colorOf(holder: El | null, theme: Theme): string | undefined {
  if (!holder) return undefined;
  const srgb = kid(holder, "a:srgbClr");
  if (srgb) return adjust(`#${(srgb.getAttribute("val") ?? "").toLowerCase()}`.padEnd(7, "0"), srgb);
  const sys = kid(holder, "a:sysClr");
  if (sys) return adjust(`#${(sys.getAttribute("lastClr") ?? "000000").toLowerCase()}`, sys);
  const sch = kid(holder, "a:schemeClr");
  if (sch) {
    const v = sch.getAttribute("val") ?? "";
    const base = theme.colors[SCHEME_ALIASES[v] ?? v];
    return base ? adjust(base, sch) : undefined;
  }
  const prst = kid(holder, "a:prstClr");
  if (prst) return prst.getAttribute("val") === "white" ? "#ffffff" : prst.getAttribute("val") === "black" ? "#000000" : undefined;
  return undefined;
}
const validHex = (c: string | undefined) => (c && /^#[0-9a-f]{6}$/.test(c) ? c : undefined);
/** A see-through fill keeps its see-through-ness: "#000000" at 60% becomes "#00000099". */
function withAlpha(hex: string | undefined, holder: El | null): string | undefined {
  if (!hex || !holder) return hex;
  const node = kids(holder)[0];
  const a = kid(node, "a:alpha");
  if (!a) return hex;
  const v = Math.max(0, Math.min(1, num(a.getAttribute("val"), 100000) / 100000));
  return v >= 0.995 ? hex : hex + Math.round(v * 255).toString(16).padStart(2, "0");
}
/** A fill's color: solid, or a gradient's first stop. */
const fillColor = (holder: El | null, theme: Theme) => {
  const solid = kid(holder, "a:solidFill");
  if (solid) return withAlpha(validHex(colorOf(solid, theme)), solid);
  return validHex(colorOf(all(kid(holder, "a:gradFill"), "a:gs")[0] ?? null, theme));
};

function readTheme(doc: Document | null): Theme {
  const colors: Record<string, string> = {};
  const cs = all(doc, "a:clrScheme")[0];
  for (const c of kids(cs)) {
    const v = validHex(colorOf(c, { colors: {} }));
    if (v) colors[c.nodeName.replace(/^a:/, "")] = v;
  }
  const fs = all(doc, "a:fontScheme")[0];
  const face = (n: string) => path(fs, n, "a:latin")?.getAttribute("typeface") || undefined;
  return { colors, major: face("a:majorFont"), minor: face("a:minorFont") };
}

// ---------- Placeholders and inherited text styles ----------

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

/** The matching placeholder shape on the layout (by number, then kind) or the master (by kind). */
function inheritedShapes(ph: Placeholder, layout: Document | null, master: Document | null): El[] {
  const find = (doc: Document | null, byIdx: boolean) => {
    for (const sp of all(doc, "p:sp")) {
      const p = placeholderOf(sp);
      if (!p) continue;
      if (byIdx ? ph.idx && p.idx === ph.idx : family(p.type) === family(ph.type)) return sp;
    }
    return null;
  };
  return [find(layout, true) ?? find(layout, false), find(master, false)].filter((x): x is El => !!x);
}
/** A placeholder's spot on the layout or master, when the slide doesn't say. */
function inheritedBox(chain: El[]): Box | null {
  for (const sp of chain) {
    const b = boxOf(path(sp, "p:spPr", "a:xfrm"));
    if (b) return b;
  }
  return null;
}

/** Text styling, resolved from the slide down through layout, master and defaults. */
interface TextLook {
  sizePt?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  font?: string;
  align?: "left" | "center" | "right";
}
const ALIGN: Record<string, TextLook["align"]> = { l: "left", ctr: "center", r: "right", just: "left", dist: "center" };

/** What one <a:rPr>/<a:defRPr> and its <a:pPr> say (only what's set). */
function lookOf(rpr: El | null, ppr: El | null, theme: Theme): TextLook {
  const out: TextLook = {};
  if (rpr) {
    if (rpr.getAttribute("sz")) out.sizePt = num(rpr.getAttribute("sz")) / 100;
    if (rpr.getAttribute("b") !== null) out.bold = rpr.getAttribute("b") === "1" || rpr.getAttribute("b") === "true";
    if (rpr.getAttribute("i") !== null) out.italic = rpr.getAttribute("i") === "1" || rpr.getAttribute("i") === "true";
    if (rpr.getAttribute("u") !== null) out.underline = (rpr.getAttribute("u") ?? "none") !== "none";
    const c = validHex(colorOf(kid(rpr, "a:solidFill"), theme));
    if (c) out.color = c;
    const face = kid(rpr, "a:latin")?.getAttribute("typeface");
    if (face) out.font = face === "+mj-lt" ? theme.major : face === "+mn-lt" ? theme.minor : face;
  }
  const algn = ppr?.getAttribute("algn");
  if (algn && ALIGN[algn]) out.align = ALIGN[algn];
  return out;
}
/** Fill in anything `a` doesn't set from `b`. */
const under = (a: TextLook, b: TextLook): TextLook => {
  const out: TextLook = { ...b };
  for (const [k, v] of Object.entries(a)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
};
/** A list style's first level (<a:lstStyle>/<p:titleStyle>…): its paragraph and run defaults. */
function levelLook(list: El | null, theme: Theme): TextLook {
  const lvl = kid(list, "a:lvl1pPr");
  return lookOf(kid(lvl, "a:defRPr"), lvl, theme);
}

interface TextRun {
  text: string;
  look: TextLook;
}

/** A text body's text, and how its first words look (paragraph by paragraph, run by run). */
function readText(body: El | null, theme: Theme, base: TextLook, bulletsByDefault: boolean): TextRun {
  const lines: string[] = [];
  let look: TextLook | null = null;
  let number = 0;
  for (const p of kids(body, "a:p")) {
    let line = "";
    const ppr = kid(p, "a:pPr");
    for (const r of kids(p)) {
      if (r.nodeName === "a:br") line += "\n";
      if (r.nodeName !== "a:r" && r.nodeName !== "a:fld") continue;
      const t = kid(r, "a:t")?.textContent ?? "";
      line += t;
      if (t.trim() && !look) look = under(lookOf(kid(r, "a:rPr"), ppr, theme), base);
    }
    if (!look && line.trim()) look = under(lookOf(kid(p, "a:endParaRPr"), ppr, theme), base);
    const auto = kid(ppr, "a:buAutoNum");
    const bullet = !!kid(ppr, "a:buChar") || (bulletsByDefault && !kid(ppr, "a:buNone") && !auto);
    const indent = "    ".repeat(Math.min(4, num(ppr?.getAttribute("lvl"))));
    if (auto && line.trim()) lines.push(`${indent}${++number}. ${line}`);
    else lines.push(bullet && line.trim() ? `${indent}• ${line}` : line);
  }
  // Drop blank lines at the ends, keep the ones in between.
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  while (lines.length && !lines[0].trim()) lines.shift();
  return { text: lines.join("\n"), look: look ?? base };
}

/** Text that's "shrink on overflow" in PowerPoint: the size it actually shows at. */
const fontScaleOf = (body: El | null) => {
  const fit = path(body, "a:bodyPr", "a:normAutofit");
  return fit?.getAttribute("fontScale") ? num(fit.getAttribute("fontScale"), 100000) / 100000 : 1;
};
const VALIGN: Record<string, ElementData["valign"]> = { ctr: "middle", b: "bottom", t: "top" };
const anchorOf = (chain: (El | null)[]) => {
  for (const b of chain) {
    const a = kid(b, "a:bodyPr")?.getAttribute("anchor");
    if (a && VALIGN[a]) return VALIGN[a];
  }
  return undefined;
};

/** Runs async jobs a few at a time. */
async function pool<T>(jobs: (() => Promise<T>)[], n: number, onDone?: (done: number) => void): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, jobs.length) }, async () => {
      while (next < jobs.length) {
        const i = next++;
        out[i] = await jobs[i]();
        onDone?.(++done);
      }
    }),
  );
  return out;
}

export async function readPptx(data: ArrayBuffer | Uint8Array, opts: PptxOptions): Promise<ImportedDeck> {
  const zip = await JSZip.loadAsync(data);
  const parsed = new Map<string, Document | null>();
  const xml = async (part: string): Promise<Document | null> => {
    if (parsed.has(part)) return parsed.get(part)!;
    const f = zip.file(part);
    const d = f ? opts.parse(await f.async("string")) : null;
    parsed.set(part, d);
    return d;
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
  const defaultText = all(pres, "p:defaultTextStyle")[0] ?? null;

  const presRels = await rels("ppt/presentation.xml");
  const order = all(pres, "p:sldId")
    .map((s) => presRels.get(s.getAttribute("r:id") ?? "")?.target)
    .filter((t): t is string => !!t);
  const total = Math.min(order.length, MAX_SLIDES);

  const skipped = new Map<string, number>();
  const skip = (what: string) => skipped.set(what, (skipped.get(what) ?? 0) + 1);
  // Pictures are collected while reading and uploaded together at the end, a few at a time.
  const uploads = new Map<string, { job: () => Promise<string | null>; els: ElementData[] }>();
  const slides: SlideData[] = [];

  for (const [n, part] of order.slice(0, MAX_SLIDES).entries()) {
    opts.progress?.({ stage: "slides", done: n, total });
    // Let the page breathe between slides (big decks shouldn't freeze the screen).
    await new Promise((r) => setTimeout(r, 0));
    const slide = await xml(part);
    if (!slide) continue;
    const sRels = await rels(part);
    const layoutPart = relOfType(sRels, "slideLayout");
    const layout = layoutPart ? await xml(layoutPart) : null;
    const layoutRels = layoutPart ? await rels(layoutPart) : new Map<string, Rel>();
    const masterPart = relOfType(layoutRels, "slideMaster");
    const master = masterPart ? await xml(masterPart) : null;
    const masterRels = masterPart ? await rels(masterPart) : new Map<string, Rel>();
    const themePart = relOfType(masterRels, "theme");
    const theme = readTheme(themePart ? await xml(themePart) : null);
    const txStyles = path(master, "p:sldMaster", "p:txStyles");

    const elements: ElementData[] = [];
    let title = "";

    /** Queue a picture from `relsOf` for upload; its element gets the URL once it's in. */
    const picture = (embed: string, relsOf: Map<string, Rel>, el: ElementData) => {
      const rel = relsOf.get(embed);
      if (!rel || !opts.image) return skip("picture");
      const ext = rel.target.split(".").pop()?.toLowerCase() ?? "";
      const type = IMAGE_TYPES[ext];
      if (!type) return skip("picture");
      const f = zip.file(rel.target);
      if (!f) return skip("picture");
      if (!uploads.has(rel.target))
        uploads.set(rel.target, {
          job: async () => opts.image!({ name: rel.target.split("/").pop() ?? "image", type, bytes: await f.async("uint8array") }).catch(() => null),
          els: [],
        });
      uploads.get(rel.target)!.els.push(el);
      elements.push(el);
    };

    // Background: the slide's own, else its layout's, else the master's (color, gradient or picture).
    const backgroundIn = (doc: Document | null, relsOf: Map<string, Rel>) => {
      const bg = all(doc, "p:bg")[0];
      if (!bg) return false;
      const pr = kid(bg, "p:bgPr");
      const blip = all(kid(pr, "a:blipFill"), "a:blip")[0];
      if (blip?.getAttribute("r:embed")) {
        picture(blip.getAttribute("r:embed")!, relsOf, { type: "image", x: 0, y: 0, w: CANVAS.w, h: CANVAS.h, src: "", fit: "cover" });
        return true;
      }
      const c = fillColor(pr, theme) ?? validHex(colorOf(kid(bg, "p:bgRef"), theme));
      if (c) {
        if (c !== "#ffffff") elements.push({ type: "rect", x: 0, y: 0, w: CANVAS.w, h: CANVAS.h, fill: c, radius: 0 });
        return true;
      }
      return false;
    };
    // Layout and master pictures and shapes that sit behind every slide (logos, bands), unless hidden.
    const showMaster = path(slide, "p:sld")?.getAttribute("showMasterSp") !== "0";
    if (!backgroundIn(slide, sRels) && !backgroundIn(layout, layoutRels)) backgroundIn(master, masterRels);

    const walk = async (tree: El | null, frame: Frame, relsOf: Map<string, Rel>, decorOnly = false) => {
      for (const node of kids(tree)) {
        switch (node.nodeName) {
          case "p:sp": {
            const ph = placeholderOf(node);
            // On layouts and masters, placeholders are only prompts ("Click to add title"): skip them.
            if (decorOnly && ph) break;
            // Slide numbers, dates and footers come from the master; leave them out.
            if (ph && ["sldNum", "dt", "ftr"].includes(ph.type)) break;
            const chain = ph ? inheritedShapes(ph, layout, master) : [];
            const xfrm = path(node, "p:spPr", "a:xfrm");
            const own = boxOf(xfrm);
            const raw = own ? frame.map(own) : ph ? inheritedBox(chain) : null;
            if (!raw) break;
            const box = round(toCanvas(raw));
            const rot = rotOf(xfrm) || undefined;
            const spPr = kid(node, "p:spPr");
            const style = kid(node, "p:style");
            const geom = path(spPr, "a:prstGeom")?.getAttribute("prst") ?? "rect";
            // A picture filling the shape.
            const blip = all(kid(spPr, "a:blipFill"), "a:blip")[0] ?? all(kid(node, "p:blipFill"), "a:blip")[0];
            if (blip?.getAttribute("r:embed")) picture(blip.getAttribute("r:embed")!, relsOf, { type: "image", ...box, src: "", fit: "cover", ...(rot ? { rot } : {}) });
            // Fill: the shape's own, else its style's (shapes drawn in PowerPoint use the theme accent).
            const noFill = !!kid(spPr, "a:noFill");
            const styleFill = num(kid(style, "a:fillRef")?.getAttribute("idx")) > 0 ? validHex(colorOf(kid(style, "a:fillRef"), theme)) : undefined;
            const fill = noFill ? undefined : (fillColor(spPr, theme) ?? (ph ? undefined : styleFill));
            const ln = kid(spPr, "a:ln");
            const lnNo = !!kid(ln, "a:noFill");
            const stroke = lnNo ? undefined : (validHex(colorOf(kid(ln, "a:solidFill"), theme)) ?? (ln || ph ? undefined : num(kid(style, "a:lnRef")?.getAttribute("idx")) > 0 ? validHex(colorOf(kid(style, "a:lnRef"), theme)) : undefined));
            const strokeW = ln?.getAttribute("w") ? Math.max(1, Math.round(ptToPx(num(ln.getAttribute("w")) / EMU_PER_PT))) : 1;
            const isShape = ["rect", "roundRect", "ellipse", "snip1Rect", "snip2SameRect", "round1Rect", "round2SameRect", "flowChartProcess", "flowChartAlternateProcess"].includes(geom);
            if ((fill || stroke) && isShape && !blip)
              elements.push({
                type: geom === "ellipse" ? "ellipse" : "rect",
                ...box,
                fill: fill ?? "none",
                radius: geom.startsWith("round") || geom === "flowChartAlternateProcess" ? Math.round(Math.min(box.w, box.h) * 0.17) : 0,
                ...(stroke ? { stroke, strokeW } : {}),
                ...(rot ? { rot } : {}),
              });
            else if ((fill || stroke) && !isShape && !blip) skip("shape");
            // Text: what the slide says, over the layout's and master's placeholder styles, the master's
            // title/body/other styles, and the deck's defaults.
            const txBody = kid(node, "p:txBody");
            const kind = ph ? (isTitle(ph.type) ? "title" : "body") : "other";
            let base: TextLook = levelLook(kid(defaultText, "a:lvl1pPr") ? defaultText : null, theme);
            base = under(levelLook(kid(txStyles, kind === "title" ? "p:titleStyle" : kind === "body" ? "p:bodyStyle" : "p:otherStyle"), theme), base);
            for (const sp of [...chain].reverse()) base = under(levelLook(path(sp, "p:txBody", "a:lstStyle"), theme), base);
            base = under(levelLook(kid(txBody, "a:lstStyle"), theme), base);
            // Text on a drawn shape defaults to the style's font color (often white on the accent).
            if (!ph && kid(style, "a:fontRef")) {
              const fc = validHex(colorOf(kid(style, "a:fontRef"), theme));
              if (fc && !base.color) base = { ...base, color: fc };
            }
            if (!base.font) base = { ...base, font: kind === "title" ? theme.major : theme.minor };
            const body = readText(txBody, theme, base, kind === "body" && ph?.type !== "subTitle" && ph?.type !== "ctrTitle");
            if (body.text.trim()) {
              const look = body.look;
              const pt = (look.sizePt ?? (kind === "title" ? 40 : kind === "body" ? 24 : 18)) * fontScaleOf(txBody);
              if (ph && isTitle(ph.type) && !title) title = body.text.replace(/\n/g, " ").slice(0, 200);
              const valign = anchorOf([txBody, ...chain.map((sp) => kid(sp, "p:txBody"))]) ?? (kind === "title" ? "middle" : undefined);
              elements.push({
                type: "text",
                ...box,
                text: body.text.slice(0, 2000),
                size: Math.round(ptToPx(pt)),
                ...(look.color ? { color: look.color } : {}),
                ...(look.bold ? { bold: true } : {}),
                ...(look.italic ? { italic: true } : {}),
                ...(look.underline ? { underline: true } : {}),
                ...(look.align && look.align !== "left" ? { align: look.align } : {}),
                ...(valign && valign !== "top" ? { valign } : {}),
                ...(look.font ? { font: look.font } : {}),
                ...(rot ? { rot } : {}),
              });
            }
            break;
          }
          case "p:pic": {
            const xfrm = path(node, "p:spPr", "a:xfrm");
            const own = boxOf(xfrm);
            const blipFill = kid(node, "p:blipFill");
            const embed = all(blipFill, "a:blip")[0]?.getAttribute("r:embed");
            const cropped = !!kid(blipFill, "a:srcRect")?.attributes.length;
            const rot = rotOf(xfrm) || undefined;
            if (own && embed) picture(embed, relsOf, { type: "image", ...round(toCanvas(frame.map(own))), src: "", fit: cropped ? "cover" : "fill", ...(rot ? { rot } : {}) });
            break;
          }
          case "p:grpSp": {
            const x = path(node, "p:grpSpPr", "a:xfrm");
            const b = boxOf(x);
            const chOff = kid(x, "a:chOff");
            const chExt = kid(x, "a:chExt");
            if (!b || !chOff || !chExt) {
              await walk(node, frame, relsOf, decorOnly);
              break;
            }
            const sx = b.w / (num(chExt.getAttribute("cx"), 1) || 1);
            const sy = b.h / (num(chExt.getAttribute("cy"), 1) || 1);
            const ox = num(chOff.getAttribute("x"));
            const oy = num(chOff.getAttribute("y"));
            await walk(node, { map: (c) => frame.map({ x: b.x + (c.x - ox) * sx, y: b.y + (c.y - oy) * sy, w: c.w * sx, h: c.h * sy }) }, relsOf, decorOnly);
            break;
          }
          case "p:graphicFrame": {
            if (decorOnly) break;
            const own = boxOf(kid(node, "p:xfrm"));
            const tbl = all(node, "a:tbl")[0];
            if (!own) break;
            if (!tbl) {
              const uri = all(node, "a:graphicData")[0]?.getAttribute("uri") ?? "";
              skip(uri.includes("chart") ? "chart" : uri.includes("diagram") ? "SmartArt graphic" : "object");
              break;
            }
            const rows = all(tbl, "a:tr").map((tr) => kids(tr, "a:tc").map((tc) => readText(kid(tc, "a:txBody"), theme, {}, false).text.replace(/\n/g, " ")).join("  |  "));
            if (rows.some((r) => r.trim()))
              elements.push({ type: "text", ...round(toCanvas(frame.map(own))), text: rows.join("\n").slice(0, 2000), size: Math.round(ptToPx(14)), ...(theme.minor ? { font: theme.minor } : {}) });
            break;
          }
          case "mc:AlternateContent": {
            // Newer shapes come with a fallback version older readers understand; use that.
            const fb = kid(node, "mc:Fallback");
            if (fb) await walk(fb, frame, relsOf, decorOnly);
            break;
          }
          default:
            break;
        }
      }
    };
    // What the master and layout draw on every slide (logos, color bands), then the slide itself.
    if (showMaster) {
      if (path(layout, "p:sldLayout")?.getAttribute("showMasterSp") !== "0") await walk(path(master, "p:sldMaster", "p:cSld", "p:spTree"), IDENTITY, masterRels, true);
      await walk(path(layout, "p:sldLayout", "p:cSld", "p:spTree"), IDENTITY, layoutRels, true);
    }
    await walk(path(slide, "p:sld", "p:cSld", "p:spTree"), IDENTITY, sRels);

    // Speaker notes.
    let notes = "";
    const notesPart = relOfType(sRels, "notesSlide");
    if (notesPart) {
      const nd = await xml(notesPart);
      for (const sp of all(nd, "p:sp")) {
        if (placeholderOf(sp)?.type !== "body") continue;
        notes = readText(kid(sp, "p:txBody"), { colors: {} }, {}, false).text;
      }
    }

    if (elements.length > MAX_ELEMENTS) skip("extra box");
    slides.push({ layout: "free", title, notes: notes.slice(0, 4000), elements: elements.slice(0, MAX_ELEMENTS) });
  }
  opts.progress?.({ stage: "slides", done: total, total });
  if (order.length > MAX_SLIDES) skipped.set(`slide after ${MAX_SLIDES}`, order.length - MAX_SLIDES);

  // Upload the pictures, a few at a time; any that don't make it are left out.
  const queued = [...uploads.values()];
  opts.progress?.({ stage: "pictures", done: 0, total: queued.length });
  const urls = await pool(
    queued.map((q) => q.job),
    UPLOADS_AT_ONCE,
    (done) => opts.progress?.({ stage: "pictures", done, total: queued.length }),
  );
  const failed = new Set<ElementData>();
  queued.forEach((q, i) => {
    for (const el of q.els) {
      if (urls[i]) el.src = urls[i]!;
      else failed.add(el);
    }
  });
  for (const s of slides) {
    const before = s.elements!.length;
    s.elements = s.elements!.filter((e) => !failed.has(e));
    for (let k = before - s.elements.length; k > 0; k--) skip("picture");
  }

  return {
    slides,
    skipped: [...skipped].map(([what, n]) => `${n} ${what}${n === 1 ? "" : "s"}`),
  };
}

const round = (b: Box) => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.max(20, Math.round(b.w)), h: Math.max(20, Math.round(b.h)) });
