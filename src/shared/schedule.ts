/**
 * Timed assignments: when students may work on a project.
 *
 * A teacher can limit work to set times (e.g. Mon–Fri 9:10–9:55, their class period) and
 * close the work after the due date. Per student or group, a teacher can open it now for a
 * while ("extra time") or move that room's due date. Outside the open times the project's
 * files are read-only; chat still works.
 */

export interface WorkWindow {
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  /** "09:10" (24-hour, in the teacher's time zone) */
  start: string;
  end: string;
}

export interface Schedule {
  windows: WorkWindow[];
  /** The teacher's time zone, e.g. "America/New_York". */
  tz: string;
  /** Close the work once the due date passes (unless the student has an extension). */
  closeAtDue?: boolean;
}

/** One room's exceptions, set by the teacher (or by approving a request). */
export interface AccessOverride {
  /** Open now, whatever the schedule says, until this time. */
  openUntil?: number;
  /** This room's own due date (an extension). */
  dueAt?: number;
}

export interface AccessState {
  open: boolean;
  /** Why it's closed. */
  reason?: "schedule" | "due";
  /** When it next opens or closes (for the "Opens Tue 9:10" / "Open until 9:55" note), if within a week. */
  nextChange?: number;
}

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutesOf = (hhmm: string) => {
  const m = hhmm.match(HHMM);
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
};

/** Check and clamp a schedule from a client. Returns undefined to mean "any time". */
export function cleanSchedule(input: unknown): Schedule | undefined {
  if (!input || typeof input !== "object") return undefined;
  const s = input as Partial<Schedule>;
  const windows = (Array.isArray(s.windows) ? s.windows : [])
    .slice(0, 14)
    .map((w) => ({
      days: [...new Set((Array.isArray(w?.days) ? w.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(),
      start: String(w?.start ?? ""),
      end: String(w?.end ?? ""),
    }))
    .filter((w) => w.days.length && minutesOf(w.start) >= 0 && minutesOf(w.end) > minutesOf(w.start));
  let tz = typeof s.tz === "string" ? s.tz.slice(0, 60) : "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    tz = "UTC";
  }
  if (!windows.length && !s.closeAtDue) return undefined;
  return { windows, tz, ...(s.closeAtDue ? { closeAtDue: true } : {}) };
}

const formatters = new Map<string, Intl.DateTimeFormat>();
/** Weekday and minutes since midnight at `ms`, in time zone `tz`. */
export function localTime(ms: number, tz: string): { day: number; minutes: number } {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    formatters.set(tz, f);
  }
  const parts = f.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: DAY_NAMES.indexOf(get("weekday") as (typeof DAY_NAMES)[number]), minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** Is `ms` inside one of the work windows? */
export function inWindow(schedule: Schedule, ms: number): boolean {
  if (!schedule.windows.length) return true;
  const { day, minutes } = localTime(ms, schedule.tz);
  return schedule.windows.some((w) => w.days.includes(day) && minutes >= minutesOf(w.start) && minutes < minutesOf(w.end));
}

/** The due date that applies to this room: its own extension, or the assignment's. */
export const dueFor = (dueAt: number | undefined, o?: AccessOverride) => o?.dueAt ?? dueAt;

/** Open or closed right now, and why. */
function openAt(schedule: Schedule | undefined, dueAt: number | undefined, o: AccessOverride | undefined, ms: number): AccessState {
  if (o?.openUntil && ms < o.openUntil) return { open: true };
  if (!schedule) return { open: true };
  const due = dueFor(dueAt, o);
  if (schedule.closeAtDue && due && ms >= due) return { open: false, reason: "due" };
  if (!inWindow(schedule, ms)) return { open: false, reason: "schedule" };
  return { open: true };
}

const MINUTE = 60_000;

/**
 * Whether the work is open at `now`, why not, and when that next changes (looked up minute by
 * minute for up to a week, which is fast enough and handles daylight-saving changes).
 */
export function accessState(schedule: Schedule | undefined, dueAt: number | undefined, o: AccessOverride | undefined, now: number): AccessState {
  const state = openAt(schedule, dueAt, o, now);
  if (!schedule && !o?.openUntil) return state;
  const start = Math.floor(now / MINUTE) * MINUTE + MINUTE;
  for (let t = start; t <= now + 7 * 24 * 60 * MINUTE; t += MINUTE) {
    if (openAt(schedule, dueAt, o, t).open !== state.open) return { ...state, nextChange: t };
  }
  return state;
}

/** "Mon–Fri 9:10–9:55" for showing a schedule in plain words. */
export function describeSchedule(schedule: Schedule | undefined): string {
  if (!schedule || !schedule.windows.length) return schedule?.closeAtDue ? "Any time until it's due" : "Any time";
  const fmt = (hhmm: string) => {
    const m = minutesOf(hhmm);
    const h = Math.floor(m / 60);
    return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
  };
  const days = (d: number[]) => {
    const k = d.join(",");
    if (k === "1,2,3,4,5") return "Mon–Fri";
    if (k === "0,1,2,3,4,5,6") return "Every day";
    return d.map((x) => DAY_NAMES[x]).join(", ");
  };
  return schedule.windows.map((w) => `${days(w.days)} ${fmt(w.start)}–${fmt(w.end)}`).join("; ");
}

/** A student's request for more time, waiting for the teacher. */
export interface TimeRequest {
  id: string;
  at: number;
  byUid: string;
  byName: string;
  /** "open" = open it now for an hour; "extend" = move the due date. */
  kind: "open" | "extend";
  /** For "extend": how many days. */
  days?: number;
  reason: string;
}

/** How late a turn-in was (0 if on time). */
export const lateBy = (turnedInAt: number | undefined, due: number | undefined) => (turnedInAt && due && turnedInAt > due ? turnedInAt - due : 0);
