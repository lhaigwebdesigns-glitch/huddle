import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeChoice } from "../lib/theme";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Cairn's mark: three stacked stones. */
export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <ellipse cx="20" cy="32.5" rx="15" ry="6" className="fill-fg" />
      <ellipse cx="18.5" cy="22.5" rx="11" ry="5.2" fill="#5eb1bf" />
      <ellipse cx="21.5" cy="13.5" rx="7.4" ry="4.4" fill="#44cf6c" />
      <path d="M34 1.5c.4 3 1.3 4.4 5.5 5.5-4.2 1.1-5.1 2.5-5.5 5.5-.4-3-1.3-4.4-5.5-5.5 4.2-1.1 5.1-2.5 5.5-5.5z" fill="#8fa6cb" />
    </svg>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover",
  secondary: "border border-line-strong bg-bg text-fg hover:bg-surface-2",
  ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
  danger: "bg-red-600 text-white hover:bg-red-500",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-sm",
  md: "h-10 gap-2 rounded-xl px-4 text-[15px]",
  lg: "h-12 gap-2 rounded-full px-6 text-base",
  icon: "h-8 w-8 rounded-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }>(
  function Button({ variant = "primary", size = "md", className, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={cx("press inline-flex shrink-0 items-center justify-center font-medium disabled:pointer-events-none disabled:opacity-40", VARIANTS[variant], SIZES[size], className)}
        {...rest}
      />
    );
  },
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cx(
        "h-10 w-full rounded-xl border border-line-strong bg-bg px-3.5 text-[15px] text-fg transition-[border-color,box-shadow] duration-150 focus:border-fg focus:outline-none focus:ring-4 focus:ring-fg/10",
        className,
      )}
      {...rest}
    />
  );
});

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">{children}</kbd>;
}

const THEMES: { id: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
  { id: "system", label: "System", Icon: Monitor },
];

/** Segmented light / dark / system switch. */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className={cx("inline-flex rounded-full border border-line p-0.5", className)}>
      {THEMES.map(({ id, label, Icon }) => (
        <button
          key={id}
          role="radio"
          aria-checked={theme === id}
          aria-label={label}
          title={label}
          onClick={() => setTheme(id)}
          className={cx(
            "press flex h-7 w-7 items-center justify-center rounded-full",
            theme === id ? "bg-surface-2 text-fg" : "text-fg-subtle hover:text-fg",
          )}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ))}
    </div>
  );
}

export { cx };
