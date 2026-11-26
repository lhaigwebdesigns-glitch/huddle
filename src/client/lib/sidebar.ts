import { useSyncExternalStore } from "react";

/**
 * Hide or show the sidebar (on computers; phones use the menu drawer). One setting for every
 * page, remembered on this device.
 */
const KEY = "cairn.sidebarHidden";
let hidden = (() => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
})();
const subs = new Set<() => void>();

export function setSidebarHidden(v: boolean) {
  hidden = v;
  try {
    if (v) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
  subs.forEach((f) => f());
}

export function useSidebarHidden(): boolean {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => hidden,
  );
}
