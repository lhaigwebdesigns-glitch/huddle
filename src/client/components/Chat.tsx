import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChatMessage, ClientMsg, Member, RoomSettings } from "../../shared/protocol";
import { Markdown } from "./Markdown";

const STEP_ICON: Record<string, string> = { search: "🔎", fetch: "📖", skill: "🧠", doc: "📄", other: "⚙️" };

function Avatar({ name, color, ai }: { name: string; color: string; ai?: boolean }) {
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
      style={{ background: ai ? "linear-gradient(135deg,#6366f1,#a855f7)" : color }}
      title={name}
    >
      {ai ? "✦" : name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function Feedback({ msg, room, me }: { msg: ChatMessage; room: string; me: Member }) {
  const [sent, setSent] = useState<0 | 1 | -1>(0);
  const [asking, setAsking] = useState(false);
  const [comment, setComment] = useState("");
  const submit = (rating: 1 | -1, text = "") =>
    fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        room,
        uid: me.uid,
        name: me.name,
        messageId: msg.id,
        rating,
        comment: text,
        excerpt: msg.content.slice(0, 400),
      }),
    });
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
      <button
        className={`hover:text-zinc-700 dark:hover:text-zinc-200 ${sent === 1 ? "text-green-600" : ""}`}
        title="Good response"
        onClick={() => {
          setSent(1);
          submit(1);
        }}
      >
        👍
      </button>
      <button
        className={`hover:text-zinc-700 dark:hover:text-zinc-200 ${sent === -1 ? "text-red-600" : ""}`}
        title="Bad response"
        onClick={() => {
          setSent(-1);
          setAsking(true);
        }}
      >
        👎
      </button>
      <button className="hover:text-zinc-700 dark:hover:text-zinc-200" onClick={() => navigator.clipboard.writeText(msg.content)}>
        Copy
      </button>
      {msg.meta?.model && <span className="truncate">· {msg.meta.model}</span>}
      {asking && (
        <form
          className="flex w-full gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(-1, comment);
            setAsking(false);
          }}
        >
          <input
            autoFocus
            className="flex-1 rounded border border-zinc-300 bg-transparent px-2 py-1 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
            placeholder="What went wrong? (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button className="rounded bg-zinc-800 px-2 text-white">Send</button>
        </form>
      )}
    </div>
  );
}

function MessageView({ m, members, room, me }: { m: ChatMessage; members: Member[]; room: string; me: Member }) {
  const isAi = m.role === "assistant";
  const author = members.find((x) => x.uid === m.authorId);
  const color = author?.color ?? "#71717a";
  return (
    <div className="flex gap-3 px-4 py-3" data-testid={isAi ? "ai-message" : "user-message"}>
      <Avatar name={m.authorName} color={color} ai={isAi} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold">{m.authorName}</span>
          <span className="text-xs text-zinc-400">
            {new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </span>
        </div>
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
            <div className="mt-2 flex gap-1 text-zinc-400">
              <span className="typing-dot">●</span>
              <span className="typing-dot">●</span>
              <span className="typing-dot">●</span>
            </div>
          )
        ) : (
          <div className="whitespace-pre-wrap break-words text-[15px]">{m.content}</div>
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
        {isAi && !m.meta?.streaming && <Feedback msg={m} room={room} me={me} />}
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
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();
  const isTyping = useRef(false);
  const streaming = messages.some((m) => m.meta?.streaming);
  const typers = members.filter((m) => m.typing && m.uid !== me.uid);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => () => clearTimeout(typingTimer.current), []);

  const setTyping = (on: boolean) => {
    if (isTyping.current === on) return;
    isTyping.current = on;
    send({ t: "typing", on });
  };

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    send({ t: "say", text: t });
    setText("");
    clearTimeout(typingTimer.current);
    isTyping.current = false;
    stick.current = true;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {messages.length === 0 && (
          <div className="mx-auto mt-16 max-w-md px-6 text-center text-zinc-500">
            <div className="text-4xl">👋</div>
            <p className="mt-3 font-medium text-zinc-700 dark:text-zinc-300">This room is ready.</p>
            <p className="mt-1 text-sm">
              Share the party code so friends can join, then ask the AI anything — try{" "}
              <em>“search the web for this week's top science news”</em> or{" "}
              <em>“write a project plan doc for our app”</em>.
            </p>
          </div>
        )}
        <div className="mx-auto max-w-3xl py-2">
          {messages.map((m) => (
            <MessageView key={m.id} m={m} members={members} room={room} me={me} />
          ))}
        </div>
      </div>

      <div className="border-t border-zinc-200 bg-white/80 px-3 pb-3 pt-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto max-w-3xl">
          <div className="h-5 text-xs text-zinc-500">
            {localProgress
              ? `Loading local model on your device… ${Math.round(localProgress.pct * 100)}%`
              : typers.length > 0
                ? `${typers.map((t) => t.name).join(", ")} ${typers.length > 1 ? "are" : "is"} typing…`
                : settings.aiMode === "mention"
                  ? "Mention @ai to get the AI's attention"
                  : ""}
          </div>
          <div className="flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white p-2 shadow-sm focus-within:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900">
            <textarea
              data-testid="composer"
              rows={1}
              value={text}
              placeholder={`Message the room${settings.aiMode === "mention" ? " (use @ai for the AI)" : " and the AI"}…`}
              className="max-h-48 min-h-[2.25rem] flex-1 resize-none bg-transparent px-2 py-1.5 outline-none"
              onChange={(e) => {
                setText(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 192) + "px";
                setTyping(true);
                clearTimeout(typingTimer.current);
                typingTimer.current = setTimeout(() => setTyping(false), 2500);
              }}
              onKeyDown={(e) => {
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
              onClick={submit}
              disabled={!text.trim()}
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
