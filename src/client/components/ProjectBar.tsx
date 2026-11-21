import { useState } from "react";
import { BookOpen, CalendarClock, ChevronDown, ListChecks, Lock, ReceiptText, RotateCcw, Send, Sparkles } from "lucide-react";
import type { ClientMsg, ProjectSettings, TaskBoard } from "../../shared/protocol";
import { TaskPanel } from "./TaskPanel";
import { Markdown } from "./Markdown";

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
}) {
  const [open, setOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const tasks = board?.tasks ?? [];
  const mineLeft = tasks.filter((t) => t.ownerUid === meUid && !t.done).length;
  const overdue = !!project.dueAt && project.dueAt < Date.now() && !project.turnedInAt;
  const hasDetails = !!(project.instructions.trim() || project.rubric.trim());
  return (
    <div className="mx-auto mt-2 w-[calc(100%-1.5rem)] max-w-3xl rounded-2xl border border-line bg-surface" data-testid="project-bar">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
        <BookOpen className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
        <span className="min-w-0 truncate text-sm font-semibold">{title}</span>
        {project.dueAt && (
          <span className={`flex items-center gap-1 text-xs tabular ${overdue ? "font-medium text-red-600 dark:text-red-400" : "text-fg-muted"}`}>
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            {overdue ? "Was due" : "Due"} {dueLabel(project.dueAt)}
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
          >
            <ListChecks className="h-3.5 w-3.5" aria-hidden />
            Tasks {tasks.length > 0 && <span className="tabular">{tasks.filter((t) => t.done).length}/{tasks.length}</span>}
            {mineLeft > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-fg">{mineLeft} yours</span>}
          </button>
        )}
        {hasDetails && (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="press flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
            data-testid="project-details-toggle"
          >
            Instructions & rubric <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
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
                onClick={() => confirm("Reopen this project? The group will be able to edit its files again.") && send({ t: "reopen" })}
                className="press flex items-center gap-1 rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
                data-testid="reopen"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reopen
              </button>
            )}
          </span>
        ) : (
          <button
            onClick={() => onReceipt("turnin")}
            className="press flex items-center gap-1 rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-fg hover:bg-primary-hover"
            data-testid="turn-in"
          >
            <Send className="h-3.5 w-3.5" /> Turn in
          </button>
        )}
      </div>
      {tasksOpen && board && (
        <div className="max-h-[45vh] overflow-y-auto border-t border-line px-4 py-3">
          <TaskPanel board={board} meUid={meUid} locked={!!project.turnedInAt} send={send} />
        </div>
      )}
      {open && hasDetails && (
        <div className="max-h-[40vh] space-y-3 overflow-y-auto border-t border-line px-4 py-3 text-sm" data-testid="project-details">
          <p className="text-xs text-fg-subtle">{AI_HINT[project.ai]}</p>
          {project.instructions.trim() && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Instructions</h3>
              <div className="mt-1">
                <Markdown text={project.instructions} />
              </div>
            </section>
          )}
          {project.rubric.trim() && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Rubric</h3>
              <div className="mt-1">
                <Markdown text={project.rubric} />
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
