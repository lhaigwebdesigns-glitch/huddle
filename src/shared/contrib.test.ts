import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { sharesOf } from "./contrib";
import { cellsOf } from "./sheet-model";
import { slidesOf } from "./slides-model";

/** Two people editing one file: each has their own Yjs client id; updates are exchanged both ways. */
function pair() {
  const a = new Y.Doc();
  a.clientID = 1;
  const b = new Y.Doc();
  b.clientID = 2;
  a.on("update", (u: Uint8Array, origin: unknown) => origin !== "sync" && Y.applyUpdate(b, u, "sync"));
  b.on("update", (u: Uint8Array, origin: unknown) => origin !== "sync" && Y.applyUpdate(a, u, "sync"));
  return { a, b };
}
const who = (c: number) => ({ 1: "alice", 2: "bob", 3: "ai" })[c] ?? null;

describe("contribution shares", () => {
  it("credits the words still in a doc to whoever wrote them", () => {
    const { a, b } = pair();
    a.getText("t").insert(0, "The alliance system caused the war.");
    b.getText("t").insert(a.getText("t").length, " Nationalism mattered too.");
    expect(sharesOf(a, "doc", who)).toEqual({ alice: { words: 6, units: 0 }, bob: { words: 3, units: 0 } });
  });

  it("doesn't count text that was deleted, so pasting and deleting earns nothing", () => {
    const { a, b } = pair();
    a.getText("t").insert(0, "one two three four five six seven eight");
    b.getText("t").delete(0, a.getText("t").length);
    b.getText("t").insert(0, "short rewrite");
    expect(sharesOf(b, "doc", who)).toEqual({ bob: { words: 2, units: 0 } });
  });

  it("keeps words typed in separate places apart", () => {
    const { a, b } = pair();
    a.getText("t").insert(0, "alpha");
    b.getText("t").insert(5, " middle ");
    a.getText("t").insert(a.getText("t").length, "omega");
    expect(sharesOf(a, "doc", who).alice.words).toBe(2);
  });

  it("counts slides and sheet cells as units", () => {
    const { a, b } = pair();
    slidesOf(a).push([new Y.Map(), new Y.Map()]);
    slidesOf(b).push([new Y.Map()]);
    expect(sharesOf(a, "slides", who)).toEqual({ alice: { words: 0, units: 2 }, bob: { words: 0, units: 1 } });
    const s = pair();
    cellsOf(s.a).set("A1", { v: "x" } as never);
    cellsOf(s.b).set("A1", { v: "y" } as never); // overwrite: the cell is now Bob's
    cellsOf(s.b).set("A2", { v: "z" } as never);
    expect(sharesOf(s.a, "sheet", who)).toEqual({ bob: { words: 0, units: 2 } });
  });

  it("skips clients nobody is credited for (restores, copies)", () => {
    const d = new Y.Doc();
    d.clientID = 9;
    d.getText("t").insert(0, "restored text here");
    expect(sharesOf(d, "doc", who)).toEqual({});
  });
});
