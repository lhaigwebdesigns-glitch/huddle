import { useEffect, useState } from "react";

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

  const load = async (t = token) => {
    setErr("");
    const res = await fetch("/api/admin/feedback", { headers: { "x-admin-token": t } });
    if (!res.ok) return setErr("Wrong admin token (set ADMIN_TOKEN as a secret on the server).");
    sessionStorage.setItem("huddle.admin", t);
    setRows(((await res.json()) as { items: Row[] }).items);
    const u = await fetch("/api/admin/usage", { headers: { "x-admin-token": t } });
    if (u.ok) setUsage(await u.json());
  };
  const [usage, setUsage] = useState<{ rows: { day: string; provider: string; turns: number }[]; limit: number } | null>(null);
  const byDay = new Map<string, { total: number; parts: string[] }>();
  for (const r of usage?.rows ?? []) {
    const d = byDay.get(r.day) ?? { total: 0, parts: [] };
    d.total += r.turns;
    d.parts.push(`${r.provider} ${r.turns}`);
    byDay.set(r.day, d);
  }
  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setHealth);
    if (token) load();
  }, []);

  const up = rows?.filter((r) => r.rating === 1).length ?? 0;
  const down = rows?.filter((r) => r.rating === -1).length ?? 0;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-bold">Huddle admin</h1>
      {health && (
        <div className="mt-3 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          <b>AI providers:</b>{" "}
          {health.providers.length ? health.providers.map((p: any) => `${p.label} (${p.model})`).join(" → ") : "none configured"}
          <br />
          <b>Search:</b> {health.search} · <b>Skills:</b> {health.skills}
        </div>
      )}
      {!rows && (
        <form className="mt-4 flex gap-2" onSubmit={(e) => (e.preventDefault(), load())}>
          <input
            type="password"
            placeholder="Admin token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
          />
          <button className="rounded-lg bg-primary px-4 py-2 text-primary-fg">Open</button>
        </form>
      )}
      {err && <p className="mt-2 text-red-600">{err}</p>}
      {rows && <KeyHealth token={token} />}
      {rows && <PcSwitch token={token} onChanged={() => fetch("/api/health").then((r) => r.json()).then(setHealth)} />}
      {usage && (
        <div className="mt-4 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800" data-testid="usage">
          <b>Cloud AI turns per day</b> <span className="text-zinc-500">(site-wide limit {usage.limit}/day; Local mode isn't counted)</span>
          {byDay.size === 0 ? (
            <p className="mt-1 text-zinc-500">No AI turns recorded yet.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {[...byDay].map(([day, d]) => (
                <li key={day} className="flex items-center gap-3">
                  <span className="w-24 font-mono text-xs">{day}</span>
                  <span className="h-2 rounded bg-primary" style={{ width: `${Math.max(2, Math.min(100, (d.total / usage.limit) * 100))}%`, maxWidth: "40%" }} />
                  <span className="font-medium">{d.total}</span>
                  <span className="truncate text-xs text-zinc-500">{d.parts.join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {rows && (
        <>
          <p className="mt-4 text-sm text-zinc-500">
            {rows.length} feedback items · 👍 {up} · 👎 {down}
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-zinc-500">
                <tr>
                  <th className="p-2">When</th>
                  <th className="p-2">Who</th>
                  <th className="p-2">Rating</th>
                  <th className="p-2">Comment</th>
                  <th className="p-2">AI reply excerpt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                    <td className="whitespace-nowrap p-2">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="p-2">{r.name} <span className="font-mono text-xs text-zinc-500">{r.room}</span></td>
                    <td className="p-2">{r.rating === 1 ? "👍" : r.rating === -1 ? "👎" : "💬"}</td>
                    <td className="max-w-xs p-2">{r.comment}</td>
                    <td className="max-w-sm p-2 text-zinc-500">{r.excerpt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
