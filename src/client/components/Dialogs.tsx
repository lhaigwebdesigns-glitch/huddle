import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";

/**
 * Cairn's own confirm / prompt / alert, in place of the browser's pop-ups.
 * Call `confirmDialog(...)`, `promptDialog(...)` or `alertDialog(...)` from anywhere; they
 * resolve when the person answers. <DialogHost /> renders them (once, in main.tsx).
 */

interface Base {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for things that can't be undone. */
  danger?: boolean;
}
type Req =
  | (Base & { kind: "confirm"; resolve: (ok: boolean) => void })
  | (Base & { kind: "alert"; resolve: () => void })
  | (Base & { kind: "prompt"; defaultValue?: string; placeholder?: string; label?: string; mustMatch?: string; resolve: (v: string | null) => void });

let queue: Req[] = [];
const listeners = new Set<() => void>();
const push = (r: Req) => {
  queue = [...queue, r];
  listeners.forEach((l) => l());
};

export const confirmDialog = (o: Base) => new Promise<boolean>((resolve) => push({ ...o, kind: "confirm", resolve }));
export const alertDialog = (o: Base) => new Promise<void>((resolve) => push({ ...o, kind: "alert", resolve }));
/** Resolves to the text, or null if cancelled. With `mustMatch`, OK only enables once the text matches exactly. */
export const promptDialog = (o: Base & { defaultValue?: string; placeholder?: string; label?: string; mustMatch?: string }) =>
  new Promise<string | null>((resolve) => push({ ...o, kind: "prompt", resolve }));

export function DialogHost() {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  const req = queue[0];
  if (!req) return null;
  const done = () => {
    queue = queue.slice(1);
    listeners.forEach((l) => l());
  };
  return <DialogView key={queue.length + req.title} req={req} done={done} />;
}

function DialogView({ req, done }: { req: Req; done: () => void }) {
  const [text, setText] = useState(req.kind === "prompt" ? (req.defaultValue ?? "") : "");
  const okRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnTo = useRef<Element | null>(document.activeElement);
  const finish = (answer: boolean) => {
    if (req.kind === "confirm") req.resolve(answer);
    else if (req.kind === "alert") req.resolve();
    else req.resolve(answer ? text : null);
    done();
    (returnTo.current as HTMLElement | null)?.focus?.();
  };
  useEffect(() => {
    if (req.kind === "prompt") inputRef.current?.select();
    else okRef.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const blocked = req.kind === "prompt" && req.mustMatch !== undefined && text.trim() !== req.mustMatch;
  return (
    <div className="fade fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" onClick={() => req.kind !== "alert" && finish(false)}>
      <form
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cairn-dialog-title"
        aria-describedby={req.message ? "cairn-dialog-msg" : undefined}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!blocked) finish(true);
        }}
        className="modal-in w-full max-w-md rounded-[28px] border border-line bg-surface p-7 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.5)] sm:p-8"
        style={{ ["--origin" as string]: "center" }}
        data-testid="cairn-dialog"
      >
        <h2 id="cairn-dialog-title" className="font-display text-[1.35rem] font-extrabold leading-tight tracking-[-0.02em]">
          {req.title}
        </h2>
        {req.message && (
          <p id="cairn-dialog-msg" className="mt-2 text-[15px] leading-relaxed text-fg-muted">
            {req.message}
          </p>
        )}
        {req.kind === "prompt" && (
          <label className="mt-5 block text-[15px] font-semibold">
            {req.label}
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={req.placeholder}
              maxLength={500}
              className="mt-2 h-12 w-full rounded-xl border border-line-strong bg-bg px-4 text-base outline-none focus:border-fg focus:ring-4 focus:ring-fg/10"
              data-testid="dialog-input"
            />
          </label>
        )}
        <div className="mt-7 flex justify-end gap-2">
          {req.kind !== "alert" && (
            <Button type="button" variant="ghost" size="md" onClick={() => finish(false)} data-testid="dialog-cancel">
              {req.cancelLabel ?? "Cancel"}
            </Button>
          )}
          <Button ref={okRef} type="submit" variant={req.danger ? "danger" : "primary"} disabled={blocked} className="h-11 px-5 font-semibold" data-testid="dialog-confirm">
            {req.confirmLabel ?? "OK"}
          </Button>
        </div>
      </form>
    </div>
  );
}
