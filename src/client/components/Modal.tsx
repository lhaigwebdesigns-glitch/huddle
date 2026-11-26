import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Cairn's big modal: about 80% of the screen (a full sheet on phones), with a fixed header, a
 * scrolling body with room to breathe, and a footer where the main action sits on the right.
 * Quick yes/no questions use the small dialogs in Dialogs.tsx instead.
 */
export function Modal({
  title,
  subtitle,
  onClose,
  onSubmit,
  header,
  footer,
  children,
  size = "lg",
  testId,
  closeLabel = "Close",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  /** Makes the panel a form (Enter submits). */
  onSubmit?: (e: FormEvent) => void;
  /** Extra header content under the title (e.g. wizard steps). */
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** lg ≈ 80% of the screen; md for shorter forms. */
  size?: "lg" | "md";
  testId?: string;
  closeLabel?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const back = useRef<Element | null>(null);
  useEffect(() => {
    back.current = document.activeElement;
    // Focus the first field (or the panel), so typing starts in the modal.
    const first = ref.current?.querySelector<HTMLElement>("[autofocus], input:not([type=hidden]):not([disabled]), textarea, select");
    (first ?? ref.current)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[data-testid="cairn-dialog"]')) {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab" && ref.current) {
        // Keep keyboard focus inside the modal.
        const f = [...ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])')].filter(
          (el) => el.offsetParent !== null,
        );
        if (!f.length) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) (e.preventDefault(), f[f.length - 1].focus());
        else if (!e.shiftKey && i === f.length - 1) (e.preventDefault(), f[0].focus());
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      (back.current as HTMLElement | null)?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Panel = (onSubmit ? "form" : "div") as "form";
  const width = size === "lg" ? "sm:w-[min(80vw,1080px)]" : "sm:w-[min(80vw,720px)]";
  return (
    <div className="fade fixed inset-0 z-50 flex items-stretch justify-center bg-black/45 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={onClose}>
      <Panel
        ref={ref as React.Ref<HTMLFormElement>}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className={`modal-in flex h-[100dvh] w-full flex-col overflow-hidden bg-surface shadow-[0_40px_100px_-30px_rgba(0,0,0,0.5)] outline-none sm:h-auto sm:max-h-[88vh] sm:rounded-[28px] sm:border sm:border-line ${width}`}
        data-testid={testId}
      >
        <header className="shrink-0 border-b border-line px-6 pb-5 pt-6 sm:px-8 sm:pt-7">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h2 id="modal-title" className="font-display text-[1.6rem] font-extrabold leading-tight tracking-[-0.02em]">
                {title}
              </h2>
              {subtitle && <p className="mt-1 text-[15px] text-fg-muted">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} className="press -mr-1 rounded-full p-2 text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label={closeLabel}>
              <X className="h-5 w-5" />
            </button>
          </div>
          {header && <div className="mt-5">{header}</div>}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7 sm:px-8">{children}</div>
        {footer && <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-line bg-surface px-6 py-4 sm:px-8 sm:py-5">{footer}</footer>}
      </Panel>
    </div>
  );
}

/** A labeled group inside a modal: a clear heading, an optional hint, then its fields. */
export function Field({ label, hint, children, testId }: { label: ReactNode; hint?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <fieldset className="min-w-0" data-testid={testId}>
      <legend className="text-[15px] font-semibold">{label}</legend>
      {hint && <p className="mt-0.5 text-sm text-fg-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}
