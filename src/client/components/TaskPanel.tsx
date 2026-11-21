import { useState } from "react";
import { Plus, X } from "lucide-react";
import { TASK_LIMITS, type ClientMsg, type TaskBoard } from "../../shared/protocol";
import { fromLocalInput } from "./ProjectEditor";

export const ROLE_IDEAS = ["Researcher", "Writer", "Designer", "Presenter", "Editor", "Team lead"];

const dateInput = (ms?: number) => {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** A due date picked as a day means the end of that day. */
const fromDateInput = (v: string) => fromLocalInput(v ? `${v}T23:59` : "");

/** The group's task list and roles: who does what, and when it's due. */
export function TaskPanel({ board, meUid, locked, send }: { board: TaskBoard; meUid: string; locked: boolean; send: (m: ClientMsg) => void }) {
  const people = board.people ?? {};
  const uids = Object.keys(people).sort((a, b) => people[a].localeCompare(people[b]));
  const nameOf = (uid?: string) => (uid ? (people[uid] ?? "Someone") : "");
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [role, setRole] = useState(board.roles[meUid] ?? "");
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    send({ t: "task_add", title: title.trim(), ...(owner ? { ownerUid: owner } : {}) });
    setTitle("");
  };
  const done = board.tasks.filter((t) => t.done).length;
  const ownerSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <select
      aria-label={label}
      value={value}
      disabled={locked}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-[9rem] rounded-lg border border-line-strong bg-transparent px-1.5 py-1 text-xs"
    >
      <option value="">No owner</option>
      {uids.map((u) => (
        <option key={u} value={u}>
          {people[u]}
          {u === meUid ? " (you)" : ""}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-4" data-testid="task-panel">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Roles</h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          {uids
            .filter((u) => u !== meUid)
            .map((u) => (
              <span key={u} className="rounded-full border border-line px-2 py-0.5" data-testid="role-chip">
                <span className="font-medium">{people[u]}</span>: <span className="text-fg-muted">{board.roles[u] || "no role yet"}</span>
              </span>
            ))}
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              send({ t: "set_role", role });
            }}
          >
            <label className="text-fg-muted" htmlFor="my-role">
              Your role
            </label>
            <input
              id="my-role"
              list="role-ideas"
              value={role}
              maxLength={TASK_LIMITS.role}
              disabled={locked}
              onChange={(e) => setRole(e.target.value)}
              onBlur={() => role !== (board.roles[meUid] ?? "") && send({ t: "set_role", role })}
              placeholder="e.g. Researcher"
              className="w-28 rounded-lg border border-line-strong bg-transparent px-2 py-0.5 text-xs outline-none focus:border-fg/40"
              data-testid="my-role"
            />
            <datalist id="role-ideas">
              {ROLE_IDEAS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </form>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          Tasks {board.tasks.length > 0 && <span className="font-normal normal-case tracking-normal">({done} of {board.tasks.length} done)</span>}
        </h3>
        {board.tasks.length === 0 && <p className="mt-1.5 text-sm text-fg-subtle">No tasks yet. Add them below, or ask the AI to split up the work.</p>}
        <ul className="mt-1.5 divide-y divide-line">
          {board.tasks.map((t) => {
            const overdue = !t.done && !!t.dueAt && t.dueAt < Date.now();
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-2 py-1.5" data-testid="task">
                <input
                  type="checkbox"
                  checked={t.done}
                  disabled={locked}
                  aria-label={`Done: ${t.title}`}
                  onChange={(e) => send({ t: "task_update", id: t.id, done: e.target.checked })}
                  data-testid="task-done"
                />
                <span className={`min-w-0 flex-1 text-sm ${t.done ? "text-fg-subtle line-through" : ""}`} data-testid="task-title">
                  {t.title}
                </span>
                {ownerSelect(t.ownerUid ?? "", (v) => send({ t: "task_update", id: t.id, ownerUid: v || null }), `Owner of ${t.title}`)}
                <input
                  type="date"
                  aria-label={`Due date for ${t.title}`}
                  value={dateInput(t.dueAt)}
                  disabled={locked}
                  onChange={(e) => send({ t: "task_update", id: t.id, dueAt: fromDateInput(e.target.value) })}
                  className={`rounded-lg border border-line-strong bg-transparent px-1.5 py-0.5 text-xs ${overdue ? "text-red-600 dark:text-red-400" : ""}`}
                />
                {!locked && (
                  <button
                    onClick={() => send({ t: "task_delete", id: t.id })}
                    className="press rounded-md p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg"
                    aria-label={`Remove ${t.title}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {t.ownerUid && <span className="sr-only">Owner: {nameOf(t.ownerUid)}</span>}
              </li>
            );
          })}
        </ul>
        {!locked && (
          <form onSubmit={add} className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={title}
              maxLength={TASK_LIMITS.title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a task (e.g. Find 3 sources)"
              aria-label="New task"
              className="min-w-[10rem] flex-1 rounded-lg border border-line-strong bg-transparent px-2.5 py-1 text-sm outline-none focus:border-fg/40"
              data-testid="new-task"
            />
            {ownerSelect(owner, setOwner, "Owner of the new task")}
            <button type="submit" className="press flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-fg hover:bg-primary-hover" data-testid="add-task">
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
