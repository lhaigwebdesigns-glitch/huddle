/**
 * A small spreadsheet formula engine shared by the Sheets editor (browser) and the AI
 * tools (server). Supports A1 refs, ranges, + - * / ^ & % comparisons, and common
 * functions. Errors follow spreadsheet conventions (#DIV/0!, #REF!, #NAME?, #VALUE!, #CIRC!).
 */

export type Value = number | string | boolean | null;
export interface CellError {
  error: string;
}
export type Result = Value | CellError;

export const isError = (v: unknown): v is CellError => typeof v === "object" && v !== null && "error" in v;

// ---------- addresses ----------

export function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export function colIndex(name: string): number {
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function parseRef(ref: string): { col: number; row: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,6})$/.exec(ref.trim());
  if (!m) return null;
  return { col: colIndex(m[1]), row: Number(m[2]) - 1 };
}

export const refName = (col: number, row: number) => `${colName(col)}${row + 1}`;

/** All cell names in a range like "A1:C3" (or a single cell). */
export function expandRange(range: string): string[] {
  const [a, b = a] = range.split(":");
  const p = parseRef(a);
  const q = parseRef(b);
  if (!p || !q) return [];
  const out: string[] = [];
  for (let r = Math.min(p.row, q.row); r <= Math.max(p.row, q.row); r++)
    for (let c = Math.min(p.col, q.col); c <= Math.max(p.col, q.col); c++) out.push(refName(c, r));
  return out;
}

/** Rows of cell names for a range (for tables, CSV and charts). */
export function rangeRows(range: string): string[][] {
  const [a, b = a] = range.split(":");
  const p = parseRef(a);
  const q = parseRef(b);
  if (!p || !q) return [];
  const rows: string[][] = [];
  for (let r = Math.min(p.row, q.row); r <= Math.max(p.row, q.row); r++) {
    const row: string[] = [];
    for (let c = Math.min(p.col, q.col); c <= Math.max(p.col, q.col); c++) row.push(refName(c, r));
    rows.push(row);
  }
  return rows;
}

// ---------- tokenizer ----------

type Tok =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "ref"; v: string }
  | { t: "range"; v: string }
  | { t: "name"; v: string }
  | { t: "op"; v: string }
  | { t: "("; v: "(" }
  | { t: ")"; v: ")" }
  | { t: ","; v: "," };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let s = "";
      while (j < src.length) {
        if (src[j] === '"' && src[j + 1] === '"') (s += '"'), (j += 2);
        else if (src[j] === '"') break;
        else s += src[j++];
      }
      if (j >= src.length) throw new Error("#VALUE!");
      out.push({ t: "str", v: s });
      i = j + 1;
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (num) {
      out.push({ t: "num", v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const range = /^\$?[A-Za-z]{1,3}\$?\d{1,6}:\$?[A-Za-z]{1,3}\$?\d{1,6}/.exec(src.slice(i));
    if (range) {
      out.push({ t: "range", v: range[0].replace(/\$/g, "").toUpperCase() });
      i += range[0].length;
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_.$]*/.exec(src.slice(i));
    if (word) {
      const w = word[0];
      const up = w.toUpperCase();
      if (src[i + w.length] !== "(" && /^\$?[A-Z]{1,3}\$?\d{1,6}$/.test(up)) out.push({ t: "ref", v: up.replace(/\$/g, "") });
      else if (up === "TRUE" || up === "FALSE") out.push({ t: "bool", v: up === "TRUE" });
      else out.push({ t: "name", v: up });
      i += w.length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "<>") {
      out.push({ t: "op", v: two });
      i += 2;
      continue;
    }
    if ("+-*/^&=<>%".includes(ch)) {
      out.push({ t: "op", v: ch });
      i++;
      continue;
    }
    if (ch === "(" || ch === ")" || ch === ",") {
      out.push({ t: ch, v: ch } as Tok);
      i++;
      continue;
    }
    if (ch === ";") {
      out.push({ t: ",", v: "," });
      i++;
      continue;
    }
    throw new Error("#NAME?");
  }
  return out;
}

// ---------- parser (precedence climbing) ----------

type Node =
  | { k: "lit"; v: Value }
  | { k: "ref"; v: string }
  | { k: "range"; v: string }
  | { k: "un"; op: string; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "pct"; a: Node }
  | { k: "call"; name: string; args: Node[] };

const PREC: Record<string, number> = { "=": 1, "<>": 1, "<": 1, ">": 1, "<=": 1, ">=": 1, "&": 2, "+": 3, "-": 3, "*": 4, "/": 4, "^": 5 };

function parse(toks: Tok[]): Node {
  let p = 0;
  const peek = () => toks[p];
  const expr = (minPrec: number): Node => {
    let left = unary();
    for (;;) {
      const t = peek();
      if (!t || t.t !== "op" || PREC[t.v] === undefined || PREC[t.v] < minPrec) break;
      p++;
      const prec = PREC[t.v];
      const right = expr(t.v === "^" ? prec : prec + 1);
      left = { k: "bin", op: t.v, a: left, b: right };
    }
    return left;
  };
  const unary = (): Node => {
    const t = peek();
    if (t?.t === "op" && (t.v === "-" || t.v === "+")) {
      p++;
      return { k: "un", op: t.v, a: unary() };
    }
    return postfix();
  };
  const postfix = (): Node => {
    let n = primary();
    while (peek()?.t === "op" && peek()!.v === "%") {
      p++;
      n = { k: "pct", a: n };
    }
    return n;
  };
  const primary = (): Node => {
    const t = toks[p++];
    if (!t) throw new Error("#VALUE!");
    switch (t.t) {
      case "num":
        return { k: "lit", v: t.v };
      case "str":
        return { k: "lit", v: t.v };
      case "bool":
        return { k: "lit", v: t.v };
      case "ref":
        return { k: "ref", v: t.v };
      case "range":
        return { k: "range", v: t.v };
      case "(": {
        const e = expr(0);
        if (toks[p++]?.t !== ")") throw new Error("#VALUE!");
        return e;
      }
      case "name": {
        if (toks[p]?.t !== "(") throw new Error("#NAME?");
        p++;
        const args: Node[] = [];
        if (toks[p]?.t !== ")") {
          for (;;) {
            args.push(expr(0));
            if (toks[p]?.t === ",") p++;
            else break;
          }
        }
        if (toks[p++]?.t !== ")") throw new Error("#VALUE!");
        return { k: "call", name: t.v, args };
      }
      default:
        throw new Error("#VALUE!");
    }
  };
  const n = expr(0);
  if (p !== toks.length) throw new Error("#VALUE!");
  return n;
}

// ---------- evaluation ----------

class FErr extends Error {}
const fail = (code: string): never => {
  throw new FErr(code);
};

function toNum(v: Value): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === null || v === "") return 0;
  const n = Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : fail("#VALUE!");
}
const toStr = (v: Value) => (v === null ? "" : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v));
const toBool = (v: Value) => (typeof v === "string" ? v.toUpperCase() === "TRUE" || (v !== "" && v !== "0") : !!v);

type Arg = Value | Value[];
const flat = (args: Arg[]) => args.flatMap((a) => (Array.isArray(a) ? a : [a]));
const nums = (args: Arg[]) =>
  args.flatMap((a) => (Array.isArray(a) ? a.filter((v): v is number => typeof v === "number") : [toNum(a)]));

const FUNCS: Record<string, (args: Arg[]) => Value> = {
  SUM: (a) => nums(a).reduce((x, y) => x + y, 0),
  AVERAGE: (a) => {
    const n = nums(a);
    return n.length ? n.reduce((x, y) => x + y, 0) / n.length : fail("#DIV/0!");
  },
  AVG: (a) => FUNCS.AVERAGE(a),
  MIN: (a) => (nums(a).length ? Math.min(...nums(a)) : 0),
  MAX: (a) => (nums(a).length ? Math.max(...nums(a)) : 0),
  COUNT: (a) => nums(a).length,
  COUNTA: (a) => flat(a).filter((v) => v !== null && v !== "").length,
  COUNTBLANK: (a) => flat(a).filter((v) => v === null || v === "").length,
  PRODUCT: (a) => nums(a).reduce((x, y) => x * y, 1),
  MEDIAN: (a) => {
    const n = nums(a).sort((x, y) => x - y);
    if (!n.length) return fail("#NUM!");
    const m = Math.floor(n.length / 2);
    return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2;
  },
  ROUND: ([v, d]) => {
    const f = 10 ** toNum((d as Value) ?? 0);
    return Math.round(toNum(v as Value) * f) / f;
  },
  ROUNDUP: ([v, d]) => {
    const f = 10 ** toNum((d as Value) ?? 0);
    const x = toNum(v as Value);
    return (Math.sign(x) * Math.ceil(Math.abs(x) * f)) / f;
  },
  ROUNDDOWN: ([v, d]) => {
    const f = 10 ** toNum((d as Value) ?? 0);
    const x = toNum(v as Value);
    return (Math.sign(x) * Math.floor(Math.abs(x) * f)) / f;
  },
  ABS: ([v]) => Math.abs(toNum(v as Value)),
  SQRT: ([v]) => (toNum(v as Value) < 0 ? fail("#NUM!") : Math.sqrt(toNum(v as Value))),
  POWER: ([a, b]) => toNum(a as Value) ** toNum(b as Value),
  MOD: ([a, b]) => (toNum(b as Value) === 0 ? fail("#DIV/0!") : toNum(a as Value) % toNum(b as Value)),
  INT: ([v]) => Math.floor(toNum(v as Value)),
  IF: ([c, a, b]) => (toBool(c as Value) ? ((a as Value) ?? true) : ((b as Value) ?? false)),
  AND: (a) => flat(a).every(toBool),
  OR: (a) => flat(a).some(toBool),
  NOT: ([v]) => !toBool(v as Value),
  CONCAT: (a) => flat(a).map(toStr).join(""),
  CONCATENATE: (a) => flat(a).map(toStr).join(""),
  LEN: ([v]) => toStr(v as Value).length,
  UPPER: ([v]) => toStr(v as Value).toUpperCase(),
  LOWER: ([v]) => toStr(v as Value).toLowerCase(),
  TRIM: ([v]) => toStr(v as Value).trim().replace(/\s+/g, " "),
  LEFT: ([v, n]) => toStr(v as Value).slice(0, toNum((n as Value) ?? 1)),
  RIGHT: ([v, n]) => toStr(v as Value).slice(-toNum((n as Value) ?? 1)),
  SUMIF: ([range, crit, sumRange]) => {
    const r = Array.isArray(range) ? range : [range];
    const s = Array.isArray(sumRange) ? sumRange : r;
    const test = criterion(crit as Value);
    return r.reduce<number>((acc, v, i) => (test(v) ? acc + (typeof s[i] === "number" ? (s[i] as number) : 0) : acc), 0);
  },
  COUNTIF: ([range, crit]) => {
    const test = criterion(crit as Value);
    return (Array.isArray(range) ? range : [range]).filter(test).length;
  },
  TODAY: () => new Date().toISOString().slice(0, 10),
  PI: () => Math.PI,
};

/** Spreadsheet-style criteria: ">10", "<=5", "<>x", "apples". */
function criterion(c: Value): (v: Value) => boolean {
  const s = toStr(c);
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(s)!;
  const op = m[1] ?? "=";
  const rhs = m[2];
  const rn = Number(rhs);
  const numeric = rhs !== "" && Number.isFinite(rn);
  return (v) => {
    const l = numeric ? (typeof v === "number" ? v : Number(v)) : toStr(v).toLowerCase();
    const r = numeric ? rn : rhs.toLowerCase();
    if (numeric && !Number.isFinite(l as number)) return op === "<>";
    switch (op) {
      case "<":
        return l < r;
      case ">":
        return l > r;
      case "<=":
        return l <= r;
      case ">=":
        return l >= r;
      case "<>":
        return l !== r;
      default:
        return l === r;
    }
  };
}

/** Turn a raw cell input into a literal value (numbers, booleans, percentages, text). */
export function literal(raw: string): Value {
  // A leading apostrophe forces text (as in Excel/Sheets): '007 or '=not a formula.
  if (raw.startsWith("'")) return raw.slice(1);
  const s = raw.trim();
  if (s === "") return null;
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return Number(s);
  if (/^[-+]?\$?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) || /^[-+]?\$\d+(\.\d+)?$/.test(s)) return Number(s.replace(/[$,]/g, ""));
  if (/^[-+]?\d+(\.\d+)?%$/.test(s)) return Number(s.slice(0, -1)) / 100;
  if (/^(true|false)$/i.test(s)) return s.toUpperCase() === "TRUE";
  return raw;
}

/**
 * Evaluate a whole sheet. `raw` maps cell names ("A1") to what the user typed.
 * Returns computed values for every non-empty cell.
 */
export function evaluateSheet(raw: Record<string, string>): Record<string, Result> {
  const cache = new Map<string, Result>();
  const visiting = new Set<string>();
  const parsed = new Map<string, Node | CellError>();

  const cell = (name: string): Result => {
    if (cache.has(name)) return cache.get(name)!;
    if (visiting.has(name)) return { error: "#CIRC!" };
    const src = raw[name];
    if (src === undefined || src === "") return null;
    if (!src.startsWith("=") || src.length === 1) {
      const v = literal(src);
      cache.set(name, v);
      return v;
    }
    visiting.add(name);
    let out: Result;
    try {
      let ast = parsed.get(name);
      if (!ast) {
        try {
          ast = parse(tokenize(src.slice(1)));
        } catch (e) {
          ast = { error: (e as Error).message.startsWith("#") ? (e as Error).message : "#VALUE!" };
        }
        parsed.set(name, ast);
      }
      out = isError(ast) ? ast : evalNode(ast);
    } catch (e) {
      out = { error: e instanceof FErr ? e.message : "#VALUE!" };
    }
    visiting.delete(name);
    cache.set(name, out);
    return out;
  };

  const unwrap = (r: Result): Value => (isError(r) ? fail(r.error) : r);

  const evalNode = (n: Node): Value => {
    switch (n.k) {
      case "lit":
        return n.v;
      case "ref": {
        if (!parseRef(n.v)) fail("#REF!");
        return unwrap(cell(n.v));
      }
      case "range":
        return fail("#VALUE!"); // a bare range outside a function
      case "un":
        return n.op === "-" ? -toNum(evalNode(n.a)) : toNum(evalNode(n.a));
      case "pct":
        return toNum(evalNode(n.a)) / 100;
      case "bin": {
        const a = evalNode(n.a);
        const b = evalNode(n.b);
        switch (n.op) {
          case "+":
            return toNum(a) + toNum(b);
          case "-":
            return toNum(a) - toNum(b);
          case "*":
            return toNum(a) * toNum(b);
          case "/":
            return toNum(b) === 0 ? fail("#DIV/0!") : toNum(a) / toNum(b);
          case "^":
            return toNum(a) ** toNum(b);
          case "&":
            return toStr(a) + toStr(b);
          default: {
            const cmp =
              typeof a === "number" && typeof b === "number" ? a - b : toStr(a).localeCompare(toStr(b), undefined, { sensitivity: "accent" });
            return n.op === "="
              ? cmp === 0
              : n.op === "<>"
                ? cmp !== 0
                : n.op === "<"
                  ? cmp < 0
                  : n.op === ">"
                    ? cmp > 0
                    : n.op === "<="
                      ? cmp <= 0
                      : cmp >= 0;
          }
        }
      }
      case "call": {
        if (n.name === "IFERROR") {
          try {
            return evalNode(n.args[0]);
          } catch (e) {
            if (e instanceof FErr) return n.args[1] ? evalNode(n.args[1]) : "";
            throw e;
          }
        }
        const f = FUNCS[n.name];
        if (!f) return fail("#NAME?");
        const args: Arg[] = n.args.map((a) =>
          a.k === "range" ? expandRange(a.v).map((name) => unwrap(cell(name))) : evalNode(a),
        );
        const v = f(args);
        if (typeof v === "number" && !Number.isFinite(v)) fail("#NUM!");
        return v;
      }
    }
  };

  const out: Record<string, Result> = {};
  for (const name of Object.keys(raw)) if (raw[name] !== "") out[name] = cell(name);
  return out;
}

/** Display text for a computed value with an optional number format. */
export function formatValue(v: Result, fmt?: string): string {
  if (isError(v)) return v.error;
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") {
    if (fmt === "cur") return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
    if (fmt === "pct") return `${(v * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
    if (fmt === "int") return Math.round(v).toLocaleString("en-US");
    if (fmt === "num") return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e10) / 1e10);
  }
  return v;
}
