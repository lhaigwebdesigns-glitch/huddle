import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatCode, normalizeCode } from "../../shared/code";
import { getIdentity, rememberRoom, setName, type Identity } from "../lib/identity";
import { useRoom } from "../lib/useRoom";
import { Chat } from "../components/Chat";
import { FilePanel } from "../components/FilePanel";
import { Drive } from "../components/Drive";
import { setEditorSender } from "../lib/editorBridge";
import { SettingsDialog } from "../components/SettingsDialog";
import { FeedbackDialog } from "../components/FeedbackDialog";

function NamePrompt({ onDone }: { onDone: (n: string) => void }) {
  const [n, setN] = useState("");
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form
        className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        onSubmit={(e) => {
          e.preventDefault();
          if (n.trim()) onDone(n.trim());
        }}
      >
        <h1 className="text-xl font-semibold">You're invited to a Huddle 👋</h1>
        <p className="mt-1 text-sm text-zinc-500">Pick a name so others know who you are.</p>
        <input
          autoFocus
          maxLength={32}
          value={n}
          onChange={(e) => setN(e.target.value)}
          placeholder="Your name"
          className="mt-4 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
        />
        <button className="mt-3 w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white">Join room</button>
      </form>
    </div>
  );
}

export default function RoomPage() {
  const code = normalizeCode(useParams().code ?? "");
  const [me, setMe] = useState<Identity>(() => getIdentity());
  if (!me.name)
    return (
      <NamePrompt
        onDone={(n) => {
          setName(n);
          setMe(getIdentity());
        }}
      />
    );
  return <Room code={code} me={me} />;
}

function Room({ code, me }: { code: string; me: Identity }) {
  const { state, send, localProgress, clearToast, showToast, dismissNotice } = useRoom(code, me);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state.openFileId) setOpenFile(state.openFileId);
  }, [state.openFileId, state.openFileNonce]);
  useEffect(() => {
    setEditorSender(send);
    return () => setEditorSender(null);
  }, [send]);
  useEffect(() => {
    if (state.settings) rememberRoom(code, state.settings.title);
  }, [code, state.settings?.title]);
  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(clearToast, 5000);
    return () => clearTimeout(t);
  }, [state.toast, clearToast]);

  const file = useMemo(() => state.files.find((f) => f.id === openFile), [state.files, openFile]);
  const closeFile = useCallback(() => setOpenFile(null), []);
  const renameFile = useCallback(
    (title: string) => openFile && send({ t: "rename_file", id: openFile, title }),
    [openFile, send],
  );

  if (state.status === "closed")
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-4xl">🚪</div>
        <p className="text-lg font-medium">{state.closeReason ?? "Disconnected"}</p>
        <Link to="/" className="rounded-lg bg-indigo-600 px-4 py-2 text-white">Back home</Link>
      </div>
    );

  if (!state.you || !state.settings)
    return <div className="flex min-h-full items-center justify-center text-zinc-500">Joining {formatCode(code)}…</div>;

  const isHost = state.you.uid === state.settings.hostId;
  const invite = `${location.origin}/j/${code}`;

  const sidebar = (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Party code</div>
        <button
          onClick={() => {
            navigator.clipboard.writeText(invite);
            setCopied(true);
            showToast("🔗 Invite link copied — paste it to a friend");
            setTimeout(() => setCopied(false), 1500);
          }}
          className="mt-1 w-full rounded-xl border-2 border-dashed border-indigo-300 py-2 font-mono text-2xl font-bold tracking-widest text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
          title="Copy invite link"
          data-testid="party-code"
        >
          {formatCode(code)}
        </button>
        <div className="mt-1 text-center text-xs text-zinc-500">{copied ? "Invite link copied!" : "Click to copy invite link"}</div>
      </div>

      <Drive
        files={state.files}
        openId={openFile}
        isHost={isHost}
        myUid={me.uid}
        send={send}
        onOpen={(id) => {
          setOpenFile(id);
          setShowSidebar(false);
        }}
      />

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">In the room · {state.members.length}</div>
        <ul className="mt-1 space-y-1" data-testid="members">
          {state.members.map((m) => (
            <li key={m.uid} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
              <span className="truncate">{m.name}{m.uid === me.uid ? " (you)" : ""}</span>
              {m.isHost && <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">HOST</span>}
              {m.typing && <span className="text-xs text-zinc-400">typing…</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-1 border-t border-zinc-200 p-3 text-sm dark:border-zinc-800">
        <button onClick={() => setShowSettings(true)} className="block w-full rounded px-2 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800">
          ⚙️ Room settings
        </button>
        <button onClick={() => setShowFeedback(true)} className="block w-full rounded px-2 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800">
          💬 Send feedback
        </button>
        <Link to="/" className="block rounded px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">← Leave room</Link>
      </div>
    </aside>
  );

  return (
    <div className="flex h-full min-h-0">
      <div className="hidden md:flex">{sidebar}</div>
      {showSidebar && (
        <div className="fixed inset-0 z-40 flex md:hidden" onClick={() => setShowSidebar(false)}>
          <div onClick={(e) => e.stopPropagation()}>{sidebar}</div>
          <div className="flex-1 bg-black/30" />
        </div>
      )}

      <main className={`flex min-h-0 min-w-0 flex-1 flex-col ${file ? "hidden lg:flex" : ""}`}>
        <header className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <button onClick={() => setShowSidebar(true)} className="rounded px-2 py-1 md:hidden" aria-label="Open menu">☰</button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{state.settings.title}</div>
            <div className="text-xs text-zinc-500">
              {state.settings.engine === "local" ? "💻 Local mode" : "☁️ Free open models"} ·{" "}
              {state.settings.aiMode === "always" ? "AI replies to every message" : "AI replies on @ai"}
              {state.status !== "open" && <span className="ml-2 text-amber-600">reconnecting…</span>}
            </div>
          </div>
          <span className="font-mono text-sm text-indigo-600 md:hidden dark:text-indigo-400">{formatCode(code)}</span>
        </header>
        {state.notice && state.settings.engine !== "local" && (
          <div
            role="status"
            data-testid="ai-notice"
            className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <span className="min-w-0 flex-1">
              ⚠️ {state.notice}{" "}
              {isHost ? "Local mode runs the AI on your device instead: free and unlimited." : "The host can switch the room to Local mode."}
            </span>
            {isHost && (
              <button
                onClick={() => send({ t: "settings", patch: { engine: "local" } })}
                className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-500"
              >
                Switch to Local mode
              </button>
            )}
            <button onClick={dismissNotice} className="rounded px-2 py-1 text-xs hover:bg-amber-100 dark:hover:bg-amber-900/40" aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}
        <Chat
          messages={state.messages}
          members={state.members}
          me={state.you}
          settings={state.settings}
          room={code}
          send={send}
          localProgress={localProgress}
        />
      </main>

      {file && (
        <section className="flex min-h-0 w-full flex-col border-l border-zinc-200 lg:w-[48%] dark:border-zinc-800">
          <FilePanel
            room={code}
            file={file}
            me={me}
            onClose={closeFile}
            onRename={renameFile}
          />
        </section>
      )}

      {showSettings && (
        <SettingsDialog
          settings={state.settings}
          isHost={isHost}
          skills={state.skills}
          providers={state.providers}
          members={state.members}
          me={state.you}
          send={send}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showFeedback && <FeedbackDialog room={code} uid={me.uid} name={me.name} onClose={() => setShowFeedback(false)} />}
      {state.toast && (
        <div
          role="status"
          data-testid="toast"
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
        >
          {state.toast}
        </div>
      )}
    </div>
  );
}
