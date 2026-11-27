import { useState } from "react";
import { Bot, CalendarClock, FileText, Presentation, User, Users } from "lucide-react";
import type { RoomFile, RubricGrid } from "../../shared/protocol";
import { RubricGridView } from "./RubricGrid";
import { getIdentity } from "../lib/identity";
import { FilePanel } from "./FilePanel";
import { Modal } from "./Modal";

/** What the AI setting means, in the words a student reads. */
const AI_FOR_STUDENTS: Record<string, { title: string; body: string }> = {
  off: { title: "AI is off", body: "You work without the AI on this assignment. You can still chat with your group." },
  tutor: { title: "Tutor only", body: "Stuck? The AI tutor explains and asks you questions, but it won't do the work for you." },
  full: { title: "Full AI help", body: "The AI can help with anything here, including writing. What it writes is labeled as the AI's." },
};

/**
 * "Preview as a student": what each student gets when they open the assignment link, before the
 * teacher posts it. Read-only: nothing here changes the assignment.
 */
export function StudentPreview({
  title,
  dueAt,
  mode,
  ai,
  instructions,
  rubric,
  rubricGrid,
  worksheetRoom,
  files,
  onClose,
}: {
  title: string;
  dueAt?: number;
  mode: "solo" | "groups";
  ai: string;
  instructions?: string;
  rubric?: string;
  rubricGrid?: RubricGrid | null;
  worksheetRoom?: string | null;
  files: RoomFile[];
  onClose: () => void;
}) {
  const [open, setOpen] = useState(files[0]?.id ?? "");
  const file = files.find((f) => f.id === open);
  const rule = AI_FOR_STUDENTS[ai] ?? AI_FOR_STUDENTS.tutor;
  const due = dueAt ? new Date(dueAt).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  return (
    <Modal title="Preview: what students see" subtitle="This is what each student gets when they open the link. It's read-only here, so nothing changes." onClose={onClose} tall testId="student-preview">
      <div className="grid h-full min-h-0 gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <aside className="space-y-5 overflow-y-auto">
          <div>
            <h3 className="font-display text-xl font-extrabold tracking-[-0.01em]">{title}</h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
              <span className="inline-flex items-center gap-1.5">
                {mode === "solo" ? <User className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                {mode === "solo" ? "Their own room" : "Their group's room"}
              </span>
              {due && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="h-4 w-4" /> Due {due}
                </span>
              )}
            </p>
          </div>
          <div className="rounded-2xl border border-peri/50 bg-peri/10 px-4 py-3" data-testid="preview-ai">
            <div className="flex items-center gap-2 text-[15px] font-semibold">
              <Bot className="h-4 w-4" /> {rule.title}
            </div>
            <p className="mt-1 text-sm text-fg-muted">{rule.body}</p>
          </div>
          <div>
            <div className="text-sm font-semibold">Instructions</div>
            <p className="mt-1 whitespace-pre-wrap text-[15px] text-fg-muted" data-testid="preview-instructions">
              {instructions?.trim() || "No instructions."}
            </p>
          </div>
          {rubricGrid ? (
            <div>
              <div className="text-sm font-semibold">How it's graded</div>
              <div className="mt-2">
                <RubricGridView grid={rubricGrid} />
              </div>
            </div>
          ) : (
            rubric?.trim() && (
              <div>
                <div className="text-sm font-semibold">How it's graded</div>
                <p className="mt-1 whitespace-pre-wrap text-[15px] text-fg-muted">{rubric}</p>
              </div>
            )
          )}
        </aside>
        <section className="flex min-h-[380px] flex-col overflow-hidden rounded-2xl border border-line">
          {files.length > 1 && (
            <div className="flex gap-1 border-b border-line px-3 py-2">
              {files.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setOpen(f.id)}
                  aria-pressed={f.id === open}
                  className={`press inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm ${f.id === open ? "bg-surface-2 font-medium" : "text-fg-muted hover:bg-surface-2"}`}
                >
                  {f.kind === "slides" ? <Presentation className="h-4 w-4" /> : <FileText className="h-4 w-4" />} {f.title}
                </button>
              ))}
            </div>
          )}
          <div className="min-h-0 flex-1" data-testid="preview-file">
            {worksheetRoom && file ? (
              <FilePanel bare locked room={worksheetRoom} file={file} me={getIdentity()} onClose={() => {}} onRename={() => {}} lockedNote="Students get their own copy of this, which they can edit." />
            ) : (
              <div className="grid h-full place-items-center p-8 text-center text-sm text-fg-muted">No worksheet: students start with an empty room, the tutor and the chat.</div>
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}
