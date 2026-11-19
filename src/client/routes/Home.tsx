import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  AppWindow,
  BookOpen,
  Brain,
  ClipboardList,
  Cpu,
  FileText,
  Globe,
  Lock,
  MessagesSquare,
  PenTool,
  Plus,
  Presentation,
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
import { ProductShot } from "../components/ProductShot";

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
    if (!isValidCode(c)) return setErr("Party codes are 6 letters or numbers, like K7Q-29F.");
    setBusy(true);
    const res = await fetch(`/api/rooms/${c}`);
    setBusy(false);
    if (!res.ok) return setErr("That code doesn't match a room. Check the letters and try again.");
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

  return (
    <div className="min-h-full bg-bg">
      {/* Nav */}
      <header className="glass sticky top-0 z-30 border-b border-line/60 bg-bg/75 backdrop-blur-xl backdrop-saturate-150">
        <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
            <Logo className="h-7 w-7" /> Huddle
          </a>
          <div className="hidden items-center gap-6 text-sm text-fg-muted md:flex">
            <a href="#features" className="transition-colors hover:text-fg">Features</a>
            <a href="#how" className="transition-colors hover:text-fg">How it works</a>
            <a href="#faq" className="transition-colors hover:text-fg">FAQ</a>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {account.user && (
              <Link to="/dashboard" className="press hidden rounded-full px-3 py-1.5 text-sm font-medium text-fg-muted hover:bg-accent-soft hover:text-fg sm:block" data-testid="nav-dashboard">
                Dashboard
              </Link>
            )}
            <AccountMenu user={account.user} providers={account.providers} />
            <span className="hidden sm:block">
              <Button size="sm" onClick={toStart} className="rounded-full">
                Start a room
              </Button>
            </span>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 text-center sm:px-6 md:pt-24">
          <h1 className="rise font-display text-[clamp(2.75rem,8vw,5.75rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
            Talk to AI.
            <br />
            Together.
          </h1>
          <p className="rise rise-1 mx-auto mt-6 max-w-[38rem] text-[clamp(1.05rem,2vw,1.3rem)] leading-relaxed text-fg-muted">
            Start a room, share a code, and everyone chats with the same AI. It searches the web and builds the docs,
            sheets and slides you all edit live.
          </p>

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
              <span className="text-sm text-fg-muted">Have a party code?</span>
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

          <p className="mt-8 text-sm text-fg-subtle">Free · No sign-up to join · Open models</p>
        </section>

        {/* Product shot */}
        <section className="px-4 pb-24 sm:px-6 md:pb-32">
          <ProductShot />
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-16 border-t border-line bg-sidebar px-4 py-24 sm:px-6 md:py-32">
          <div className="mx-auto max-w-6xl">
            <h2 className="max-w-2xl text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]">
              From “we should figure this out” to done, in one sitting.
            </h2>
            <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
              {[
                { t: "Start a room", d: "One click. You get a six-character party code and an invite link." },
                { t: "Share the code", d: "Friends join from any phone or laptop. Nobody needs an account." },
                { t: "Build it with AI", d: "Ask out loud, together. The AI answers with sources and makes files you all edit." },
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

        {/* Features (bento) */}
        <section id="features" className="scroll-mt-16 px-4 py-24 sm:px-6 md:py-32">
          <div className="mx-auto max-w-6xl">
            <h2 className="max-w-3xl text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]">
              One AI for the whole room. <span className="text-fg-subtle">And everything it makes is yours to edit.</span>
            </h2>

            <div className="mt-14 grid auto-rows-[minmax(0,auto)] gap-4 md:grid-cols-6">
              {/* Big tile: chat together */}
              <article className="flex flex-col justify-between gap-8 overflow-hidden rounded-[28px] bg-surface-2 p-8 md:col-span-4 md:row-span-2">
                <div>
                  <MessagesSquare className="h-6 w-6" strokeWidth={1.75} />
                  <h3 className="mt-5 text-2xl font-semibold tracking-tight">Everyone talks to the same AI</h3>
                  <p className="mt-2 max-w-md leading-relaxed text-fg-muted">
                    It knows who said what, answers people by name, and keeps the whole room's context. Add polls,
                    reactions and room memory when you need them.
                  </p>
                </div>
                <div className="space-y-2.5 text-[14px]">
                  {[
                    ["Maya", "Which day works for everyone?"],
                    ["Theo", "@ai make a poll: Fri or Sat"],
                  ].map(([who, txt]) => (
                    <div key={who} className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-bg px-4 py-2.5 shadow-sm">
                      <span className="block text-[11px] font-medium text-fg-subtle">{who}</span>
                      {txt}
                    </div>
                  ))}
                  <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-md border border-line bg-bg px-4 py-3">
                    <div className="text-[13px] font-medium">Fri or Sat?</div>
                    <div className="mt-2 space-y-1.5 text-[13px]">
                      <div className="flex items-center gap-3"><span className="h-1.5 w-28 rounded-full bg-fg" /> Saturday · 3</div>
                      <div className="flex items-center gap-3"><span className="h-1.5 w-10 rounded-full bg-line-strong" /> Friday · 1</div>
                    </div>
                  </div>
                </div>
              </article>

              <Tile icon={<Globe className="h-6 w-6" strokeWidth={1.75} />} title="Web search, with sources" className="md:col-span-2">
                Fresh answers from the live web. Every claim links to where it came from.
              </Tile>
              <Tile icon={<FileText className="h-6 w-6" strokeWidth={1.75} />} title="Docs that write themselves" className="md:col-span-2">
                Ask for a plan, an essay or notes. Edit together with live cursors and version history.
              </Tile>

              <Tile icon={<Table2 className="h-6 w-6" strokeWidth={1.75} />} title="Sheets with real formulas" className="md:col-span-2">
                Budgets and trackers with working formulas and charts. Import CSV, export XLSX.
              </Tile>
              <Tile icon={<Presentation className="h-6 w-6" strokeWidth={1.75} />} title="Slides you present together" className="md:col-span-2">
                The AI drafts the deck. Present and everyone follows along, then export to PowerPoint.
              </Tile>
              <Tile icon={<PenTool className="h-6 w-6" strokeWidth={1.75} />} title="Whiteboards" className="md:col-span-2">
                Flowcharts, mind maps and timelines, drawn for you, rearranged by hand.
              </Tile>

              <Tile icon={<ClipboardList className="h-6 w-6" strokeWidth={1.75} />} title="Forms with a public link" className="md:col-span-3">
                Sign-ups and surveys anyone can fill in. Responses land in a sheet.
              </Tile>
              <Tile icon={<AppWindow className="h-6 w-6" strokeWidth={1.75} />} title="Mini-apps on demand" className="md:col-span-3">
                “Make a timer for our study session.” It builds a working app right in the room.
              </Tile>
            </div>
          </div>
        </section>

        {/* Spotlights */}
        <section className="border-t border-line px-4 py-24 sm:px-6 md:py-32">
          <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2 md:gap-20">
            <div>
              <h2 className="text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]">Not just answers. Files.</h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-fg-muted">
                Most AI chats end in a wall of text you copy somewhere else. In Huddle, the answer becomes the doc, the
                sheet or the deck, already open for everyone.
              </p>
            </div>
            <div>
              <div className="rounded-[28px] border border-line bg-bg p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.22)] sm:p-8">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Table2 className="h-4 w-4" strokeWidth={1.75} /> Budget
                </div>
                <table className="mt-4 w-full text-left text-sm tabular">
                  <thead className="text-fg-subtle">
                    <tr className="border-b border-line">
                      <th className="py-2 font-medium">Item</th>
                      <th className="py-2 text-right font-medium">Qty</th>
                      <th className="py-2 text-right font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Flour", "4", "$18.00"],
                      ["Chocolate chips", "6", "$27.00"],
                      ["Boxes & napkins", "1", "$14.50"],
                    ].map(([a, b, c]) => (
                      <tr key={a} className="border-b border-line">
                        <td className="py-2">{a}</td>
                        <td className="py-2 text-right">{b}</td>
                        <td className="py-2 text-right">{c}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-2">Total</td>
                      <td />
                      <td className="py-2 text-right">
                        $59.50 <span className="ml-1 font-mono text-[11px] font-normal text-fg-subtle">=SUM(C2:C4)</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="mx-auto mt-24 grid max-w-6xl items-center gap-12 md:mt-32 md:grid-cols-2 md:gap-20">
            <div className="order-last grid grid-cols-2 gap-3 md:order-first">
              {[
                { i: <Brain className="h-5 w-5" strokeWidth={1.75} />, t: "20 expert skills", d: "Tutor, editor, coach, analyst…" },
                { i: <BookOpen className="h-5 w-5" strokeWidth={1.75} />, t: "Deep Research", d: "Reads many pages, then reports." },
                { i: <Users className="h-5 w-5" strokeWidth={1.75} />, t: "Custom assistants", d: "Give it a name and instructions." },
                { i: <Cpu className="h-5 w-5" strokeWidth={1.75} />, t: "Local mode", d: "Runs on your own device." },
              ].map((c) => (
                <div key={c.t} className="rounded-3xl bg-surface-2 p-5">
                  {c.i}
                  <div className="mt-6 font-semibold tracking-tight">{c.t}</div>
                  <div className="mt-1 text-sm leading-snug text-fg-muted">{c.d}</div>
                </div>
              ))}
            </div>
            <div>
              <h2 className="text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]">Your AI, your rules.</h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-fg-muted">
                Shape how the room's AI behaves, switch on research mode for hard questions, or run it entirely in your
                browser so nothing leaves your device.
              </p>
            </div>
          </div>
        </section>

        {/* Privacy callout */}
        <section className="px-4 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 rounded-[32px] bg-primary px-8 py-12 text-primary-fg md:flex-row md:items-center md:px-14 md:py-16">
            <Lock className="h-8 w-8 shrink-0" strokeWidth={1.5} />
            <div className="flex-1">
              <h2 className="text-[clamp(1.6rem,3vw,2.25rem)] font-semibold leading-tight tracking-[-0.025em]">Free. No ads. Never sold.</h2>
              <p className="mt-2 max-w-xl leading-relaxed opacity-70">
                Huddle runs on open models and free infrastructure. Your rooms are only visible to people with the code.
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
            <h2 className="text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]">Questions</h2>
            <div className="divide-y divide-line border-y border-line">
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
          <h2 className="mx-auto max-w-3xl text-[clamp(2.25rem,6vw,4rem)] font-semibold leading-[1.04] tracking-[-0.035em]">
            Your group's next idea starts here.
          </h2>
          <Button size="lg" onClick={toStart} className="mt-10">
            Start a room <ArrowRight className="h-4 w-4" />
          </Button>
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
            <a href="https://github.com/lhaigwebdesigns-glitch/huddle" className="hover:text-fg" rel="noopener noreferrer" target="_blank">
              GitHub
            </a>
          </div>
          <ThemeToggle className="sm:ml-auto" />
        </div>
      </footer>
    </div>
  );
}

function Tile({ icon, title, children, className = "" }: { icon: React.ReactNode; title: string; children: React.ReactNode; className?: string }) {
  return (
    <article className={`rounded-[28px] bg-surface-2 p-7 ${className}`}>
      {icon}
      <h3 className="mt-10 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 leading-relaxed text-fg-muted">{children}</p>
    </article>
  );
}

const FAQ = [
  { q: "Is Huddle really free?", a: "Yes. It runs on free, open AI models and free hosting. There's a shared daily AI allowance; if it runs out, the host can switch to Local mode or try again tomorrow." },
  { q: "Do my friends need an account?", a: "No. They type the party code (or open your invite link) and pick a name. Signing in with GitHub or Google is optional and just keeps your rooms on every device." },
  { q: "Which AI does it use?", a: "Open models such as gpt-oss and Llama, served by Groq and Cloudflare. In Local mode the model runs in your own browser instead." },
  { q: "Can it look things up?", a: "Yes. It searches the web and reads pages, and it cites the sources it used so you can check them." },
  { q: "What can it make?", a: "Docs, sheets with formulas and charts, slide decks, whiteboard diagrams, forms with public links, mini-apps and images. Everyone in the room can edit them live." },
  { q: "Who can see my room?", a: "Only people with the party code or invite link. The host can also create a read-only share link. Don't put anything in a room you wouldn't share with them." },
];
