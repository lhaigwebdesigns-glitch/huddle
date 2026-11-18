import { useEffect, useState } from "react";
import { getIdentity, setName } from "./identity";

export interface Account {
  id: string;
  uid: string;
  name: string;
  email: string | null;
  avatar: string | null;
  provider: string;
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
  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json() as Promise<{ providers: string[]; requireSignInToCreate: boolean }>)
      .then((d) => {
        setProviders(d.providers);
        setRequireSignIn(d.requireSignInToCreate);
      })
      .catch(() => {});
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => r.json() as Promise<{ user: Account | null }>)
      .then((d) => {
        if (d.user) {
          try {
            if (localStorage.getItem("huddle.uid") !== d.user.uid) localStorage.setItem("huddle.uid", d.user.uid);
            if (!getIdentity().name) setName(d.user.name);
          } catch {
            /* private mode */
          }
        }
        setUser(d.user);
      })
      .catch(() => setUser(null));
  }, []);
  return { user, providers, requireSignIn };
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
