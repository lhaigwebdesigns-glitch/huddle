import { describe, expect, it } from "vitest";
import { chunkText, ftsQuery, safeFileName } from "./knowledge";

describe("knowledge helpers", () => {
  it("chunks long text with overlap and keeps short text whole", () => {
    expect(chunkText("Short note.")).toEqual(["Short note."]);
    const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} talks about the bake sale budget.`).join(" ");
    const chunks = chunkText(long);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.length <= 820)).toBe(true);
    expect(chunks.join(" ")).toContain("Sentence number 59");
  });

  it("builds safe full-text queries", () => {
    expect(ftsQuery("What is the budget for the bake sale?")).toBe('"budget" OR "bake" OR "sale"');
    expect(ftsQuery('drop" table; -- NEAR(x)')).toBe('"drop" OR "table" OR "near"');
    expect(ftsQuery("?? !!")).toBe("");
  });

  it("cleans file names", () => {
    expect(safeFileName("../../etc/passwd")).toBe(".._.._etc_passwd");
    expect(safeFileName("Budget (final).pdf")).toBe("Budget _final_.pdf");
  });
});
