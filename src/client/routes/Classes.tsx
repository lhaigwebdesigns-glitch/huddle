import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Copy, Download, GraduationCap, Plus, Users, X } from "lucide-react";
import { useAccount, signInUrl } from "../lib/account";
import { Button, Input, Logo, ThemeToggle } from "../components/ui";
import { formatCode } from "../../shared/code";
import { timeAgo } from "../components/PartyLists";
import { EMPTY_PROJECT, ProjectEditor, type ProjectDraft } from "../components/ProjectEditor";
import { PROJECT_TEMPLATES } from "../../shared/templates";
import { FILE_INFO } from "../../shared/files";
import { gradeTotal, rubricMax, type Assignment, type ClassInfo, type ClassView, type GroupInfo } from "../../shared/classes";

async function api<T>(url: string, init?: RequestInit): Promise<T & { error?: string }> {
  const r = await fetch(url, init?.body ? { ...init, headers: { "content-type": "application/json", ...init.headers } } : init);
  return (await r.json().catch(() => ({ error: "Something went wrong." }))) as T & { error?: string };
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
      <p className="mt-2 text-sm text-fg-muted">Teachers need an account. Students join with a class code, no account needed.</p>
      <div className="mt-5 flex flex-col gap-2">
        {account.providers.map((p) => (
          <a key={p} href={signInUrl(p, location.pathname)} className="press rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover">
            Continue with {p === "google" ? "Google" : p === "github" ? "GitHub" : p}
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

function GroupCard({ g, names, gradeUrl }: { g: GroupInfo; names: Record<string, string>; gradeUrl: string }) {
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
      {g.status?.turnedInAt && (
        <Link to={gradeUrl} className="press mt-2.5 inline-flex rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-fg hover:bg-primary-hover" data-testid="grade-group">
          {g.grade ? "Review grade" : "Grade"}
        </Link>
      )}
    </li>
  );
}

function AssignmentSection({ a, view, reload }: { a: Assignment; view: ClassView; reload: () => void }) {
  const names = Object.fromEntries(view.students.map((s) => [s.uid, s.name]));
  const grouped = new Set(a.groups.flatMap((g) => g.members));
  const ungrouped = view.students.filter((s) => !grouped.has(s.uid));
  const [manage, setManage] = useState(false);
  const move = async (uid: string, room: string | null) => {
    await api(`/api/classes/${view.class.id}/assignments/${a.id}/move`, { method: "POST", body: JSON.stringify({ uid, room }) });
    reload();
  };
  const turned = a.groups.filter((g) => g.status?.turnedInAt).length;
  return (
    <section className="rounded-[20px] border border-line bg-surface p-4" data-testid="assignment">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold tracking-tight">{a.title}</h3>
        {a.project.dueAt && <span className="text-xs text-fg-subtle">Due {new Date(a.project.dueAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>}
        <span className="text-xs text-fg-subtle">
          · {turned} of {a.groups.length} turned in
        </span>
        <span className="flex-1" />
        <button onClick={() => setManage((m) => !m)} aria-pressed={manage} className="press rounded-lg px-2.5 py-1 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg">
          <Users className="mr-1 inline h-3.5 w-3.5" /> {manage ? "Done" : "Move students"}
        </button>
        <a href={`/api/classes/${view.class.id}/assignments/${a.id}/grades.csv`} className="press rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium hover:bg-surface-2" data-testid="export-csv">
          <Download className="mr-1 inline h-3.5 w-3.5" /> Grades CSV
        </a>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {a.groups.map((g) => (
          <GroupCard key={g.roomCode} g={g} names={names} gradeUrl={`/classes/${view.class.id}/a/${a.id}/${g.roomCode}`} />
        ))}
      </ul>
      {(manage || ungrouped.length > 0) && (
        <div className="mt-3 rounded-xl border border-line px-3 py-2.5 text-sm">
          {ungrouped.length > 0 && <p className="text-xs font-medium text-fg-muted">Not in a group yet: {ungrouped.map((s) => s.name).join(", ")}</p>}
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
    </section>
  );
}

function NewAssignmentDialog({ classId, students, onDone, onClose }: { classId: string; students: number; onDone: () => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [project, setProject] = useState<ProjectDraft>(EMPTY_PROJECT);
  const [size, setSize] = useState(3);
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
      body: JSON.stringify({ title: title.trim(), project, groupSize: size, ...(templateId ? { template: templateId } : {}) }),
    });
    setBusy(false);
    if (d.error || !d.id) return setErr(d.error ?? "Couldn't create the assignment.");
    onDone();
  };
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
          <h2 className="text-xl font-semibold tracking-tight">New group assignment</h2>
          <button type="button" onClick={onClose} className="press rounded-full p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-fg-muted">Every group gets its own project room with these rules. You'll see progress and grade turned-in work here, never their chat.</p>
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
              Each group gets {template.files.map((f) => `${f.title} (${FILE_INFO[f.kind].label.toLowerCase()})`).join(" and ")}, plus {template.tasks.length} starter tasks.
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
        <label className="mt-4 flex items-center gap-2 text-sm">
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
            → {groups} group{groups === 1 ? "" : "s"} for {students} student{students === 1 ? "" : "s"}, picked at random. You can move people after.
          </span>
        </label>
        {err && <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy} data-testid="create-assignment">
            {busy ? "Creating rooms…" : "Create assignment"}
          </Button>
        </div>
      </form>
    </div>
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
          </div>
        </div>

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
            <li key={s.uid} className="rounded-full border border-line px-3 py-1 text-sm">
              {s.name}
            </li>
          ))}
          {!view.students.length && <li className="text-sm text-fg-subtle">Nobody yet.</li>}
        </ul>
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
