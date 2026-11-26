import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useAccount } from "../lib/account";
import { ageConfirmed, confirmAge } from "../lib/identity";
import { Input, Logo } from "../components/ui";
import { TourScene, type SceneSpec } from "../components/TourScene";
import { MINT, PERI, TEAL } from "../components/Rocks";
import { cleanName, SUBJECTS, type Subject, type Teach } from "../../shared/onboarding";
import { formatCode, isValidCode, normalizeCode } from "../../shared/code";

/**
 * The first-time welcome. One question per screen, then a few honest screens on what Cairn
 * does for you. Teachers and students get different paths; students who arrived through a
 * class link already answered the basics, so they only see the fun part.
 */

type Role = "teacher" | "student";
type StepId = "role" | "name" | "teach" | "t1" | "t2" | "t3" | "age" | "s1" | "s2" | "s3" | "code";

interface Copy {
  title: string;
  body?: string;
  scene: (v: { name: string; code: string }) => SceneSpec;
}

const COPY: Record<Exclude<StepId, "role">, Copy> = {
  name: {
    title: "What do your students call you?",
    body: "This is the name on your classes, comments and grades.",
    scene: (v) => ({ kind: "hello", name: v.name, body: TEAL }),
  },
  teach: {
    title: "What do you teach?",
    body: "Pick any that fit. Cairn uses this to put the right assignment templates first.",
    scene: () => ({ kind: "teach" }),
  },
  t1: {
    title: "One link per assignment.",
    body: "Post it to Google Classroom once. The first time each student clicks it, they land in their own room, or their group's.",
    scene: () => ({ kind: "link" }),
  },
  t2: {
    title: "See who did what.",
    body: "Every project keeps a work record: who wrote what, what got pasted, and what the AI did. You can even replay how a doc was written. No guessing, and no AI detectors.",
    scene: () => ({ kind: "receipt" }),
  },
  t3: {
    title: "Grade in one screen.",
    body: "The work, the record and your answer key sit side by side. Save & next opens the next student, so you never dig through a list.",
    scene: () => ({ kind: "grade" }),
  },
  age: {
    title: "Quick check.",
    body: "Cairn is for people 13 and older. Don't worry, this is the only quiz in here.",
    scene: () => ({ kind: "age" }),
  },
  s1: {
    title: "Your work has your name on it.",
    body: "Every word you write counts as yours. No more carrying the group and getting the same grade as the teammate who vanished.",
    scene: () => ({ kind: "write" }),
  },
  s2: {
    title: "A tutor, not a ghostwriter.",
    body: "Stuck? Ask the AI. It helps you figure it out instead of doing it for you, and your teacher decides how much it can help.",
    scene: () => ({ kind: "tutor" }),
  },
  s3: {
    title: "Group projects, minus the drama.",
    body: "Split up the tasks, chat right next to your work, and turn in a receipt that shows who did what. Your teacher sees exactly what you see.",
    scene: () => ({ kind: "group" }),
  },
  code: {
    title: "Got a class code?",
    body: "It's in your teacher's Google Classroom post, and looks like ABC-123.",
    scene: (v) => ({ kind: "code", code: v.code ? formatCode(normalizeCode(v.code)) : undefined }),
  },
};
const STUDENT_NAME: Copy = {
  title: "What should your classmates call you?",
  body: "Your teacher sees it too, so make it a name they'll recognize.",
  scene: (v) => ({ kind: "hello", name: v.name, body: PERI }),
};

async function post(body: unknown): Promise<{ error?: string }> {
  const r = await fetch("/api/auth/onboarding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return (r.json() as Promise<{ error?: string }>).catch(() => ({ error: "Something went wrong. Try again." }));
}

export default function Welcome() {
  const account = useAccount();
  const nav = useNavigate();
  const u = account.user;
  const [role, setRole] = useState<Role | null>(null);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<"next" | "back">("next");
  const [name, setName] = useState("");
  const [teach, setTeach] = useState<Teach>({ subjects: [], grades: [] });
  const [age, setAge] = useState(ageConfirmed);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "Welcome · Cairn";
    return () => void (document.title = "Cairn");
  }, []);
  useEffect(() => {
    if (u === null) nav("/", { replace: true });
    if (!u) return;
    if (u.onboarded) return nav(u.role === "teacher" ? "/classes" : "/dashboard", { replace: true });
    setRole(u.role ?? null);
    setName(u.name ?? "");
    if (u.teach) setTeach(u.teach);
  }, [u?.id]);

  const had = !!u?.role;
  const steps: StepId[] = useMemo(() => {
    const pre: StepId[] = had ? [] : ["role"];
    if (!role) return ["role"];
    if (role === "teacher") return [...pre, "name", "teach", "t1", "t2", "t3"];
    return had ? ["s1", "s2", "s3"] : [...pre, "name", "age", "s1", "s2", "s3", "code"];
  }, [role, had]);
  const idx = Math.min(i, steps.length - 1);
  const cur = steps[idx];
  const last = idx >= steps.length - 1;
  // The progress bar counts the whole path, even before a role is picked.
  const total = role ? steps.length : 6;
  const progress = Math.round(((idx + (cur === "role" ? 0.4 : 1)) / total) * 100);

  const go = (d: 1 | -1) => {
    setErr("");
    setDir(d > 0 ? "next" : "back");
    setI((x) => Math.max(0, Math.min(steps.length - 1, x + d)));
  };

  const finish = async (then: string) => {
    if (!role) return;
    setBusy(true);
    setErr("");
    const body = role === "teacher" ? { role, name: cleanName(name) || undefined, teach } : had ? { role } : { role, name: cleanName(name) || undefined, ageOk: age };
    const d = await post(body);
    setBusy(false);
    if (d.error) return setErr(d.error);
    nav(then);
  };

  const joinWithCode = async () => {
    const c = normalizeCode(code);
    if (!isValidCode(c)) return setErr("Class codes are 6 letters and numbers, like ABC-123.");
    setBusy(true);
    const r = await fetch(`/api/classes/join/${c}`).catch(() => null);
    setBusy(false);
    if (!r || !(r.ok || r.status === 401)) return setErr("That code doesn't match a class. Check the letters and try again.");
    await finish(`/c/${c}`);
  };

  const canGo =
    cur === "name" ? !!cleanName(name) : cur === "age" ? age : true;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canGo || busy) return;
    if (cur === "age") confirmAge();
    if (cur === "code") return void joinWithCode();
    if (last) return void finish(role === "teacher" ? "/classes" : "/dashboard");
    go(1);
  };

  if (!u) return <div className="min-h-full bg-bg" />;

  const tint = role === "teacher" ? TEAL : role === "student" ? PERI : MINT;
  const copy = cur === "role" ? null : cur === "name" && role === "student" ? STUDENT_NAME : COPY[cur];
  const cta =
    cur === "t3" ? "Make my first class" : cur === "code" ? "Join class" : last ? "Let's go" : "Continue";

  return (
    <div className="flex min-h-full flex-col bg-bg" data-testid="welcome" data-step={cur}>
      <header className="mx-auto flex w-full max-w-xl items-center gap-3 px-4 pt-5">
        {idx > 0 ? (
          <button onClick={() => go(-1)} className="press -ml-2.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Back" data-testid="welcome-back">
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <Logo className="h-9 w-9 shrink-0" />
        )}
        <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-[var(--ease-out)]" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pb-6 pt-6 sm:flex-none sm:pb-16 sm:pt-10">
        {/* Screen readers hear which step they're on. */}
        <p className="sr-only" aria-live="polite">
          {cur === "role" ? "Step 1: teacher or student." : `Step ${idx + 1} of ${steps.length}: ${(cur === "name" && role === "student" ? STUDENT_NAME : COPY[cur as Exclude<StepId, "role">]).title}`}
        </p>
        <div key={cur} className={`flex-1 sm:flex-none ${dir === "next" ? "wel-next" : "wel-back"}`}>
          {cur === "role" ? (
            <RolePick
              onPick={(r) => {
                setRole(r);
                setErr("");
                setDir("next");
                setI(1);
              }}
            />
          ) : (
            copy && (
              <>
                <div className="flex items-center justify-center rounded-[28px] px-4 py-5" style={{ background: `color-mix(in srgb, ${tint} 38%, var(--bg))` }}>
                  <TourScene spec={copy.scene({ name: cleanName(name), code })} className="h-[150px] w-full max-w-[300px] sm:h-[176px]" />
                </div>
                <h1 className="mt-7 font-display text-[clamp(1.75rem,5.2vw,2.4rem)] font-extrabold leading-[1.06] tracking-[-0.03em] [text-wrap:balance]" data-testid="welcome-title">
                  {copy.title}
                </h1>
                {copy.body && <p className="mt-3 max-w-[52ch] text-[1.0625rem] leading-relaxed text-fg-muted [text-wrap:pretty]">{copy.body}</p>}
                {cur === "name" && (
                  <Input
                    autoFocus
                    maxLength={32}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={role === "teacher" ? "e.g. Ms. Rivera" : "Your name"}
                    aria-label="Your name"
                    className="mt-6 h-12 text-base focus-visible:outline-none"
                    data-testid="welcome-name"
                  />
                )}
                {cur === "teach" && <TeachPick teach={teach} onChange={setTeach} />}
                {cur === "age" && (
                  <label className="choice-card mt-6 flex cursor-pointer items-center gap-3 px-4 py-4" aria-checked={age} data-testid="welcome-age">
                    <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} className="h-5 w-5 accent-[#44cf6c]" data-testid="age-13" />
                    <span className="font-semibold">I'm 13 or older</span>
                  </label>
                )}
                {cur === "age" && !age && <p className="mt-3 text-sm text-fg-muted">Check the box to keep going.</p>}
                {cur === "code" && (
                  <Input
                    autoFocus
                    value={code}
                    onChange={(e) => (setCode(e.target.value.toUpperCase()), setErr(""))}
                    maxLength={8}
                    placeholder="ABC-123"
                    aria-label="Class code"
                    aria-invalid={!!err}
                    aria-describedby={err ? "welcome-err" : undefined}
                    className={`mt-6 h-[52px] font-display text-lg font-bold uppercase tracking-[0.14em] focus-visible:outline-none ${err ? "border-red-500 focus:border-red-500 focus:ring-red-500/15" : ""}`}
                    data-testid="welcome-code"
                  />
                )}
              </>
            )
          )}
          {err && (
            <p id="welcome-err" className="mt-3 text-sm font-semibold text-red-600 dark:text-red-400" role="alert">
              {err}
            </p>
          )}
        </div>

        {last && !had && cur !== "role" && (
          <p className="mt-8 text-sm text-fg-muted" data-testid="welcome-role-note">
            You're signing up as a <b className="font-semibold text-fg">{role}</b>. This can't be changed later.{" "}
            <button
              type="button"
              onClick={() => {
                setErr("");
                setDir("back");
                setI(0);
              }}
              className="font-semibold text-fg underline underline-offset-2 hover:text-fg-muted"
              data-testid="welcome-change-role"
            >
              Change
            </button>
          </p>
        )}
        {cur !== "role" && (
          <div className="mt-8 flex flex-col-reverse gap-3 sm:mt-10 sm:flex-row sm:items-center sm:justify-end">
            {cur === "code" && (
              <button type="button" disabled={busy} onClick={() => void finish("/dashboard")} className="press rounded-[14px] px-5 py-3 font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg" data-testid="welcome-no-code">
                Not yet
              </button>
            )}
            {cur === "teach" && !teach.subjects.length && <span className="text-center text-sm text-fg-subtle sm:mr-auto">You can skip this.</span>}
            <button type="submit" disabled={!canGo || busy} className="ledge-btn w-full sm:w-auto sm:min-w-[200px]" data-testid="welcome-next">
              {cta} <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

function RolePick({ onPick }: { onPick: (r: Role) => void }) {
  const card = (r: Role, title: string, sub: string, tint: string) => (
    <button type="button" onClick={() => onPick(r)} className="choice-card group flex flex-col overflow-hidden bg-bg text-left" data-testid={`welcome-${r}`}>
      <span className="flex items-center justify-center px-3 py-3" style={{ background: `color-mix(in srgb, ${tint} 42%, var(--bg))` }}>
        <TourScene spec={{ kind: r === "teacher" ? "teach" : "student" }} className="h-[112px] w-full max-w-[268px] transition-transform sm:h-[156px] duration-300 ease-[var(--ease-out)] group-hover:scale-[1.04]" />
      </span>
      <span className="px-5 pb-5 pt-4">
        <span className="block font-display text-xl font-extrabold tracking-[-0.02em]">{title}</span>
        <span className="mt-1 block text-[15px] text-fg-muted">{sub}</span>
      </span>
    </button>
  );
  return (
    <>
      <h1 className="font-display text-[clamp(1.9rem,5.6vw,2.6rem)] font-extrabold leading-[1.04] tracking-[-0.03em] [text-wrap:balance]">Welcome to Cairn! Who's here?</h1>
      <p className="mt-3 text-[1.0625rem] text-fg-muted">Pick one so you get the right tools. You only pick once.</p>
      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        {card("teacher", "I'm a teacher", "Make classes, post assignments and grade.", TEAL)}
        {card("student", "I'm a student", "Do assignments, on your own or with your group.", PERI)}
      </div>
    </>
  );
}

function TeachPick({ teach, onChange }: { teach: Teach; onChange: React.Dispatch<React.SetStateAction<Teach>> }) {
  const toggle = <K extends keyof Teach>(k: K, v: Teach[K][number]) =>
    onChange((t) => {
      const list = t[k] as string[];
      return { ...t, [k]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] };
    });
  return (
    <div className="mt-6">
      <fieldset>
        <legend className="sr-only">Subjects</legend>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Subjects">
          {SUBJECTS.map((s) => (
            <button key={s.id} type="button" role="checkbox" aria-checked={teach.subjects.includes(s.id)} onClick={() => toggle("subjects", s.id as Subject)} className="chip-pick" data-testid={`subject-${s.id}`}>
              {s.label}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
