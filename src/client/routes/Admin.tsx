import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Input, Logo, ThemeToggle } from "../components/ui";
import { AdminAnalytics } from "../components/AdminAnalytics";

interface Row {
  id: number;
  created_at: number;
  room: string;
  name: string;
  rating: number;
  comment: string;
  excerpt: string;
  page: string;
}

interface PcState {
  configured: boolean;
  enabled: boolean;
  online: boolean;
  loaded: string[];
  unloaded?: number;
}

/** "Use my PC for AI": off skips Ollama everywhere and frees the GPU right away (for games). */
function PcSwitch({ token, onChanged }: { token: string; onChanged: () => void }) {
  const [pc, setPc] = useState<PcState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const refresh = () =>
    fetch("/api/admin/pc", { headers: { "x-admin-token": token } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPc(d as PcState));
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [token]);
  if (!pc) return null;
  if (!pc.configured)
    return <p className="mt-4 rounded-lg border border-line p-3 text-sm text-fg-muted">No PC is connected to this site for AI.</p>;

  const toggle = async () => {
    setBusy(true);
    setNote("");
    const r = await fetch("/api/admin/pc", {
      method: "POST",
      headers: { "x-admin-token": token, "content-type": "application/json" },
      body: JSON.stringify({ enabled: !pc.enabled }),
    });
    const d = (await r.json()) as PcState & { error?: string };
    setBusy(false);
    if (!r.ok) return setNote(d.error ?? "Couldn't change it.");
    setPc(d);
    setNote(d.enabled ? "On: rooms use your PC first." : d.unloaded ? "Off: the model was cleared from your graphics card." : "Off: rooms use the hosted free models.");
    onChanged();
  };
  const status = !pc.online ? "PC offline (Ollama or the tunnel isn't running)" : pc.loaded.length ? `Online · ${pc.loaded.join(", ")} loaded in GPU memory` : "Online · nothing loaded in GPU memory";

  return (
    <div className="mt-4 flex items-start justify-between gap-4 rounded-lg border border-line p-4" data-testid="pc-switch">
      <div>
        <div className="font-medium">Use my PC for AI</div>
        <p className="mt-0.5 text-sm text-fg-muted">
          Turn off to game: Huddle stops sending prompts to Ollama and empties your graphics card. Rooms keep working on Groq and Cloudflare.
        </p>
        <p className="mt-2 flex items-center gap-2 text-xs text-fg-subtle">
          <span className={`inline-block h-2 w-2 rounded-full ${pc.online ? "bg-emerald-500" : "bg-zinc-400"}`} aria-hidden />
          {status}
        </p>
        {note && <p className="mt-1 text-xs text-fg-muted" role="status">{note}</p>}
      </div>
      <button
        role="switch"
        aria-checked={pc.enabled}
        aria-label="Use my PC for AI"
        disabled={busy}
        onClick={toggle}
        className={`press relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${pc.enabled ? "bg-primary" : "bg-zinc-300 dark:bg-zinc-700"}`}
      >
        <span
          className={`absolute top-1 left-1 h-5 w-5 rounded-full shadow transition-transform duration-200 ease-out ${pc.enabled ? "translate-x-5 bg-primary-fg" : "bg-white"}`}
        />
      </button>
    </div>
  );
}


interface KeyCheck {
  name: string;
  what: string;
  status: "ok" | "problem" | "warning" | "not set";
  detail: string;
}

const STATUS_STYLE: Record<KeyCheck["status"], [string, string]> = {
  ok: ["bg-emerald-500", "OK"],
  warning: ["bg-amber-500", "Check"],
  problem: ["bg-red-500", "Problem"],
  "not set": ["bg-zinc-400", "Not set"],
};

/** Tests every API key the site has, on the server (key values are never sent to the browser). */
function KeyHealth({ token }: { token: string }) {
  const [checks, setChecks] = useState<KeyCheck[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const r = await fetch("/api/admin/keys", { method: "POST", headers: { "x-admin-token": token } });
    setBusy(false);
    if (r.ok) setChecks(((await r.json()) as { checks: KeyCheck[] }).checks);
  };
  const problems = checks?.filter((c) => c.status === "problem").length ?? 0;
  return (
    <div className="mt-4 rounded-lg border border-line p-4" data-testid="key-health">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-medium">API keys</div>
          <p className="mt-0.5 text-sm text-fg-muted">
            {checks ? (problems ? `${problems} key${problems > 1 ? "s need" : " needs"} attention.` : "Every key that's set is working.") : "Test every key with a tiny request. Takes a few seconds."}
          </p>
        </div>
        <button onClick={run} disabled={busy} className="press shrink-0 rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium hover:bg-accent-soft disabled:opacity-60">
          {busy ? "Checking…" : checks ? "Check again" : "Check API keys"}
        </button>
      </div>
      {checks && (
        <ul className="mt-3 divide-y divide-line text-sm">
          {checks.map((c) => (
            <li key={c.name} className="flex items-start gap-3 py-2">
              <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${STATUS_STYLE[c.status][0]}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{c.what}</span>
                  <span className="font-mono text-xs text-fg-subtle">{c.name}</span>
                </div>
                <div className="text-fg-muted">{c.detail}</div>
              </div>
              <span className="shrink-0 text-xs font-medium text-fg-muted">{STATUS_STYLE[c.status][1]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Admin() {
  const [token, setToken] = useState(() => sessionStorage.getItem("huddle.admin") ?? "");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (t = token) => {
    setErr("");
    setBusy(true);
    const res = await fetch("/api/admin/feedback", { headers: { "x-admin-token": t } }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setErr("That admin password didn't work.");
    sessionStorage.setItem("huddle.admin", t);
    setRows(((await res.json()) as { items: Row[] }).items);
  };
  useEffect(() => {
    document.title = "Admin · Huddle";
    fetch("/api/health").then((r) => r.json()).then(setHealth);
    if (token) load();
  }, []);

  const signOut = () => {
    sessionStorage.removeItem("huddle.admin");
    setRows(null);
    setToken("");
  };

  if (!rows)
    return (
      <div className="flex min-h-full items-center justify-center bg-sidebar p-4">
        <form className="rise w-full max-w-sm rounded-[24px] border border-line bg-bg p-7 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.18)]" onSubmit={(e) => (e.preventDefault(), load())}>
          <Logo className="h-9 w-9" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Huddle admin</h1>
          <p className="mt-1.5 text-[15px] text-fg-muted">Enter the admin password (the ADMIN_TOKEN secret).</p>
          <Input type="password" autoFocus aria-label="Admin password" placeholder="Admin password" value={token} onChange={(e) => setToken(e.target.value)} className="mt-5 h-11" />
          {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">{err}</p>}
          <Button className="mt-3 w-full" size="lg" disabled={busy || !token}>{busy ? "Checking…" : "Open admin"}</Button>
        </form>
      </div>
    );

  const up = rows.filter((r) => r.rating === 1).length;
  const down = rows.filter((r) => r.rating === -1).length;

  return (
    <div className="min-h-full bg-bg">
      <header className="glass sticky top-0 z-30 border-b border-line/60 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <Logo className="h-6 w-6" /> Huddle
          </Link>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-fg-muted">Admin</span>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={signOut}>Lock</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6">
        <AdminAnalytics token={token} />

        <h2 className="mt-12 text-lg font-semibold tracking-tight">Setup</h2>
        {health && (
          <div className="mt-4 rounded-lg border border-line p-4 text-sm">
            <div className="font-medium">AI line-up</div>
            <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              {health.providers.length ? (
                health.providers.map((p: any, i: number) => (
                  <li key={p.id} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-fg-subtle">→</span>}
                    <span className="rounded-full border border-line px-2 py-0.5">{p.label === "Self-hosted" ? "Your PC" : p.label} <span className="text-fg-subtle">{p.model}</span></span>
                  </li>
                ))
              ) : (
                <li className="text-fg-muted">No AI configured.</li>
              )}
            </ol>
            <p className="mt-2 text-xs text-fg-subtle">Web search: {health.search} · Skills: {health.skills}</p>
          </div>
        )}
        <div className="grid gap-x-4 lg:grid-cols-2">
          <KeyHealth token={token} />
          <PcSwitch token={token} onChanged={() => fetch("/api/health").then((r) => r.json()).then(setHealth)} />
        </div>

        <h2 className="mt-12 text-lg font-semibold tracking-tight">Feedback</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {rows.length} items · 👍 {up} · 👎 {down}
        </p>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-sidebar text-xs uppercase tracking-wide text-fg-subtle">
              <tr>
                <th className="p-3 font-medium">When</th>
                <th className="p-3 font-medium">Who</th>
                <th className="p-3 font-medium">Rating</th>
                <th className="p-3 font-medium">Comment</th>
                <th className="p-3 font-medium">AI reply excerpt</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-fg-subtle">No feedback yet.</td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="whitespace-nowrap p-3 text-fg-muted">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="p-3">{r.name} <span className="font-mono text-xs text-fg-subtle">{r.room}</span></td>
                  <td className="p-3">{r.rating === 1 ? "👍" : r.rating === -1 ? "👎" : "💬"}</td>
                  <td className="max-w-xs p-3">{r.comment}</td>
                  <td className="max-w-sm p-3 text-fg-muted">{r.excerpt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
