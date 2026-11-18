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
