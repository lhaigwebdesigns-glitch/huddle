/**
 * A comic-style thought bubble with a wave of dots: people typing (with their avatars stacked
 * beside it) and the AI thinking (with what it's doing, e.g. "Searching the web…").
 */
export function ThoughtBubble({
  people = [],
  label,
  ariaLabel,
}: {
  people?: { uid: string; name: string; color: string }[];
  label?: string;
  ariaLabel: string;
}) {
  return (
    <div className="thought-in flex items-end gap-2" role="status" aria-label={ariaLabel} data-testid="thought-bubble">
      {people.length > 0 && (
        <span className="flex -space-x-2">
          {people.slice(0, 3).map((p) => (
            <span
              key={p.uid}
              title={p.name}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 ring-bg"
              style={{ background: p.color }}
            >
              {p.name[0]?.toUpperCase()}
            </span>
          ))}
        </span>
      )}
      <span className="relative mb-3">
        {/* The two little circles that make it a thought bubble, trailing toward the avatar. */}
        <span className="absolute -bottom-1.5 -left-1 h-2 w-2 rounded-full border border-line bg-surface-2" aria-hidden />
        <span className="absolute -bottom-3.5 -left-2.5 h-1 w-1 rounded-full border border-line bg-surface-2" aria-hidden />
        <span className="flex items-center gap-2 rounded-[18px] border border-line bg-surface-2 px-3.5 py-2.5">
          <span className="flex items-center gap-1" aria-hidden>
            <span className="thought-dot h-1.5 w-1.5 rounded-full bg-fg-muted" />
            <span className="thought-dot h-1.5 w-1.5 rounded-full bg-fg-muted" />
            <span className="thought-dot h-1.5 w-1.5 rounded-full bg-fg-muted" />
          </span>
          {label && <span className="text-xs text-fg-muted">{label}</span>}
        </span>
      </span>
    </div>
  );
}
