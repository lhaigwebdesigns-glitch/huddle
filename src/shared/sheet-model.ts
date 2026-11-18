import * as Y from "yjs";
import { colIndex, evaluateSheet, expandRange, formatValue, parseRef, rangeRows, refName } from "./formula";

/**
 * Sheet storage (shared by the editor and the AI tools):
 *   Y.Map "cells":     "A1" -> Cell
 *   Y.Map "sheetMeta": rows, cols, colW { A: 140 }, charts Chart[]
 */
export interface Cell {
  v: string; // what was typed: a literal or "=formula"
  b?: boolean;
  i?: boolean;
  a?: "l" | "c" | "r";
  bg?: string;
  fmt?: "num" | "cur" | "pct" | "int";
}

export interface Chart {
  id: string;
  type: "bar" | "line" | "pie";
  range: string;
  title?: string;
}

export const DEFAULT_ROWS = 50;
export const DEFAULT_COLS = 12;
export const MAX_ROWS = 2000;
export const MAX_COLS = 52;

export const cellsOf = (doc: Y.Doc) => doc.getMap<Cell>("cells");
export const metaOf = (doc: Y.Doc) => doc.getMap<any>("sheetMeta");

export function sheetSize(doc: Y.Doc) {
  const m = metaOf(doc);
  return { rows: Number(m.get("rows")) || DEFAULT_ROWS, cols: Number(m.get("cols")) || DEFAULT_COLS };
}

export function rawValues(doc: Y.Doc): Record<string, string> {
  const out: Record<string, string> = {};
  cellsOf(doc).forEach((c, k) => {
    if (c?.v !== undefined && c.v !== "") out[k] = c.v;
  });
  return out;
}

/** Make sure the grid is big enough to show a cell. */
function grow(doc: Y.Doc, name: string) {
  const r = parseRef(name);
  if (!r) return;
  const { rows, cols } = sheetSize(doc);
  const m = metaOf(doc);
  if (r.row + 1 > rows) m.set("rows", Math.min(MAX_ROWS, r.row + 11));
  if (r.col + 1 > cols) m.set("cols", Math.min(MAX_COLS, r.col + 2));
}

export function setCell(doc: Y.Doc, name: string, value: string) {
  const cells = cellsOf(doc);
  const prev = cells.get(name);
  if (!value && !(prev && (prev.b || prev.i || prev.a || prev.bg || prev.fmt))) cells.delete(name);
  else cells.set(name, { ...prev, v: value });
  grow(doc, name);
}

export function setRange(doc: Y.Doc, start: string, rows: unknown[][]) {
  const s = parseRef(start);
  if (!s) throw new Error(`Bad cell "${start}"`);
  rows.slice(0, MAX_ROWS).forEach((row, r) =>
    (Array.isArray(row) ? row : [row]).slice(0, MAX_COLS).forEach((v, c) => setCell(doc, refName(s.col + c, s.row + r), v === null || v === undefined ? "" : String(v))),
  );
}

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, newlines in quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  const s = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"' && cur === "") q = true;
    else if (ch === ",") row.push(cur), (cur = "");
    else if (ch === "\n") row.push(cur), rows.push(row), (row = []), (cur = "");
    else cur += ch;
  }
  if (cur !== "" || row.length) row.push(cur), rows.push(row);
  return rows;
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\n");
}

/** Smallest range covering every non-empty cell, e.g. "A1:D12" (or null if empty). */
export function usedRange(doc: Y.Doc): string | null {
  let maxR = -1;
  let maxC = -1;
  cellsOf(doc).forEach((c, k) => {
    if (!c?.v) return;
    const r = parseRef(k);
    if (r) (maxR = Math.max(maxR, r.row)), (maxC = Math.max(maxC, r.col));
  });
  return maxR < 0 ? null : `A1:${refName(maxC, maxR)}`;
}

/** Computed values of a range as CSV (what a person sees), plus the formulas behind them. */
export function readSheet(doc: Y.Doc, range?: string) {
  const r = range || usedRange(doc);
  if (!r) return { range: null, csv: "", formulas: [] as string[] };
  const raw = rawValues(doc);
  const values = evaluateSheet(raw);
  const cells = cellsOf(doc);
  const rows = rangeRows(r).map((row) => row.map((name) => formatValue(values[name] ?? null, cells.get(name)?.fmt)));
  const formulas = expandRange(r)
    .filter((n) => raw[n]?.startsWith("="))
    .map((n) => `${n}: ${raw[n]}`);
  return { range: r, csv: toCsv(rows), formulas };
}

export type SheetOp =
  | { op: "set"; cell: string; value: string | number }
  | { op: "set_range"; start: string; rows: unknown[][] }
  | { op: "format"; range: string; bold?: boolean; italic?: boolean; align?: "left" | "center" | "right"; bg?: string; format?: "number" | "currency" | "percent" | "integer" | "plain" }
  | { op: "clear"; range: string }
  | { op: "add_chart"; type: "bar" | "line" | "pie"; range: string; title?: string }
  | { op: "col_width"; col: string; width: number };

const FMT = { number: "num", currency: "cur", percent: "pct", integer: "int" } as const;

/** Apply AI (or importer) edits as one change. Throws with a readable message on bad input. */
export function applySheetOps(doc: Y.Doc, ops: SheetOp[]): string[] {
  const done: string[] = [];
  doc.transact(() => {
    for (const o of ops.slice(0, 500)) {
      switch (o.op) {
        case "set":
          if (!parseRef(o.cell)) throw new Error(`Bad cell "${o.cell}"`);
          setCell(doc, o.cell.toUpperCase(), String(o.value ?? ""));
          done.push(`set ${o.cell}`);
          break;
        case "set_range":
          setRange(doc, o.start.toUpperCase(), o.rows ?? []);
          done.push(`filled ${o.rows?.length ?? 0} rows from ${o.start}`);
          break;
        case "format": {
          const names = expandRange(o.range.toUpperCase());
          if (!names.length) throw new Error(`Bad range "${o.range}"`);
          const cells = cellsOf(doc);
          for (const n of names) {
            const c: Cell = { v: "", ...cells.get(n) };
            if (o.bold !== undefined) c.b = o.bold || undefined;
            if (o.italic !== undefined) c.i = o.italic || undefined;
            if (o.align) c.a = o.align === "left" ? "l" : o.align === "center" ? "c" : "r";
            if (o.bg !== undefined) c.bg = /^#[0-9a-f]{3,8}$/i.test(o.bg) ? o.bg : undefined;
            if (o.format) c.fmt = o.format === "plain" ? undefined : FMT[o.format];
            cells.set(n, JSON.parse(JSON.stringify(c)));
          }
          done.push(`formatted ${o.range}`);
          break;
        }
        case "clear":
          for (const n of expandRange(o.range.toUpperCase())) cellsOf(doc).delete(n);
          done.push(`cleared ${o.range}`);
          break;
        case "add_chart": {
          if (!expandRange(o.range.toUpperCase()).length) throw new Error(`Bad range "${o.range}"`);
          const charts: Chart[] = metaOf(doc).get("charts") ?? [];
          const type = ["bar", "line", "pie"].includes(o.type) ? o.type : "bar";
          metaOf(doc).set("charts", [...charts, { id: Math.random().toString(36).slice(2, 10), type, range: o.range.toUpperCase(), title: o.title?.slice(0, 120) }].slice(-10));
          done.push(`added a ${type} chart of ${o.range}`);
          break;
        }
        case "col_width": {
          const w = { ...(metaOf(doc).get("colW") ?? {}) };
          if (colIndex(o.col) < 0) throw new Error(`Bad column "${o.col}"`);
          w[o.col.toUpperCase()] = Math.max(40, Math.min(600, Number(o.width) || 120));
          metaOf(doc).set("colW", w);
          break;
        }
        default:
          throw new Error(`Unknown op ${(o as any).op}`);
      }
    }
  }, "ai");
  return done;
}
