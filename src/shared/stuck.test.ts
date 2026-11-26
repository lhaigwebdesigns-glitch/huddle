import { describe, expect, it } from "vitest";
import { addQuestion, mockStuck, parseStuck, QUESTION_LIMITS, stuckPrompt } from "./stuck";

describe("where they got stuck", () => {
  it("keeps each question short, without the @ai, and only the latest ones", () => {
    let l = addQuestion([], "  @ai   is my thesis   too broad?  ", 1);
    expect(l).toEqual([{ at: 1, text: "is my thesis too broad?" }]);
    expect(addQuestion(l, "   ")).toBe(l);
    for (let i = 0; i < 80; i++) l = addQuestion(l, `q${i} ${"x".repeat(400)}`, i);
    expect(l).toHaveLength(QUESTION_LIMITS.perStudent);
    expect(l[0].text.length).toBe(QUESTION_LIMITS.chars);
  });

  it("asks for kind, short points the student could read too", () => {
    const m = stuckPrompt([{ uid: "u1", name: "Ava", questions: [{ at: 1, text: "how do I cite a website" }] }]);
    expect(m[0].content).toMatch(/student will read it too/);
    expect(m[1].content).toContain("### u1 (Ava)\n- how do I cite a website");
  });

  it("reads the model's JSON, even with words around it, and drops anything off", () => {
    const text = 'Sure! {"u1": ["Narrowing the thesis (asked 3 times)", "", "How to cite a website", 5], "u9": ["not in the group"]} Hope that helps.';
    expect(parseStuck(text, ["u1", "u2"])).toEqual({ u1: ["Narrowing the thesis (asked 3 times)", "How to cite a website"] });
    expect(parseStuck("no json here", ["u1"])).toEqual({});
    expect(parseStuck("{broken", ["u1"])).toEqual({});
  });

  it("the test summary counts repeats", () => {
    expect(mockStuck([{ at: 1, text: "Thesis?" }, { at: 2, text: "thesis" }, { at: 3, text: "citations" }])).toEqual(["Asked about: thesis (asked 2 times)", "Asked about: citations"]);
  });
});
