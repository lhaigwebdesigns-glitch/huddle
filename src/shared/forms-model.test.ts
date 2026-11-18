import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { addResponse, makeQuestion, publicForm, questionsOf, responseRows, summarize, validateAnswers } from "./forms-model";

function sampleForm() {
  const doc = new Y.Doc();
  questionsOf(doc).push([
    makeQuestion({ id: "name", type: "short", title: "Your name", required: true }),
    makeQuestion({ id: "day", type: "choice", title: "Best day", options: ["Sat", "Sun"] }),
    makeQuestion({ id: "bring", type: "checkbox", title: "Bringing", options: ["Cookies", "Brownies", "Pie"] }),
    makeQuestion({ id: "fun", type: "scale", title: "Excitement", max: 5 }),
  ]);
  return doc;
}

describe("forms model", () => {
  it("validates and cleans answers", () => {
    const qs = publicForm(sampleForm(), "Bake sale").questions;
    expect(validateAnswers(qs, { day: "Sat" })).toEqual({ ok: false, error: '"Your name" is required.' });
    expect(validateAnswers(qs, { name: "Ana", day: "Mon" })).toMatchObject({ ok: false });
    expect(validateAnswers(qs, { name: "Ana", fun: 9 })).toMatchObject({ ok: false });
    const good = validateAnswers(qs, { name: "Ana", day: "Sun", bring: ["Pie", "Pie", "Cake"], fun: "4", junk: "x" });
    expect(good).toEqual({ ok: true, answers: { name: "Ana", day: "Sun", bring: ["Pie"], fun: 4 } });
  });

  it("summarizes responses and exports rows", () => {
    const doc = sampleForm();
    addResponse(doc, { name: "Ana", day: "Sat", bring: ["Cookies", "Pie"], fun: 5 });
    addResponse(doc, { name: "Ben", day: "Sat", bring: ["Pie"], fun: 3 });
    const s = summarize(doc);
    expect(s).toContain("2 responses.");
    expect(s).toContain("Best day: Sat 2, Sun 0");
    expect(s).toContain("Bringing: Cookies 1, Brownies 0, Pie 2");
    expect(s).toContain("Excitement: average 4.0 of 5");
    const rows = responseRows(doc);
    expect(rows[0]).toEqual(["Submitted", "Your name", "Best day", "Bringing", "Excitement"]);
    expect(rows[1].slice(1)).toEqual(["Ana", "Sat", "Cookies; Pie", "5"]);
  });
});
