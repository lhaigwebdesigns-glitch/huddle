import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Bot, Clock, DoorOpen, MessagesSquare, RefreshCw, UserPlus, Users } from "lucide-react";
import { curveMonotoneX } from "d3-shape";
import { LineChart } from "@/components/charts/line-chart";
import { Line } from "@/components/charts/line";
import { AreaChart, Area } from "@/components/charts/area-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { Bar } from "@/components/charts/bar";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { Grid } from "@/components/charts/grid";
import { XAxis } from "@/components/charts/x-axis";
import { ChartTooltip } from "@/components/charts/tooltip";
import { RingChart } from "@/components/charts/ring-chart";
import { Ring } from "@/components/charts/ring";
import { RingCenter } from "@/components/charts/ring-center";
import { AreaSparkline } from "@/components/charts/sparkline";
import {
  HeatmapCells,
  HeatmapChart,
  HeatmapInteractionBoundary,
  HeatmapInteractionProvider,
  HeatmapTooltip,
  HeatmapXAxis,
  HeatmapYAxis,
} from "@/components/charts/heatmap";
import type { Stats } from "../../server/stats";
import { FILE_INFO, isFileKind } from "../../shared/files";

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

const fmt = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : n.toLocaleString());
const sum = <T extends object>(rows: T[], key: keyof T & string) => rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);

/** % change vs the previous period; null when there's nothing to compare against. */
function delta(now: number, prev: number): number | null {
  if (!prev) return now ? null : 0;
  return Math.round(((now - prev) / prev) * 100);
}

function Card({ title, sub, children, className = "", action }: { title: string; sub?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`stagger rounded-2xl border border-line bg-surface p-5 ${className}`}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {sub && <p className="mt-0.5 text-xs text-fg-subtle">{sub}</p>}
        </div>
        {action}
      </header>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  change,
  spark,
  sparkKey,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  change: number | null;
  spark: { [k: string]: unknown }[];
  sparkKey: string;
  hint?: string;
}) {
  const up = (change ?? 0) >= 0;
  return (
    <div className="stagger flex flex-col rounded-2xl border border-line bg-surface p-4" data-testid="kpi">
      <div className="flex items-center gap-2 text-xs font-medium text-fg-muted">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="tabular text-[28px] font-semibold leading-none tracking-tight">{value}</span>
        {change !== null && (
          <span className={`inline-flex items-center text-xs font-medium ${up ? "text-[#1d7a3b] dark:text-mint" : "text-red-600 dark:text-red-400"}`}>
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(change)}%
          </span>
        )}
      </div>
      <p className="mt-1 h-4 text-xs text-fg-subtle">{hint}</p>
      <div className="mt-2 -mx-1">
        <AreaSparkline data={spark} dataKey={sparkKey} height={36} />
      </div>
    </div>
  );
}

/** Calendar shades from "no messages" to "busiest day", in the site's ink. */
const HEAT_LEVELS = [
  "var(--accent-soft)",
  "color-mix(in oklab, var(--fg) 25%, var(--bg))",
  "color-mix(in oklab, var(--fg) 45%, var(--bg))",
  "color-mix(in oklab, var(--fg) 70%, var(--bg))",
  "var(--fg)",
] as const;

const PROVIDER_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/** The admin's usage dashboard: who's using Cairn, how much, and how the AI is holding up. */
export function AdminAnalytics({ token }: { token: string }) {
  const [range, setRange] = useState<Range>(() => {
    try {
      return (Number(localStorage.getItem("huddle.admin.range")) as Range) || 30;
    } catch {
      return 30;
    }
  });
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async (days = range) => {
    setLoading(true);
    setErr("");
    const r = await fetch(`/api/admin/stats?days=${days}`, { headers: { "x-admin-token": token } }).catch(() => null);
    setLoading(false);
    if (!r?.ok) return setErr("Couldn't load usage numbers.");
    setStats((await r.json()) as Stats);
  };
  useEffect(() => {
    load(range);
    try {
      localStorage.setItem("huddle.admin.range", String(range));
    } catch {
      /* private mode */
    }
  }, [range, token]);

  const v = useMemo(() => {
    if (!stats) return null;
    const prev = stats.series.slice(0, stats.days);
    const now = stats.series.slice(stats.days).map((r) => ({ ...r, date: new Date(r.day + "T12:00:00") }));
    const ai = sum(now, "ai");
    const errors = sum(now, "aiErrors");
    const timed = now.filter((r) => r.aiSeconds > 0);
    // Busiest hours in the viewer's own time zone.
    const offset = -new Date().getTimezoneOffset() / 60;
    const hours = Array.from({ length: 24 }, (_, h) => ({ name: `${((h + 11) % 12) + 1}${h < 12 ? "a" : "p"}`, messages: 0 }));
    for (const c of stats.heat) hours[(((c.hour + Math.round(offset)) % 24) + 24) % 24].messages += c.n;
    const files = Object.entries(stats.files)
      .map(([k, n]) => ({ name: isFileKind(k) ? FILE_INFO[k].label : k, files: n }))
      .sort((a, b) => b.files - a.files);
    const providerTotal = stats.aiByProvider.reduce((a, p) => a + p.n, 0) || 1;
    const ring = stats.aiByProvider.filter((p) => p.n > 0).slice(0, 5).map((p, i) => ({
      label: p.provider === "Self-hosted" ? "Your PC" : p.provider,
      value: p.n,
      maxValue: providerTotal,
      color: PROVIDER_COLORS[i],
    }));
    // Activity calendar: full Sunday-to-Saturday weeks; cells take a level 0–4 (relative to the
    // busiest day) and the tooltip looks up the real count.
    const raw = new Map(stats.calendar.map((d) => [d.day, d.n]));
    const calMax = Math.max(1, ...stats.calendar.map((d) => d.n));
    const first = new Date(stats.calendar[0].day + "T12:00:00");
    first.setDate(first.getDate() - first.getDay());
    const last = new Date(stats.calendar[stats.calendar.length - 1].day + "T12:00:00");
    const weeks: { bin: number; bins: { bin: number; count: number; date: Date }[] }[] = [];
    for (const d = new Date(first); d <= last || d.getDay() !== 0; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0) weeks.push({ bin: weeks.length, bins: [] });
      const n = raw.get(d.toISOString().slice(0, 10)) ?? 0;
      weeks[weeks.length - 1].bins.push({ bin: d.getDay(), count: n ? Math.max(1, Math.ceil((n / calMax) * 4)) : 0, date: new Date(d) });
    }
    return {
      now,
      prev,
      ai,
      errorRate: ai + errors ? Math.round((errors / (ai + errors)) * 1000) / 10 : 0,
      avgSeconds: timed.length ? Math.round((sum(timed, "aiSeconds") / timed.length) * 10) / 10 : 0,
      hours,
      files,
      ring,
      weeks,
      raw,
      thumbs: stats.feedback,
    };
  }, [stats]);

  return (
    <div className="mt-6" data-testid="admin-analytics">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Usage</h2>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-full border border-line p-0.5" role="tablist" aria-label="Time range">
            {RANGES.map((d) => (
              <button
                key={d}
                role="tab"
                aria-selected={range === d}
                onClick={() => setRange(d)}
                className={`press rounded-full px-3 py-1 text-xs font-medium ${range === d ? "bg-primary text-primary-fg" : "text-fg-muted hover:text-fg"}`}
              >
                {d} days
              </button>
            ))}
          </div>
          <button onClick={() => load()} className="press rounded-full p-2 text-fg-muted hover:bg-accent-soft hover:text-fg" aria-label="Refresh usage">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      {!v && !err && <p className="mt-6 text-sm text-fg-muted">Loading usage…</p>}

      {v && stats && (
        <>
          {/* Headline numbers, each vs the previous period */}
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi icon={Users} label="Active people" value={fmt(stats.unique.now)} change={delta(stats.unique.now, stats.unique.prev)} spark={v.now} sparkKey="active" hint={`${fmt(stats.totals.people)} all time`} />
            <Kpi icon={UserPlus} label="New people" value={fmt(sum(v.now, "newPeople"))} change={delta(sum(v.now, "newPeople"), sum(v.prev, "newPeople"))} spark={v.now} sparkKey="newPeople" hint={`${fmt(sum(v.now, "signups"))} made accounts · ${fmt(stats.totals.accounts)} total`} />
            <Kpi icon={DoorOpen} label="Rooms started" value={fmt(sum(v.now, "rooms"))} change={delta(sum(v.now, "rooms"), sum(v.prev, "rooms"))} spark={v.now} sparkKey="rooms" hint={`${fmt(sum(v.now, "joins"))} joins`} />
            <Kpi icon={MessagesSquare} label="Messages" value={fmt(sum(v.now, "messages"))} change={delta(sum(v.now, "messages"), sum(v.prev, "messages"))} spark={v.now} sparkKey="messages" hint={`${fmt(stats.totals.messages)} all time`} />
            <Kpi icon={Bot} label="AI replies" value={fmt(v.ai)} change={delta(v.ai, sum(v.prev, "ai"))} spark={v.now} sparkKey="ai" hint={`${v.errorRate}% failed`} />
            <Kpi icon={Clock} label="AI reply time" value={v.avgSeconds ? `${v.avgSeconds}s` : "–"} change={null} spark={v.now} sparkKey="aiSeconds" hint="average, full answer" />
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <Card title="People" sub="Active each day, and how many were new" className="lg:col-span-2">
              <LineChart data={v.now} xDataKey="date" aspectRatio="2.6 / 1" margin={{ top: 16, right: 16, bottom: 32, left: 16 }}>
                <Grid horizontal />
                <Line dataKey="active" stroke="var(--chart-1)" curve={curveMonotoneX} />
                <Line dataKey="newPeople" stroke="var(--chart-2)" curve={curveMonotoneX} />
                <XAxis />
                <ChartTooltip />
              </LineChart>
              <Legend items={[["Active", "var(--chart-1)"], ["New", "var(--chart-2)"]]} />
            </Card>

            <Card title="Who answered" sub={`AI replies by source, last ${stats.days} days`}>
              {v.ring.length ? (
                <div className="flex flex-col items-center gap-4">
                  <RingChart data={v.ring} size={200}>
                    {v.ring.map((r, i) => (
                      <Ring key={r.label} index={i} />
                    ))}
                    <RingCenter defaultLabel="AI replies" />
                  </RingChart>
                  <ul className="w-full space-y-1.5 text-sm">
                    {v.ring.map((r) => (
                      <li key={r.label} className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                        <span className="flex-1 truncate">{r.label}</span>
                        <span className="tabular text-fg-muted">{Math.round((r.value / r.maxValue) * 100)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <Empty text="No AI replies yet in this range." />
              )}
              <Quota used={stats.limits.aiToday} limit={stats.limits.aiPerDay} />
            </Card>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <Card title="Conversation volume" sub="Messages from people and replies from the AI" className="lg:col-span-2">
              <AreaChart data={v.now} xDataKey="date" aspectRatio="2.6 / 1" margin={{ top: 16, right: 16, bottom: 32, left: 16 }}>
                <Grid horizontal />
                <Area dataKey="messages" fill="var(--chart-1)" curve={curveMonotoneX} />
                <Area dataKey="ai" fill="var(--chart-2)" curve={curveMonotoneX} />
                <XAxis />
                <ChartTooltip />
              </AreaChart>
              <Legend items={[["Messages", "var(--chart-1)"], ["AI replies", "var(--chart-2)"]]} />
            </Card>

            <Card title="AI quality" sub="From 👍 / 👎 on replies">
              <QualityBar up={v.thumbs.up} down={v.thumbs.down} />
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <Stat label="Failed replies" value={`${v.errorRate}%`} />
                <Stat label="Avg reply time" value={v.avgSeconds ? `${v.avgSeconds}s` : "–"} />
                <Stat label="Uploads" value={fmt(sum(v.now, "uploads"))} />
                <Stat label="AI replies (all time)" value={fmt(stats.totals.aiReplies)} />
              </dl>
            </Card>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Card title="Busiest hours" sub="Messages by hour of day, in your time zone">
              {stats.heat.length ? (
                <BarChart data={v.hours} xDataKey="name" aspectRatio="2.2 / 1" barGap={0.25} margin={{ top: 16, right: 8, bottom: 28, left: 8 }}>
                  <Grid horizontal />
                  <Bar dataKey="messages" fill="var(--chart-1)" />
                  <BarXAxis />
                  <ChartTooltip />
                </BarChart>
              ) : (
                <Empty text="No messages yet in this range." />
              )}
            </Card>
            <Card title="What people make" sub={`Files created, last ${stats.days} days`}>
              {v.files.length ? (
                <BarChart data={v.files} xDataKey="name" aspectRatio="2.2 / 1" margin={{ top: 16, right: 8, bottom: 28, left: 8 }}>
                  <Grid horizontal />
                  <Bar dataKey="files" fill="var(--chart-3)" />
                  <BarXAxis />
                  <ChartTooltip />
                </BarChart>
              ) : (
                <Empty text="No files made yet in this range." />
              )}
            </Card>
          </div>

          <Card title="Activity calendar" sub="Messages per day, last 26 weeks" className="mt-3">
            <HeatmapInteractionProvider>
              <HeatmapInteractionBoundary>
                <div className="mx-auto max-w-4xl overflow-x-auto">
                  <HeatmapChart data={v.weeks} layout="fluid" gap={3} levelColors={HEAT_LEVELS}>
                    <HeatmapCells />
                    <HeatmapXAxis />
                    <HeatmapYAxis />
                    <HeatmapTooltip
                      formatLabel={(_, date) => {
                        const n = v.raw.get(date.toISOString().slice(0, 10)) ?? 0;
                        return `${n.toLocaleString()} message${n === 1 ? "" : "s"} · ${date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;
                      }}
                    />
                  </HeatmapChart>
                </div>
              </HeatmapInteractionBoundary>
            </HeatmapInteractionProvider>
          </Card>
          <p className="mt-3 text-xs text-fg-subtle">
            Tracking started with this update, so earlier days show zero. Times are counted in UTC and the busiest-hours chart is shifted to your time zone.
          </p>
        </>
      )}
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-2 flex gap-4 text-xs text-fg-muted">
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} /> {label}
        </span>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="flex h-40 items-center justify-center text-sm text-fg-subtle">{text}</p>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-accent-soft/60 px-3 py-2.5">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="tabular mt-0.5 text-lg font-semibold">{value}</dd>
    </div>
  );
}

function QualityBar({ up, down }: { up: number; down: number }) {
  const total = up + down;
  const pct = total ? Math.round((up / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="tabular text-[28px] font-semibold leading-none">{total ? `${pct}%` : "–"}</span>
        <span className="text-xs text-fg-subtle">{total ? `liked · ${up} 👍 · ${down} 👎` : "No ratings yet"}</span>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-accent-soft">
        <div className="h-full rounded-full bg-fg transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Quota({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="flex justify-between text-xs">
        <span className="text-fg-muted">Cloud AI used today</span>
        <span className="tabular text-fg-muted">
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-accent-soft">
        <div className={`h-full rounded-full ${pct > 85 ? "bg-red-500" : "bg-fg"}`} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
    </div>
  );
}
