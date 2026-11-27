import { useEffect, useRef } from "react";
import { Chart as ChartJS, registerables } from "chart.js";
import { formatValue, isError, rangeRows, type Result } from "../../shared/formula";
import type { Chart } from "../../shared/sheet-model";

ChartJS.register(...registerables);

const PALETTE = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#06b6d4", "#a855f7", "#84cc16", "#ec4899"];

/**
 * Data layout (like Google Sheets): first column = labels, other columns = series.
 * If the first row isn't numeric, it names the series.
 */
export function chartData(chart: Chart, values: Record<string, Result>) {
  const grid = rangeRows(chart.range).map((row) => row.map((n) => values[n] ?? null));
  const header = grid[0]?.slice(1).some((v) => typeof v !== "number" && v !== null) ? grid.shift()! : null;
  const labels = grid.map((row) => formatValue(row[0] as Result));
  const width = Math.max(0, (grid[0]?.length ?? 1) - 1);
  const series = Array.from({ length: width || 1 }, (_, i) => ({
    label: header ? formatValue(header[i + 1] as Result) : width ? `Series ${i + 1}` : "Values",
    data: grid.map((row) => {
      const v = width ? row[i + 1] : row[0];
      return typeof v === "number" && !isError(v) ? v : 0;
    }),
  }));
  return { labels: width ? labels : labels.map((_, i) => String(i + 1)), series };
}

export default function SheetChart({ chart, values, onRemove }: { chart: Chart; values: Record<string, Result>; onRemove: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const instance = useRef<ChartJS | null>(null);
  const { labels, series } = chartData(chart, values);
  const key = JSON.stringify([chart, labels, series]);

  useEffect(() => {
    if (!canvas.current) return;
    const dark = document.documentElement.classList.contains("dark");
    instance.current?.destroy();
    instance.current = new ChartJS(canvas.current, {
      type: chart.type,
      data: {
        labels,
        datasets: series.map((s, i) => ({
          label: s.label,
          data: s.data,
          backgroundColor: chart.type === "pie" ? labels.map((_, j) => PALETTE[j % PALETTE.length]) : PALETTE[i % PALETTE.length],
          borderColor: chart.type === "pie" ? (dark ? "#18181b" : "#fff") : PALETTE[i % PALETTE.length],
          tension: 0.3,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        color: dark ? "#d4d4d8" : "#3f3f46",
        plugins: {
          legend: { display: chart.type === "pie" || series.length > 1 },
          title: { display: !!chart.title, text: chart.title, color: dark ? "#e4e4e7" : "#18181b" },
        },
        scales:
          chart.type === "pie"
            ? {}
            : {
                x: { ticks: { color: dark ? "#a1a1aa" : "#52525b" }, grid: { color: dark ? "#27272a" : "#e4e4e7" } },
                y: { ticks: { color: dark ? "#a1a1aa" : "#52525b" }, grid: { color: dark ? "#27272a" : "#e4e4e7" } },
              },
      },
    });
    return () => {
      instance.current?.destroy();
      instance.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <figure className="rounded-lg border border-line p-2 " data-testid="sheet-chart">
      <div className="flex items-center justify-between text-xs text-fg-muted">
        <figcaption>
          {chart.title || `${chart.type[0].toUpperCase()}${chart.type.slice(1)} chart`} · {chart.range}
        </figcaption>
        <button onClick={onRemove} className="rounded px-1 hover:bg-surface-2" aria-label="Remove chart">
          ✕
        </button>
      </div>
      <div className="relative h-48">
        <canvas ref={canvas} role="img" aria-label={`${chart.type} chart of ${chart.range}`} />
      </div>
    </figure>
  );
}
