// Member colors, from the Cairn palette: deeper green, teal and periwinkle shades so white initials stay readable.
const COLORS = ["#2a9a4b", "#2f7f8c", "#5a72a0", "#3a8f6a", "#46647f", "#1f7a5a", "#4d6fae", "#36796b"];

export interface Identity {
  uid: string;
  name: string;
  color: string;
  /** Profile picture URL when signed in with one. */
  avatar?: string;
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
  return { uid, name: safeGet("huddle.name") ?? "", color, avatar: safeGet("huddle.avatar") || undefined };
}

/** This device's room color (also used for live pointers). */
export function setColor(color: string) {
  safeSet("huddle.color", color);
}

/** The signed-in account's picture, sent along when joining rooms; empty = none. */
export function setAvatar(url: string | null | undefined) {
  safeSet("huddle.avatar", url ?? "");
}

export const COLORS_LIST = COLORS;

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

/** Cairn is for ages 13 and up: people confirm it once on this device. */
export function ageConfirmed() {
  return safeGet("huddle.age13") === "1";
}
export function confirmAge() {
  safeSet("huddle.age13", "1");
}
