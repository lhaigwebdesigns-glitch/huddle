import { useCallback, useEffect, useState } from "react";
import * as Y from "yjs";
import type { EditorProps } from "./FilePanel";
import { usePeers, useYObserve } from "../lib/useYDoc";
import {
  bullets,
  CANVAS,
  deckOf,
  LAYOUT_LABEL,
  LAYOUTS,
  makeSlide,
  readSlide,
  setText,
  slidesOf,
  THEMES,
  themeOf,
  type Layout,
  type SlideData,
  type TextField,
  type ThemeName,
} from "../../shared/slides-model";
import { SLIDE_H, SLIDE_W, SlideView, useWidth } from "./SlideView";
import { FreeCanvas } from "./FreeCanvas";
import { download, safeName } from "../lib/download";

type Full = Required<SlideData>;

function Present({
  slides,
  theme,
  start,
  follow,
  presenterName,
  onIndex,
  onExit,
}: {
  slides: Full[];
  theme: ThemeName;
  start: number;
  /** When following someone, their slide index drives ours. */
  follow?: number;
  presenterName?: string;
  onIndex?: (i: number) => void;
  onExit: () => void;
}) {
  const [i, setI] = useState(start);
  const [notes, setNotes] = useState(false);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const index = Math.max(0, Math.min(slides.length - 1, follow ?? i));
  useEffect(() => onIndex?.(index), [index, onIndex]);
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
      if (follow !== undefined) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) setI((x) => Math.min(slides.length - 1, x + 1));
      if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) setI((x) => Math.max(0, x - 1));
      if (e.key.toLowerCase() === "n") setNotes((n) => !n);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [follow, slides.length, onExit]);
  const w = Math.min(size.w, (size.h * SLIDE_W) / SLIDE_H);
  const slide = slides[index];
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black" role="dialog" aria-label="Presentation" data-testid="present">
      {slide && <SlideView slide={slide} theme={theme} width={w} />}
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-zinc-900/80 px-4 py-1.5 text-sm text-white opacity-60 hover:opacity-100">
        {follow === undefined ? (
          <>
            <button onClick={() => setI((x) => Math.max(0, x - 1))} aria-label="Previous slide">◀</button>
            <span data-testid="present-index">{index + 1} / {slides.length}</span>
            <button onClick={() => setI((x) => Math.min(slides.length - 1, x + 1))} aria-label="Next slide">▶</button>
            <button onClick={() => setNotes((n) => !n)}>Notes (N)</button>
          </>
        ) : (
          <span data-testid="present-index">Following {presenterName} · {index + 1} / {slides.length}</span>
        )}
        <button onClick={onExit}>Exit (Esc)</button>
      </div>
      {notes && slide?.notes && (
        <div className="absolute bottom-14 left-1/2 max-w-2xl -translate-x-1/2 rounded-lg bg-zinc-900/90 px-4 py-2 text-sm text-zinc-100">{slide.notes}</div>
      )}
    </div>
  );
}

function exportHtml(slides: Full[], theme: ThemeName, title: string) {
  const t = THEMES[theme];
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const body = slides
    .map((s) => {
      const list = (b: string) => `<ul>${bullets(b).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
      // Free layout: every box at its own spot, as a share of the 960×540 canvas.
      const pct = (n: number, of: number) => `${((n / of) * 100).toFixed(2)}%`;
      const free = (s.elements ?? [])
        .map((e) => {
          const pos = `position:absolute;left:${pct(e.x, CANVAS.w)};top:${pct(e.y, CANVAS.h)};width:${pct(e.w, CANVAS.w)};height:${pct(e.h, CANVAS.h)}`;
          if (e.type === "image") return e.src ? `<img class="free" style="${pos};object-fit:cover" src="${esc(new URL(e.src, location.href).href)}">` : "";
          if (e.type === "rect" || e.type === "ellipse") return `<div style="${pos};background:${e.fill};border-radius:${e.type === "ellipse" ? "50%" : "8px"}"></div>`;
          return `<div style="${pos};font-size:${((e.size ?? 28) * 0.75).toFixed(1)}pt;${e.color ? `color:${e.color};` : ""}${e.bold ? "font-weight:700;" : ""}white-space:pre-wrap;overflow:hidden">${esc(e.text ?? "")}</div>`;
        })
        .join("");
      if (s.layout === "free") return `<section class="free">${free}</section>`;
      const inner =
        s.layout === "title" || s.layout === "section"
          ? `<h1>${esc(s.title)}</h1><p class="sub">${esc(s.body)}</p>`
          : s.layout === "quote"
            ? `<blockquote>“${esc(s.title)}”</blockquote><p class="sub">${esc(s.body)}</p>`
            : s.layout === "two"
              ? `<h2>${esc(s.title)}</h2><div class="cols"><div>${list(s.body)}</div><div>${list(s.body2)}</div></div>`
              : s.layout === "image"
                ? `<h2>${esc(s.title)}</h2>${list(s.body)}${s.image ? `<img src="${esc(s.image)}">` : ""}`
                : `<h2>${esc(s.title)}</h2>${list(s.body)}`;
      return `<section class="${s.layout}">${inner}</section>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{size:13.333in 7.5in;margin:0}body{margin:0;font-family:${t.font}}
section{width:13.333in;height:7.5in;box-sizing:border-box;padding:.9in 1.1in;background:${t.bg};color:${t.fg};page-break-after:always;overflow:hidden;position:relative}
section.section{background:${t.accent};color:${t.bg};display:flex;flex-direction:column;justify-content:center;text-align:center}
section.title{display:flex;flex-direction:column;justify-content:center}
h1{font-size:52pt;margin:0}h2{font-size:34pt;margin:0 0 .35in}.sub{font-size:22pt;color:${t.muted}}
ul{font-size:22pt;line-height:1.45;padding-left:.35in}li::marker{color:${t.accent}}
blockquote{font-size:34pt;font-style:italic;margin:1in 0 .3in}.cols{display:grid;grid-template-columns:1fr 1fr;gap:.6in}
img{position:absolute;right:0;top:0;width:50%;height:100%;object-fit:cover}
section.free{padding:0}section.free img.free{right:auto}
</style></head><body>${body}<script>onload=()=>setTimeout(()=>print(),300)</script></body></html>`;
}

async function exportPptx(slides: Full[], theme: ThemeName, title: string) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const t = THEMES[theme];
  const hex = (c: string) => c.replace("#", "").slice(0, 6);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pptx.title = title;
  const font = t.font.includes("Georgia") ? "Georgia" : "Calibri";
  for (const s of slides) {
    const slide = pptx.addSlide();
    slide.background = { color: hex(s.layout === "section" ? t.accent : t.bg) };
    const fg = hex(s.layout === "section" ? t.bg : t.fg);
    const bulletRuns = (b: string) => bullets(b).map((text) => ({ text, options: { bullet: { code: "25CF" }, breakLine: true } }));
    // Free layout: the 960×540 canvas maps onto the 13.33×7.5 in slide.
    const inch = (px: number) => (px / CANVAS.w) * 13.333;
    if (s.layout === "free") {
      for (const e of s.elements ?? []) {
        const box = { x: inch(e.x), y: inch(e.y), w: inch(e.w), h: inch(e.h) };
        if (e.type === "text") slide.addText(e.text ?? "", { ...box, fontSize: Math.round((e.size ?? 28) * 0.75), color: e.color ? hex(e.color) : fg, bold: !!e.bold, fontFace: font, valign: "top" });
        else if (e.type === "image" && e.src) {
          try {
            slide.addImage({ path: new URL(e.src, location.href).href, ...box, sizing: { type: "cover", w: box.w, h: box.h } });
          } catch {
            /* unreachable image: leave the space empty */
          }
        } else if (e.type === "rect" || e.type === "ellipse")
          slide.addShape(e.type === "ellipse" ? pptx.ShapeType.ellipse : pptx.ShapeType.roundRect, { ...box, fill: { color: hex(e.fill ?? "#4f46e5") }, line: { color: hex(e.fill ?? "#4f46e5") } });
      }
    } else if (s.layout === "title") {
      slide.addText(s.title, { x: 1, y: 2.4, w: 11.3, h: 1.4, fontSize: 48, bold: true, color: fg, fontFace: font });
      slide.addText(s.body, { x: 1, y: 3.9, w: 11.3, h: 1, fontSize: 24, color: hex(t.muted), fontFace: font });
    } else if (s.layout === "section") {
      slide.addText(s.title, { x: 0.8, y: 2.8, w: 11.7, h: 1.6, fontSize: 44, bold: true, color: fg, align: "center", fontFace: font });
    } else if (s.layout === "quote") {
      slide.addText(`“${s.title}”`, { x: 1.2, y: 1.8, w: 10.9, h: 2.6, fontSize: 36, italic: true, color: fg, fontFace: font });
      slide.addText(s.body, { x: 1.2, y: 4.6, w: 10.9, h: 0.8, fontSize: 20, color: hex(t.muted), fontFace: font });
    } else {
      const half = s.layout === "two" || s.layout === "image";
      slide.addText(s.title, { x: 0.8, y: 0.5, w: half && s.layout === "image" ? 5.6 : 11.7, h: 1.1, fontSize: 34, bold: true, color: fg, fontFace: font });
      slide.addText(bulletRuns(s.body), { x: 0.8, y: 1.8, w: half ? 5.6 : 11.7, h: 5, fontSize: 22, color: fg, valign: "top", fontFace: font });
      if (s.layout === "two") slide.addText(bulletRuns(s.body2), { x: 6.9, y: 1.8, w: 5.6, h: 5, fontSize: 22, color: fg, valign: "top", fontFace: font });
      if (s.layout === "image" && s.image) {
        try {
          slide.addImage({ path: s.image, x: 6.67, y: 0, w: 6.67, h: 7.5, sizing: { type: "cover", w: 6.67, h: 7.5 } });
        } catch {
          /* unreachable image: leave the space empty */
        }
      }
    }
    if (s.notes) slide.addNotes(s.notes);
  }
  await pptx.writeFile({ fileName: `${safeName(title, "deck")}.pptx` });
}

export default function SlidesEditor({ ydoc, provider, file, me, synced, room }: EditorProps) {
  const slidesArr = slidesOf(ydoc);
  const deck = deckOf(ydoc);
  useYObserve([slidesArr, deck]);
  const peers = usePeers(provider);
  const slides = slidesArr.toArray().map(readSlide);
  const theme = themeOf(ydoc);
  const [current, setCurrent] = useState(0);
  const [presenting, setPresenting] = useState<null | { follow?: number; who?: string }>(null);
  const [mainRef, mainW] = useWidth<HTMLDivElement>();
  const idx = Math.min(current, Math.max(0, slides.length - 1));
  const slide = slides[idx];
  const ymap = slidesArr.get(idx) as Y.Map<any> | undefined;

  useEffect(() => {
    provider.awareness.setLocalStateField("slide", idx);
  }, [provider, idx]);

  const setPresentIndex = useCallback(
    (i: number) => provider.awareness.setLocalStateField("present", { index: i }),
    [provider],
  );
  const stopPresenting = useCallback(() => {
    provider.awareness.setLocalStateField("present", null);
    setPresenting(null);
  }, [provider]);

  const presenter = peers.find((p) => p.state?.present && p.state?.user);
  const editField = (f: TextField, v: string) => {
    const t = ymap?.get(f);
    if (t instanceof Y.Text) setText(t, v);
    else ymap?.set(f, new Y.Text(v));
  };
  const add = (layout: Layout) => {
    ydoc.transact(() => slidesArr.insert(idx + 1, [makeSlide({ layout, title: "" })]), "user");
    setCurrent(idx + 1);
  };
  const moveSlide = (dir: -1 | 1) => {
    const to = idx + dir;
    if (to < 0 || to >= slides.length) return;
    ydoc.transact(() => {
      const data = readSlide(slidesArr.get(idx));
      slidesArr.delete(idx, 1);
      slidesArr.insert(to, [makeSlide(data)]);
    }, "user");
    setCurrent(to);
  };
  const dup = () => {
    ydoc.transact(() => slidesArr.insert(idx + 1, [makeSlide({ ...slide, id: undefined })]), "user");
    setCurrent(idx + 1);
  };
  const del = () => {
    if (slides.length <= 1) return;
    ydoc.transact(() => slidesArr.delete(idx, 1), "user");
    setCurrent(Math.max(0, idx - 1));
  };

  // Anyone who's here now or already owns a slide can be given one.
  const owners = [
    { uid: me.uid, name: me.name },
    ...peers.filter((p) => p.state?.user?.uid).map((p) => ({ uid: String(p.state.user.uid), name: String(p.state.user.name) })),
    ...slides.flatMap((s) => (s.owner ? [s.owner] : [])),
  ].filter((o, i, all) => all.findIndex((x) => x.uid === o.uid) === i);
  const viewersOf = (i: number) => peers.filter((p) => p.state?.slide === i && p.state?.user);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="slides-editor">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-3 py-1 text-xs text-zinc-500 dark:border-zinc-800">
        <span>{synced ? "● Live" : "Connecting…"}</span>
        <label className="flex items-center gap-1">
          Theme
          <select
            aria-label="Theme"
            value={theme}
            onChange={(e) => deck.set("theme", e.target.value)}
            className="rounded border border-zinc-200 bg-transparent px-1 py-0.5 dark:border-zinc-700"
          >
            {Object.keys(THEMES).map((k) => (
              <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>
            ))}
          </select>
        </label>
        <span className="flex-1" />
        <button className="hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => exportPptx(slides, theme, file.title)}>⬇ PowerPoint</button>
        <button
          className="hover:text-zinc-900 dark:hover:text-zinc-100"
          onClick={() => download(`${safeName(file.title, "deck")}.html`, "text/html", exportHtml(slides, theme, file.title))}
          title="Downloads a printable page: open it and choose Save as PDF"
        >
          ⬇ PDF (print)
        </button>
        <button
          onClick={() => setPresenting({})}
          className="rounded-md bg-primary px-2.5 py-1 font-semibold text-primary-fg hover:bg-primary-hover"
          data-testid="present-button"
        >
          ▶ Present
        </button>
      </div>
      {presenter && !presenting && (
        <div className="flex items-center gap-2 border-b border-line-strong bg-surface-2 px-3 py-1.5 text-sm text-fg ">
          <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: presenter.state.user.color }} />
          {presenter.state.user.name} is presenting
          <button
            onClick={() => setPresenting({ follow: presenter.clientId, who: presenter.state.user.name })}
            className="ml-auto rounded bg-primary px-2 py-0.5 text-xs font-semibold text-primary-fg"
            data-testid="follow-presenter"
          >
            Follow along
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <ol className="w-36 shrink-0 space-y-2 overflow-y-auto border-r border-zinc-200 p-2 dark:border-zinc-800" aria-label="Slides">
          {slides.map((s, i) => (
            <li key={s.id}>
              <button
                onClick={() => setCurrent(i)}
                className={`relative block w-full overflow-hidden rounded border-2 ${i === idx ? "border-fg" : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-700"}`}
                aria-label={`Slide ${i + 1}: ${s.title || "untitled"}`}
                aria-current={i === idx}
                data-testid="slide-thumb"
              >
                <SlideView slide={s} theme={theme} width={124} />
                <span className="absolute bottom-0.5 left-1 rounded bg-black/50 px-1 text-[10px] text-white">{i + 1}</span>
                {s.owner && (
                  <span className="absolute bottom-0.5 right-1 max-w-[70%] truncate rounded bg-black/60 px-1 text-[10px] text-white" data-testid="slide-owner-badge">
                    {s.owner.name}
                  </span>
                )}
                <span className="absolute right-0.5 top-0.5 flex gap-0.5">
                  {viewersOf(i).map((p) => (
                    <span key={p.clientId} className="h-2.5 w-2.5 rounded-full ring-1 ring-white" style={{ background: p.state.user.color }} title={p.state.user.name} />
                  ))}
                </span>
              </button>
            </li>
          ))}
          <li>
            <details className="text-xs">
              <summary className="cursor-pointer rounded border border-dashed border-zinc-300 py-2 text-center text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800" data-testid="add-slide">
                + Slide
              </summary>
              <div className="mt-1 space-y-0.5">
                {LAYOUTS.map((l) => (
                  <button key={l} onClick={(e) => ((e.currentTarget.closest("details") as HTMLDetailsElement).open = false, add(l))} className="block w-full rounded px-1 py-0.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800">
                    {LAYOUT_LABEL[l]}
                  </button>
                ))}
              </div>
            </details>
          </li>
        </ol>
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-zinc-100 p-4 dark:bg-zinc-950">
          {!slide && (
            <button onClick={() => add("title")} className="m-auto rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg">
              + Add the first slide
            </button>
          )}
          {slide && (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-1 text-xs">
                <select
                  aria-label="Layout"
                  value={slide.layout}
                  onChange={(e) => ymap?.set("layout", e.target.value)}
                  className="rounded border border-zinc-300 bg-white px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {LAYOUTS.map((l) => (
                    <option key={l} value={l}>{LAYOUT_LABEL[l]}</option>
                  ))}
                </select>
                <button onClick={() => moveSlide(-1)} className="rounded px-1.5 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800" aria-label="Move slide up">↑</button>
                <button onClick={() => moveSlide(1)} className="rounded px-1.5 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800" aria-label="Move slide down">↓</button>
                <button onClick={dup} className="rounded px-1.5 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800">Duplicate</button>
                <button onClick={del} disabled={slides.length <= 1} className="rounded px-1.5 py-0.5 text-red-600 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-950/40">Delete</button>
                <label className="ml-2 flex items-center gap-1 text-zinc-500">
                  Owner
                  <select
                    aria-label="Slide owner"
                    value={slide.owner?.uid ?? ""}
                    onChange={(e) => {
                      const uid = e.target.value;
                      const who = owners.find((o) => o.uid === uid);
                      if (!uid) ymap?.delete("owner");
                      else if (who) ymap?.set("owner", who);
                    }}
                    className="rounded border border-zinc-300 bg-white px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-900"
                    data-testid="slide-owner"
                  >
                    <option value="">Nobody</option>
                    {owners.map((o) => (
                      <option key={o.uid} value={o.uid}>
                        {o.name}
                        {o.uid === me.uid ? " (you)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="ml-auto text-zinc-500">Slide {idx + 1} of {slides.length}</span>
              </div>
              <div ref={mainRef} className="w-full shadow-lg">
                {slide.layout === "free" && ymap ? (
                  <FreeCanvas slide={ymap} theme={theme} width={mainW} room={room} />
                ) : (
                  <SlideView slide={slide} theme={theme} width={mainW} editable onEdit={editField} />
                )}
              </div>
              {slide.layout === "image" && (
                <input
                  aria-label="Image URL"
                  placeholder="Image URL (https://…)"
                  defaultValue={slide.image}
                  key={slide.id + slide.image}
                  onBlur={(e) => ymap?.set("image", /^https:\/\//.test(e.target.value) ? e.target.value : "")}
                  className="mt-2 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              )}
              <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Speaker notes</label>
              <textarea
                aria-label="Speaker notes"
                value={slide.notes}
                onChange={(e) => editField("notes", e.target.value)}
                placeholder="What to say on this slide…"
                rows={3}
                className="mt-1 w-full rounded border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </>
          )}
        </div>
      </div>
      {presenting && (
        <Present
          slides={slides}
          theme={theme}
          start={idx}
          follow={presenting.follow !== undefined ? (peers.find((p) => p.clientId === presenting.follow)?.state?.present?.index ?? 0) : undefined}
          presenterName={presenting.who}
          onIndex={presenting.follow === undefined ? setPresentIndex : undefined}
          onExit={stopPresenting}
        />
      )}
      <span className="sr-only">{me.name}</span>
    </div>
  );
}
