/**
 * Small helpers over the free D1 database: feedback, per-IP rate limits and a global
 * daily AI counter (protects everyone's free quotas). Every helper is a no-op without D1.
 */

let ready: Promise<void> | null = null;

export function ensureTables(db: D1Database): Promise<void> {
  ready ??= db
    .batch([
      db.prepare(
        `CREATE TABLE IF NOT EXISTS feedback (
          id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER, room TEXT, uid TEXT, name TEXT,
          message_id TEXT, rating INTEGER, comment TEXT, excerpt TEXT, page TEXT)`,
      ),
      db.prepare(`CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, win INTEGER, count INTEGER)`),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS ai_usage (day TEXT, provider TEXT, turns INTEGER, PRIMARY KEY (day, provider))`,
      ),
      db.prepare(`CREATE TABLE IF NOT EXISTS shares (id TEXT PRIMARY KEY, created_at INTEGER, title TEXT, messages TEXT)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS assistants (code TEXT PRIMARY KEY, created_at INTEGER, data TEXT)`),
    ])
    .then(() => undefined)
    .catch((err) => {
      ready = null; // retry next time
      throw err;
    });
  return ready;
}

/**
 * Fixed-window counter. Returns true if this hit is allowed.
 * `key` should already include what is being limited, e.g. "rooms:203.0.113.7".
 */
export async function hit(db: D1Database | undefined, key: string, limit: number, windowSec: number): Promise<boolean> {
  // Local dev has no client IP (Cloudflare always sets one in production): don't limit.
  if (!db || key.endsWith(":local")) return true;
  try {
    await ensureTables(db);
    const win = Math.floor(Date.now() / 1000 / windowSec);
    const row = await db
      .prepare(
        `INSERT INTO rate_limits (key, win, count) VALUES (?1, ?2, 1)
         ON CONFLICT(key) DO UPDATE SET
           count = CASE WHEN rate_limits.win = excluded.win THEN rate_limits.count + 1 ELSE 1 END,
           win = excluded.win
         RETURNING count`,
      )
      .bind(key, win)
      .first<{ count: number }>();
    return (row?.count ?? 1) <= limit;
  } catch (err) {
    console.warn("rate limit check failed (allowing)", err);
    return true;
  }
}

export const today = () => new Date().toISOString().slice(0, 10);

/** Count one AI turn for the whole deployment. */
export async function countAiTurn(db: D1Database | undefined, provider: string) {
  if (!db) return;
  try {
    await ensureTables(db);
    await db
      .prepare(
        `INSERT INTO ai_usage (day, provider, turns) VALUES (?1, ?2, 1)
         ON CONFLICT(day, provider) DO UPDATE SET turns = ai_usage.turns + 1`,
      )
      .bind(today(), provider.slice(0, 80))
      .run();
  } catch (err) {
    console.warn("usage count failed", err);
  }
}

/** Total cloud AI turns today across every room. */
export async function aiTurnsToday(db: D1Database | undefined): Promise<number> {
  if (!db) return 0;
  try {
    await ensureTables(db);
    const row = await db.prepare(`SELECT COALESCE(SUM(turns), 0) AS n FROM ai_usage WHERE day = ?1`).bind(today()).first<{ n: number }>();
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}

export async function usageByDay(db: D1Database, days = 14) {
  await ensureTables(db);
  const { results } = await db
    .prepare(`SELECT day, provider, turns FROM ai_usage ORDER BY day DESC, turns DESC LIMIT ?1`)
    .bind(days * 10)
    .all<{ day: string; provider: string; turns: number }>();
  return results;
}

/** Best-effort client IP (Cloudflare sets cf-connecting-ip; local dev has none). */
export function clientIp(req: Request) {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  // Local dev reports loopback; production traffic never does.
  return /^(127\.|::1$|::ffff:127\.|localhost$)/.test(ip) ? "local" : ip;
}
