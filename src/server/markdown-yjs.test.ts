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

  it("writes Markdown tables as real tables, and reads them back as Markdown", () => {
    const doc = new Y.Doc();
    writeMarkdown(doc, "| Item | Cost |\n|---|---|\n| Flour | $20 |\n| **Total** | **$380** |", "append");
    const table = doc.getXmlFragment("default").get(0) as Y.XmlElement;
    expect(table.nodeName).toBe("table");
    expect((table.get(0) as Y.XmlElement).get(0)).toHaveProperty("nodeName", "tableHeader");
    const md = readMarkdown(doc);
    expect(md).toContain("| Item | Cost |");
    expect(md).toContain("| Flour | $20 |");
    expect(md).toContain("| **Total** | **$380** |");
  });

  it("reads images and checklists back for the AI", () => {
    const doc = new Y.Doc();
    const frag = doc.getXmlFragment("default");
    const img = new Y.XmlElement("image");
    img.setAttribute("src", "/api/rooms/ABC/blobs/x");
    img.setAttribute("alt", "chart");
    const list = new Y.XmlElement("taskList");
    const item = new Y.XmlElement("taskItem");
    item.setAttribute("checked", true as never);
    const p = new Y.XmlElement("paragraph");
    const t = new Y.XmlText();
    t.insert(0, "Find sources");
    p.insert(0, [t]);
    item.insert(0, [p]);
    list.insert(0, [item]);
    frag.insert(0, [img, list]);
    const md = readMarkdown(doc);
    expect(md).toContain("![chart](/api/rooms/ABC/blobs/x)");
    expect(md).toContain("- [x] Find sources");
  });
});
