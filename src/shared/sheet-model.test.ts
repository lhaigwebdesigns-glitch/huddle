import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { applySheetOps, cellsOf, metaOf, parseCsv, readSheet, setRange, toCsv } from "./sheet-model";

describe("sheet model", () => {
  it("parses and writes CSV with quotes", () => {
    const rows = parseCsv('Item,Cost\n"Flour, white",20\n"He said ""hi""",3\n');
    expect(rows).toEqual([["Item", "Cost"], ["Flour, white", "20"], ['He said "hi"', "3"]]);
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("lets the AI build a budget with formulas, formats and a chart", () => {
    const doc = new Y.Doc();
    const done = applySheetOps(doc, [
      { op: "set_range", start: "A1", rows: [["Item", "Cost"], ["Flour", 20], ["Sugar", 12.5], ["Total", "=SUM(B2:B3)"]] },
      { op: "format", range: "A1:B1", bold: true, bg: "#eef2ff" },
      { op: "format", range: "B2:B4", format: "currency" },
      { op: "add_chart", type: "bar", range: "A1:B3", title: "Costs" },
    ]);
    expect(done).toHaveLength(4);
    const out = readSheet(doc);
    expect(out.range).toBe("A1:B4");
    expect(out.csv).toBe("Item,Cost\nFlour,$20.00\nSugar,$12.50\nTotal,$32.50");
    expect(out.formulas).toEqual(["B4: =SUM(B2:B3)"]);
    expect(cellsOf(doc).get("A1")).toMatchObject({ v: "Item", b: true, bg: "#eef2ff" });
    expect(metaOf(doc).get("charts")[0]).toMatchObject({ type: "bar", range: "A1:B3", title: "Costs" });
  });

  it("grows the grid for far-away cells and rejects bad refs", () => {
    const doc = new Y.Doc();
    setRange(doc, "A60", [["x"]]);
    expect(metaOf(doc).get("rows")).toBe(70);
    expect(() => applySheetOps(doc, [{ op: "set", cell: "nope", value: 1 }])).toThrow(/Bad cell/);
  });
});
