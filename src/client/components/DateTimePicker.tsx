import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";

/**
 * Cairn's own date and time pickers, in place of the browser's. A button shows the value in
 * plain words; clicking it opens a small panel (calendar, time grid, quick picks) anchored to
 * the button. Keyboard: Tab through, Enter/Space to pick, Escape to close.
 */

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 59];
const pad = (n: number) => String(n).padStart(2, "0");
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Tue, Nov 24" */
const dayLabel = (d: Date) => d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
/** "9:10 AM" from "09:10" */
export function timeLabel(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * A popover pinned to its trigger with fixed positioning. It renders into <body>, because an
 * animated (transformed) dialog would otherwise become the fixed-position container and move it.
 */
function Popover({ anchor, onClose, children, label }: { anchor: HTMLElement | null; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; origin: string } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor || !ref.current) return;
      const a = anchor.getBoundingClientRect();
      const p = ref.current.getBoundingClientRect();
      const below = a.bottom + 6 + p.height <= innerHeight - 8;
      const top = below ? a.bottom + 6 : Math.max(8, a.top - 6 - p.height);
      const left = Math.min(Math.max(8, a.left), innerWidth - p.width - 8);
      setPos({ top, left, origin: below ? "top left" : "bottom left" });
    };
    place();
    addEventListener("resize", place);
    addEventListener("scroll", place, true);
    return () => {
      removeEventListener("resize", place);
      removeEventListener("scroll", place, true);
    };
  }, [anchor]);
  useEffect(() => {
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && !anchor?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
      anchor?.focus();
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key, true);
    };
  }, [anchor, onClose]);
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className="pop fixed z-[70] w-[19rem] rounded-2xl border border-line bg-surface p-3 shadow-[0_18px_44px_-14px_rgba(10,16,13,0.35)]"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, ["--origin" as string]: pos?.origin ?? "top left" }}
      data-testid="picker"
    >
      {children}
    </div>,
    document.body,
  );
}

function Calendar({ selected, onPick }: { selected?: Date; onPick: (d: Date) => void }) {
  const today = new Date();
  const [month, setMonth] = useState(() => new Date((selected ?? today).getFullYear(), (selected ?? today).getMonth(), 1));
  const first = new Date(month);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} className="press rounded-lg p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="font-display text-sm font-bold" aria-live="polite">
          {month.toLocaleDateString([], { month: "long", year: "numeric" })}
        </div>
        <button type="button" onClick={() => shift(1)} className="press rounded-lg p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center" role="grid">
        {DAYS.map((d) => (
          <div key={d} className="py-1 text-[11px] font-semibold text-fg-subtle" role="columnheader">
            {d}
          </div>
        ))}
        {cells.map((d) => {
          const inMonth = d.getMonth() === month.getMonth();
          const isSel = !!selected && sameDay(d, selected);
          const isToday = sameDay(d, today);
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onPick(d)}
              aria-label={d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              aria-pressed={isSel}
              className={`press tabular h-9 rounded-xl text-sm ${
                isSel ? "bg-primary font-bold text-primary-fg" : `hover:bg-surface-2 ${inMonth ? "text-fg" : "text-fg-subtle/60"} ${isToday ? "font-bold ring-2 ring-inset ring-mint" : ""}`
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Hours, minutes and AM/PM as tappable grids. */
function TimeGrid({ value, onChange }: { value: string; onChange: (hhmm: string) => void }) {
  const [h24, m] = value.split(":").map(Number);
  const pm = h24 >= 12;
  const h12 = h24 % 12 || 12;
  const set = (h: number, min: number, isPm: boolean) => onChange(`${pad((h % 12) + (isPm ? 12 : 0))}:${pad(min)}`);
  const chip = (on: boolean) => `press tabular h-8 rounded-lg text-sm ${on ? "bg-primary font-bold text-primary-fg" : "text-fg hover:bg-surface-2"}`;
  return (
    <div className="grid gap-2">
      <div>
        <div className="mb-1 text-[11px] font-semibold text-fg-subtle">Hour</div>
        <div className="grid grid-cols-6 gap-1">
          {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
            <button key={h} type="button" className={chip(h === h12)} onClick={() => set(h, m, pm)} aria-label={`${h} o'clock`} aria-pressed={h === h12}>
              {h}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 text-[11px] font-semibold text-fg-subtle">Minute</div>
        <div className="grid grid-cols-7 gap-1">
          {MINUTES.map((min) => (
            <button key={min} type="button" className={chip(min === m)} onClick={() => set(h12, min, pm)} aria-label={`${pad(min)} minutes`} aria-pressed={min === m}>
              :{pad(min)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1" role="group" aria-label="AM or PM">
        {(["AM", "PM"] as const).map((p) => (
          <button key={p} type="button" className={chip((p === "PM") === pm)} onClick={() => set(h12, m, p === "PM")} aria-pressed={(p === "PM") === pm}>
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

const TRIGGER =
  "press flex w-full items-center gap-2 rounded-xl border border-line-strong bg-transparent px-3 py-2 text-left text-sm hover:border-fg/40 disabled:cursor-default disabled:opacity-60";

/** A due date and time (milliseconds), with quick picks. Leave `onChange(undefined)` to clear. */
export function DateTimeField({
  value,
  onChange,
  label,
  placeholder = "No due date",
  className = "",
  testId,
}: {
  value?: number;
  onChange: (ms: number | undefined) => void;
  label: string;
  placeholder?: string;
  className?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"date" | "time">("date");
  const btn = useRef<HTMLButtonElement>(null);
  const d = value ? new Date(value) : undefined;
  const hhmm = d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "23:59";
  const at = (day: Date, time = hhmm) => {
    const [h, m] = time.split(":").map(Number);
    const x = new Date(day);
    x.setHours(h, m, 0, 0);
    return x.getTime();
  };
  const plusDays = (n: number) => {
    const x = new Date();
    x.setDate(x.getDate() + n);
    return x;
  };
  const nextMonday = () => {
    const x = new Date();
    x.setDate(x.getDate() + (((8 - x.getDay()) % 7) || 7));
    return x;
  };
  return (
    <div className={className}>
      <button
        ref={btn}
        type="button"
        className={TRIGGER}
        onClick={() => (setOpen((o) => !o), setTab("date"))}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${d ? `${dayLabel(d)}, ${timeLabel(hhmm)}` : placeholder}`}
        data-testid={testId}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
        <span className={`flex-1 ${d ? "" : "text-fg-subtle"}`}>{d ? `${dayLabel(d)} · ${timeLabel(hhmm)}` : placeholder}</span>
      </button>
      {open && (
        <Popover anchor={btn.current} onClose={() => setOpen(false)} label={label}>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {[
              { l: "Tomorrow", d: plusDays(1) },
              { l: "Next Monday", d: nextMonday() },
              { l: "In a week", d: plusDays(7) },
            ].map((q) => (
              <button key={q.l} type="button" onClick={() => onChange(at(q.d))} className="press rounded-full border border-line-strong px-2.5 py-1 text-xs font-semibold hover:bg-surface-2">
                {q.l}
              </button>
            ))}
          </div>
          <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1" role="tablist" aria-label="Date or time">
            {(["date", "time"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`press flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-semibold ${tab === t ? "bg-surface text-fg shadow-sm" : "text-fg-muted"}`}
              >
                {t === "date" ? <CalendarDays className="h-3.5 w-3.5" aria-hidden /> : <Clock className="h-3.5 w-3.5" aria-hidden />}
                {t === "date" ? (d ? dayLabel(d) : "Date") : timeLabel(hhmm)}
              </button>
            ))}
          </div>
          {tab === "date" ? (
            <Calendar
              selected={d}
              onPick={(day) => {
                onChange(at(day));
                setTab("time");
              }}
            />
          ) : (
            <TimeGrid value={hhmm} onChange={(t) => onChange(at(d ?? new Date(), t))} />
          )}
          <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
            <button
              type="button"
              onClick={() => (onChange(undefined), setOpen(false))}
              className="press flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              <X className="h-3.5 w-3.5" aria-hidden /> Clear
            </button>
            <button type="button" onClick={() => (setOpen(false), btn.current?.focus())} className="press rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
              Done
            </button>
          </div>
        </Popover>
      )}
    </div>
  );
}

/** A calendar date as "YYYY-MM-DD" ("" for none). */
export function DateField({
  value,
  onChange,
  label,
  placeholder = "Pick a date",
  disabled,
  compact,
  danger,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
  danger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const d = value ? new Date(`${value}T12:00:00`) : undefined;
  const text = d ? (compact ? d.toLocaleDateString([], { month: "short", day: "numeric" }) : dayLabel(d)) : compact ? "Due" : placeholder;
  return (
    <>
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        className={
          compact
            ? `press flex items-center gap-1 rounded-lg border border-line-strong px-1.5 py-0.5 text-xs disabled:opacity-60 ${danger ? "text-red-600 dark:text-red-400" : d ? "text-fg" : "text-fg-subtle"}`
            : TRIGGER
        }
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${d ? dayLabel(d) : "none"}`}
      >
        <CalendarDays className={compact ? "h-3 w-3" : "h-4 w-4 shrink-0 text-fg-muted"} aria-hidden />
        <span className={compact ? "tabular" : `flex-1 ${d ? "" : "text-fg-subtle"}`}>{text}</span>
      </button>
      {open && (
        <Popover anchor={btn.current} onClose={() => setOpen(false)} label={label}>
          <Calendar
            selected={d}
            onPick={(day) => {
              onChange(`${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`);
              setOpen(false);
              btn.current?.focus();
            }}
          />
          {value && (
            <div className="mt-2 border-t border-line pt-2">
              <button type="button" onClick={() => (onChange(""), setOpen(false))} className="press flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg">
                <X className="h-3.5 w-3.5" aria-hidden /> Clear
              </button>
            </div>
          )}
        </Popover>
      )}
    </>
  );
}

/** A time of day as "HH:MM" (24-hour), shown as "9:10 AM". */
export function TimeField({ value, onChange, label }: { value: string; onChange: (hhmm: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="press flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1 text-sm hover:border-fg/40"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${timeLabel(value)}`}
      >
        <Clock className="h-3.5 w-3.5 text-fg-muted" aria-hidden />
        <span className="tabular">{timeLabel(value)}</span>
      </button>
      {open && (
        <Popover anchor={btn.current} onClose={() => setOpen(false)} label={label}>
          <TimeGrid value={value} onChange={onChange} />
          <div className="mt-3 flex justify-end border-t border-line pt-2.5">
            <button type="button" onClick={() => (setOpen(false), btn.current?.focus())} className="press rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
              Done
            </button>
          </div>
        </Popover>
      )}
    </>
  );
}
