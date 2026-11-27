import { Minus, Plus, X } from "lucide-react";
import { DEFAULT_LEVELS, GRID_LIMITS, criterionMax, type RubricCriterion, type RubricGrid } from "../../shared/protocol";

const pts = (n: number) => `${n} pt${n === 1 ? "" : "s"}`;

/**
 * A rubric as a grid of boxes, one row per criterion. Students read it to see where the bar is;
 * the teacher clicks a box per row to grade (onPick); a returned grade highlights the picked boxes.
 */
export function RubricGridView({
  grid,
  picks,
  onPick,
  disabled,
}: {
  grid: RubricGrid;
  /** The box picked in each row (by level index). */
  picks?: (number | null | undefined)[];
  onPick?: (row: number, level: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface" data-testid="rubric-grid">
      {grid.rows.map((r, i) => (
        <section key={i} className="px-4 py-4" aria-label={r.title}>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h4 className="text-[15px] font-semibold">{r.title}</h4>
            <span className="text-sm text-fg-subtle">up to {pts(criterionMax(r))}</span>
          </div>
          {r.desc && <p className="mt-0.5 text-sm text-fg-muted">{r.desc}</p>}
          <div className="mt-3 grid gap-2.5" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${r.levels.length > 4 ? 140 : 170}px, 1fr))` }} role={onPick ? "radiogroup" : undefined} aria-label={onPick ? `Score for ${r.title}` : undefined}>
            {r.levels.map((l, j) => {
              const on = picks?.[i] === j;
              const body = (
                <>
                  <span className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-sm font-semibold">{l.label || `Level ${j + 1}`}</span>
                    <span className="shrink-0 text-sm italic text-fg-muted tabular-nums">{pts(l.points)}</span>
                  </span>
                  {l.desc && <span className="mt-1.5 block text-sm leading-snug text-fg-muted">{l.desc}</span>}
                </>
              );
              const cls = `block h-full rounded-xl border px-3 py-2.5 text-left ${on ? "border-primary bg-mint/60 shadow-[0_0_0_1px_var(--color-primary)] dark:bg-mint/10" : "border-line bg-bg"}`;
              return onPick ? (
                <button
                  key={j}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={disabled}
                  onClick={() => onPick(i, j)}
                  className={`press ${cls} ${on ? "" : "hover:border-line-strong"}`}
                  data-testid="grid-level"
                >
                  {body}
                </button>
              ) : (
                <div key={j} className={cls} data-testid={on ? "grid-level-picked" : "grid-level"}>
                  {body}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

const blankRow = (levels: RubricCriterion["levels"]): RubricCriterion => ({ title: "", levels: levels.map((l) => ({ ...l, desc: "" })) });
export const newGrid = (): RubricGrid => ({ rows: [blankRow(DEFAULT_LEVELS)] });

const FIELD = "w-full rounded-lg border border-line-strong bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-fg/40";

/**
 * Make a rubric grid: the levels (names and points) once at the top, then one row per thing
 * being graded, with what each level looks like for it.
 */
export function RubricGridEditor({ value, onChange }: { value: RubricGrid; onChange: (g: RubricGrid) => void }) {
  const levels = value.rows[0]?.levels ?? DEFAULT_LEVELS;
  const setLevel = (j: number, patch: Partial<{ label: string; points: number }>) =>
    onChange({ rows: value.rows.map((r) => ({ ...r, levels: r.levels.map((l, k) => (k === j ? { ...l, ...patch } : l)) })) });
  const setRow = (i: number, patch: Partial<RubricCriterion>) => onChange({ rows: value.rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const setDesc = (i: number, j: number, desc: string) => setRow(i, { levels: value.rows[i].levels.map((l, k) => (k === j ? { ...l, desc } : l)) });
  const addLevel = () =>
    onChange({ rows: value.rows.map((r) => ({ ...r, levels: [...r.levels, { label: "", points: 0, desc: "" }] })) });
  const dropLevel = (j: number) => onChange({ rows: value.rows.map((r) => ({ ...r, levels: r.levels.filter((_, k) => k !== j) })) });
  const cols = { gridTemplateColumns: `repeat(${levels.length}, minmax(0, 1fr))` };
  return (
    <div className="space-y-4" data-testid="grid-editor">
      <div className="rounded-2xl border border-line bg-surface-2/50 p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-semibold">Levels</span>
          <span className="text-xs text-fg-subtle">Best first. They're the same for every row.</span>
          <span className="flex-1" />
          {levels.length < GRID_LIMITS.levels && (
            <button type="button" onClick={addLevel} className="press inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg" data-testid="grid-add-level">
              <Plus className="h-3.5 w-3.5" /> Level
            </button>
          )}
        </div>
        <div className="grid gap-2" style={cols}>
          {levels.map((l, j) => (
            <div key={j} className="min-w-0 rounded-xl border border-line bg-bg p-2">
              <input aria-label={`Level ${j + 1} name`} value={l.label} maxLength={GRID_LIMITS.label} onChange={(e) => setLevel(j, { label: e.target.value })} placeholder={`Level ${j + 1}`} className={`${FIELD} font-semibold`} data-testid="grid-level-name" />
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-fg-muted">
                <input
                  type="number"
                  aria-label={`Level ${j + 1} points`}
                  value={l.points}
                  min={0}
                  onChange={(e) => setLevel(j, { points: Math.max(0, Number(e.target.value) || 0) })}
                  className={`${FIELD} w-14 px-1.5 text-center tabular-nums`}
                  data-testid="grid-level-points"
                />
                pts
                <span className="flex-1" />
                {levels.length > 2 && (
                  <button type="button" onClick={() => dropLevel(j)} className="press shrink-0 rounded-md p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label={`Remove level ${l.label || j + 1}`}>
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {value.rows.map((r, i) => (
        <div key={i} className="rounded-2xl border border-line p-3" data-testid="grid-row">
          <div className="flex items-center gap-2">
            <input aria-label={`Row ${i + 1} name`} value={r.title} maxLength={GRID_LIMITS.title} onChange={(e) => setRow(i, { title: e.target.value })} placeholder="What you're grading (e.g. Focus)" className={`${FIELD} font-semibold`} data-testid="grid-row-title" />
            {value.rows.length > 1 && (
              <button type="button" onClick={() => onChange({ rows: value.rows.filter((_, k) => k !== i) })} className="press shrink-0 rounded-md p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label={`Remove row ${r.title || i + 1}`}>
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <input aria-label={`Row ${i + 1} description`} value={r.desc ?? ""} maxLength={GRID_LIMITS.desc} onChange={(e) => setRow(i, { desc: e.target.value })} placeholder="One line about it (optional)" className={`${FIELD} mt-2`} />
          <div className="mt-2 grid gap-2" style={cols}>
            {r.levels.map((l, j) => (
              <textarea
                key={j}
                aria-label={`${r.title || `Row ${i + 1}`}: what "${l.label || `level ${j + 1}`}" looks like`}
                value={l.desc}
                maxLength={GRID_LIMITS.desc}
                rows={3}
                onChange={(e) => setDesc(i, j, e.target.value)}
                placeholder={`What "${l.label || `level ${j + 1}`}" looks like`}
                className={`${FIELD} min-w-0 resize-y`}
                data-testid="grid-cell"
              />
            ))}
          </div>
        </div>
      ))}
      {value.rows.length < GRID_LIMITS.rows && (
        <button type="button" onClick={() => onChange({ rows: [...value.rows, blankRow(levels)] })} className="press inline-flex items-center gap-1.5 rounded-xl border border-dashed border-line-strong px-3 py-2 text-sm font-semibold text-fg-muted hover:border-fg/40 hover:text-fg" data-testid="grid-add-row">
          <Plus className="h-4 w-4" /> Add a row
        </button>
      )}
    </div>
  );
}
