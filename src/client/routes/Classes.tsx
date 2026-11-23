import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Copy, Download, Flag, GraduationCap, Plus, Users, X } from "lucide-react";
import type { Report } from "../../shared/protocol";
import { PROVIDER_LABEL, useAccount, signInUrl } from "../lib/account";
import { Button, Input, Logo, ThemeToggle } from "../components/ui";
import { formatCode } from "../../shared/code";
import { timeAgo } from "../components/PartyLists";
import { EMPTY_PROJECT, fromLocalInput, ProjectEditor, ScheduleEditor, toLocalInput, type ProjectDraft } from "../components/ProjectEditor";
import { describeSchedule, type Schedule, type TimeRequest } from "../../shared/schedule";
import { PROJECT_TEMPLATES } from "../../shared/templates";
import { FILE_INFO } from "../../shared/files";
import { assignmentPath, classroomShareUrl, gradeTotal, isPending, rubricMax, type Assignment, type ClassInfo, type ClassView, type GroupInfo } from "../../shared/classes";

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

/** Header shared by the teacher's pages. */
function TeacherShell({ children, back }: { children: React.ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
        <Link to="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <Logo className="h-6 w-6" /> Huddle
        </Link>
        {back && (
          <Link to={back.to} className="press ml-2 flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg">
            <ArrowLeft className="h-4 w-4" /> {back.label}
          </Link>
        )}
        <span className="flex-1" />
        <Link to="/dashboard" className="text-sm text-fg-muted hover:text-fg">
          Your rooms
        </Link>
        <ThemeToggle />
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

function SignInFirst() {
  const account = useAccount();
  if (account.user === undefined) return <div className="p-8 text-sm text-fg-subtle">Loading…</div>;
  return (
    <div className="mx-auto mt-[15vh] max-w-sm px-6 text-center">
      <GraduationCap className="mx-auto h-8 w-8 text-fg-muted" />
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Sign in to set up classes</h1>
      <p className="mt-2 text-sm text-fg-muted">Use your school Google account. Students join with a class code, no account needed.</p>
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
  useEffect(() => {
    if (account.user) api<{ classes: ClassInfo[] }>("/api/classes").then((d) => setList(d.classes ?? []));
  }, [account.user]);
  if (!account.user) return <TeacherShell><SignInFirst /></TeacherShell>;
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const d = await api<{ id: string }>("/api/classes", { method: "POST", body: JSON.stringify({ name }) });
    if (d.error || !d.id) return setErr(d.error ?? "Couldn't create the class.");
    nav(`/classes/${d.id}`);
  };
  return (
    <TeacherShell>
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-8">
        <h1 className="rise text-3xl font-semibold tracking-tight">Your classes</h1>
        <p className="rise rise-1 mt-1 text-fg-muted">Students join with the class code. You assign group projects to the whole class at once.</p>
        <form onSubmit={create} className="rise rise-2 mt-6 flex gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm">
          <Input aria-label="Class name" placeholder="New class name (e.g. Period 3 History)" value={name} onChange={(e) => setName(e.target.value)} className="border-0 bg-transparent shadow-none" />
          <Button type="submit" data-testid="create-class">
            <Plus className="h-4 w-4" /> New class
          </Button>
        </form>
        {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">{err}</p>}
        <ul className="mt-8 space-y-2">
          {list === null && <li className="text-sm text-fg-subtle">Loading…</li>}
          {list?.length === 0 && <li className="text-sm text-fg-subtle">No classes yet. Make your first one above.</li>}
          {list?.map((c) => (
            <li key={c.id}>
              <Link to={`/classes/${c.id}`} className="press flex items-center gap-3 rounded-2xl border border-line px-4 py-3 hover:border-line-strong hover:bg-sidebar" data-testid="class-row">
                <GraduationCap className="h-5 w-5 text-fg-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{c.name}</span>
                  <span className="text-xs text-fg-subtle">
                    {c.students ?? 0} students · {c.assignments ?? 0} assignments
                  </span>
                </span>
                <span className="font-mono text-sm tracking-[0.12em] text-fg-muted">{formatCode(c.code)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </TeacherShell>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  graded: { label: "Graded", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200" },
  turned: { label: "Turned in", cls: "bg-primary text-primary-fg" },
  working: { label: "Working", cls: "bg-surface-2 text-fg" },
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
          href={classroomShareUrl(link, a.title, `${solo ? "Open the link to start your own copy on Huddle." : "Open the link to join your group's room on Huddle."}${due ? ` Due ${due}.` : ""}`)}
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
        <button onClick={() => setEditTimes(true)} className="press rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium hover:bg-surface-2" data-testid="edit-times">
          Edit times
        </button>
        <a href={`/api/classes/${view.class.id}/assignments/${a.id}/grades.csv`} className="press rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium hover:bg-surface-2" data-testid="export-csv">
          <Download className="mr-1 inline h-3.5 w-3.5" /> Grades CSV
        </a>
        {!solo && (
          <button onClick={() => setManage((m) => !m)} aria-pressed={manage} className="press rounded-lg px-2.5 py-1 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg">
            <Users className="mr-1 inline h-3.5 w-3.5" /> {manage ? "Done" : "Move students"}
          </button>
        )}
      </div>

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

const DEFAULT_REFLECTION = "What was hardest about this assignment?";

function NewAssignmentDialog({ classId, students, onDone, onClose }: { classId: string; students: number; onDone: () => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [project, setProject] = useState<ProjectDraft>(EMPTY_PROJECT);
  const [mode, setMode] = useState<"solo" | "groups">("solo");
  const [size, setSize] = useState(3);
  const [reflect, setReflect] = useState(true);
  const [reflection, setReflection] = useState(DEFAULT_REFLECTION);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const template = PROJECT_TEMPLATES.find((t) => t.id === templateId);
  const groups = Math.max(1, Math.round(students / Math.max(1, size)));
  const pick = (id: string) => {
    const t = PROJECT_TEMPLATES.find((x) => x.id === id);
    setTemplateId(id);
    setProject((p) => (t ? { ...p, instructions: t.instructions, rubric: t.rubric, ai: t.ai } : { ...EMPTY_PROJECT, dueAt: p.dueAt }));
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setErr("Give the assignment a title.");
    setBusy(true);
    setErr("");
    const d = await api<{ id: string }>(`/api/classes/${classId}/assignments`, {
      method: "POST",
      body: JSON.stringify({
        title: title.trim(),
        project: { ...project, ...(reflect && reflection.trim() ? { reflection: reflection.trim() } : {}) },
        mode,
        groupSize: size,
        ...(templateId ? { template: templateId } : {}),
      }),
    });
    setBusy(false);
    if (d.error || !d.id) return setErr(d.error ?? "Couldn't create the assignment.");
    onDone();
  };
  const choice = (on: boolean) => `press rounded-xl border px-3 py-2 text-left text-sm ${on ? "border-fg bg-surface-2" : "border-line-strong hover:border-fg/40"}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label="New assignment"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="pop max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[24px] border border-line bg-surface p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.4)]"
        data-testid="new-assignment"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">New assignment</h2>
          <button type="button" onClick={onClose} className="press rounded-full p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-fg-muted">You'll get one link to post in Google Classroom. Each student who opens it gets their own room (or their group's), and everything shows up here for grading.</p>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium">How do students work?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Solo or groups">
            <button type="button" role="radio" aria-checked={mode === "solo"} onClick={() => setMode("solo")} className={choice(mode === "solo")} data-testid="mode-solo">
              <div className="font-medium">On their own</div>
              <div className="mt-0.5 text-xs text-fg-subtle">Every student gets their own room and their own grade.</div>
            </button>
            <button type="button" role="radio" aria-checked={mode === "groups"} onClick={() => setMode("groups")} className={choice(mode === "groups")} data-testid="mode-groups">
              <div className="font-medium">In groups</div>
              <div className="mt-0.5 text-xs text-fg-subtle">Groups share a room; each person's part shows on the receipt.</div>
            </button>
          </div>
          {mode === "groups" && (
            <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Groups of</span>
              <input
                type="number"
                min={1}
                max={10}
                value={size}
                aria-label="Group size"
                onChange={(e) => setSize(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                className="w-16 rounded-lg border border-line-strong bg-transparent px-2 py-1"
              />
              <span className="text-fg-subtle">
                → {groups} group{groups === 1 ? "" : "s"} for {students} student{students === 1 ? "" : "s"}, picked at random. Late joiners go into a group with space.
              </span>
            </label>
          )}
        </fieldset>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium">Start from a template</legend>
          <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Template">
            {[{ id: "", label: "Blank" }, ...PROJECT_TEMPLATES].map((t) => (
              <button
                key={t.id || "blank"}
                type="button"
                role="radio"
                aria-checked={templateId === t.id}
                onClick={() => pick(t.id)}
                className={`press rounded-full border px-3 py-1 text-sm ${templateId === t.id ? "border-fg bg-surface-2 font-medium" : "border-line-strong text-fg-muted hover:text-fg"}`}
                data-testid={`a-template-${t.id || "blank"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {template && (
            <p className="mt-2 text-xs text-fg-subtle">
              Each {mode === "solo" ? "student" : "group"} gets {template.files.map((f) => `${f.title} (${FILE_INFO[f.kind].label.toLowerCase()})`).join(" and ")}, plus {template.tasks.length} starter tasks.
            </p>
          )}
        </fieldset>
        <label className="mt-4 block">
          <span className="text-sm font-medium">Title</span>
          <Input aria-label="Assignment title" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Causes of World War I" className="mt-1" />
        </label>
        <div className="mt-4">
          <ProjectEditor value={project} onChange={setProject} />
        </div>
        <details className="mt-4 rounded-xl border border-line px-3 py-2.5">
          <summary className="cursor-pointer text-sm font-medium">More options</summary>
          <label className="mt-3 flex items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5" checked={reflect} onChange={(e) => setReflect(e.target.checked)} data-testid="reflect-toggle" />
            <span>
              <span className="font-medium">Ask a reflection question when students turn in</span>
              <span className="block text-xs text-fg-subtle">Their answer shows on the receipt. It takes them half a minute and tells you a lot.</span>
            </span>
          </label>
          {reflect && (
            <Input aria-label="Reflection question" maxLength={300} value={reflection} onChange={(e) => setReflection(e.target.value)} className="mt-2" />
          )}
        </details>
        {err && <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy} data-testid="create-assignment">
            {busy ? "Creating…" : "Create assignment"}
          </Button>
        </div>
      </form>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Edit times" onClick={(e) => e.stopPropagation()} className="pop w-full max-w-md rounded-[24px] border border-line bg-surface p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.4)]" data-testid="edit-times-dialog">
        <h2 className="text-xl font-semibold tracking-tight">Times for {a.title}</h2>
        <p className="mt-1 text-sm text-fg-muted">Changes apply to everyone right away. Students you gave extra time keep it.</p>
        <label className="mt-4 block text-sm font-medium">
          Due
          <input type="datetime-local" aria-label="Due date for everyone" value={toLocalInput(dueAt)} onChange={(e) => setDueAt(fromLocalInput(e.target.value) ?? undefined)} className="mt-1 w-full rounded-xl border border-line-strong bg-transparent px-3 py-2 text-sm" />
        </label>
        <div className="mt-4">
          <ScheduleEditor value={schedule} onChange={setSchedule} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy} data-testid="save-times">
            {busy ? "Saving…" : "Save for everyone"}
          </Button>
        </div>
      </div>
    </div>
  );
}

type ClassTimeRequest = TimeRequest & { assignment: string; assignmentId: string; group: string; room: string };

/** Students asking for more time: approve gives exactly what they asked for. */
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
    <section className="mt-6 rounded-[20px] border border-line bg-surface p-4" data-testid="time-requests">
      <h2 className="text-sm font-semibold">Needs your answer: {list.length} request{list.length === 1 ? "" : "s"} for more time</h2>
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
    <section className="mt-6 rounded-[20px] border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20" data-testid="reports">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
        <Flag className="h-4 w-4" /> {reports.length} reported message{reports.length === 1 ? "" : "s"}
      </h2>
      <p className="mt-0.5 text-xs text-amber-900/80 dark:text-amber-200/80">A student sent you these from their group's chat. You only see the message they reported.</p>
      <ul className="mt-3 space-y-2">
        {reports.map((r) => (
          <li key={r.room + r.id} className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm" data-testid="report">
            <div className="text-xs text-fg-subtle">
              {r.assignment} · {r.group} · reported by {r.byName}, {timeAgo(r.at)}
            </div>
            <blockquote className="mt-1.5 border-l-2 border-line-strong pl-3">
              <span className="font-medium">{r.message.authorName}{r.message.fromAi ? " (Huddle AI)" : ""}:</span> {r.message.content}
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
  if (!account.user) return <TeacherShell><SignInFirst /></TeacherShell>;
  if (err) return <TeacherShell back={{ to: "/classes", label: "Classes" }}><p className="p-8 text-sm text-fg-muted">{err}</p></TeacherShell>;
  if (!view) return <TeacherShell back={{ to: "/classes", label: "Classes" }}><p className="p-8 text-sm text-fg-subtle">Loading…</p></TeacherShell>;
  return (
    <TeacherShell back={{ to: "/classes", label: "Classes" }}>
      <div className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-8">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="class-name">{view.class.name}</h1>
            <p className="mt-1 text-sm text-fg-muted">{view.students.length} students joined</p>
          </div>
          <div className="rounded-2xl border border-line px-4 py-2.5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Class code</div>
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
              href={classroomShareUrl(link, `Join ${view.class.name} on Huddle`, "Open the link and type your name to join the class. Your group projects will show up there.")}
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
        <TimeRequestsSection classId={view.class.id} onChange={load} />

        <div className="mt-8 flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-subtle">Assignments</h2>
          <span className="flex-1" />
          <Button onClick={() => setNewA(true)} disabled={!view.students.length} data-testid="new-assignment-btn" title={view.students.length ? undefined : "Share the class code first: groups are made from the students who joined."}>
            <Plus className="h-4 w-4" /> New assignment
          </Button>
        </div>
        {!view.students.length && <p className="mt-2 text-sm text-fg-subtle">Share the class link with your students. Once they've joined, you can make a group assignment.</p>}
        <div className="mt-3 space-y-4">
          {view.assignments.map((a) => (
            <AssignmentSection key={a.id} a={a} view={view} reload={load} />
          ))}
        </div>

        <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-fg-subtle">Students</h2>
        <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="roster">
          {view.students.map((s) => (
            <li key={s.uid} className="flex items-center gap-1 rounded-full border border-line py-1 pl-3 pr-1 text-sm">
              {s.name}
              <button
                onClick={async () => {
                  if (!confirm(`Remove ${s.name} from this class? They'll be taken out of their groups and can't get back into the group rooms.`)) return;
                  await api(`/api/classes/${view.class.id}/students/${encodeURIComponent(s.uid)}`, { method: "DELETE" });
                  load();
                }}
                className="press rounded-full p-0.5 text-fg-subtle hover:bg-surface-2 hover:text-fg"
                aria-label={`Remove ${s.name}`}
                data-testid="remove-student"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {!view.students.length && <li className="text-sm text-fg-subtle">Nobody yet.</li>}
        </ul>

        <section className="mt-12 rounded-[20px] border border-line p-4">
          <h2 className="text-sm font-semibold">Erase this class</h2>
          <p className="mt-0.5 text-xs text-fg-subtle">Deletes every group room (chats, files and uploads), the roster and all grades. This can't be undone. Download grades first.</p>
          <button
            onClick={async () => {
              const typed = prompt(`This permanently erases "${view.class.name}" and all of its students' work. Type the class name to confirm:`);
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
          students={view.students.length}
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

export { TeacherShell, SignInFirst, api };
