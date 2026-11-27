import { ArrowRight, Bot, CalendarClock, ClipboardX, Clock, MessageCircleQuestion, User, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectSettings } from "../../shared/protocol";
import { dueFor, describeSchedule } from "../../shared/schedule";
import { parseRubric, rubricMax } from "../../shared/classes";
import { Markdown } from "./Markdown";
import { RubricGridView } from "./RubricGrid";
import { Modal } from "./Modal";

/** The AI rule, said to the student. */
const AI_RULE: Record<ProjectSettings["ai"], { title: string; body: string }> = {
  off: { title: "No AI on this one", body: "The AI is turned off. You can still chat with your group." },
  tutor: { title: "AI tutor only", body: "Stuck? Ask the tutor. It explains and asks you questions, but it won't write the work for you." },
  full: { title: "Full AI help", body: "The AI can research, write and make files with you. What it writes is labeled as the AI's." },
};

const when = (ms: number) => new Date(ms).toLocaleString([], { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Has this student already seen the brief for this room? (Shown once, by itself, the first time they open it.) */
export const briefSeen = (room: string) => {
  try {
    return localStorage.getItem("cairn.brief.seen") === "*" || localStorage.getItem(`cairn.brief.${room}`) === "1";
  } catch {
    return true;
  }
};
export const markBriefSeen = (room: string) => {
  try {
    localStorage.setItem(`cairn.brief.${room}`, "1");
  } catch {
    /* ignore */
  }
};

function Rule({ icon, title, children, tone = "plain", testId }: { icon: ReactNode; title: string; children: ReactNode; tone?: "plain" | "warn" | "ok"; testId?: string }) {
  const toneCls = tone === "warn" ? "border-red-300/70 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10" : tone === "ok" ? "border-primary/40 bg-mint/40 dark:bg-mint/10" : "border-line bg-bg";
  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneCls}`} data-testid={testId}>
      <div className="flex items-center gap-2 text-[15px] font-semibold">
        <span className="text-fg-muted">{icon}</span> {title}
      </div>
      <div className="mt-1 text-sm text-fg-muted">{children}</div>
    </div>
  );
}

/**
 * The assignment, all in one place: what to do, how it's graded, and the rules (due date, when
 * you can work, what the AI may do, pasting). Pops up the first time a student opens the room;
 * "Instructions & rubric" in the project bar opens it again.
 */
export function AssignmentBrief({ project, title, group, solo, onClose }: { project: ProjectSettings; title: string; group?: string; solo: boolean; onClose: () => void }) {
  const due = dueFor(project.dueAt, project.access);
  const late = !!due && due < Date.now() && !project.turnedInAt;
  const st = project.status;
  const ai = AI_RULE[project.ai];
  const rows = project.rubric.trim() ? parseRubric(project.rubric) : [];
  // parseRubric falls back to one "Overall" row when nothing has points: show the teacher's text then.
  const table = rows.length > 1 || (rows.length === 1 && rows[0].label !== "Overall");
  return (
    <Modal
      title={title}
      subtitle={`${solo ? "Your own work" : group ? `Group project · ${group}` : "Group project"}${due ? ` · ${late ? "Was due" : "Due"} ${new Date(due).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}`}
      onClose={onClose}
      closeLabel="Close the assignment details"
      testId="assignment-brief"
      footer={
        <>
          <span className="hidden text-sm text-fg-subtle sm:inline">You can open this again from Instructions &amp; rubric at the top of the room.</span>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="ledge-btn min-w-[200px]" autoFocus data-testid="brief-start">
            {project.turnedInAt ? "Got it" : st?.open === false ? "Got it" : "Start working"} <ArrowRight className="h-4 w-4" />
          </button>
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="min-w-0 space-y-8">
          <section>
            <h3 className="font-display text-lg font-bold tracking-[-0.01em]">What to do</h3>
            <div className="prose prose-zinc mt-2 max-w-none text-[15px] dark:prose-invert" data-testid="brief-instructions">
              {project.instructions.trim() ? <Markdown text={project.instructions} /> : <p className="text-fg-muted">Your teacher didn't add instructions. Ask them if you're not sure what to do.</p>}
            </div>
          </section>
          {project.rubric.trim() && (
            <section data-testid="brief-rubric">
              <h3 className="font-display text-lg font-bold tracking-[-0.01em]">How it's graded</h3>
              {project.rubricGrid ? (
                <div className="mt-3">
                  <RubricGridView grid={project.rubricGrid} />
                </div>
              ) : table ? (
                <table className="mt-3 w-full overflow-hidden rounded-2xl border border-line text-[15px]">
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b border-line last:border-0">
                        <td className="px-4 py-2.5">{r.label}</td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{r.max} pts</td>
                      </tr>
                    ))}
                    <tr className="bg-surface-2">
                      <td className="px-4 py-2.5 font-semibold">Total</td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums">{rubricMax(rows)} pts</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <div className="prose prose-zinc mt-2 max-w-none text-[15px] dark:prose-invert">
                  <Markdown text={project.rubric} />
                </div>
              )}
            </section>
          )}
        </div>
        <aside className="space-y-3" aria-label="The rules for this assignment">
          <h3 className="font-display text-lg font-bold tracking-[-0.01em]">The rules</h3>
          <Rule icon={<CalendarClock className="h-4 w-4" />} title={due ? (late ? "It's past due" : "Due") : "No due date"} tone={late ? "warn" : "plain"} testId="brief-due">
            {due ? (
              <>
                {late ? "It was due " : ""}
                <span className={late ? "font-semibold text-red-700 dark:text-red-300" : "font-semibold text-fg"}>{when(due)}</span>
                {project.access?.dueAt && " (your teacher gave you more time)"}
              </>
            ) : (
              "Turn it in when you're done."
            )}
          </Rule>
          <Rule icon={<Clock className="h-4 w-4" />} title="When you can work" tone={st?.open === false ? "warn" : "plain"} testId="brief-schedule">
            {describeSchedule(project.schedule)}.
            {st && (
              <span className="mt-1 block font-medium text-fg">
                {st.open
                  ? `Open now${st.nextChange ? ` until ${when(st.nextChange)}` : ""}.`
                  : st.reason === "due"
                    ? "Closed: it's past the due date."
                    : `Closed right now${st.nextChange ? `. Opens ${when(st.nextChange)}` : ""}.`}
              </span>
            )}
          </Rule>
          <Rule icon={<Bot className="h-4 w-4" />} title={ai.title} testId="brief-ai">
            {ai.body}
          </Rule>
          {project.pasteGuard && (
            <Rule icon={<ClipboardX className="h-4 w-4" />} title="No pasting from outside" testId="brief-paste">
              Pasting text from other sites or apps is blocked, so type your own work. Copying and pasting inside Cairn is fine.
            </Rule>
          )}
          <Rule icon={solo ? <User className="h-4 w-4" /> : <Users className="h-4 w-4" />} title={solo ? "Just you" : "With your group"}>
            {solo ? "This room is yours. Your teacher sees how your work was made when you turn it in." : "Everyone in your group works in this room. Your teacher sees who did what when you turn it in."}
          </Rule>
          {project.reflection?.trim() && (
            <Rule icon={<MessageCircleQuestion className="h-4 w-4" />} title="When you turn it in">
              You'll answer: <span className="font-medium text-fg">“{project.reflection}”</span>
            </Rule>
          )}
        </aside>
      </div>
    </Modal>
  );
}
