import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Copy,
  Crown,
  DoorOpen,
  Lock,
  LogIn,
  MoreHorizontal,
  Plus,
  Search,
  Shield,
  UserRound,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { needsWelcome, useAccount, signInUrl } from "../lib/account";
import { AppShell, tint, useMyClasses } from "../components/AppShell";
import { ProfilePanel } from "../components/ProfilePanel";
import { NewProjectDialog } from "../components/NewProjectDialog";
import { GraduationCap } from "lucide-react";
import { Button, Input, Logo, ThemeToggle } from "../components/ui";
import { getIdentity, setName } from "../lib/identity";
import { formatCode, isValidCode, normalizeCode } from "../../shared/code";
import type { Ban as BanT, PartyPerson } from "../../shared/protocol";
import { PartyLists, timeAgo } from "../components/PartyLists";

interface DashRoom {
  code: string;
  title: string;
  lastAt: number;
  isHost: boolean;
  online: number;
  locked: boolean;
}
interface ManageState {
  title: string;
  people: (PartyPerson & { online: boolean; isHost: boolean })[];
  bans: BanT[];
}

type Filter = "all" | "hosting" | "joined";

/** Signed-in home: every room you created or joined, plus host tools (Manage party, Delete). */
export default function Dashboard({ view = "rooms" }: { view?: "rooms" | "profile" }) {
  const nav = useNavigate();
  const account = useAccount();
  const [rooms, setRooms] = useState<DashRoom[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [newProject, setNewProject] = useState(false);
  const [manage, setManage] = useState<DashRoom | null>(null);
  const [deleting, setDeleting] = useState<DashRoom | null>(null);

  const load = () =>
    fetch("/api/auth/rooms")
      .then((r) => r.json() as Promise<{ rooms: DashRoom[] }>)
      .then((d) => setRooms(d.rooms))
      .catch(() => setRooms([]));

  useEffect(() => {
    if (account.user === null) nav("/", { replace: true });
    // New accounts get the welcome first.
    if (needsWelcome(account.user)) return nav("/welcome", { replace: true });
    if (account.user) {
      document.title = view === "profile" ? "Profile · Cairn" : "Your rooms · Cairn";
      load();
    }
  }, [account.user, view]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rooms ?? []).filter(
      (r) =>
        (filter === "all" || (filter === "hosting") === r.isHost) &&
        (!needle || r.title.toLowerCase().includes(needle) || r.code.toLowerCase().includes(needle.replace(/-/g, ""))),
    );
  }, [rooms, filter, q]);

  const create = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!account.user) return;
    setErr("");
    setBusy(true);
    if (!getIdentity().name) setName(account.user.name);
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uid: account.user.uid, title: title.trim() || `${account.user.name.split(" ")[0]}'s room` }),
    });
    const d = (await res.json()) as { code?: string; error?: string };
    setBusy(false);
    if (!res.ok || !d.code) return setErr(d.error ?? "Couldn't start a room.");
    nav(`/r/${d.code}`);
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const c = normalizeCode(code);
    if (!isValidCode(c)) return setErr("Party codes are 6 letters or numbers, like K7Q-29F.");
    const res = await fetch(`/api/rooms/${c}`);
    if (!res.ok) {
      const cls = await fetch(`/api/classes/join/${c}`);
      if (cls.ok) return nav(`/c/${c}`);
      return setErr("That code doesn't match a room or a class.");
    }
    nav(`/r/${c}`);
  };

  const removeFromList = async (r: DashRoom) => {
    setRooms((list) => list?.filter((x) => x.code !== r.code) ?? null);
    await fetch(`/api/auth/rooms/${r.code}`, { method: "DELETE" });
    setToast(`Removed “${r.title}” from your list`);
  };

  const copyInvite = async (r: DashRoom) => {
    await navigator.clipboard?.writeText(`${location.origin}/j/${r.code}`).catch(() => {});
    setToast("Invite link copied");
  };

  if (!account.user) {
    return (
      <div className="flex h-full items-center justify-center bg-bg text-sm text-fg-muted">
        {account.user === undefined ? "Loading…" : <a href={signInUrl(account.providers[0] ?? "google", "/dashboard")}>Sign in</a>}
      </div>
    );
  }

  const counts = { all: rooms?.length ?? 0, hosting: rooms?.filter((r) => r.isHost).length ?? 0, joined: rooms?.filter((r) => !r.isHost).length ?? 0 };

  return (
    <AppShell account={account.user} isAdmin={account.isAdmin}>
      <div className="flex min-h-full flex-col">

        {view === "profile" ? (
          <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 pb-16 pt-8 sm:px-8">
            <Link to="/dashboard" className="mb-4 inline-block text-sm text-fg-muted hover:text-fg md:hidden">← Your rooms</Link>
            <ProfilePanel user={account.user} onChange={account.update} />
          </div>
        ) : (
        <div className="mx-auto w-full max-w-4xl flex-1 px-4 pb-16 pt-8 sm:px-8 sm:pt-10">
          <h1 className="rise font-display text-[2rem] font-extrabold leading-tight tracking-[-0.03em]">Welcome back, {account.user.name.split(" ")[0]}</h1>
          <p className="rise rise-1 mt-1 text-[1.0625rem] text-fg-muted">Your rooms, wherever you left them.</p>
          {account.user.role === "student" && <MyClassCards />}

          {/* Start a room */}
          <form onSubmit={create} className="rise rise-2 mt-6 flex gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm">
            <Input aria-label="Room name" placeholder="New room name" value={title} onChange={(e) => setTitle(e.target.value)} className="border-0 bg-transparent shadow-none focus-visible:outline-none" />
            <Button type="submit" disabled={busy}>
              <Plus className="h-4 w-4" /> {busy ? "Starting…" : "Start a room"}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => setNewProject(true)}
            className="press rise rise-2 mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-fg-muted hover:bg-accent-soft hover:text-fg"
            data-testid="new-project"
          >
            <GraduationCap className="h-4 w-4" /> One group project
          </button>
          {account.user.role !== "student" && (
            <Link to="/classes" className="press rise rise-2 mt-1 flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-fg-muted hover:bg-accent-soft hover:text-fg" data-testid="classes-link">
              <Users className="h-4 w-4" /> {account.user.role === "teacher" ? "Go to your classes" : "Teacher? Set up a class and assign projects to every group"}
            </Link>
          )}
          {newProject && (
            <NewProjectDialog
              uid={account.user.uid}
              onClose={() => setNewProject(false)}
              onCreated={(c) => {
                if (!getIdentity().name) setName(account.user!.name);
                nav(`/r/${c}`);
              }}
            />
          )}
          {/* Mobile: join + filter */}
          <form onSubmit={join} className="mt-3 flex max-w-md gap-2">
            <Input aria-label="Party code" placeholder="Have a code? K7Q-29F" value={code} onChange={(e) => setCode(formatCode(e.target.value))} className="font-mono" />
            <Button type="submit" variant="secondary">Join</Button>
          </form>
          {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">{err}</p>}

          <div className="mt-8 flex items-center gap-3">
            <div className="flex gap-1" role="tablist" aria-label="Which rooms">
              {(["all", "hosting", "joined"] as const).map((f) => (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={`press rounded-full px-3.5 py-1.5 text-sm font-semibold ${filter === f ? "bg-fg text-bg" : "text-fg-muted hover:bg-accent-soft"}`}>
                  {f === "all" ? "All" : f === "hosting" ? "Hosting" : "Joined"} <span className="tabular opacity-70">{counts[f]}</span>
                </button>
              ))}
            </div>
            <div className="relative ml-auto w-full max-w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
              <Input aria-label="Search rooms" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 pl-8" />
            </div>
          </div>

          <ul className="mt-3 divide-y divide-line overflow-visible rounded-2xl border border-line bg-surface" data-testid="dash-rooms">
            {rooms === null &&
              [0, 1, 2].map((i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="h-9 w-9 animate-pulse rounded-xl bg-accent-soft" />
                  <div className="h-4 w-40 animate-pulse rounded bg-accent-soft" />
                </li>
              ))}
            {rooms !== null && shown.length === 0 && (
              <li className="px-6 py-14 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft"><Users className="h-5 w-5 text-fg-muted" /></div>
                <p className="mt-3 font-medium">{rooms.length ? "No rooms match" : "No rooms yet"}</p>
                <p className="mt-1 text-sm text-fg-muted">{rooms.length ? "Try another search or filter." : "Start one above and share the code with your friends."}</p>
              </li>
            )}
            {shown.map((r, i) => (
              <RoomRow
                key={r.code}
                room={r}
                index={i}
                onOpen={() => nav(`/r/${r.code}`)}
                onCopy={() => copyInvite(r)}
                onManage={() => setManage(r)}
                onDelete={() => setDeleting(r)}
                onRemove={() => removeFromList(r)}
              />
            ))}
          </ul>
        </div>
        )}
      </div>

      {manage && <ManageSheet room={manage} onClose={() => setManage(null)} onToast={setToast} />}
      {deleting && (
        <DeleteDialog
          room={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setRooms((list) => list?.filter((x) => x.code !== deleting.code) ?? null);
            setToast(`Deleted “${deleting.title}”`);
            setDeleting(null);
          }}
        />
      )}
      {toast && (
        <div role="status" className="toast fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-sm text-primary-fg shadow-lg">
          {toast}
        </div>
      )}
    </AppShell>
  );
}

/** A student's classes as cards, one click from home (like the class tiles in Classroom). */
function MyClassCards() {
  const mine = useMyClasses(true);
  if (!mine?.classes.length) return null;
  return (
    <section className="rise rise-2 mt-8" aria-labelledby="my-classes">
      <h2 id="my-classes" className="font-display text-xl font-bold tracking-[-0.01em]">Your classes</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2" data-testid="dash-classes">
        {mine.classes.map((c) => (
          <li key={c.code}>
            <Link to={c.href} className="press group block overflow-hidden rounded-[20px] border border-line bg-surface hover:border-line-strong" data-testid="dash-class">
              <span className="block h-16 px-5 pt-4" style={{ background: tint(c.code) }}>
                <span className="block truncate font-display text-lg font-extrabold text-ink">{c.name}</span>
              </span>
              <span className="flex items-center justify-between gap-3 px-5 py-3 text-sm text-fg-muted">
                <span className="truncate">{c.sub || "Your class"}</span>
                <span className="font-semibold text-fg group-hover:underline">Open</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RoomRow({
  room: r,
  index,
  onOpen,
  onCopy,
  onManage,
  onDelete,
  onRemove,
}: {
  room: DashRoom;
  index: number;
  onOpen: () => void;
  onCopy: () => void;
  onManage: () => void;
  onDelete: () => void;
  onRemove: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  const item = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent-soft";
  return (
    <li
      ref={ref}
      className={`stagger group relative flex items-center gap-3 px-4 py-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent-soft/50 ${menu ? "z-30" : ""}`}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
      data-testid="dash-room"
    >
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Open ${r.title}`}>
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-sm font-semibold uppercase">
          {r.title.trim()[0] ?? "R"}
          {r.online > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-green" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{r.title}</span>
            {r.isHost && <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-fg-muted" data-testid="host-badge"><Crown className="h-3 w-3" /> Host</span>}
            {r.locked && <Lock className="h-3 w-3 text-fg-subtle" aria-label="Locked" />}
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-xs text-fg-subtle">
            <span className="font-mono">{formatCode(r.code)}</span>
            <span aria-hidden>·</span>
            <span>{r.online > 0 ? `${r.online} online now` : timeAgo(r.lastAt)}</span>
          </span>
        </span>
      </button>
      <button
        onClick={() => setMenu((m) => !m)}
        aria-label={`Options for ${r.title}`}
        aria-expanded={menu}
        className="press rounded-lg p-1.5 text-fg-muted opacity-70 hover:bg-accent-soft hover:text-fg group-hover:opacity-100"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {menu && (
        <div role="menu" className="pop absolute right-3 top-12 z-20 w-52 rounded-xl border border-line bg-surface p-1 shadow-xl" style={{ ["--origin" as string]: "top right" }}>
          <button role="menuitem" className={item} onClick={onOpen}><DoorOpen className="h-4 w-4" /> Open</button>
          <button role="menuitem" className={item} onClick={() => (setMenu(false), onCopy())}><Copy className="h-4 w-4" /> Copy invite link</button>
          {r.isHost ? (
            <>
              <button role="menuitem" className={item} onClick={() => (setMenu(false), onManage())}><Users className="h-4 w-4" /> Manage party</button>
              <div className="my-1 h-px bg-line" />
              <button role="menuitem" className={`${item} text-red-600 dark:text-red-400`} onClick={() => (setMenu(false), onDelete())}><Trash2 className="h-4 w-4" /> Delete room</button>
            </>
          ) : (
            <button role="menuitem" className={item} onClick={() => (setMenu(false), onRemove())}><X className="h-4 w-4" /> Remove from my list</button>
          )}
        </div>
      )}
    </li>
  );
}

/** Host tools: everyone who's been in the room, with Kick / Ban, and the banned list with Unban. */
export function ManageSheet({ room, onClose, onToast }: { room: { code: string; title: string }; onClose: () => void; onToast: (t: string) => void }) {
  const [state, setState] = useState<ManageState | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch(`/api/rooms/${room.code}/manage`)
      .then(async (r) => (r.ok ? setState((await r.json()) as ManageState) : setErr(((await r.json()) as { error?: string }).error ?? "Couldn't load.")))
      .catch(() => setErr("Couldn't load."));
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [room.code]);

  const act = async (action: "kick" | "ban" | "unban", p: { uid: string; name: string }) => {
    const r = await fetch(`/api/rooms/${room.code}/manage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, uid: p.uid }),
    });
    if (r.ok) setState((await r.json()) as ManageState);
    onToast(action === "kick" ? `Removed ${p.name}` : action === "ban" ? `Banned ${p.name}` : `Unbanned ${p.name}`);
  };

  const banned = new Set(state?.bans.map((b) => b.uid));
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={`Manage party: ${room.title}`}>
      <button className="fade absolute inset-0 bg-black/30" aria-label="Close" onClick={onClose} />
      <div className="sheet absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-line bg-bg shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="font-semibold">Manage party</h2>
            <p className="text-sm text-fg-muted">{room.title}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close manage party" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {err && <p className="text-sm text-red-600">{err}</p>}
          {!state && !err && <p className="text-sm text-fg-muted">Loading…</p>}
          {state && (
            <PartyLists
              people={state.people.filter((p) => !banned.has(p.uid))}
              bans={state.bans}
              onAct={act}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DeleteDialog({ room, onClose, onDeleted }: { room: DashRoom; onClose: () => void; onDeleted: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ok = normalizeCode(typed) === room.code;
  const del = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    const r = await fetch(`/api/rooms/${room.code}`, { method: "DELETE" });
    setBusy(false);
    if (r.ok) onDeleted();
    else setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't delete the room.");
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="del-title">
      <button className="fade absolute inset-0 bg-black/40" aria-label="Cancel" onClick={onClose} />
      <form onSubmit={del} className="pop relative w-full max-w-sm rounded-2xl border border-line bg-bg p-5 shadow-2xl" style={{ ["--origin" as string]: "center" }}>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10"><Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" /></div>
        <h2 id="del-title" className="mt-3 text-lg font-semibold">Delete “{room.title}”?</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Everyone in it will be sent out, and the chat, files and uploads are erased for good. This can't be undone.
        </p>
        <label htmlFor="del-code" className="mt-4 block text-sm">
          Type the code <span className="font-mono font-semibold">{formatCode(room.code)}</span> to confirm
        </label>
        <Input id="del-code" autoFocus value={typed} onChange={(e) => setTyped(formatCode(e.target.value))} className="mt-1.5 font-mono" />
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="danger" disabled={!ok || busy} data-testid="confirm-delete">{busy ? "Deleting…" : "Delete room"}</Button>
        </div>
      </form>
    </div>
  );
}
