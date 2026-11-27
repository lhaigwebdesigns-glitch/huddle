import { useState } from "react";
import { gridToText, PROJECT_LIMITS, type AiSetting, type Member, type ProjectSettings, type RubricGrid } from "../../shared/protocol";
import { newGrid, RubricGridEditor } from "./RubricGrid";
import { DAY_NAMES, type Schedule } from "../../shared/schedule";
import { DateTimeField, TimeField } from "./DateTimePicker";

export const AI_CHOICES: { value: AiSetting; label: string; hint: string }[] = [
  { value: "off", label: "AI off", hint: "No AI in this project. Students work on their own." },
  { value: "tutor", label: "Tutor only", hint: "The AI explains and gives hints, but never writes the work." },
  { value: "full", label: "Full help", hint: "The AI can research, write and make files with the group." },
];

/** "2026-11-21T15:00" for a datetime-local input, in the viewer's time zone. */
export function toLocalInput(ms?: number) {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

const FIELD = "mt-1 w-full rounded-xl border border-line-strong bg-transparent px-3 py-2 text-sm outline-none focus:border-fg/40";

/** `rubricGrid: null` means "no grid" (so turning a grid off reaches the server). */
export type ProjectDraft = Pick<ProjectSettings, "instructions" | "rubric" | "ai" | "pasteGuard" | "pasteExempt"> & { dueAt?: number; schedule?: Schedule; rubricGrid?: RubricGrid | null };

const WEEK = [1, 2, 3, 4, 5, 6, 0];
const localTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/**
 * When students may work on the assignment: any time, or only at set times (e.g. the class
 * period). Optionally close it once the due date passes. Times are in the teacher's time zone.
 */
export function ScheduleEditor({ value, onChange }: { value?: Schedule; onChange: (s: Schedule | undefined) => void }) {
  const timed = !!value?.windows.length;
  const w = value?.windows[0] ?? { days: [1, 2, 3, 4, 5], start: "09:00", end: "09:50" };
  const update = (patch: Partial<typeof w> | null, closeAtDue = value?.closeAtDue) => {
    const windows = patch === null ? [] : [{ ...w, ...patch }];
    onChange(windows.length || closeAtDue ? { windows, tz: value?.tz ?? localTz(), ...(closeAtDue ? { closeAtDue: true } : {}) } : undefined);
  };
  const choice = (on: boolean) => `press rounded-xl border px-3 py-1.5 text-left text-sm ${on ? "border-fg bg-surface-2 font-medium" : "border-line-strong text-fg-muted hover:text-fg"}`;
  return (
    <fieldset data-testid="schedule-editor">
      <legend className="text-sm font-medium">When can students work on it?</legend>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="When students can work">
        <button type="button" role="radio" aria-checked={!timed} onClick={() => update(null)} className={choice(!timed)} data-testid="schedule-anytime">
          Any time
        </button>
        <button type="button" role="radio" aria-checked={timed} onClick={() => update({})} className={choice(timed)} data-testid="schedule-timed">
          Only at set times (e.g. class time)
        </button>
      </div>
      {timed && (
        <div className="mt-3 space-y-2 rounded-xl border border-line px-3 py-2.5">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Days">
            {WEEK.map((d) => {
              const on = w.days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => update({ days: on ? w.days.filter((x) => x !== d) : [...w.days, d].sort() })}
                  className={`press w-11 rounded-lg border py-1 text-xs ${on ? "border-fg bg-surface-2 font-medium" : "border-line-strong text-fg-muted"}`}
                >
                  {DAY_NAMES[d]}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="flex items-center gap-1.5">
              From
              <TimeField label="Start time" value={w.start} onChange={(start) => update({ start })} />
            </span>
            <span className="flex items-center gap-1.5">
              to
              <TimeField label="End time" value={w.end} onChange={(end) => update({ end })} />
            </span>
          </div>
          <p className="text-xs text-fg-subtle">Outside these times the files are read-only. Students can ask you for more time.</p>
        </div>
      )}
      <label className="mt-2 flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={!!value?.closeAtDue}
          onChange={(e) => (timed ? update({}, e.target.checked) : update(null, e.target.checked))}
          data-testid="close-at-due"
        />
        <span>
          Close it after the due date
          <span className="block text-xs text-fg-subtle">Students can still ask you for an extension.</span>
        </span>
      </label>
    </fieldset>
  );
}

export const EMPTY_PROJECT: ProjectDraft = { instructions: "", rubric: "", ai: "tutor", pasteGuard: false, pasteExempt: [] };

/**
 * The teacher's project rules: instructions, rubric, due date, AI setting and paste blocking.
 * Used when creating a project and in Room settings. Calls onChange with the whole draft.
 */
export function ProjectEditor({
  value,
  onChange,
  members = [],
  hostId,
  compact = false,
  part = "all",
}: {
  /** "what" = instructions and rubric; "how" = due date, AI and pasting; "all" = everything. */
  part?: "all" | "what" | "how";
  value: ProjectDraft;
  onChange: (next: ProjectDraft) => void;
  members?: Member[];
  hostId?: string;
  compact?: boolean;
}) {
  const set = (p: Partial<ProjectDraft>) => onChange({ ...value, ...p });
  const students = members.filter((m) => m.uid !== hostId);
  return (
    <div className="space-y-4" data-testid="project-editor">
      {part !== "how" && (
      <>
      <label className="block">
        <span className="text-sm font-medium">Instructions</span>
        <textarea
          aria-label="Project instructions"
          value={value.instructions}
          maxLength={PROJECT_LIMITS.instructions}
          rows={compact ? 3 : 4}
          placeholder="What should students make? (e.g. A 5-slide presentation on a cause of World War I, with sources.)"
          onChange={(e) => set({ instructions: e.target.value })}
          className={FIELD}
        />
      </label>
      <div className="block">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            Rubric <span className="font-normal text-fg-subtle">(optional)</span>
          </span>
          <span className="flex-1" />
          <div className="inline-flex rounded-xl border border-line-strong p-0.5 text-xs font-semibold" role="radiogroup" aria-label="How to write the rubric">
            {(
              [
                ["text", "Type it"],
                ["grid", "Rubric grid"],
              ] as const
            ).map(([mode, label]) => {
              const on = (mode === "grid") === !!value.rubricGrid;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    if (on) return;
                    if (mode === "grid") set({ rubricGrid: newGrid() });
                    else {
                      const titled = value.rubricGrid?.rows.filter((r) => r.title.trim()) ?? [];
                      set({ rubricGrid: null, rubric: titled.length ? gridToText({ rows: titled }) : value.rubric });
                    }
                  }}
                  className={`press rounded-[10px] px-2.5 py-1 ${on ? "bg-fg text-bg" : "text-fg-muted hover:text-fg"}`}
                  data-testid={`rubric-mode-${mode}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        {value.rubricGrid ? (
          <>
            <p className="mb-3 mt-1 text-xs text-fg-subtle">Students see this grid when they open the assignment. When you grade, you click one box per row.</p>
            <RubricGridEditor value={value.rubricGrid} onChange={(g) => set({ rubricGrid: g })} />
          </>
        ) : (
          <textarea
            aria-label="Project rubric"
            value={value.rubric}
            maxLength={PROJECT_LIMITS.rubric}
            rows={3}
            placeholder="How it will be graded (e.g. Research 40%, Slides 30%, Presentation 30%)."
            onChange={(e) => set({ rubric: e.target.value })}
            className={FIELD}
          />
        )}
      </div>
      </>
      )}
      {part !== "what" && (
      <>
      <div className="block">
        <span className="text-sm font-medium">
          Due <span className="font-normal text-fg-subtle">(optional)</span>
        </span>
        <DateTimeField className="mt-1" label="Due date" value={value.dueAt} onChange={(dueAt) => set({ dueAt })} testId="due-date" />
      </div>
      {part === "all" && <ScheduleEditor value={value.schedule} onChange={(schedule) => set({ schedule })} />}
      <fieldset>
        <legend className="text-sm font-medium">AI in this project</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="AI setting">
          {AI_CHOICES.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={value.ai === c.value}
              data-testid={`ai-${c.value}`}
              onClick={() => set({ ai: c.value, ...(c.value === "full" ? { pasteGuard: false } : {}) })}
              className={`press rounded-xl border px-3 py-2 text-left text-sm ${value.ai === c.value ? "border-fg bg-surface-2" : "border-line-strong hover:border-fg/40"}`}
            >
              <div className="font-medium">{c.label}</div>
              <div className="mt-0.5 text-xs leading-snug text-fg-subtle">{c.hint}</div>
            </button>
          ))}
        </div>
      </fieldset>
      {value.ai !== "full" && (
        <div className="rounded-xl border border-line px-3 py-2.5">
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={value.pasteGuard}
              data-testid="paste-guard"
              onChange={(e) => set({ pasteGuard: e.target.checked })}
            />
            <span>
              <span className="font-medium">Block pasting from outside Cairn</span>
              <span className="block text-xs text-fg-subtle">
                Students can still copy and paste inside the project. They'll see a note when a paste is blocked, so nothing is hidden.
              </span>
            </span>
          </label>
          {value.pasteGuard && students.length > 0 && (
            <div className="mt-2.5 border-t border-line pt-2">
              <span className="text-xs font-medium text-fg-muted">Allow pasting anyway (for dictation or accessibility tools)</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {students.map((m) => {
                  const on = value.pasteExempt.includes(m.uid);
                  return (
                    <button
                      key={m.uid}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ pasteExempt: on ? value.pasteExempt.filter((u) => u !== m.uid) : [...value.pasteExempt, m.uid] })}
                      className={`press rounded-full border px-2.5 py-0.5 text-xs ${on ? "border-fg bg-surface-2" : "border-line-strong text-fg-muted"}`}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}
