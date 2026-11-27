import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Check } from "lucide-react";
import type { PublicForm as Form, Question } from "../../shared/forms-model";
import { DateField } from "../components/DateTimePicker";

type Answers = Record<string, string | string[] | number>;

function Field({ q, value, onChange }: { q: Question; value: Answers[string] | undefined; onChange: (v: Answers[string]) => void }) {
  const base = "mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900";
  const id = `q-${q.id}`;
  switch (q.type) {
    case "long":
      return <textarea id={id} rows={4} className={base} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} required={q.required} />;
    case "date":
      return (
        <div className="mt-2">
          <DateField label={q.title} value={String(value ?? "")} onChange={(v) => onChange(v)} />
        </div>
      );
    case "choice":
      return (
        <div className="mt-2 space-y-1" role="radiogroup" aria-labelledby={`${id}-label`}>
          {(q.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2">
              <input type="radio" name={id} checked={value === o} onChange={() => onChange(o)} required={q.required} /> {o}
            </label>
          ))}
        </div>
      );
    case "dropdown":
      return (
        <select id={id} className={base} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} required={q.required} aria-labelledby={`${id}-label`}>
          <option value="">Choose…</option>
          {(q.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "checkbox": {
      const picked = Array.isArray(value) ? value : [];
      return (
        <div className="mt-2 space-y-1" role="group" aria-labelledby={`${id}-label`}>
          {(q.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2">
              <input type="checkbox" checked={picked.includes(o)} onChange={(e) => onChange(e.target.checked ? [...picked, o] : picked.filter((x) => x !== o))} /> {o}
            </label>
          ))}
        </div>
      );
    }
    case "scale":
      return (
        <div className="mt-2 flex flex-wrap items-center gap-2" role="radiogroup" aria-labelledby={`${id}-label`}>
          {Array.from({ length: q.max ?? 5 }, (_, i) => i + 1).map((n) => (
            <label key={n} className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border ${value === n ? "border-fg bg-primary text-primary-fg" : "border-zinc-300 dark:border-zinc-700"}`}>
              <input type="radio" name={id} className="sr-only" checked={value === n} onChange={() => onChange(n)} required={q.required} />
              {n}
            </label>
          ))}
        </div>
      );
    default:
      return <input id={id} className={base} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} required={q.required} maxLength={500} />;
  }
}

/** The public fill-in page for a form: /f/:code/:id. No room or sign-in needed. */
export default function PublicForm() {
  const { code = "", id = "" } = useParams();
  const [form, setForm] = useState<Form | null>(null);
  const [err, setErr] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const url = `/api/forms/${encodeURIComponent(code)}/${encodeURIComponent(id)}`;

  useEffect(() => {
    fetch(url)
      .then(async (r) => (r.ok ? setForm((await r.json()) as Form) : setErr(((await r.json()) as { error?: string }).error ?? "Form not found.")))
      .catch(() => setErr("Couldn't load this form. Check your connection."));
  }, [url]);

  useEffect(() => {
    if (form) document.title = `${form.title} · Cairn Forms`;
  }, [form]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // The date picker isn't a native input, so check required dates here.
    const missing = form?.questions.find((q) => q.type === "date" && q.required && !answers[q.id]);
    if (missing) return setErr(`Pick a date for “${missing.title}”.`);
    setBusy(true);
    setErr("");
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers }) });
    const d = (await r.json()) as { ok?: boolean; error?: string };
    setBusy(false);
    if (d.ok) setSent(true);
    else setErr(d.error ?? "Something went wrong.");
  };

  return (
    <div className="min-h-full bg-surface-2 px-4 py-10 dark:bg-zinc-950">
      <main className="mx-auto max-w-xl">
        {!form && !err && <p className="text-center text-zinc-500">Loading form…</p>}
        {!form && err && <p className="rounded-xl bg-white p-6 text-center shadow-sm dark:bg-zinc-900">{err}</p>}
        {form && (
          <>
            <header className="rounded-2xl border border-line bg-white p-6 shadow-sm dark:bg-zinc-900">
              <h1 className="text-2xl font-bold" data-testid="public-form-title">{form.title}</h1>
              {form.description && <p className="mt-2 whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">{form.description}</p>}
              {!form.accepting && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">This form isn't accepting responses right now.</p>}
            </header>
            {sent ? (
              <div className="mt-4 rounded-2xl bg-white p-6 text-center shadow-sm dark:bg-zinc-900" role="status" data-testid="form-thanks">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-mint text-ink">
                  <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden />
                </div>
                <p className="mt-3 font-display text-lg font-bold">Thanks! Your response was recorded.</p>
                <button
                  onClick={() => {
                    setAnswers({});
                    setSent(false);
                  }}
                  className="press mt-3 rounded-lg px-2 py-1 text-sm font-medium text-fg-muted underline underline-offset-2 hover:text-fg"
                >
                  Submit another response
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-4 space-y-3">
                {form.questions.map((q) => (
                  <fieldset key={q.id} className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900">
                    <legend id={`q-${q.id}-label`} className="float-left w-full font-medium">
                      <label htmlFor={`q-${q.id}`}>
                        {q.title || "Untitled question"}
                        {q.required && <span className="text-red-600" aria-label="required"> *</span>}
                      </label>
                    </legend>
                    <div className="clear-both" />
                    {q.image && <img src={q.image} alt={`Picture for: ${q.title || "this question"}`} className="mt-2 max-h-72 rounded-lg border border-line" />}
                    <Field q={q} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
                  </fieldset>
                ))}
                {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
                <button
                  disabled={busy || !form.accepting}
                  className="rounded-lg bg-primary px-5 py-2 font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
                  data-testid="form-submit"
                >
                  {busy ? "Sending…" : "Submit"}
                </button>
              </form>
            )}
            <p className="mt-6 text-center text-xs text-zinc-400">Made with Cairn · Never submit passwords through forms.</p>
          </>
        )}
      </main>
    </div>
  );
}
