import { describe, expect, it } from "vitest";
import { colIndex, colName, evaluateSheet, expandRange, formatValue, literal } from "./formula";

const ev = (raw: Record<string, string>) => evaluateSheet(raw);

describe("formula engine", () => {
  it("converts column names", () => {
    expect([colName(0), colName(25), colName(26), colName(701)]).toEqual(["A", "Z", "AA", "ZZ"]);
    expect([colIndex("A"), colIndex("AA"), colIndex("ZZ")]).toEqual([0, 26, 701]);
    expect(expandRange("A1:B2")).toEqual(["A1", "B1", "A2", "B2"]);
  });

  it("parses literals", () => {
    expect([literal("42"), literal("$1,200.50"), literal("15%"), literal("true"), literal("hi"), literal("")]).toEqual([42, 1200.5, 0.15, true, "hi", null]);
    expect([literal("'007"), literal("'=SUM(A1)")]).toEqual(["007", "=SUM(A1)"]); // apostrophe forces text
  });

  it("does arithmetic with precedence, refs and percentages", () => {
    const r = ev({ A1: "2", A2: "3", A3: "=A1+A2*4", A4: "=(A1+A2)^2", A5: "=-A1^2", A6: "=50%*A2", A7: '="Total: "&A3' });
    // Like Excel and Google Sheets, unary minus binds tighter than ^, so =-2^2 is 4.
    expect([r.A3, r.A4, r.A5, r.A6, r.A7]).toEqual([14, 25, 4, 1.5, "Total: 14"]);
  });

  it("runs functions over ranges, skipping text", () => {
    const r = ev({ A1: "10", A2: "20", A3: "apples", A4: "30", B1: "=SUM(A1:A4)", B2: "=AVERAGE(A1:A4)", B3: "=COUNT(A1:A4)", B4: "=COUNTA(A1:A4)", B5: "=MAX(A1:A4)-MIN(A1:A4)" });
    expect([r.B1, r.B2, r.B3, r.B4, r.B5]).toEqual([60, 20, 3, 4, 20]);
  });

  it("supports IF, comparisons, SUMIF/COUNTIF and IFERROR", () => {
    const r = ev({
      A1: "5",
      A2: "15",
      A3: "25",
      B1: '=IF(A1>10,"big","small")',
      B2: '=SUMIF(A1:A3,">10")',
      B3: '=COUNTIF(A1:A3,"<=15")',
      B4: "=IFERROR(1/0, 0)",
      B5: "=ROUND(2/3, 2)",
    });
    expect([r.B1, r.B2, r.B3, r.B4, r.B5]).toEqual(["small", 40, 2, 0, 0.67]);
  });

  it("reports spreadsheet errors", () => {
    const r = ev({ A1: "=1/0", A2: "=NOPE(1)", A3: "=A4", A4: "=A3", A5: '="x"*2', A6: "=A1+1", A7: "=SUM(" });
    expect(r.A1).toEqual({ error: "#DIV/0!" });
    expect(r.A2).toEqual({ error: "#NAME?" });
    expect(r.A3).toEqual({ error: "#CIRC!" });
    expect(r.A5).toEqual({ error: "#VALUE!" });
    expect(r.A6).toEqual({ error: "#DIV/0!" }); // errors propagate
    expect(r.A7).toEqual({ error: "#VALUE!" });
  });

  it("formats numbers", () => {
    expect(formatValue(1234.5, "cur")).toBe("$1,234.50");
    expect(formatValue(0.256, "pct")).toBe("25.6%");
    expect(formatValue(0.1 + 0.2)).toBe("0.3");
    expect(formatValue({ error: "#REF!" })).toBe("#REF!");
  });
});
