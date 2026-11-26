import { alertDialog, confirmDialog, promptDialog } from "../components/Dialogs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarClock, ChevronDown, Check, CircleCheck, Clock, Copy, Download, FileText, Flag, GraduationCap, KeyRound, Plus, Upload, Users, X } from "lucide-react";
import { OFFICE_ACCEPT, officeKind } from "../lib/officeFiles";
import { getIdentity } from "../lib/identity";
import type { Report } from "../../shared/protocol";
import { needsWelcome, PROVIDER_LABEL, useAccount, signInUrl } from "../lib/account";
import { useAutoTour } from "../components/Tour";
import { AppShell, refreshMyClasses, tint } from "../components/AppShell";
import { Field, Modal } from "../components/Modal";
import { pickFromDrive, useDrive } from "../lib/googleDrive";
import { DriveMark } from "../components/DriveMark";
import { EmailPills } from "../components/EmailPills";
import { exampleTitle, orderTemplates, type Teach } from "../../shared/onboarding";
import { Button, Input, Logo, ThemeToggle } from "../components/ui";
import { formatCode } from "../../shared/code";
import { timeAgo } from "../components/PartyLists";
import { EMPTY_PROJECT, fromLocalInput, ProjectEditor, ScheduleEditor, toLocalInput, type ProjectDraft } from "../components/ProjectEditor";
import { describeSchedule, type Schedule, type TimeRequest } from "../../shared/schedule";
import { PROJECT_TEMPLATES } from "../../shared/templates";
import { FILE_INFO } from "../../shared/files";
import { MINT, PERI, RockArt, TEAL } from "../components/Rocks";
import { DateTimeField } from "../components/DateTimePicker";
import { assignmentPath, classroomShareUrl, gradeTotal, isPending, parseEmails, rubricMax, type Assignment, type ClassInfo, type ClassStudent, type ClassView, type GroupInfo, type TodayView } from "../../shared/classes";

async function api<T>(url: string, init?: RequestInit): Promise<T & { error?: string }> {
  const r = await fetch(url, init?.body ? { ...init, headers: { "content-type": "application/json", ...init.headers } } : init);
  return (await r.json().catch(() => ({ error: "Something went wrong." }))) as T & { error?: string };
}

/** A small Google Classroom-style mark (green board), drawn here so no logo file is needed. */
function ClassroomMark() {
  return (
    <svg viewBox="0 0 16 16" className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden>
      <rect x="1" y="2" width="14" height="11" rx="1.5" fill="#1e8e3e" />
      <rect x="3" y="4" width="10" height="7" rx="0.5" fill="#fff" opacity=".9" />
      <circle cx="8" cy="7" r="1.4" fill="#1e8e3e" />
      <path d="M5.5 10.5c.5-1.2 1.4-1.8 2.5-1.8s2 .6 2.5 1.8" fill="#1e8e3e" />
    </svg>
  );
}

/** The frame for the teacher's pages: the app sidebar (classes, rooms) once signed in. */
function TeacherShell({ children, back }: { children: React.ReactNode; back?: { to: string; label: string } }) {
  const account = useAccount();
  if (account.user)
    return (
      <AppShell account={account.user} isAdmin={account.isAdmin} back={back}>
        {children}
      </AppShell>
    );
  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
        <Link to="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <Logo className="h-7 w-7" /> <span className="font-display text-[17px] font-extrabold tracking-tight">Cairn</span>
        </Link>
        <span className="flex-1" />
        <ThemeToggle />
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

/** A student account on a teacher page: a plain "this isn't for you", and where to go instead. */
function StudentOnly() {
  return (
    <div className="mx-auto mt-[12vh] max-w-sm px-6 text-center" data-testid="student-account">
      <RockArt className="mx-auto h-20 w-20" body={PERI} pose="hold" prop="book" />
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">This is a student account</h1>
      <p className="mt-2 text-[15px] text-fg-muted">Making classes and grading are only for teacher accounts. Your classes are in the menu, under Enrolled, and your work is in Your rooms.</p>
      <Link to="/dashboard" className="ledge-btn mt-6 h-11 px-5 text-[15px]">
        Go to your rooms
      </Link>
    </div>
  );
}

/** First visit to the teacher pages: say you're a teacher (students are sent to their class link instead). */
function TeacherOrStudent({ onTeacher }: { onTeacher: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto mt-[10vh] max-w-md px-6 text-center" data-testid="pick-role">
      <RockArt className="mx-auto h-20 w-20" body={TEAL} pose="wave" />
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">Are you a teacher?</h1>
      <p className="mt-2 text-sm text-fg-muted">Teacher accounts make classes, post assignments and grade. You pick this once.</p>
      <div className="mt-5 grid gap-2">
        <Button
          size="lg"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await api("/api/auth/role", { method: "POST", body: JSON.stringify({ role: "teacher" }) });
            onTeacher();
          }}
          data-testid="im-teacher"
        >
          Yes, I'm a teacher
        </Button>
        <Link to="/#start" className="press rounded-xl border border-line-strong px-4 py-2.5 text-sm font-medium hover:bg-surface-2">
          I'm a student: join with my class code
        </Link>
      </div>
    </div>
  );
}

function SignInFirst() {
  const account = useAccount();
  if (account.user === undefined) return <div className="p-8 text-sm text-fg-subtle">Loading…</div>;
  return (
    <div className="mx-auto mt-[15vh] max-w-sm px-6 text-center">
      <GraduationCap className="mx-auto h-8 w-8 text-fg-muted" />
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">Sign in to set up classes</h1>
      <p className="mt-2 text-sm text-fg-muted">Use your school Google account. Students open your class link and sign in with theirs.</p>
      <div className="mt-5 flex flex-col gap-2">
        {account.providers.map((p, i) => (
          <a
            key={p}
            href={signInUrl(p, location.pathname)}
            className={`press rounded-xl px-4 py-2 text-sm font-medium ${i === 0 ? "bg-primary text-primary-fg hover:bg-primary-hover" : "border border-line-strong text-fg hover:bg-surface-2"}`}
            data-testid={`signin-${p}`}
          >
            Continue with {PROVIDER_LABEL[p] ?? p}
          </a>
        ))}
      </div>
    </div>
  );
}

/** /classes: the teacher's classes. */
export function ClassesPage() {
  const account = useAccount();
  const nav = useNavigate();
  const [list, setList] = useState<ClassInfo[] | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [today, setToday] = useState<TodayView | null>(null);
  useEffect(() => {
    if (!account.user) return;
    if (account.user.role !== "teacher") return;
    api<{ classes: ClassInfo[] }>("/api/classes").then((d) => setList(d.classes ?? []));
    api<TodayView>("/api/classes/today").then((d) => !d.error && setToday(d));
  }, [account.user]);
  // New accounts get the welcome first.
  useEffect(() => {
    if (needsWelcome(account.user)) nav("/welcome", { replace: true });
  }, [account.user]);
  useAutoTour("teacher-today", !!today && account.user?.role === "teacher", account.user?.tours, true);
  if (needsWelcome(account.user)) return null;
  if (!account.user) return <TeacherShell><SignInFirst /></TeacherShell>;
  if (account.user.role === "student") return <TeacherShell><StudentOnly /></TeacherShell>;
  if (!account.user.role) return <TeacherShell><TeacherOrStudent onTeacher={() => location.reload()} /></TeacherShell>;
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const d = await api<{ id: string }>("/api/classes", { method: "POST", body: JSON.stringify({ name }) });
    if (d.error || !d.id) return setErr(d.error ?? "Couldn't create the class.");
    refreshMyClasses();
    nav(`/classes/${d.id}`);
  };
  return (
    <TeacherShell>
      <div className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-8 sm:pt-10">
        <div className="w-fit" data-tour="today">
          <h1 className="rise font-display text-[2rem] font-extrabold leading-tight tracking-[-0.03em]">Today</h1>
          <p className="rise rise-1 mt-1 text-[1.0625rem] text-fg-muted">What needs you, across all your classes.</p>
        </div>
        {/* Work waiting on the teacher comes first; the setup steps follow. */}
        {today && <TodayPanel today={today} />}
        {today && <GettingStarted setup={today.setup} hasWork={today.toGrade.length > 0} />}
        <h2 className="mt-12 font-display text-xl font-bold tracking-[-0.01em]">Your classes</h2>
        <form onSubmit={create} className="mt-3 flex gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm" data-tour="new-class">
          <Input id="new-class-name" aria-label="Class name" placeholder="New class name (e.g. Period 3 History)" value={name} onChange={(e) => setName(e.target.value)} className="border-0 bg-transparent shadow-none" />
          <Button type="submit" variant="secondary" data-testid="create-class">
            <Plus className="h-4 w-4" /> New class
          </Button>
        </form>
        {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">{err}</p>}
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {list === null && <li className="text-sm text-fg-subtle">Loading…</li>}
          {list?.length === 0 && <li className="text-sm text-fg-subtle">No classes yet. Make your first one above.</li>}
          {list?.map((c) => (
            <li key={c.id}>
              <Link to={`/classes/${c.id}`} className="press group block overflow-hidden rounded-[20px] border border-line bg-surface hover:border-line-strong" data-testid="class-row">
                <span className="flex h-16 items-start justify-between gap-3 px-5 pt-4" style={{ background: tint(c.code) }}>
                  <span className="truncate font-display text-lg font-extrabold text-ink">{c.name}</span>
                  <span className="shrink-0 font-mono text-sm font-semibold tracking-[0.12em] text-ink/70">{formatCode(c.code)}</span>
                </span>
                <span className="flex items-center justify-between gap-3 px-5 py-3 text-sm text-fg-muted">
                  <span>
                    {plural(c.students ?? 0, "student")} · {plural(c.assignments ?? 0, "assignment")}
                  </span>
                  <span className="font-semibold text-fg group-hover:underline">Open</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </TeacherShell>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  graded: { label: "Graded", cls: "bg-mint text-ink dark:bg-mint/15 dark:text-mint" },
  turned: { label: "Turned in", cls: "bg-primary text-primary-fg" },
  working: { label: "Working", cls: "bg-peri/35 text-ink dark:bg-peri/20 dark:text-fg" },
  idle: { label: "Not started", cls: "bg-surface-2 text-fg-subtle" },
};
const statusOf = (g: GroupInfo) =>
  g.grade ? STATUS.graded : g.status?.turnedInAt ? STATUS.turned : g.status?.lastActivity ? STATUS.working : STATUS.idle;

function GroupCard({ g, names, gradeUrl, timeUrl, onChanged }: { g: GroupInfo; names: Record<string, string>; gradeUrl: string; timeUrl?: string; onChanged: () => void }) {
  const st = statusOf(g);
  const total = g.grade ? gradeTotal(g.grade) : null;
  return (
    <li className="rounded-2xl border border-line p-3.5" data-testid="group-card">
      <div className="flex items-center gap-2">
        <span className="font-medium">{g.name}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`} data-testid="group-status">
          {st.label}
        </span>
        <span className="flex-1" />
        {total !== null && g.grade && (
          <span className="text-sm font-semibold tabular">
            {total}/{rubricMax(g.grade.rows)}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-fg-muted">{g.members.length ? g.members.map((u) => names[u] ?? "Someone").join(", ") : "No students yet"}</p>
      <p className="mt-1 text-xs text-fg-subtle tabular" data-testid="group-progress">
        Tasks {g.status?.tasksDone ?? 0}/{g.status?.tasksTotal ?? 0} · {g.status?.joined ?? 0} of {g.members.length} joined
        {g.status?.lastActivity ? ` · active ${timeAgo(g.status.lastActivity)}` : ""}
      </p>
      {timeUrl && !g.status?.turnedInAt && (
        <div className="mt-2.5">
          <MoreTime url={timeUrl} onDone={onChanged} />
        </div>
      )}
      {g.status?.turnedInAt && (
        <Link to={gradeUrl} className="press mt-2.5 inline-flex rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-fg hover:bg-primary-hover" data-testid="grade-group">
          {g.grade ? "Review grade" : "Grade"}
        </Link>
      )}
    </li>
  );
}

/** The assignment's less-used actions, in one small menu. */
function AssignmentMore({ csv, onEditTimes, onMove }: { csv: string; onEditTimes: () => void; onMove?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const item = "press flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2";
  return (
    <span className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="press inline-flex items-center gap-1 rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium hover:bg-surface-2" data-testid="assignment-more">
        More <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <span className="pop absolute left-0 top-full z-20 mt-1 block w-64 rounded-xl border border-line bg-surface p-1 shadow-lg" role="menu" style={{ ["--origin" as string]: "top left" }}>
          <button role="menuitem" className={item} onClick={() => (setOpen(false), onEditTimes())} data-testid="edit-times">
            <CalendarClock className="h-4 w-4 text-fg-muted" /> Change due date and times
          </button>
          <a role="menuitem" href={csv} className={item} onClick={() => setOpen(false)} data-testid="export-csv">
            <Download className="h-4 w-4 text-fg-muted" /> Download grades (CSV)
          </a>
          {onMove && (
            <button role="menuitem" className={item} onClick={() => (setOpen(false), onMove())} data-testid="move-students">
              <Users className="h-4 w-4 text-fg-muted" /> Move students between groups
            </button>
          )}
        </span>
      )}
    </span>
  );
}

function AssignmentSection({ a, view, reload }: { a: Assignment; view: ClassView; reload: () => void }) {
  const nav = useNavigate();
  const names = Object.fromEntries(view.students.map((s) => [s.uid, s.name]));
  const grouped = new Set(a.groups.flatMap((g) => g.members));
  const ungrouped = view.students.filter((s) => !grouped.has(s.uid));
  const [manage, setManage] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editTimes, setEditTimes] = useState(false);
  const solo = a.mode === "solo";
  const timeUrl = (room: string) => `/api/classes/${view.class.id}/assignments/${a.id}/groups/${room}/time`;
  const link = `${location.origin}${assignmentPath(view.class.code, a.id)}`;
  const due = a.project.dueAt ? new Date(a.project.dueAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  const move = async (uid: string, room: string | null) => {
    await api(`/api/classes/${view.class.id}/assignments/${a.id}/move`, { method: "POST", body: JSON.stringify({ uid, room }) });
    reload();
  };
  const turned = a.groups.filter((g) => g.status?.turnedInAt).length;
  const waiting = a.groups.filter((g) => g.status?.turnedInAt && !g.grade);
  const gradeUrl = (room: string) => `/classes/${view.class.id}/a/${a.id}/${room}`;
  const total = solo ? view.students.length : a.groups.length;
  return (
    <section className="rounded-[20px] border border-line bg-surface p-4" data-testid="assignment">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold tracking-tight">{a.title}</h3>
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-fg-muted">{solo ? "Solo" : "Groups"}</span>
        {due && <span className="text-xs text-fg-subtle">Due {due}</span>}
        {a.project.schedule && <span className="text-xs text-fg-subtle" data-testid="schedule-summary">· {describeSchedule(a.project.schedule)}</span>}
        <span className="text-xs text-fg-subtle" data-testid="turned-in-count">
          · {turned} of {total} turned in
        </span>
        <span className="flex-1" />
        {waiting.length > 0 && (
          <Button size="sm" onClick={() => nav(gradeUrl(waiting[0].roomCode))} data-testid="start-grading">
            Start grading ({waiting.length})
          </Button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <a
          href={classroomShareUrl(link, a.title, `${solo ? "Open the link to start your own copy on Cairn." : "Open the link to join your group's room on Cairn."}${due ? ` Due ${due}.` : ""}`)}
          target="_blank"
          rel="noopener noreferrer"
          className="press rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
          data-testid="post-to-classroom"
        >
          <ClassroomMark /> Post to Classroom
        </a>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(link).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="press rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
          data-link={link}
          data-testid="copy-assignment-link"
        >
          {copied ? <Check className="mr-1 inline h-3.5 w-3.5" /> : <Copy className="mr-1 inline h-3.5 w-3.5" />} {copied ? "Copied" : "Copy link"}
        </button>
        {manage ? (
          <button onClick={() => setManage(false)} className="press rounded-lg bg-fg px-2.5 py-1 text-xs font-semibold text-bg" data-testid="move-done">
            Done moving
          </button>
        ) : (
          <AssignmentMore
            csv={`/api/classes/${view.class.id}/assignments/${a.id}/grades.csv`}
            onEditTimes={() => setEditTimes(true)}
            onMove={solo ? undefined : () => setManage(true)}
          />
        )}
      </div>

      <WorksheetRow a={a} classId={view.class.id} solo={solo} reload={reload} />

      {solo ? (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line" data-testid="student-list">
          {view.students.map((s) => {
            const g = a.groups.find((x) => x.members.includes(s.uid));
            const st = g ? statusOf(g) : STATUS.idle;
            const score = g?.grade ? gradeTotal(g.grade) : null;
            return (
              <li key={s.uid} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 text-sm" data-testid="student-row">
                <span className="min-w-[8rem] flex-1 font-medium">{s.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`} data-testid="student-status">
                  {st.label}
                </span>
                <span className="w-28 text-xs text-fg-subtle">{g?.status?.lastActivity ? `active ${timeAgo(g.status.lastActivity)}` : ""}</span>
                <span className="w-16 text-right text-sm font-semibold tabular">{score !== null && g?.grade ? `${score}/${rubricMax(g.grade.rows)}` : ""}</span>
                {g && !isPending(g.roomCode) && !g.status?.turnedInAt && <MoreTime url={timeUrl(g.roomCode)} onDone={reload} />}
                {g?.status?.turnedInAt ? (
                  <Link to={gradeUrl(g.roomCode)} className="press rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-fg hover:bg-primary-hover" data-testid="grade-group">
                    {g.grade ? "Review" : "Grade"}
                  </Link>
                ) : (
                  <span className="w-[3.25rem]" />
                )}
              </li>
            );
          })}
          {!view.students.length && <li className="px-3.5 py-2.5 text-sm text-fg-subtle">No students yet. Share the class link.</li>}
        </ul>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {a.groups.map((g) => (
            <GroupCard key={g.roomCode} g={g} names={names} gradeUrl={gradeUrl(g.roomCode)} timeUrl={isPending(g.roomCode) ? undefined : timeUrl(g.roomCode)} onChanged={reload} />
          ))}
        </ul>
      )}
      {!solo && (manage || ungrouped.length > 0) && (
        <div className="mt-3 rounded-xl border border-line px-3 py-2.5 text-sm">
          {ungrouped.length > 0 && (
            <p className="text-xs font-medium text-fg-muted">
              Not in a group yet: {ungrouped.map((s) => s.name).join(", ")}. They'll be added to a group with space when they open the link, or you can pick one.
            </p>
          )}
          <ul className="mt-1.5 space-y-1">
            {(manage ? view.students : ungrouped).map((s) => {
              const current = a.groups.find((g) => g.members.includes(s.uid))?.roomCode ?? "";
              return (
                <li key={s.uid} className="flex items-center gap-2">
                  <span className="flex-1">{s.name}</span>
                  <select
                    aria-label={`Group for ${s.name}`}
                    value={current}
                    onChange={(e) => move(s.uid, e.target.value || null)}
                    className="rounded-lg border border-line-strong bg-transparent px-2 py-0.5 text-xs"
                  >
                    <option value="">No group</option>
                    {a.groups.map((g) => (
                      <option key={g.roomCode} value={g.roomCode}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {editTimes && (
        <EditTimesDialog
          classId={view.class.id}
          a={a}
          onClose={() => setEditTimes(false)}
          onDone={() => {
            setEditTimes(false);
            reload();
          }}
        />
      )}
    </section>
  );
}

/**
 * The assignment's worksheet: the files every student (or group) starts with, and the answer
 * key only the teacher sees. Editing happens in the worksheet's own room, with Cairn's editors.
 */
function WorksheetRow({ a, classId, solo, reload }: { a: Assignment; classId: string; solo: boolean; reload: () => void }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const ws = a.worksheet;
  const make = async (body: object, open: boolean) => {
    setBusy(true);
    const d = await api<{ room?: string }>(`/api/classes/${classId}/assignments/${a.id}/worksheet`, { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (d.error) return void alertDialog({ title: "Couldn't add that", message: d.error });
    if (open && d.room) return nav(`/r/${d.room}`);
    reload();
  };
  const chip = "press inline-flex items-center gap-1 rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium hover:bg-surface-2 disabled:opacity-40";
  if (!ws)
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line-strong px-3 py-2 text-sm" data-testid="worksheet-none">
        <FileText className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
        <span className="min-w-[12rem] flex-1 text-fg-muted">No worksheet. Add one and every {solo ? "student" : "group"} starts with their own copy.</span>
        <button disabled={busy} onClick={() => make({ starter: "doc" }, true)} className={chip} data-testid="add-worksheet">
          <Plus className="h-3.5 w-3.5" /> Add a worksheet
        </button>
      </div>
    );
  const files = ws.files ?? [];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-bg px-3 py-2 text-sm" data-testid="worksheet">
      <FileText className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
      <span className="min-w-[12rem] flex-1">
        <span className="font-medium">Worksheet:</span> <span data-testid="worksheet-files">{files.length ? files.map((x) => x.title).join(", ") : "no files yet"}</span>
        <span className="block text-xs text-fg-subtle">
          Each {solo ? "student" : "group"} gets a copy when they first open the assignment. Changes you make later reach only the ones who haven't opened it yet.
        </span>
      </span>
      {ws.hasKey ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-fg-muted" data-testid="has-key">
          <KeyRound className="h-3 w-3" aria-hidden /> Answer key, only you
        </span>
      ) : (
        <button disabled={busy} onClick={() => make({ key: true }, false)} className={chip} data-testid="add-key">
          <KeyRound className="h-3.5 w-3.5" /> Add an answer key
        </button>
      )}
      <Link to={`/r/${ws.room}`} className={chip} data-testid="edit-worksheet">
        Edit worksheet
      </Link>
    </div>
  );
}

type StarterChoice = "none" | "doc" | "slides" | "upload";
const STARTER_CHOICES: { id: StarterChoice; label: string }[] = [
  { id: "none", label: "None" },
  { id: "doc", label: "Blank doc" },
  { id: "slides", label: "Blank slides" },
  { id: "upload", label: "Upload Word or PowerPoint" },
];

const DEFAULT_REFLECTION = "What was hardest about this assignment?";

const WIZARD_STEPS = ["What is it?", "How do students work?", "Share it"] as const;

/**
 * New assignment, one step at a time: what it is, how students work on it, then share the link.
 * Every choice has a sensible default, so a teacher can fill in a title, click Next twice and be done.
 */
function NewAssignmentDialog({ classId, classCode, students, teach, onDone, onClose }: { classId: string; classCode: string; students: number; teach?: Teach | null; onDone: () => void; onClose: () => void }) {
  const templates = useMemo(() => orderTemplates(PROJECT_TEMPLATES, teach), [teach]);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [project, setProject] = useState<ProjectDraft>(EMPTY_PROJECT);
  const [mode, setMode] = useState<"solo" | "groups">("solo");
  const [size, setSize] = useState(3);
  const [reflect, setReflect] = useState(true);
  const [reflection, setReflection] = useState(DEFAULT_REFLECTION);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [made, setMade] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [starter, setStarter] = useState<StarterChoice>("none");
  const [upload, setUpload] = useState<File | null>(null);
  const [withKey, setWithKey] = useState(false);
  const [worksheetRoom, setWorksheetRoom] = useState<string | null>(null);
  const [importNote, setImportNote] = useState("");
  const template = PROJECT_TEMPLATES.find((t) => t.id === templateId);
  const groups = Math.max(1, Math.round(students / Math.max(1, size)));
  const pick = (id: string) => {
    const t = PROJECT_TEMPLATES.find((x) => x.id === id);
    setTemplateId(id);
    setProject((p) => (t ? { ...p, instructions: t.instructions, rubric: t.rubric, ai: t.ai } : { ...EMPTY_PROJECT, dueAt: p.dueAt }));
  };
  const link = made ? `${location.origin}${assignmentPath(classCode, made)}` : "";
  const due = project.dueAt ? new Date(project.dueAt).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  // Once it's made, closing the dialog any way counts as done (the class page reloads).
  const close = () => (made ? onDone() : onClose());
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (step === 0) {
      if (!title.trim()) return setErr("Give the assignment a title.");
      if (starter === "upload" && !upload) return setErr("Pick a Word or PowerPoint file, or choose another worksheet option.");
      return setStep(1);
    }
    if (step !== 1) return;
    setBusy(true);
    const kind = starter === "upload" ? (upload ? officeKind(upload) : null) : starter === "none" ? null : starter;
    const d = await api<{ id: string; worksheet?: { room: string; starterId?: string } }>(`/api/classes/${classId}/assignments`, {
      method: "POST",
      body: JSON.stringify({
        title: title.trim(),
        project: { ...project, ...(reflect && reflection.trim() ? { reflection: reflection.trim() } : {}) },
        mode,
        groupSize: size,
        ...(templateId ? { template: templateId } : {}),
        ...(kind || withKey ? { worksheet: { starter: kind, key: withKey } } : {}),
      }),
    });
    if (d.error || !d.id) {
      setBusy(false);
      return setErr(d.error ?? "Couldn't make the assignment.");
    }
    setMade(d.id);
    setWorksheetRoom(d.worksheet?.room ?? null);
    // Bring the teacher's own file in as the worksheet (it all happens in this browser).
    if (starter === "upload" && upload && d.worksheet?.starterId) {
      setImportNote("Bringing in your file…");
      try {
        const { importOffice } = await import("../lib/officeImport");
        const r = await importOffice(d.worksheet.room, d.worksheet.starterId, upload, getIdentity());
        setImportNote(r.skipped.length ? `Your file is in. Some things didn't come through: ${r.skipped.join(", ")}.` : "Your file is in.");
      } catch (e) {
        setImportNote(`The assignment is made, but your file didn't come in (${(e as Error).message}). Open the worksheet to try again or start it by hand.`);
      }
    }
    setBusy(false);
    setStep(2);
  };
  // Import from Google Drive (shown once the school's Drive keys are set up).
  const driveCfg = useDrive();
  const driveReady = !!driveCfg;
  const fromDrive = async () => {
    if (!driveCfg) return;
    setErr("");
    try {
      const file = await pickFromDrive(driveCfg);
      if (file) setUpload(file);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const choice = (_on: boolean) => "choice-card bg-bg px-5 py-4 text-left";
  const steps = (
    <ol className="flex gap-2" aria-label="Steps" data-testid="wizard-steps">
      {WIZARD_STEPS.map((label, i) => (
        <li key={label} className="min-w-0 flex-1" aria-current={i === step ? "step" : undefined}>
          <div className={`h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-line"}`} />
          <div className={`mt-1.5 truncate text-[13px] ${i === step ? "font-semibold text-fg" : "text-fg-subtle"}`}>
            {i + 1}. {label}
          </div>
        </li>
      ))}
    </ol>
  );
  const footer = (
    <>
      {err && (
        <p className="w-full text-sm font-semibold text-red-600 dark:text-red-400" role="alert">
          {err}
        </p>
      )}
      {step === 1 && (
        <Button type="button" variant="ghost" onClick={() => setStep(0)} data-testid="wizard-back">
          Back
        </Button>
      )}
      <span className="flex-1" />
      {step === 0 && (
        <button type="submit" className="ledge-btn min-w-[160px]" data-testid="wizard-next">
          Next
        </button>
      )}
      {step === 1 && (
        <button type="submit" disabled={busy} className="ledge-btn min-w-[220px]" data-testid="create-assignment">
          {busy ? (importNote ? "Bringing in your file…" : "Making it…") : "Make the assignment"}
        </button>
      )}
      {step === 2 && (
        <Button type="button" variant="secondary" size="lg" onClick={onDone} data-testid="wizard-done">
          Done
        </Button>
      )}
    </>
  );
  return (
    <Modal
      title={step === 2 ? "Your assignment is ready" : "New assignment"}
      onClose={close}
      onSubmit={submit}
      header={steps}
      footer={footer}
      testId="new-assignment"
    >
      {step === 0 && (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="space-y-8">
            <label className="block">
              <span className="text-[15px] font-semibold">Title</span>
              <Input autoFocus aria-label="Assignment title" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={exampleTitle(teach)} className="mt-2 h-12 text-base" />
            </label>
            <Field label={<>Start from a template <span className="font-normal text-fg-subtle">(optional)</span></>} hint="Sets up the files, tasks, instructions and rubric for you.">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Template">
                {[{ id: "", label: "Blank" }, ...templates].map((t) => (
                  <button key={t.id || "blank"} type="button" role="radio" aria-checked={templateId === t.id} onClick={() => pick(t.id)} className="chip-pick" data-testid={`a-template-${t.id || "blank"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              {template && (
                <p className="mt-3 text-sm text-fg-muted">
                  Each student or group starts with {template.files.map((f) => `${f.title} (${FILE_INFO[f.kind].label.toLowerCase()})`).join(" and ")}, plus {template.tasks.length} starter tasks.
                </p>
              )}
            </Field>
            <Field testId="worksheet-choice" label={<>Worksheet <span className="font-normal text-fg-subtle">(optional)</span></>} hint="A file every student starts with, like a handout to fill in. Each one gets their own copy.">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Worksheet">
                {STARTER_CHOICES.map((c) => (
                  <button key={c.id} type="button" role="radio" aria-checked={starter === c.id} onClick={() => setStarter(c.id)} className="chip-pick" data-testid={`worksheet-${c.id}`}>
                    {c.label}
                  </button>
                ))}
              </div>
              {starter === "upload" && (
                <div className="mt-3 rounded-2xl border border-line bg-bg px-4 py-3.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="press inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line-strong px-3 py-1.5 font-semibold hover:bg-surface-2">
                      <Upload className="h-4 w-4" /> {upload ? "Pick a different file" : "Pick a file"}
                      <input
                        type="file"
                        accept={OFFICE_ACCEPT}
                        className="sr-only"
                        data-testid="worksheet-file"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          if (file && !officeKind(file)) return setErr("That isn't a Word (.docx) or PowerPoint (.pptx) file.");
                          setErr("");
                          setUpload(file);
                        }}
                      />
                    </label>
                    {driveReady && (
                      <button type="button" onClick={() => void fromDrive()} className="press inline-flex items-center gap-1.5 rounded-xl border border-line-strong px-3 py-1.5 font-semibold hover:bg-surface-2" data-testid="worksheet-drive">
                        <DriveMark /> From Google Drive
                      </button>
                    )}
                    {upload && (
                      <span className="font-medium" data-testid="worksheet-file-name">
                        {upload.name}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-fg-subtle">
                    {driveReady
                      ? "Pick a Google Doc or Slides file, or a Word or PowerPoint file. "
                      : "From Google Docs or Slides, use File, then Download, then .docx or .pptx. "}
                    Text, headings, lists, tables, pictures and slide layouts come through; exact fonts, themes, charts and animations don't.
                  </p>
                </div>
              )}
              <label className="mt-4 flex items-start gap-3 text-[15px]">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[#44cf6c]" checked={withKey} onChange={(e) => setWithKey(e.target.checked)} data-testid="worksheet-key" />
                <span>
                  <span className="font-semibold">Add an answer key</span>
                  <span className="block text-sm text-fg-muted">Only you see it. It sits next to each student's work when you grade.</span>
                </span>
              </label>
            </Field>
          </div>
          <div className="space-y-8 lg:border-l lg:border-line lg:pl-10">
            <ProjectEditor part="what" value={project} onChange={setProject} />
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="space-y-8">
            <Field label="Alone or in groups?">
              <div className="grid gap-3" role="radiogroup" aria-label="Solo or groups">
                <button type="button" role="radio" aria-checked={mode === "solo"} onClick={() => setMode("solo")} className={choice(mode === "solo")} data-testid="mode-solo">
                  <div className="text-[1.05rem] font-semibold">On their own</div>
                  <div className="mt-1 text-sm text-fg-muted">Every student gets their own copy and their own grade.</div>
                </button>
                <button type="button" role="radio" aria-checked={mode === "groups"} onClick={() => setMode("groups")} className={choice(mode === "groups")} data-testid="mode-groups">
                  <div className="text-[1.05rem] font-semibold">In groups</div>
                  <div className="mt-1 text-sm text-fg-muted">Groups work together, and you see what each person did.</div>
                </button>
              </div>
              {mode === "groups" && (
                <label className="mt-4 flex flex-wrap items-center gap-2.5 text-[15px]">
                  <span className="font-semibold">Groups of</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={size}
                    aria-label="Group size"
                    onChange={(e) => setSize(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                    className="h-10 w-20 rounded-xl border border-line-strong bg-transparent px-3"
                  />
                  <span className="text-sm text-fg-muted">
                    {students
                      ? `→ about ${groups} group${groups === 1 ? "" : "s"}, picked at random. Students who join later go into a group with space.`
                      : "Students are put into groups as they open the link."}
                  </span>
                </label>
              )}
            </Field>
            <details className="rounded-2xl border border-line px-4 py-3.5" data-testid="more-options">
              <summary className="cursor-pointer text-[15px] font-semibold">More options</summary>
              <div className="mt-4 space-y-5">
                <ScheduleEditor value={project.schedule} onChange={(schedule) => setProject((p) => ({ ...p, schedule }))} />
                <label className="flex items-start gap-3 text-[15px]">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-[#44cf6c]" checked={reflect} onChange={(e) => setReflect(e.target.checked)} data-testid="reflect-toggle" />
                  <span>
                    <span className="font-semibold">Ask one question when students turn it in</span>
                    <span className="block text-sm text-fg-muted">Their answer shows with their work. It takes them half a minute and tells you a lot.</span>
                  </span>
                </label>
                {reflect && <Input aria-label="Reflection question" maxLength={300} value={reflection} onChange={(e) => setReflection(e.target.value)} />}
              </div>
            </details>
          </div>
          <div className="space-y-8 lg:border-l lg:border-line lg:pl-10">
            <ProjectEditor part="how" value={project} onChange={setProject} />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="mx-auto max-w-xl py-2" data-testid="wizard-ready">
          <p className="text-[1.0625rem] text-fg-muted">
            Post this link in Google Classroom. When a student opens it, Cairn gives them {mode === "solo" ? "their own copy" : "their group's room"}, and their work shows up on this class page for grading.
          </p>
          <a
            href={classroomShareUrl(link, title.trim(), `${mode === "solo" ? "Open the link to start your own copy on Cairn." : "Open the link to join your group's room on Cairn."}${due ? ` Due ${due}.` : ""}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="ledge-btn mt-6 w-full"
            data-testid="wizard-post-to-classroom"
          >
            <ClassroomMark /> Post to Google Classroom
          </a>
          <p className="mt-2 text-center text-sm text-fg-subtle">In Classroom, pick Assignment, then set the points and due date there.</p>
          <div className="mt-6 flex items-center gap-2 rounded-2xl border border-line bg-bg py-2 pl-4 pr-2">
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-fg-muted" data-testid="wizard-link">
              {link}
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(link).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="press flex shrink-0 items-center gap-1.5 rounded-xl border border-line-strong px-3 py-1.5 text-sm font-semibold hover:bg-surface-2"
              data-link={link}
              data-testid="wizard-copy-link"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          {worksheetRoom && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line px-4 py-3 text-[15px]" data-testid="wizard-worksheet">
              <FileText className="h-5 w-5 text-fg-muted" aria-hidden />
              <span className="min-w-[12rem] flex-1">
                {importNote || "Your worksheet is ready to fill in."}
                <span className="block text-sm text-fg-subtle">Check it before students open the link: each one gets a copy of it as it is then.</span>
              </span>
              <Link to={`/r/${worksheetRoom}`} className="press rounded-xl border border-line-strong px-3 py-1.5 text-sm font-semibold hover:bg-surface-2" data-testid="wizard-edit-worksheet">
                Open the worksheet
              </Link>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}


/** Give one student or group more time, right from the dashboard (no request needed). */
function MoreTime({ url, onDone }: { url: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const give = async (body: object) => {
    setBusy(true);
    await api(url, { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    setOpen(false);
    onDone();
  };
  const item = "press block w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-surface-2 disabled:opacity-40";
  return (
    <span className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="press rounded-lg border border-line-strong px-2 py-1 text-xs hover:bg-surface-2" data-testid="more-time">
        More time
      </button>
      {open && (
        <span className="pop absolute right-0 top-full z-20 mt-1 block w-56 rounded-xl border border-line bg-surface p-1 shadow-lg" role="menu">
          <button role="menuitem" disabled={busy} className={item} onClick={() => give({ openMinutes: 60 })} data-testid="time-open-hour">
            Open it now for 1 hour
          </button>
          <button role="menuitem" disabled={busy} className={item} onClick={() => give({ extendDays: 1 })} data-testid="time-extend-1">
            Extend the due date 1 day
          </button>
          <button role="menuitem" disabled={busy} className={item} onClick={() => give({ extendDays: 2 })}>
            Extend the due date 2 days
          </button>
        </span>
      )}
    </span>
  );
}

/** Change the due date and set times for everyone in one assignment. */
function EditTimesDialog({ classId, a, onClose, onDone }: { classId: string; a: Assignment; onClose: () => void; onDone: () => void }) {
  const [dueAt, setDueAt] = useState<number | undefined>(a.project.dueAt);
  const [schedule, setSchedule] = useState<Schedule | undefined>(a.project.schedule);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    await api(`/api/classes/${classId}/assignments/${a.id}`, { method: "PATCH", body: JSON.stringify({ dueAt: dueAt ?? null, schedule: schedule ?? null }) });
    setBusy(false);
    onDone();
  };
  return (
    <Modal
      size="md"
      title={`Times for ${a.title}`}
      subtitle="Changes apply to everyone right away. Students you gave extra time keep it."
      onClose={onClose}
      testId="edit-times-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <span className="flex-1" />
          <button type="button" onClick={save} disabled={busy} className="ledge-btn min-w-[200px]" data-testid="save-times">
            {busy ? "Saving…" : "Save for everyone"}
          </button>
        </>
      }
    >
      <div className="space-y-8">
        <Field label="Due">
          <DateTimeField label="Due date for everyone" value={dueAt} onChange={setDueAt} />
        </Field>
        <ScheduleEditor value={schedule} onChange={setSchedule} />
      </div>
    </Modal>
  );
}

type ClassTimeRequest = TimeRequest & { assignment: string; assignmentId: string; group: string; room: string };

/** Students asking for more time: approve gives exactly what they asked for. */
/** People who opened the class link but aren't on the class list: let them in or turn them away. */
function WaitingSection({ view, onChange }: { view: ClassView; onChange: () => void }) {
  if (!view.waiting.length) return null;
  const answer = async (uid: string, admit: boolean) => {
    await api(`/api/classes/${view.class.id}/waiting/${encodeURIComponent(uid)}`, { method: "POST", body: JSON.stringify({ admit }) });
    onChange();
  };
  return (
    <section id="waiting" className="mt-6 scroll-mt-6 rounded-[20px] border border-line bg-surface p-4" data-testid="waiting-list">
      <h2 className="text-[15px] font-semibold">
        Waiting to join ({view.waiting.length})
      </h2>
      <p className="mt-0.5 text-xs text-fg-subtle">Their email isn't on your class list. Letting someone in adds them to it.</p>
      <ul className="mt-3 space-y-2">
        {view.waiting.map((w) => (
          <li key={w.uid} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line px-3.5 py-2.5 text-sm" data-testid="waiting-student">
            <span className="min-w-0 basis-full sm:basis-auto sm:flex-1">
              <b>{w.name}</b> <span className="break-all text-fg-subtle">{w.email ?? "no email"}</span> <span className="text-fg-subtle">· {timeAgo(w.at)}</span>
            </span>
            <Button size="sm" onClick={() => answer(w.uid, true)} data-testid="admit-student">
              Let in
            </Button>
            <Button size="sm" variant="secondary" onClick={() => answer(w.uid, false)} data-testid="deny-student">
              Turn away
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Students: everyone in the class and everyone invited, in one list, plus how people get in
 * (only the emails on the list, or anyone with the code).
 */
function ClassListSection({ view, onChange }: { view: ClassView; onChange: () => void }) {
  const [pills, setPills] = useState<string[]>([]);
  const [text, setText] = useState("");
  // What "Add" will send: the pills, plus a valid email still being typed.
  const toAdd = [...new Set([...pills, ...parseEmails(text)])].filter((e) => !view.roster.some((r) => r.email === e));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const listOnly = view.access === "list";
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (!toAdd.length) return setBusy(false);
    const d = await api<{ added?: number }>(`/api/classes/${view.class.id}/roster`, { method: "POST", body: JSON.stringify({ emails: toAdd.join("\n") }) });
    setBusy(false);
    if (d.error) return setMsg({ text: d.error, err: true });
    setPills([]);
    setText("");
    setMsg({ text: `Added ${d.added} email${d.added === 1 ? "" : "s"}.` });
    onChange();
  };
  const setAccess = async (access: "list" | "code") => {
    await api(`/api/classes/${view.class.id}`, { method: "PATCH", body: JSON.stringify({ access }) });
    onChange();
  };
  const removeStudent = async (s: ClassStudent) => {
    if (
      !(await confirmDialog({
        title: `Remove ${s.name}?`,
        message: "They'll be taken out of their groups and off the class list, and won't be able to open this class's work.",
        confirmLabel: "Remove",
        danger: true,
      }))
    )
      return;
    await api(`/api/classes/${view.class.id}/students/${encodeURIComponent(s.uid)}`, { method: "DELETE" });
    onChange();
  };
  const removeEmail = async (email: string) => {
    await api(`/api/classes/${view.class.id}/roster/${encodeURIComponent(email)}`, { method: "DELETE" });
    onChange();
  };
  const invited = view.roster.filter((r) => !r.joined);
  return (
    <section className="mt-12" data-testid="class-list" data-tour="class-list">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <h2 className="font-display text-xl font-bold tracking-[-0.01em]">Students</h2>
          <p className="mt-1 text-sm text-fg-muted">
            {view.students.length} joined{invited.length ? ` · ${invited.length} invited, not joined yet` : ""}.{" "}
            {listOnly ? "Only emails on this list get straight in; anyone else waits for you to let them in." : "Anyone who signs in and has the class code or link can join."}
          </p>
        </div>
        <div className="flex rounded-full border border-line p-0.5 text-xs font-semibold" role="radiogroup" aria-label="Who can join">
          <button
            role="radio"
            aria-checked={listOnly}
            onClick={() => setAccess("list")}
            className={`press rounded-full px-3 py-1.5 ${listOnly ? "bg-fg text-bg" : "text-fg-subtle hover:text-fg"}`}
            data-testid="access-list"
          >
            Only my list
          </button>
          <button
            role="radio"
            aria-checked={!listOnly}
            onClick={() => setAccess("code")}
            className={`press rounded-full px-3 py-1.5 ${!listOnly ? "bg-fg text-bg" : "text-fg-subtle hover:text-fg"}`}
            data-testid="access-code"
          >
            Anyone with the code
          </button>
        </div>
      </div>
      {listOnly && (
        <form onSubmit={add} className="mt-4 rounded-[20px] border border-line bg-surface p-4 sm:p-5">
          <label className="block text-[15px] font-semibold" htmlFor="roster-emails">
            Add students
          </label>
          <p className="mb-2.5 mt-0.5 text-sm text-fg-muted">Type a school email and press Enter. Pasting a whole list works too.</p>
          <EmailPills emails={pills} onChange={setPills} draft={text} onDraft={setText} known={view.roster.map((r) => r.email)} />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy || !toAdd.length} data-testid="roster-add">
              {busy ? "Adding…" : toAdd.length > 1 ? `Add ${toAdd.length} students` : "Add to class list"}
            </Button>
            {/* A spreadsheet of the class (saved as CSV) or any text file: the emails are picked out of it. */}
            <label className="press inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium hover:bg-surface-2">
              <Upload className="h-3.5 w-3.5" /> Upload a file
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="sr-only"
                data-testid="roster-file"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (file.size > 2_000_000) return setMsg({ text: "That file is too big. Save just the email column as CSV.", err: true });
                  const found = parseEmails(await file.text());
                  if (!found.length) return setMsg({ text: `No emails found in ${file.name}.`, err: true });
                  setPills((p) => [...new Set([...p, ...found.filter((x) => !view.roster.some((r) => r.email === x))])]);
                  setMsg({ text: `Found ${found.length} email${found.length === 1 ? "" : "s"} in ${file.name}. Check them, then add them.` });
                }}
              />
            </label>
            {msg && (
              <span className={`text-sm ${msg.err ? "text-red-600 dark:text-red-400" : "text-fg-muted"}`} role={msg.err ? "alert" : "status"}>
                {msg.text}
              </span>
            )}
          </div>
        </form>
      )}
      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-[20px] border border-line bg-surface" data-testid="roster">
        {view.students.map((st) => (
          <li key={st.uid} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm" data-testid="roster-row">
            <span className="min-w-[8rem] flex-1">
              <span className="font-medium">{st.name}</span>
              {st.email && <span className="ml-2 text-xs text-fg-subtle">{st.email}</span>}
            </span>
            <span className="rounded-full bg-mint px-2 py-0.5 text-[11px] font-semibold text-ink dark:bg-mint/15 dark:text-mint">Joined</span>
            <button onClick={() => void removeStudent(st)} className="press rounded-full p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label={`Remove ${st.name}`} data-testid="remove-student">
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
        {invited.map((r) => (
          <li key={r.email} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm" data-testid="roster-row">
            <span className="min-w-[8rem] flex-1 text-fg-muted">{r.email}</span>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-fg-subtle">Not joined yet</span>
            <button onClick={() => void removeEmail(r.email)} className="press rounded-full p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label={`Remove ${r.email} from the class list`}>
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
        {!view.students.length && !invited.length && <li className="px-4 py-3 text-sm text-fg-subtle">Nobody yet. Add emails above, or share the class code.</li>}
      </ul>
    </section>
  );
}

function TimeRequestsSection({ classId, onChange }: { classId: string; onChange: () => void }) {
  const [list, setList] = useState<ClassTimeRequest[]>([]);
  const load = useCallback(() => {
    api<{ requests: ClassTimeRequest[] }>(`/api/classes/${classId}/time-requests`).then((d) => setList(d.requests ?? []));
  }, [classId]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);
  if (!list.length) return null;
  const answer = async (r: ClassTimeRequest, approve: boolean) => {
    await api(`/api/classes/${classId}/assignments/${r.assignmentId}/groups/${r.room}/time-requests/${r.id}`, { method: "POST", body: JSON.stringify({ approve }) });
    load();
    onChange();
  };
  return (
    <section id="time-requests" className="mt-6 scroll-mt-6 rounded-[20px] border border-line bg-surface p-4" data-testid="time-requests">
      <h2 className="text-[15px] font-semibold">Asking for more time ({list.length})</h2>
      <ul className="mt-3 space-y-2">
        {list.map((r) => (
          <li key={r.room + r.id} className="rounded-xl border border-line px-3.5 py-2.5 text-sm" data-testid="time-request">
            <div className="flex flex-wrap items-center gap-2">
              <b>{r.byName}</b>
              <span className="text-fg-muted">
                {r.kind === "open" ? "asks to work on it now for an hour" : `asks for ${r.days ?? 1} more day${(r.days ?? 1) === 1 ? "" : "s"}`}
              </span>
              <span className="text-xs text-fg-subtle">
                · {r.assignment}
                {r.group !== r.byName ? ` · ${r.group}` : ""} · {timeAgo(r.at)}
              </span>
            </div>
            {r.reason && <p className="mt-1 text-fg-muted">"{r.reason}"</p>}
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => answer(r, true)} data-testid="approve-time">
                Approve
              </Button>
              <Button size="sm" variant="secondary" onClick={() => answer(r, false)}>
                Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

type ClassReport = Report & { assignment: string; group: string; room: string };

/** Messages students reported to the teacher: the only chat a teacher ever sees. */
function ReportsSection({ classId }: { classId: string }) {
  const [reports, setReports] = useState<ClassReport[]>([]);
  const load = useCallback(() => {
    api<{ reports: ClassReport[] }>(`/api/classes/${classId}/reports`).then((d) => setReports(d.reports ?? []));
  }, [classId]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);
  if (!reports.length) return null;
  return (
    <section id="reports" className="mt-6 scroll-mt-6 rounded-[20px] border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20" data-testid="reports">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-amber-900 dark:text-amber-200">
        <Flag className="h-4 w-4" /> Reported message{reports.length === 1 ? "" : "s"} ({reports.length})
      </h2>
      <p className="mt-0.5 text-xs text-amber-900/80 dark:text-amber-200/80">A student sent you these from their room's chat. You only see the message they reported, never the rest of the chat.</p>
      <ul className="mt-3 space-y-2">
        {reports.map((r) => (
          <li key={r.room + r.id} className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm" data-testid="report">
            <div className="text-xs text-fg-subtle">
              {r.assignment}
              {r.group !== r.byName ? ` · ${r.group}` : ""} · reported by {r.byName}, {timeAgo(r.at)}
            </div>
            <blockquote className="mt-1.5 border-l-2 border-line-strong pl-3">
              <span className="font-medium">{r.message.fromAi ? "Cairn AI" : r.message.authorName}:</span> {r.message.content}
            </blockquote>
            {r.reason && <p className="mt-1.5 text-xs text-fg-muted">Why: {r.reason}</p>}
            <button
              onClick={async () => {
                await api(`/api/classes/${classId}/reports/${r.room}/${r.id}/dismiss`, { method: "POST" });
                load();
              }}
              className="press mt-2 rounded-lg border border-line-strong px-2.5 py-0.5 text-xs hover:bg-surface-2"
            >
              Mark as handled
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** /classes/:id: the teacher's dashboard for one class. */
export function ClassPage() {
  const { id = "" } = useParams();
  const account = useAccount();
  const [view, setView] = useState<ClassView | null>(null);
  const [err, setErr] = useState("");
  const [newA, setNewA] = useState(false);
  const [copied, setCopied] = useState(false);
  const load = useCallback(() => {
    api<ClassView>(`/api/classes/${id}`).then((d) => (d.error ? setErr(d.error) : setView(d)));
  }, [id]);
  useEffect(() => {
    if (!account.user) return;
    load();
    // Progress updates while the page is open.
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [account.user, load]);
  const link = useMemo(() => (view ? `${location.origin}/c/${view.class.code}` : ""), [view]);
  useAutoTour("teacher-class", !!view && account.user?.role === "teacher", account.user?.tours, true);
  // Arriving from Today's "Answer": bring that section into view (it loads a moment later).
  useEffect(() => {
    if (!view || !location.hash) return;
    const id = location.hash.slice(1);
    let n = 0;
    const t = setInterval(() => {
      const el = document.getElementById(id);
      if (el || ++n > 10) {
        clearInterval(t);
        el?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      }
    }, 150);
    return () => clearInterval(t);
  }, [!!view]);
  if (!account.user) return <TeacherShell><SignInFirst /></TeacherShell>;
  if (account.user.role === "student") return <TeacherShell><StudentOnly /></TeacherShell>;
  if (err) return <TeacherShell back={{ to: "/classes", label: "Today" }}><p className="p-8 text-sm text-fg-muted">{err}</p></TeacherShell>;
  if (!view) return <TeacherShell back={{ to: "/classes", label: "Today" }}><p className="p-8 text-sm text-fg-subtle">Loading…</p></TeacherShell>;
  return (
    <TeacherShell back={{ to: "/classes", label: "Today" }}>
      <div className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-8">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[15rem] flex-1">
            <h1 className="font-display text-[2rem] font-extrabold leading-tight tracking-[-0.03em] [overflow-wrap:anywhere]" data-testid="class-name">{view.class.name}</h1>
            <p className="mt-1 text-sm text-fg-muted">{view.students.length} student{view.students.length === 1 ? "" : "s"} joined</p>
          </div>
          <div className="rounded-2xl border border-line px-4 py-2.5" data-tour="class-code">
            <div className="text-sm font-semibold text-fg">Invite students <span className="font-normal text-fg-subtle">· class code</span></div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-semibold tracking-[0.14em]" data-testid="class-code">{formatCode(view.class.code)}</span>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(link).catch(() => {});
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="press rounded-lg p-1 text-fg-muted hover:bg-surface-2 hover:text-fg"
                aria-label="Copy the class link"
                data-link={link}
                data-testid="copy-class-link"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <a
              href={classroomShareUrl(link, `Join ${view.class.name} on Cairn`, "Open the link and sign in with your school Google account. Your assignments will show up there.")}
              target="_blank"
              rel="noopener noreferrer"
              className="press mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-fg-muted hover:text-fg"
              data-testid="share-class-to-classroom"
            >
              <ClassroomMark /> Share to Google Classroom
            </a>
          </div>
        </div>

        <ReportsSection classId={view.class.id} />
        <WaitingSection view={view} onChange={load} />
        <TimeRequestsSection classId={view.class.id} onChange={load} />

        <div className="mt-8 flex items-center gap-2">
          <h2 className="font-display text-xl font-bold tracking-[-0.01em]">Assignments</h2>
          <span className="flex-1" />
          {view.assignments.length > 0 && (
            <Button onClick={() => setNewA(true)} data-testid="new-assignment-btn" data-tour="new-assignment">
              <Plus className="h-4 w-4" /> New assignment
            </Button>
          )}
        </div>
        {!view.assignments.length && (
          <div className="mt-3 rounded-[20px] border border-dashed border-line-strong px-5 py-8 text-center" data-testid="no-assignments">
            <RockArt className="mx-auto mb-3 h-20 w-20" body={TEAL} pose="carry" prop="pencil" />
            <p className="font-display text-lg font-bold">No assignments yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">Make one, post its link in Google Classroom, and students join the class just by opening it.</p>
            <Button className="mt-4" onClick={() => setNewA(true)} data-testid="new-assignment-btn" data-tour="new-assignment">
              <Plus className="h-4 w-4" /> Make your first assignment
            </Button>
          </div>
        )}
        <div className="mt-3 space-y-4">
          {view.assignments.map((a) => (
            <AssignmentSection key={a.id} a={a} view={view} reload={load} />
          ))}
        </div>

        <ClassListSection view={view} onChange={load} />

        <section className="mt-12 rounded-[20px] border border-line p-4">
          <h2 className="text-sm font-semibold">Erase this class</h2>
          <p className="mt-0.5 text-xs text-fg-subtle">Deletes all your students' work (chats, files and uploads), the student list and all grades. This can't be undone. Download grades first.</p>
          <button
            onClick={async () => {
              const typed = await promptDialog({
                title: `Erase ${view.class.name}?`,
                message: "This permanently erases the class and all of its students' work. It can't be undone.",
                label: "Type the class name to confirm",
                placeholder: view.class.name,
                mustMatch: view.class.name,
                confirmLabel: "Erase class",
                danger: true,
              });
              if (typed?.trim() !== view.class.name) return;
              const d = await api(`/api/classes/${view.class.id}`, { method: "DELETE" });
              if (!d.error) location.href = "/classes";
            }}
            className="press mt-2 rounded-lg border border-red-300 px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
            data-testid="erase-class"
          >
            Erase class
          </button>
        </section>
      </div>
      {newA && (
        <NewAssignmentDialog
          classId={view.class.id}
          classCode={view.class.code}
          students={view.students.length}
          teach={account.user.teach}
          onClose={() => setNewA(false)}
          onDone={() => {
            setNewA(false);
            load();
          }}
        />
      )}
    </TeacherShell>
  );
}

const STEPS_KEY = "huddle.teacherSteps.hidden";

/**
 * The first-time path: make a class → make an assignment and post it → grade. Each step shows
 * one button; finished steps get a check. It goes away once something is graded (or on "Hide").
 */
function GettingStarted({ setup, hasWork = false }: { setup: TodayView["setup"]; hasWork?: boolean }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(STEPS_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (hidden || setup.hasGraded) return null;
  const cls = setup.firstClassId ? `/classes/${setup.firstClassId}` : "";
  const steps = [
    { done: setup.hasClass, label: "Make a class", hint: "One for each period you teach.", action: { label: "Make a class", onClick: () => document.getElementById("new-class-name")?.focus() } },
    { done: setup.hasAssignment, label: "Make an assignment and post it in Google Classroom", hint: "Students open the link and sign in with their school Google account.", action: { label: "Make an assignment", to: cls } },
    {
      done: false,
      label: "Grade the work that's turned in",
      hint: hasWork ? "Some is ready now: use Grade above." : "You'll see it on this page as soon as someone turns in.",
      action: hasWork ? { label: "", to: "" } : { label: "Open your class", to: cls },
    },
  ];
  const current = steps.findIndex((x) => !x.done);
  return (
    <section className="rise rise-2 mt-6 rounded-[20px] border border-line bg-surface p-5" data-testid="getting-started" data-tour="getting-started">
      <div className="flex items-center gap-2">
        <RockArt className="h-9 w-9 -my-2" body={PERI} pose="cheer" />
        <h2 className="font-semibold">Getting started</h2>
        <span className="text-xs text-fg-subtle">
          Step {current + 1} of {steps.length}
        </span>
        <span className="flex-1" />
        <button
          onClick={() => {
            try {
              localStorage.setItem(STEPS_KEY, "1");
            } catch {}
            setHidden(true);
          }}
          className="press rounded-lg px-2 py-1 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
          data-testid="hide-steps"
        >
          Hide
        </button>
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((x, i) => (
          <li key={x.label} className={`flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl px-3 py-2.5 ${i === current ? "bg-surface-2" : ""}`} data-testid="setup-step" data-done={x.done ? "1" : "0"}>
            {x.done ? (
              <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1d7a3b] dark:text-mint" aria-label="Done" />
            ) : (
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${i === current ? "border-fg" : "border-line-strong text-fg-subtle"}`}>{i + 1}</span>
            )}
            <div className="min-w-[12rem] flex-1">
              <div className={`text-sm font-medium ${x.done ? "text-fg-muted line-through decoration-fg-subtle" : ""}`}>{x.label}</div>
              {i === current && <div className="mt-0.5 text-xs text-fg-subtle">{x.hint}</div>}
            </div>
            {i === current &&
              ("to" in x.action && x.action.to ? (
                <Link to={x.action.to} className="press flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover" data-testid="setup-next">
                  {x.action.label} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : "onClick" in x.action ? (
                <button onClick={x.action.onClick} className="press flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover" data-testid="setup-next">
                  {x.action.label} <ArrowRight className="h-3.5 w-3.5" />
                </button>
              ) : null)}
          </li>
        ))}
      </ol>
    </section>
  );
}

const dueText = (ms: number) => new Date(ms).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What needs the teacher right now: grading first, then answers, then what's due soon. */
function TodayPanel({ today }: { today: TodayView }) {
  const { toGrade, answers, dueSoon, setup } = today;
  if (!setup.hasAssignment) return null;
  if (!toGrade.length && !answers.length && !dueSoon.length) {
    // While the getting-started steps are up, they say what to do next.
    if (!setup.hasGraded) return null;
    return (
      <div className="rise rise-2 mt-6 flex items-center gap-3 rounded-[20px] border border-line bg-surface px-5 py-4" data-testid="all-caught-up">
        <RockArt className="h-14 w-14 shrink-0" body={MINT} pose="cheer" />
        <div>
          <div className="font-medium">You're all caught up</div>
          <div className="text-sm text-fg-muted">Nothing to grade or answer right now.</div>
        </div>
      </div>
    );
  }
  const row = "flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3";
  const go = "press flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold";
  return (
    <div className="rise rise-2 mt-6 space-y-5" data-testid="today">
      {toGrade.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold tracking-[-0.01em]">Ready to grade</h2>
          <ul className="mt-2 divide-y divide-line rounded-[20px] border border-line bg-surface">
            {toGrade.map((x) => (
              <li key={x.assignmentId} className={row} data-testid="today-grade">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{x.title}</div>
                  <div className="text-xs text-fg-subtle">
                    {x.className} · {plural(x.count, x.mode === "solo" ? "student" : "group")} turned in
                  </div>
                </div>
                <Link to={`/classes/${x.classId}/a/${x.assignmentId}/${x.first}`} className={`${go} bg-primary text-primary-fg hover:bg-primary-hover`} data-testid="today-grade-btn">
                  Grade ({x.count}) <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {answers.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold tracking-[-0.01em]">Needs your answer</h2>
          <ul className="mt-2 divide-y divide-line rounded-[20px] border border-line bg-surface">
            {answers.map((x) => (
              <li key={x.classId} className={row} data-testid="today-answer">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{x.className}</div>
                  <div className="flex flex-wrap gap-x-3 text-xs text-fg-subtle">
                    {x.timeRequests > 0 && (
                      <span>
                        <Clock className="mr-1 inline h-3 w-3" aria-hidden />
                        {plural(x.timeRequests, "request")} for more time
                      </span>
                    )}
                    {x.reports > 0 && (
                      <span>
                        <Flag className="mr-1 inline h-3 w-3" aria-hidden />
                        {plural(x.reports, "reported message")}
                      </span>
                    )}
                    {x.waiting > 0 && (
                      <span>
                        <Users className="mr-1 inline h-3 w-3" aria-hidden />
                        {plural(x.waiting, "student")} waiting to join
                      </span>
                    )}
                  </div>
                </div>
                <Link
                  to={`/classes/${x.classId}#${x.waiting > 0 ? "waiting" : x.timeRequests > 0 ? "time-requests" : "reports"}`}
                  className={`${go} border border-line-strong hover:bg-surface-2`}
                  data-testid="today-answer-btn"
                >
                  Answer <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {dueSoon.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold tracking-[-0.01em]">Due soon</h2>
          <ul className="mt-2 divide-y divide-line rounded-[20px] border border-line bg-surface">
            {dueSoon.map((x) => (
              <li key={x.assignmentId} className={row} data-testid="today-due">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{x.title}</div>
                  <div className="text-xs text-fg-subtle">
                    <CalendarClock className="mr-1 inline h-3 w-3" aria-hidden />
                    {x.className} · due {dueText(x.dueAt)} · {x.notStarted} of {x.total} haven't started
                  </div>
                </div>
                <Link to={`/classes/${x.classId}`} className={`${go} text-fg-muted hover:bg-surface-2 hover:text-fg`}>
                  See who <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export { TeacherShell, SignInFirst, StudentOnly, api };
