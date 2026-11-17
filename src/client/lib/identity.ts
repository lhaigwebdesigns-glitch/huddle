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

export function rememberRoom(code: string, title: string) {
  const list = recentRooms().filter((r) => r.code !== code);
  list.unshift({ code, title, at: Date.now() });
  safeSet("huddle.recent", JSON.stringify(list.slice(0, 8)));
}

export function recentRooms(): { code: string; title: string; at: number }[] {
  try {
    return JSON.parse(safeGet("huddle.recent") ?? "[]");
  } catch {
    return [];
  }
}
