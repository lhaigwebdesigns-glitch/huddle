import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { charsInUpdate, mergeSteps, ReplayBuilder, replayFromJson, replayToJson, sessions, stepDelays, type ReplayEntry } from "./replay";

/** Types `text` into a Y.Text one piece at a time, recording each update like the doc server does. */
function record(pieces: { by: string | null; at: number; text: string }[]) {
  const doc = new Y.Doc();
  const base = Y.encodeStateAsUpdate(doc);
  const entries: ReplayEntry[] = [];
  doc.on("update", (u: Uint8Array) => entries.push({ at: cur.at, by: cur.by, chars: charsInUpdate(u), u }));
  let cur = pieces[0];
  for (const p of pieces) {
    cur = p;
    const t = doc.getText("t");
    t.insert(t.length, p.text);
  }
  return { doc, base, entries };
}

describe("writing replay", () => {
  it("counts the text an update adds", () => {
    const { entries } = record([{ by: "a", at: 0, text: "hello" }]);
    expect(entries[0].chars).toBe(5);
  });

  it("plays back to exactly the doc at any step", () => {
    const { doc, base, entries } = record(Array.from({ length: 450 }, (_, i) => ({ by: "a", at: i * 100, text: `${i} ` })));
    const b = new ReplayBuilder({ base, entries }, 100);
    expect(b.at(entries.length).getText("t").toString()).toBe(doc.getText("t").toString());
    expect(b.at(3).getText("t").toString()).toBe("0 1 2 ");
    expect(b.at(0).getText("t").toString()).toBe("");
    expect(b.at(250).getText("t").toString().endsWith("249 ")).toBe(true);
  });

  it("joins quick typing by one person, but keeps people, breaks and pastes apart", () => {
    const { base, entries } = record([
      { by: "a", at: 0, text: "H" },
      { by: "a", at: 200, text: "i" },
      { by: "a", at: 400, text: "!" },
      { by: "b", at: 500, text: " yo" },
      { by: "b", at: 5000, text: " later" },
      { by: "b", at: 5100, text: "x".repeat(400) },
    ]);
    const steps = mergeSteps(entries);
    expect(steps.map((s) => [s.by, s.chars])).toEqual([
      ["a", 3],
      ["b", 3],
      ["b", 6],
      ["b", 400],
    ]);
    // Merged steps still play back to the same text.
    expect(new ReplayBuilder({ base, entries: steps }).at(steps.length).getText("t").toString()).toBe(`Hi! yo later${"x".repeat(400)}`);
  });

  it("keeps steady typing as about one step a second, so it still plays like typing", () => {
    const { entries } = record(Array.from({ length: 30 }, (_, i) => ({ by: "a", at: i * 100, text: "x" })));
    expect(mergeSteps(entries)).toHaveLength(3);
  });

  it("plays typing at its pace and squeezes long breaks", () => {
    const d = stepDelays([{ at: 0 }, { at: 400 }, { at: 400 + 3 * 86_400_000 }], 4);
    expect(d[0]).toBe(0);
    expect(d[1]).toBe(100);
    expect(d[2]).toBeLessThan(900); // three days become under a second
  });

  it("splits the timeline into work sessions at long breaks", () => {
    const s = sessions([{ at: 0 }, { at: 60_000 }, { at: 3 * 3_600_000 }, { at: 3 * 3_600_000 + 1000 }]);
    expect(s.map((x) => [x.from, x.to])).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it("survives the trip over HTTP", () => {
    const { base, entries } = record([{ by: "a", at: 1, text: "héllo 👋" }]);
    const back = replayFromJson(JSON.parse(JSON.stringify(replayToJson({ base, entries, truncated: false, names: { a: "Ava" } }))));
    expect(new ReplayBuilder(back).at(1).getText("t").toString()).toBe("héllo 👋");
    expect(back.names).toEqual({ a: "Ava" });
  });
});
