import { describe, expect, it } from "vitest";
import { accessState, cleanSchedule, describeSchedule, inWindow, lateBy, localTime } from "./schedule";

// Mon Nov 23 2026, times in New York (UTC-5 in November).
const ny = (d: number, h: number, m = 0) => Date.UTC(2026, 10, d, h + 5, m);
const period = { windows: [{ days: [1, 2, 3, 4, 5], start: "09:10", end: "09:55" }], tz: "America/New_York" };

describe("timed assignments", () => {
  it("reads local weekday and time in the teacher's time zone", () => {
    expect(localTime(ny(23, 9, 30), "America/New_York")).toEqual({ day: 1, minutes: 570 });
  });

  it("is open only inside the class period", () => {
    expect(inWindow(period, ny(23, 9, 10))).toBe(true);
    expect(inWindow(period, ny(23, 9, 54))).toBe(true);
    expect(inWindow(period, ny(23, 9, 55))).toBe(false);
    expect(inWindow(period, ny(22, 9, 30))).toBe(false); // Sunday
  });

  it("says when it next opens or closes", () => {
    const closed = accessState(period, undefined, undefined, ny(23, 8, 0));
    expect(closed).toMatchObject({ open: false, reason: "schedule", nextChange: ny(23, 9, 10) });
    const open = accessState(period, undefined, undefined, ny(23, 9, 30));
    expect(open).toMatchObject({ open: true, nextChange: ny(23, 9, 55) });
  });

  it("closes at the due date when asked, unless this room has an extension", () => {
    const anyTimeTillDue = { windows: [], tz: "UTC", closeAtDue: true };
    const due = ny(25, 23, 59);
    expect(accessState(anyTimeTillDue, due, undefined, due + 60_000)).toMatchObject({ open: false, reason: "due" });
    expect(accessState(anyTimeTillDue, due, { dueAt: due + 86_400_000 }, due + 60_000).open).toBe(true);
  });

  it("extra time opens it now, until it runs out", () => {
    const now = ny(23, 20, 0);
    const state = accessState(period, undefined, { openUntil: now + 3_600_000 }, now);
    expect(state.open).toBe(true);
    expect(state.nextChange).toBe(now + 3_600_000);
  });

  it("cleans bad schedules and describes good ones in plain words", () => {
    expect(cleanSchedule({ windows: [{ days: [9], start: "25:00", end: "x" }], tz: "Nowhere/Fake" })).toBeUndefined();
    const s = cleanSchedule({ ...period, tz: "Nowhere/Fake" })!;
    expect(s.tz).toBe("UTC");
    expect(describeSchedule(period)).toBe("Mon–Fri 9:10am–9:55am");
    expect(describeSchedule(undefined)).toBe("Any time");
  });

  it("works out how late a turn-in was", () => {
    expect(lateBy(1000, 2000)).toBe(0);
    expect(lateBy(5000, 2000)).toBe(3000);
    expect(lateBy(5000, undefined)).toBe(0);
  });
});
