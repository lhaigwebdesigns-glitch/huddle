import type { Env } from "../env";
import { ensureTables } from "../db";

/**
 * The router fixes itself when a provider retires or renames a model: that model is skipped
 * (the next provider answers instead) and an alert is saved for /admin, so the model name can
 * be updated in settings. Other errors (rate limits, outages) only cause a short cooldown.
 */

export interface ModelAlert {
  provider: string;
  model: string;
  at: number;
  message: string;
}

/** True for errors that mean "this model doesn't exist any more", not "try again later". */
export function isRetiredModelError(status: number, message: string): boolean {
  if (status !== 400 && status !== 404 && status !== 410) return false;
  return /decommission|deprecat|no longer (available|supported)|model[^.]{0,40}(not found|does not exist|doesn't exist|not exist|unknown|invalid|unavailable)|model_not_found|unknown model|invalid model|no such model/i.test(
    message,
  );
}

/** Skip a retired model for this long (the alert stays until it's cleared in /admin). */
export const RETIRED_COOLDOWN_MS = 6 * 3_600_000;

export async function recordModelAlert(env: Env, alert: ModelAlert) {
  if (!env.DB) return;
  try {
    await ensureTables(env.DB);
    const alerts = await readModelAlerts(env);
    const rest = alerts.filter((a) => !(a.provider === alert.provider && a.model === alert.model));
    await env.DB.prepare(`INSERT INTO app_settings (key, value) VALUES ('model_alerts', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1`)
      .bind(JSON.stringify([alert, ...rest].slice(0, 20)))
      .run();
  } catch (err) {
    console.warn("couldn't save model alert", String(err).slice(0, 200));
  }
}

export async function readModelAlerts(env: Env): Promise<ModelAlert[]> {
  if (!env.DB) return [];
  await ensureTables(env.DB);
  const row = await env.DB.prepare(`SELECT value FROM app_settings WHERE key = 'model_alerts'`).first<{ value: string }>();
  try {
    return row ? (JSON.parse(row.value) as ModelAlert[]) : [];
  } catch {
    return [];
  }
}

export async function clearModelAlerts(env: Env) {
  if (!env.DB) return;
  await ensureTables(env.DB);
  await env.DB.prepare(`DELETE FROM app_settings WHERE key = 'model_alerts'`).run();
}
