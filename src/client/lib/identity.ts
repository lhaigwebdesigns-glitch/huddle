const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#6366f1", "#a855f7", "#ec4899"];

export interface Identity {
  uid: string;
  name: string;
  color: string;
}

function safeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
}

export function getIdentity(): Identity {
  let uid = safeGet("huddle.uid");
  if (!uid) {
    uid = crypto.randomUUID();
    safeSet("huddle.uid", uid);
  }
  let color = safeGet("huddle.color");
  if (!color) {
    color = COLORS[Math.floor(Math.random() * COLORS.length)];
    safeSet("huddle.color", color);
  }
  return { uid, name: safeGet("huddle.name") ?? "", color };
}

export function setName(name: string) {
  safeSet("huddle.name", name.trim().slice(0, 32));
}

/** Guests keep a short list on this device: the last 3 rooms from the past 30 days. Signed-in people get the dashboard. */
export const RECENT_MAX = 3;
const RECENT_DAYS = 30;

export function rememberRoom(code: string, title: string) {
  const list = recentRooms().filter((r) => r.code !== code);
  list.unshift({ code, title, at: Date.now() });
  safeSet("huddle.recent", JSON.stringify(list.slice(0, RECENT_MAX)));
}

export function recentRooms(now = Date.now()): { code: string; title: string; at: number }[] {
  try {
    const list = JSON.parse(safeGet("huddle.recent") ?? "[]") as { code: string; title: string; at: number }[];
    return list.filter((r) => now - (r.at ?? 0) < RECENT_DAYS * 86_400_000).slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function forgetRoom(code: string) {
  safeSet("huddle.recent", JSON.stringify(recentRooms().filter((r) => r.code !== code)));
}
