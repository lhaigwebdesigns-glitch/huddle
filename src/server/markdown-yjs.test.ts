import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { readMarkdown, writeMarkdown } from "./markdown-yjs";

describe("markdown ⇄ yjs", () => {
  it("keeps inline text in order with marks", () => {
    const doc = new Y.Doc();
    writeMarkdown(doc, "# Title\n\nThis doc was written by the **mock AI**.\n\n- one\n- two *three*");
    const md = readMarkdown(doc);
    expect(md).toContain("# Title");
    expect(md).toContain("This doc was written by the **mock AI**.");
    expect(md).toContain("- one");
    expect(md).toContain("- two *three*");
  });

  it("appends and replaces", () => {
    const doc = new Y.Doc();
    writeMarkdown(doc, "First");
    writeMarkdown(doc, "Second", "append");
    expect(readMarkdown(doc)).toMatch(/First[\s\S]*Second/);
    writeMarkdown(doc, "Only", "replace");
    expect(readMarkdown(doc)).toBe("Only");
  });

  it("handles code blocks and links", () => {
    const doc = new Y.Doc();
    writeMarkdown(doc, "See [docs](https://example.com)\n\n```js\nconst a = 1;\n```");
    const md = readMarkdown(doc);
    expect(md).toContain("[docs](https://example.com)");
    expect(md).toContain("const a = 1;");
  });

  it("writes tables as aligned plain text without raw Markdown", () => {
    const doc = new Y.Doc();
    writeMarkdown(doc, "| Item | Cost |\n|---|---|\n| Flour | $20 |\n| **Total** | **$380** |", "append");
    const md = readMarkdown(doc);
    expect(md).not.toContain("**");
    expect(md).toContain("Item  | Cost");
    expect(md).toContain("Total | $380");
  });
});
