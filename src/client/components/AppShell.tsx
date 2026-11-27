import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarCheck, LayoutGrid, Menu, PanelLeftClose, PanelLeftOpen, Plus, Shield, X } from "lucide-react";
import { setSidebarHidden, useSidebarHidden } from "../lib/sidebar";
import type { Account } from "../lib/account";
import type { MyClass, MyClasses } from "../../shared/classes";
import { isValidCode, normalizeCode } from "../../shared/code";
import { AccountMenu } from "./AccountMenu";
import { alertDialog, promptDialog } from "./Dialogs";
import { TourButton } from "./Tour";
import { Logo, ThemeToggle } from "./ui";

/**
 * The frame around every signed-in page: one sidebar with your classes and your rooms, so no
 * page cuts you off from the rest of Cairn. On phones the sidebar is a drawer.
 */

// Kept between pages so the sidebar doesn't flash empty while it refreshes.
let cached: MyClasses | null = null;
const subs = new Set<(m: MyClasses) => void>();
/** Re-reads the class list (after making or joining a class). */
export function refreshMyClasses() {
  void fetch("/api/classes/mine")
    .then((r) => (r.ok ? (r.json() as Promise<MyClasses>) : null))
    .then((d) => {
      if (!d) return;
      cached = d;
      subs.forEach((f) => f(d));
    })
    .catch(() => {});
}
export function useMyClasses(signedIn: boolean) {
  const [v, setV] = useState<MyClasses | null>(cached);
  useEffect(() => {
    if (!signedIn) return;
    subs.add(setV);
    refreshMyClasses();
    return () => void subs.delete(setV);
  }, [signedIn]);
  return v;
}

/** A class or room code: classes open their page, rooms open the room. Returns an error, or null. */
export async function openCode(raw: string, go: (to: string) => void): Promise<string | null> {
  const code = normalizeCode(raw);
  if (!isValidCode(code)) return "Codes are 6 letters and numbers, like ABC-123.";
  const cls = await fetch(`/api/classes/join/${code}`).catch(() => null);
  if (cls && (cls.ok || cls.status === 401)) return go(`/c/${code}`), null;
  const room = await fetch(`/api/rooms/${code}`).catch(() => null);
  if (room?.ok) return go(`/r/${code}`), null;
  return "That code doesn't match a class or a room. Check the letters and try again.";
}

export const TINTS = ["#5eb1bf", "#8fa6cb", "#44cf6c", "#a9fdac"];
export const tint = (s: string) => TINTS[[...s].reduce((n, ch) => n + ch.charCodeAt(0), 0) % TINTS.length];

function ClassItem({ c, active }: { c: MyClass; active: boolean }) {
  return (
    <Link
      to={c.href}
      aria-current={active ? "page" : undefined}
      className={`press group flex items-center gap-3 rounded-xl px-2.5 py-2 ${active ? "bg-accent-soft text-fg" : "text-fg-muted hover:bg-accent-soft/60 hover:text-fg"}`}
      data-testid="sidebar-class"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg font-display text-sm font-extrabold text-ink" style={{ background: tint(c.code) }} aria-hidden="true">
        {c.name.trim().charAt(0).toUpperCase() || "C"}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[14px] ${active ? "font-semibold" : "font-medium"}`}>{c.name}</span>
        {c.sub && <span className="block truncate text-xs text-fg-subtle">{c.sub}</span>}
      </span>
    </Link>
  );
}

function Sidebar({ account, isAdmin, onNavigate }: { account: Account; isAdmin?: boolean; onNavigate?: () => void }) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const mine = useMyClasses(true);
  const teacher = account.role === "teacher";
  const go = (to: string) => (onNavigate?.(), nav(to));
  const item = (active: boolean) =>
    `press flex items-center gap-3 rounded-xl px-2.5 py-2 text-[15px] ${active ? "bg-accent-soft font-semibold text-fg" : "font-medium text-fg-muted hover:bg-accent-soft/60 hover:text-fg"}`;

  const primary = async () => {
    if (teacher) {
      const name = await promptDialog({ title: "New class", label: "Class name", placeholder: "e.g. Period 3 History", confirmLabel: "Make class" });
      if (!name?.trim()) return;
      const r = await fetch("/api/classes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
      const d = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!d.id) return alertDialog({ title: "Couldn't make the class", message: d.error ?? "Try again." });
      refreshMyClasses();
      go(`/classes/${d.id}`);
    } else {
      const code = await promptDialog({ title: "Join with a code", message: "Your teacher's class code, or a room code from a friend.", label: "Code", placeholder: "ABC-123", confirmLabel: "Join" });
      if (!code?.trim()) return;
      const err = await openCode(code, go);
      if (err) await alertDialog({ title: "Couldn't find that code", message: err });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center gap-2 px-4">
        <Link to="/" onClick={onNavigate} className="flex items-center gap-2" title="Cairn home">
          <Logo className="h-8 w-8" /> <span className="font-display text-[19px] font-extrabold tracking-tight">Cairn</span>
        </Link>
        <span className="flex-1" />
        <TourButton />
        {!onNavigate && <HideSidebarButton />}
      </div>

      <div className="px-3">
        <button onClick={() => void primary()} className="ledge-btn h-11 w-full text-[15px]" data-testid="sidebar-primary">
          <Plus className="h-4 w-4" /> {teacher ? "New class" : "Join with a code"}
        </button>
      </div>

      <nav className="mt-5 space-y-1 px-3" aria-label="Main">
        {teacher && (
          <Link to="/classes" onClick={onNavigate} className={item(pathname === "/classes")} aria-current={pathname === "/classes" ? "page" : undefined} data-testid="nav-today">
            <CalendarCheck className="h-[18px] w-[18px]" /> Today
          </Link>
        )}
        <Link to="/dashboard" onClick={onNavigate} className={item(pathname === "/dashboard")} aria-current={pathname === "/dashboard" ? "page" : undefined} data-testid="nav-rooms">
          <LayoutGrid className="h-[18px] w-[18px]" /> Your rooms
        </Link>
      </nav>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <h2 className="px-2.5 text-xs font-bold uppercase tracking-[0.08em] text-fg-subtle">Your classes</h2>
        <div className="mt-2 space-y-0.5" data-testid="sidebar-classes">
          {mine?.classes.map((c) => <ClassItem key={c.code} c={c} active={pathname === c.href || pathname.startsWith(`${c.href}/`)} />)}
          {mine && !mine.classes.length && (
            <p className="px-2.5 py-1 text-sm text-fg-subtle">{teacher ? "No classes yet. Make one above." : "No classes yet. Join one with your teacher's code."}</p>
          )}
        </div>
        {isAdmin && (
          <Link to="/admin" onClick={onNavigate} className={`${item(pathname === "/admin")} mt-4`} data-testid="sidebar-admin">
            <Shield className="h-[18px] w-[18px]" /> Admin
          </Link>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line p-3">
        <AccountMenu user={account} providers={[]} isAdmin={isAdmin} placement="up" />
        <ThemeToggle />
      </div>
    </div>
  );
}

/** Hides the sidebar (computers only; phones use the menu). */
export function HideSidebarButton() {
  return (
    <button
      onClick={() => setSidebarHidden(true)}
      className="press hidden h-8 w-8 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg md:inline-flex"
      aria-label="Hide sidebar"
      title="Hide sidebar"
      data-testid="hide-sidebar"
    >
      <PanelLeftClose className="h-[18px] w-[18px]" />
    </button>
  );
}

/** Brings the sidebar back; sits at the top left while it's hidden. */
export function ShowSidebarButton({ className = "" }: { className?: string }) {
  return (
    <button
      onClick={() => setSidebarHidden(false)}
      className={`press hidden h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-fg-muted shadow-sm hover:text-fg md:inline-flex ${className}`}
      aria-label="Show sidebar"
      title="Show sidebar"
      data-testid="show-sidebar"
    >
      <PanelLeftOpen className="h-[18px] w-[18px]" />
    </button>
  );
}

export function AppShell({
  account,
  isAdmin,
  back,
  children,
}: {
  account: Account;
  isAdmin?: boolean;
  /** A way back up, shown above the page (e.g. from grading to the class). */
  back?: { to: string; label: string };
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const hidden = useSidebarHidden();
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [open]);
  return (
    <div className="flex h-full bg-bg" data-testid="app-shell">
      <aside className={`hidden w-[264px] shrink-0 border-r border-line bg-sidebar ${hidden ? "" : "md:block"}`} data-testid="app-sidebar">
        <Sidebar account={account} isAdmin={isAdmin} />
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="fade absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="sheet-left absolute inset-y-0 left-0 w-[min(300px,86vw)] bg-sidebar shadow-xl">
            <button onClick={() => setOpen(false)} className="press absolute right-3 top-4 z-10 rounded-lg p-1.5 text-fg-muted hover:bg-accent-soft" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            <Sidebar account={account} isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phones always; computers while the sidebar is hidden (with the button to bring it back). */}
        <header className={`flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 ${hidden ? "" : "md:hidden"}`}>
          <ShowSidebarButton />
          <button onClick={() => setOpen(true)} className="press rounded-lg p-2 text-fg-muted hover:bg-surface-2 hover:text-fg md:hidden" aria-label="Open menu" data-testid="open-menu">
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/" className="flex items-center gap-2">
            <Logo className="h-7 w-7" /> <span className="font-display text-[17px] font-extrabold tracking-tight">Cairn</span>
          </Link>
          <span className="flex-1" />
          <TourButton />
        </header>
        <main className="relative min-h-0 flex-1 overflow-y-auto">
          {back && (
            <div className="mx-auto w-full max-w-5xl px-4 pt-5 sm:px-8">
              <Link to={back.to} className="press inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-fg-muted hover:bg-surface-2 hover:text-fg" data-testid="back-link">
                <ArrowLeft className="h-4 w-4" /> {back.label}
              </Link>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

