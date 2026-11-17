import * as Y from "yjs";
import { marked, type Token, type Tokens } from "marked";

/**
 * Converts Markdown into the Yjs XML structure used by Tiptap/y-prosemirror,
 * so the AI can write directly into a live collaborative document.
 */
type Marks = Record<string, Record<string, unknown>>;

type Op = { insert: string; attributes?: Marks };

// Note: Y.XmlText that isn't attached to a doc yet ignores insert positions, so we
// collect a delta and apply it in one go to keep text in order.
function inlineToText(tokens: Token[] | undefined, marks: Marks, out: Op[]) {
  for (const t of tokens ?? []) {
    switch (t.type) {
      case "strong":
        inlineToText((t as Tokens.Strong).tokens, { ...marks, bold: {} }, out);
        break;
      case "em":
        inlineToText((t as Tokens.Em).tokens, { ...marks, italic: {} }, out);
        break;
      case "del":
        inlineToText((t as Tokens.Del).tokens, { ...marks, strike: {} }, out);
        break;
      case "codespan":
        out.push({ insert: decode((t as Tokens.Codespan).text), attributes: { ...marks, code: {} } });
        break;
      case "link": {
        const l = t as Tokens.Link;
        inlineToText(l.tokens, { ...marks, link: { href: l.href, target: "_blank" } }, out);
        break;
      }
      case "br":
        out.push({ insert: "\n", attributes: marks });
        break;
      case "text":
      case "escape": {
        const tt = t as Tokens.Text;
        if (tt.tokens?.length) inlineToText(tt.tokens, marks, out);
        else out.push({ insert: decode(tt.text), attributes: marks });
        break;
      }
      default:
        if ("text" in t && typeof t.text === "string") out.push({ insert: decode(t.text), attributes: marks });
    }
  }
}

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function para(tokens: Token[] | undefined, name = "paragraph", attrs: Record<string, unknown> = {}) {
  const el = new Y.XmlElement(name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v as any);
  const ops: Op[] = [];
  inlineToText(tokens, {}, ops);
  const text = new Y.XmlText();
  text.applyDelta(ops.filter((o) => o.insert).map((o) => (o.attributes && Object.keys(o.attributes).length ? o : { insert: o.insert })));
  el.insert(0, [text]);
  return el;
}

function blocks(tokens: Token[]): Y.XmlElement[] {
  const out: Y.XmlElement[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case "heading": {
        const h = t as Tokens.Heading;
        out.push(para(h.tokens, "heading", { level: Math.min(h.depth, 6) }));
        break;
      }
      case "paragraph":
        out.push(para((t as Tokens.Paragraph).tokens));
        break;
      case "text":
        out.push(para((t as Tokens.Text).tokens ?? [t]));
        break;
      case "list": {
        const l = t as Tokens.List;
        const list = new Y.XmlElement(l.ordered ? "orderedList" : "bulletList");
        if (l.ordered && typeof l.start === "number" && l.start !== 1) list.setAttribute("start", l.start as any);
        list.insert(
          0,
          l.items.map((item) => {
            const li = new Y.XmlElement("listItem");
            const children = blocks(item.tokens);
            li.insert(0, children.length ? children : [para([])]);
            return li;
          }),
        );
        out.push(list);
        break;
      }
      case "code": {
        const c = t as Tokens.Code;
        const el = new Y.XmlElement("codeBlock");
        if (c.lang) el.setAttribute("language", c.lang);
        const text = new Y.XmlText();
        text.insert(0, c.text);
        el.insert(0, [text]);
        out.push(el);
        break;
      }
      case "blockquote": {
        const el = new Y.XmlElement("blockquote");
        const children = blocks((t as Tokens.Blockquote).tokens);
        el.insert(0, children.length ? children : [para([])]);
        out.push(el);
        break;
      }
      case "hr":
        out.push(new Y.XmlElement("horizontalRule"));
        break;
      case "table": {
        // StarterKit has no tables yet: render as a readable text table.
        const tb = t as Tokens.Table;
        const rows = [tb.header.map((c) => c.text), ...tb.rows.map((r) => r.map((c) => c.text))];
        const el = new Y.XmlElement("codeBlock");
        const text = new Y.XmlText();
        text.insert(0, rows.map((r) => r.join(" | ")).join("\n"));
        el.insert(0, [text]);
        out.push(el);
        break;
      }
      case "space":
        break;
      default:
        if ("text" in t && typeof t.text === "string" && t.text.trim()) out.push(para([{ type: "text", raw: t.text, text: t.text } as Token]));
    }
  }
  return out;
}

export function writeMarkdown(doc: Y.Doc, markdown: string, mode: "replace" | "append" = "replace") {
  const fragment = doc.getXmlFragment("default");
  const nodes = blocks(marked.lexer(markdown));
  doc.transact(() => {
    if (mode === "replace" && fragment.length) fragment.delete(0, fragment.length);
    if (nodes.length) fragment.insert(fragment.length, nodes);
  }, "ai");
}

/** Read a Tiptap Yjs doc back as (approximate) Markdown so the AI can see it. */
export function readMarkdown(doc: Y.Doc): string {
  const fragment = doc.getXmlFragment("default");
  const lines: string[] = [];
  const textOf = (el: Y.XmlElement | Y.XmlText | Y.XmlHook): string => {
    if (el instanceof Y.XmlText) {
      return el
        .toDelta()
        .map((d: any) => {
          let s = typeof d.insert === "string" ? d.insert : "";
          const a = d.attributes ?? {};
          if (a.code) s = "`" + s + "`";
          if (a.bold) s = `**${s}**`;
          if (a.italic) s = `*${s}*`;
          if (a.link?.href) s = `[${s}](${a.link.href})`;
          return s;
        })
        .join("");
    }
    if (el instanceof Y.XmlElement) return el.toArray().map((c) => textOf(c as any)).join("");
    return "";
  };
  const walk = (el: Y.XmlElement, prefix = "", indent = "") => {
    const name = el.nodeName;
    if (name === "heading") lines.push(`${"#".repeat(Number(el.getAttribute("level")) || 1)} ${textOf(el)}`);
    else if (name === "paragraph") lines.push(prefix + textOf(el));
    else if (name === "codeBlock") lines.push("```" + (el.getAttribute("language") ?? ""), textOf(el), "```");
    else if (name === "horizontalRule") lines.push("---");
    else if (name === "bulletList" || name === "orderedList") {
      el.toArray().forEach((li, i) => {
        const bullet = name === "orderedList" ? `${i + 1}. ` : "- ";
        (li as Y.XmlElement).toArray().forEach((child, j) =>
          walk(child as Y.XmlElement, indent + (j === 0 ? bullet : "  "), indent + "  "),
        );
      });
      return;
    } else if (name === "blockquote") {
      el.toArray().forEach((c) => walk(c as Y.XmlElement, "> "));
      return;
    } else lines.push(prefix + textOf(el));
    if (!prefix) lines.push("");
  };
  fragment.toArray().forEach((c) => c instanceof Y.XmlElement && walk(c));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
