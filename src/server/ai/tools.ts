import { getServerByName } from "partyserver";
import type { Env } from "../env";
import type { FileKind, RoomFile, Source, Step } from "../../shared/protocol";
import type { ToolDef } from "./providers";
import { getSkill } from "./skills";
import { parseCsv, type SheetOp } from "../../shared/sheet-model";
import { colName } from "../../shared/formula";
import type { SlideData, SlideOp } from "../../shared/slides-model";

export interface ToolContext {
  env: Env;
  roomCode: string;
  files: () => RoomFile[];
  createFile: (kind: FileKind, title: string) => RoomFile;
  openFile: (id: string) => void;
  step: (s: Step) => void;
  sources: Source[];
}

export const TOOL_DEFS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for up-to-date information. Returns titles, URLs and snippets.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Search query" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Read a web page and return its main content as Markdown.",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "load_skill",
      description: "Load the full instructions of a skill from the skills list before doing that kind of task.",
      parameters: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_doc",
      description:
        "Create a new collaborative document in this room (like Google Docs) and write Markdown into it. It opens live for everyone.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          markdown: { type: "string", description: "Full document content in Markdown" },
        },
        required: ["title", "markdown"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_doc",
      description: "Read the current content of a document in this room as Markdown.",
      parameters: {
        type: "object",
        properties: { file_id: { type: "string" } },
        required: ["file_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_doc",
      description:
        "Edit an existing document. mode 'replace' rewrites the whole doc (read it first), 'append' adds to the end.",
      parameters: {
        type: "object",
        properties: {
          file_id: { type: "string" },
          markdown: { type: "string" },
          mode: { type: "string", enum: ["replace", "append"] },
        },
        required: ["file_id", "markdown"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_sheet",
      description:
        "Create a live spreadsheet. Give the data as CSV (first row = headers). Cells may be formulas like =SUM(B2:B9). Optionally pass ops to format or chart it.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          csv: { type: "string" },
          ops: { type: "array", items: { type: "object" }, description: "Same ops as edit_sheet, applied after the CSV" },
        },
        required: ["title", "csv"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_sheet",
      description: "Read a spreadsheet's computed values as CSV, plus its formulas. range like A1:D20 (default: all data).",
      parameters: { type: "object", properties: { file_id: { type: "string" }, range: { type: "string" } }, required: ["file_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_sheet",
      description:
        'Edit a spreadsheet with ops: {"op":"set","cell":"B5","value":"=B2*2"}, {"op":"set_range","start":"A1","rows":[["a",1]]}, {"op":"format","range":"A1:D1","bold":true,"align":"center","bg":"#eef2ff","format":"currency|percent|number|integer|plain"}, {"op":"clear","range":"A1:B2"}, {"op":"add_chart","type":"bar|line|pie","range":"A1:B6","title":"…"} (first column = labels, first row = series names), {"op":"col_width","col":"A","width":160}.',
      parameters: {
        type: "object",
        properties: { file_id: { type: "string" }, ops: { type: "array", items: { type: "object" } } },
        required: ["file_id", "ops"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_slides",
      description:
        "Create a live slide deck. Each slide: {layout: title|bullets|two|quote|section|image, title, body (bullet lines, one per line), body2 (right column for 'two'), image (https URL for 'image'), notes (speaker notes)}. themes: light, dark, indigo, sunset, forest.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          theme: { type: "string" },
          slides: { type: "array", items: { type: "object" } },
        },
        required: ["title", "slides"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_slides",
      description: "Read a deck's outline: every slide's layout, text and notes (slides are numbered from 1).",
      parameters: { type: "object", properties: { file_id: { type: "string" } }, required: ["file_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_slides",
      description:
        'Edit a deck with ops (slide numbers start at 1): {"op":"update","index":2,"slide":{"title":"…","body":"…"}}, {"op":"insert","index":3,"slide":{…}} (omit index to append), {"op":"delete","index":4}, {"op":"move","from":5,"to":2}, {"op":"theme","theme":"dark"}.',
      parameters: {
        type: "object",
        properties: { file_id: { type: "string" }, ops: { type: "array", items: { type: "object" } } },
        required: ["file_id", "ops"],
      },
    },
  },
];

/** Find a room file of the expected kind, with a helpful error for the model otherwise. */
function fileOf(ctx: ToolContext, id: unknown, kind: FileKind): RoomFile | string {
  const file = ctx.files().find((f) => f.id === id);
  if (!file) return "No such file_id in this room.";
  if (file.kind !== kind) return `That file is a ${file.kind}, not a ${kind}. Use the ${file.kind} tools for it.`;
  return file;
}

const fileStub = (ctx: ToolContext, file: RoomFile) => getServerByName(ctx.env.Doc, `${ctx.roomCode}--${file.id}`);

const MAX_TOOL_OUTPUT = 12_000;

export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<string> {
  let args: any = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return `Error: arguments were not valid JSON.`;
  }
  try {
    const out = await dispatch(name, args, ctx);
    return out.length > MAX_TOOL_OUTPUT ? out.slice(0, MAX_TOOL_OUTPUT) + "\n…(truncated)" : out;
  } catch (err) {
    return `Error running ${name}: ${String(err).slice(0, 300)}`;
  }
}

async function dispatch(name: string, args: any, ctx: ToolContext): Promise<string> {
  switch (name) {
    case "web_search": {
      const q = String(args.query ?? "").slice(0, 300);
      ctx.step({ kind: "search", label: `Searching the web for “${q}”` });
      const results = await webSearch(ctx.env, q);
      for (const r of results.slice(0, 5)) ctx.sources.push({ title: r.title, url: r.url });
      if (!results.length) return "No results found.";
      return results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`).join("\n\n");
    }
    case "fetch_url": {
      const url = String(args.url ?? "");
      if (!/^https?:\/\//i.test(url)) return "Error: url must start with http(s)://";
      ctx.step({ kind: "fetch", label: `Reading ${new URL(url).hostname}` });
      let text: string;
      try {
        text = await fetchReadable(url);
      } catch (err) {
        // Don't list pages that failed to load as sources (models sometimes guess URLs).
        return `Error: could not read ${url} (${String(err).slice(0, 120)}). Do not cite this URL. Use web_search to find a real page instead.`;
      }
      if (!ctx.sources.some((s) => s.url === url)) ctx.sources.push({ title: new URL(url).hostname, url });
      return text;
    }
    case "load_skill": {
      const skill = getSkill(String(args.name ?? ""));
      if (!skill) return "Unknown skill.";
      ctx.step({ kind: "skill", label: `Using skill: ${skill.name}` });
      return skill.body;
    }
    case "create_doc": {
      const title = String(args.title ?? "Untitled").slice(0, 120);
      const file = ctx.createFile("doc", title);
      ctx.step({ kind: "doc", label: `Writing doc “${title}”` });
      const stub = await getServerByName(ctx.env.Doc, `${ctx.roomCode}--${file.id}`);
      await stub.setMarkdown(String(args.markdown ?? ""), "replace");
      ctx.openFile(file.id);
      return `Created doc "${title}" with file_id ${file.id}. It is now open for everyone in the room.`;
    }
    case "read_doc": {
      const file = fileOf(ctx, args.file_id, "doc");
      if (typeof file === "string") return file;
      ctx.step({ kind: "doc", label: `Reading “${file.title}”` });
      const stub = await getServerByName(ctx.env.Doc, `${ctx.roomCode}--${file.id}`);
      return (await stub.getMarkdown()) || "(empty document)";
    }
    case "edit_doc": {
      const file = fileOf(ctx, args.file_id, "doc");
      if (typeof file === "string") return file;
      const mode = args.mode === "append" ? "append" : "replace";
      ctx.step({ kind: "doc", label: `${mode === "append" ? "Adding to" : "Editing"} “${file.title}”` });
      const stub = await getServerByName(ctx.env.Doc, `${ctx.roomCode}--${file.id}`);
      await stub.setMarkdown(String(args.markdown ?? ""), mode);
      ctx.openFile(file.id);
      return `Updated "${file.title}".`;
    }
    case "create_sheet": {
      const title = String(args.title ?? "Untitled sheet").slice(0, 120);
      const rows = parseCsv(String(args.csv ?? ""));
      const file = ctx.createFile("sheet", title);
      ctx.step({ kind: "doc", label: `Building sheet “${title}”` });
      const ops: SheetOp[] = [{ op: "set_range", start: "A1", rows }];
      // Bold the header row by default; the model's own ops can override it.
      if (rows.length > 1) ops.push({ op: "format", range: `A1:${colName(Math.max(0, rows[0].length - 1))}1`, bold: true, bg: "#eef2ff" });
      const extra = Array.isArray(args.ops) ? (args.ops as SheetOp[]) : [];
      const stub = await fileStub(ctx, file);
      let note = "";
      try {
        await stub.sheetOps([...ops, ...extra]);
      } catch (err) {
        await stub.sheetOps(ops);
        note = ` (Some extra ops failed: ${String(err).slice(0, 150)})`;
      }
      ctx.openFile(file.id);
      return `Created sheet "${title}" with file_id ${file.id}: ${rows.length} rows. It is open for everyone.${note}`;
    }
    case "read_sheet": {
      const file = fileOf(ctx, args.file_id, "sheet");
      if (typeof file === "string") return file;
      ctx.step({ kind: "doc", label: `Reading “${file.title}”` });
      const out = await (await fileStub(ctx, file)).readSheet(args.range ? String(args.range) : undefined);
      if (!out.range) return "(empty sheet)";
      return `Range ${out.range} (computed values):\n${out.csv}${out.formulas.length ? `\n\nFormulas:\n${out.formulas.join("\n")}` : ""}`;
    }
    case "edit_sheet": {
      const file = fileOf(ctx, args.file_id, "sheet");
      if (typeof file === "string") return file;
      if (!Array.isArray(args.ops) || !args.ops.length) return "Error: ops must be a non-empty array.";
      ctx.step({ kind: "doc", label: `Editing “${file.title}”` });
      const done = await (await fileStub(ctx, file)).sheetOps(args.ops as SheetOp[], true);
      ctx.openFile(file.id);
      return `Updated "${file.title}": ${done.join("; ")}.`;
    }
    case "create_slides": {
      const title = String(args.title ?? "Untitled deck").slice(0, 120);
      const slides: SlideData[] = Array.isArray(args.slides) ? args.slides.slice(0, 60) : [];
      if (!slides.length) return "Error: slides must be a non-empty array.";
      const file = ctx.createFile("slides", title);
      ctx.step({ kind: "doc", label: `Designing deck “${title}”` });
      const ops: SlideOp[] = slides.map((slide) => ({ op: "insert", slide }));
      if (args.theme) ops.push({ op: "theme", theme: args.theme });
      const stub = await fileStub(ctx, file);
      try {
        await stub.slideOps(ops);
      } catch (err) {
        await stub.slideOps(ops.filter((o) => o.op !== "theme"));
        return `Created deck "${title}" (file_id ${file.id}) with ${slides.length} slides, but: ${String(err).slice(0, 150)}`;
      }
      ctx.openFile(file.id);
      return `Created deck "${title}" with file_id ${file.id}: ${slides.length} slides. It is open for everyone; they can press Present.`;
    }
    case "read_slides": {
      const file = fileOf(ctx, args.file_id, "slides");
      if (typeof file === "string") return file;
      ctx.step({ kind: "doc", label: `Reading “${file.title}”` });
      return (await fileStub(ctx, file)).readDeck();
    }
    case "edit_slides": {
      const file = fileOf(ctx, args.file_id, "slides");
      if (typeof file === "string") return file;
      if (!Array.isArray(args.ops) || !args.ops.length) return "Error: ops must be a non-empty array.";
      ctx.step({ kind: "doc", label: `Editing “${file.title}”` });
      const done = await (await fileStub(ctx, file)).slideOps(args.ops as SlideOp[], true);
      ctx.openFile(file.id);
      return `Updated "${file.title}": ${done.join("; ")}.`;
    }
    default:
      return `Unknown tool ${name}`;
  }
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Free search chain (no credit card needed for any of these):
 *   1. Tavily  — TAVILY_API_KEY, 1,000 free searches/month
 *   2. Jina    — JINA_API_KEY, free starter token allowance
 *   3. DuckDuckGo HTML — keyless best effort; often bot-challenged from cloud IPs
 */
export async function webSearch(env: Env, query: string): Promise<SearchResult[]> {
  if (env.TAVILY_API_KEY) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env.TAVILY_API_KEY}` },
        body: JSON.stringify({ query, max_results: 6, search_depth: "basic" }),
      });
      if (res.ok) {
        const data: any = await res.json();
        const out = (data.results ?? []).map((r: any) => ({
          title: r.title,
          url: r.url,
          snippet: String(r.content ?? "").slice(0, 500),
        }));
        if (out.length) return out;
      }
    } catch (e) {
      console.warn("tavily failed", e);
    }
  }
  if (env.JINA_API_KEY) {
    try {
      const res = await fetch(`https://s.jina.ai/?q=${encodeURIComponent(query)}`, {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${env.JINA_API_KEY}`,
          "x-respond-with": "no-content",
        },
      });
      if (res.ok) {
        const data: any = await res.json();
        const out = (data.data ?? []).slice(0, 8).map((r: any) => ({
          title: r.title,
          url: r.url,
          snippet: String(r.description ?? r.content ?? "").slice(0, 500),
        }));
        if (out.length) return out;
      }
    } catch (e) {
      console.warn("jina search failed", e);
    }
  }
  const ddg = await duckDuckGo(query).catch(() => []);
  if (!ddg.length && !env.TAVILY_API_KEY && !env.JINA_API_KEY) {
    throw new Error(
      "Web search isn't set up on this server (no free TAVILY_API_KEY or JINA_API_KEY). Tell the users search is unavailable and answer from your own knowledge, noting it may be out of date.",
    );
  }
  return ddg;
}

async function duckDuckGo(query: string): Promise<SearchResult[]> {
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "Mozilla/5.0 (compatible; HuddleBot/0.1)",
    },
    body: new URLSearchParams({ q: query }).toString(),
  });
  const html = await res.text();
  const out: SearchResult[] = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 8) {
    let url = m[1];
    const uddg = url.match(/[?&]uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (url.startsWith("//")) url = "https:" + url;
    if (/duckduckgo\.com\/y\.js/.test(url)) continue; // ads
    out.push({ title: stripTags(m[2]), url, snippet: stripTags(m[3]) });
  }
  return out;
}

/**
 * Read a page as clean text: Jina Reader (free, no key) → direct fetch fallback.
 * Throws if the page doesn't exist (404 etc.) so callers never treat it as a source.
 */
export async function fetchReadable(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, { headers: { accept: "text/plain" } });
    if (res.ok) {
      const text = await res.text();
      // Jina returns 200 with a warning line when the target page itself errored.
      const upstream = text.match(/Target URL returned error (\d{3})/i);
      if (upstream && Number(upstream[1]) >= 400) throw new Error(`HTTP ${upstream[1]}`);
      if (text.trim().length > 200) return text;
    }
  } catch (e) {
    if (/^Error: HTTP \d{3}$/.test(String(e))) throw e;
    console.warn("jina failed", e);
  }
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; HuddleBot/0.1)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(nav|footer|header)[\s\S]*?<\/\1>/gi, "");
  return stripTags(body).replace(/\s{2,}/g, " ").trim();
}

function stripTags(s: string) {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
