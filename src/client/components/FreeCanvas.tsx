import { alertDialog } from "./Dialogs";
import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { Circle, Image as ImageIcon, Minus, Plus, Square, Trash2, Type } from "lucide-react";
import { CANVAS, elementsOf, makeElement, readElement, setText, THEMES, type ElementData, type ThemeName } from "../../shared/slides-model";
import { uploadFile } from "../lib/uploads";
import { snapBox } from "../../shared/snap";

const COLORS = ["#4f46e5", "#0ea5e9", "#16a34a", "#f59e0b", "#dc2626", "#db2777", "#18181b", "#ffffff"];

/** A free-layout slide you can edit: add text, images and shapes, then drag, resize and line them up. */
export function FreeCanvas({ slide, theme, width, room }: { slide: Y.Map<any>; theme: ThemeName; width: number; room: string }) {
  const t = THEMES[theme];
  const scale = width / CANVAS.w;
  let arr = elementsOf(slide);
  const [, setTick] = useState(0);
  useEffect(() => {
    const a = elementsOf(slide);
    if (!a) return;
    const bump = () => setTick((n) => n + 1);
    a.observeDeep(bump);
    return () => a.unobserveDeep(bump);
  }, [slide, arr]);
  const [selected, setSelected] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const imageInput = useRef<HTMLInputElement>(null);
  const els = (arr?.toArray() ?? []).map((m) => ({ m, e: readElement(m) }));
  const sel = els.find((x) => x.e.id === selected);

  const ensureArray = () => {
    if (!arr) {
      arr = new Y.Array<Y.Map<any>>();
      slide.set("elements", arr);
    }
    return arr;
  };
  const add = (e: ElementData) => {
    const a = ensureArray();
    const m = makeElement(e);
    a.push([m]);
    setSelected(m.get("id"));
  };
  const remove = (id: string) => {
    const i = els.findIndex((x) => x.e.id === id);
    if (i >= 0) arr?.delete(i, 1);
    setSelected(null);
  };
  const toFront = (id: string) => {
    const i = els.findIndex((x) => x.e.id === id);
    if (i < 0 || i === els.length - 1 || !arr) return;
    const data = els[i].e;
    slide.doc!.transact(() => {
      arr!.delete(i, 1);
      arr!.push([makeElement(data)]);
    });
  };

  /** Drag to move (mode "move") or to resize from the bottom-right corner (mode "resize"). */
  const startDrag = (ev: React.PointerEvent, id: string, mode: "move" | "resize") => {
    const item = els.find((x) => x.e.id === id);
    if (!item) return;
    ev.preventDefault();
    ev.stopPropagation();
    setSelected(id);
    const start = { px: ev.clientX, py: ev.clientY, ...item.e };
    const others = els.filter((x) => x.e.id !== id).map((x) => x.e);
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - start.px) / scale;
      const dy = (e.clientY - start.py) / scale;
      if (mode === "move") {
        const snapped = snapBox({ x: start.x + dx, y: start.y + dy, w: start.w, h: start.h }, others);
        setGuides(snapped.guides);
        slide.doc!.transact(() => {
          item.m.set("x", Math.round(snapped.x));
          item.m.set("y", Math.round(snapped.y));
        });
      } else {
        slide.doc!.transact(() => {
          item.m.set("w", Math.max(24, Math.round(start.w + dx)));
          item.m.set("h", Math.max(24, Math.round(start.h + dy)));
        });
      }
    };
    const up = () => {
      setGuides({ v: [], h: [] });
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Delete removes the selected box (unless you're typing in it); arrows nudge it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!sel || (e.target as HTMLElement)?.closest?.("textarea, input")) return;
      if (e.key === "Delete" || e.key === "Backspace") return e.preventDefault(), remove(sel.e.id);
      const step = e.shiftKey ? 10 : 1;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (d) {
        e.preventDefault();
        slide.doc!.transact(() => {
          sel.m.set("x", sel.e.x + d[0]);
          sel.m.set("y", sel.e.y + d[1]);
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toolBtn = "press flex items-center gap-1 rounded-md px-2 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-800";
  return (
    <div data-testid="free-canvas">
      <div className="mb-2 flex flex-wrap items-center gap-1 text-xs" role="toolbar" aria-label="Add to slide">
        <button className={toolBtn} onClick={() => add({ type: "text", x: 80, y: 80, w: 400, h: 80, text: "", size: 32 })} data-testid="add-text-box">
          <Type className="h-3.5 w-3.5" /> Text
        </button>
        <button className={toolBtn} onClick={() => imageInput.current?.click()} data-testid="add-image-box">
          <ImageIcon className="h-3.5 w-3.5" /> Image
        </button>
        <button className={toolBtn} onClick={() => add({ type: "rect", x: 120, y: 120, w: 240, h: 140, fill: COLORS[0] })} data-testid="add-rect">
          <Square className="h-3.5 w-3.5" /> Box
        </button>
        <button className={toolBtn} onClick={() => add({ type: "ellipse", x: 160, y: 140, w: 160, h: 160, fill: COLORS[1] })}>
          <Circle className="h-3.5 w-3.5" /> Circle
        </button>
        {sel && (
          <span className="ml-2 flex items-center gap-1 border-l border-zinc-300 pl-2 dark:border-zinc-700">
            {sel.e.type === "text" && (
              <>
                <button className={toolBtn} aria-label="Smaller text" onClick={() => sel.m.set("size", Math.max(10, (sel.e.size ?? 28) - 4))}>
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="tabular">{sel.e.size ?? 28}px</span>
                <button className={toolBtn} aria-label="Bigger text" onClick={() => sel.m.set("size", Math.min(120, (sel.e.size ?? 28) + 4))}>
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {(sel.e.type === "rect" || sel.e.type === "ellipse") &&
              COLORS.map((c) => (
                <button key={c} aria-label={`Fill ${c}`} onClick={() => sel.m.set("fill", c)} className="h-5 w-5 rounded-full border border-zinc-300" style={{ background: c }} />
              ))}
            <button className={toolBtn} onClick={() => toFront(sel.e.id)}>
              Bring to front
            </button>
            <button className={`${toolBtn} text-red-600`} onClick={() => remove(sel.e.id)} data-testid="delete-element">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </span>
        )}
      </div>
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const a = await uploadFile(room, f);
            add({ type: "image", x: 480, y: 90, w: 400, h: 300, src: a.url });
          } catch (err) {
            void alertDialog({ title: "That image didn't upload", message: String((err as Error).message) });
          }
        }}
      />
      <div style={{ width, height: CANVAS.h * scale, overflow: "hidden", position: "relative" }} onPointerDown={() => setSelected(null)}>
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ width: CANVAS.w, height: CANVAS.h, transform: `scale(${scale})`, background: t.bg, color: t.fg, fontFamily: t.font }}
          data-testid="slide-canvas"
        >
          {els.map(({ m, e }) => {
            const isSel = e.id === selected;
            return (
              <div
                key={e.id}
                data-testid="slide-element"
                data-type={e.type}
                onPointerDown={(ev) => {
                  if (e.type !== "text") return startDrag(ev, e.id, "move");
                  ev.stopPropagation();
                  setSelected(e.id);
                }}
                style={{
                  position: "absolute",
                  left: e.x,
                  top: e.y,
                  width: e.w,
                  height: e.h,
                  outline: isSel ? `2px solid ${t.accent}` : undefined,
                  outlineOffset: 2,
                  cursor: e.type === "text" ? "text" : "move",
                }}
              >
                {e.type === "text" && (
                  <textarea
                    value={e.text ?? ""}
                    placeholder="Type here"
                    aria-label="Text box"
                    onChange={(ev) => {
                      const tx = m.get("text");
                      if (tx instanceof Y.Text) setText(tx, ev.target.value);
                    }}
                    onPointerDown={(ev) => ev.stopPropagation()}
                    onFocus={() => setSelected(e.id)}
                    className="h-full w-full resize-none bg-transparent outline-none placeholder:opacity-40"
                    style={{ fontSize: e.size ?? 28, lineHeight: 1.3, color: e.color ?? t.fg, fontWeight: e.bold ? 700 : undefined, fontFamily: t.font }}
                  />
                )}
                {e.type === "image" &&
                  (e.src ? (
                    <img src={e.src} alt="" draggable={false} referrerPolicy="no-referrer" className="pointer-events-none h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full border-2 border-dashed" style={{ borderColor: t.muted }} />
                  ))}
                {(e.type === "rect" || e.type === "ellipse") && (
                  <div className="h-full w-full" style={{ background: e.fill, borderRadius: e.type === "ellipse" ? "50%" : 8 }} />
                )}
                {isSel && (
                  <>
                    {e.type === "text" && (
                      <div
                        title="Drag to move"
                        aria-label="Move text box"
                        onPointerDown={(ev) => startDrag(ev, e.id, "move")}
                        data-testid="move-handle"
                        className="absolute -top-7 left-0 cursor-move rounded px-2 py-0.5 text-[13px] text-white"
                        style={{ background: t.accent }}
                      >
                        ⠿ Move
                      </div>
                    )}
                    <div
                      title="Drag to resize"
                      aria-label="Resize"
                      onPointerDown={(ev) => startDrag(ev, e.id, "resize")}
                      data-testid="resize-handle"
                      className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-sm border-2 bg-white"
                      style={{ borderColor: t.accent }}
                    />
                  </>
                )}
              </div>
            );
          })}
          {guides.v.map((x) => (
            <div key={`v${x}`} className="pointer-events-none absolute top-0 h-full w-px" style={{ left: x, background: "#ec4899" }} data-testid="snap-guide" />
          ))}
          {guides.h.map((y) => (
            <div key={`h${y}`} className="pointer-events-none absolute left-0 h-px w-full" style={{ top: y, background: "#ec4899" }} data-testid="snap-guide" />
          ))}
          {!els.length && (
            <div className="pointer-events-none flex h-full items-center justify-center text-center" style={{ color: t.muted, fontSize: 26 }}>
              Add text, images and shapes with the buttons above, then drag them anywhere.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
