import { useRef, useState } from "react";
import { X } from "lucide-react";
import { parseEmails } from "../../shared/classes";

/**
 * Type an email and press Enter (or a comma or space) and it becomes a pill. Pasting a whole
 * list makes a pill for every email in it. Backspace in the empty box removes the last pill.
 * Anything that isn't an email stays in the box with a note, so nothing is silently dropped.
 */
export function EmailPills({
  emails,
  onChange,
  draft,
  onDraft,
  known = [],
  placeholder = "Type a school email and press Enter",
}: {
  emails: string[];
  onChange: (emails: string[]) => void;
  draft: string;
  onDraft: (s: string) => void;
  /** Emails already on the class list (skipped, with a note). */
  known?: string[];
  placeholder?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");

  /** Turns text into pills. Returns what couldn't be read as an email. */
  const commit = (text: string) => {
    const found = parseEmails(text);
    const leftover = text
      .split(/[\s,;]+/)
      .filter((w) => w.trim() && !found.includes(w.trim().replace(/^<|>$/g, "").toLowerCase()))
      .join(" ");
    const already = found.filter((e) => known.includes(e));
    const fresh = found.filter((e) => !known.includes(e) && !emails.includes(e));
    if (fresh.length) onChange([...emails, ...fresh]);
    setNote(
      leftover
        ? `"${leftover.slice(0, 40)}" isn't an email address.`
        : already.length
          ? `${already.length === 1 ? already[0] : `${already.length} emails`} already on the class list.`
          : "",
    );
    return leftover;
  };

  return (
    <div>
      <div
        className="flex min-h-[52px] cursor-text flex-wrap items-center gap-2 rounded-2xl border border-line-strong bg-bg px-3 py-2.5 transition-[border-color,box-shadow] focus-within:border-fg focus-within:ring-4 focus-within:ring-fg/10"
        onClick={() => input.current?.focus()}
        data-testid="roster-pills"
      >
        {emails.map((e) => (
          <span key={e} className="pop inline-flex max-w-full items-center gap-1 rounded-full bg-accent-soft py-1 pl-3 pr-1 text-sm font-medium text-fg" style={{ ["--origin" as string]: "center" }} data-testid="roster-pill">
            <span className="truncate">{e}</span>
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                onChange(emails.filter((x) => x !== e));
                input.current?.focus();
              }}
              className="press grid h-6 w-6 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-fg/10 hover:text-fg"
              aria-label={`Remove ${e}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <input
          ref={input}
          id="roster-emails"
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            // A separator typed after an email makes the pill right away.
            if (/[,;\s]$/.test(v) && v.trim()) onDraft(commit(v));
            else onDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              onDraft(commit(draft));
            } else if (e.key === "Backspace" && !draft && emails.length) {
              e.preventDefault();
              onChange(emails.slice(0, -1));
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (!/[\s,;]/.test(text.trim())) return; // one email: let it paste normally
            e.preventDefault();
            onDraft(commit(`${draft} ${text}`));
          }}
          onBlur={() => draft.trim() && onDraft(commit(draft))}
          placeholder={emails.length ? "Add another" : placeholder}
          aria-label="Student emails"
          autoComplete="off"
          spellCheck={false}
          className="h-8 min-w-[12rem] flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-subtle focus-visible:!outline-none"
          data-testid="roster-input"
        />
      </div>
      {note && (
        <p className="mt-1.5 text-sm text-fg-muted" role="status" data-testid="roster-note">
          {note}
        </p>
      )}
    </div>
  );
}
