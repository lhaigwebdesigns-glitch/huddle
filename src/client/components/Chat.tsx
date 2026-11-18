import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { REACTIONS, type ChatMessage, type ClientMsg, type Member, type Poll, type RoomSettings } from "../../shared/protocol";
import { Markdown } from "./Markdown";
import { expandSlash, matchSlash, parsePoll } from "../lib/slash";
import type { Attachment } from "../../shared/protocol";
import { uploadFile } from "../lib/uploads";

function Attachments({ items, send }: { items: Attachment[]; send: (m: ClientMsg) => void }) {
  if (!items.length) return null;
  const images = items.filter((a) => a.type.startsWith("image/"));
  const files = items.filter((a) => !a.type.startsWith("image/"));
  return (
    <div className="mt-2 space-y-2" data-testid="attachments">
      {!!images.length && (
        <div className="flex flex-wrap gap-2">
          {images.map((a) => (
            <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
              <img src={a.url} alt={a.name} loading="lazy" className="max-h-56 max-w-[16rem] object-cover" />
            </a>
          ))}
        </div>
      )}
      {files.map((a) => (
        <div key={a.id} className="flex max-w-md items-center gap-2 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-800" data-testid="file-chip">
          <span aria-hidden>{a.type === "application/pdf" ? "📕" : a.type === "text/csv" ? "📊" : "📄"}</span>
          <a href={a.url} className="min-w-0 flex-1 truncate hover:underline" title={a.name}>{a.name}</a>
          <span className="text-xs text-zinc-400">{Math.max(1, Math.round(a.size / 1024))} KB{a.indexed ? " · searchable" : ""}</span>
          {a.type === "text/csv" && (
            <button
              className="rounded bg-indigo-600 px-1.5 py-0.5 text-xs font-medium text-white"
              onClick={async () => send({ t: "import_csv", title: a.name.replace(/\.csv$/i, ""), csv: await (await fetch(a.url)).text() })}
              data-testid="open-as-sheet"
            >
              Open as sheet
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Plain text for reading a reply aloud. */
const speakable = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, " (code) ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_`>|~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

type SpeechRec = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null };
const SpeechRecognitionCtor: (new () => SpeechRec) | undefined =
  typeof window !== "undefined" ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition) : undefined;

function PollCard({ id, poll, me, members, send }: { id: string; poll: Poll; me: Member; members: Member[]; send: (m: ClientMsg) => void }) {
  const total = Object.values(poll.votes).reduce((n, v) => n + v.length, 0);
  const nameOf = (uid: string) => members.find((m) => m.uid === uid)?.name ?? "someone";
  return (
    <div className="mt-2 max-w-md rounded-xl border border-zinc-200 p-3 dark:border-zinc-800" data-testid="poll">
      <div className="font-medium">{poll.question}</div>
      <div className="mt-2 space-y-1.5">
        {poll.options.map((o, i) => {
          const voters = poll.votes[String(i)] ?? [];
          const mine = voters.includes(me.uid);
          const pct = total ? Math.round((voters.length / total) * 100) : 0;
          return (
            <button
              key={i}
              onClick={() => send({ t: "vote", id, option: i })}
              className={`relative block w-full overflow-hidden rounded-lg border px-3 py-1.5 text-left text-sm ${mine ? "border-indigo-500" : "border-zinc-200 hover:border-indigo-300 dark:border-zinc-700"}`}
              aria-pressed={mine}
              title={voters.map(nameOf).join(", ") || "No votes yet"}
              data-testid="poll-option"
            >
              <span className="absolute inset-y-0 left-0 bg-indigo-100 dark:bg-indigo-950/60" style={{ width: `${pct}%` }} aria-hidden />
              <span className="relative flex justify-between gap-2">
                <span>{mine ? "✓ " : ""}{o}</span>
                <span className="text-xs text-zinc-500">{voters.length} · {pct}%</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 text-xs text-zinc-500">{total} vote{total === 1 ? "" : "s"} · click again to take your vote back</div>
    </div>
  );
}

function Reactions({ m, me, members, send }: { m: ChatMessage; me: Member; members: Member[]; send: (msg: ClientMsg) => void }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(m.meta?.reactions ?? {}).filter(([, u]) => u.length);
  const nameOf = (uid: string) => members.find((x) => x.uid === uid)?.name ?? "someone";
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {entries.map(([emoji, uids]) => (
        <button
          key={emoji}
          onClick={() => send({ t: "react", id: m.id, emoji })}
          className={`rounded-full border px-1.5 text-xs ${uids.includes(me.uid) ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950/50" : "border-zinc-200 dark:border-zinc-700"}`}
          title={uids.map(nameOf).join(", ")}
          aria-label={`${emoji} ${uids.length}, react`}
          data-testid="reaction"
        >
          {emoji} {uids.length}
        </button>
      ))}
      <span className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className={`rounded-full px-1.5 text-xs text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${entries.length ? "" : "opacity-0 focus:opacity-100 group-hover:opacity-100"}`}
          aria-label="Add reaction"
          aria-expanded={open}
          data-testid="add-reaction"
        >
          ☺+
        </button>
        {open && (
          <span className="absolute bottom-full left-0 z-10 mb-1 flex gap-0.5 rounded-full border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900" onMouseLeave={() => setOpen(false)}>
            {REACTIONS.map((e) => (
              <button key={e} onClick={() => (send({ t: "react", id: m.id, emoji: e }), setOpen(false))} className="rounded-full px-1 text-base hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label={`React ${e}`}>
                {e}
              </button>
            ))}
          </span>
        )}
      </span>
    </div>
  );
}

const STEP_ICON: Record<string, string> = { search: "🔎", fetch: "📖", skill: "🧠", doc: "📄", other: "⚙️" };

/** Messages from the same person within this window are grouped under one header. */
const GROUP_MS = 5 * 60_000;

const SUGGESTIONS = [
  { label: "🔎 Search the news", text: "Search the web for this week's top science news and summarize 3 stories with sources." },
  { label: "📄 Write a plan doc", text: "Write a project plan doc for our group project with goals, tasks and a timeline." },
  { label: "🧠 Brainstorm ideas", text: "Help us brainstorm 10 creative ideas for a weekend project, then pick the best 3." },
  { label: "🧮 Explain step by step", text: "Explain how compound interest works, step by step, with a small example." },
];

function Avatar({ name, color, ai }: { name: string; color: string; ai?: boolean }) {
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
      style={{ background: ai ? "linear-gradient(135deg,#6366f1,#a855f7)" : color }}
      aria-hidden
    >
      {ai ? "✦" : name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function timeOf(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function dayLabel(ms: number) {
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function Feedback({ msg, room, me, canRegenerate, onRegenerate }: { msg: ChatMessage; room: string; me: Member; canRegenerate: boolean; onRegenerate: () => void }) {
  const [sent, setSent] = useState<0 | 1 | -1>(0);
  const [asking, setAsking] = useState(false);
  const [comment, setComment] = useState("");
  const [copied, setCopied] = useState(false);
  const submit = (rating: 1 | -1, text = "") =>
    fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room, uid: me.uid, name: me.name, messageId: msg.id, rating, comment: text, excerpt: msg.content.slice(0, 400) }),
    });
  const btn = "rounded px-1 hover:text-zinc-700 dark:hover:text-zinc-200";
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
      <button className={`${btn} ${sent === 1 ? "text-green-600" : ""}`} title="Good response" aria-label="Good response" onClick={() => (setSent(1), submit(1))}>
        👍
      </button>
      <button className={`${btn} ${sent === -1 ? "text-red-600" : ""}`} title="Bad response" aria-label="Bad response" onClick={() => (setSent(-1), setAsking(true))}>
        👎
      </button>
      <button
        className={btn}
        onClick={() => {
          navigator.clipboard.writeText(msg.content);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      {canRegenerate && (
        <button className={btn} onClick={onRegenerate} title="Ask the AI to answer again" data-testid="regenerate">
          ↻ Regenerate
        </button>
      )}
      {"speechSynthesis" in window && (
        <button
          className={btn}
          title="Read this reply aloud"
          onClick={() => {
            speechSynthesis.cancel();
            speechSynthesis.speak(new SpeechSynthesisUtterance(speakable(msg.content)));
          }}
        >
          🔊
        </button>
      )}
      {msg.meta?.model && <span className="truncate">· {msg.meta.model}</span>}
      {asking && (
        <form className="flex w-full gap-2" onSubmit={(e) => (e.preventDefault(), submit(-1, comment), setAsking(false))}>
          <input
            autoFocus
            className="flex-1 rounded border border-zinc-300 bg-transparent px-2 py-1 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
            placeholder="What went wrong? (optional)"
            aria-label="What went wrong?"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button className="rounded bg-zinc-800 px-2 text-white">Send</button>
        </form>
      )}
    </div>
  );
}

function EditBox({ initial, onSave, onCancel }: { initial: string; onSave: (t: string) => void; onCancel: () => void }) {
  const [t, setT] = useState(initial);
  return (
    <form
      className="mt-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (t.trim()) onSave(t.trim());
      }}
    >
      <textarea
        autoFocus
        rows={Math.min(8, t.split("\n").length + 1)}
        className="w-full resize-none rounded-lg border border-indigo-300 bg-white p-2 text-[15px] outline-none dark:border-indigo-700 dark:bg-zinc-900"
        value={t}
        aria-label="Edit message"
        onChange={(e) => setT(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (t.trim()) onSave(t.trim());
          }
        }}
      />
      <div className="mt-1 flex gap-2 text-xs">
        <button className="rounded bg-indigo-600 px-2 py-1 font-medium text-white">Save & resend</button>
        <button type="button" onClick={onCancel} className="rounded px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
          Cancel
        </button>
      </div>
    </form>
  );
}

function MessageView({
  m,
  members,
  room,
  me,
  grouped,
  canRegenerate,
  canEdit,
  send,
}: {
  m: ChatMessage;
  members: Member[];
  room: string;
  me: Member;
  grouped: boolean;
  canRegenerate: boolean;
  canEdit: boolean;
  send: (m: ClientMsg) => void;
}) {
  const [editing, setEditing] = useState(false);
  const isAi = m.role === "assistant";
  const author = members.find((x) => x.uid === m.authorId);
  const color = author?.color ?? "#71717a";
  return (
    <div
      className={`group flex gap-3 px-4 ${grouped ? "py-0.5" : "pt-3 pb-0.5"}`}
      data-testid={isAi ? "ai-message" : "user-message"}
    >
      {grouped ? (
        <div className="w-8 shrink-0 pt-1 text-right text-[10px] text-zinc-400 opacity-0 group-hover:opacity-100">{timeOf(m.createdAt)}</div>
      ) : (
        <Avatar name={m.authorName} color={color} ai={isAi} />
      )}
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="font-semibold">{m.authorName}</span>
            <span className="text-xs text-zinc-400">{timeOf(m.createdAt)}</span>
          </div>
        )}
        {isAi && !!m.meta?.steps?.length && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {m.meta.steps.map((s, i) => (
              <span key={i} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {STEP_ICON[s.kind] ?? "⚙️"} {s.label}
              </span>
            ))}
          </div>
        )}
        {isAi ? (
          m.content ? (
            <div className={m.meta?.error ? "text-amber-700 dark:text-amber-400" : ""}>
              <Markdown text={m.content} />
            </div>
          ) : (
            <div className="mt-2 flex gap-1 text-zinc-400" aria-label="AI is thinking">
              <span className="typing-dot">●</span>
              <span className="typing-dot">●</span>
              <span className="typing-dot">●</span>
            </div>
          )
        ) : editing ? (
          <EditBox
            initial={m.content}
            onCancel={() => setEditing(false)}
            onSave={(text) => {
              send({ t: "edit", id: m.id, text });
              setEditing(false);
            }}
          />
        ) : (
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[15px]">
              {m.meta?.poll ? null : m.content}
              {m.meta?.edited && <span className="ml-1 text-xs text-zinc-400">(edited)</span>}
            </div>
            {canEdit && (
              <button
                onClick={() => setEditing(true)}
                className="shrink-0 rounded px-1.5 text-xs text-zinc-400 opacity-0 hover:bg-zinc-100 hover:text-zinc-700 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                title="Edit message"
                data-testid="edit-message"
              >
                ✎ Edit
              </button>
            )}
          </div>
        )}
        {isAi && !!m.meta?.sources?.length && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {m.meta.sources.map((s, i) => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
                className="max-w-[16rem] truncate rounded-md border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                title={s.url}
              >
                {i + 1}. {safeHost(s.url)}
              </a>
            ))}
          </div>
        )}
        <Attachments items={[...(m.meta?.attachments ?? []), ...(m.meta?.images ?? [])]} send={send} />
        {m.meta?.poll && <PollCard id={m.id} poll={m.meta.poll} me={me} members={members} send={send} />}
        {!m.meta?.streaming && <Reactions m={m} me={me} members={members} send={send} />}
        {isAi && !m.meta?.streaming && (
          <Feedback msg={m} room={room} me={me} canRegenerate={canRegenerate} onRegenerate={() => send({ t: "regenerate" })} />
        )}
      </div>
    </div>
  );
}

function safeHost(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

export function Chat({
  messages,
  members,
  me,
  settings,
  room,
  send,
  localProgress,
}: {
  messages: ChatMessage[];
  members: Member[];
  me: Member;
  settings: RoomSettings;
  room: string;
  send: (m: ClientMsg) => void;
  localProgress: { text: string; pct: number } | null;
}) {
  const [text, setText] = useState("");
  const [menuIndex, setMenuIndex] = useState(0);
  const [pending, setPending] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [uploadErr, setUploadErr] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | File[]) => {
    setUploadErr("");
    for (const f of [...files].slice(0, 10)) {
      setUploading((n) => n + 1);
      try {
        const a = await uploadFile(room, f);
        setPending((p) => [...p, a]);
      } catch (e) {
        setUploadErr(String((e as Error).message));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const toggleMic = () => {
    if (!SpeechRecognitionCtor) return;
    if (listening) return recRef.current?.stop();
    const rec = new SpeechRecognitionCtor();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    const base = text ? text.replace(/\s*$/, " ") : "";
    rec.onresult = (e: any) => setText(base + [...e.results].map((r: any) => r[0].transcript).join(""));
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();
  const isTyping = useRef(false);
  const streaming = messages.some((m) => m.meta?.streaming);
  const typers = members.filter((m) => m.typing && m.uid !== me.uid);
  const menu = matchSlash(text);
  const last = messages[messages.length - 1];
  const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => () => clearTimeout(typingTimer.current), []);
  useEffect(() => setMenuIndex(0), [menu.length]);

  const setTyping = (on: boolean) => {
    if (isTyping.current === on) return;
    isTyping.current = on;
    send({ t: "typing", on });
  };

  const resize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 192) + "px";
  };

  const submit = (raw = text) => {
    const poll = parsePoll(raw);
    if (poll) {
      send({ t: "poll", ...poll });
      setText("");
      return;
    }
    if (/^\/poll\b/i.test(raw.trim())) return; // incomplete poll: keep typing (needs 2+ options)
    if (uploading) return; // wait for uploads to finish
    const expanded = raw.trim() ? expandSlash(raw.trim()) : "";
    if (expanded === null || (!expanded && !pending.length)) return; // "/doc" with nothing after it: keep typing
    send({ t: "say", text: expanded, ...(pending.length ? { attachments: pending } : {}) });
    setPending([]);
    setText("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    clearTimeout(typingTimer.current);
    isTyping.current = false;
    stick.current = true;
  };

  const pickCommand = (name: string) => {
    setText(`/${name} `);
    inputRef.current?.focus();
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        void addFiles(e.dataTransfer.files);
      }}
    >
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {messages.length === 0 && (
          <div className="mx-auto mt-14 max-w-lg px-6 text-center text-zinc-500">
            <div className="text-4xl">👋</div>
            <p className="mt-3 font-medium text-zinc-700 dark:text-zinc-300">This room is ready.</p>
            <p className="mt-1 text-sm">Share the party code so friends can join, then ask the AI anything. Try one of these:</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2" data-testid="suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => submit(s.text)}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-sm text-zinc-700 hover:border-indigo-300 hover:bg-indigo-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/40"
                >
                  <div className="font-medium">{s.label}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{s.text}</div>
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs">
              Tip: type <kbd className="rounded border border-zinc-300 px-1 dark:border-zinc-700">/</kbd> for shortcuts like /doc and /search.
            </p>
          </div>
        )}
        <div className="mx-auto max-w-3xl pb-3">
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
            const grouped =
              !newDay && !!prev && prev.authorId === m.authorId && m.createdAt - prev.createdAt < GROUP_MS && !prev.meta?.steps?.length && !m.meta?.steps?.length;
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="my-3 flex items-center gap-3 px-4 text-xs text-zinc-400" role="separator">
                    <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                    {dayLabel(m.createdAt)}
                    <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                  </div>
                )}
                <MessageView
                  m={m}
                  members={members}
                  room={room}
                  me={me}
                  grouped={grouped}
                  send={send}
                  canRegenerate={m === last && m.role === "assistant" && !streaming}
                  canEdit={m.role === "user" && m.authorId === me.uid && i === lastUserIdx && !streaming}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-zinc-200 bg-white/80 px-3 pb-3 pt-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="relative mx-auto max-w-3xl">
          {menu.length > 0 && (
            <ul
              className="absolute bottom-full left-0 mb-2 w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
              role="listbox"
              aria-label="Slash commands"
              data-testid="slash-menu"
            >
              {menu.map((c, i) => (
                <li key={c.name} role="option" aria-selected={i === menuIndex}>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickCommand(c.name)}
                    className={`flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm ${i === menuIndex ? "bg-indigo-50 dark:bg-indigo-950/40" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}
                  >
                    <span className="font-mono font-medium">/{c.name}</span>
                    <span className="text-xs text-zinc-400">{c.hint}</span>
                    <span className="ml-auto text-xs text-zinc-500">{c.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="h-5 text-xs text-zinc-500" aria-live="polite">
            {localProgress
              ? `Loading local model on your device… ${Math.round(localProgress.pct * 100)}%`
              : typers.length > 0
                ? `${typers.map((t) => t.name).join(", ")} ${typers.length > 1 ? "are" : "is"} typing…`
                : settings.aiMode === "mention"
                  ? "Mention @ai to get the AI's attention"
                  : ""}
          </div>
          {(pending.length > 0 || uploading > 0 || uploadErr) && (
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs" data-testid="pending-uploads">
              {pending.map((a) => (
                <span key={a.id} className="flex items-center gap-1 rounded-full border border-zinc-300 bg-white px-2 py-0.5 dark:border-zinc-700 dark:bg-zinc-900">
                  {a.type.startsWith("image/") ? "🖼️" : "📎"} <span className="max-w-[10rem] truncate">{a.name}</span>
                  <button onClick={() => setPending((p) => p.filter((x) => x.id !== a.id))} aria-label={`Remove ${a.name}`} className="text-zinc-400 hover:text-red-600">✕</button>
                </span>
              ))}
              {uploading > 0 && <span className="text-zinc-500">Uploading {uploading}…</span>}
              {uploadErr && <span className="text-red-600" role="alert">{uploadErr}</span>}
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white p-2 shadow-sm focus-within:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900">
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/csv,text/plain,text/markdown,.md,.csv,.txt"
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = "";
              }}
              data-testid="file-input"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-xl px-2 py-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title="Attach images, PDFs, CSV or text (or drop files here)"
              aria-label="Attach files"
            >
              📎
            </button>
            {SpeechRecognitionCtor && (
              <button
                onClick={toggleMic}
                className={`rounded-xl px-2 py-2 ${listening ? "animate-pulse bg-red-100 text-red-600 dark:bg-red-950/50" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
                title={listening ? "Stop listening" : "Speak your message"}
                aria-label={listening ? "Stop voice input" : "Voice input"}
                aria-pressed={listening}
              >
                🎤
              </button>
            )}
            <textarea
              ref={inputRef}
              data-testid="composer"
              rows={1}
              value={text}
              aria-label="Message"
              placeholder={`Message the room${settings.aiMode === "mention" ? " (use @ai for the AI)" : " and the AI"}… (type / for shortcuts)`}
              className="max-h-48 min-h-[2.25rem] flex-1 resize-none bg-transparent px-2 py-1.5 outline-none"
              onChange={(e) => {
                setText(e.target.value);
                resize(e.target);
                setTyping(true);
                clearTimeout(typingTimer.current);
                typingTimer.current = setTimeout(() => setTyping(false), 2500);
              }}
              onKeyDown={(e) => {
                if (menu.length) {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setMenuIndex((i) => (i + (e.key === "ArrowDown" ? 1 : menu.length - 1)) % menu.length);
                    return;
                  }
                  if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
                    e.preventDefault();
                    pickCommand(menu[menuIndex].name);
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            {streaming ? (
              <button
                onClick={() => send({ t: "stop" })}
                className="rounded-xl bg-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                ■ Stop
              </button>
            ) : null}
            <button
              onClick={() => submit()}
              disabled={(!text.trim() && !pending.length) || uploading > 0}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
