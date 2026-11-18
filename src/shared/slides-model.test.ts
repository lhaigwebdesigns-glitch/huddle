import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { applySlideOps, bullets, deckOutline, makeSlide, readSlide, setText, slidesOf, themeOf } from "./slides-model";

describe("slides model", () => {
  it("builds and edits a deck with 1-based ops", () => {
    const doc = new Y.Doc();
    slidesOf(doc).push([makeSlide({ layout: "title", title: "Bake sale" }), makeSlide({ title: "Plan", body: "- Bake\n- Sell" })]);
    applySlideOps(doc, [
      { op: "update", index: 2, slide: { body: "- Bake\n- Price\n- Sell" } },
      { op: "insert", slide: { layout: "quote", title: "Every cookie counts" } },
      { op: "move", from: 3, to: 1 },
      { op: "theme", theme: "sunset" },
    ]);
    const s = slidesOf(doc).toArray().map(readSlide);
    expect(s.map((x) => x.title)).toEqual(["Every cookie counts", "Bake sale", "Plan"]);
    expect(bullets(s[2].body)).toEqual(["Bake", "Price", "Sell"]);
    expect(themeOf(doc)).toBe("sunset");
    expect(deckOutline(doc)).toContain("Slide 3 [bullets] Plan");
  });

  it("rejects bad indexes and unsafe image URLs", () => {
    const doc = new Y.Doc();
    expect(() => applySlideOps(doc, [{ op: "delete", index: 1 }])).toThrow(/no slide 1/);
    slidesOf(doc).push([makeSlide({ image: "javascript:alert(1)" })]);
    expect(readSlide(slidesOf(doc).get(0)).image).toBe("");
  });

  it("merges concurrent typing in the same text box", () => {
    const a = new Y.Doc();
    slidesOf(a).push([makeSlide({ title: "Hello world" })]);
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    setText(slidesOf(a).get(0).get("title"), "Hello big world");
    setText(slidesOf(b).get(0).get("title"), "Hello world!");
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(readSlide(slidesOf(a).get(0)).title).toBe("Hello big world!");
    expect(readSlide(slidesOf(b).get(0)).title).toBe("Hello big world!");
  });
});
