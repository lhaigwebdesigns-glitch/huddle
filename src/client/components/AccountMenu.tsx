import { useEffect, useRef, useState } from "react";
import { LayoutGrid, LogOut, UserRound } from "lucide-react";
import { PersonAvatar } from "./PersonAvatar";
import { getIdentity } from "../lib/identity";

function Github({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z" />
    </svg>
  );
}
import { PROVIDER_LABEL, signInUrl, signOut, type Account } from "../lib/account";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

const MENU = "pop absolute right-0 z-40 mt-2 rounded-2xl border border-line bg-surface p-1.5 text-sm shadow-[0_16px_40px_-12px_rgba(0,0,0,0.25)]";
const ITEM = "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-fg transition-colors hover:bg-surface-2";

export function AccountMenu({ user, providers }: { user: Account | null | undefined; providers: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  if (user === undefined) return null;
  if (user)
    return (
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="press flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm text-fg hover:bg-surface-2"
          aria-expanded={open}
          data-testid="account-button"
        >
          <PersonAvatar name={user.name} color={user.color || getIdentity().color} avatar={user.avatar} className="h-7 w-7 text-xs" />
          <span className="max-w-[10rem] truncate">{user.name}</span>
        </button>
        {open && (
          <div className={`${MENU} w-56`} role="menu">
            <div className="truncate px-3 py-2 text-xs text-fg-subtle">{user.email ?? PROVIDER_LABEL[user.provider] ?? user.provider}</div>
            <a role="menuitem" href="/profile" className={ITEM} data-testid="menu-profile">
              <UserRound className="h-4 w-4 text-fg-muted" /> Edit profile
            </a>
            <a role="menuitem" href="/dashboard" className={ITEM}>
              <LayoutGrid className="h-4 w-4 text-fg-muted" /> Your rooms
            </a>
            <button role="menuitem" onClick={signOut} className={ITEM}>
              <LogOut className="h-4 w-4 text-fg-muted" /> Sign out
            </button>
          </div>
        )}
      </div>
    );
  if (!providers.length) return null;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="press rounded-full px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-2" aria-expanded={open} data-testid="sign-in">
        Sign in
      </button>
      {open && (
        <div className={`${MENU} w-64`} role="menu">
          {providers.map((p) => (
            <a key={p} role="menuitem" href={signInUrl(p)} className={ITEM}>
              {p === "github" ? <Github className="h-4 w-4" /> : p === "google" ? <GoogleMark /> : null}
              Continue with {PROVIDER_LABEL[p] ?? p}
            </a>
          ))}
          <p className="px-3 pb-1.5 pt-2 text-xs leading-snug text-fg-subtle">Optional. Keeps your rooms on every device. Guests can always join with a code.</p>
        </div>
      )}
    </div>
  );
}
