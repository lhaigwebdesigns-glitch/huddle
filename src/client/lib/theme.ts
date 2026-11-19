import { useEffect, useState } from "react";

/** Light / dark / follow the system. Stored per browser; the .dark class on <html> drives the tokens. */
export type ThemeChoice = "system" | "light" | "dark";
const KEY = "huddle:theme";
const mq = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const listeners = new Set<() => void>();

export function getTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply() {
  const t = getTheme();
  const dark = t === "dark" || (t === "system" && !!mq?.matches);
  document.documentElement.classList.toggle("dark", dark);
  listeners.forEach((l) => l());
}

export function setTheme(t: ThemeChoice) {
  // Crossfade the colors for a moment instead of snapping (skipped with reduced motion).
  const root = document.documentElement;
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.classList.add("theme-fade");
    setTimeout(() => root.classList.remove("theme-fade"), 300);
  }
  try {
    if (t === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    /* private mode: still applies for this page */
  }
  apply();
}

export function initTheme() {
  apply();
  mq?.addEventListener("change", apply);
}

export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void] {
  const [t, setT] = useState(getTheme);
  useEffect(() => {
    const l = () => setT(getTheme());
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return [t, setTheme];
}
