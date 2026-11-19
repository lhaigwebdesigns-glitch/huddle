import type { Env } from "./env";
import { ensureTables, today } from "./db";

/**
 * Site analytics for /admin, kept small for D1's free tier:
 * - daily_stats(day, metric, n): counters like rooms_created, messages, joins, ai_ms, files_doc,
 *   and msg_hNN (messages per UTC hour, for the "busiest hours" heatmap);
 * - daily_people(day, uid): who was active each day (distinct people, new vs returning).
 * High-volume counters (messages) are batched per isolate and flushed every few seconds.
 */
const pending = new Map<string, number>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

let statsReady: Promise<void> | null = null;
export function ensureStatsTables(db: D1Database) {
  statsReady ??= ensureTables(db)
    .then(() =>
      db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS daily_stats (day TEXT, metric TEXT, n INTEGER, PRIMARY KEY (day, metric))`),
        db.prepare(`CREATE TABLE IF NOT EXISTS daily_people (day TEXT, uid TEXT, PRIMARY KEY (day, uid))`),
      ]),
    )
    .then(() => undefined)
    .catch((err) => {
      statsReady = null;
      throw err;
    });
  return statsReady;
}

async function write(db: D1Database, rows: [string, string, number][]) {
  if (!rows.length) return;
  await ensureStatsTables(db);
  await db.batch(
    rows.map(([day, metric, n]) =>
      db
        .prepare(`INSERT INTO daily_stats (day, metric, n) VALUES (?1, ?2, ?3) ON CONFLICT(day, metric) DO UPDATE SET n = n + excluded.n`)
        .bind(day, metric, n),
    ),
  );
}

/** Add to a counter now (low-volume events: rooms created, files, uploads). */
export async function bump(env: Env, metric: string, n = 1) {
  if (!env.DB) return;
  try {
    await write(env.DB, [[today(), metric, n]]);
  } catch (err) {
    console.warn("stats bump failed", err);
  }
}

/**
 * Add to a counter in a batch flushed within ~10s (high-volume events like messages).
 * Pass `wait` (ctx.waitUntil) so the flush finishes even if the request ends first.
 */
export function bumpLater(env: Env, metric: string, n = 1, wait?: (p: Promise<unknown>) => void) {
  if (!env.DB) return;
  const key = `${today()}|${metric}`;
  pending.set(key, (pending.get(key) ?? 0) + n);
  if (flushTimer) return;
  const run = new Promise<void>((resolve) => {
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      const rows = [...pending].map(([k, v]) => [...k.split("|"), v] as [string, string, number]);
      pending.clear();
      await write(env.DB!, rows).catch((err) => console.warn("stats flush failed", err));
      resolve();
    }, 10_000);
  });
  wait?.(run);
}

/** Mark someone as active today (first time per day per person costs one write). */
const seenToday = new Set<string>();
export async function markActive(env: Env, uid: string) {
  if (!env.DB || !uid) return;
  const key = `${today()}|${uid}`;
  if (seenToday.has(key)) return;
  if (seenToday.size > 5000) seenToday.clear();
  seenToday.add(key);
  try {
    await ensureStatsTables(env.DB);
    await env.DB.prepare(`INSERT OR IGNORE INTO daily_people (day, uid) VALUES (?1, ?2)`).bind(today(), uid.slice(0, 64)).run();
  } catch (err) {
    console.warn("active mark failed", err);
  }
}

// ---------- reading, for /api/admin/stats ----------

export const dayList = (days: number, end = new Date()) =>
  Array.from({ length: days }, (_, i) => new Date(end.getTime() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10));

export interface DayRow {
  day: string;
  active: number;
  newPeople: number;
  signups: number;
  rooms: number;
  joins: number;
  messages: number;
  ai: number;
  aiErrors: number;
  /** Average AI reply time that day, in seconds. */
  aiSeconds: number;
  uploads: number;
}

export async function readStats(env: Env, days: number) {
  const db = env.DB!;
  await ensureStatsTables(db);
  const list = dayList(days * 2); // current period + the one before it, for "vs previous" deltas
  const from = list[0];
  const periodStart = list[days];
  type N = { day: string; n: number };
  const empty = { results: [] as N[] };
  const [counters, people, newPeople, signups, aiByDay, aiByProvider, feedback, accounts, peopleAll, roomsAll, messagesAll, aiAll] =
    await Promise.all([
      db.prepare(`SELECT day, metric, n FROM daily_stats WHERE day >= ?1`).bind(from).all<{ day: string; metric: string; n: number }>(),
      db.prepare(`SELECT day, COUNT(*) AS n FROM daily_people WHERE day >= ?1 GROUP BY day`).bind(from).all<N>(),
      // The first day each person was ever seen = new people that day.
      db
        .prepare(`SELECT first AS day, COUNT(*) AS n FROM (SELECT uid, MIN(day) AS first FROM daily_people GROUP BY uid) WHERE first >= ?1 GROUP BY first`)
        .bind(from)
        .all<N>(),
      db
        .prepare(`SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, COUNT(*) AS n FROM users WHERE created_at >= ?1 GROUP BY day`)
        .bind(new Date(from).getTime())
        .all<N>()
        .catch(() => empty),
      db.prepare(`SELECT day, SUM(turns) AS n FROM ai_usage WHERE day >= ?1 GROUP BY day`).bind(from).all<N>(),
      db
        .prepare(`SELECT provider, SUM(turns) AS n FROM ai_usage WHERE day >= ?1 GROUP BY provider ORDER BY n DESC`)
        .bind(periodStart)
        .all<{ provider: string; n: number }>(),
      db
        .prepare(`SELECT SUM(rating = 1) AS up, SUM(rating = -1) AS down FROM feedback WHERE created_at >= ?1`)
        .bind(new Date(periodStart).getTime())
        .first<{ up: number | null; down: number | null }>(),
      db.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>().catch(() => ({ n: 0 })),
      db.prepare(`SELECT COUNT(DISTINCT uid) AS n FROM daily_people`).first<{ n: number }>(),
      db.prepare(`SELECT COALESCE(SUM(n), 0) AS n FROM daily_stats WHERE metric = 'rooms_created'`).first<{ n: number }>(),
      db.prepare(`SELECT COALESCE(SUM(n), 0) AS n FROM daily_stats WHERE metric = 'messages'`).first<{ n: number }>(),
      db.prepare(`SELECT COALESCE(SUM(turns), 0) AS n FROM ai_usage`).first<{ n: number }>(),
    ]);

  const byDay = (rows: N[]) => new Map(rows.map((r) => [r.day, Number(r.n) || 0]));
  const c = new Map<string, number>();
  for (const r of counters.results) c.set(`${r.day}|${r.metric}`, Number(r.n) || 0);
  const m = (day: string, metric: string) => c.get(`${day}|${metric}`) ?? 0;
  const P = byDay(people.results);
  const NP = byDay(newPeople.results);
  const S = byDay(signups.results);
  const A = byDay(aiByDay.results);

  const series: DayRow[] = list.map((day) => {
    const ai = A.get(day) ?? 0;
    const timed = m(day, "ai_timed");
    return {
      day,
      active: P.get(day) ?? 0,
      newPeople: NP.get(day) ?? 0,
      signups: S.get(day) ?? 0,
      rooms: m(day, "rooms_created"),
      joins: m(day, "joins"),
      messages: m(day, "messages"),
      ai,
      aiErrors: m(day, "ai_errors"),
      aiSeconds: timed ? Math.round(m(day, "ai_ms") / timed / 100) / 10 : 0,
      uploads: m(day, "uploads"),
    };
  });

  // Busiest hours: messages per weekday × UTC hour over the current period.
  const heat: { weekday: number; hour: number; n: number }[] = [];
  const files: Record<string, number> = {};
  for (const r of counters.results) {
    if (r.day < periodStart) continue;
    const hm = /^msg_h(\d\d)$/.exec(r.metric);
    if (hm) heat.push({ weekday: new Date(r.day + "T00:00:00Z").getUTCDay(), hour: Number(hm[1]), n: Number(r.n) || 0 });
    if (r.metric.startsWith("files_")) files[r.metric.slice(6)] = (files[r.metric.slice(6)] ?? 0) + (Number(r.n) || 0);
  }

  // Distinct people in this period and the one before (daily counts can't be summed).
  const [uniqueNow, uniquePrev, calendarRows] = await Promise.all([
    db.prepare(`SELECT COUNT(DISTINCT uid) AS n FROM daily_people WHERE day >= ?1`).bind(periodStart).first<{ n: number }>(),
    db
      .prepare(`SELECT COUNT(DISTINCT uid) AS n FROM daily_people WHERE day >= ?1 AND day < ?2`)
      .bind(from, periodStart)
      .first<{ n: number }>(),
    // 26 weeks of messages per day for the activity calendar.
    db
      .prepare(`SELECT day, n FROM daily_stats WHERE metric = 'messages' AND day >= ?1`)
      .bind(dayList(182)[0])
      .all<N>(),
  ]);
  const cal = byDay(calendarRows.results);

  return {
    days,
    unique: { now: uniqueNow?.n ?? 0, prev: uniquePrev?.n ?? 0 },
    calendar: dayList(182).map((day) => ({ day, n: cal.get(day) ?? 0 })),
    series, // 2 × days long: the first half is the previous period
    heat,
    files,
    aiByProvider: aiByProvider.results.map((r) => ({ provider: r.provider, n: Number(r.n) || 0 })),
    feedback: { up: Number(feedback?.up) || 0, down: Number(feedback?.down) || 0 },
    totals: {
      accounts: accounts?.n ?? 0,
      people: peopleAll?.n ?? 0,
      rooms: roomsAll?.n ?? 0,
      messages: messagesAll?.n ?? 0,
      aiReplies: aiAll?.n ?? 0,
    },
    limits: { aiPerDay: Number(env.GLOBAL_DAILY_AI_LIMIT || 5000), aiToday: A.get(today()) ?? 0 },
  };
}

export type Stats = Awaited<ReturnType<typeof readStats>>;
