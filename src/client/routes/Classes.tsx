import { alertDialog, confirmDialog, promptDialog } from "../components/Dialogs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Ban, BookOpen, CalendarClock, Check, ChevronDown, CircleCheck, ClipboardList, Clock, Copy, CopyPlus, Download, Eye, File, FileText, Flag, FlaskConical, GraduationCap, KeyRound, MessagesSquare, Plus, Presentation, Upload, UserPlus, Users, X } from "lucide-react";
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
import { FilePanel } from "../components/FilePanel";
import { StudentPreview } from "../components/StudentPreview";
import type { RoomFile } from "../../shared/protocol";
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
function ClassroomMark({ className = "mr-1 inline h-4 w-4 align-[-3px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="2" y="3" width="20" height="18" rx="2" fill="#f4b400" />
      <rect x="3.5" y="4.5" width="17" height="13" rx="1" fill="#0f9d58" />
      <circle cx="12" cy="9" r="2" fill="#fff" />
      <path d="M8.2 15.5c.6-1.9 2-2.9 3.8-2.9s3.2 1 3.8 2.9z" fill="#fff" />
      <circle cx="7" cy="10" r="1.4" fill="#57bb8a" />
      <circle cx="17" cy="10" r="1.4" fill="#57bb8a" />
      <rect x="13" y="18.5" width="5" height="1.6" rx=".8" fill="#fff" />
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
  returned: { label: "Returned", cls: "bg-mint text-ink dark:bg-mint/15 dark:text-mint" },
  graded: { label: "Graded, not returned", cls: "bg-peri/35 text-ink dark:bg-peri/20 dark:text-fg" },
  turned: { label: "Turned in", cls: "bg-primary text-primary-fg" },
  working: { label: "Working", cls: "bg-peri/35 text-ink dark:bg-peri/20 dark:text-fg" },
  idle: { label: "Not started", cls: "bg-surface-2 text-fg-subtle" },
};
const statusOf = (g: GroupInfo) =>
  g.grade ? (g.grade.returnedAt ? STATUS.returned : STATUS.graded) : g.status?.turnedInAt ? STATUS.turned : g.status?.lastActivity ? STATUS.working : STATUS.idle;

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
function AssignmentMore({ csv, onEditTimes, onMove, onCopy, onPreview }: { csv: string; onEditTimes: () => void; onMove?: () => void; onCopy: () => void; onPreview: () => void }) {
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
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="press inline-flex h-10 items-center gap-1 rounded-xl border border-line-strong px-3.5 text-sm font-semibold hover:bg-surface-2" data-testid="assignment-more">
        More <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <span className="pop absolute right-0 top-full z-20 mt-1 block w-64 rounded-xl border border-line bg-surface p-1 shadow-lg" role="menu" style={{ ["--origin" as string]: "top right" }}>
          <button role="menuitem" className={item} onClick={() => (setOpen(false), onPreview())} data-testid="preview-student">
            <Eye className="h-4 w-4 text-fg-muted" /> Preview as a student
          </button>
          <button role="menuitem" className={item} onClick={() => (setOpen(false), onCopy())} data-testid="copy-to-class">
            <CopyPlus className="h-4 w-4 text-fg-muted" /> Copy to another class
          </button>
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

type StatKey = "idle" | "working" | "turned" | "graded";
const statKey = (g?: GroupInfo): StatKey => (!g ? "idle" : g.grade ? "graded" : g.status?.turnedInAt ? "turned" : g.status?.lastActivity ? "working" : "idle");
const STATS: { key: StatKey; label: string }[] = [
  { key: "idle", label: "Not started" },
  { key: "working", label: "Working" },
  { key: "turned", label: "To grade" },
  { key: "graded", label: "Graded" },
];
const AI_SHORT: Record<string, string> = { off: "AI off", tutor: "AI tutor only", full: "Full AI help" };
const shortWhen = (ms: number) => new Date(ms).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** One assignment, all of it: what it is, the one thing to do next, where everyone is, and the work. */
function AssignmentSection({ a, view, reload }: { a: Assignment; view: ClassView; reload: () => void }) {
  const nav = useNavigate();
  const names = Object.fromEntries(view.students.map((s) => [s.uid, s.name]));
  const grouped = new Set(a.groups.flatMap((g) => g.members));
  const ungrouped = view.students.filter((s) => !grouped.has(s.uid));
  const [manage, setManage] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editTimes, setEditTimes] = useState(false);
  const [copying, setCopying] = useState(false);
  const [preview, setPreview] = useState(false);
  const [filter, setFilter] = useState<StatKey | null>(null);
  useEffect(() => setFilter(null), [a.id]);
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
  const toReturn = a.groups.filter((g) => g.grade && !g.grade.returnedAt);
  const returnGrades = async () => {
    const who = solo ? (toReturn.length === 1 ? "That student" : "Those students") : toReturn.length === 1 ? "That group" : "Those groups";
    if (
      !(await confirmDialog({
        title: `Return ${toReturn.length === 1 ? "1 grade" : `${toReturn.length} grades`}?`,
        message: `${who} will see the grade and your comment on their class page. You can still change a grade after.`,
        confirmLabel: "Return",
      }))
    )
      return;
    await api(`/api/classes/${view.class.id}/assignments/${a.id}/return`, { method: "POST", body: "{}" });
    reload();
  };
  const gradeUrl = (room: string) => `/classes/${view.class.id}/a/${a.id}/${room}`;
  const total = solo ? view.students.length : a.groups.length;
  // Where everyone is: each student (solo) or group, counted once.
  const units = solo ? view.students.map((s) => a.groups.find((x) => x.members.includes(s.uid))) : a.groups;
  const counts: Record<StatKey, number> = { idle: 0, working: 0, turned: 0, graded: 0 };
  units.forEach((g) => counts[statKey(g)]++);
  const shown = (g?: GroupInfo) => !filter || statKey(g) === filter;
  const secondary = "press inline-flex h-10 items-center gap-1.5 rounded-xl border border-line-strong px-3.5 text-sm font-semibold hover:bg-surface-2";
  return (
    <section className="min-w-0" data-testid="assignment" aria-label={a.title}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-[16rem] flex-1">
          <h2 className="font-display text-[1.7rem] font-extrabold leading-tight tracking-[-0.02em] [overflow-wrap:anywhere]">{a.title}</h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-fg-muted">
            <span className="rounded-full border border-line-strong px-2 py-0.5 text-xs font-semibold text-fg">{solo ? "Solo" : `Groups of ${a.groupSize}`}</span>
            {due && <span>Due {due}</span>}
            {a.project.schedule && <span data-testid="schedule-summary">· {describeSchedule(a.project.schedule)}</span>}
            <span>· {AI_SHORT[a.project.ai] ?? "AI tutor only"}</span>
            <span data-testid="turned-in-count">
              · {turned} of {total} turned in
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {waiting.length > 0 && (
            <button onClick={() => nav(gradeUrl(waiting[0].roomCode))} className="ledge-btn h-11 px-5 text-[15px]" data-testid="start-grading">
              Start grading ({waiting.length})
            </button>
          )}
          {toReturn.length > 0 &&
            (waiting.length ? (
              <button onClick={() => void returnGrades()} className={secondary} data-testid="return-grades">
                Return grades ({toReturn.length})
              </button>
            ) : (
              <button onClick={() => void returnGrades()} className="ledge-btn h-11 px-5 text-[15px]" data-testid="return-grades">
                Return grades ({toReturn.length})
              </button>
            ))}
          <a
            href={classroomShareUrl(link, a.title, `${solo ? "Open the link to start your own copy on Cairn." : "Open the link to join your group's room on Cairn."}${due ? ` Due ${due}.` : ""}`)}
            target="_blank"
            rel="noopener noreferrer"
            className={secondary}
            data-testid="post-to-classroom"
          >
            <ClassroomMark className="h-4 w-4" /> Post to Classroom
          </a>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(link).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className={secondary}
            data-link={link}
            data-testid="copy-assignment-link"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy link"}
          </button>
          {manage ? (
            <button onClick={() => setManage(false)} className="press inline-flex h-10 items-center rounded-xl bg-fg px-3.5 text-sm font-semibold text-bg" data-testid="move-done">
              Done moving
            </button>
          ) : (
            <AssignmentMore
              csv={`/api/classes/${view.class.id}/assignments/${a.id}/grades.csv`}
              onEditTimes={() => setEditTimes(true)}
              onMove={solo ? undefined : () => setManage(true)}
              onCopy={() => setCopying(true)}
              onPreview={() => setPreview(true)}
            />
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label={`Show ${solo ? "students" : "groups"} by where they are`}>
        {STATS.map((x) => {
          const on = filter === x.key;
          const hot = x.key === "turned" && counts.turned > 0;
          return (
            <button
              key={x.key}
              onClick={() => setFilter(on ? null : x.key)}
              aria-pressed={on}
              className={`press rounded-2xl border px-4 py-3 text-left transition-colors ${on ? "border-fg bg-surface" : hot ? "border-primary/50 bg-mint/50 hover:border-primary dark:bg-mint/10" : "border-line bg-surface hover:border-line-strong"}`}
              data-testid={`stat-${x.key}`}
            >
              <span className="block text-sm text-fg-muted">{x.label}</span>
              <span className="mt-0.5 block font-display text-[1.8rem] font-extrabold leading-none tabular-nums">{counts[x.key]}</span>
            </button>
          );
        })}
      </div>

      <WorksheetRow a={a} classId={view.class.id} solo={solo} reload={reload} />

      <div className="mt-7 flex items-center gap-3">
        <h3 className="font-display text-lg font-bold tracking-[-0.01em]">{solo ? "Students" : "Groups"}</h3>
        {filter && (
          <button onClick={() => setFilter(null)} className="press inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-fg-muted hover:text-fg" data-testid="clear-filter">
            {STATS.find((x) => x.key === filter)?.label} <X className="h-3 w-3" aria-label="Show everyone" />
          </button>
        )}
      </div>
      {solo ? (
        <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface" data-testid="student-list">
          {view.students.map((s) => {
            const g = a.groups.find((x) => x.members.includes(s.uid));
            if (!shown(g)) return null;
            const st = g ? statusOf(g) : STATUS.idle;
            const score = g?.grade ? gradeTotal(g.grade) : null;
            return (
              <li key={s.uid} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-[15px]" data-testid="student-row">
                <span className="min-w-[9rem] flex-1 font-medium">{s.name}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`} data-testid="student-status">
                  {st.label}
                </span>
                <span className="w-32 text-sm text-fg-subtle">{g?.status?.lastActivity ? `active ${timeAgo(g.status.lastActivity)}` : ""}</span>
                <span className="w-16 text-right font-semibold tabular">{score !== null && g?.grade ? `${score}/${rubricMax(g.grade.rows)}` : ""}</span>
                {g && !isPending(g.roomCode) && !g.status?.turnedInAt && <MoreTime url={timeUrl(g.roomCode)} onDone={reload} />}
                {g?.status?.turnedInAt ? (
                  <Link to={gradeUrl(g.roomCode)} className="press rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover" data-testid="grade-group">
                    {g.grade ? "Review" : "Grade"}
                  </Link>
                ) : (
                  <span className="w-[4.25rem]" />
                )}
              </li>
            );
          })}
          {!view.students.length && <li className="px-4 py-3 text-[15px] text-fg-subtle">No students yet. Invite them with the class code.</li>}
          {view.students.length > 0 && filter && counts[filter] === 0 && <li className="px-4 py-3 text-[15px] text-fg-subtle">Nobody here right now.</li>}
        </ul>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {a.groups.filter((g) => shown(g)).map((g) => (
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
      {copying && <CopyToClassesDialog classId={view.class.id} a={a} onClose={() => setCopying(false)} />}
      {preview && (
        <StudentPreview
          title={a.title}
          dueAt={a.project.dueAt}
          mode={a.mode}
          ai={a.project.ai}
          instructions={a.project.instructions}
          rubric={a.project.rubric}
          rubricGrid={a.project.rubricGrid}
          worksheetRoom={a.worksheet?.room}
          files={(a.worksheet?.files ?? []).filter((x) => x.id).map((x) => ({ id: x.id!, title: x.title, kind: x.kind as RoomFile["kind"], createdAt: 0, createdBy: "" }))}
          onClose={() => setPreview(false)}
        />
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

type Shelf = "needs" | "progress" | "done";
/** Each assignment, where it stands: needs you (to grade or return), in progress, or done. */
function shelve(view: ClassView, now = Date.now()) {
  const rows = view.assignments.map((a) => {
    const solo = a.mode === "solo";
    const total = solo ? view.students.length : a.groups.length;
    const turned = a.groups.filter((g) => g.status?.turnedInAt).length;
    const toGrade = a.groups.filter((g) => g.status?.turnedInAt && !g.grade).length;
    const toReturn = a.groups.filter((g) => g.grade && !g.grade.returnedAt).length;
    const dueAt = a.project.dueAt;
    const past = !!dueAt && dueAt < now;
    const shelf: Shelf = toGrade || toReturn ? "needs" : past || (total > 0 && turned === total) ? "done" : "progress";
    return { a, total, turned, toGrade, toReturn, dueAt, past, shelf };
  });
  const byDue = (x: { dueAt?: number }, y: { dueAt?: number }) => (x.dueAt ?? Infinity) - (y.dueAt ?? Infinity);
  return {
    needs: rows.filter((r) => r.shelf === "needs").sort((x, y) => (y.toGrade ? 1 : 0) - (x.toGrade ? 1 : 0) || byDue(x, y)),
    progress: rows.filter((r) => r.shelf === "progress").sort(byDue),
    done: rows.filter((r) => r.shelf === "done").sort((x, y) => (y.dueAt ?? 0) - (x.dueAt ?? 0)),
  };
}

/** The left side of the Assignments tab: every assignment on one line, grouped by what it needs. */
function AssignmentList({ view, selected, onPick }: { view: ClassView; selected?: string; onPick: (id: string) => void }) {
  const shelves = shelve(view);
  const sections: { id: Shelf; label: string }[] = [
    { id: "needs", label: "Needs you" },
    { id: "progress", label: "In progress" },
    { id: "done", label: "Done" },
  ];
  return (
    <nav aria-label="Assignments" className="space-y-5" data-testid="assignment-list">
      {sections.map((sec) =>
        shelves[sec.id].length ? (
          <div key={sec.id}>
            <h3 className="px-3 text-xs font-bold uppercase tracking-[0.08em] text-fg-subtle">{sec.label}</h3>
            <ul className="mt-1.5 space-y-1">
              {shelves[sec.id].map((r) => {
                const on = r.a.id === selected;
                const sub =
                  sec.id === "needs"
                    ? [r.toGrade ? `${r.toGrade} to grade` : "", r.toReturn ? `${r.toReturn} to return` : ""].filter(Boolean).join(" · ")
                    : sec.id === "progress"
                      ? `${r.dueAt ? `Due ${shortWhen(r.dueAt)}` : "No due date"} · ${r.turned} of ${r.total} in`
                      : r.past && r.dueAt
                        ? `Was due ${shortWhen(r.dueAt)}`
                        : "Everyone turned it in";
                return (
                  <li key={r.a.id}>
                    <button
                      onClick={() => onPick(r.a.id)}
                      aria-current={on ? "true" : undefined}
                      className={`press block w-full rounded-xl px-3 py-2.5 text-left ${on ? "bg-surface shadow-[0_0_0_1px_var(--color-line-strong)]" : "hover:bg-surface-2"}`}
                      data-testid="assignment-pick"
                    >
                      <span className={`block truncate text-[15px] ${on ? "font-semibold" : "font-medium"}`}>{r.a.title}</span>
                      <span className={`block truncate text-sm ${sec.id === "needs" ? "font-semibold text-primary-hover dark:text-primary" : "text-fg-subtle"}`}>{sub}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null,
      )}
    </nav>
  );
}

/** Every student's grade on every assignment, in one table. */
function GradesTab({ view, onOpen }: { view: ClassView; onOpen: (id: string) => void }) {
  const now = Date.now();
  if (!view.assignments.length || !view.students.length)
    return <p className="text-[15px] text-fg-muted">{!view.students.length ? "Grades show up here once students join and turn in work." : "Grades show up here once you make an assignment."}</p>;
  const list = [...view.assignments].sort((x, y) => (x.project.dueAt ?? x.createdAt) - (y.project.dueAt ?? y.createdAt));
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface" data-testid="gradebook">
      <table className="w-full min-w-[640px] border-collapse text-[15px]">
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="sticky left-0 bg-surface px-4 py-3 text-sm font-semibold">Student</th>
            {list.map((a) => (
              <th key={a.id} scope="col" className="min-w-[8.5rem] px-4 py-3 align-bottom text-sm font-semibold">
                <button onClick={() => onOpen(a.id)} className="press line-clamp-2 text-left hover:underline">
                  {a.title}
                </button>
                <span className="mt-0.5 flex items-center gap-2 text-xs font-normal text-fg-subtle">
                  {a.project.dueAt ? `Due ${new Date(a.project.dueAt).toLocaleDateString([], { month: "short", day: "numeric" })}` : "No due date"}
                  <a href={`/api/classes/${view.class.id}/assignments/${a.id}/grades.csv`} className="hover:text-fg" aria-label={`Download grades for ${a.title}`}>
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.students.map((s) => (
            <tr key={s.uid} className="border-b border-line last:border-0" data-testid="gradebook-row">
              <th scope="row" className="sticky left-0 bg-surface px-4 py-3 text-left font-medium">
                {s.name}
              </th>
              {list.map((a) => {
                const g = a.groups.find((x) => x.members.includes(s.uid));
                const score = g?.grade ? (g.grade.students[s.uid] ?? gradeTotal(g.grade)) : null;
                const late = !g?.status?.turnedInAt && !!a.project.dueAt && a.project.dueAt < now;
                return (
                  <td key={a.id} className="px-4 py-3 tabular">
                    {score !== null && g?.grade ? (
                      <span className="font-semibold">
                        {score}
                        <span className="text-sm font-normal text-fg-subtle">/{rubricMax(g.grade.rows)}</span>
                        {!g.grade.returnedAt && <span className="ml-1.5 text-xs font-normal text-fg-subtle">not returned</span>}
                      </span>
                    ) : g?.grade ? (
                      <span className="text-sm text-fg-muted">
                        Reviewed{!g.grade.returnedAt && <span className="ml-1.5 text-xs text-fg-subtle">not returned</span>}
                      </span>
                    ) : g?.status?.turnedInAt ? (
                      <Link to={`/classes/${view.class.id}/a/${a.id}/${g.roomCode}`} className="text-sm font-semibold text-primary-hover hover:underline dark:text-primary">
                        To grade
                      </Link>
                    ) : late ? (
                      <span className="text-sm font-medium text-red-700 dark:text-red-300">Missing</span>
                    ) : (
                      <span className="text-fg-subtle">–</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** How students get in: the class code, the link, and sharing it to Google Classroom. */
function InvitePanel({ view }: { view: ClassView }) {
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}/c/${view.class.code}`;
  return (
    <div>
      <div className="text-sm text-fg-muted">Class code</div>
      <div className="mt-1 font-mono text-[2.2rem] font-semibold leading-none tracking-[0.16em]" data-testid="invite-code">
        {formatCode(view.class.code)}
      </div>
      <p className="mt-3 text-[15px] text-fg-muted">Students open the link (or type the code on Cairn) and sign in with their school Google account.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => {
            navigator.clipboard?.writeText(link).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="press inline-flex h-11 items-center gap-1.5 rounded-xl border border-line-strong px-4 text-[15px] font-semibold hover:bg-surface-2"
          data-link={link}
          data-testid="copy-class-link"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy the class link"}
        </button>
        <a
          href={classroomShareUrl(link, `Join ${view.class.name} on Cairn`, "Open the link and sign in with your school Google account. Your assignments will show up there.")}
          target="_blank"
          rel="noopener noreferrer"
          className="press inline-flex h-11 items-center gap-1.5 rounded-xl border border-line-strong px-4 text-[15px] font-semibold hover:bg-surface-2"
          data-testid="share-class-to-classroom"
        >
          <ClassroomMark className="h-4 w-4" /> Share to Google Classroom
        </a>
      </div>
    </div>
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

type StarterChoice = "none" | "doc" | "slides" | "upload" | "drive";
const STARTER_CHOICES: { id: StarterChoice; label: string; icon: React.ReactNode }[] = [
  { id: "none", label: "None", icon: <Ban className="h-4 w-4" /> },
  { id: "doc", label: "Blank doc", icon: <FileText className="h-4 w-4" /> },
  { id: "slides", label: "Blank slides", icon: <Presentation className="h-4 w-4" /> },
  { id: "drive", label: "Google Drive", icon: <DriveMark className="h-4 w-4" /> },
  { id: "upload", label: "Upload Word or PowerPoint", icon: <Upload className="h-4 w-4" /> },
];
const TEMPLATE_ICON: Record<string, React.ReactNode> = {
  "": <File className="h-4 w-4" />,
  "research-paper": <BookOpen className="h-4 w-4" />,
  presentation: <Presentation className="h-4 w-4" />,
  "science-lab": <FlaskConical className="h-4 w-4" />,
  "survey-project": <ClipboardList className="h-4 w-4" />,
  "debate-prep": <MessagesSquare className="h-4 w-4" />,
};

const DEFAULT_REFLECTION = "What was hardest about this assignment?";

/** Steps by number: 0 what, 1 how, 2 the worksheet (only when there is one), 3 share. */
const STEP_LABEL = ["What is it?", "How do students work?", "Write the worksheet", "Share it"] as const;

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
  // The worksheet and answer key, written right here once the assignment is made.
  const [wsFiles, setWsFiles] = useState<{ starter?: RoomFile; key?: RoomFile }>({});
  const [wsTab, setWsTab] = useState<"starter" | "key">("starter");
  const [previewing, setPreviewing] = useState(false);
  const hasWs = starter !== "none" || withKey;
  const stepList = hasWs ? [0, 1, 2, 3] : [0, 1, 3];
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
      if ((starter === "upload" || starter === "drive") && !upload)
        return setErr(starter === "drive" ? "Pick a file from Google Drive, or choose another worksheet option." : "Pick a Word or PowerPoint file, or choose another worksheet option.");
      return setStep(1);
    }
    if (step === 2) return setStep(3);
    if (step !== 1) return;
    setBusy(true);
    // Came back to change it: save the changes to the assignment that's already made.
    if (made) {
      const d = await api(`/api/classes/${classId}/assignments/${made}`, {
        method: "PUT",
        body: JSON.stringify({ title: title.trim(), project: { ...project, ...(reflect && reflection.trim() ? { reflection: reflection.trim() } : {}) }, mode, groupSize: size }),
      });
      setBusy(false);
      if (d.error) return setErr(d.error);
      return setStep(worksheetRoom ? 2 : 3);
    }
    const kind = starter === "upload" || starter === "drive" ? (upload ? officeKind(upload) : null) : starter === "none" ? null : starter;
    const d = await api<{ id: string; worksheet?: { room: string; starterId?: string; keyId?: string } }>(`/api/classes/${classId}/assignments`, {
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
    const f = (id: string | undefined, kind: "doc" | "slides", t: string): RoomFile | undefined => (id ? { id, kind, title: t, createdAt: Date.now(), createdBy: "" } : undefined);
    setWsFiles({ starter: f(d.worksheet?.starterId, kind === "slides" ? "slides" : "doc", title.trim()), key: f(d.worksheet?.keyId, "doc", "Answer key") });
    setWsTab(d.worksheet?.starterId ? "starter" : "key");
    // Bring the teacher's own file in as the worksheet (it all happens in this browser).
    if ((starter === "upload" || starter === "drive") && upload && d.worksheet?.starterId) {
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
    setStep(d.worksheet?.room ? 2 : 3);
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
      {stepList.map((n, i) => (
        <li key={n} className="min-w-0 flex-1" aria-current={n === step ? "step" : undefined}>
          <div className={`h-1.5 rounded-full ${n <= step ? "bg-primary" : "bg-line"}`} />
          <div className={`mt-1.5 truncate text-[13px] ${n === step ? "font-semibold text-fg" : "text-fg-subtle"}`}>
            {i + 1}. {STEP_LABEL[n]}
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
      {step >= 1 && (
        <Button type="button" variant="ghost" onClick={() => (setErr(""), setStep(step === 3 && !worksheetRoom ? 1 : step - 1))} data-testid="wizard-back">
          <ArrowLeft className="h-4 w-4" /> Back
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
          {busy ? (importNote ? "Bringing in your file…" : made ? "Saving…" : "Making it…") : made ? "Save and continue" : hasWs ? "Make it, then write the worksheet" : "Make the assignment"}
        </button>
      )}
      {step === 2 && (
        <button type="submit" className="ledge-btn min-w-[200px]" data-testid="wizard-to-share">
          Next: share it <ArrowRight className="h-4 w-4" />
        </button>
      )}
      {step === 3 && (
        <Button type="button" variant="secondary" size="lg" onClick={onDone} data-testid="wizard-done">
          Done
        </Button>
      )}
    </>
  );
  if (previewing)
    return (
      <StudentPreview
        title={title.trim()}
        dueAt={project.dueAt}
        mode={mode}
        ai={project.ai}
        instructions={project.instructions}
        rubric={project.rubric}
        rubricGrid={project.rubricGrid}
        worksheetRoom={worksheetRoom}
        files={wsFiles.starter ? [wsFiles.starter] : []}
        onClose={() => setPreviewing(false)}
      />
    );
  return (
    <Modal
      title={step === 3 ? "Your assignment is ready" : step === 2 ? `Write the worksheet for ${title.trim()}` : "New assignment"}
      tall={step < 3}
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
                  <button key={t.id || "blank"} type="button" role="radio" aria-checked={templateId === t.id} onClick={() => pick(t.id)} className="chip-pick inline-flex items-center gap-1.5" data-testid={`a-template-${t.id || "blank"}`}>
                    {TEMPLATE_ICON[t.id] ?? null} {t.label}
                  </button>
                ))}
              </div>
              {template && (
                <p className="mt-3 text-sm text-fg-muted">
                  Each student or group starts with {template.files.map((f) => `${f.title} (${FILE_INFO[f.kind].label.toLowerCase()})`).join(" and ")}, plus {template.tasks.length} starter tasks.
                </p>
              )}
            </Field>
            {made && (
              <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg-muted" data-testid="worksheet-locked">
                {worksheetRoom ? "The worksheet is made. Change what's in it on the Write the worksheet step." : "This assignment has no worksheet. You can add one from the class page."}
              </p>
            )}
            {!made && (
            <Field testId="worksheet-choice" label={<>Worksheet <span className="font-normal text-fg-subtle">(optional)</span></>} hint="A file every student starts with, like a handout to fill in. Each one gets their own copy.">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Worksheet">
                {STARTER_CHOICES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={starter === c.id}
                    onClick={() => {
                      if (c.id !== starter && (starter === "upload" || starter === "drive")) setUpload(null);
                      setStarter(c.id);
                      if (c.id === "drive") void fromDrive();
                    }}
                    className="chip-pick inline-flex items-center gap-1.5"
                    data-testid={`worksheet-${c.id}`}
                  >
                    {c.icon} {c.label}
                  </button>
                ))}
              </div>
              {starter === "drive" && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-bg px-4 py-3.5 text-sm" data-testid="drive-picked">
                  <DriveMark className="h-5 w-5" />
                  {upload ? (
                    <span className="font-medium" data-testid="worksheet-file-name">
                      {upload.name}
                    </span>
                  ) : (
                    <span className="text-fg-muted">{driveReady ? "Pick a Google Doc or Slides file." : "Google Drive isn't connected on this site yet."}</span>
                  )}
                  {driveReady && (
                    <button type="button" onClick={() => void fromDrive()} className="press ml-auto inline-flex items-center gap-1.5 rounded-xl border border-line-strong px-3 py-1.5 font-semibold hover:bg-surface-2" data-testid="worksheet-drive">
                      {upload ? "Pick a different file" : "Open Google Drive"}
                    </button>
                  )}
                </div>
              )}
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
                    {upload && (
                      <span className="font-medium" data-testid="worksheet-file-name">
                        {upload.name}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-fg-subtle">
                    Text, headings, lists, tables, pictures and slide layouts come through; exact fonts, themes, charts and animations don't.
                  </p>
                </div>
              )}
              <label className="mt-4 flex items-start gap-3 text-[15px]">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[#44cf6c]" checked={withKey} onChange={(e) => setWithKey(e.target.checked)} data-testid="worksheet-key" />
                <span>
                  <span className="font-semibold">Add an answer key</span>
                  <span className="block text-sm text-fg-muted">You write it on the next steps, right next to the worksheet. Only you see it, beside each student's work when you grade.</span>
                </span>
              </label>
            </Field>
            )}
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
        <div className="flex h-full min-h-0 flex-col gap-4" data-testid="wizard-sheet">
          <div className="flex flex-wrap items-center gap-2">
            {wsFiles.starter && (
              <button type="button" onClick={() => setWsTab("starter")} aria-pressed={wsTab === "starter"} className="chip-pick inline-flex items-center gap-1.5" data-testid="ws-tab-worksheet">
                <FileText className="h-4 w-4" /> Worksheet
              </button>
            )}
            {wsFiles.key && (
              <button type="button" onClick={() => setWsTab("key")} aria-pressed={wsTab === "key"} className="chip-pick inline-flex items-center gap-1.5" data-testid="ws-tab-key">
                <KeyRound className="h-4 w-4" /> Answer key <span className="text-xs font-normal opacity-70">only you</span>
              </button>
            )}
            <span className="min-w-[12rem] flex-1 text-sm text-fg-muted" data-testid="wizard-worksheet">
              {importNote ||
                (wsTab === "key" ? "Write the answers. Only you see this, next to each student's work when you grade." : "Write the questions. Each student gets their own copy when they first open the assignment.")}
            </span>
          </div>
          <div className="min-h-[420px] flex-1 overflow-hidden rounded-2xl border border-line">
            {worksheetRoom && (wsTab === "key" ? wsFiles.key : wsFiles.starter) && (
              <FilePanel bare room={worksheetRoom} file={(wsTab === "key" ? wsFiles.key : wsFiles.starter)!} me={getIdentity()} onClose={() => {}} onRename={() => {}} />
            )}
          </div>
          <p className="text-xs text-fg-subtle">It saves as you type. You can change it later from the class page (Edit worksheet).</p>
        </div>
      )}

      {step === 3 && (
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
            <ClassroomMark className="h-5 w-5" /> Post to Google Classroom
          </a>
          <p className="mt-2 text-center text-sm text-fg-subtle">In Classroom, pick Assignment, then set the points and due date there.</p>
          <button type="button" onClick={() => setPreviewing(true)} className="press mx-auto mt-4 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg" data-testid="wizard-preview">
            <Eye className="h-4 w-4" /> Preview as a student first
          </button>
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-line bg-bg py-2 pl-4 pr-2">
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

/** Copy an assignment (and its worksheet and answer key) to the teacher's other classes. */
function CopyToClassesDialog({ classId, a, onClose }: { classId: string; a: Assignment; onClose: () => void }) {
  const [classes, setClasses] = useState<ClassInfo[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<{ classes: ClassInfo[] }>("/api/classes").then((d) => setClasses((d.classes ?? []).filter((c) => c.id !== classId)));
  }, [classId]);
  const copy = async () => {
    setBusy(true);
    setErr("");
    const d = await api<{ copied: string[] }>(`/api/classes/${classId}/assignments/${a.id}/copy`, { method: "POST", body: JSON.stringify({ classIds: picked }) });
    setBusy(false);
    if (d.error) return setErr(d.error);
    setDone(d.copied ?? []);
  };
  return (
    <Modal
      size="md"
      title={done ? "Copied" : `Copy "${a.title}" to another class`}
      subtitle={done ? undefined : "Same instructions, AI setting and due date, and its own copy of the worksheet and answer key. Each class gets its own link."}
      onClose={onClose}
      testId="copy-dialog"
      footer={
        done ? (
          <>
            <span className="flex-1" />
            <button type="button" onClick={onClose} className="ledge-btn min-w-[140px]" data-testid="copy-close">
              Done
            </button>
          </>
        ) : (
          <>
            {err && <p className="w-full text-sm font-semibold text-red-600 dark:text-red-400" role="alert">{err}</p>}
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <span className="flex-1" />
            <button type="button" disabled={!picked.length || busy} onClick={() => void copy()} className="ledge-btn min-w-[200px]" data-testid="copy-confirm">
              <CopyPlus className="h-4 w-4" /> {busy ? "Copying…" : picked.length > 1 ? `Copy to ${picked.length} classes` : "Copy"}
            </button>
          </>
        )
      }
    >
      {done ? (
        <p className="text-[15px]" data-testid="copy-done">
          It's now in <b>{done.join(", ")}</b>, with its own link. Post that class's link in its Google Classroom.
        </p>
      ) : classes === null ? (
        <p className="text-sm text-fg-subtle">Loading your classes…</p>
      ) : !classes.length ? (
        <p className="text-[15px] text-fg-muted">This is your only class. Make another one first, then copy assignments into it.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Classes">
          {classes.map((c) => {
            const on = picked.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                className="choice-card flex items-center gap-3 bg-bg px-4 py-3 text-left"
                data-testid="copy-class-option"
              >
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 ${on ? "border-fg bg-fg text-bg" : "border-line-strong"}`}>{on && <Check className="h-3.5 w-3.5" />}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="text-xs text-fg-subtle">{plural(c.students ?? 0, "student")}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
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
    <section className="mt-8" data-testid="class-list">
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

function TimeRequestsSection({ classId, onChange, onCount, hidden }: { classId: string; onChange: () => void; onCount?: (n: number) => void; hidden?: boolean }) {
  const [list, setList] = useState<ClassTimeRequest[]>([]);
  const load = useCallback(() => {
    api<{ requests: ClassTimeRequest[] }>(`/api/classes/${classId}/time-requests`).then((d) => setList(d.requests ?? []));
  }, [classId]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => onCount?.(list.length), [list.length]);
  if (!list.length || hidden) return null;
  const answer = async (r: ClassTimeRequest, approve: boolean) => {
    await api(`/api/classes/${classId}/assignments/${r.assignmentId}/groups/${r.room}/time-requests/${r.id}`, { method: "POST", body: JSON.stringify({ approve }) });
    load();
    onChange();
  };
  return (
    <section id="time-requests" className="mb-6 scroll-mt-6 rounded-[20px] border border-amber-300 bg-amber-50 p-5 dark:border-amber-900/60 dark:bg-amber-950/20" data-testid="time-requests">
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
function ReportsSection({ classId, onCount, hidden }: { classId: string; onCount?: (n: number) => void; hidden?: boolean }) {
  const [reports, setReports] = useState<ClassReport[]>([]);
  const load = useCallback(() => {
    api<{ reports: ClassReport[] }>(`/api/classes/${classId}/reports`).then((d) => setReports(d.reports ?? []));
  }, [classId]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => onCount?.(reports.length), [reports.length]);
  if (!reports.length || hidden) return null;
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

type ClassTab = "assignments" | "students" | "grades" | "settings";
const HASH_TAB: Record<string, ClassTab> = { waiting: "students", reports: "students", "time-requests": "assignments" };

/** /classes/:id: the teacher's page for one class, in tabs: assignments, students, grades and settings. */
export function ClassPage() {
  const { id = "" } = useParams();
  const account = useAccount();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<ClassView | null>(null);
  const [err, setErr] = useState("");
  const [newA, setNewA] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [reports, setReports] = useState(0);
  const [timeReqs, setTimeReqs] = useState(0);
  const known = useRef<Set<string> | null>(null);
  const tab: ClassTab = (["students", "grades", "settings"] as const).find((t) => t === params.get("tab")) ?? HASH_TAB[location.hash.slice(1)] ?? "assignments";
  const go = (next: { tab?: ClassTab; a?: string }) =>
    setParams(
      (p) => {
        const q = new URLSearchParams(p);
        if (next.tab) next.tab === "assignments" ? q.delete("tab") : q.set("tab", next.tab);
        if (next.a) q.set("a", next.a);
        return q;
      },
      { replace: true },
    );
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
  // A new assignment opens by itself once it's made.
  useEffect(() => {
    if (!view) return;
    const ids = new Set(view.assignments.map((a) => a.id));
    if (known.current) {
      const made = view.assignments.find((a) => !known.current!.has(a.id));
      if (made) go({ tab: "assignments", a: made.id });
    }
    known.current = ids;
  }, [view]);
  useAutoTour("teacher-class", !!view && account.user?.role === "teacher", account.user?.tours, true);
  // Arriving from Today's "Answer": open the right tab and bring that section into view.
  useEffect(() => {
    if (!view || !location.hash) return;
    const hash = location.hash.slice(1);
    let n = 0;
    const t = setInterval(() => {
      const el = document.getElementById(hash);
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
  const shelves = shelve(view);
  const ordered = [...shelves.needs, ...shelves.progress, ...shelves.done];
  const current = view.assignments.find((a) => a.id === params.get("a")) ?? ordered[0]?.a;
  const toGrade = shelves.needs.reduce((t, r) => t + r.toGrade, 0);
  const toReturn = shelves.needs.reduce((t, r) => t + r.toReturn, 0);
  const tabs: { id: ClassTab; label: string; badge?: string; tone?: "go" | "alert"; tour?: string }[] = [
    { id: "assignments", label: "Assignments", badge: toGrade ? `${toGrade} to grade` : timeReqs ? `${timeReqs} asking for time` : toReturn ? `${toReturn} to return` : undefined, tone: timeReqs && !toGrade ? "alert" : "go" },
    {
      id: "students",
      label: "Students",
      badge: view.waiting.length ? `${view.waiting.length} waiting` : reports ? `${reports} reported` : undefined,
      tone: "alert",
      tour: "class-list",
    },
    { id: "grades", label: "Grades" },
    { id: "settings", label: "Settings" },
  ];
  return (
    <TeacherShell>
      <div className="flex min-h-full flex-col">
        <header className="border-b border-line px-5 pt-6 sm:px-8 lg:px-10">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[14rem] flex-1">
              <h1 className="font-display text-[2.1rem] font-extrabold leading-tight tracking-[-0.03em] [overflow-wrap:anywhere]" data-testid="class-name">
                {view.class.name}
              </h1>
              <p className="mt-1 text-[15px] text-fg-muted">
                {view.students.length} student{view.students.length === 1 ? "" : "s"} · class code{" "}
                <span className="font-mono font-semibold tracking-[0.12em] text-fg" data-testid="class-code">
                  {formatCode(view.class.code)}
                </span>
              </p>
            </div>
            <button onClick={() => setInviting(true)} className="press inline-flex h-11 items-center gap-1.5 rounded-xl border border-line-strong px-4 text-[15px] font-semibold hover:bg-surface-2" data-testid="invite-students" data-tour="class-code">
              <UserPlus className="h-4 w-4" /> Invite students
            </button>
            <button onClick={() => setNewA(true)} className="ledge-btn h-11 px-5 text-[15px]" data-testid="new-assignment-btn" data-tour="new-assignment">
              <Plus className="h-4 w-4" /> New assignment
            </button>
          </div>
          <div role="tablist" aria-label="Class" className="-mb-px mt-5 flex gap-1 overflow-x-auto">
            {tabs.map((t) => {
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={on}
                  aria-controls={`panel-${t.id}`}
                  id={`tab-${t.id}`}
                  onClick={() => go({ tab: t.id })}
                  className={`press flex shrink-0 items-center gap-2 border-b-[3px] px-3 pb-3 pt-1 text-[15px] ${on ? "border-fg font-semibold text-fg" : "border-transparent font-medium text-fg-muted hover:text-fg"}`}
                  data-testid={`tab-${t.id}`}
                  data-tour={t.tour}
                >
                  {t.label}
                  {t.badge && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.tone === "alert" ? "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300" : "bg-mint text-ink dark:bg-mint/15 dark:text-mint"}`}
                      data-testid="tab-badge"
                    >
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </header>

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex-1 px-5 pb-16 pt-6 sm:px-8 lg:px-10">
          {tab === "assignments" && (
            <>
              <TimeRequestsSection classId={view.class.id} onChange={load} onCount={setTimeReqs} />
              {!view.assignments.length ? (
                <div className="mx-auto mt-6 max-w-xl rounded-[24px] border border-dashed border-line-strong px-6 py-10 text-center" data-testid="no-assignments">
                  <RockArt className="mx-auto mb-3 h-20 w-20" body={TEAL} pose="carry" prop="pencil" />
                  <p className="font-display text-xl font-bold">Make your first assignment</p>
                  <p className="mx-auto mt-1 max-w-sm text-[15px] text-fg-muted">Post its link in Google Classroom, and students join the class just by opening it.</p>
                  <button onClick={() => setNewA(true)} className="ledge-btn mx-auto mt-5 h-11 px-5 text-[15px]" data-testid="new-assignment-empty">
                    <Plus className="h-4 w-4" /> New assignment
                  </button>
                </div>
              ) : (
                <div className="grid gap-8 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
                  <div className="lg:sticky lg:top-6 lg:self-start">
                    <AssignmentList view={view} selected={current?.id} onPick={(a) => go({ a })} />
                  </div>
                  {current && <AssignmentSection key={current.id} a={current} view={view} reload={load} />}
                </div>
              )}
            </>
          )}
          {tab === "students" && (
            <div className="max-w-5xl">
              <ReportsSection classId={view.class.id} onCount={setReports} />
              <WaitingSection view={view} onChange={load} />
              <ClassListSection view={view} onChange={load} />
            </div>
          )}
          {/* Counts for the badges even while another tab is open. */}
          {tab !== "students" && <ReportsSection classId={view.class.id} onCount={setReports} hidden />}
          {tab !== "assignments" && <TimeRequestsSection classId={view.class.id} onChange={load} onCount={setTimeReqs} hidden />}
          {tab === "grades" && <GradesTab view={view} onOpen={(a) => go({ tab: "assignments", a })} />}
          {tab === "settings" && (
            <div className="max-w-3xl space-y-6">
              <section className="rounded-[20px] border border-line bg-surface p-6" data-testid="invite-settings">
                <h2 className="font-display text-xl font-bold tracking-[-0.01em]">Invite students</h2>
                <div className="mt-4">
                  <InvitePanel view={view} />
                </div>
                <p className="mt-4 text-sm text-fg-subtle">Who can join (only your list, or anyone with the code) is on the Students tab.</p>
              </section>
              <section className="rounded-[20px] border border-red-200 p-6 dark:border-red-900/50">
                <h2 className="text-[17px] font-semibold">Erase this class</h2>
                <p className="mt-1 text-[15px] text-fg-muted">Deletes all your students' work (chats, files and uploads), the student list and all grades. This can't be undone. Download grades first.</p>
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
                  className="press mt-3 rounded-xl border border-red-300 px-4 py-2 text-[15px] font-semibold text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
                  data-testid="erase-class"
                >
                  Erase class
                </button>
              </section>
            </div>
          )}
        </div>
      </div>
      {inviting && (
        <Modal size="md" title={`Invite students to ${view.class.name}`} onClose={() => setInviting(false)} testId="invite-dialog">
          <InvitePanel view={view} />
        </Modal>
      )}
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
