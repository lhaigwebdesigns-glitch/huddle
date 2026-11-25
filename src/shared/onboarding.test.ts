import { describe, expect, it } from "vitest";
import { addTour, ALL_TOURS, checkOnboarding, cleanTeach, exampleTitle, orderTemplates, parseTours, tourSeen } from "./onboarding";

describe("onboarding", () => {
  it("needs a role, and a non-empty name when one is given", () => {
    expect(checkOnboarding({}, false)).toEqual({ ok: false, error: "Pick teacher or student." });
    expect(checkOnboarding({ role: "teacher", name: "   " }, false).ok).toBe(false);
    const r = checkOnboarding({ role: "teacher", name: "  Ms.   Rivera  " }, false);
    expect(r.ok && r.value.name).toBe("Ms. Rivera");
    const long = checkOnboarding({ role: "teacher", name: "x".repeat(80) }, false);
    expect(long.ok && long.value.name?.length).toBe(32);
  });

  it("asks a new student to confirm 13+, but not one who already joined a class", () => {
    expect(checkOnboarding({ role: "student" }, false).ok).toBe(false);
    expect(checkOnboarding({ role: "student", ageOk: true }, false).ok).toBe(true);
    expect(checkOnboarding({ role: "student" }, true).ok).toBe(true);
  });

  it("keeps only known subjects and grades", () => {
    expect(cleanTeach({ subjects: ["science", "science", "cooking", 3], grades: ["9-10", "k"] })).toEqual({ subjects: ["science"], grades: ["9-10"] });
    expect(cleanTeach({ subjects: ["cooking"] })).toBeNull();
    expect(cleanTeach("science")).toBeNull();
    const r = checkOnboarding({ role: "teacher", teach: { subjects: ["math"], grades: [] } }, false);
    expect(r.ok && r.value.teach).toEqual({ subjects: ["math"], grades: [] });
    // Students don't have a "what you teach".
    const s = checkOnboarding({ role: "student", ageOk: true, teach: { subjects: ["math"] } }, false);
    expect(s.ok && s.value.teach).toBeUndefined();
  });

  it("puts the templates that fit the subject first", () => {
    const t = ["research-paper", "presentation", "science-lab", "survey-project", "debate-prep"].map((id) => ({ id }));
    expect(orderTemplates(t, { subjects: ["science"], grades: [] }).map((x) => x.id)).toEqual(["science-lab", "research-paper", "presentation", "survey-project", "debate-prep"]);
    expect(orderTemplates(t, null).map((x) => x.id)).toEqual(t.map((x) => x.id));
    expect(exampleTitle({ subjects: ["science"], grades: [] })).toBe("e.g. Pendulum lab");
    expect(exampleTitle(null)).toBe("e.g. Causes of World War I");
  });
});

describe("tours seen", () => {
  it("adds each tour once and ignores unknown ids", () => {
    let l: string[] = [];
    l = addTour(l, "teacher-today");
    l = addTour(l, "teacher-today");
    l = addTour(l, "made-up");
    expect(l).toEqual(["teacher-today"]);
    expect(tourSeen(l, "teacher-today")).toBe(true);
    expect(tourSeen(l, "teacher-class")).toBe(false);
  });

  it("turning tips off marks every tour seen", () => {
    const l = addTour(["teacher-today"], ALL_TOURS);
    expect(l).toEqual([ALL_TOURS]);
    expect(tourSeen(l, "student-room")).toBe(true);
    expect(addTour(l, "teacher-class")).toEqual([ALL_TOURS]);
  });

  it("reads a stored list safely", () => {
    expect(parseTours('["student-room","nope","student-room"]')).toEqual(["student-room"]);
    expect(parseTours("not json")).toEqual([]);
    expect(parseTours(null)).toEqual([]);
  });
});
