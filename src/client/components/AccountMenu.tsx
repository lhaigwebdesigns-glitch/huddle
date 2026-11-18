import { useState } from "react";
import { PROVIDER_LABEL, signInUrl, signOut, type Account } from "../lib/account";

export function AccountMenu({ user, providers }: { user: Account | null | undefined; providers: string[] }) {
  const [open, setOpen] = useState(false);
  if (user === undefined) return null;
  if (user)
    return (
      <div className="relative">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-expanded={open} data-testid="account-button">
          {user.avatar ? (
            <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full" />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">{user.name.slice(0, 1).toUpperCase()}</span>
          )}
          <span className="max-w-[10rem] truncate">{user.name}</span>
        </button>
        {open && (
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-zinc-200 bg-white p-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900" role="menu">
            <div className="truncate px-3 py-1.5 text-xs text-zinc-500">{user.email ?? PROVIDER_LABEL[user.provider] ?? user.provider}</div>
            <button role="menuitem" onClick={signOut} className="block w-full rounded px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800">
              Sign out
            </button>
          </div>
        )}
      </div>
    );
  if (!providers.length) return <span className="text-sm text-zinc-500">Free & open source</span>;
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800" aria-expanded={open} data-testid="sign-in">
        Sign in
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-zinc-200 bg-white p-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900" role="menu">
          {providers.map((p) => (
            <a key={p} role="menuitem" href={signInUrl(p)} className="block rounded px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              Continue with {PROVIDER_LABEL[p] ?? p}
            </a>
          ))}
          <p className="px-3 py-1.5 text-xs text-zinc-500">Optional. Keeps your rooms on every device. Guests can always join.</p>
        </div>
      )}
    </div>
  );
}
