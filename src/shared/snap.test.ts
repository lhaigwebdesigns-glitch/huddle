import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { snapBox, SNAP } from "./snap";
import { makeElement, makeSlide, readElement, readSlide } from "./slides-model";

describe("free layout snapping", () => {
  it("snaps a box's center to the slide's center", () => {
    const r = snapBox({ x: 480 - 100 + 5, y: 270 - 50 - 3, w: 200, h: 100 }, []);
    expect(r.x).toBe(380);
    expect(r.y).toBe(220);
    expect(r.guides).toEqual({ v: [480], h: [270] });
  });
  it("snaps to another box's edge, and leaves far boxes alone", () => {
    const other = { x: 100, y: 100, w: 200, h: 100 };
    expect(snapBox({ x: 304, y: 400, w: 50, h: 50 }, [other]).x).toBe(300);
    const far = snapBox({ x: 600, y: 330, w: 50, h: 50 }, [other]);
    expect(far.guides).toEqual({ v: [], h: [] });
    expect(SNAP).toBe(8);
  });
});

describe("free layout elements", () => {
  it("keeps boxes, text and owners when a slide is copied", () => {
    const doc = new Y.Doc();
    const arr = doc.getArray<Y.Map<any>>("slides");
    arr.push([
      makeSlide({
        layout: "free",
        owner: { uid: "u1", name: "Alex" },
        elements: [
          { type: "text", x: 10, y: 20, w: 300, h: 80, text: "Hello", size: 40 },
          { type: "rect", x: 5000, y: -900, w: 5, h: 5, fill: "red" },
          { type: "image", x: 0, y: 0, w: 100, h: 100, src: "javascript:alert(1)" },
        ],
      }),
    ]);
    const s = readSlide(arr.get(0));
    expect(s.owner).toEqual({ uid: "u1", name: "Alex" });
    expect(s.elements[0]).toMatchObject({ type: "text", text: "Hello", size: 40, x: 10, y: 20 });
    // Out-of-range numbers are clamped and bad colors/links are replaced.
    expect(s.elements[1]).toMatchObject({ x: 960, y: -400, w: 20, h: 20, fill: "#4f46e5" });
    expect(s.elements[2].src).toBe("");
    const copy = new Y.Doc();
    copy.getArray<Y.Map<any>>("slides").push([makeSlide(s)]);
    expect(readSlide(copy.getArray<Y.Map<any>>("slides").get(0)).elements.length).toBe(3);
    // Images uploaded to the room are allowed (a Yjs map is readable once it's in a doc).
    const holder = new Y.Doc().getArray<Y.Map<any>>("els");
    holder.push([makeElement({ type: "image", x: 1, y: 1, w: 50, h: 50, src: "/api/rooms/ABC123/blobs/abcdef0123456789" })]);
    expect(readElement(holder.get(0)).src).toBe("/api/rooms/ABC123/blobs/abcdef0123456789");
  });
});
