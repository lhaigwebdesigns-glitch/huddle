import { confirmDialog } from "../components/Dialogs";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, KeyRound, Plus, RotateCcw, X } from "lucide-react";
import { Markdown } from "../components/Markdown";
import { useAccount } from "../lib/account";
import { getIdentity } from "../lib/identity";
import { FilePanel } from "../components/FilePanel";
import { FileIcon } from "../components/FileIcon";
import { ReceiptDialog } from "../components/ReceiptDialog";
import { Button } from "../components/ui";
import { lateBy } from "../../shared/schedule";
import { gradeTotal, parseRubric, rubricMax, type GradeData, type GradingView, type RubricRow } from "../../shared/classes";
import type { FileKind } from "../../shared/files";
import type { RoomFile } from "../../shared/protocol";
import { SignInFirst, TeacherShell, api, StudentOnly } from "./Classes";

const STEPS = [1, 0.75, 0.5, 0.25, 0];

/** Rubric rows with one-click scores, the group total, optional per-student grades and a comment. */
function RubricGrader({ view, onSaved, onNext }: { view: GradingView; onSaved: () => void; onNext: () => void }) {
  const initial = view.group.grade;
  const [rows, setRows] = useState<RubricRow[]>(() => initial?.rows ?? parseRubric(view.assignment.project.rubric ?? ""));
  const [scores, setScores] = useState<(number | null)[]>(() => initial?.scores ?? rows.map(() => null));
  const [students, setStudents] = useState<Record<string, number>>(initial?.students ?? {});
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [status, setStatus] = useState("");
  const max = rubricMax(rows);
  const total = gradeTotal({ scores });
  const setRow = (i: number, patch: Partial<RubricRow>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setScore = (i: number, v: number | null) => setScores((s) => rows.map((_, j) => (j === i ? v : (s[j] ?? null))));
  const save = async (next = false) => {
    setStatus("Saving…");
    const body: Partial<GradeData> = { rows, scores: rows.map((_, i) => scores[i] ?? null), students, comment };
    const d = await api<{ ok: boolean }>(
      `/api/classes/${view.class.id}/assignments/${view.assignment.id}/groups/${view.group.roomCode}/grade`,
      { method: "PUT", body: JSON.stringify(body) },
    );
    setStatus(d.error ?? "Saved");
    if (d.error) return;
    if (next) onNext();
    else onSaved();
  };
  return (
    <section className="border-t border-line bg-surface px-4 py-4 sm:px-6" aria-label="Grade" data-testid="grader">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold">Rubric</h2>
        <span className="text-sm text-fg-muted tabular" data-testid="grade-total">
          {total ?? "–"} / {max}
        </span>
        <span className="flex-1" />
        <Button size="sm" variant="secondary" onClick={() => save()} data-testid="save-grade">
          Save
        </Button>
        <Button size="sm" onClick={() => save(true)} data-testid="save-next">
          Save & next
        </Button>
        {status && <span className="text-xs text-fg-subtle" role="status">{status}</span>}
      </div>
      <ul className="mt-3 space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2" data-testid="rubric-row">
            <input
              aria-label={`Rubric row ${i + 1} name`}
              value={r.label}
              onChange={(e) => setRow(i, { label: e.target.value })}
              className="min-w-[8rem] flex-1 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium hover:border-line focus:border-line-strong"
            />
            <div className="flex gap-1" role="group" aria-label={`Score for ${r.label}`}>
              {STEPS.map((f) => {
                const v = Math.round(r.max * f * 100) / 100;
                const on = scores[i] === v;
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setScore(i, v)}
                    className={`press min-w-[2.5rem] rounded-lg border px-2 py-1 text-xs tabular ${on ? "border-fg bg-primary text-primary-fg" : "border-line-strong hover:bg-surface-2"}`}
                    data-testid="score-step"
                  >
                    {v}
                  </button>
                );
              })}
            </div>
            <input
              type="number"
              aria-label={`Exact score for ${r.label}`}
              value={scores[i] ?? ""}
              min={0}
              max={r.max}
              onChange={(e) => setScore(i, e.target.value === "" ? null : Number(e.target.value))}
              className="w-16 rounded-lg border border-line-strong bg-transparent px-2 py-1 text-xs tabular"
            />
            <span className="text-xs text-fg-subtle">of</span>
            <input
              type="number"
              aria-label={`Points for ${r.label}`}
              value={r.max}
              min={1}
              onChange={(e) => setRow(i, { max: Math.max(1, Number(e.target.value) || 1) })}
              className="w-14 rounded-lg border border-line bg-transparent px-2 py-1 text-xs tabular"
            />
            {rows.length > 1 && (
              <button
                onClick={() => {
                  setRows((x) => x.filter((_, j) => j !== i));
                  setScores((s) => s.filter((_, j) => j !== i));
                }}
                className="press rounded-md p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg"
                aria-label={`Remove ${r.label}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <button
        onClick={() => {
          setRows((r) => [...r, { label: "New row", max: 10 }]);
          setScores((s) => [...s, null]);
        }}
        className="press mt-2 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
      >
        <Plus className="h-3.5 w-3.5" /> Add a row
      </button>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Each student</h3>
          <p className="mt-0.5 text-xs text-fg-subtle">Everyone gets the group grade unless you set a different one.</p>
          <ul className="mt-2 space-y-1.5">
            {view.group.members.map((uid) => (
              <li key={uid} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{view.names[uid] ?? "Someone"}</span>
                <input
                  type="number"
                  aria-label={`Grade for ${view.names[uid] ?? "student"}`}
                  placeholder={total === null ? "–" : String(total)}
                  value={students[uid] ?? ""}
                  min={0}
                  max={max}
                  onChange={(e) =>
                    setStudents((s) => {
                      const next = { ...s };
                      if (e.target.value === "") delete next[uid];
                      else next[uid] = Number(e.target.value);
                      return next;
                    })
                  }
                  className="w-20 rounded-lg border border-line-strong bg-transparent px-2 py-1 text-xs tabular"
                  data-testid="student-grade"
                />
                <span className="text-xs text-fg-subtle">/ {max}</span>
              </li>
            ))}
          </ul>
        </div>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Comment for the group</span>
          <textarea
            value={comment}
            maxLength={2000}
            rows={4}
            onChange={(e) => setComment(e.target.value)}
            className="mt-2 w-full rounded-xl border border-line-strong bg-transparent px-3 py-2 text-sm outline-none focus:border-fg/40"
            data-testid="grade-comment"
          />
        </label>
      </div>
    </section>
  );
}

/** /classes/:id/a/:aid/:room: grade one group's turned-in work. */
export default function Grading() {
  const { id = "", aid = "", room = "" } = useParams();
  const account = useAccount();
  const nav = useNavigate();
  const [view, setView] = useState<GradingView | null>(null);
  const [err, setErr] = useState("");
  const [fileId, setFileId] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);
  /** The right side shows the work record, or the answer key next to the student's file. */
  const [side, setSide] = useState<"receipt" | "key">("receipt");
  /** Save & next: go to the next turned-in work that isn't graded yet, or say everything is done. */
  const goNext = async () => {
    const d = await api<{ next: string | null }>(`/api/classes/${id}/assignments/${aid}/next-to-grade?after=${room}`);
    if (d.next) return nav(`/classes/${id}/a/${aid}/${d.next}`);
    setAllDone(true);
    load();
  };
  const load = () =>
    api<GradingView>(`/api/classes/${id}/assignments/${aid}/groups/${room}`).then((d) => {
      if (d.error) return setErr(d.error);
      setView(d);
      setFileId((f) => f ?? d.files[0]?.id ?? null);
    });
  useEffect(() => {
    if (!account.user) return;
    setView(null);
    setFileId(null);
    setAllDone(false);
    load();
  }, [account.user, id, aid, room]);
  const me = useMemo(() => getIdentity(), []);
  const back = { to: `/classes/${id}`, label: "Class" };
  if (!account.user) return <TeacherShell back={back}><SignInFirst /></TeacherShell>;
  if (account.user.role === "student") return <TeacherShell back={back}><StudentOnly /></TeacherShell>;
  if (err) return <TeacherShell back={back}><p className="p-8 text-sm text-fg-muted">{err}</p></TeacherShell>;
  if (!view) return <TeacherShell back={back}><p className="p-8 text-sm text-fg-subtle">Loading…</p></TeacherShell>;
  const idx = view.order.indexOf(room);
  const prev = idx > 0 ? view.order[idx - 1] : null;
  const next = idx >= 0 && idx < view.order.length - 1 ? view.order[idx + 1] : null;
  const file = view.files.find((f) => f.id === fileId);
  const roomFile: RoomFile | undefined = file && { id: file.id, title: file.title, kind: file.kind as FileKind, createdAt: 0, createdBy: "" };
  const turnedIn = !!view.group.status?.turnedInAt;
  return (
    <TeacherShell back={back}>
      <div className="flex min-h-full flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-fg-subtle">{view.assignment.title}</div>
            <h1 className="text-xl font-semibold tracking-tight" data-testid="grading-title">
              {view.assignment.mode === "solo"
                ? view.group.members.map((u) => view.names[u] ?? "Someone").join(", ") || view.group.name
                : `${view.group.name}: ${view.group.members.map((u) => view.names[u] ?? "Someone").join(", ") || "no students"}`}
            </h1>
            {view.group.status?.turnedInAt && (
              <p className="mt-0.5 text-xs text-fg-muted" data-testid="late-note">
                {(() => {
                  const late = lateBy(view.group.status.turnedInAt, view.group.status.dueAt);
                  const hours = Math.round(late / 3_600_000);
                  const when = late ? (hours >= 24 ? `${Math.round(hours / 24)} day${hours >= 36 ? "s" : ""} late` : `${Math.max(1, hours)} hour${hours > 1 ? "s" : ""} late`) : "on time";
                  return `Turned in ${when}${view.group.status.extended ? " (with an extension)" : ""}`;
                })()}
              </p>
            )}
          </div>
          {turnedIn && (
            <button
              onClick={async () => {
                if (
                  !(await confirmDialog({
                    title: "Send it back?",
                    message: "Their files unlock so they can make changes, and they'll turn it in again.",
                    confirmLabel: "Send back",
                  }))
                )
                  return;
                await api(`/api/classes/${id}/assignments/${aid}/groups/${room}/reopen`, { method: "POST" });
                load();
              }}
              className="press flex items-center gap-1 rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
              data-testid="teacher-reopen"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Send back
            </button>
          )}
          <button disabled={!prev} onClick={() => prev && nav(`/classes/${id}/a/${aid}/${prev}`)} className="press rounded-lg p-1.5 text-fg-muted hover:bg-surface-2 disabled:opacity-30" aria-label="Previous group">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button disabled={!next} onClick={() => next && nav(`/classes/${id}/a/${aid}/${next}`)} className="press rounded-lg p-1.5 text-fg-muted hover:bg-surface-2 disabled:opacity-30" aria-label="Next group" data-testid="next-group">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {!turnedIn ? (
          <div className="mx-auto mt-16 max-w-md px-6 text-center">
            <h2 className="text-lg font-semibold">Not turned in yet</h2>
            <p className="mt-2 text-sm text-fg-muted">
              You'll see the group's files and contribution receipt here once they turn the project in. Until then you see progress only: tasks {view.group.status?.tasksDone ?? 0}/
              {view.group.status?.tasksTotal ?? 0}. Their chat stays private to the group.
            </p>
            <Link to={`/classes/${id}`} className="mt-4 inline-block text-sm text-fg-muted underline hover:text-fg">
              Back to the class
            </Link>
          </div>
        ) : (
          <>
            {/* Fixed-height panes that scroll inside; the page itself scrolls on small screens. */}
            <div className="grid lg:h-[calc(100vh-15rem)] lg:min-h-[420px] lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="flex h-[65vh] min-w-0 flex-col border-line lg:h-auto lg:min-h-0 lg:border-r">
                <div className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2" role="tablist" aria-label="Files">
                  {view.files.map((f) => (
                    <button
                      key={f.id}
                      role="tab"
                      aria-selected={f.id === fileId}
                      onClick={() => setFileId(f.id)}
                      className={`press flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm ${f.id === fileId ? "bg-surface-2 font-medium" : "text-fg-muted hover:bg-surface-2"}`}
                    >
                      <FileIcon kind={f.kind as FileKind} className="h-4 w-4" /> {f.title}
                    </button>
                  ))}
                  {!view.files.length && <span className="px-2 text-sm text-fg-subtle">The group made no files.</span>}
                </div>
                <div className="min-h-0 flex-1">
                  {roomFile && <FilePanel key={roomFile.id} room={room} file={roomFile} me={me} onClose={() => setFileId(null)} onRename={() => {}} locked />}
                </div>
              </div>
              <aside className="flex h-[70vh] min-w-0 flex-col overflow-hidden border-t border-line lg:h-auto lg:min-h-0 lg:border-t-0">
                {view.answerKey && (
                  <div className="flex shrink-0 gap-1 border-b border-line px-3 py-2" role="tablist" aria-label="Beside the work">
                    {(
                      [
                        ["receipt", "Work record"],
                        ["key", "Answer key"],
                      ] as const
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        role="tab"
                        aria-selected={side === k}
                        onClick={() => setSide(k)}
                        className={`press flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm ${side === k ? "bg-surface-2 font-medium" : "text-fg-muted hover:bg-surface-2"}`}
                        data-testid={k === "key" ? "answer-key-tab" : "receipt-tab"}
                      >
                        {k === "key" && <KeyRound className="h-3.5 w-3.5" aria-hidden />} {label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {side === "key" && view.answerKey ? (
                    <div className="px-5 py-4" data-testid="answer-key">
                      <p className="text-xs text-fg-subtle">Only you see this. Edit it from the worksheet on the class page.</p>
                      <div className="prose prose-zinc mt-2 max-w-none text-sm dark:prose-invert">
                        <Markdown text={view.answerKey.markdown || "The answer key is empty."} />
                      </div>
                    </div>
                  ) : view.receipt ? (
                    <ReceiptDialog embedded receipt={view.receipt} meUid="" isHost mode="view" send={() => {}} onClose={() => {}} />
                  ) : (
                    <p className="p-6 text-sm text-fg-subtle">No receipt was saved for this group.</p>
                  )}
                </div>
              </aside>
            </div>
            {allDone && (
              <div className="border-t border-line bg-mint px-4 py-3 text-sm text-ink dark:bg-mint/15 dark:text-mint sm:px-6" role="status" data-testid="all-graded">
                All turned-in work is graded.{" "}
                <Link to={`/classes/${id}`} className="font-medium underline underline-offset-2">
                  Back to the class
                </Link>{" "}
                to download the grades.
              </div>
            )}
            <RubricGrader key={room} view={view} onSaved={load} onNext={() => void goNext()} />
          </>
        )}
      </div>
    </TeacherShell>
  );
}
