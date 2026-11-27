import { alertDialog, confirmDialog } from "./Dialogs";
import { AlignCenter, AlignLeft, AlignRight, BarChart3, Bold, Columns3, Download, Italic, LineChart, PieChart, Rows3, Upload } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorProps } from "./FilePanel";
import { useYObserve, usePeers } from "../lib/useYDoc";
import { colName, evaluateSheet, formatValue, isError, parseRef, refName, type Result } from "../../shared/formula";
import { cellsOf, metaOf, parseCsv, rawValues, setCell, setRange, sheetSize, toCsv, type Cell, type Chart, MAX_COLS, MAX_ROWS } from "../../shared/sheet-model";
import { download, safeName } from "../lib/download";

const ChartView = lazy(() => import("./SheetChart"));

const ROW_H = 28;
const HEAD_W = 44;
const DEFAULT_W = 110;
const SWATCHES = ["", "#fef3c7", "#dcfce7", "#dbeafe", "#fce7f3", "#eef2ff", "#f4f4f5"];

interface Sel {
  c: number;
  r: number;
  c2: number;
  r2: number;
}
const norm = (s: Sel) => ({ c0: Math.min(s.c, s.c2), c1: Math.max(s.c, s.c2), r0: Math.min(s.r, s.r2), r1: Math.max(s.r, s.r2) });
const selRange = (s: Sel) => {
  const n = norm(s);
  return n.c0 === n.c1 && n.r0 === n.r1 ? refName(n.c0, n.r0) : `${refName(n.c0, n.r0)}:${refName(n.c1, n.r1)}`;
};

function TB({ on, active, title, children }: { on: () => void; active?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      className={`press flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg ${active ? "bg-surface-2 text-fg" : ""}`}
    >
      {children}
    </button>
  );
}

export default function SheetEditor({ ydoc, provider, file, me, synced }: EditorProps) {
  const cells = cellsOf(ydoc);
  const meta = metaOf(ydoc);
  useYObserve([cells, meta]);
  const peers = usePeers(provider);

  const { rows, cols } = sheetSize(ydoc);
  const colW: Record<string, number> = meta.get("colW") ?? {};
  const charts: Chart[] = meta.get("charts") ?? [];
  const raw = rawValues(ydoc);
  const rawKey = JSON.stringify(raw);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const values = useMemo(() => evaluateSheet(raw), [rawKey]);

  const [sel, setSel] = useState<Sel>({ c: 0, r: 0, c2: 0, r2: 0 });
  const [editing, setEditing] = useState<string | null>(null); // text while editing the active cell
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const active = refName(sel.c, sel.r);
  const activeCell: Cell | undefined = cells.get(active);

  // Share which cell I'm on so others see my cursor.
  useEffect(() => {
    provider.awareness.setLocalStateField("sheetSel", { cell: active, range: selRange(sel) });
  }, [provider, active, sel]);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const widthOf = (c: number) => colW[colName(c)] ?? DEFAULT_W;
  const colLeft = useMemo(() => {
    const out = [HEAD_W];
    for (let c = 0; c < cols; c++) out.push(out[c] + (colW[colName(c)] ?? DEFAULT_W));
    return out;
  }, [cols, JSON.stringify(colW)]);

  const firstRow = Math.max(0, Math.floor(scrollTop / ROW_H) - 5);
  const lastRow = Math.min(rows - 1, Math.ceil((scrollTop + viewH) / ROW_H) + 5);

  const transact = (fn: () => void) => ydoc.transact(fn, "user");

  const commit = useCallback(
    (text: string | null, move?: { dc: number; dr: number }) => {
      if (text !== null && text !== (cells.get(active)?.v ?? "")) transact(() => setCell(ydoc, active, text));
      setEditing(null);
      if (move) {
        const c = Math.max(0, Math.min(cols - 1, sel.c + move.dc));
        const r = Math.max(0, Math.min(rows - 1, sel.r + move.dr));
        setSel({ c, r, c2: c, r2: r });
      }
      gridRef.current?.focus();
    },
    [active, cells, cols, rows, sel.c, sel.r, ydoc],
  );

  const forEachSelected = (fn: (name: string) => void) => {
    const n = norm(sel);
    for (let r = n.r0; r <= n.r1; r++) for (let c = n.c0; c <= n.c1; c++) fn(refName(c, r));
  };

  const formatSel = (patch: Partial<Cell>) =>
    transact(() =>
      forEachSelected((name) => {
        const next: Cell = { v: "", ...cells.get(name), ...patch };
        for (const k of Object.keys(patch) as (keyof Cell)[]) if (patch[k] === undefined || patch[k] === "") delete next[k];
        cells.set(name, next);
      }),
    );

  const clearSel = () => transact(() => forEachSelected((name) => cells.delete(name)));

  const copySel = async () => {
    const n = norm(sel);
    const lines: string[] = [];
    for (let r = n.r0; r <= n.r1; r++) {
      const row: string[] = [];
      for (let c = n.c0; c <= n.c1; c++) row.push(formatValue(values[refName(c, r)] ?? null, cells.get(refName(c, r))?.fmt));
      lines.push(row.join("\t"));
    }
    await navigator.clipboard.writeText(lines.join("\n"));
  };

  const pasteText = (text: string) => {
    const rows2 = text.includes("\t") || !text.includes(",") ? text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((l) => l.split("\t")) : parseCsv(text);
    transact(() => setRange(ydoc, active, rows2));
  };

  const move = (dc: number, dr: number, extend: boolean) => {
    const c = Math.max(0, Math.min(cols - 1, (extend ? sel.c2 : sel.c) + dc));
    const r = Math.max(0, Math.min(rows - 1, (extend ? sel.r2 : sel.r) + dr));
    setSel(extend ? { ...sel, c2: c, r2: r } : { c, r, c2: c, r2: r });
    // keep the active row in view
    const el = gridRef.current;
    if (el) {
      const top = r * ROW_H;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (top + ROW_H * 2 > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H * 2 - el.clientHeight;
    }
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    if (editing !== null) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "b") return e.preventDefault(), formatSel({ b: !activeCell?.b || undefined });
    if (mod && e.key.toLowerCase() === "i") return e.preventDefault(), formatSel({ i: !activeCell?.i || undefined });
    if (mod && e.key.toLowerCase() === "c") return void copySel();
    if (mod) return; // let paste etc. through
    switch (e.key) {
      case "ArrowUp":
        return e.preventDefault(), move(0, -1, e.shiftKey);
      case "ArrowDown":
        return e.preventDefault(), move(0, 1, e.shiftKey);
      case "ArrowLeft":
        return e.preventDefault(), move(-1, 0, e.shiftKey);
      case "ArrowRight":
        return e.preventDefault(), move(1, 0, e.shiftKey);
      case "Tab":
        return e.preventDefault(), move(e.shiftKey ? -1 : 1, 0, false);
      case "Enter":
        return e.preventDefault(), setEditing(activeCell?.v ?? "");
      case "F2":
        return e.preventDefault(), setEditing(activeCell?.v ?? "");
      case "Delete":
      case "Backspace":
        return e.preventDefault(), clearSel();
    }
    if (e.key.length === 1 && !e.altKey) {
      e.preventDefault();
      setEditing(e.key);
    }
  };

  const peerByCell = new Map<string, { name: string; color: string }>();
  for (const p of peers) if (p.state?.sheetSel?.cell && p.state?.user) peerByCell.set(p.state.sheetSel.cell, p.state.user);

  const exportCsv = () => {
    const used = Object.keys(raw);
    let maxR = 0;
    let maxC = 0;
    for (const n of used) {
      const p = parseRef(n)!;
      maxR = Math.max(maxR, p.row);
      maxC = Math.max(maxC, p.col);
    }
    const out: string[][] = [];
    for (let r = 0; r <= maxR; r++) {
      const row: string[] = [];
      for (let c = 0; c <= maxC; c++) row.push(formatValue(values[refName(c, r)] ?? null));
      out.push(row);
    }
    download(`${safeName(file.title, "sheet")}.csv`, "text/csv", toCsv(out));
  };

  const exportXlsx = async () => {
    const { default: writeXlsxFile } = await import("write-excel-file/browser");
    let maxR = 0;
    let maxC = 0;
    for (const n of Object.keys(raw)) {
      const p = parseRef(n)!;
      maxR = Math.max(maxR, p.row);
      maxC = Math.max(maxC, p.col);
    }
    const data = [];
    for (let r = 0; r <= maxR; r++) {
      const row = [];
      for (let c = 0; c <= maxC; c++) {
        const name = refName(c, r);
        const v = values[name];
        const cell = cells.get(name);
        const value = v === undefined || v === null || isError(v) ? (isError(v) ? v.error : null) : v;
        row.push(
          value === null
            ? null
            : {
                value,
                fontWeight: cell?.b ? ("bold" as const) : undefined,
                fontStyle: cell?.i ? ("italic" as const) : undefined,
                align: cell?.a === "c" ? ("center" as const) : cell?.a === "r" ? ("right" as const) : undefined,
                backgroundColor: cell?.bg,
                format: typeof value === "number" ? (cell?.fmt === "cur" ? "$#,##0.00" : cell?.fmt === "pct" ? "0.00%" : cell?.fmt === "num" ? "#,##0.00" : undefined) : undefined,
              },
        );
      }
      data.push(row);
    }
    await writeXlsxFile(data as any, { columns: Array.from({ length: maxC + 1 }, (_, c) => ({ width: Math.round(widthOf(c) / 7) })) } as any).toFile(
      `${safeName(file.title, "sheet")}.xlsx`,
    );
  };

  const importCsv = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv,text/plain";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      if (f.size > 2_000_000) return void alertDialog({ title: "That file is too big", message: "CSV files can be up to 2 MB." });
      const rows2 = parseCsv(await f.text());
      if (cells.size && !(await confirmDialog({ title: "Replace the current cells?", message: "Importing replaces everything in this sheet.", confirmLabel: "Import" }))) return;
      transact(() => {
        cells.clear();
        setRange(ydoc, "A1", rows2);
      });
    };
    input.click();
  };

  const addChart = (type: Chart["type"]) => {
    const n = norm(sel);
    if (n.r0 === n.r1 && n.c0 === n.c1)
      return void alertDialog({ title: "Select the data first", message: "Select the labels in the first column and the numbers next to them, then add a chart." });
    meta.set("charts", [...charts, { id: Math.random().toString(36).slice(2, 10), type, range: selRange(sel) }].slice(-10));
  };

  const startResize = (c: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widthOf(c);
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(40, Math.min(600, startW + ev.clientX - startX));
      meta.set("colW", { ...(meta.get("colW") ?? {}), [colName(c)]: w });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const n = norm(sel);
  const totalW = colLeft[cols];
  const selStats = (() => {
    if (n.r0 === n.r1 && n.c0 === n.c1) return null;
    let sum = 0;
    let count = 0;
    forEachSelected((name) => {
      const v = values[name];
      if (typeof v === "number") (sum += v), count++;
    });
    return count ? `Sum ${formatValue(sum)} · Avg ${formatValue(sum / count)} · Count ${count}` : null;
  })();

  const renderCell = (c: number, r: number) => {
    const name = refName(c, r);
    const cell = cells.get(name);
    const v: Result | undefined = values[name];
    const isActive = c === sel.c && r === sel.r;
    const inSel = c >= n.c0 && c <= n.c1 && r >= n.r0 && r <= n.r1;
    const peer = peerByCell.get(name);
    const text = v === undefined ? "" : formatValue(v, cell?.fmt);
    const numeric = typeof v === "number";
    const align = cell?.a === "c" ? "center" : cell?.a === "r" ? "right" : cell?.a === "l" ? "left" : numeric ? "right" : "left";
    return (
      <div
        key={name}
        role="gridcell"
        aria-selected={inSel}
        data-cell={name}
        className={`absolute truncate border-b border-r border-line px-1.5 text-sm leading-[27px]  ${isError(v) ? "text-red-600" : ""} ${inSel && !isActive ? "bg-surface-2 " : ""}`}
        style={{
          top: r * ROW_H,
          left: colLeft[c],
          width: widthOf(c),
          height: ROW_H,
          textAlign: align,
          fontWeight: cell?.b ? 600 : undefined,
          fontStyle: cell?.i ? "italic" : undefined,
          background: inSel && !isActive ? undefined : cell?.bg || undefined,
          // Fills are light pastels, so keep text dark on them in dark mode too.
          color: cell?.bg && !(inSel && !isActive) && !isError(v) ? "#18181b" : undefined,
          outline: isActive ? "2px solid var(--fg)" : peer ? `2px solid ${peer.color}` : undefined,
          outlineOffset: -1,
          zIndex: isActive || peer ? 2 : undefined,
        }}
        onMouseDown={(e) => {
          if (editing !== null) commit(editing);
          dragging.current = true;
          setSel(e.shiftKey ? { ...sel, c2: c, r2: r } : { c, r, c2: c, r2: r });
        }}
        onMouseEnter={() => dragging.current && setSel((s) => ({ ...s, c2: c, r2: r }))}
        onDoubleClick={() => setEditing(cell?.v ?? "")}
        title={isError(v) ? `${v.error} in ${cell?.v}` : undefined}
      >
        {isActive && editing !== null ? (
          <input
            autoFocus
            aria-label={`Edit ${name}`}
            className="absolute inset-0 z-10 w-full bg-surface px-1.5 text-sm outline-none "
            value={editing}
            onChange={(e) => setEditing(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.preventDefault(), commit(editing, { dc: 0, dr: e.shiftKey ? -1 : 1 }));
              else if (e.key === "Tab") (e.preventDefault(), commit(editing, { dc: e.shiftKey ? -1 : 1, dr: 0 }));
              else if (e.key === "Escape") (e.preventDefault(), commit(null));
            }}
            onBlur={() => editing !== null && commit(editing)}
          />
        ) : (
          text
        )}
        {peer && !isActive && (
          <span className="pointer-events-none absolute -top-3.5 right-0 rounded-sm px-1 text-[10px] leading-tight text-white" style={{ background: peer.color }}>
            {peer.name}
          </span>
        )}
      </div>
    );
  };

  useEffect(() => {
    const up = () => (dragging.current = false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="sheet-editor">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1 text-xs text-fg-muted ">
        <span>{synced ? "Saves as you type" : "Connecting…"}</span>
        <span className="flex gap-2">
          <button className="inline-flex items-center gap-1 hover:text-fg" onClick={importCsv}><Upload className="h-3.5 w-3.5" /> Import CSV</button>
          <button className="inline-flex items-center gap-1 hover:text-fg" onClick={exportCsv}><Download className="h-3.5 w-3.5" /> CSV</button>
          <button className="inline-flex items-center gap-1 hover:text-fg" onClick={exportXlsx}><Download className="h-3.5 w-3.5" /> Excel</button>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-2 py-1 " role="toolbar" aria-label="Sheet formatting">
        <TB title="Bold (Ctrl+B)" active={!!activeCell?.b} on={() => formatSel({ b: !activeCell?.b || undefined })}><Bold className="h-4 w-4" /></TB>
        <TB title="Italic (Ctrl+I)" active={!!activeCell?.i} on={() => formatSel({ i: !activeCell?.i || undefined })}><Italic className="h-4 w-4" /></TB>
        <span className="mx-1 h-5 w-px bg-surface-2" />
        <TB title="Align left" active={activeCell?.a === "l"} on={() => formatSel({ a: "l" })}><AlignLeft className="h-4 w-4" /></TB>
        <TB title="Align center" active={activeCell?.a === "c"} on={() => formatSel({ a: "c" })}><AlignCenter className="h-4 w-4" /></TB>
        <TB title="Align right" active={activeCell?.a === "r"} on={() => formatSel({ a: "r" })}><AlignRight className="h-4 w-4" /></TB>
        <span className="mx-1 h-5 w-px bg-surface-2" />
        <select
          aria-label="Number format"
          className="rounded border border-line bg-transparent px-1 py-0.5 text-sm "
          value={activeCell?.fmt ?? ""}
          onChange={(e) => formatSel({ fmt: (e.target.value || undefined) as Cell["fmt"] })}
        >
          <option value="">Auto</option>
          <option value="num">1,234.56</option>
          <option value="int">1,235</option>
          <option value="cur">$1,234.56</option>
          <option value="pct">12.3%</option>
        </select>
        <span className="ml-1 flex gap-0.5" aria-label="Fill color">
          {SWATCHES.map((s) => (
            <button
              key={s || "none"}
              title={s ? `Fill ${s}` : "No fill"}
              aria-label={s ? `Fill ${s}` : "No fill"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => formatSel({ bg: s || undefined })}
              className="h-5 w-5 rounded border border-line-strong"
              style={{ background: s || "transparent", backgroundImage: s ? undefined : "linear-gradient(135deg,transparent 45%,#ef4444 45%,#ef4444 55%,transparent 55%)" }}
            />
          ))}
        </span>
        <span className="mx-1 h-5 w-px bg-surface-2" />
        <TB title="Add 10 rows" on={() => meta.set("rows", Math.min(MAX_ROWS, rows + 10))}><span className="inline-flex items-center gap-1"><Rows3 className="h-4 w-4" /> Rows</span></TB>
        <TB title="Add a column" on={() => meta.set("cols", Math.min(MAX_COLS, cols + 1))}><span className="inline-flex items-center gap-1"><Columns3 className="h-4 w-4" /> Column</span></TB>
        <span className="mx-1 h-5 w-px bg-surface-2" />
        <TB title="Bar chart from selection" on={() => addChart("bar")}><span className="inline-flex items-center gap-1"><BarChart3 className="h-4 w-4" /> Chart</span></TB>
        <TB title="Line chart from selection" on={() => addChart("line")}><LineChart className="h-4 w-4" /></TB>
        <TB title="Pie chart from selection" on={() => addChart("pie")}><PieChart className="h-4 w-4" /></TB>
      </div>
      <div className="flex items-center gap-2 border-b border-line px-2 py-1 ">
        <span className="w-16 shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-center font-mono text-xs " data-testid="active-ref">
          {selRange(sel)}
        </span>
        <span className="text-xs italic text-fg-subtle">fx</span>
        <input
          aria-label="Formula bar"
          data-testid="formula-bar"
          className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none"
          value={editing ?? activeCell?.v ?? ""}
          placeholder="Type a value or =formula"
          onFocus={() => editing === null && setEditing(activeCell?.v ?? "")}
          onChange={(e) => setEditing(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.preventDefault(), commit(editing, { dc: 0, dr: 1 }));
            if (e.key === "Escape") (e.preventDefault(), commit(null));
          }}
        />
      </div>
      <div
        ref={gridRef}
        tabIndex={0}
        role="grid"
        aria-label={`${file.title} cells`}
        aria-rowcount={rows}
        aria-colcount={cols}
        className="relative min-h-0 flex-1 overflow-auto outline-none"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onKeyDown={onGridKey}
        onPaste={(e) => {
          if (editing !== null) return;
          e.preventDefault();
          pasteText(e.clipboardData.getData("text/plain"));
        }}
      >
        <div style={{ width: totalW, height: (rows + 1) * ROW_H, position: "relative" }}>
          {/* column headers */}
          <div className="sticky top-0 z-20" style={{ height: ROW_H, width: totalW }}>
            <div className="absolute left-0 top-0 z-30 border-b border-r border-line bg-surface-2" style={{ width: HEAD_W, height: ROW_H, position: "sticky" }} />
            {Array.from({ length: cols }, (_, c) => (
              <div
                key={c}
                className={`absolute top-0 select-none border-b border-r border-line bg-surface-2 text-center text-xs leading-[27px] text-fg-muted   ${c >= n.c0 && c <= n.c1 ? "bg-surface-2 text-fg" : ""}`}
                style={{ left: colLeft[c], width: widthOf(c), height: ROW_H }}
                onMouseDown={() => setSel({ c, r: 0, c2: c, r2: rows - 1 })}
              >
                {colName(c)}
                <span className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize" onMouseDown={(e) => startResize(c, e)} aria-hidden />
              </div>
            ))}
          </div>
          {/* rows (only the visible window is rendered) */}
          <div className="absolute left-0" style={{ top: ROW_H, width: totalW }}>
            {Array.from({ length: lastRow - firstRow + 1 }, (_, i) => firstRow + i).map((r) => (
              <div key={r}>
                <div
                  className={`sticky left-0 z-10 select-none border-b border-r border-line bg-surface-2 text-center text-xs leading-[27px] text-fg-muted   ${r >= n.r0 && r <= n.r1 ? "bg-surface-2 text-fg" : ""}`}
                  style={{ position: "absolute", top: r * ROW_H, width: HEAD_W, height: ROW_H }}
                  onMouseDown={() => setSel({ c: 0, r, c2: cols - 1, r2: r })}
                >
                  {r + 1}
                </div>
                {Array.from({ length: cols }, (_, c) => renderCell(c, r))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-line px-3 py-1 text-xs text-fg-muted ">
        <span>{selStats ?? `${rows} rows × ${cols} columns`}</span>
        <span className="flex-1" />
        {peers.filter((p) => p.state?.user && p.state?.sheetSel).map((p) => (
          <span key={p.clientId} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: p.state.user.color }} />
            {p.state.user.name} · {p.state.sheetSel.range}
          </span>
        ))}
      </div>
      {charts.length > 0 && (
        <div className="max-h-[45%] shrink-0 overflow-y-auto border-t border-line p-3 " data-testid="sheet-charts">
          <Suspense fallback={<div className="text-sm text-fg-muted">Loading charts…</div>}>
            <div className="grid gap-3 md:grid-cols-2">
              {charts.map((ch) => (
                <ChartView
                  key={ch.id}
                  chart={ch}
                  values={values}
                  onRemove={() => meta.set("charts", charts.filter((x) => x.id !== ch.id))}
                />
              ))}
            </div>
          </Suspense>
        </div>
      )}
      <span className="sr-only" aria-live="polite">{me.name}</span>
    </div>
  );
}
