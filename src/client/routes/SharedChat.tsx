import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Link2Off } from "lucide-react";
import { Markdown } from "../components/Markdown";

interface Msg {
  role: string;
  authorName: string;
  content: string;
  createdAt: number;
  sources?: { title: string; url: string }[];
  poll?: { question: string; options: string[] };
}

/** Read-only view of a shared chat: /s/:id */
export default function SharedChat() {
  const { id = "" } = useParams();
  const [data, setData] = useState<{ title: string; createdAt: number; messages: Msg[] } | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing" | "offline">("loading");
  useEffect(() => {
    fetch(`/api/share/${encodeURIComponent(id)}`)
      .then(async (r) => {
        if (!r.ok) return setState("missing");
        setData((await r.json()) as typeof data);
        setState("ok");
      })
      .catch(() => setState("offline"));
  }, [id]);
  useEffect(() => {
    if (data) document.title = `${data.title} · shared from Cairn`;
  }, [data]);
  return (
    <div className="min-h-full bg-bg">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link to="/" aria-label="Cairn home">
            <img src="/cairn-icon.svg" alt="" className="h-7 w-7" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display font-bold" data-testid="shared-title">
              {data?.title ?? "Shared chat"}
            </h1>
            {data && (
              <p className="text-xs text-fg-muted">
                Read-only copy of the chat from {new Date(data.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
              </p>
            )}
          </div>
          <Link to="/" className="press shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
            <span className="sm:hidden">Try Cairn</span>
            <span className="hidden sm:inline">Start your own room on Cairn</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-4">
        {state === "loading" && <p className="py-10 text-center text-sm text-fg-subtle">Loading the chat…</p>}
        {(state === "missing" || state === "offline") && (
          <div className="mx-auto mt-10 max-w-md rounded-2xl border border-line bg-surface px-6 py-10 text-center" data-testid="shared-missing">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2">
              <Link2Off className="h-5 w-5 text-fg-muted" aria-hidden />
            </div>
            <h2 className="mt-4 font-display text-lg font-bold">{state === "missing" ? "This link doesn't work" : "Couldn't load this chat"}</h2>
            <p className="mt-1 text-sm text-fg-muted">
              {state === "missing" ? "It may have been typed wrong, or the room it came from was deleted. Ask whoever sent it for a new link." : "Check your connection and try again."}
            </p>
          </div>
        )}
        {data?.messages.map((m, i) => (
          <article key={i} className="border-b border-line py-4 last:border-0" data-testid="shared-message">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold">
                {m.role === "assistant" ? "✦ " : ""}
                {m.authorName}
              </span>
              <span className="text-xs text-fg-subtle">{new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
            </div>
            {m.role === "assistant" ? <Markdown text={m.content} /> : <p className="mt-1 whitespace-pre-wrap">{m.content}</p>}
            {m.poll && <p className="mt-1 text-sm text-fg-muted">Poll options: {m.poll.options.join(" · ")}</p>}
            {!!m.sources?.length && (
              <p className="mt-1 text-xs text-fg-muted">
                Sources:{" "}
                {m.sources.map((s, j) => (
                  <a key={j} href={s.url} target="_blank" rel="noreferrer noopener" className="mr-2 underline">
                    {j + 1}
                  </a>
                ))}
              </p>
            )}
          </article>
        ))}
      </main>
    </div>
  );
}
