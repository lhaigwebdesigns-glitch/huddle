import { useEffect, useRef, useState } from "react";
import { PROVIDER_LABEL, signInUrl } from "../lib/account";
import { Logo } from "./ui";
import { PERI, RockArt } from "./Rocks";

/** Google's "G", for the sign-in button. */
export function GoogleMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}

/**
 * The sign-in step before rooms and classes. Everyone signs in with their school Google account,
 * so teachers know exactly who is who and class lists can match by email.
 */
export function SignInGate({ title, message, providers, returnTo }: { title: string; message: string; providers: string[]; returnTo?: string }) {
  const back = returnTo ?? `${location.pathname}${location.search}`;
  return (
    <div className="flex min-h-full items-center justify-center bg-sidebar p-4">
      <div className="rise w-full max-w-sm rounded-[24px] border border-line bg-bg p-7 text-center shadow-[0_12px_40px_-16px_rgba(0,0,0,0.18)]" data-testid="sign-in-gate">
        <RockArt className="mx-auto h-20 w-20" body={PERI} pose="wave" />
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-1.5 text-[15px] text-fg-muted">{message}</p>
        <div className="mt-5 grid gap-2">
          {providers.length === 0 && <p className="text-sm text-fg-subtle">Sign-in isn't set up on this site yet.</p>}
          {providers.map((p, i) => (
            <a
              key={p}
              href={signInUrl(p, back)}
              className={`press flex h-12 items-center justify-center gap-2.5 rounded-xl text-[15px] font-semibold ${
                i === 0 ? "bg-primary text-primary-fg hover:bg-primary-hover" : "border border-line-strong hover:bg-surface-2"
              }`}
              data-testid={`gate-signin-${p}`}
            >
              {p === "google" && (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white">
                  <GoogleMark className="h-4 w-4" />
                </span>
              )}
              Continue with {PROVIDER_LABEL[p] ?? p}
            </a>
          ))}
        </div>
        <p className="mt-4 text-xs text-fg-subtle">Use your school account. Cairn is for ages 13 and up.</p>
        <a href="/" className="mt-5 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
          <Logo className="h-5 w-5" /> Back to Cairn
        </a>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
  }
}

let scriptLoading: Promise<void> | null = null;
const loadTurnstile = () =>
  (scriptLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptLoading = null;
      reject(new Error("Couldn't load the check"));
    };
    document.head.appendChild(s);
  }));

/**
 * Cloudflare Turnstile, the "are you a person?" check. Usually invisible. With no site key
 * (the check is off), it renders nothing and reports an empty token straight away.
 */
export function HumanCheck({ siteKey, onToken }: { siteKey: string | null | undefined; onToken: (token: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const cb = useRef(onToken);
  cb.current = onToken;
  useEffect(() => {
    if (!siteKey) {
      cb.current("");
      return;
    }
    let id: string | undefined;
    let gone = false;
    loadTurnstile()
      .then(() => {
        if (gone || !box.current || !window.turnstile) return;
        id = window.turnstile.render(box.current, {
          sitekey: siteKey,
          theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
          size: "flexible",
          callback: (t: string) => cb.current(t),
          "expired-callback": () => cb.current(""),
          "error-callback": () => setFailed(true),
        });
      })
      .catch(() => setFailed(true));
    return () => {
      gone = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey]);
  if (!siteKey) return null;
  return (
    <div className="mt-3">
      <div ref={box} data-testid="human-check" />
      {failed && <p className="mt-1 text-xs text-red-600 dark:text-red-400">The "are you a person?" check didn't load. Refresh the page to try again.</p>}
    </div>
  );
}
