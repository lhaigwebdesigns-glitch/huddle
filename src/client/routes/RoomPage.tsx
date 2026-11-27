import { confirmDialog } from "../components/Dialogs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { importOffice, officeKind, officeTitle } from "../lib/officeImport";
import { Link, useParams } from "react-router-dom";
import { formatCode, normalizeCode } from "../../shared/code";
import { ageConfirmed, confirmAge, getIdentity, rememberRoom, setName, type Identity } from "../lib/identity";
import { useRoom } from "../lib/useRoom";
import { Chat } from "../components/Chat";
import { FilePanel } from "../components/FilePanel";
import { Drive } from "../components/Drive";
import { setEditorSender } from "../lib/editorBridge";
import { SettingsDialog } from "../components/SettingsDialog";
import { PersonAvatar } from "../components/PersonAvatar";
import { FeedbackDialog } from "../components/FeedbackDialog";
import { ProjectBar } from "../components/ProjectBar";
import { AssignmentBrief, briefSeen, markBriefSeen } from "../components/AssignmentBrief";
import { ReceiptDialog } from "../components/ReceiptDialog";
import { usePasteGuard } from "../lib/pasteGuard";
import { ArrowLeft, ArrowRight, Check, Cloud, Copy, Cpu, DoorOpen, Link2, Menu, MessageSquare, Settings, Trash2, X } from "lucide-react";
import { Button, Input, Logo, ThemeToggle } from "../components/ui";
import { SignInGate } from "../components/SignInGate";
import { useAccount, type Account } from "../lib/account";
import { TourButton, useAutoTour } from "../components/Tour";
import { HideSidebarButton, ShowSidebarButton } from "../components/AppShell";
import { useSidebarHidden } from "../lib/sidebar";

/** "I'm 13 or older" checkbox, with the reason when it's left unchecked. */
export function AgeCheck({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mt-4 flex items-start gap-2.5 text-sm text-fg-muted">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid="age-13" />
      <span>
        I'm 13 or older. <span className="text-fg-subtle">Cairn is for ages 13 and up.</span>
      </span>
    </label>
  );
}

const ROW = "press flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] text-fg-muted hover:bg-accent-soft hover:text-fg";

/** Asks for a name (if we don't have one) and confirms the person is 13 or older. */
function NamePrompt({ onDone, needName }: { onDone: (n: string) => void; needName: boolean }) {
  const [n, setN] = useState("");
  const [age, setAge] = useState(ageConfirmed);
  const askAge = !ageConfirmed();
  return (
    <div className="flex min-h-full items-center justify-center bg-sidebar p-4">
      <form
        className="rise w-full max-w-sm rounded-[24px] border border-line bg-bg p-7 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.18)]"
        onSubmit={(e) => {
          e.preventDefault();
          if ((!needName || n.trim()) && age) onDone(n.trim());
        }}
      >
        <Logo className="h-9 w-9" />
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight">You're invited to a project on Cairn</h1>
        <p className="mt-1.5 text-[15px] text-fg-muted">{needName ? "Pick a name so others know who you are." : "One quick check before you join."}</p>
        {needName && <Input autoFocus maxLength={32} value={n} onChange={(e) => setN(e.target.value)} placeholder="Your name" className="mt-5 h-11" />}
        {askAge && <AgeCheck checked={age} onChange={setAge} />}
        <Button className="mt-3 w-full" size="lg">
          Join room <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

export default function RoomPage() {
  const code = normalizeCode(useParams().code ?? "");
  const account = useAccount();
  if (!account.ready) return <div className="p-8 text-sm text-fg-subtle">Loading…</div>;
  if (account.requireSignIn && !account.user)
    return (
      <SignInGate
        title="Sign in to join this room"
        message="Everyone in a Cairn room signs in, so your group always knows who's who."
        providers={account.providers}
      />
    );
  return <RoomEntry code={code} user={account.user} />;
}

/**
 * In an assignment's worksheet room (the teacher's alone): what happens to these files, the
 * answer key, and the way back to the class.
 */
function WorksheetBanner({ ws }: { ws: { classId: string; assignmentId: string; keyId?: string } }) {
  const [busy, setBusy] = useState(false);
  return (
    <div
      role="note"
      data-testid="worksheet-banner"
      className="mx-auto mt-2 flex w-[calc(100%-1.5rem)] max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm"
    >
      <span className="min-w-[14rem] flex-1">
        <span className="font-semibold">This is the worksheet.</span> Each student gets their own copy of every file here{ws.keyId ? ", except the answer key" : ""}, when they first open the assignment.
        {ws.keyId && <span className="text-fg-muted"> The answer key stays with you and shows next to their work when you grade.</span>}
        <span className="block text-xs text-fg-subtle">Only you can come into this room.</span>
      </span>
      {!ws.keyId && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await fetch(`/api/classes/${ws.classId}/assignments/${ws.assignmentId}/worksheet`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ key: true }),
            }).catch(() => null);
            setBusy(false);
          }}
          className="press rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium hover:bg-surface-2 disabled:opacity-40"
          data-testid="banner-add-key"
        >
          Add an answer key
        </button>
      )}
      <Link to={`/classes/${ws.classId}`} className="press rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-fg hover:bg-primary-hover" data-testid="back-to-class">
        Back to the class
      </Link>
    </div>
  );
}

/** After sign-in: a name if we still need one, the 13+ check, then the room. */
function RoomEntry({ code, user }: { code: string; user: Account | null | undefined }) {
  const [me, setMe] = useState<Identity>(() => getIdentity());
  const [ageOk, setAgeOk] = useState(ageConfirmed);
  if (!me.name || !ageOk)
    return (
      <NamePrompt
        needName={!me.name}
        onDone={(n) => {
          if (n) setName(n);
          confirmAge();
          setAgeOk(true);
          setMe(getIdentity());
        }}
      />
    );
  return <Room code={code} me={me} user={user} />;
}

function Room({ code, me, user }: { code: string; me: Identity; user: Account | null | undefined }) {
  const { state, send, localProgress, clearToast, showToast, dismissNotice } = useRoom(code, me);
  // A student's first assignment room gets a short tour (not the teacher's, not plain rooms).
  useAutoTour("student-room", !!state.settings?.project && !state.settings.worksheet && user?.role === "student", user?.tours ?? [], !!user);
  const project = state.settings?.project;
  usePasteGuard(!!project?.pasteGuard && project.ai !== "full" && !project.pasteExempt.includes(me.uid), () =>
    showToast("Pasting from outside Cairn is off for this project."),
  );
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [receiptMode, setReceiptMode] = useState<"view" | "turnin" | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  // The first time a student opens an assignment, it tells them what it is and the rules.
  const briefFor = state.settings?.project && state.you && state.settings.hostId !== state.you.uid ? code : null;
  useEffect(() => {
    if (!briefFor || briefSeen(briefFor)) return;
    markBriefSeen(briefFor);
    setBriefOpen(true);
  }, [briefFor]);
  const [showSidebar, setShowSidebar] = useState(false);
  const sidebarHidden = useSidebarHidden();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state.openFileId) setOpenFile(state.openFileId);
  }, [state.openFileId, state.openFileNonce]);

  // Importing a Word or PowerPoint file: make the file, then fill it in once the room says which it is.
  const pendingImport = useRef<{ ref: string; file: File } | null>(null);
  const startImport = useCallback(
    (file: File) => {
      const kind = officeKind(file);
      if (!kind) return showToast("Pick a Word (.docx) or PowerPoint (.pptx) file.");
      const ref = Math.random().toString(36).slice(2, 10);
      pendingImport.current = { ref, file };
      showToast(`Bringing in ${file.name}…`);
      send({ t: "new_file", kind, title: officeTitle(file), ref });
    },
    [send, showToast],
  );
  useEffect(() => {
    const p = pendingImport.current;
    if (!p || !state.openFileId || state.openFileRef !== p.ref) return;
    pendingImport.current = null;
    importOffice(code, state.openFileId, p.file, me, (note) => showToast(`${p.file.name}: ${note}`))
      .then((r) => showToast(r.skipped.length ? `${p.file.name} is in. Some things didn't come through: ${r.skipped.join(", ")}.` : `${p.file.name} is in.`))
      .catch((e: Error) => showToast(`Couldn't bring in ${p.file.name}: ${e.message}`));
  }, [state.openFileId, state.openFileNonce, state.openFileRef, code, me, showToast]);
  useEffect(() => {
    setEditorSender(send);
    return () => setEditorSender(null);
  }, [send]);
  useEffect(() => {
    // A worksheet lives on its class page, not in "My rooms".
    if (!state.settings || state.settings.worksheet) return;
    rememberRoom(code, state.settings.title);
    // Signed in? Add it to "My rooms" on every device (no-op for guests).
    fetch("/api/auth/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, title: state.settings.title }),
    }).catch(() => {});
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
      <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center" role="alert" data-testid="room-closed">
        <div className="pop flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft" style={{ ["--origin" as string]: "center" }}>
          {state.closeKind === "deleted" ? <Trash2 className="h-6 w-6 text-fg-muted" /> : state.closeKind ? <DoorOpen className="h-6 w-6 text-fg-muted" /> : <Logo className="h-8 w-8" />}
        </div>
        <p className="rise mt-2 text-lg font-semibold">{state.closeReason ?? "Disconnected"}</p>
        <p className="rise rise-1 max-w-sm text-sm text-fg-muted">
          {state.closeKind === "deleted"
            ? "Its chat and files were erased."
            : state.closeKind === "kick"
              ? "You can rejoin with the party code if you were invited back."
              : state.closeKind === "ban"
                ? "Only the host can let you back in."
                : state.closeKind === "refused"
                  ? "If you should be in here, open the link your teacher or the host gave you."
                  : "Check your connection and try again."}
        </p>
        <div className="rise rise-2 mt-3 flex gap-2">
          {state.closeKind === "kick" && (
            <Button variant="secondary" onClick={() => location.reload()}>Rejoin</Button>
          )}
          <Link to="/dashboard" className="press inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-fg hover:bg-primary-hover">
            <ArrowLeft className="h-4 w-4" /> Back to your rooms
          </Link>
        </div>
      </div>
    );

  if (!state.you || !state.settings)
    return (
      <div className="flex min-h-full items-center justify-center gap-2 text-fg-muted">
        <span className="flex gap-1">
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-fg-subtle" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-fg-subtle" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-fg-subtle" />
        </span>
        Joining <span className="font-mono">{formatCode(code)}</span>
      </div>
    );

  const isHost = state.you.uid === state.settings.hostId;
  const invite = `${location.origin}/j/${code}`;
  const copyInvite = () => {
    navigator.clipboard.writeText(invite);
    setCopied(true);
    showToast("Invite link copied. Paste it to a friend.");
    setTimeout(() => setCopied(false), 1500);
  };

  // Class rooms: who's in them is set by the class, so no party code, members list (solo) or "Leave room".
  const classLink = state.settings.classLink;
  const solo = !!classLink && (!!classLink.solo || classLink.group === state.you.name);
  const roomTitle = classLink && solo ? state.settings.title.replace(` · ${classLink.group}`, "") : state.settings.title;
  const sidebar = (
    <aside className="flex h-full w-[264px] shrink-0 flex-col bg-sidebar" data-tour="room-files">
      <div className="flex h-12 items-center gap-2 px-3">
        <Link to="/" className="press flex items-center gap-2 rounded-lg px-1.5 py-1 text-[15px] font-semibold tracking-tight hover:bg-accent-soft" title="Cairn home">
          <Logo className="h-7 w-7" /> <span className="font-display text-[17px] font-extrabold tracking-tight">Cairn</span>
        </Link>
        <TourButton className="ml-auto" />
        <HideSidebarButton />
        <button onClick={() => setShowSidebar(false)} className="press ml-auto rounded-lg p-1.5 text-fg-muted hover:bg-accent-soft md:hidden" aria-label="Close menu">
          <X className="h-4 w-4" />
        </button>
      </div>
      {/* A clear way back: to your class for class rooms, otherwise to your rooms. */}
      <div className="px-3 pb-2">
        {state.settings.worksheet ? (
          <Link to={`/classes/${state.settings.worksheet.classId}`} className="press flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-fg-muted hover:bg-accent-soft hover:text-fg" data-testid="room-back">
            <ArrowLeft className="h-4 w-4" /> Your class
          </Link>
        ) : state.settings.classLink?.classCode ? (
          <Link to={`/c/${state.settings.classLink.classCode}`} className="press flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-fg-muted hover:bg-accent-soft hover:text-fg" data-testid="room-back">
            <ArrowLeft className="h-4 w-4" /> Your class
          </Link>
        ) : (
          <Link to="/dashboard" className="press flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-fg-muted hover:bg-accent-soft hover:text-fg" data-testid="room-back">
            <ArrowLeft className="h-4 w-4" /> Your rooms
          </Link>
        )}
      </div>

      <Drive
        files={state.files}
        openId={openFile}
        isHost={isHost}
        myUid={me.uid}
        send={send}
        onImport={state.settings.project?.turnedInAt ? undefined : startImport}
        aiFiles={!state.settings.project || state.settings.project.ai === "full"}
        defaultTitle={classLink ? state.settings.title.replace(` · ${classLink.group}`, "") : undefined}
        onOpen={(id) => {
          setOpenFile(id);
          setShowSidebar(false);
        }}
      />

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-3">
        {!solo && (<>
        <div className="px-2.5 text-xs font-medium text-fg-subtle">{classLink ? "Your group" : "In the room"} · {state.members.length}</div>
        <ul className="mt-1.5 space-y-0.5" data-testid="members">
          {state.members.map((m) => (
            <li key={m.uid} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1 text-[13.5px] text-fg">
              <PersonAvatar name={m.name} color={m.color} avatar={m.avatar} className="h-5 w-5 text-[10px]" />
              <span className="truncate">
                {m.name}
                {m.uid === me.uid && <span className="text-fg-subtle"> (you)</span>}
              </span>
              {m.isHost && <span className="rounded-md border border-line-strong px-1 text-[10px] font-medium text-fg-muted">Host</span>}
              {m.typing && <span className="ml-auto text-xs text-fg-subtle">typing…</span>}
            </li>
          ))}
        </ul>
        </>)}
      </div>

      <div className="space-y-0.5 p-3">
        {!state.settings.worksheet && !classLink && (
        <button
          onClick={copyInvite}
          className="press group mb-2 flex w-full items-center justify-between rounded-xl border border-line bg-bg px-3 py-2 hover:border-line-strong"
          title="Copy invite link"
          data-testid="party-code"
        >
          <span className="text-left">
            <span className="block text-[11px] text-fg-subtle">{copied ? "Invite link copied" : "Party code"}</span>
            <span className="font-mono text-[17px] font-semibold tracking-[0.18em] text-fg">{formatCode(code)}</span>
          </span>
          {copied ? <Check className="h-4 w-4 text-fg" /> : <Copy className="h-4 w-4 text-fg-subtle group-hover:text-fg" />}
        </button>
        )}
        <button onClick={() => setShowSettings(true)} className={ROW}>
          <Settings className="h-4 w-4" /> Room settings
        </button>
        {isHost && !state.settings.worksheet && (
          <button
            onClick={async () => {
              if (
                !(await confirmDialog({
                  title: "Make a read-only link?",
                  message: "Anyone with the link can read the messages up to now (not the files).",
                  confirmLabel: "Make link",
                }))
              )
                return;
              const r = await fetch(`/api/rooms/${code}/share`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ uid: me.uid }),
              });
              const d = (await r.json()) as { url?: string; error?: string };
              if (!d.url) return showToast(d.error ?? "Couldn't create a share link.");
              const link = `${location.origin}${d.url}`;
              await navigator.clipboard.writeText(link).catch(() => {});
              showToast("Read-only link copied");
              window.open(link, "_blank", "noopener");
            }}
            className={ROW}
            data-testid="share-chat"
          >
            <Link2 className="h-4 w-4" /> Share chat (read-only)
          </button>
        )}
        <button onClick={() => setShowFeedback(true)} className={ROW}>
          <MessageSquare className="h-4 w-4" /> Send feedback
        </button>
        <div className="flex items-center gap-2 pt-1">
          {state.settings.worksheet || classLink ? (
            <span className="flex-1" />
          ) : (
            <Link to="/" className={`${ROW} flex-1`}>
              <ArrowLeft className="h-4 w-4" /> Leave room
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-full min-h-0 bg-bg">
      <div className={`hidden border-r border-line ${sidebarHidden ? "" : "md:flex"}`}>{sidebar}</div>
      {showSidebar && (
        <div className="fixed inset-0 z-40 flex md:hidden" onClick={() => setShowSidebar(false)}>
          <div onClick={(e) => e.stopPropagation()} className="h-full shadow-2xl [animation:rise_240ms_var(--ease-drawer)_both]">
            {sidebar}
          </div>
          <div className="flex-1 bg-black/30" />
        </div>
      )}

      <main className={`flex min-h-0 min-w-0 flex-1 flex-col ${file ? "hidden lg:flex" : ""}`}>
        <header className="flex h-12 shrink-0 items-center gap-2 px-3">
          <button onClick={() => setShowSidebar(true)} className="press rounded-lg p-1.5 text-fg-muted hover:bg-surface-2 md:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          {sidebarHidden && <ShowSidebarButton className="mr-1" />}
          <div className="flex min-w-0 flex-1 items-baseline gap-3">
            <h1 className="truncate text-[15px] font-semibold tracking-tight" data-testid="room-title">{roomTitle}</h1>
            <div className={`hidden min-w-0 items-center gap-1.5 truncate text-xs text-fg-subtle ${classLink ? "" : "sm:flex"}`}>
              {state.settings.engine === "local" ? <Cpu className="h-3.5 w-3.5" /> : <Cloud className="h-3.5 w-3.5" />}
              {state.settings.engine === "local" ? "Local mode" : "Free open models"}
              <span aria-hidden="true">·</span>
              {state.settings.project?.ai === "off"
                ? "AI is off for this project"
                : state.settings.aiMode === "always"
                  ? "AI replies to every message"
                  : "AI replies on @ai"}
              {state.settings.project?.ai === "tutor" && " · Tutor only"}
              {state.settings.deepResearch && state.settings.project?.ai !== "tutor" && state.settings.project?.ai !== "off" && " · Deep Research"}
              {state.settings.memory && " · Memory on"}
            </div>
            {state.status !== "open" && <span className="text-xs text-amber-600 dark:text-amber-400">reconnecting…</span>}
          </div>
          {!state.settings.worksheet && !classLink && (
            <button onClick={copyInvite} className="press rounded-lg px-2 py-1 font-mono text-sm font-medium tracking-[0.12em] text-fg hover:bg-surface-2 md:hidden" aria-label="Copy invite link">
              {formatCode(code)}
            </button>
          )}
        </header>
        {state.notice && state.settings.engine !== "local" && (
          <div
            role="status"
            data-testid="ai-notice"
            className="mx-auto mt-1 flex w-[calc(100%-1.5rem)] max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
          >
            <span className="min-w-0 flex-1">
              {state.notice}{" "}
              {isHost ? "Local mode runs the AI on your device instead: free and unlimited." : "The host can switch the room to Local mode."}
            </span>
            {isHost && (
              <button
                onClick={() => send({ t: "settings", patch: { engine: "local" } })}
                className="press rounded-lg bg-amber-900 px-3 py-1 text-xs font-semibold text-amber-50 hover:bg-amber-800 dark:bg-amber-200 dark:text-amber-950"
              >
                Switch to Local mode
              </button>
            )}
            <button onClick={dismissNotice} className="rounded-lg p-1 hover:bg-amber-100 dark:hover:bg-amber-900/40" aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {state.settings.worksheet && <WorksheetBanner ws={state.settings.worksheet} />}
        {state.settings.project && (
          <ProjectBar project={state.settings.project} title={state.settings.title} isHost={isHost} send={send} onReceipt={setReceiptMode} onDetails={() => setBriefOpen(true)} solo={solo} board={state.board} meUid={state.you.uid} />
        )}
        {briefOpen && state.settings.project && (
          <AssignmentBrief
            project={state.settings.project}
            title={state.settings.classLink ? state.settings.title.replace(` · ${state.settings.classLink.group}`, "") : state.settings.title}
            group={state.settings.classLink?.group}
            solo={!!state.settings.classLink && (!!state.settings.classLink.solo || state.settings.classLink.group === state.you.name)}
            onClose={() => setBriefOpen(false)}
          />
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
        <section className="flex min-h-0 w-full flex-col border-l border-line lg:w-[48%]">
          <FilePanel room={code} file={file} me={me} onClose={closeFile} onRename={renameFile} locked={!!state.settings.project?.turnedInAt || state.settings.project?.status?.open === false}
            lockedNote={
              state.settings.project?.turnedInAt
                ? undefined
                : state.settings.project?.status?.reason === "due"
                  ? "The due date has passed, so this file is read-only. Use More time to ask your teacher for an extension."
                  : "This assignment is closed right now, so this file is read-only. It opens again at the set time, or use More time to ask your teacher."
            }
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
          memory={state.memory}
          bans={state.bans}
          send={send}
          onClose={() => setShowSettings(false)}
        />
      )}
      {receiptMode && state.settings.project && (
        <ReceiptDialog
          solo={solo}
          receipt={state.receipt}
          meUid={state.you.uid}
          isHost={isHost}
          mode={state.settings.project.turnedInAt ? "view" : receiptMode}
          reflection={state.settings.project.reflection}
          send={send}
          onClose={() => setReceiptMode(null)}
        />
      )}
      {showFeedback && <FeedbackDialog room={code} uid={me.uid} name={me.name} onClose={() => setShowFeedback(false)} />}
      {state.toast && (
        <div
          role="status"
          data-testid="toast"
          className="rise fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-fg shadow-[0_12px_32px_-8px_rgba(0,0,0,0.35)]"
        >
          {state.toast}
        </div>
      )}
    </div>
  );
}
