import { getServerByName } from "partyserver";
import type { Env } from "../env";
import type { RoomFile, Source, Step } from "../../shared/protocol";
import type { ToolDef } from "./providers";
import { getSkill } from "./skills";

export interface ToolContext {
  env: Env;
  roomCode: string;
  files: () => RoomFile[];
  createFile: (kind: "doc", title: string) => RoomFile;
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
];

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
      const text = await fetchReadable(url);
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
      const file = ctx.files().find((f) => f.id === args.file_id);
      if (!file) return "No such file_id in this room.";
      ctx.step({ kind: "doc", label: `Reading “${file.title}”` });
      const stub = await getServerByName(ctx.env.Doc, `${ctx.roomCode}--${file.id}`);
      return (await stub.getMarkdown()) || "(empty document)";
    }
    case "edit_doc": {
      const file = ctx.files().find((f) => f.id === args.file_id);
      if (!file) return "No such file_id in this room.";
      const mode = args.mode === "append" ? "append" : "replace";
      ctx.step({ kind: "doc", label: `${mode === "append" ? "Adding to" : "Editing"} “${file.title}”` });
      const stub = await getServerByName(ctx.env.Doc, `${ctx.roomCode}--${file.id}`);
      await stub.setMarkdown(String(args.markdown ?? ""), mode);
      ctx.openFile(file.id);
      return `Updated "${file.title}".`;
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

/** Read a page as clean text: Jina Reader (free, no key) → direct fetch fallback. */
export async function fetchReadable(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, { headers: { accept: "text/plain" } });
    if (res.ok) {
      const text = await res.text();
      if (text.trim().length > 200) return text;
    }
  } catch (e) {
    console.warn("jina failed", e);
  }
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; HuddleBot/0.1)" } });
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
