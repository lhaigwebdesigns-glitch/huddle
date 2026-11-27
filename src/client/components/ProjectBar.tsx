import { confirmDialog } from "./Dialogs";
import { Modal } from "./Modal";
import { useEffect, useState } from "react";
import { CalendarClock, Clock, Info, ListChecks, Lock, ReceiptText, RotateCcw, Send, Sparkles } from "lucide-react";
import { dueFor } from "../../shared/schedule";
import type { ClientMsg, ProjectSettings, TaskBoard } from "../../shared/protocol";
import { TaskPanel } from "./TaskPanel";

const AI_LABEL: Record<ProjectSettings["ai"], string> = { off: "AI off", tutor: "Tutor only", full: "AI: full help" };
const AI_HINT: Record<ProjectSettings["ai"], string> = {
  off: "Your teacher turned the AI off for this project.",
  tutor: "The AI can explain and give hints, but won't write the work for you.",
  full: "The AI can research, write and make files with your group.",
};

function dueLabel(ms: number, now = Date.now()) {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  const day = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

/** The assignment, pinned above the chat: due date, AI rule, instructions, rubric and Turn in. */
export function ProjectBar({
  project,
  title,
  isHost,
  send,
  onReceipt,
  onDetails,
  solo = false,
  board,
  meUid,
}: {
  project: ProjectSettings;
  title: string;
  isHost: boolean;
  send: (m: ClientMsg) => void;
  board?: TaskBoard;
  meUid: string;
  /** Open the contribution receipt: to look at it, or as the last step before turning in. */
  onReceipt: (mode: "view" | "turnin") => void;
  /** Open the assignment details (instructions, rubric and rules) in the big modal. */
  onDetails: () => void;
  /** A student's own room: tasks are steps, with no roles or owners. */
  solo?: boolean;
}) {
  const [tasksOpen, setTasksOpen] = useState(false);
  const tasks = board?.tasks ?? [];
  const mineLeft = tasks.filter((t) => t.ownerUid === meUid && !t.done).length;
  const due = dueFor(project.dueAt, project.access);
  const overdue = !!due && due < Date.now() && !project.turnedInAt;
  const [asking, setAsking] = useState(false);
  // Remember (on this device) that this room asked, until the teacher answers (the room's access changes).
  const askedKey = `cairn.askedTime.${location.pathname}`;
  const accessNow = JSON.stringify(project.access ?? null);
  const [asked, setAsked] = useState(() => {
    try {
      const [was, at] = (localStorage.getItem(askedKey) ?? "").split("|");
      // Until the teacher answers, or a day goes by (a "no" doesn't change anything here, so they can ask again).
      return was === accessNow && Date.now() - Number(at) < 86_400_000;
    } catch {
      return false;
    }
  });
  const markAsked = () => {
    try {
      localStorage.setItem(askedKey, `${accessNow}|${Date.now()}`);
    } catch {
      /* private mode */
    }
    setAsked(true);
  };
  useEffect(() => {
    // The teacher answered (more time, or a new due date): the ask is done.
    try {
      const was = localStorage.getItem(askedKey)?.split("|")[0];
      if (was !== undefined && was !== accessNow) (localStorage.removeItem(askedKey), setAsked(false));
    } catch {
      /* private mode */
    }
  }, [accessNow, askedKey]);
  const status = project.status;
  // Students can ask for more time on a timed assignment or once it's nearly (or already) due.
  const canAsk = !isHost && !project.turnedInAt && (!!project.schedule || (!!due && due - Date.now() < 2 * 86_400_000));
  return (
    <div className="mx-auto mt-2 w-[calc(100%-1.5rem)] max-w-4xl rounded-2xl border border-line bg-surface" data-testid="project-bar" aria-label={`Assignment: ${title}`}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-4 py-2.5">
        {due && (
          <span className={`flex items-center gap-1 text-xs tabular ${overdue ? "font-medium text-red-600 dark:text-red-400" : "text-fg-muted"}`} data-testid="due-label">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            {overdue ? "Was due" : "Due"} {dueLabel(due)}
            {project.access?.dueAt && <span className="font-normal text-fg-subtle">(extended)</span>}
          </span>
        )}
        {status && !project.turnedInAt && (
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.open ? "bg-mint text-ink dark:bg-mint/15 dark:text-mint" : "bg-surface-2 text-fg-muted"}`}
            data-testid="access-chip"
          >
            <Clock className="h-3 w-3" aria-hidden />
            {status.open
              ? `Open${status.nextChange ? ` until ${dueLabel(status.nextChange)}` : ""}`
              : status.reason === "due"
                ? "Closed: past the due date"
                : `Closed${status.nextChange ? ` · opens ${dueLabel(status.nextChange)}` : ""}`}
          </span>
        )}
        <span
          className="flex items-center gap-1 rounded-full border border-line-strong px-2 py-0.5 text-xs font-medium"
          title={AI_HINT[project.ai]}
          data-testid="ai-chip"
        >
          <Sparkles className="h-3 w-3" aria-hidden />
          {AI_LABEL[project.ai]}
        </span>
        <span className="flex-1" />
        {board && (
          <button
            onClick={() => setTasksOpen((o) => !o)}
            aria-expanded={tasksOpen}
            className="press flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
            data-testid="tasks-toggle"
            data-tour="room-tasks"
          >
            <ListChecks className="h-3.5 w-3.5" aria-hidden />
            {solo ? "Steps" : "Tasks"} {tasks.length > 0 && <span className="tabular">{tasks.filter((t) => t.done).length}/{tasks.length}</span>}
            {mineLeft > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-fg">{mineLeft} yours</span>}
          </button>
        )}
        <button
          onClick={onDetails}
          aria-haspopup="dialog"
          className="press flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-fg-muted hover:bg-surface-2 hover:text-fg"
          data-testid="project-details-toggle"
        >
          <Info className="h-3.5 w-3.5" aria-hidden /> Instructions & rubric
        </button>
        {canAsk && asked && (
          <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg-muted" data-testid="asked-time">
            <Clock className="h-3.5 w-3.5" aria-hidden /> Asked for more time
          </span>
        )}
        {canAsk && !asked && (
          <button
            onClick={() => setAsking(true)}
            className="press flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
            data-testid="ask-more-time"
          >
            <Clock className="h-3.5 w-3.5" aria-hidden /> More time
          </button>
        )}
        {/* The teacher only gets the receipt once the group turns the project in. */}
        {(!isHost || project.turnedInAt) && (
          <button
            onClick={() => onReceipt("view")}
            className="press flex items-center gap-1 rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
            data-testid="open-receipt"
          >
            <ReceiptText className="h-3.5 w-3.5" /> Receipt
          </button>
        )}
        {project.turnedInAt ? (
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-fg-muted" data-testid="turned-in">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Turned in{project.turnedInBy ? ` by ${project.turnedInBy}` : ""}, {dueLabel(project.turnedInAt)}
            </span>
            {isHost && (
              <button
                onClick={async () =>
                  (await confirmDialog({ title: "Reopen this project?", message: "The group will be able to edit its files again.", confirmLabel: "Reopen" })) && send({ t: "reopen" })
                }
                className="press flex items-center gap-1 rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
                data-testid="reopen"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reopen
              </button>
            )}
            {!isHost && !project.gradedAt && project.status?.open !== false && (
              <button
                onClick={async () =>
                  (await confirmDialog({
                    title: "Unsubmit?",
                    message: "Your files unlock so you can keep working. Your teacher sees it as not turned in until you turn it in again.",
                    confirmLabel: "Unsubmit",
                  })) && send({ t: "unsubmit" })
                }
                className="press flex items-center gap-1 rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
                data-testid="unsubmit"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Unsubmit
              </button>
            )}
          </span>
        ) : (
          <button
            onClick={() => onReceipt("turnin")}
            className="press flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
            data-testid="turn-in"
            data-tour="room-turnin"
          >
            <Send className="h-3.5 w-3.5" /> Turn in
          </button>
        )}
      </div>
      {tasksOpen && board && (
        <div className="max-h-[45vh] overflow-y-auto border-t border-line px-4 py-3">
          <TaskPanel board={board} meUid={meUid} locked={!!project.turnedInAt || status?.open === false} send={send} solo={solo} />
        </div>
      )}
      {asking && (
        <TimeRequestDialog
          closed={status?.open === false && status.reason === "schedule"}
          send={(m) => {
            send(m);
            markAsked();
          }}
          onClose={() => setAsking(false)}
        />
      )}
    </div>
  );
}

/** Ask the teacher for more time: work now for an hour, or a later due date. */
function TimeRequestDialog({ closed, send, onClose }: { closed: boolean; send: (m: ClientMsg) => void; onClose: () => void }) {
  const [kind, setKind] = useState<"open" | "extend">(closed ? "open" : "extend");
  const [days, setDays] = useState(1);
  const [reason, setReason] = useState("");
  const choice = "choice-card bg-bg px-5 py-4 text-left";
  return (
    <Modal
      size="md"
      title="Ask for more time"
      subtitle="Your teacher will see this and can say yes or no."
      onClose={onClose}
      testId="time-request-dialog"
      onSubmit={(e) => {
        e.preventDefault();
        if (!reason.trim()) return;
        send({ t: "time_request", kind, ...(kind === "extend" ? { days } : {}), reason: reason.trim() });
        onClose();
      }}
      footer={
        <>
          <button type="button" onClick={onClose} className="press rounded-xl px-4 py-2 font-medium text-fg-muted hover:bg-surface-2 hover:text-fg">
            Cancel
          </button>
          <span className="flex-1" />
          <button type="submit" disabled={!reason.trim()} className="ledge-btn min-w-[200px]" data-testid="send-time-request">
            Send to my teacher
          </button>
        </>
      }
    >
      <div className="space-y-7">
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="What you need">
          <button type="button" role="radio" aria-checked={kind === "open"} onClick={() => setKind("open")} className={choice} data-testid="ask-open">
            <div className="text-[1.05rem] font-semibold">Let me work on it now</div>
            <div className="mt-1 text-sm text-fg-muted">Opens it for you for an hour.</div>
          </button>
          <button type="button" role="radio" aria-checked={kind === "extend"} onClick={() => setKind("extend")} className={choice} data-testid="ask-extend">
            <div className="text-[1.05rem] font-semibold">A later due date</div>
            <div className="mt-2 text-sm text-fg-muted">
              <label>
                <select aria-label="How many more days" value={days} onChange={(e) => setDays(Number(e.target.value))} onClick={(e) => e.stopPropagation()} className="rounded-lg border border-line-strong bg-transparent px-2 py-1">
                  {[1, 2, 3, 5, 7].map((d) => (
                    <option key={d} value={d}>
                      {d} more day{d === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </button>
        </div>
        <label className="block">
          <span className="text-[15px] font-semibold">Why do you need it?</span>
          <textarea
            required
            maxLength={300}
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. I was absent on Tuesday"
            className="mt-2 w-full rounded-2xl border border-line-strong bg-bg px-4 py-3 text-[15px] outline-none focus:border-fg focus:ring-4 focus:ring-fg/10"
            data-testid="time-reason"
          />
        </label>
      </div>
    </Modal>
  );
}
