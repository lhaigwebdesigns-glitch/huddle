import { describe, expect, it } from "vitest";
import { collectUrls, stripUnverifiedLinks } from "./citations";

describe("citation guard", () => {
  const toolOutput = "[1] Dead-layer fix\nhttps://www.sciencedaily.com/releases/2026/11/261112103000.htm\nsnippet";
  const allowed = collectUrls([toolOutput, "Alice: see https://example.com/page."]);

  it("keeps links that came from tool results or users (ignoring www, trailing slash, hash)", () => {
    const md =
      "[Story](https://sciencedaily.com/releases/2026/11/261112103000.htm) and [page](https://example.com/page/#top)";
    const { text, removed } = stripUnverifiedLinks(md, allowed);
    expect(text).toBe(md);
    expect(removed).toEqual([]);
  });

  it("unlinks invented URLs but keeps the label text", () => {
    const md = "Read [ScienceDaily – Nov 13](https://www.sciencedaily.com/releases/2026/11/261113654321.htm).";
    const { text, removed } = stripUnverifiedLinks(md, allowed);
    expect(text).toBe("Read ScienceDaily – Nov 13.");
    expect(removed).toHaveLength(1);
  });

  it("leaves code spans and blocks untouched", () => {
    const md = "`[x](https://fake.test/a)`\n\n```md\n[y](https://fake.test/b)\n```";
    expect(stripUnverifiedLinks(md, allowed).text).toBe(md);
  });
});
