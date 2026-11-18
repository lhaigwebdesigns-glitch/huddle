import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { chunk, docFromState, replaceContent, unchunk } from "./yjs-files";
import { readMarkdown, writeMarkdown } from "./markdown-yjs";

describe("file versions", () => {
  it("restores a doc snapshot into a live doc", () => {
    const live = new Y.Doc();
    writeMarkdown(live, "# Plan\n\nVersion one");
    const snap = Y.encodeStateAsUpdate(live);
    writeMarkdown(live, "# Plan\n\nVersion two, rewritten");
    replaceContent(live, docFromState(snap), "doc");
    expect(readMarkdown(live)).toBe("# Plan\n\nVersion one");
  });

  it("restores maps and arrays, including nested Y types (sheets, slides)", () => {
    const live = new Y.Doc();
    live.getMap("cells").set("A1", { v: "old" });
    const slide = new Y.Map();
    slide.set("title", "Intro");
    live.getArray("slides").push([slide]);
    const snap = Y.encodeStateAsUpdate(live);

    live.getMap("cells").set("A1", { v: "new" });
    live.getMap("cells").set("B2", { v: "extra" });
    live.getArray("slides").delete(0, 1);

    replaceContent(live, docFromState(snap), "sheet");
    replaceContent(live, docFromState(snap), "slides");
    expect(live.getMap("cells").toJSON()).toEqual({ A1: { v: "old" } });
    expect(live.getArray("slides").toJSON()).toEqual([{ title: "Intro" }]);
  });

  it("chunks and reassembles large states", () => {
    const bytes = new Uint8Array(1_300_000).map((_, i) => i % 251);
    const parts = chunk(bytes);
    expect(parts).toHaveLength(3);
    expect(unchunk(parts)).toEqual(bytes);
  });
});
