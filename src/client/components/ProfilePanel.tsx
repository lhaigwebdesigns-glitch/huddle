import { useRef, useState } from "react";
import { Camera, Check, LogOut, Trash2 } from "lucide-react";
import { Button, Input, ThemeToggle } from "./ui";
import { PersonAvatar } from "./PersonAvatar";
import { PROVIDER_LABEL, signOut, type Account } from "../lib/account";
import { COLORS_LIST, getIdentity } from "../lib/identity";

const MAX_BYTES = 2 * 1024 * 1024;

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="stagger grid gap-4 border-t border-line py-6 first:border-t-0 first:pt-0 sm:grid-cols-[200px_1fr]">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-fg-subtle">{sub}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}

/** Edit your profile: picture, name, color, theme; and sign out. Changes follow you into rooms. */
export function ProfilePanel({ user, onChange }: { user: Account; onChange: (u: Account) => void }) {
  const [name, setNameDraft] = useState(user.name);
  const [color, setColorDraft] = useState(user.color || getIdentity().color);
  const [busy, setBusy] = useState<"" | "name" | "photo" | "color">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const done = async (r: Response, okText: string) => {
    const d = (await r.json().catch(() => ({}))) as { user?: Account; error?: string };
    setBusy("");
    if (!r.ok || !d.user) return setMsg({ ok: false, text: d.error ?? "Something went wrong. Try again." });
    onChange(d.user);
    setMsg({ ok: true, text: okText });
  };

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.trim() === user.name) return;
    setBusy("name");
    await done(await fetch("/api/auth/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }), "Name saved.");
  };

  const pickColor = async (c: string) => {
    setColorDraft(c);
    setBusy("color");
    await done(await fetch("/api/auth/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ color: c }) }), "Color saved.");
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return setMsg({ ok: false, text: "Use a PNG, JPEG, WebP or GIF picture." });
    if (file.size > MAX_BYTES) return setMsg({ ok: false, text: "Pictures can be up to 2 MB." });
    setBusy("photo");
    const form = new FormData();
    form.append("file", file);
    await done(await fetch("/api/auth/avatar", { method: "POST", body: form }), "Picture updated.");
    if (fileRef.current) fileRef.current.value = "";
  };

  const removePhoto = async () => {
    setBusy("photo");
    await done(await fetch("/api/auth/avatar", { method: "DELETE" }), "Picture removed.");
  };

  return (
    <div data-testid="profile">
      <h1 className="rise text-3xl font-semibold tracking-tight">Profile</h1>
      <p className="rise rise-1 mt-1 text-fg-muted">How you show up in rooms. Changes apply the next time you join one.</p>
      {msg && (
        <p role="status" className={`mt-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-accent-soft text-fg" : "bg-red-500/10 text-red-700 dark:text-red-300"}`}>
          {msg.text}
        </p>
      )}

      <div className="mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <Section title="Picture" sub="PNG, JPEG, WebP or GIF, up to 2 MB.">
          <div className="flex items-center gap-4">
            <PersonAvatar name={user.name} color={color} avatar={user.avatar} className="h-20 w-20 text-2xl" />
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => upload(e.target.files?.[0])} data-testid="avatar-input" />
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={busy === "photo"}>
                <Camera className="h-4 w-4" /> {busy === "photo" ? "Saving…" : user.avatar ? "Change picture" : "Upload picture"}
              </Button>
              {user.avatar && (
                <Button variant="ghost" size="sm" onClick={removePhoto} disabled={busy === "photo"}>
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              )}
            </div>
          </div>
        </Section>

        <Section title="Name" sub="What people see in rooms and the chat.">
          <form onSubmit={saveName} className="flex max-w-sm gap-2">
            <Input aria-label="Display name" value={name} maxLength={32} onChange={(e) => setNameDraft(e.target.value)} />
            <Button type="submit" disabled={busy === "name" || !name.trim() || name.trim() === user.name}>
              {busy === "name" ? "Saving…" : "Save"}
            </Button>
          </form>
        </Section>

        <Section title="Color" sub="Your initial, live pointer and caret in shared files.">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Your color">
            {COLORS_LIST.map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                onClick={() => pickColor(c)}
                className={`press flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-surface ${color === c ? "ring-2 ring-fg" : ""}`}
                style={{ background: c }}
              >
                {color === c && <Check className="h-4 w-4 text-white" />}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Appearance">
          <ThemeToggle />
        </Section>

        <Section title="Account" sub={`Signed in with ${PROVIDER_LABEL[user.provider] ?? user.provider}.`}>
          <p className="text-sm text-fg-muted">{user.email ?? "No email shared"}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={signOut} data-testid="profile-sign-out">
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </Section>
      </div>
    </div>
  );
}
