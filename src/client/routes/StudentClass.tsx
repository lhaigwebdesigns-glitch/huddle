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
import { TourButton, useAutoTour } from "../components/Tour";
import { AppShell, refreshMyClasses } from "../components/AppShell";
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
  // The class page tour: once they're in and there's something to open.
  useAutoTour("student-class", !aid && !!view?.joined && view.assignments.length > 0, account.user?.tours ?? [], signedIn);

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

  useEffect(() => {
    if (view?.joined) refreshMyClasses();
  }, [view?.joined]);

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
    // In the class: a real page. The next thing due gets the one green button.
    const open = view.assignments.filter((x) => !x.turnedIn);
    const next = [...open].sort((x, y) => (x.dueAt ?? Infinity) - (y.dueAt ?? Infinity))[0];
    return (
      <div>
        <h1 className="font-display text-[2rem] font-extrabold leading-tight tracking-[-0.03em]" data-testid="student-class-name">{view.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[15px] text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-4 w-4 text-primary" /> You're in this class
          </span>
          {view.teacher && <span>· {view.teacher}</span>}
        </p>
        {account.user === null && !account.requireSignIn && account.providers.includes("google") && (
          <p className="mt-2 text-xs text-fg-subtle">
            Using more than one device?{" "}
            <a href={signInUrl("google", `/c/${code}`)} className="font-medium text-fg-muted underline underline-offset-2 hover:text-fg" data-testid="student-google">
              Sign in with your school Google account
            </a>{" "}
            to keep this class everywhere.
          </p>
        )}
        <h2 className="mt-10 font-display text-xl font-bold tracking-[-0.01em]">Your assignments</h2>
        {view.assignments.length === 0 && (
          <div className="mt-3 rounded-[20px] border border-dashed border-line-strong px-6 py-10 text-center">
            <RockArt className="mx-auto h-16 w-16" body={PERI} pose="sit" prop="book" />
            <p className="mt-3 font-semibold">Nothing yet</p>
            <p className="mt-1 text-sm text-fg-muted">Your teacher's assignments will show up here.</p>
          </div>
        )}
        <ul className="mt-4 space-y-3" data-tour="assignments">
          {view.assignments.map((x, i) => {
            const isNext = x.id === next?.id;
            const status = x.turnedIn ? "Turned in" : x.roomCode ? "Working" : "Not started";
            const chip = x.turnedIn ? "bg-mint text-ink dark:bg-mint/15 dark:text-mint" : x.roomCode ? "bg-peri/35 text-ink dark:bg-peri/20 dark:text-fg" : "bg-surface-2 text-fg-muted";
            return (
              <li
                key={x.id}
                className={`flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[20px] border px-5 py-4 ${isNext ? "border-fg/20 bg-surface shadow-[0_10px_30px_-18px_rgba(10,16,13,0.35)]" : "border-line"}`}
                data-testid="student-assignment"
              >
                <BookOpen className="h-5 w-5 shrink-0 text-fg-muted" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[1.05rem] font-semibold">{x.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip}`}>{status}</span>
                    {isNext && <span className="text-xs font-semibold text-fg-muted">Up next</span>}
                  </div>
                  <p className="mt-0.5 text-sm text-fg-subtle">
                    {x.mode === "solo" ? "Your own work" : (x.groupName ?? "Group project")}
                    {dueText(x.dueAt)}
                  </p>
                </div>
                <Link
                  to={assignmentPath(code, x.id)}
                  className={
                    isNext
                      ? "ledge-btn h-11 px-5 text-[15px]"
                      : "press inline-flex h-10 items-center gap-1.5 rounded-xl border border-line-strong px-4 text-sm font-semibold hover:bg-surface-2"
                  }
                  data-testid="open-group-room"
                  data-tour={i === 0 ? "open-work" : undefined}
                >
                  {x.turnedIn ? "View" : x.mode === "solo" ? "Open your work" : "Open your group's room"} <ArrowRight className="h-4 w-4" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  })();

  // Signed in: inside the app (sidebar with your classes and rooms). In the class it's a full
  // page; joining, waiting and opening stay a focused card.
  const page = !!view?.joined && !aid;
  const body = page ? (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-8 sm:px-8 sm:pt-10" data-testid="student-class">
      {card}
    </div>
  ) : (
    <div className="flex justify-center px-4 pb-16 pt-[8vh]">
      <div className="rise w-full max-w-lg rounded-[28px] border border-line bg-bg p-8 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.18)]" data-testid="student-class">
        {card}
      </div>
    </div>
  );
  if (account.user)
    return (
      <AppShell account={account.user} isAdmin={account.isAdmin}>
        {body}
      </AppShell>
    );
  return (
    <div className="flex min-h-full flex-col bg-sidebar">
      <header className="flex h-14 items-center gap-2 px-4">
        <Link to="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <Logo className="h-7 w-7" /> <span className="font-display text-[17px] font-extrabold tracking-tight">Cairn</span>
        </Link>
        <span className="flex-1" />
        <TourButton />
        <ThemeToggle />
      </header>
      <main className="flex-1">{body}</main>
    </div>
  );
}
