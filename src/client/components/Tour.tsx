import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight, CircleHelp } from "lucide-react";
import { MINT, PERI, TEAL } from "./Rocks";
import { TourScene, type SceneSpec } from "./TourScene";
import { addTour, ALL_TOURS, tourSeen, type TourId } from "../../shared/onboarding";

/**
 * Spotlight tours: the first time you reach a screen, it dims except for one part, and a Cairn
 * card explains it with a little pebble scene. Short on purpose (2–4 steps); skippable; seen
 * tours are saved to your account so they don't come back on another device.
 */

export interface TourStep {
  /** The `data-tour` value to light up. Missing → the card shows centered with no spotlight. */
  target: string;
  title: string;
  body: string;
  scene: SceneSpec;
}

export const TOURS: Record<TourId, TourStep[]> = {
  "teacher-today": [
    {
      target: "today",
      title: "This is Today",
      body: "Work to grade, students asking for more time and assignments due soon all land here, across every class.",
      scene: { kind: "teach" },
    },
    {
      target: "getting-started",
      title: "Three steps to your first grade",
      body: "Make a class, post an assignment, grade it. This list shows the next step and goes away when you're done.",
      scene: { kind: "tasks" },
    },
    {
      target: "new-class",
      title: "Start with a class",
      body: "Name it like your gradebook does, e.g. Period 3 History. You get a class code and a link to share.",
      scene: { kind: "tap", label: "New class" },
    },
  ],
  "teacher-class": [
    {
      target: "class-code",
      title: "How students get in",
      body: "They type this code, or open the link you share to Google Classroom, and sign in with their school account.",
      scene: { kind: "code" },
    },
    {
      target: "new-assignment",
      title: "One link per assignment",
      body: "Pick solo or groups and how much AI help is allowed. Post the link once; every student lands in their own room, or their group's.",
      scene: { kind: "link" },
    },
    {
      target: "class-list",
      title: "Only your students",
      body: "Your class list lives in the Students tab. Only those emails get in; anyone else waits for you to let them in. Its badge tells you when someone is waiting.",
      scene: { kind: "group" },
    },
  ],
  "teacher-grading": [
    {
      target: "grade-work",
      title: "The work itself",
      body: "Every file the student or group made, read-only. Docs have Replay, so you can watch how one was written.",
      scene: { kind: "write" },
    },
    {
      target: "grade-record",
      title: "Who did what",
      body: "The work record: words added each day, pastes shown openly, and each person's share. Your answer key sits here too.",
      scene: { kind: "receipt" },
    },
    {
      target: "grade-save",
      title: "Score it, then next",
      body: "Fill in the rubric and leave a comment. Save & next opens the next turned-in work, so you never go back to a list.",
      scene: { kind: "grade" },
    },
  ],
  "student-class": [
    {
      target: "assignments",
      title: "Your assignments",
      body: "Everything your teacher posts for this class shows up here, with when it's due.",
      scene: { kind: "tasks" },
    },
    {
      target: "open-work",
      title: "Jump in",
      body: "This opens your own room, or your group's. Your work saves as you go.",
      scene: { kind: "tap", label: "Open your work", body: PERI },
    },
  ],
  "student-room": [
    {
      target: "room-files",
      title: "Your files",
      body: "Docs, slides and sheets for this assignment. Every word you write is counted as yours.",
      scene: { kind: "write" },
    },
    {
      target: "room-chat",
      title: "Chat and the tutor",
      body: "Talk with your group here, or ask the AI. It helps you figure things out; your teacher sets how much it can do.",
      scene: { kind: "tutor" },
    },
    {
      target: "room-tasks",
      title: "Split the work",
      body: "Make tasks and claim them, so everyone knows who's doing what. Finished tasks count on the receipt.",
      scene: { kind: "tasks" },
    },
    {
      target: "room-turnin",
      title: "Turn it in",
      body: "When you're done, check the receipt of who did what, then turn it in. Your teacher sees exactly what you see.",
      scene: { kind: "tap", label: "Turn in", body: MINT },
    },
  ],
};

// ---------- a tiny store, so any page can start a tour and the menu can replay it ----------

type State = { id: TourId | null; step: number; current: TourId | null };
let state: State = { id: null, step: 0, current: null };
const subs = new Set<() => void>();
const set = (p: Partial<State>) => {
  state = { ...state, ...p };
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
const snap = () => state;
/** Tours finished this session (before the account reloads). */
const doneHere = new Set<string>();

const LOCAL = "cairn.tours";
function localSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL) ?? "[]");
  } catch {
    return [];
  }
}
function save(id: string, signedIn: boolean) {
  doneHere.add(id);
  if (signedIn) {
    void fetch("/api/auth/tours", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
  } else {
    try {
      localStorage.setItem(LOCAL, JSON.stringify(addTour(localSeen(), id)));
    } catch {
      /* private mode */
    }
  }
}
let signedInNow = false;

export function startTour(id: TourId) {
  set({ id, step: 0 });
}
/** The tour for the screen you're on (for "Show me around again"), or null. */
export function useCurrentTour() {
  return useSyncExternalStore(subscribe, snap).current;
}

const modalOpen = () => !!document.querySelector('[role="dialog"][aria-modal="true"]:not([data-tour-card]), [role="alertdialog"]');

/**
 * Starts `id` once the page is ready, if this account hasn't seen it. Waits for its first
 * target to appear and for any open dialog to close. Also makes it the screen's replayable tour.
 */
export function useAutoTour(id: TourId, ready: boolean, seen: string[] | undefined, signedIn: boolean) {
  useEffect(() => {
    if (!ready) return;
    set({ current: id });
    return () => {
      if (state.current === id) set({ current: null });
    };
  }, [id, ready]);
  useEffect(() => {
    signedInNow = signedIn;
    if (!ready || !seen) return;
    const list = signedIn ? seen : localSeen();
    if (tourSeen(list, id) || doneHere.has(id) || doneHere.has(ALL_TOURS)) return;
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (state.id) return;
      const first = document.querySelector(`[data-tour="${TOURS[id][0].target}"]`);
      if ((first || tries > 6) && !modalOpen()) {
        clearInterval(t);
        startTour(id);
      }
      if (tries > 40) clearInterval(t);
    }, 400);
    return () => clearInterval(t);
  }, [id, ready, seen, signedIn]);
}

// ---------- the overlay ----------

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 8;

function useTargetRect(target: string | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    if (!target) return setRect(null);
    const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
    if (!el) return setRect(null);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const r0 = el.getBoundingClientRect();
    if (r0.top < 72 || r0.bottom > innerHeight - 24) el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    let raf = 0;
    let last = "";
    const tick = () => {
      const r = el.getBoundingClientRect();
      const visible = r.width > 0 && r.height > 0;
      const key = visible ? `${r.top}|${r.left}|${r.width}|${r.height}` : "none";
      if (key !== last) {
        last = key;
        setRect(visible ? { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 } : null);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return rect;
}

const CARD_W = 340;

/** Where the card goes: below the target if it fits, else above, else beside, else centered. */
function place(rect: Rect | null, h: number): { top: number; left: number; side: "below" | "above" | "center" } {
  const vw = innerWidth;
  const vh = innerHeight;
  const w = Math.min(CARD_W, vw - 32);
  if (!rect) return { top: Math.max(16, (vh - h) / 2), left: (vw - w) / 2, side: "center" };
  const cx = rect.left + rect.width / 2;
  const left = Math.min(Math.max(16, cx - w / 2), vw - w - 16);
  if (rect.top + rect.height + 14 + h <= vh - 12) return { top: rect.top + rect.height + 14, left, side: "below" };
  if (rect.top - 14 - h >= 12) return { top: rect.top - 14 - h, left, side: "above" };
  return { top: Math.max(12, vh - h - 16), left, side: "center" };
}

/** "Show me around": replays this screen's tour. Hidden on screens without one. */
export function TourButton({ className = "" }: { className?: string }) {
  const current = useCurrentTour();
  if (!current) return null;
  return (
    <button
      onClick={() => startTour(current)}
      className={`press inline-flex h-8 w-8 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg ${className}`}
      aria-label="Show me around"
      title="Show me around"
      data-testid="tour-replay"
    >
      <CircleHelp className="h-[18px] w-[18px]" />
    </button>
  );
}

/** Render once at the app root. Shows whichever tour is running. */
export function TourHost() {
  const s = useSyncExternalStore(subscribe, snap);
  if (!s.id) return null;
  return <TourOverlay key={s.id} id={s.id} />;
}

function TourOverlay({ id }: { id: TourId }) {
  const steps = TOURS[id];
  const { step } = useSyncExternalStore(subscribe, snap);
  const cur = steps[Math.min(step, steps.length - 1)];
  const rect = useTargetRect(cur.target);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [h, setH] = useState(300);
  const last = step >= steps.length - 1;

  useLayoutEffect(() => {
    if (cardRef.current) setH(cardRef.current.offsetHeight);
  }, [step, rect?.width]);

  const finish = (all = false) => {
    save(all ? ALL_TOURS : id, signedInNow);
    set({ id: null, step: 0 });
  };
  const go = (d: number) => {
    if (d > 0 && last) return finish();
    set({ step: Math.max(0, Math.min(steps.length - 1, step + d)) });
  };

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, [step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") (e.preventDefault(), finish());
      else if (e.key === "ArrowRight") (e.preventDefault(), go(1));
      else if (e.key === "ArrowLeft") (e.preventDefault(), go(-1));
      else if (e.key === "Tab" && cardRef.current) {
        // Keep focus inside the card.
        const f = [...cardRef.current.querySelectorAll<HTMLElement>("button")];
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) (e.preventDefault(), f[f.length - 1]?.focus());
        else if (!e.shiftKey && i === f.length - 1) (e.preventDefault(), f[0]?.focus());
      }
    };
    addEventListener("keydown", onKey, true);
    return () => removeEventListener("keydown", onKey, true);
  });

  const phone = typeof innerWidth === "number" && innerWidth < 640;
  const pos = phone ? null : place(rect, h);
  const accent = id.startsWith("teacher") ? TEAL : PERI;

  return (
    <div className="fixed inset-0 z-[70]" data-testid="tour" data-tour-id={id}>
      {/* Blocks the page behind; the spotlight is drawn by the hole's shadow. */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
      {rect ? <div className="tour-hole" style={rect} /> : <div className="tour-dim" />}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        data-tour-card
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        key={step}
        className={`tour-card fixed w-[min(340px,calc(100vw-32px))] overflow-hidden rounded-[22px] border border-line bg-bg shadow-[0_24px_60px_-20px_rgba(10,16,13,0.55)] ${phone ? "inset-x-4 bottom-4 mx-auto" : ""}`}
        style={
          pos
            ? ({ top: pos.top, left: pos.left, ["--from-y" as string]: pos.side === "above" ? "-8px" : "8px" } as React.CSSProperties)
            : undefined
        }
        data-testid="tour-card"
      >
        <div className="relative px-5 pb-1 pt-4" style={{ background: `color-mix(in srgb, ${accent} 22%, var(--bg))` }}>
          <TourScene spec={cur.scene} className="mx-auto block h-[112px] w-full max-w-[220px]" />
        </div>
        <div className="px-5 pb-4 pt-4">
          <h2 id="tour-title" className="font-display text-[1.15rem] font-extrabold leading-tight tracking-[-0.02em]" data-testid="tour-title">
            {cur.title}
          </h2>
          <p id="tour-body" className="mt-1.5 text-[14.5px] leading-relaxed text-fg-muted">
            {cur.body}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${steps.length}`} role="img">
              {steps.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? "w-5 bg-fg" : "w-1.5 bg-line-strong"}`} />
              ))}
            </div>
            <span className="flex-1" />
            {!last && (
              <button onClick={() => finish()} className="press rounded-xl px-3 py-2 text-sm font-medium text-fg-muted hover:bg-surface-2 hover:text-fg" data-testid="tour-skip">
                Skip
              </button>
            )}
            {step > 0 && (
              <button onClick={() => go(-1)} className="press flex h-9 w-9 items-center justify-center rounded-xl text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Back" data-testid="tour-back">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <button
              ref={nextRef}
              onClick={() => go(1)}
              className="press inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-fg shadow-[0_3px_0_#2a9a4b] hover:bg-primary-hover active:translate-y-[2px] active:shadow-[0_1px_0_#2a9a4b]"
              data-testid="tour-next"
            >
              {last ? "Got it" : "Next"} {!last && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
          {step === 0 && (
            <button onClick={() => finish(true)} className="mt-3 text-xs text-fg-subtle underline-offset-2 hover:text-fg-muted hover:underline" data-testid="tour-off">
              Don't show tips like this
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
