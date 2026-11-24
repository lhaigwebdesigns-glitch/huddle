import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, BookOpen, Check } from "lucide-react";
import { ageConfirmed, confirmAge, getIdentity, setName } from "../lib/identity";
import { AgeCheck } from "./RoomPage";
import { signInUrl, useAccount } from "../lib/account";
import { Button, Input, Logo, ThemeToggle } from "../components/ui";
import { PERI, RockArt } from "../components/Rocks";
import { HumanCheck, SignInGate } from "../components/SignInGate";
import { normalizeCode } from "../../shared/code";
import { assignmentPath, type AssignmentMode, type StudentClassView } from "../../shared/classes";

type AssignmentInfo = { className: string; title: string; mode: AssignmentMode; dueAt?: number };

const dueText = (ms?: number) => (ms ? ` · due ${new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "");

/**
 * /c/:code: a student joins a class with its code, then sees their assignments.
 * /c/:code/a/:aid: an assignment link (what teachers post to Classroom). After joining if
 * needed, it opens the student's own room (solo) or their group's room, made on first open.
 */
export default function StudentClass() {
  const params = useParams();
  const code = normalizeCode(params.code ?? "");
  const aid = params.aid ?? "";
  const nav = useNavigate();
  const [me] = useState(() => getIdentity());
  const [view, setView] = useState<StudentClassView | null>(null);
  const [info, setInfo] = useState<AssignmentInfo | null>(null);
  const [err, setErr] = useState("");
  const [opening, setOpening] = useState(false);
  const [name, setNameInput] = useState(me.name);
  const [age, setAge] = useState(ageConfirmed);
  const account = useAccount();
  const signedIn = !!account.user;
  const [human, setHuman] = useState("");
  const opened = useRef(false);

  const load = () =>
    fetch(`/api/classes/join/${code}?uid=${encodeURIComponent(me.uid)}`)
      .then((r) => r.json() as Promise<StudentClassView & { error?: string }>)
      .then((d) => (d.error ? setErr(d.error) : setView(d)));

  /** Finds or makes this student's room for the assignment, then goes there. */
  const openAssignment = async () => {
    if (opened.current) return;
    opened.current = true;
    setOpening(true);
    setErr("");
    const r = await fetch(`/api/classes/join/${code}/a/${aid}/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uid: me.uid }),
    });
    const d = (await r.json().catch(() => ({}))) as { roomCode?: string; needsJoin?: boolean; error?: string };
    if (d.roomCode) return nav(`/r/${d.roomCode}`, { replace: true });
    opened.current = false;
    setOpening(false);
    if (!d.needsJoin) setErr(d.error ?? "Couldn't open the assignment. Try again.");
  };

  useEffect(() => {
    if (!account.ready || (account.requireSignIn && !account.user)) return;
    void load();
    if (aid)
      fetch(`/api/classes/join/${code}/a/${aid}`)
        .then((r) => r.json() as Promise<AssignmentInfo & { error?: string }>)
        .then((d) => (d.error ? setErr(d.error) : setInfo(d)));
  }, [code, aid, account.ready, account.user?.uid]);

  // While waiting for the teacher, check every few seconds so the page opens as soon as they say yes.
  useEffect(() => {
    if (view?.status !== "waiting") return;
    const t = setInterval(() => void load(), 6000);
    return () => clearInterval(t);
  }, [view?.status]);

  // An assignment link opens the room straight away once the student is in the class.
  useEffect(() => {
    if (aid && view?.joined && info) void openAssignment();
  }, [aid, view?.joined, info]);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signedIn && !name.trim()) return;
    if (!age) return setErr("Cairn is for ages 13 and up. Please check the box to confirm.");
    if (!signedIn) setName(name.trim());
    confirmAge();
    const r = await fetch(`/api/classes/join/${code}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uid: me.uid, name: name.trim(), age13: true, human }),
    });
    const d = (await r.json()) as { error?: string };
    if (d.error) return setErr(d.error);
    setErr("");
    load();
  };

  if (!account.ready) return <div className="p-8 text-sm text-fg-subtle">Loading…</div>;
  if (account.requireSignIn && !account.user)
    return (
      <SignInGate
        title={aid ? "Sign in to open your assignment" : "Sign in to join your class"}
        message="Use your school Google account, so your teacher knows it's you."
        providers={account.providers}
      />
    );

  const card = (() => {
    if (err && !view) return <p className="text-sm text-fg-muted">{err}</p>;
    if (!view || (aid && !info && !err)) return <p className="text-sm text-fg-subtle">Loading…</p>;
    if (view.status === "waiting")
      return (
        <div className="text-center" role="status" data-testid="waiting-for-teacher">
          <RockArt className="mx-auto h-20 w-20" body={PERI} pose="sit" prop="bubble" />
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Waiting for your teacher</h1>
          <p className="mt-2 text-[15px] text-fg-muted">
            Your email isn't on the class list for {view.name} yet, so we asked your teacher to let you in. This page opens by itself as soon as they do.
          </p>
          {account.user?.email && <p className="mt-3 text-sm text-fg-subtle">Signed in as {account.user.email}</p>}
        </div>
      );
    if (view.status === "denied")
      return (
        <div className="text-center" role="status" data-testid="join-denied">
          <RockArt className="mx-auto h-20 w-20" body={PERI} pose="hold" prop="book" />
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Your teacher didn't let you in</h1>
          <p className="mt-2 text-[15px] text-fg-muted">
            If that's a mistake, ask them to add {account.user?.email ?? "your school email"} to the class list for {view.name}, then open the link again.
          </p>
        </div>
      );
    if (!view.joined)
      return (
        <form onSubmit={join}>
          <RockArt className="mb-2 h-16 w-16" body={PERI} pose="wave" />
          <h1 className="text-2xl font-extrabold tracking-tight">{info ? info.title : `Join ${view.name}`}</h1>
          {info && <p className="mt-1 text-sm text-fg-subtle">{view.name + " · " + (info.mode === "solo" ? "Your own work" : "Group project") + dueText(info.dueAt)}</p>}
          {signedIn ? (
            <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm" data-testid="joining-as">
              Joining as <b>{account.user!.name}</b>
              {account.user!.email && <span className="text-fg-subtle"> · {account.user!.email}</span>}
            </p>
          ) : (
            <>
              <p className="mt-3 text-[15px] text-fg-muted">Type your name the way your teacher will recognize it.</p>
              <Input autoFocus maxLength={32} value={name} onChange={(e) => setNameInput(e.target.value)} placeholder="Your name" aria-label="Your name" className="mt-4 h-11" />
            </>
          )}
          <AgeCheck checked={age} onChange={setAge} />
          <HumanCheck siteKey={account.turnstileSiteKey} onToken={setHuman} />
          {err && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
              {err}
            </p>
          )}
          <Button className="mt-3 w-full" size="lg" data-testid="join-class">
            {info ? "Start" : "Join class"} <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
      );
    if (aid)
      return (
        <div role="status" data-testid="opening-assignment">
          <h1 className="text-2xl font-extrabold tracking-tight">{info?.title}</h1>
          <p className="mt-1 text-sm text-fg-subtle">{view.name}</p>
          <p className="mt-3 text-[15px] text-fg-muted">{opening ? "Opening your room…" : err || "Getting things ready…"}</p>
          {err && !opening && (
            <Button className="mt-4 w-full" onClick={() => void openAssignment()}>
              Try again
            </Button>
          )}
          <Link to={`/c/${code}`} className="mt-4 inline-block text-sm text-fg-muted underline underline-offset-2 hover:text-fg">
            See all your assignments
          </Link>
        </div>
      );
    return (
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{view.name}</h1>
        <div className="mt-1 flex items-center gap-1.5 text-sm text-fg-subtle">
          <Check className="h-3.5 w-3.5" /> You're in this class
        </div>
        {account.user === null && !account.requireSignIn && account.providers.includes("google") && (
          <p className="mt-2 text-xs text-fg-subtle">
            Using more than one device?{" "}
            <a href={signInUrl("google", `/c/${code}`)} className="font-medium text-fg-muted underline underline-offset-2 hover:text-fg" data-testid="student-google">
              Sign in with your school Google account
            </a>{" "}
            to keep this class everywhere.
          </p>
        )}
        <h2 className="mt-6 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Your assignments</h2>
        {view.assignments.length === 0 && <p className="mt-2 text-sm text-fg-muted">Nothing yet. Your teacher's assignments will show up here.</p>}
        <ul className="mt-2 space-y-2">
          {view.assignments.map((a) => (
            <li key={a.id} className="rounded-2xl border border-line px-4 py-3" data-testid="student-assignment">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1 font-medium">{a.title}</span>
                {a.turnedIn && <span className="text-xs text-fg-subtle">Turned in</span>}
              </div>
              <p className="mt-0.5 text-xs text-fg-subtle">
                {a.mode === "solo" ? "Your own work" : (a.groupName ?? "Group project")}
                {dueText(a.dueAt)}
              </p>
              <Link
                to={assignmentPath(code, a.id)}
                className="press mt-2.5 inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
                data-testid="open-group-room"
              >
                {a.mode === "solo" ? "Open your work" : "Open your group's room"} <ArrowRight className="h-4 w-4" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  })();

  return (
    <div className="flex min-h-full flex-col bg-sidebar">
      <header className="flex h-14 items-center gap-2 px-4">
        <Link to="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <Logo className="h-7 w-7" /> <span className="font-display text-[17px] font-extrabold tracking-tight">Cairn</span>
        </Link>
        <span className="flex-1" />
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-[8vh]">
        <div className="rise w-full max-w-md rounded-[24px] border border-line bg-bg p-7 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.18)]" data-testid="student-class">
          {card}
        </div>
      </main>
    </div>
  );
}
