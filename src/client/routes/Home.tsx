import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  Eye,
  FileText,
  GraduationCap,
  Lock,
  MessageSquareOff,
  PenTool,
  Plus,
  Presentation,
  ReceiptText,
  Sparkles,
  Table2,
  Users,
  X,
} from "lucide-react";
import { signInUrl, useAccount } from "../lib/account";
import { AccountMenu } from "../components/AccountMenu";
import { formatCode, isValidCode, normalizeCode } from "../../shared/code";
import { forgetRoom, getIdentity, recentRooms, setName } from "../lib/identity";
import { Link } from "react-router-dom";
import { Button, Input, Logo, ThemeToggle } from "../components/ui";

const H2 = "text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]";

export default function Home() {
  const nav = useNavigate();
  const me = getIdentity();
  const [name, setNameState] = useState(me.name);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const account = useAccount();
  const nameRef = useRef<HTMLInputElement>(null);
  // Guests see this device's last few rooms; signed-in people have the dashboard.
  const [recent, setRecent] = useState(() => recentRooms());

  const ensureName = () => {
    if (!name.trim()) {
      setErr("Add your name first so the room knows who you are.");
      nameRef.current?.focus();
      return false;
    }
    setName(name);
    return true;
  };

  const create = async () => {
    setErr("");
    if (!ensureName()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uid: me.uid, title: title.trim() || `${name.trim()}'s room` }),
      });
      const data = (await res.json()) as { code?: string; error?: string; signIn?: boolean };
      if (data.signIn && account.providers[0]) {
        location.href = signInUrl(account.providers[0], "/");
        return;
      }
      if (!res.ok) throw new Error(data.error || "Could not create room");
      nav(`/r/${data.code}`);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setErr("");
    if (!ensureName()) return;
    const c = normalizeCode(code);
    if (!isValidCode(c)) return setErr("Codes are 6 letters or numbers, like K7Q-29F.");
    setBusy(true);
    const res = await fetch(`/api/rooms/${c}`);
    setBusy(false);
    if (!res.ok) {
      // Not a room: it may be a class code.
      const cls = await fetch(`/api/classes/join/${c}`);
      if (cls.ok) return nav(`/c/${c}`);
      return setErr("That code doesn't match a room or a class. Check the letters and try again.");
    }
    nav(`/r/${c}`);
  };

  // Sections below the hero reveal once as they scroll into view.
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>("main > section:not(:first-child)")];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    for (const el of els) {
      el.classList.add("reveal");
      io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  const toStart = () => {
    document.getElementById("start")?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => nameRef.current?.focus({ preventScroll: true }), 350);
  };
  const toPilot = () => document.getElementById("pilot")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="min-h-full bg-bg">
      {/* Nav */}
      <header className="glass sticky top-0 z-30 border-b border-line/60 bg-bg/75 backdrop-blur-xl backdrop-saturate-150">
        <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
            <Logo className="h-7 w-7" /> Huddle
          </a>
          <div className="hidden items-center gap-6 text-sm text-fg-muted md:flex">
            <a href="#teachers" className="transition-colors hover:text-fg">For teachers</a>
            <a href="#students" className="transition-colors hover:text-fg">For students</a>
            <a href="#how" className="transition-colors hover:text-fg">How it works</a>
            <a href="#faq" className="transition-colors hover:text-fg">FAQ</a>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {account.isAdmin && (
              <Link to="/admin" className="press rounded-full px-3 py-1.5 text-sm font-medium text-fg-muted hover:bg-accent-soft hover:text-fg" data-testid="nav-admin">
                Admin
              </Link>
            )}
            {account.user && (
              <Link to="/dashboard" className="press hidden rounded-full px-3 py-1.5 text-sm font-medium text-fg-muted hover:bg-accent-soft hover:text-fg sm:block" data-testid="nav-dashboard">
                Dashboard
              </Link>
            )}
            <AccountMenu user={account.user} providers={account.providers} />
            <span className="hidden sm:block">
              <Button size="sm" onClick={toPilot} className="rounded-full" data-testid="nav-pilot">
                Try it with a class
              </Button>
            </span>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 md:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
            <div className="text-center lg:text-left">
              <h1 className="rise font-display text-[clamp(2.6rem,7vw,5rem)] font-semibold leading-[1.03] tracking-[-0.035em]">
                Group projects where everyone gets credit.
              </h1>
              <p className="rise rise-1 mx-auto mt-6 max-w-[36rem] text-[clamp(1.05rem,2vw,1.25rem)] leading-relaxed text-fg-muted lg:mx-0">
                One shared room for the group: chat, docs, slides and an AI helper that follows the teacher's rules. Huddle keeps a record of who did what, so grades are fair and AI use is out in the open.
              </p>
              <div className="rise rise-2 mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Button size="lg" onClick={toPilot} data-testid="path-teacher">
                  <GraduationCap className="h-4 w-4" /> I'm a teacher
                </Button>
                <Button size="lg" variant="secondary" onClick={toStart} data-testid="path-student">
                  <Users className="h-4 w-4" /> I'm a student
                </Button>
              </div>
              <p className="mt-5 text-sm text-fg-subtle">Free · Ages 13+ · Works with Google Classroom</p>
            </div>
            <ReceiptPreview />
          </div>
        </section>

        {/* For teachers */}
        <section id="teachers" className="scroll-mt-16 border-t border-line bg-sidebar px-4 py-24 sm:px-6 md:py-32">
          <div className="mx-auto max-w-6xl">
            <div className="text-sm font-medium text-fg-subtle">For teachers</div>
            <h2 className={`mt-2 max-w-3xl ${H2}`}>Fair group grades, without reading every chat.</h2>
            <div className="mt-14 grid gap-4 md:grid-cols-3">
              <Tile icon={<ReceiptText className="h-6 w-6" strokeWidth={1.75} />} title="A receipt for every group">
                See what each student added to the files, the days they worked, and the notes they wrote about their part. The group turns it in with the work.
              </Tile>
              <Tile icon={<Sparkles className="h-6 w-6" strokeWidth={1.75} />} title="You set the AI rules">
                Turn the AI off, make it a tutor that gives hints but never writes the work, or allow full help. Huddle enforces it for every group.
              </Tile>
              <Tile icon={<ClipboardList className="h-6 w-6" strokeWidth={1.75} />} title="Grade in one screen">
                The group's files, their receipt and your rubric side by side. Click the scores, adjust any student's grade, and export a CSV for your gradebook.
              </Tile>
              <Tile icon={<Users className="h-6 w-6" strokeWidth={1.75} />} title="Groups made for you" className="md:col-span-1">
                Share one class code. Huddle splits the class into groups, each with its own project room, files and starter tasks from a template.
              </Tile>
              <Tile icon={<Eye className="h-6 w-6" strokeWidth={1.75} />} title="Progress, not surveillance">
                Your dashboard shows each group's tasks, last activity and whether they've turned in. You never see their chat unless a student reports a message to you.
              </Tile>
              <Tile icon={<GraduationCap className="h-6 w-6" strokeWidth={1.75} />} title="Works with Google Classroom">
                Post the class link or an assignment to Classroom in one click. Students sign in with their school Google account, or just type their name.
              </Tile>
            </div>
            <div className="mt-10 flex flex-wrap gap-3">
              <Button onClick={toPilot}>
                Try it with a class <ArrowRight className="h-4 w-4" />
              </Button>
              <Link to="/classes" className="press inline-flex h-10 items-center gap-2 rounded-xl border border-line-strong px-4 text-[15px] font-medium hover:bg-surface-2" data-testid="teacher-classes-link">
                Set up a class now
              </Link>
            </div>
          </div>
        </section>

        {/* For students */}
        <section id="students" className="scroll-mt-16 px-4 py-24 sm:px-6 md:py-32">
          <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2 md:gap-20">
            <div>
              <div className="text-sm font-medium text-fg-subtle">For students</div>
              <h2 className={`mt-2 ${H2}`}>Did all the work? Now you have proof.</h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-fg-muted">
                Huddle records what each person added, so the one who carried the group gets the credit. You always see exactly what your teacher will see.
              </p>
            </div>
            <ul className="space-y-3">
              {[
                { i: <ReceiptText className="h-5 w-5" strokeWidth={1.75} />, t: "Credit for your work", d: "Your words, slides and cells are counted as you go. Add a note about your part before you turn it in." },
                { i: <Sparkles className="h-5 w-5" strokeWidth={1.75} />, t: "One AI for the whole group", d: "It knows the assignment and the rubric. When your teacher picks tutor mode, it helps you understand instead of doing it for you." },
                { i: <MessageSquareOff className="h-5 w-5" strokeWidth={1.75} />, t: "Your chat stays yours", d: "Teachers don't read group chats. If someone posts something hurtful, you can report that one message." },
                { i: <FileText className="h-5 w-5" strokeWidth={1.75} />, t: "Everything in one place", d: "Chat, docs, slides, sheets, tasks and due dates, instead of five apps and a group text." },
              ].map((c) => (
                <li key={c.t} className="flex gap-4 rounded-3xl bg-surface-2 p-5">
                  <span className="mt-0.5 shrink-0">{c.i}</span>
                  <span>
                    <span className="block font-semibold tracking-tight">{c.t}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-fg-muted">{c.d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-16 border-t border-line bg-sidebar px-4 py-24 sm:px-6 md:py-32">
          <div className="mx-auto max-w-6xl">
            <h2 className={`max-w-2xl ${H2}`}>How it works</h2>
            <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
              {[
                { t: "Share it to your class", d: "Make a class, pick a template, and post the link to Google Classroom. Huddle sets up a room for every group." },
                { t: "Groups work together", d: "Students split up tasks, write and build in shared files, and get help from an AI that follows your rules." },
                { t: "Grade in one screen", d: "When a group turns in, you see the work, the receipt and your rubric together. Export the grades when you're done." },
              ].map((s, i) => (
                <li key={s.t} className="border-t border-line-strong pt-5">
                  <div className="font-mono text-sm text-fg-subtle tabular">{i + 1}</div>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight">{s.t}</h3>
                  <p className="mt-2 max-w-sm leading-relaxed text-fg-muted">{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* AI settings */}
        <section className="px-4 py-24 sm:px-6 md:py-32">
          <div className="mx-auto max-w-6xl">
            <h2 className={`max-w-3xl ${H2}`}>
              Three AI settings. <span className="text-fg-subtle">The teacher picks one, and everyone can see which.</span>
            </h2>
            <div className="mt-14 grid gap-4 md:grid-cols-3" data-testid="ai-settings">
              {[
                { t: "AI off", d: "No AI in the project. Students can also be blocked from pasting text from outside Huddle, shown openly, with exceptions for accessibility tools." },
                { t: "Tutor only", d: "The AI explains, asks questions and gives one hint at a time. It can look things up but can't write the work or make files." },
                { t: "Full help", d: "The AI researches, drafts and builds docs, sheets and slides with the group. What it wrote is labelled, never hidden." },
              ].map((c) => (
                <article key={c.t} className="rounded-[28px] border border-line p-7">
                  <h3 className="text-lg font-semibold tracking-tight">{c.t}</h3>
                  <p className="mt-2 leading-relaxed text-fg-muted">{c.d}</p>
                </article>
              ))}
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-5">
              <Tile icon={<FileText className="h-6 w-6" strokeWidth={1.75} />} title="Docs">Images, tables, checklists, and school-format PDF and Word export.</Tile>
              <Tile icon={<Presentation className="h-6 w-6" strokeWidth={1.75} />} title="Slides">Free layout, presenter mode, and an owner for every slide.</Tile>
              <Tile icon={<Table2 className="h-6 w-6" strokeWidth={1.75} />} title="Sheets">Real formulas and charts for data and lab results.</Tile>
              <Tile icon={<ClipboardList className="h-6 w-6" strokeWidth={1.75} />} title="Forms">Surveys with a public link; answers land in a sheet.</Tile>
              <Tile icon={<PenTool className="h-6 w-6" strokeWidth={1.75} />} title="Whiteboards">Brainstorms, mind maps and timelines.</Tile>
            </div>
          </div>
        </section>

        {/* Pilot sign-up */}
        <section id="pilot" className="scroll-mt-16 border-t border-line bg-sidebar px-4 py-24 sm:px-6 md:py-32">
          <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-[1fr_1.2fr] md:gap-16">
            <div>
              <div className="text-sm font-medium text-fg-subtle">For teachers</div>
              <h2 className={`mt-2 ${H2}`}>Try it with one group project.</h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-fg-muted">
                We're looking for a few teachers to run a real project with their class this semester. It's free, and we'll help you set it up.
              </p>
              <p className="mt-4 max-w-md text-sm text-fg-subtle">We only use your details to reply about the pilot. Never sold, never shared.</p>
            </div>
            <PilotForm />
          </div>
        </section>

        {/* Start or join */}
        <section className="px-4 py-24 sm:px-6 md:py-32">
          <div className="mx-auto max-w-xl text-center">
            <h2 className={H2}>Have a code? Jump in.</h2>
            <p className="mt-4 text-fg-muted">Join your class or your group's room with the code your teacher or friend shared, or start a room of your own.</p>
          </div>
          <div id="start" className="mx-auto mt-10 max-w-xl scroll-mt-24 text-left">
            <div className="rounded-[24px] border border-line bg-surface p-2 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.18)] dark:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.6)]">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block rounded-2xl px-3 pb-2 pt-2.5 transition-colors focus-within:bg-surface-2">
                  <span className="block text-xs font-medium text-fg-muted">Your name</span>
                  <input
                    ref={nameRef}
                    className="mt-0.5 w-full bg-transparent text-[16px] text-fg outline-none"
                    placeholder="e.g. Sam"
                    value={name}
                    maxLength={32}
                    autoComplete="nickname"
                    onChange={(e) => setNameState(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && create()}
                  />
                </label>
                <label className="block rounded-2xl px-3 pb-2 pt-2.5 transition-colors focus-within:bg-surface-2">
                  <span className="block text-xs font-medium text-fg-muted">Room name (optional)</span>
                  <input
                    className="mt-0.5 w-full bg-transparent text-[16px] text-fg outline-none"
                    placeholder="Room name, e.g. Bio project"
                    value={title}
                    maxLength={80}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && create()}
                  />
                </label>
              </div>
              <Button size="lg" onClick={create} disabled={busy} className="mt-2 w-full">
                {busy ? "Starting…" : "Start a room"} {!busy && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>

            <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <span className="text-sm text-fg-muted">Have a room or class code?</span>
              <div className="flex w-full max-w-[16rem] gap-2">
                <Input
                  aria-label="Party code"
                  className="h-9 rounded-full text-center font-mono text-sm uppercase tracking-[0.18em]"
                  placeholder="K7Q-29F"
                  value={code}
                  maxLength={7}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && join()}
                />
                <Button variant="secondary" size="sm" onClick={join} disabled={busy} className="h-9 rounded-full">
                  Join
                </Button>
              </div>
            </div>

            {err && (
              <p role="alert" className="mt-3 text-center text-sm text-red-600 dark:text-red-400">
                {err}
              </p>
            )}

            {account.user ? (
              <div className="mt-6 text-center">
                <Link to="/dashboard" className="press inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm hover:bg-surface-2" data-testid="rooms-heading">
                  Your rooms are on your dashboard <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              recent.length > 0 && (
                <div className="mt-6 text-center">
                  <div className="text-xs font-medium text-fg-subtle" data-testid="rooms-heading">Recent rooms</div>
                  <ul className="mt-2 flex flex-wrap justify-center gap-2" data-testid="recent-rooms">
                    {recent.map((r) => (
                      <li key={r.code} className="flex items-center rounded-full border border-line text-sm hover:bg-surface-2">
                        <button
                          onClick={() => {
                            if (ensureName()) nav(`/r/${r.code}`);
                          }}
                          className="press py-1 pl-3 pr-1.5 text-fg"
                        >
                          {r.title} <span className="font-mono text-xs text-fg-subtle">{formatCode(r.code)}</span>
                        </button>
                        <button
                          aria-label={`Remove ${r.title} from recent rooms`}
                          onClick={() => (forgetRoom(r.code), setRecent(recentRooms()))}
                          className="press mr-1 rounded-full p-1 text-fg-subtle hover:bg-accent-soft hover:text-fg"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {account.providers.length > 0 && (
                    <a href={signInUrl(account.providers[0], "/dashboard")} className="mt-2 inline-block text-xs text-fg-muted underline-offset-4 hover:text-fg hover:underline">
                      Sign in to keep all your rooms in one place
                    </a>
                  )}
                </div>
              )
            )}
          </div>
        </section>

        {/* Privacy callout */}
        <section className="px-4 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 rounded-[32px] bg-primary px-8 py-12 text-primary-fg md:flex-row md:items-center md:px-14 md:py-16">
            <Lock className="h-8 w-8 shrink-0" strokeWidth={1.5} />
            <div className="flex-1">
              <h2 className="text-[clamp(1.6rem,3vw,2.25rem)] font-semibold leading-tight tracking-[-0.025em]">No ads. Never sold. Chats stay with the group.</h2>
              <p className="mt-2 max-w-xl leading-relaxed opacity-70">
                Huddle is for ages 13 and up. Teachers see progress and turned-in work, not conversations. A teacher can erase a whole class and its data in one step.
              </p>
            </div>
            <a href="/privacy" className="press inline-flex items-center gap-1.5 rounded-full border border-primary-fg/25 px-5 py-2.5 text-sm font-medium hover:bg-primary-fg/10">
              Read the privacy policy <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-16 px-4 py-24 sm:px-6 md:py-32">
          <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-[1fr_1.6fr]">
            <h2 className={H2}>Questions</h2>
            <div className="divide-y divide-line border-y border-line" data-testid="faq">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-lg font-medium tracking-tight [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <Plus className="h-5 w-5 shrink-0 text-fg-subtle transition-transform duration-200 ease-out group-open:rotate-45" />
                  </summary>
                  <p className="mt-3 max-w-[60ch] leading-relaxed text-fg-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-line px-4 py-24 text-center sm:px-6 md:py-32">
          <h2 className="mx-auto max-w-3xl text-[clamp(2.25rem,6vw,4rem)] font-semibold leading-[1.04] tracking-[-0.035em]">Make the next group project fair.</h2>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" onClick={toPilot}>
              Try it with a class <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="secondary" onClick={toStart}>
              Join with a code
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 text-sm text-fg-muted sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 font-medium text-fg">
            <Logo className="h-5 w-5" /> Huddle
          </div>
          <div className="flex gap-5">
            <a href="/privacy" className="hover:text-fg">Privacy</a>
            <a href="/terms" className="hover:text-fg">Terms</a>
            <Link to="/classes" className="hover:text-fg">For teachers</Link>
          </div>
          <ThemeToggle className="sm:ml-auto" />
        </div>
      </footer>
    </div>
  );
}

/** The hero picture: what a contribution receipt looks like (sample names, not real students). */
function ReceiptPreview() {
  const people = [
    { name: "Maya", color: "#2563eb", work: "612 words · 4 slides", note: "I wrote the intro and found our sources.", share: 46 },
    { name: "Jordan", color: "#db2777", work: "388 words · 3 slides", note: "I made the charts from our survey.", share: 31 },
    { name: "Theo", color: "#059669", work: "241 words · 2 slides", note: "", share: 23 },
  ];
  return (
    <figure className="rise rise-2 mx-auto w-full max-w-md" aria-label="Example contribution receipt">
      <div className="rounded-[28px] border border-line bg-surface p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.25)]">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ReceiptText className="h-4 w-4" strokeWidth={1.75} /> Contribution receipt
          <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-muted">Turned in</span>
        </div>
        <div className="mt-1 text-xs text-fg-subtle">Causes of World War I · Group 3</div>
        <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          {people.map((p) => (
            <span key={p.name} style={{ width: `${p.share}%`, background: p.color }} />
          ))}
        </div>
        <ul className="mt-5 space-y-3">
          {people.map((p) => (
            <li key={p.name} className="rounded-2xl border border-line px-3.5 py-2.5">
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} aria-hidden />
                <span className="font-medium">{p.name}</span>
                <span className="ml-auto text-xs text-fg-muted tabular">{p.work}</span>
              </div>
              {p.note && <p className="mt-1.5 border-l-2 border-line-strong pl-2.5 text-xs text-fg-muted">{p.note}</p>}
            </li>
          ))}
        </ul>
        <p className="mt-4 flex items-center gap-1.5 text-[11px] text-fg-subtle">
          <BookOpen className="h-3.5 w-3.5" /> Tutor mode · chat stays private to the group
        </p>
      </div>
      <figcaption className="mt-3 text-center text-xs text-fg-subtle">Example receipt with sample names</figcaption>
    </figure>
  );
}

const PILOT_FIELD = "mt-1 w-full rounded-xl border border-line-strong bg-bg px-3 py-2 text-[15px] outline-none focus:border-fg/40";

/** Teachers sign up for the pilot. The free-text question is required: it's how we know who has the problem. */
function PilotForm() {
  const [form, setForm] = useState({ name: "", email: "", school: "", grade: "", subject: "", classSize: "", classroom: "", problem: "" });
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [err, setErr] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setState("sending");
    const r = await fetch("/api/pilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!d.ok) {
      setState("idle");
      return setErr(d.error ?? "Something went wrong. Please try again.");
    }
    setState("done");
  };
  if (state === "done")
    return (
      <div className="rounded-[24px] border border-line bg-surface p-8" role="status" data-testid="pilot-done">
        <h3 className="text-xl font-semibold tracking-tight">Thank you!</h3>
        <p className="mt-2 text-fg-muted">We'll be in touch by email to set up a time. Meanwhile you can already make a class and look around.</p>
        <Link to="/classes" className="press mt-5 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover">
          Set up a class <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  return (
    <form onSubmit={submit} className="rounded-[24px] border border-line bg-surface p-6 sm:p-8" data-testid="pilot-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Your name
          <input required maxLength={80} value={form.name} onChange={set("name")} className={PILOT_FIELD} autoComplete="name" />
        </label>
        <label className="block text-sm font-medium">
          School email
          <input required type="email" maxLength={200} value={form.email} onChange={set("email")} className={PILOT_FIELD} autoComplete="email" />
        </label>
        <label className="block text-sm font-medium">
          School <span className="font-normal text-fg-subtle">(optional)</span>
          <input maxLength={120} value={form.school} onChange={set("school")} className={PILOT_FIELD} />
        </label>
        <label className="block text-sm font-medium">
          Subject
          <input maxLength={80} value={form.subject} onChange={set("subject")} className={PILOT_FIELD} placeholder="e.g. US History" />
        </label>
        <label className="block text-sm font-medium">
          Grade level
          <select value={form.grade} onChange={set("grade")} className={PILOT_FIELD}>
            <option value="">Choose…</option>
            {["Middle school (7–8)", "High school (9–12)", "College", "Other"].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Students in the class
          <input inputMode="numeric" maxLength={20} value={form.classSize} onChange={set("classSize")} className={PILOT_FIELD} placeholder="e.g. 28" />
        </label>
      </div>
      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Do you use Google Classroom?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {["Yes", "Sometimes", "No"].map((v) => (
            <label key={v} className={`press cursor-pointer rounded-full border px-3 py-1 text-sm ${form.classroom === v ? "border-fg bg-surface-2 font-medium" : "border-line-strong text-fg-muted"}`}>
              <input type="radio" name="classroom" value={v} checked={form.classroom === v} onChange={set("classroom")} className="sr-only" />
              {v}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-4 block text-sm font-medium">
        Describe the last group project problem you dealt with
        <textarea
          required
          minLength={10}
          maxLength={2000}
          rows={4}
          value={form.problem}
          onChange={set("problem")}
          className={PILOT_FIELD}
          placeholder="e.g. One student did almost everything, and I couldn't tell who wrote what."
          data-testid="pilot-problem"
        />
      </label>
      {err && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {err}
        </p>
      )}
      <Button type="submit" size="lg" className="mt-5 w-full" disabled={state === "sending"} data-testid="pilot-submit">
        {state === "sending" ? "Sending…" : "Join the pilot"}
      </Button>
    </form>
  );
}

function Tile({ icon, title, children, className = "" }: { icon: React.ReactNode; title: string; children: React.ReactNode; className?: string }) {
  return (
    <article className={`rounded-[28px] bg-surface-2 p-7 ${className}`}>
      {icon}
      <h3 className="mt-8 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 leading-relaxed text-fg-muted">{children}</p>
    </article>
  );
}

const FAQ = [
  {
    q: "Is Huddle an AI detector?",
    a: "No. It doesn't guess whether text was written by AI. It records what each person added inside Huddle, labels what Huddle's own AI wrote, and lets students add notes about their part. It's a fair record of the group's work, not a cheating score.",
  },
  {
    q: "Does my teacher read our chat?",
    a: "No. Teachers see each group's progress (tasks done, last activity, turned in or not) and, after you turn in, the files and the contribution receipt. The only chat a teacher ever sees is a message a student chooses to report.",
  },
  {
    q: "Can students just use ChatGPT in another tab?",
    a: "They can. That's why Huddle's AI is built to be the better choice: it already knows the assignment and the rubric, it works inside your files, and when the teacher allows AI, using it is out in the open. For AI-off projects a teacher can also block pasting from outside Huddle.",
  },
  {
    q: "Does it work with Google Classroom?",
    a: "Yes. Teachers post the class link or any assignment to Classroom in one click, and students can sign in with their school Google account. Importing rosters and sending grades back to Classroom automatically is coming later.",
  },
  {
    q: "Does my school's IT need to approve it?",
    a: "Some schools require approval for new apps, especially for student Google accounts. Ask your IT team how they approve tools. Students can also join with just a name and a class code, without signing in.",
  },
  {
    q: "Who can use Huddle?",
    a: "Anyone aged 13 and up. Everyone confirms their age before joining a room or class.",
  },
  {
    q: "What does it cost?",
    a: "Huddle is free during the pilot. If we add paid plans later, there will still be a free way to use it, and pilot teachers will hear about any change first.",
  },
  {
    q: "Can I use it outside of school?",
    a: "Yes. Anyone can start a room, share the code, and use the shared AI, docs, sheets and slides with friends or a club.",
  },
];
