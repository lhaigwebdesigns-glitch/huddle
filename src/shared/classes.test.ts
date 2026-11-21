import { describe, expect, it } from "vitest";
import { gradeTotal, makeGroups, parseRubric, rubricMax, toCsv } from "./classes";

describe("rubric parsing", () => {
  it("reads percentages on one line", () => {
    expect(parseRubric("Research 40% · Slides 30% · Presentation 30%")).toEqual([
      { label: "Research", max: 40 },
      { label: "Slides", max: 30 },
      { label: "Presentation", max: 30 },
    ]);
  });
  it("reads points, one per line, with dashes and bullets", () => {
    const rows = parseRubric("- Sources — 20 pts\n2. Argument: 30 points\nWriting (10 marks)");
    expect(rows).toEqual([
      { label: "Sources", max: 20 },
      { label: "Argument", max: 30 },
      { label: "Writing", max: 10 },
    ]);
    expect(rubricMax(rows)).toBe(60);
  });
  it("falls back to one Overall row out of 100", () => {
    expect(parseRubric("Be creative and work together")).toEqual([{ label: "Overall", max: 100 }]);
    expect(parseRubric("")).toEqual([{ label: "Overall", max: 100 }]);
  });
});

describe("grades", () => {
  it("adds up the scored rows, and is empty until something is scored", () => {
    expect(gradeTotal({ scores: [null, null] })).toBeNull();
    expect(gradeTotal({ scores: [30, null, 22.5] })).toBe(52.5);
  });
});

describe("random groups", () => {
  it("puts everyone in exactly one group, with sizes within one of each other", () => {
    const uids = Array.from({ length: 11 }, (_, i) => `s${i}`);
    const groups = makeGroups(uids, 3);
    expect(groups.length).toBe(4);
    expect(groups.flat().sort()).toEqual([...uids].sort());
    const sizes = groups.map((g) => g.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });
  it("makes one group for a tiny class", () => {
    expect(makeGroups(["a"], 3)).toEqual([["a"]]);
    expect(makeGroups([], 3)).toEqual([[]]);
  });
});

describe("CSV export", () => {
  it("quotes commas, quotes and line breaks, and defuses formulas", () => {
    expect(toCsv([["Name", "Comment"], ['Sam "S", Jr.', "line1\nline2"], ["=HYPERLINK(1)", 5]])).toBe(
      'Name,Comment\r\n"Sam ""S"", Jr.","line1\nline2"\r\n\'=HYPERLINK(1),5\r\n',
    );
  });
});

describe("Share to Classroom", () => {
  it("builds Google Classroom's share link with the url, title and text", async () => {
    const { classroomShareUrl } = await import("./classes");
    const u = new URL(classroomShareUrl("https://huddle.example/c/ABC123", "WWI presentation", "Join your group & start"));
    expect(u.origin + u.pathname).toBe("https://classroom.google.com/share");
    expect(u.searchParams.get("url")).toBe("https://huddle.example/c/ABC123");
    expect(u.searchParams.get("title")).toBe("WWI presentation");
    expect(u.searchParams.get("body")).toBe("Join your group & start");
  });
});
