import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PROVIDER_LABEL, signInUrl, useAccount } from "../lib/account";
import { GoogleMark, HumanCheck } from "../components/SignInGate";
import { AccountMenu } from "../components/AccountMenu";
import { formatCode, isValidCode, normalizeCode } from "../../shared/code";
import { forgetRoom, getIdentity, recentRooms, setName } from "../lib/identity";
import { Logo, ThemeToggle } from "../components/ui";
import { GREEN, INK, MINT, PERI, RockFace, RockPerson, Spark, TEAL } from "../components/Rocks";
import "./home.css";

const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export default function Home() {
  const nav = useNavigate();
  const me = getIdentity();
  const account = useAccount();
  const [name, setNameState] = useState(me.name);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const [human, setHuman] = useState("");
  const mustSignIn = account.ready && account.requireSignIn && !account.user;
  // Guests see this device's last few rooms; signed-in people have the dashboard.
  const [recent, setRecent] = useState(() => recentRooms());

  useEffect(() => {
    document.title = "Cairn · Show your work";
  }, []);

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
        body: JSON.stringify({ uid: me.uid, title: title.trim() || `${name.trim()}'s room`, human }),
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
    if (!mustSignIn && !ensureName()) return;
    const c = normalizeCode(code);
    if (!isValidCode(c)) return setErr("Codes are 6 letters or numbers, like K7Q-29F.");
    setBusy(true);
    const res = await fetch(`/api/rooms/${c}`);
    setBusy(false);
    if (!res.ok) {
      // Not a room: it may be a class code.
      const cls = await fetch(`/api/classes/join/${c}`);
      if (cls.ok || cls.status === 401) return nav(`/c/${c}`);
      return setErr("That code doesn't match a room or a class. Check the letters and try again.");
    }
    nav(`/r/${c}`);
  };

  /** The hero's code box: a class code goes to the class; a room code asks for a name first. */
  const heroJoin = async (c: string): Promise<string | null> => {
    const clean = normalizeCode(c);
    if (!isValidCode(clean)) return "Class codes are 6 letters and numbers, like ABC-123.";
    const cls = await fetch(`/api/classes/join/${clean}`);
    // 401 = the class exists but wants you signed in first; its page asks you to.
    if (cls.ok || cls.status === 401) {
      nav(`/c/${clean}`);
      return null;
    }
    const room = await fetch(`/api/rooms/${clean}`);
    if (room.ok) {
      if (name.trim()) {
        setName(name);
        nav(`/r/${clean}`);
        return null;
      }
      setCode(formatCode(clean));
      scrollToId("start");
      setTimeout(() => nameRef.current?.focus({ preventScroll: true }), 400);
      return "That's a room code. Add your name below to join it.";
    }
    return "That code doesn't match a class or a room. Check the letters and try again.";
  };

  return (
    <div className="cairn-home">
      <header className="nav">
        <div className="wrap">
          <a className="brand" href="/" aria-label="Cairn home">
            <Logo /> Cairn
          </a>
          <nav className="nav-links" aria-label="Sections">
            <a href="#research">The research</a>
            <a href="#students">For students</a>
            <a href="#teachers">For teachers</a>
          </nav>
          <span className="spacer" />
          <AccountMenu user={account.user} providers={account.providers} isAdmin={account.isAdmin} />
          {account.user === null && (
            <a className="btn btn-quiet" href="#start" data-testid="path-student">
              Have a class code?
            </a>
          )}
          <a className="btn btn-go" href="#pilot" data-testid="nav-pilot">
            <span>
              Try it<span className="long"> with your class</span>
            </span>
          </a>
        </div>
      </header>

      <main>
        <Hero onJoin={heroJoin} />
        <Research />
        <Thesis />
        <Turn />
        <Students />
        <Teachers />
        <Groups />
        <Shown />
        <Founder />
        <Pilot />

        {/* Jump in: a class or room code, or a room of your own */}
        <section className="jump" id="start">
          <div className="wrap">
            <h2>Have a code? Jump in.</h2>
            <p className="lead">Join your class or your group's room with the code your teacher or a friend shared, or start a room of your own for a study group or club.</p>
            {mustSignIn ? (
              <div className="start-box" data-testid="start-signin">
                <p style={{ padding: "8px 12px 4px", color: "var(--fg-muted)" }}>Sign in with your school Google account to start a room or join one. Students: open your teacher's link, or type your class code above.</p>
                {account.providers.map((p) => (
                  <a key={p} className="btn btn-go" href={signInUrl(p, "/#start")} style={{ width: "100%", marginTop: 8 }}>
                    {p === "google" && (
                      <span style={{ display: "inline-grid", placeItems: "center", width: 28, height: 28, borderRadius: 999, background: "#fff" }}>
                        <GoogleMark className="h-4 w-4" />
                      </span>
                    )}
                    Continue with {PROVIDER_LABEL[p] ?? p}
                  </a>
                ))}
              </div>
            ) : (
            <div className="start-box">
              <div className="fields">
                <label>
                  <span>Your name</span>
                  <input
                    ref={nameRef}
                    placeholder="e.g. Sam"
                    value={name}
                    maxLength={32}
                    autoComplete="nickname"
                    onChange={(e) => setNameState(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && create()}
                  />
                </label>
                <label>
                  <span>Room name (optional)</span>
                  <input
                    placeholder="Room name, e.g. Bio project"
                    value={title}
                    maxLength={80}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && create()}
                  />
                </label>
              </div>
              <HumanCheck siteKey={account.turnstileSiteKey} onToken={setHuman} />
              <button className="btn btn-go" onClick={create} disabled={busy}>
                {busy ? "Starting…" : "Start a room"}
              </button>
            </div>
            )}
            <div className="code-row">
              <span>Have a room or class code?</span>
              <div className="code-join">
                <input
                  aria-label="Party code"
                  placeholder="K7Q-29F"
                  value={code}
                  maxLength={7}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && join()}
                />
                <button onClick={join} disabled={busy}>
                  Join
                </button>
              </div>
            </div>
            {err && (
              <p role="alert" className="err">
                {err}
              </p>
            )}
            {account.user ? (
              <Link to="/dashboard" className="btn btn-quiet" data-testid="rooms-heading">
                Your rooms are on your dashboard
              </Link>
            ) : (
              recent.length > 0 && (
                <div>
                  <div className="hand" data-testid="rooms-heading">
                    Recent rooms
                  </div>
                  <ul className="recent" data-testid="recent-rooms">
                    {recent.map((r) => (
                      <li key={r.code}>
                        <button onClick={() => ensureName() && nav(`/r/${r.code}`)}>
                          {r.title} <span style={{ opacity: 0.6 }}>{formatCode(r.code)}</span>
                        </button>
                        <button className="x" aria-label={`Remove ${r.title} from recent rooms`} onClick={() => (forgetRoom(r.code), setRecent(recentRooms()))}>
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                  {account.providers.length > 0 && <a href={signInUrl(account.providers[0], "/dashboard")}>Sign in to keep all your rooms in one place</a>}
                </div>
              )
            )}
          </div>
        </section>

        <Faq />
      </main>

      <footer>
        <div className="wrap">
          <a className="brand" href="/" style={{ fontSize: "1.25rem" }}>
            <Logo className="h-[30px] w-[30px]" /> Cairn
          </a>
          <nav aria-label="Footer">
            <a href="#research">The research</a>
            <a href="#story">Our story</a>
            <Link to="/classes">For teachers</Link>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </nav>
          <span>Made by a student, for students and teachers.</span>
          <ThemeToggle />
        </div>
      </footer>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- */

const check = (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="10" cy="10" r="10" fill={MINT} />
    <path d="M5.5 10.5l3 3 6-7" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Hero({ onJoin }: { onJoin: (code: string) => Promise<string | null> }) {
  const [code, setCode] = useState("");
  const [note, setNote] = useState<{ text: string; err?: boolean } | null>(null);
  const [built, setBuilt] = useState(false);
  const tileRef = useRef<HTMLDivElement>(null);
  // The cairn builds itself once, when it's on screen.
  useEffect(() => {
    const el = tileRef.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setBuilt(true), { threshold: 0.3 });
    io.observe(el);
    const t = setTimeout(() => setBuilt(true), 1800);
    return () => (io.disconnect(), clearTimeout(t));
  }, []);
  return (
    <section className="hero">
      <div className="wrap">
        <div className="hero-copy">
          <h1>
            Show your{" "}
            <span className="scribble">
              work.
              <svg viewBox="0 0 300 30" preserveAspectRatio="none" aria-hidden="true">
                <path d="M4 18c40-12 80-14 120-6s90 10 172-6" fill="none" stroke={GREEN} strokeWidth="9" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="lede">
            Cairn is where students do their assignments with AI that helps them think, instead of thinking for them. Teachers post one link in Google Classroom and see how every student got to their
            answer.
          </p>
          <div className="hero-actions">
            <a className="btn btn-go" href="#pilot" data-testid="path-teacher">
              Try it with your class
            </a>
            <form
              className="code-join"
              noValidate
              onSubmit={async (e) => {
                e.preventDefault();
                setNote(null);
                const msg = await onJoin(code);
                if (msg) setNote({ text: msg, err: !msg.startsWith("That's a room") });
              }}
            >
              <input
                aria-label="Class code"
                autoComplete="off"
                maxLength={7}
                placeholder="Class code"
                value={code}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
                  setCode(v.length > 3 ? `${v.slice(0, 3)}-${v.slice(3)}` : v);
                }}
                data-testid="hero-code"
              />
              <button type="submit" aria-label="Join class">
                Join
              </button>
            </form>
          </div>
          <p className={`code-note${note?.err ? " err" : ""}`} aria-live="polite">
            {note?.text}
          </p>
          <div className="trust">
            <span>{check}Free for teachers</span>
            <span>{check}Works with Google Classroom</span>
            <span>{check}No ads, ever</span>
          </div>
        </div>

        <div className="mosaic" role="img" aria-label="Rock characters reading, working on a laptop and stacking into a cairn">
          <div className="tile t-ink">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <RockPerson body={PERI} pose="hold" prop="book" x={54} s={0.9} />
            </svg>
          </div>
          <div className="tile">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <path d="M50 4 96 50 50 96 4 50z" fill={MINT} />
              <Spark x={38} y={38} size={24} />
            </svg>
          </div>
          <div className={`tile t-d${built ? " built" : ""}`} ref={tileRef}>
            <svg viewBox="0 0 100 200" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
              <g className="stone st1">
                <path d="M30 174l-6 16M66 174l6 16" stroke={INK} strokeWidth="7" strokeLinecap="round" />
                <ellipse cx="21" cy="192" rx="9" ry="4.5" fill={INK} />
                <ellipse cx="75" cy="192" rx="9" ry="4.5" fill={INK} />
                <g filter="url(#grain)">
                  <path d="M12 170c-6-20 8-34 38-36 30-2 44 12 40 30-3 14-22 18-42 18-18 0-32-2-36-12z" fill={INK} />
                </g>
                <path d="M16 156c-8-6-10-16-6-26M84 154c8-6 10-16 6-26" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
                <circle cx="10" cy="128" r="5" fill={MINT} />
                <circle cx="90" cy="126" r="5" fill={MINT} />
                <path d="M38 156c2-2 5-2 7 0M55 155c2-2 5-2 7 0" fill="none" stroke={MINT} strokeWidth="2.4" strokeLinecap="round" />
                <path d="M43 163c4 4 10 4 14 0" fill="none" stroke={MINT} strokeWidth="2.4" strokeLinecap="round" />
              </g>
              <g className="stone st2">
                <g filter="url(#grain)">
                  <path d="M20 134c-4-16 8-28 30-29 22-1 34 10 31 24-3 12-17 15-32 15-14 0-26-2-29-10z" fill={PERI} />
                </g>
                <circle cx="42" cy="121" r="2.8" fill={INK} />
                <circle cx="58" cy="120" r="2.8" fill={INK} />
                <path d="M45 127c3 2.4 7 2.4 10-1" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
                <path d="M22 128c-6 2-10 6-10 12" fill="none" stroke={PERI} strokeWidth="6" strokeLinecap="round" />
              </g>
              <g className="stone st3">
                <g filter="url(#grain)">
                  <path d="M30 102c-3-12 6-21 21-22 16-1 24 8 22 18-2 9-12 11-23 11-10 0-18-1-20-7z" fill={MINT} />
                </g>
                <circle cx="45" cy="92" r="2.6" fill={INK} />
                <circle cx="57" cy="91" r="2.6" fill={INK} />
                <path d="M47 97c2 2 6 2 8 0" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
                <path d="M71 92c7-5 10-13 9-24" fill="none" stroke={MINT} strokeWidth="6" strokeLinecap="round" />
                <circle cx="80" cy="66" r="4.5" fill={MINT} />
                <path d="M31 96c-6-2-10-7-11-13" fill="none" stroke={MINT} strokeWidth="6" strokeLinecap="round" />
              </g>
              <g className="flag">
                <Spark x={70} y={40} size={22} />
              </g>
            </svg>
          </div>
          <div className="tile t-outline">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <RockPerson body={TEAL} pose="carry" prop="pencil" s={0.82} />
            </svg>
          </div>
          <div className="tile t-circle">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <RockPerson body={GREEN} pose="hold" prop="laptop" s={0.86} />
            </svg>
          </div>
          <div className="tile t-peri">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <RockPerson body={MINT} pose="cheer" s={0.78} />
              <Spark x={74} y={10} size={14} />
              <Spark x={10} y={26} size={9} fill="#ffffff" />
            </svg>
          </div>
          <div className="tile">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <path d="M50 8 96 96H4z" fill="none" stroke={TEAL} strokeWidth="11" strokeLinejoin="miter" />
              <RockPerson body={INK} ink={MINT} pose="wave" y={8} s={0.6} />
            </svg>
          </div>
          <div className="tile t-quarter">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <RockPerson body="#ffffff" pose="sit" prop="bubble" x={46} s={0.8} />
            </svg>
          </div>
          <svg className="spark s1" viewBox="0 0 40 40" aria-hidden="true">
            <Spark fill={PERI} />
          </svg>
          <svg className="spark s2" viewBox="0 0 40 40" aria-hidden="true">
            <Spark fill={TEAL} />
          </svg>
          <svg className="spark s3" viewBox="0 0 40 40" aria-hidden="true">
            <Spark fill={GREEN} />
          </svg>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------- */

const squiggle = (color: string, width = 150) => (
  <svg viewBox="0 0 200 30" style={{ width }} aria-hidden="true">
    <path d="M4 15c16-14 32 14 48 0s32 14 48 0 32 14 48 0 32 14 48 0" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" />
  </svg>
);

/** Real published research. Every figure links to its source. */
function Research() {
  const ext = { target: "_blank", rel: "noopener noreferrer" } as const;
  return (
    <section className="proof" id="research">
      <div className="wrap">
        <div className="sec-head">
          <h2>AI is doing the homework. Students are paying for it.</h2>
          {squiggle(MINT)}
          <p>This isn't a feeling. Researchers have started measuring it, and the numbers line up with what students say about themselves.</p>
        </div>
        <div className="findings">
          <article className="finding wide">
            <h3>Teens using ChatGPT for schoolwork doubled in a year</h3>
            <svg className="chart" viewBox="0 0 540 250" role="img" aria-label="Bar chart: 13 percent of US teens used ChatGPT for schoolwork in 2023 and 26 percent in 2024. Separately, a broader 2025 question found 54 percent had used any AI chatbot for schoolwork.">
              <line x1="0" y1="210" x2="330" y2="210" stroke="#2d3c33" strokeWidth="2" />
              <line x1="380" y1="210" x2="540" y2="210" stroke="#2d3c33" strokeWidth="2" />
              <line x1="352" y1="40" x2="352" y2="226" stroke="#3b4d43" strokeWidth="2" strokeDasharray="4 6" />
              <rect x="30" y="184" width="110" height="26" rx="8" fill={PERI} />
              <rect x="200" y="158" width="110" height="52" rx="8" fill={TEAL} />
              <rect x="390" y="102" width="110" height="108" rx="8" fill="none" stroke={MINT} strokeWidth="3" strokeDasharray="8 6" />
              <text x="85" y="172" textAnchor="middle" fill="#fff" fontSize="26" fontWeight="800">13%</text>
              <text x="255" y="146" textAnchor="middle" fill="#fff" fontSize="26" fontWeight="800">26%</text>
              <text x="445" y="90" textAnchor="middle" fill="#fff" fontSize="26" fontWeight="800">54%</text>
              <text x="85" y="236" textAnchor="middle" fill="#b9c8bf" fontSize="16">2023 · ChatGPT</text>
              <text x="255" y="236" textAnchor="middle" fill="#b9c8bf" fontSize="16">2024 · ChatGPT</text>
              <text x="445" y="236" textAnchor="middle" fill="#b9c8bf" fontSize="16">2025 · any AI chatbot</text>
            </svg>
            <p className="src">
              Share of US teens 13–17, from Pew Research Center surveys. The dashed bar asks a broader question (any AI chatbot, surveyed fall 2025), so it isn't part of the doubling.{" "}
              <a href="https://www.pewresearch.org/short-reads/2025/01/15/about-a-quarter-of-us-teens-have-used-chatgpt-for-schoolwork-double-the-share-in-2023/" {...ext}>
                2025 report
              </a>{" "}
              ·{" "}
              <a href="https://www.pewresearch.org/internet/2026/02/24/how-teens-use-and-view-ai/" {...ext}>
                2026 report
              </a>
            </p>
          </article>
          <article className="finding narrow">
            <h3>Most couldn't quote the essay they had just written</h3>
            <svg className="chart" viewBox="0 0 360 250" role="img" aria-label="Bar chart: 83 percent of people who wrote with ChatGPT could not quote their own essay minutes later, compared with about 11 percent of people who wrote on their own.">
              <line x1="0" y1="210" x2="360" y2="210" stroke="#2d3c33" strokeWidth="2" />
              <rect x="30" y="44" width="120" height="166" rx="8" fill={GREEN} />
              <rect x="210" y="188" width="120" height="22" rx="8" fill={PERI} />
              <text x="90" y="32" textAnchor="middle" fill="#fff" fontSize="26" fontWeight="800">83%</text>
              <text x="270" y="176" textAnchor="middle" fill="#fff" fontSize="26" fontWeight="800">~11%</text>
              <text x="90" y="236" textAnchor="middle" fill="#b9c8bf" fontSize="16">wrote with ChatGPT</text>
              <text x="270" y="236" textAnchor="middle" fill="#b9c8bf" fontSize="16">wrote on their own</text>
            </svg>
            <p className="src">
              MIT Media Lab, "Your Brain on ChatGPT" (2025). 54 adults, EEG. A small early study, not yet peer reviewed.{" "}
              <a href="https://arxiv.org/abs/2506.08872" {...ext}>
                Read it
              </a>
            </p>
          </article>
          <article className="finding full">
            <div style={{ display: "grid", gap: 14 }}>
              <h3>Plain ChatGPT made high schoolers worse at math. A tutor with guardrails didn't.</h3>
              <p>
                About 1,000 high school students practiced math with AI. With plain ChatGPT they did better in practice, then scored 17% worse than classmates with no AI once it was taken away. With
                an AI tutor built to give hints instead of answers, they did far better in practice and showed no drop on the test.
              </p>
              <p className="src">
                Bastani et al., PNAS (2025), "Generative AI without guardrails can harm learning."{" "}
                <a href="https://doi.org/10.1073/pnas.2422633122" {...ext}>
                  Read it
                </a>
              </p>
            </div>
            <svg className="chart" viewBox="0 0 560 326" role="img" aria-label="Compared with students who had no AI, plain ChatGPT users scored 48 percent higher in practice and 17 percent lower on the exam. Students with a guided AI tutor scored 127 percent higher in practice and about the same as no AI on the exam.">
              <text x="0" y="22" fill="#b9c8bf" fontSize="15" fontWeight="700">IN PRACTICE, WITH AI</text>
              <text x="300" y="22" fill="#b9c8bf" fontSize="15" fontWeight="700">ON THE TEST, AI TAKEN AWAY</text>
              <g transform="translate(0 26)">
              <line x1="0" y1="200" x2="250" y2="200" stroke="#2d3c33" strokeWidth="2" />
              <line x1="300" y1="200" x2="560" y2="200" stroke="#2d3c33" strokeWidth="2" />
              <rect x="20" y="142" width="90" height="58" rx="8" fill={PERI} />
              <rect x="140" y="48" width="90" height="152" rx="8" fill={GREEN} />
              <text x="65" y="132" textAnchor="middle" fill="#fff" fontSize="24" fontWeight="800">+48%</text>
              <text x="185" y="40" textAnchor="middle" fill="#fff" fontSize="24" fontWeight="800">+127%</text>
              <rect x="320" y="200" width="90" height="20" rx="6" fill={PERI} />
              <rect x="440" y="197" width="90" height="6" rx="3" fill={GREEN} />
              <text x="365" y="246" textAnchor="middle" fill="#fff" fontSize="24" fontWeight="800">−17%</text>
              <text x="485" y="186" textAnchor="middle" fill="#fff" fontSize="22" fontWeight="800">no drop</text>
              <circle cx="20" cy="282" r="7" fill={PERI} />
              <text x="34" y="288" fill="#cfdbd3" fontSize="16">Plain ChatGPT</text>
              <circle cx="170" cy="282" r="7" fill={GREEN} />
              <text x="184" y="288" fill="#cfdbd3" fontSize="16">AI tutor with guardrails</text>
              </g>
            </svg>
          </article>
          <article className="finding wide">
            <span className="big">17–25</span>
            <h3>The youngest users lean on AI the most, and think critically the least</h3>
            <p>
              In a study of 666 people, those aged 17 to 25 used AI tools the most, handed off the most thinking to them, and had the lowest critical thinking scores. People over 46 relied on AI least
              and scored highest. It shows a link, not proof that AI caused it, but the direction is clear: the earlier the habit starts, the more there is to lose.
            </p>
            <p className="src">
              Gerlich, <i>Societies</i> (2025), "AI Tools in Society: Impacts on Cognitive Offloading and the Future of Critical Thinking."{" "}
              <a href="https://doi.org/10.3390/soc15010006" {...ext}>
                Read it
              </a>
            </p>
          </article>
          <article className="finding narrow hope">
            <svg viewBox="0 0 100 100" className="hope-rock" aria-hidden="true">
              <RockPerson body={GREEN} pose="cheer" />
            </svg>
            <h3>So the answer isn't less AI. It's better AI.</h3>
            <p>The math study is the hopeful part. When the AI was built to coach instead of answer, students got the help without losing the learning. That's what Cairn does.</p>
            <a className="btn btn-ink" href="#students" style={{ justifySelf: "start" }}>
              See how it works
            </a>
          </article>
        </div>
        <p className="proof-note">Research last checked November 2026. We'll keep this page updated as new studies come out, and add results from our own pilot classes when we have them.</p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------- */

/** The page's thesis, said once and big: what the research adds up to. */
function Thesis() {
  return (
    <section className="thesis" aria-label="Why the work matters">
      <div className="wrap">
        <p className="thesis-line" data-testid="thesis">
          When AI can write the essay, the finished work no longer proves learning. <mark className="thesis-hl">The work behind it does.</mark>
        </p>
        <div className="thesis-rock" aria-hidden="true">
          <svg viewBox="0 0 70 46" className="thesis-arrow">
            <use href="#arrow-curve" />
          </svg>
          <svg viewBox="0 0 100 100" className="thesis-person">
            <RockPerson body={PERI} pose="wave" />
          </svg>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------- */

function ModeFace({ bg, body, ink = INK, extra }: { bg: string; body: string; ink?: string; extra?: React.ReactNode }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill={bg} />
      <g filter="url(#grain)">
        <path d="M18 46c-4-9 1-20 13-22 12-2 20 4 20 13 0 9-7 13-16 13-8 0-14-1-17-4z" fill={body} />
      </g>
      <circle cx="29" cy="37" r="2.2" fill={ink} />
      <circle cx="38" cy="36" r="2.2" fill={ink} />
      <path d="M30 42c3 2 6 2 8 0" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" />
      {extra}
    </svg>
  );
}

const cross = (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

function Turn() {
  return (
    <section className="turn" data-testid="ai-settings">
      <div className="wrap">
        <div className="sec-head">
          <h2>We're not taking AI away.</h2>
          <p>
            AI can be the best tutor a student ever had. Blocking it doesn't work, and spying on students makes school worse. Cairn lets each teacher choose how AI helps on each assignment, and the
            tutor is built to ask questions back instead of handing over answers.
          </p>
          <div className="nots">
            <span className="not">{cross}Not a blocker</span>
            <span className="not">{cross}Not a spy app</span>
            <span className="not">{cross}Not an AI detector</span>
          </div>
        </div>
        <ul className="ai-modes" aria-label="The three AI settings a teacher can pick" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          <li className="ai-mode">
            <ModeFace bg={PERI} body={INK} ink={MINT} />
            <div>
              <h3>AI off</h3>
              <p>For the assignments where students need to do it all on their own.</p>
            </div>
          </li>
          <li className="ai-mode on">
            <ModeFace
              bg={GREEN}
              body={MINT}
              extra={
                <text x="43" y="22" fontFamily="'Lexend Variable', sans-serif" fontWeight="800" fontSize="16" fill={INK}>
                  ?
                </text>
              }
            />
            <div>
              <h3>Tutor only</h3>
              <p>Explains, gives hints and asks questions back. It never writes the work. The setting most classes start with.</p>
            </div>
          </li>
          <li className="ai-mode">
            <ModeFace bg={TEAL} body={PERI} extra={<Spark x={42} y={12} size={12} />} />
            <div>
              <h3>Full help</h3>
              <p>For projects where using AI well is the skill: research, drafting and building files together.</p>
            </div>
          </li>
        </ul>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------- */

type DayItem = [bg: string, icon: keyof typeof DAY_ICONS, text: string];
const DAY_ICONS = {
  pen: <path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />,
  ask: <path d="M9 9a3 3 0 1 1 4 2.8c-.7.3-1 .9-1 1.7V14M12 18h.01" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" fill="none" stroke={INK} strokeWidth="2.2" />
      <path d="M12 8v4l3 2" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  paste: (
    <>
      <rect x="6" y="5" width="12" height="15" rx="2" fill="none" stroke={INK} strokeWidth="2.2" />
      <path d="M9 5V3h6v2" fill="none" stroke={INK} strokeWidth="2.2" />
    </>
  ),
  check: <path d="M5 12l4 4 10-10" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />,
};
const WEEK: { name: string; words: number; items: DayItem[] }[] = [
  { name: "Monday", words: 210, items: [[MINT, "pen", "Wrote the first draft of the intro (about 210 words)"], [PERI, "ask", "Asked the tutor: “Is my thesis too broad?”"]] },
  { name: "Tuesday", words: 0, items: [["#dfe7e2", "clock", "Absent. Asked for one more day, and her teacher said yes"]] },
  { name: "Wednesday", words: 340, items: [[MINT, "pen", "Wrote two body paragraphs (about 340 words)"], [PERI, "ask", "Tutor asked her for a second example, so she found one"]] },
  { name: "Thursday", words: 280, items: [[MINT, "pen", "Rewrote the intro and conclusion (about 280 words)"], [TEAL, "paste", "Pasted a quote from her reading, shown openly on her record"]] },
  { name: "Friday", words: 60, items: [[GREEN, "check", "Turned it in"], [PERI, "pen", "Reflection: “The hardest part was cutting my favorite paragraph.”"]] },
];
const STONE_COLORS = [INK, TEAL, GREEN, MINT, "#ffffff"];

/** One stone per day, bigger for more writing, stacked like a cairn. */
const STONES = (() => {
  let y = 236;
  return WEEK.map((d, i) => {
    const w = d.words ? 110 + d.words * 0.22 : 64;
    const h = d.words ? 36 + d.words * 0.05 : 22;
    const cx = 260 + (i % 2 ? -10 : 12);
    const top = y - h;
    const l = cx - w / 2;
    const r = cx + w / 2;
    const stone = {
      d: `M${l + 6} ${y - 4}C${l - 6} ${top + h * 0.4} ${cx - w * 0.2} ${top} ${cx} ${top}C${cx + w * 0.25} ${top} ${r + 6} ${top + h * 0.35} ${r - 4} ${y - 6}C${r - 20} ${y + 2} ${l + 20} ${y + 2} ${l + 6} ${y - 4}Z`,
      fill: d.words ? STONE_COLORS[i] : "rgba(10,16,13,.25)",
      cx,
      top,
      h,
      face: i === 0 ? MINT : INK,
      outline: i === 4,
    };
    y = top + 4;
    return stone;
  });
})();

function Week() {
  // Starts on Monday with one stone; dragging right builds the week.
  const [v, setV] = useState(0);
  const day = Math.max(0, Math.min(4, Math.round(v)));
  const sum = WEEK.slice(0, day + 1).reduce((a, x) => a + x.words, 0);
  const worked = WEEK.slice(0, day + 1).filter((x) => x.words).length;
  // On release, settle on the nearest day.
  const settle = () => {
    const from = v;
    const to = Math.round(from);
    if (from === to || matchMedia("(prefers-reduced-motion: reduce)").matches) return setV(to);
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 220);
      setV(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  return (
    <div className="week">
      <div className="week-stage">
        <div className="who">
          <b>Maya's essay week</b>
          <span className="sample">Example</span>
        </div>
        <svg className="pile" viewBox="0 0 520 250" aria-hidden="true">
          <ellipse cx="260" cy="236" rx="220" ry="10" fill="rgba(10,16,13,.14)" />
          {STONES.map((s, i) => {
            // A stone fades and drops in as the thumb passes its day.
            const t = Math.max(0, Math.min(1, (v - i + 0.5) / 0.5));
            return (
              <g key={i} style={{ opacity: t, transform: `translateY(${(1 - t) * -36}px) scale(${0.9 + t * 0.1})`, transformBox: "fill-box", transformOrigin: "50% 100%" }}>
                <g filter="url(#grain)">
                  <path d={s.d} fill={s.fill} {...(s.outline ? { stroke: INK, strokeWidth: 3 } : {})} />
                </g>
                <circle cx={s.cx - 9} cy={s.top + s.h * 0.45} r="2.8" fill={s.face} />
                <circle cx={s.cx + 9} cy={s.top + s.h * 0.42} r="2.8" fill={s.face} />
                <path d={`M${s.cx - 5} ${s.top + s.h * 0.62}c3 2.4 7 2.4 10 0`} fill="none" stroke={s.face} strokeWidth="2.2" strokeLinecap="round" />
              </g>
            );
          })}
        </svg>
        <div className="scrub">
          <label htmlFor="week-scrub" className="hand">
            Drag through the week
          </label>
          <input
            id="week-scrub"
            type="range"
            min={0}
            max={4}
            step={0.01}
            value={v}
            aria-valuetext={WEEK[day].name}
            onChange={(e) => setV(Number(e.target.value))}
            onPointerUp={settle}
            onKeyUp={settle}
          />
          <div className="days" aria-hidden="true">
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
          </div>
        </div>
      </div>
      <div className="day-card" aria-live="polite">
        <div className="day">{WEEK[day].name}</div>
        <ul>
          {WEEK[day].items.map(([bg, icon, text]) => (
            <li key={text}>
              <i style={{ background: bg }}>
                <svg viewBox="0 0 24 24">{DAY_ICONS[icon]}</svg>
              </i>
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <div className="total">
          Her record so far: about {sum} words written in Cairn, across {worked} working day{worked === 1 ? "" : "s"}.
        </div>
      </div>
    </div>
  );
}

function OutcomeArt({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 92 92" aria-hidden="true">
      <rect width="92" height="92" rx="28" fill={bg} />
      {children}
    </svg>
  );
}
const face = (body: string, ink = INK, dx = 0) => (
  <>
    <g filter="url(#grain)">
      <path d={`M${20 + dx} 72c-5-12 2-26 18-28 16-2 28 5 29 17 1 12-9 17-22 17-11 0-21-2-25-6z`} fill={body} />
    </g>
    <circle cx={38 + dx} cy="60" r="2.6" fill={ink} />
    <circle cx={50 + dx} cy="59" r="2.6" fill={ink} />
    <path d={`M${40 + dx} 66c3 2 7 2 9 0`} fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" />
  </>
);

function Students() {
  return (
    <section className="students" id="students">
      <div className="wrap">
        <div className="sec-head">
          <h2>Every stone is something you actually did.</h2>
          <p>
            A cairn is a stack of stones hikers build to mark the trail, one at a time. Your work in Cairn builds the same way, day by day, and it's yours to show. Drag through a week to see it grow.
          </p>
        </div>
        <Week />
        <div className="outcomes">
          <div className="outcome">
            <OutcomeArt bg={MINT}>
              {face(PERI)}
              <path d="M46 16c-10 0-16 6-16 13 0 6 4 8 6 12h20c2-4 6-6 6-12 0-7-6-13-16-13z" fill="#fff" stroke={INK} strokeWidth="2.4" />
              <path d="M40 45h12" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
            </OutcomeArt>
            <div>
              <h3>Remember what you learned</h3>
              <p>The tutor makes you explain your thinking, so the ideas end up in your head and not just on the page.</p>
            </div>
          </div>
          <div className="outcome">
            <OutcomeArt bg={TEAL}>
              {face(GREEN, INK, -2)}
              <rect x="52" y="14" width="26" height="32" rx="4" fill="#fff" stroke={INK} strokeWidth="2.4" />
              <path d="M58 24h14M58 31h14M58 38h8" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
            </OutcomeArt>
            <div>
              <h3>Proof of what you did</h3>
              <p>Your work record shows how your work grew, day by day. If someone asks whether you really wrote it, the answer is right there.</p>
            </div>
          </div>
          <div className="outcome">
            <OutcomeArt bg={PERI}>
              <g filter="url(#grain)">
                <path d="M10 72c-4-10 2-21 15-22 13-1 22 5 22 14 0 9-8 12-18 12-9 0-16-1-19-4z" fill={MINT} />
                <path d="M45 72c-4-10 2-21 15-22 13-1 22 5 22 14 0 9-8 12-18 12-9 0-16-1-19-4z" fill={INK} />
              </g>
              <circle cx="23" cy="62" r="2.2" fill={INK} />
              <circle cx="33" cy="61" r="2.2" fill={INK} />
              <circle cx="58" cy="62" r="2.2" fill={MINT} />
              <circle cx="68" cy="61" r="2.2" fill={MINT} />
              <path d="M40 60c4-3 8-3 12 0" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
              <Spark x={38} y={16} size={16} />
            </OutcomeArt>
            <div>
              <h3>Fair credit in group projects</h3>
              <p>Everyone's part shows up automatically, so the person who did the work gets the grade for it.</p>
            </div>
          </div>
          <div className="outcome">
            <OutcomeArt bg={GREEN}>
              {face(TEAL)}
              <circle cx="62" cy="28" r="15" fill="#fff" stroke={INK} strokeWidth="2.4" />
              <path d="M62 20v8l5 4" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
            </OutcomeArt>
            <div>
              <h3>More time when you need it</h3>
              <p>Sick, busy or stuck? Ask your teacher for more time right from the assignment, with a reason. No awkward emails.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------- */

const glyph = (bg: string, path: React.ReactNode) => (
  <span className="glyph" style={{ background: bg }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  </span>
);

function Teachers() {
  return (
    <section className="teachers" id="teachers">
      <div className="wrap">
        <div className="sec-head">
          <h2>For teachers: three steps, every assignment.</h2>
          <p>No new accounts for students and nothing new to learn. If you can post in Google Classroom, you can use Cairn.</p>
        </div>
        <div className="split">
          <ol className="steps">
            <li>
              <div>
                <h3>Make the assignment</h3>
                <p>A title and the instructions. Pick solo or groups and how much AI help to allow. Everything else has a sensible default.</p>
              </div>
            </li>
            <li>
              <div>
                <h3>Post one link in Classroom</h3>
                <p>Each student who opens it gets their own copy, or their group's. Students who join late are placed for you.</p>
              </div>
            </li>
            <li>
              <div>
                <h3>Grade from one screen</h3>
                <p>Cairn shows what's turned in, who needs an answer and who hasn't started. Save, then go to the next one.</p>
              </div>
            </li>
          </ol>
          <div className="mock-wrap">
            <div className="mock" role="img" aria-label="Example of the Cairn Today screen for a teacher">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <h4>Today</h4>
                <span className="sample">Example</span>
              </div>
              <div className="group">
                <span className="label">Ready to grade</span>
                <div className="row">
                  <span className="grow">
                    <b>Chapter 4 response</b>
                    <small>Period 2 English · 12 turned in</small>
                  </span>
                  <span className="pill" style={{ background: GREEN }}>Grade (12)</span>
                </div>
              </div>
              <div className="group">
                <span className="label">Needs your answer</span>
                <div className="row">
                  <span className="grow">
                    <b>Period 5 Biology</b>
                    <small>2 requests for more time</small>
                  </span>
                  <span className="pill" style={{ background: TEAL }}>Answer</span>
                </div>
              </div>
              <div className="group">
                <span className="label">Due soon</span>
                <div className="row">
                  <span className="grow">
                    <b>Lab report</b>
                    <small>Due Thu · 4 of 28 haven't started</small>
                  </span>
                  <span className="pill" style={{ background: MINT }}>See who</span>
                </div>
              </div>
            </div>
            <div className="callout c1" aria-hidden="true">
              <svg viewBox="0 0 70 46">
                <use href="#arrow-curve" />
              </svg>
              <span className="hand">One button to start grading</span>
            </div>
            <div className="callout c2" aria-hidden="true">
              <svg viewBox="0 0 70 46">
                <use href="#arrow-curve" />
              </svg>
              <span className="hand">Catch who's behind before it's due</span>
            </div>
          </div>
        </div>
        <div className="features">
          <div className="feature">
            {glyph(MINT, <><path d="M4 19V6a2 2 0 0 1 2-2h12v15H6a2 2 0 0 0-2 2z" /><path d="M8 8h6M8 12h6" /></>)}
            <h3>See the process, not just the product</h3>
            <p>Each student's work record shows how the work grew, how much they wrote each day, and big pastes, shown openly to them too.</p>
          </div>
          <div className="feature">
            {glyph(PERI, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>)}
            <h3>Work at set times</h3>
            <p>Open it only during class, close it at the due date, and give anyone more time in one click.</p>
          </div>
          <div className="feature">
            {glyph(TEAL, <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /><path d="M4 20 20 4" /></>)}
            <h3>Block outside pasting</h3>
            <p>Turn off pasting from outside Cairn when you want the writing done in the room. Students see when a paste is blocked.</p>
          </div>
          <div className="feature">
            {glyph(GREEN, <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>)}
            <h3>A question at turn-in</h3>
            <p>Students answer one short reflection when they turn in. It takes them half a minute and tells you a lot.</p>
          </div>
          <div className="feature">
            {glyph(MINT, <><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" /></>)}
            <h3>Rubric grading, fast</h3>
            <p>Click scores on your rubric, adjust one student in a group, leave a comment, then Save and next.</p>
          </div>
          <div className="feature">
            {glyph(PERI, <><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></>)}
            <h3>Grades out in one click</h3>
            <p>Download every student's grade for your gradebook, with group members graded one by one.</p>
          </div>
        </div>
        <p style={{ marginTop: 48 }}>
          <Link to="/classes" className="btn btn-quiet" data-testid="teacher-classes-link">
            Set up a class now
          </Link>
        </p>
      </div>
    </section>
  );
}

function Groups() {
  const people = [
    { name: "Ava", body: PERI, ink: INK, detail: "5 tasks · title slide and sources", pct: 41 },
    { name: "Ben", body: TEAL, ink: INK, detail: "4 tasks · causes and timeline", pct: 33 },
    { name: "Cam", body: INK, ink: MINT, detail: "3 tasks · conclusion slide", pct: 26 },
  ];
  return (
    <section className="groups">
      <div className="wrap">
        <div className="sec-head">
          <h2>Group projects, finally fair.</h2>
          <p>
            Everyone has been in the group where one person did everything. In Cairn, each person's part shows up on its own: what they wrote, the tasks they finished, and a note in their own words.
            Nobody has to tell on anybody.
          </p>
        </div>
        <div className="receipt" role="img" aria-label="Example group work record: Ava wrote 41 percent and finished 5 tasks, Ben 33 percent and 4 tasks, Cam 26 percent and 3 tasks.">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h3>WWI presentation · Group 2</h3>
            <span className="sample">Example</span>
          </div>
          {people.map((p) => (
            <div className="person" key={p.name}>
              <RockFace body={p.body} ink={p.ink} className="face" />
              <div>
                <b>{p.name}</b> <small>· {p.detail}</small>
                <div className="bar">
                  <i style={{ width: `${p.pct}%` }} />
                </div>
              </div>
              <span className="pct">{p.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Shown() {
  return (
    <section className="shown">
      <div className="wrap">
        <div className="sec-head">
          <h2>Shown, not watched.</h2>
          <p>Cairn isn't about catching students. It's about letting them prove what they can do.</p>
        </div>
        <div className="promises">
          <div className="promise">
            <span className="num">1:1</span>
            <h3>Students see what teachers see</h3>
            <p>Every work record, every flagged paste, every note. Nothing about a student is hidden from that student.</p>
          </div>
          <div className="promise">
            <span className="num">0</span>
            <h3>Ads, and data sold</h3>
            <p>
              No ads, ever, and student work is never sold. Teachers see progress and turned-in work, not group chats. <a href="/privacy">Read the privacy policy</a>
            </p>
          </div>
          <div className="promise">
            <span className="num">13+</span>
            <h3>Built for school</h3>
            <p>Students join with a class code and their name, no account needed. Teachers sign in with their school Google account.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Founder() {
  return (
    <section className="founder" id="story">
      <div className="wrap">
        <div className="portrait" role="img" aria-label="A small rock character waving from the top of a cairn">
          <svg viewBox="0 0 400 400" aria-hidden="true">
            <g filter="url(#grain)">
              <path d="M70 380c-14-34 16-62 120-66 104-4 150 22 140 52-6 20-60 30-140 30-70 0-112-4-120-16z" fill="var(--ink-tile)" />
              <path d="M110 318c-10-26 14-46 86-48 72-2 104 16 98 40-4 16-44 22-100 22-48 0-78-2-84-14z" fill={TEAL} />
              <path d="M146 266c-8-20 10-34 56-35 46-1 66 12 62 30-3 12-28 16-62 16-30 0-52-2-56-11z" fill={GREEN} />
            </g>
            <svg x="120" y="92" width="170" height="170" viewBox="0 0 100 100">
              <RockPerson body={MINT} pose="wave" />
            </svg>
            <Spark x={128} y={120} size={34} />
            <Spark x={290} y={96} size={22} fill="#ffffff" />
            <path d="M60 120c30-20 50 10 80-6" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
          </svg>
        </div>
        <div className="letter">
          <h2>Why I'm building Cairn</h2>
          <p>I'm a student too. I've always done well in school. When AI showed up, I used it a little here and there, for things I already knew how to do.</p>
          <p>
            Then "a little" turned into almost everything. I started noticing it got harder to focus, harder to remember what I'd read, harder to work through a problem without reaching for AI first.
            When I looked around, almost every student I know was doing the same thing.
          </p>
          <p>
            <mark className="hl">AI is like a drug a lot of us are misusing. It feels like help while it quietly takes something from you.</mark> But AI is also amazing, and it isn't going anywhere. Blocking it doesn't work, and watching students like suspects doesn't either. We're moving into the AI age no matter what. The
            question is whether we do it in a way that makes the next generation sharper or duller.
          </p>
          <p>So I'm building the place I wish I'd had: where AI helps you think instead of thinking for you, and where the work you actually do gets seen and counted.</p>
          <div className="sign">
            <span className="hand">Logan</span>
            <small>16, high school student and founder of Cairn · November 2026</small>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------- */

/** Teachers sign up for the pilot. The free-text question is required: it's how we know who has the problem. */
function Pilot() {
  const account = useAccount();
  const [human, setHuman] = useState("");
  const [form, setForm] = useState({ name: "", email: "", school: "", grade: "", subject: "", classSize: "", classroom: "", problem: "" });
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [err, setErr] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setState("sending");
    const r = await fetch("/api/pilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, human }) });
    const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!d.ok) {
      setState("idle");
      return setErr(d.error ?? "Something went wrong. Please try again.");
    }
    setState("done");
  };
  return (
    <section className="close" id="pilot">
      <svg className="deco" viewBox="0 0 40 40" style={{ width: 46, top: "12%", left: "8%" }} aria-hidden="true">
        <Spark />
      </svg>
      <svg className="deco" viewBox="0 0 40 40" style={{ width: 28, top: "22%", right: "10%" }} aria-hidden="true">
        <Spark fill="#ffffff" />
      </svg>
      <span className="deco" style={{ bottom: "10%", left: -20 }}>
        {squiggle(INK, 180)}
      </span>
      <div className="crew" aria-hidden="true">
        <svg viewBox="0 0 100 100">
          <RockPerson body={PERI} pose="cheer" />
        </svg>
        <svg viewBox="0 0 100 100">
          <RockPerson body={INK} ink={MINT} pose="wave" />
        </svg>
        <svg viewBox="0 0 100 100">
          <RockPerson body={TEAL} pose="hold" prop="book" />
        </svg>
      </div>
      <div className="wrap">
        <h2>Try Cairn with your class.</h2>
        <p className="lead">We're starting with a small group of teachers this year. It's free, you'll help decide what we build next, and we'll help you set it up. We only use your details to reply about the pilot.</p>
        {state === "done" ? (
          <div className="pilot-done" role="status" data-testid="pilot-done">
            <h3>Thank you!</h3>
            <p>We'll be in touch by email to set up a time. Meanwhile you can already make a class and look around.</p>
            <Link to="/classes" className="btn btn-ink">
              Set up a class
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="pilot" data-testid="pilot-form">
            <label>
              Your name
              <input required maxLength={80} value={form.name} onChange={set("name")} autoComplete="name" />
            </label>
            <label>
              School email
              <input required type="email" maxLength={200} value={form.email} onChange={set("email")} autoComplete="email" />
            </label>
            <label>
              <span>
                School <span className="opt">(optional)</span>
              </span>
              <input maxLength={120} value={form.school} onChange={set("school")} />
            </label>
            <label>
              Subject
              <input maxLength={80} value={form.subject} onChange={set("subject")} placeholder="e.g. US History" />
            </label>
            <label>
              Grade level
              <select value={form.grade} onChange={set("grade")}>
                <option value="">Choose…</option>
                {["Middle school (7–8)", "High school (9–12)", "College", "Other"].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <label>
              Students in the class
              <input inputMode="numeric" maxLength={20} value={form.classSize} onChange={set("classSize")} placeholder="e.g. 28" />
            </label>
            <fieldset className="full">
              <legend>Do you use Google Classroom?</legend>
              <div className="chips">
                {["Yes", "Sometimes", "No"].map((v) => (
                  <label key={v} className={`chip${form.classroom === v ? " on" : ""}`}>
                    <input type="radio" name="classroom" value={v} checked={form.classroom === v} onChange={set("classroom")} className="sr-only" />
                    {v}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="full">
              What's the hardest part of assignments for you right now?
              <textarea
                required
                minLength={10}
                maxLength={2000}
                rows={4}
                value={form.problem}
                onChange={set("problem")}
                placeholder="e.g. I can't tell who actually wrote what, or whether they learned anything."
                data-testid="pilot-problem"
              />
            </label>
            <div className="full">
              <HumanCheck siteKey={account.turnstileSiteKey} onToken={setHuman} />
            </div>
            {err && (
              <p className="pilot-msg full" role="alert">
                {err}
              </p>
            )}
            <div className="full">
              <button className="btn btn-ink" type="submit" disabled={state === "sending"} data-testid="pilot-submit">
                {state === "sending" ? "Sending…" : "Join the pilot"}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

const FAQ = [
  {
    q: "Is Cairn an AI detector?",
    a: "No. AI detectors guess, and they're often wrong. Cairn doesn't guess: it shows how the work was made inside Cairn, labels what Cairn's own AI wrote, and the student sees exactly what the teacher sees.",
  },
  { q: "Do students need an account?", a: "No. They open the link from Google Classroom, type their name and confirm they're 13 or older. Teachers sign in with Google." },
  { q: "Can students still use AI?", a: "Yes, as much as the teacher allows on each assignment: off, tutor only, or full help. Most classes start with tutor only." },
  {
    q: "Can't students just use ChatGPT in another tab?",
    a: "They can. That's why Cairn's AI is built to be the better choice: it already knows the assignment and the rubric, and it works inside their files. For assignments where AI is off, a teacher can also block pasting from outside Cairn.",
  },
  { q: "Does my teacher read our chat?", a: "No. Teachers see progress and turned-in work. The only chat a teacher ever sees is a message a student chooses to report." },
  { q: "Does it work for solo work, or only group projects?", a: "Both. One link works for either. Solo gives every student their own copy, groups share one, and each person's part still shows." },
  {
    q: "Does my school's IT need to approve it?",
    a: "Some schools require approval for new apps, especially for student Google accounts. Ask your IT team how they approve tools. Students can also join with just a name and a class code.",
  },
  { q: "What does it cost?", a: "It's free during the pilot. If we add paid plans later, there will still be a free way to use it, and pilot teachers will hear about any change first." },
];

function Faq() {
  return (
    <section className="faq" id="faq">
      <div className="wrap">
        <h2>Questions</h2>
        <div data-testid="faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
