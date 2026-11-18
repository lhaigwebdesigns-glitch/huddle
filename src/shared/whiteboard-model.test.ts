import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { boardSummary, elementsOf, queueDrawing, pendingOf, remapIds } from "./whiteboard-model";

describe("whiteboard model", () => {
  it("remaps ids deterministically, including bindings and groups", () => {
    const els = [
      { id: "r1", type: "rectangle", boundElements: [{ id: "t1", type: "text" }, { id: "a1", type: "arrow" }], groupIds: ["gA"] },
      { id: "t1", type: "text", containerId: "r1", groupIds: ["gA"] },
      { id: "a1", type: "arrow", startBinding: { elementId: "r1", focus: 0, gap: 1 }, endBinding: null },
    ];
    const a = remapIds(els, "ai1");
    const b = remapIds(structuredClone(els).map((e) => ({ ...e })), "ai1");
    expect(a).toEqual(b); // two browsers converting the same drawing agree exactly
    expect(a.map((e) => e.id)).toEqual(["ai1-0", "ai1-1", "ai1-2"]);
    expect(a[0].boundElements).toEqual([{ id: "ai1-1", type: "text" }, { id: "ai1-2", type: "arrow" }]);
    expect(a[1].containerId).toBe("ai1-0");
    expect(a[2].startBinding?.elementId).toBe("ai1-0");
    expect(a[0].groupIds).toEqual(["ai1-g0"]);
  });

  it("summarizes a board and queues AI drawings", () => {
    const doc = new Y.Doc();
    elementsOf(doc).set("x", { id: "x", type: "rectangle" });
    elementsOf(doc).set("y", { id: "y", type: "text", text: "Login" });
    elementsOf(doc).set("z", { id: "z", type: "text", text: "gone", isDeleted: true });
    expect(boardSummary(doc)).toBe("Shapes: 1 rectangle, 1 text\nText on the board:\n- Login");
    queueDrawing(doc, { mermaid: "flowchart LR\nA-->B" });
    expect(pendingOf(doc).get(0)).toMatchObject({ mermaid: "flowchart LR\nA-->B" });
  });
});
