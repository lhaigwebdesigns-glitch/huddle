import { describe, expect, it } from "vitest";
import { gradeTotal, makeGroups, parseEmails, parseRubric, rubricMax, toCsv } from "./classes";

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

describe("assignments for every student", () => {
  it("puts a late joiner in the group with the most space, or a new group when all are full", async () => {
    const { placeLateJoiner } = await import("./classes");
    expect(placeLateJoiner([{ members: ["a", "b", "c"] }, { members: ["d"] }, { members: ["e", "f"] }], 3)).toBe(1);
    expect(placeLateJoiner([{ members: ["a", "b"] }, { members: ["c", "d"] }], 2)).toBe(-1);
    expect(placeLateJoiner([], 3)).toBe(-1);
  });
  it("knows which groups don't have a room yet, and builds the assignment link", async () => {
    const { assignmentPath, isPending, PENDING, wordsFromChars } = await import("./classes");
    expect(isPending(`${PENDING}abc`)).toBe(true);
    expect(isPending("K7Q29F")).toBe(false);
    expect(assignmentPath("K7Q29F", "abc123")).toBe("/c/K7Q29F/a/abc123");
    expect(wordsFromChars(600)).toBe(100);
  });
});

describe("class list emails", () => {
  it("reads emails pasted one per line, or with commas, spaces or semicolons", () => {
    expect(parseEmails("ava@school.org\nBen@School.org, cam@school.org; dee@school.org  eli@school.org")).toEqual([
      "ava@school.org", "ben@school.org", "cam@school.org", "dee@school.org", "eli@school.org",
    ]);
  });
  it("drops duplicates and things that aren't emails", () => {
    expect(parseEmails("ava@school.org ava@school.org Ava Smith <ava@school.org> not-an-email @school.org")).toEqual(["ava@school.org"]);
  });
  it("stops at the limit", () => {
    expect(parseEmails(Array.from({ length: 20 }, (_, i) => `s${i}@x.org`).join(" "), 5)).toHaveLength(5);
  });
});
