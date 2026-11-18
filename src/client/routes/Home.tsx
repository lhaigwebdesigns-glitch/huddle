import { useEffect, useState } from "react";
import { signInUrl, useAccount } from "../lib/account";
import { AccountMenu } from "../components/AccountMenu";
import { useNavigate } from "react-router-dom";
import { formatCode, isValidCode, normalizeCode } from "../../shared/code";
import { getIdentity, recentRooms, setName } from "../lib/identity";

export default function Home() {
  const nav = useNavigate();
  const me = getIdentity();
  const [name, setNameState] = useState(me.name);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const account = useAccount();
  const [myRooms, setMyRooms] = useState<{ code: string; title: string }[]>([]);
  useEffect(() => {
    if (!account.user) return;
    fetch("/api/auth/rooms")
      .then((r) => r.json() as Promise<{ rooms: { code: string; title: string }[] }>)
      .then((d) => setMyRooms(d.rooms))
      .catch(() => {});
  }, [account.user]);
  // Signed in: rooms from your account (all devices), else this browser's recent rooms.
  const recent = account.user && myRooms.length ? myRooms : recentRooms();

  const ensureName = () => {
    if (!name.trim()) {
      setErr("Pick a display name first so others know who you are.");
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
    if (!isValidCode(c)) return setErr("Party codes are 6 letters/numbers, like K7Q-29F.");
    setBusy(true);
    const res = await fetch(`/api/rooms/${c}`);
    setBusy(false);
    if (!res.ok) return setErr("That code doesn't match a room. Check the letters and try again.");
    nav(`/r/${c}`);
  };

  return (
    <div className="min-h-full">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <img src="/favicon.svg" className="h-7 w-7" alt="" /> Huddle
        </div>
        <AccountMenu user={account.user} providers={account.providers} />
      </header>

      <main className="mx-auto grid max-w-5xl gap-10 px-4 pb-16 pt-6 md:grid-cols-2 md:pt-14">
        <section>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            Talk to AI <span className="text-indigo-600 dark:text-indigo-400">together.</span>
          </h1>
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
            Huddle is a multiplayer AI workspace. Start a room, share the party code, and everyone chats with the same
            AI in real time. It searches the web and builds docs, sheets, slides, whiteboards, forms and mini-apps that
            you all edit live, on free open-source models.
          </p>
          <ul className="mt-6 space-y-2 text-zinc-700 dark:text-zinc-300">
            <li>👥 Party codes: friends join in seconds, no sign-up</li>
            <li>🌐 Web search & page reading with sources</li>
            <li>📄📊🖼️ Docs, Sheets (formulas & charts) and Slides (present together), all live</li>
            <li>🎨📝 Whiteboards, Forms with public links, and AI-built mini-apps</li>
            <li>🧠 20 expert skills, Deep Research mode and room memory</li>
            <li>💻 Local mode: run the AI on your own device, free & private</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <label className="block text-sm font-medium">Your name</label>
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
            placeholder="e.g. Sam"
            value={name}
            maxLength={32}
            onChange={(e) => setNameState(e.target.value)}
          />

          <div className="mt-6 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/50">
            <div className="text-sm font-semibold">Join with a party code</div>
            <div className="mt-2 flex gap-2">
              <input
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono uppercase tracking-widest dark:border-zinc-700 dark:bg-zinc-900"
                placeholder="K7Q-29F"
                value={code}
                maxLength={7}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && join()}
              />
              <button
                onClick={join}
                disabled={busy}
                className="rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
              >
                Join
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-indigo-50 p-4 dark:bg-indigo-950/40">
            <div className="text-sm font-semibold">Start a new room</div>
            <input
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="Room name (optional) — e.g. Bio project"
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
            <button
              onClick={create}
              disabled={busy}
              className="mt-2 w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Create room & get a code
            </button>
          </div>

          {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

          {recent.length > 0 && (
            <div className="mt-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500" data-testid="rooms-heading">
                {account.user && myRooms.length ? "My rooms" : "Recent rooms"}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {recent.map((r) => (
                  <button
                    key={r.code}
                    onClick={() => {
                      if (ensureName()) nav(`/r/${r.code}`);
                    }}
                    className="rounded-full border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    {r.title} <span className="font-mono text-zinc-500">{formatCode(r.code)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
