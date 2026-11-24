import type { Env } from "./env";

/**
 * Cloudflare Turnstile: a free, usually invisible "are you a person?" check. It's off until both
 * TURNSTILE_SITE_KEY (public) and TURNSTILE_SECRET (a Worker secret) are set; then the forms
 * that matter (pilot sign-up, starting a room, joining a class) need a passing token.
 */
export const turnstileOn = (env: Env) => !!(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET);

export async function isHuman(env: Env, token: unknown, ip: string): Promise<boolean> {
  if (!turnstileOn(env)) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET!);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const d = (await r.json()) as { success?: boolean };
    return d.success === true;
  } catch {
    // If Cloudflare's check itself is down, don't lock everyone out; rate limits still apply.
    return true;
  }
}

export const NOT_HUMAN = "We couldn't confirm you're a person. Refresh the page and try again.";
