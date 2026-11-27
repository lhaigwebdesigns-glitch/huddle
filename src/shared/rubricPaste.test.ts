import { describe, expect, it } from "vitest";
import { parseRubricGrid } from "./rubricPaste";

describe("parseRubricGrid", () => {
  it("reads a Google Classroom rubric copied as lines", () => {
    const text = `Focus
Your response is focused on one idea from the discussion and readings
You've got it!
3 pts
Your response is focused on one aspect of the readings and/or discussion.
Almost there
2 pts
Your response is mostly focused on one aspect of the readings and/or discussion but there were one or more places where you veered off topic.
This area needs work
1 pt
Your response is not focused on one aspect of the readings and/or discussion.
Use of Quotations
You've Got it!
3 pts
Your quotations are carefully chosen and perfectly embedded.
Almost There
2 pts
You have the required number of quotations but they are not the best choices for your purpose.
This area needs work
1 pt
You have not included quotations and/or have not embedded them. See notes.`;
    const g = parseRubricGrid(text)!;
    expect(g.rows.map((r) => r.title)).toEqual(["Focus", "Use of Quotations"]);
    expect(g.rows[0].desc).toBe("Your response is focused on one idea from the discussion and readings");
    expect(g.rows[0].levels.map((l) => [l.label, l.points])).toEqual([
      ["You've got it!", 3],
      ["Almost there", 2],
      ["This area needs work", 1],
    ]);
    expect(g.rows[0].levels[2].desc).toMatch(/^Your response is not focused/);
    expect(g.rows[1].levels[0].desc).toBe("Your quotations are carefully chosen and perfectly embedded.");
    expect(g.rows[1].levels[2].desc).toMatch(/See notes\.$/);
  });

  it("reads levels with the points on the same line", () => {
    const g = parseRubricGrid(`Thesis
Strong 4 pts
Clear and arguable.
Okay 2 pts
There, but vague.
Evidence
Strong 4 pts
Three good sources.
Okay 2 pts
One source.`)!;
    expect(g.rows.map((r) => r.title)).toEqual(["Thesis", "Evidence"]);
    expect(g.rows[1].levels.map((l) => [l.label, l.points, l.desc])).toEqual([
      ["Strong", 4, "Three good sources."],
      ["Okay", 2, "One source."],
    ]);
  });

  it("reads a table copied from Docs, Word or Sheets", () => {
    const g = parseRubricGrid(
      ["Criteria\tExcellent (4)\tGood (3)\tNeeds work (1)", "Thesis\tClear and arguable\tClear\tMissing", "Evidence\tThree sources\tTwo sources\tNone"].join("\n"),
    )!;
    expect(g.rows.map((r) => r.title)).toEqual(["Thesis", "Evidence"]);
    expect(g.rows[0].levels.map((l) => [l.label, l.points, l.desc])).toEqual([
      ["Excellent", 4, "Clear and arguable"],
      ["Good", 3, "Clear"],
      ["Needs work", 1, "Missing"],
    ]);
  });

  it("gives a table's levels points when it has none", () => {
    const g = parseRubricGrid(["\tAdvanced\tProficient\tBasic", "Voice\tA\tB\tC"].join("\n"))!;
    expect(g.rows[0].levels.map((l) => l.points)).toEqual([3, 2, 1]);
  });

  it("leaves plain rubrics as text", () => {
    expect(parseRubricGrid("Research 40%, Slides 30%, Presentation 30%")).toBeUndefined();
    expect(parseRubricGrid("Thesis: 20 pts\nEvidence: 40 pts\nGrammar: 20 pts")).toBeUndefined();
    expect(parseRubricGrid("")).toBeUndefined();
  });
});
