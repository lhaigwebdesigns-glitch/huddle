import { useState } from "react";
import { PROJECT_LIMITS, type AiSetting, type Member, type ProjectSettings } from "../../shared/protocol";

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

export type ProjectDraft = Pick<ProjectSettings, "instructions" | "rubric" | "ai" | "pasteGuard" | "pasteExempt"> & { dueAt?: number };

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
}: {
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
      <label className="block">
        <span className="text-sm font-medium">Instructions</span>
        <textarea
          aria-label="Project instructions"
          value={value.instructions}
          maxLength={PROJECT_LIMITS.instructions}
          rows={compact ? 3 : 4}
          placeholder="What should the group make? (e.g. A 5-slide presentation on a cause of World War I, with sources.)"
          onChange={(e) => set({ instructions: e.target.value })}
          className={FIELD}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">
          Rubric <span className="font-normal text-fg-subtle">(optional)</span>
        </span>
        <textarea
          aria-label="Project rubric"
          value={value.rubric}
          maxLength={PROJECT_LIMITS.rubric}
          rows={3}
          placeholder="How it will be graded (e.g. Research 40%, Slides 30%, Presentation 30%)."
          onChange={(e) => set({ rubric: e.target.value })}
          className={FIELD}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">
          Due <span className="font-normal text-fg-subtle">(optional)</span>
        </span>
        <input
          type="datetime-local"
          aria-label="Due date"
          value={toLocalInput(value.dueAt)}
          onChange={(e) => set({ dueAt: fromLocalInput(e.target.value) ?? undefined })}
          className={FIELD}
        />
      </label>
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
              <span className="font-medium">Block pasting from outside Huddle</span>
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
    </div>
  );
}
