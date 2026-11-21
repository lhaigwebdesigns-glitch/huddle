import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, BookOpen, Check } from "lucide-react";
import { getIdentity, setName } from "../lib/identity";
import { signInUrl, useAccount } from "../lib/account";
import { Button, Input, Logo, ThemeToggle } from "../components/ui";
import { normalizeCode } from "../../shared/code";
import type { StudentClassView } from "../../shared/classes";

/** /c/:code: a student joins a class with its code, then sees their assignments and group rooms. */
export default function StudentClass() {
  const code = normalizeCode(useParams().code ?? "");
  const [me] = useState(() => getIdentity());
  const [view, setView] = useState<StudentClassView | null>(null);
  const [err, setErr] = useState("");
  const [name, setNameInput] = useState(me.name);
  const account = useAccount();
  const load = () =>
    fetch(`/api/classes/join/${code}?uid=${encodeURIComponent(me.uid)}`)
      .then((r) => r.json() as Promise<StudentClassView & { error?: string }>)
      .then((d) => (d.error ? setErr(d.error) : setView(d)));
  useEffect(() => void load(), [code]);
  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setName(name.trim());
    const r = await fetch(`/api/classes/join/${code}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uid: me.uid, name: name.trim() }),
    });
    const d = (await r.json()) as { error?: string };
    if (d.error) return setErr(d.error);
    load();
  };
  return (
    <div className="flex min-h-full flex-col bg-sidebar">
      <header className="flex h-14 items-center gap-2 px-4">
        <Link to="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <Logo className="h-6 w-6" /> Huddle
        </Link>
        <span className="flex-1" />
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-[8vh]">
        <div className="rise w-full max-w-md rounded-[24px] border border-line bg-bg p-7 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.18)]" data-testid="student-class">
          {err && !view ? (
            <p className="text-sm text-fg-muted">{err}</p>
          ) : !view ? (
            <p className="text-sm text-fg-subtle">Loading…</p>
          ) : !view.joined ? (
            <form onSubmit={join}>
              <div className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Join a class</div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{view.name}</h1>
              <p className="mt-1.5 text-[15px] text-fg-muted">Type your name the way your teacher will recognize it.</p>
              <Input autoFocus maxLength={32} value={name} onChange={(e) => setNameInput(e.target.value)} placeholder="Your name" aria-label="Your name" className="mt-5 h-11" />
              {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">{err}</p>}
              <Button className="mt-3 w-full" size="lg" data-testid="join-class">
                Join class <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          ) : (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-fg-subtle">
                <Check className="h-3.5 w-3.5" /> You're in this class
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{view.name}</h1>
              {account.user === null && account.providers.includes("google") && (
                <p className="mt-2 text-xs text-fg-subtle">
                  Using more than one device?{" "}
                  <a href={signInUrl("google", `/c/${code}`)} className="font-medium text-fg-muted underline underline-offset-2 hover:text-fg" data-testid="student-google">
                    Sign in with your school Google account
                  </a>{" "}
                  to keep this class everywhere.
                </p>
              )}
              <h2 className="mt-6 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Your assignments</h2>
              {view.assignments.length === 0 && <p className="mt-2 text-sm text-fg-muted">Nothing yet. Your teacher's group projects will show up here.</p>}
              <ul className="mt-2 space-y-2">
                {view.assignments.map((a) => (
                  <li key={a.id} className="rounded-2xl border border-line px-4 py-3" data-testid="student-assignment">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 shrink-0 text-fg-muted" />
                      <span className="min-w-0 flex-1 font-medium">{a.title}</span>
                      {a.turnedIn && <span className="text-xs text-fg-subtle">Turned in</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      {a.groupName ?? "Your teacher hasn't put you in a group yet"}
                      {a.dueAt && ` · due ${new Date(a.dueAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
                    </p>
                    {a.roomCode && (
                      <Link to={`/r/${a.roomCode}`} className="press mt-2.5 inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover" data-testid="open-group-room">
                        Open your group's room <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
