import { useEffect, useRef, useState } from "react";
import { bullets, THEMES, type ElementData, type Layout, type SlideData, type TextField, type ThemeName } from "../../shared/slides-model";

/** A box's own font, with the theme's as the fallback (a PowerPoint font may not be on this computer). */
const fontStack = (font: string | undefined, themeFont: string) => (font ? `"${font}", ${themeFont}` : undefined);

/** How a text box's words look: size, color, weight, slant, underline, alignment and font. */
export function textStyle(e: ElementData, fg: string, themeFont: string): React.CSSProperties {
  return {
    fontSize: e.size ?? 28,
    lineHeight: 1.25,
    color: e.color ?? fg,
    fontWeight: e.bold ? 700 : undefined,
    fontStyle: e.italic ? "italic" : undefined,
    textDecoration: e.underline ? "underline" : undefined,
    textAlign: e.align ?? "left",
    fontFamily: fontStack(e.font, themeFont),
  };
}

/** A shape's fill, corners and outline. */
export function shapeStyle(e: ElementData): React.CSSProperties {
  return {
    background: e.fill === "none" ? "transparent" : e.fill,
    borderRadius: e.type === "ellipse" ? "50%" : (e.radius ?? 8),
    ...(e.stroke ? { border: `${e.strokeW ?? 2}px solid ${e.stroke}`, boxSizing: "border-box" } : {}),
  };
}

/** Where a box sits (and its turn). */
export const boxStyle = (e: ElementData): React.CSSProperties => ({
  position: "absolute",
  left: e.x,
  top: e.y,
  width: e.w,
  height: e.h,
  ...(e.rot ? { transform: `rotate(${e.rot}deg)` } : {}),
});

/** One box on a free-layout slide, drawn without editing (thumbnails, presenting, exports). */
export function StaticElement({ e, fg, font = "inherit" }: { e: ElementData; fg: string; font?: string }) {
  const box = boxStyle(e);
  if (e.type === "image")
    return e.src ? <img src={e.src} alt="" referrerPolicy="no-referrer" style={{ ...box, objectFit: e.fit ?? "cover" }} /> : <div style={{ ...box, border: "2px dashed " + fg + "55" }} />;
  if (e.type === "rect" || e.type === "ellipse") return <div style={{ ...box, ...shapeStyle(e) }} />;
  return (
    <div
      style={{
        ...box,
        ...textStyle(e, fg, font),
        whiteSpace: "pre-wrap",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: e.valign === "middle" ? "center" : e.valign === "bottom" ? "flex-end" : "flex-start",
      }}
    >
      <div>{e.text}</div>
    </div>
  );
}

/** Slides are designed on a 960×540 canvas and scaled to fit wherever they're shown. */
export const SLIDE_W = 960;
export const SLIDE_H = 540;

function Field({
  value,
  field,
  editable,
  onEdit,
  className,
  style,
  placeholder,
}: {
  value: string;
  field: TextField;
  editable: boolean;
  onEdit?: (f: TextField, v: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  if (!editable) return value ? <div className={`whitespace-pre-wrap ${className ?? ""}`} style={style}>{value}</div> : null;
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      aria-label={placeholder}
      data-field={field}
      onChange={(e) => onEdit?.(field, e.target.value)}
      className={`block w-full resize-none overflow-hidden bg-transparent outline-none placeholder:opacity-40 hover:outline-dashed hover:outline-1 focus:outline-dashed focus:outline-2 ${className ?? ""}`}
      style={{ ...style, outlineColor: "currentColor", outlineOffset: 4 }}
    />
  );
}

function BulletList({ body, editable, onEdit, color, accent, size = 30 }: { body: string; editable: boolean; onEdit?: (f: TextField, v: string) => void; color: string; accent: string; size?: number }) {
  if (editable)
    return (
      <Field
        value={body}
        field="body"
        editable
        onEdit={onEdit}
        placeholder="One bullet per line"
        style={{ fontSize: size, lineHeight: 1.45, color }}
      />
    );
  return (
    <ul className="space-y-3" style={{ fontSize: size, lineHeight: 1.35, color }}>
      {bullets(body).map((b, i) => (
        <li key={i} className="flex gap-4">
          <span style={{ color: accent }}>●</span>
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );
}

/** Render one slide. With `editable`, text fields become inline editors. */
export function SlideView({
  slide,
  theme,
  editable = false,
  onEdit,
  width,
}: {
  slide: Required<SlideData>;
  theme: ThemeName;
  editable?: boolean;
  onEdit?: (f: TextField, v: string) => void;
  width: number;
}) {
  const t = THEMES[theme];
  const scale = width / SLIDE_W;
  const layout = slide.layout as Layout;
  const common = { editable, onEdit };
  let content: React.ReactNode;
  switch (layout) {
    case "free":
      content = (
        <div className="relative h-full w-full">
          {(slide.elements ?? []).map((e) => (
            <StaticElement key={e.id} e={e} fg={t.fg} font={t.font} />
          ))}
        </div>
      );
      break;
    case "title":
      content = (
        <div className="flex h-full flex-col justify-center px-24">
          <div className="mb-6 h-2 w-24 rounded" style={{ background: t.accent }} />
          <Field {...common} field="title" value={slide.title} placeholder="Presentation title" className="font-bold" style={{ fontSize: 64, lineHeight: 1.1 }} />
          <Field {...common} field="body" value={slide.body} placeholder="Subtitle" className="mt-6" style={{ fontSize: 30, color: t.muted }} />
        </div>
      );
      break;
    case "section":
      content = (
        <div className="flex h-full flex-col items-center justify-center px-24 text-center" style={{ background: t.accent, color: t.bg }}>
          <Field {...common} field="title" value={slide.title} placeholder="Section title" className="text-center font-bold" style={{ fontSize: 60, lineHeight: 1.1 }} />
        </div>
      );
      break;
    case "quote":
      content = (
        <div className="flex h-full flex-col justify-center px-28">
          <div style={{ fontSize: 140, lineHeight: 0.6, color: t.accent, fontFamily: "Georgia, serif" }}>“</div>
          <Field {...common} field="title" value={slide.title} placeholder="A memorable quote" className="font-semibold italic" style={{ fontSize: 46, lineHeight: 1.25 }} />
          <Field {...common} field="body" value={slide.body} placeholder="— Who said it" className="mt-8" style={{ fontSize: 26, color: t.muted }} />
        </div>
      );
      break;
    case "two":
      content = (
        <div className="flex h-full flex-col px-16 py-14">
          <Field {...common} field="title" value={slide.title} placeholder="Slide title" className="font-bold" style={{ fontSize: 44, lineHeight: 1.15 }} />
          <div className="mt-8 grid flex-1 grid-cols-2 gap-12">
            <BulletList body={slide.body} {...common} color={t.fg} accent={t.accent} size={26} />
            {editable ? (
              <Field {...common} field="body2" value={slide.body2} placeholder="Right column, one point per line" style={{ fontSize: 26, lineHeight: 1.45 }} />
            ) : (
              <BulletList body={slide.body2} editable={false} color={t.fg} accent={t.accent} size={26} />
            )}
          </div>
        </div>
      );
      break;
    case "image":
      content = (
        <div className="grid h-full grid-cols-2">
          <div className="flex flex-col justify-center px-14">
            <Field {...common} field="title" value={slide.title} placeholder="Slide title" className="font-bold" style={{ fontSize: 42, lineHeight: 1.15 }} />
            <div className="mt-6">
              <BulletList body={slide.body} {...common} color={t.fg} accent={t.accent} size={24} />
            </div>
          </div>
          <div className="relative overflow-hidden" style={{ background: t.muted + "22" }}>
            {slide.image ? (
              <img src={slide.image} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-center" style={{ color: t.muted, fontSize: 22 }}>
                Add an image URL below
              </div>
            )}
          </div>
        </div>
      );
      break;
    default:
      content = (
        <div className="flex h-full flex-col px-16 py-14">
          <Field {...common} field="title" value={slide.title} placeholder="Slide title" className="font-bold" style={{ fontSize: 46, lineHeight: 1.15 }} />
          <div className="mt-3 h-1.5 w-16 rounded" style={{ background: t.accent }} />
          <div className="mt-8">
            <BulletList body={slide.body} {...common} color={t.fg} accent={t.accent} />
          </div>
        </div>
      );
  }
  return (
    <div style={{ width, height: SLIDE_H * scale, overflow: "hidden", position: "relative" }}>
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, background: t.bg, color: t.fg, fontFamily: t.font }}
        data-testid={editable ? "slide-canvas" : undefined}
      >
        {content}
      </div>
    </div>
  );
}

/** Track an element's width (for scaling slides to their container). */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
