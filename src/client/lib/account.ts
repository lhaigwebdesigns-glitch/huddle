import { useEffect, useState } from "react";
import { getIdentity, setAvatar, setColor, setName } from "./identity";

export interface Account {
  id: string;
  uid: string;
  name: string;
  email: string | null;
  avatar: string | null;
  provider: string;
  color?: string | null;
}

/** Copy the account's profile onto this device's room identity (name, color, picture). */
export function applyProfile(u: Account) {
  setName(u.name);
  if (u.color) setColor(u.color);
  setAvatar(u.avatar);
}

export const PROVIDER_LABEL: Record<string, string> = { github: "GitHub", google: "Google", dev: "Dev login (local only)" };

/**
 * The signed-in account, if any. After sign-in this device adopts the account's room identity,
 * so your rooms and host status follow you across devices.
 */
export function useAccount() {
  const [user, setUser] = useState<Account | null | undefined>(undefined); // undefined = loading
  const [providers, setProviders] = useState<string[]>([]);
  const [requireSignIn, setRequireSignIn] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json() as Promise<{ providers: string[]; requireSignIn?: boolean; requireSignInToCreate: boolean; turnstileSiteKey?: string | null }>)
      .then((d) => {
        setProviders(d.providers);
        setRequireSignIn(!!(d.requireSignIn ?? d.requireSignInToCreate));
        setTurnstileSiteKey(d.turnstileSiteKey ?? null);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => r.json() as Promise<{ user: Account | null; isAdmin?: boolean }>)
      .then((d) => {
        if (d.user) {
          try {
            if (localStorage.getItem("huddle.uid") !== d.user.uid) localStorage.setItem("huddle.uid", d.user.uid);
            applyProfile(d.user);
          } catch {
            /* private mode */
          }
        }
        setIsAdmin(!!d.isAdmin);
        setUser(d.user);
      })
      .catch(() => setUser(null));
  }, []);
  /** After a profile edit: update this page and this device's room identity. */
  const update = (u: Account) => {
    applyProfile(u);
    setUser(u);
  };
  /** Everything known: sign-in state and settings. Wait for this before showing gated pages. */
  const ready = loaded && user !== undefined;
  return { user, providers, requireSignIn, turnstileSiteKey, ready, isAdmin, update };
}

export function signInUrl(provider: string, returnTo = location.pathname) {
  const q = new URLSearchParams({ uid: getIdentity().uid, return: returnTo });
  if (provider === "dev") q.set("name", getIdentity().name || "Dev user");
  return `/api/auth/login/${provider}?${q}`;
}

export async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" });
  try {
    // Back to a fresh guest identity on this device.
    localStorage.removeItem("huddle.uid");
  } catch {
    /* ignore */
  }
  location.href = "/";
}
