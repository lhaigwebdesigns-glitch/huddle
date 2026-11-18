import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch(`/api/share/${encodeURIComponent(id)}`)
      .then(async (r) => (r.ok ? setData((await r.json()) as any) : setErr(((await r.json()) as { error?: string }).error ?? "Not found")))
      .catch(() => setErr("Couldn't load this page."));
  }, [id]);
  useEffect(() => {
    if (data) document.title = `${data.title} · shared from Huddle`;
  }, [data]);
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-6 w-6" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold" data-testid="shared-title">{data?.title ?? "Shared chat"}</h1>
            {data && <p className="text-xs text-zinc-500">Read-only snapshot · {new Date(data.createdAt).toLocaleString()}</p>}
          </div>
          <Link to="/" className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg">Start your own Huddle</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-4">
        {err && <p className="text-center text-zinc-500">{err}</p>}
        {data?.messages.map((m, i) => (
          <article key={i} className="py-3" data-testid="shared-message">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold">{m.role === "assistant" ? "✦ " : ""}{m.authorName}</span>
              <span className="text-xs text-zinc-400">{new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
            </div>
            {m.role === "assistant" ? <Markdown text={m.content} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
            {m.poll && <p className="text-sm text-zinc-500">Poll options: {m.poll.options.join(" · ")}</p>}
            {!!m.sources?.length && (
              <p className="mt-1 text-xs text-zinc-500">
                Sources:{" "}
                {m.sources.map((s, j) => (
                  <a key={j} href={s.url} target="_blank" rel="noreferrer noopener" className="mr-2 underline">{j + 1}</a>
                ))}
              </p>
            )}
          </article>
        ))}
      </main>
    </div>
  );
}
