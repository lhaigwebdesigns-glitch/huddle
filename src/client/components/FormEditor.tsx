import { useState } from "react";
import { AlignLeft, CalendarDays, Check, CircleDot, ExternalLink, ImagePlus, Link2, Minus, Plus, SlidersHorizontal, SquareCheck, SquareChevronDown, X } from "lucide-react";
import { uploadFile } from "../lib/uploads";
import { alertDialog } from "./Dialogs";
import { promptDialog } from "./Dialogs";
import * as Y from "yjs";
import type { EditorProps } from "./FilePanel";
import { useYObserve } from "../lib/useYDoc";
import {
  formMetaOf,
  hasOptions,
  makeQuestion,
  QUESTION_LABEL,
  QUESTION_TYPES,
  questionsOf,
  readQuestion,
  responseRows,
  responsesOf,
  type Question,
  type QuestionType,
} from "../../shared/forms-model";
import { toCsv } from "../../shared/sheet-model";
import { download, safeName } from "../lib/download";
import { sendFromEditor } from "../lib/editorBridge";

const input = "w-full rounded-md border border-line-strong bg-surface px-2 py-1 text-sm";

function QuestionCard({ q, ymap, index, total, onMove, onDelete, room }: { q: Question; ymap: Y.Map<any>; index: number; total: number; onMove: (d: -1 | 1) => void; onDelete: () => void; room: string }) {
  const options = q.options ?? [];
  const [uploading, setUploading] = useState(false);
  // A picture for the question: uploaded to the room, so the public form can show it.
  const addImage = () => {
    const pick = document.createElement("input");
    pick.type = "file";
    pick.accept = "image/png,image/jpeg,image/webp,image/gif";
    pick.onchange = async () => {
      const f = pick.files?.[0];
      if (!f) return;
      setUploading(true);
      try {
        const up = await uploadFile(room, f);
        ymap.set("image", up.url);
      } catch (e) {
        void alertDialog({ title: "Couldn't add the picture", message: String((e as Error).message) });
      } finally {
        setUploading(false);
      }
    };
    pick.click();
  };
  const setOptions = (next: string[]) => ymap.set("options", next.slice(0, 20));
  return (
    <li className="rounded-xl border border-line bg-surface p-3 shadow-sm" data-testid="form-question">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-fg-subtle">{index + 1}</span>
        <input
          aria-label={`Question ${index + 1}`}
          className={`${input} min-w-0 flex-1 font-medium`}
          value={q.title}
          placeholder="Question"
          onChange={(e) => ymap.set("title", e.target.value.slice(0, 300))}
        />
        <select
          aria-label="Question type"
          className="rounded-md border border-line-strong bg-surface px-1 py-1 text-sm"
          value={q.type}
          onChange={(e) => {
            const type = e.target.value as QuestionType;
            ymap.doc!.transact(() => {
              ymap.set("type", type);
              if (hasOptions(type) && !options.length) ymap.set("options", ["Option 1", "Option 2"]);
              if (type === "scale" && !ymap.get("max")) ymap.set("max", 5);
            });
          }}
        >
          {QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>{QUESTION_LABEL[t]}</option>
          ))}
        </select>
      </div>
      {q.image && (
        <div className="relative mt-2 w-fit pl-5">
          <img src={q.image} alt="" className="max-h-48 rounded-lg border border-line" />
          <button onClick={() => ymap.delete("image")} className="press absolute right-1 top-1 rounded-full bg-surface/90 p-1 text-fg-muted shadow hover:text-fg" aria-label="Remove picture" data-testid="question-image-remove">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {hasOptions(q.type) && (
        <ul className="mt-2 space-y-1 pl-5">
          {options.map((o, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-4 text-center text-fg-subtle" aria-hidden>{q.type === "choice" ? "○" : q.type === "checkbox" ? "☐" : `${i + 1}.`}</span>
              <input
                aria-label={`Option ${i + 1}`}
                className={input}
                value={o}
                onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value.slice(0, 120) : x)))}
              />
              <button onClick={() => setOptions(options.filter((_, j) => j !== i))} disabled={options.length <= 1} className="px-1 text-fg-subtle hover:text-red-600 disabled:opacity-30" aria-label={`Remove option ${i + 1}`}>
                ✕
              </button>
            </li>
          ))}
          <li>
            <button onClick={() => setOptions([...options, `Option ${options.length + 1}`])} className="text-sm text-fg hover:underline ">
              + Add option
            </button>
          </li>
        </ul>
      )}
      {q.type === "scale" && (
        <label className="mt-2 flex items-center gap-2 pl-5 text-sm text-fg-muted">
          1 to
          <select aria-label="Scale maximum" className="rounded border border-line-strong bg-surface px-1" value={q.max ?? 5} onChange={(e) => ymap.set("max", Number(e.target.value))}>
            {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      )}
      <div className="mt-2 flex items-center gap-3 border-t border-line pt-2 text-xs text-fg-muted">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={!!q.required} onChange={(e) => ymap.set("required", e.target.checked)} /> Required
        </label>
        <button onClick={addImage} disabled={uploading} className="flex items-center gap-1 rounded px-1 hover:bg-surface-2 hover:text-fg disabled:opacity-50" data-testid="question-image">
          <ImagePlus className="h-3.5 w-3.5" /> {uploading ? "Adding…" : q.image ? "Change picture" : "Picture"}
        </button>
        <span className="flex-1" />
        <button onClick={() => onMove(-1)} disabled={index === 0} className="rounded px-1 hover:bg-surface-2 disabled:opacity-30" aria-label="Move question up">↑</button>
        <button onClick={() => onMove(1)} disabled={index === total - 1} className="rounded px-1 hover:bg-surface-2 disabled:opacity-30" aria-label="Move question down">↓</button>
        <button onClick={onDelete} className="rounded px-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">Delete</button>
      </div>
    </li>
  );
}

function Bar({ label, n, total }: { label: string; n: number; total: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-32 shrink-0 truncate" title={label}>{label}</span>
      <span className="h-3 flex-1 overflow-hidden rounded bg-surface-2">
        <span className="block h-full rounded bg-primary" style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
      </span>
      <span className="w-14 text-right text-xs text-fg-muted">{n} ({total ? Math.round((n / total) * 100) : 0}%)</span>
    </div>
  );
}

const QUESTION_ICON: Record<(typeof QUESTION_TYPES)[number], typeof Plus> = { short: Minus, long: AlignLeft, choice: CircleDot, checkbox: SquareCheck, dropdown: SquareChevronDown, scale: SlidersHorizontal, date: CalendarDays };

export default function FormEditor({ ydoc, room, file, synced }: EditorProps) {
  const qArr = questionsOf(ydoc);
  const meta = formMetaOf(ydoc);
  const resp = responsesOf(ydoc);
  useYObserve([qArr, meta, resp]);
  const [tab, setTab] = useState<"questions" | "responses">("questions");
  const [copied, setCopied] = useState(false);
  const questions = qArr.toArray().map(readQuestion);
  const responses = resp.toArray();
  const accepting = meta.get("accepting") !== false;
  const link = `${location.origin}/f/${room}/${file.id}`;

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= qArr.length) return;
    ydoc.transact(() => {
      const q = readQuestion(qArr.get(i));
      qArr.delete(i, 1);
      qArr.insert(j, [makeQuestion(q)]);
    }, "user");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="form-editor">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-1.5 text-xs text-fg-muted">
        <span>{synced ? "Saves as you type" : "Connecting…"}</span>
        <div className="ml-2 flex rounded-lg bg-surface-2 p-0.5 " role="tablist">
          {(["questions", "responses"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-md px-2 py-0.5 text-sm ${tab === t ? "bg-surface font-medium text-fg shadow-sm" : ""}`}
              data-testid={`form-tab-${t}`}
            >
              {t === "questions" ? "Questions" : `Responses (${responses.length})`}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={accepting} onChange={(e) => meta.set("accepting", e.target.checked)} /> Accepting responses
        </label>
        <button
          onClick={async () => {
            // Copy it; when the browser won't let us, show it so it can be copied by hand.
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              await promptDialog({ title: "Share this form", message: "Copy this link and send it to the people who should fill it in.", label: "Form link", defaultValue: link, confirmLabel: "Done" });
            }
          }}
          className="press inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
          data-testid="form-share"
          data-link={link}
        >
          {copied ? <><Check className="h-4 w-4" /> Link copied</> : <><Link2 className="h-4 w-4" /> Share link</>}
        </button>
        <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-fg">Open <ExternalLink className="h-3.5 w-3.5" /></a>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-bg p-4">
        {tab === "questions" ? (
          <div className="mx-auto max-w-2xl">
            <textarea
              aria-label="Form description"
              rows={2}
              className={`${input} mb-3`}
              placeholder="Description (optional): tell people what this form is for"
              value={meta.get("description") ?? ""}
              onChange={(e) => meta.set("description", e.target.value.slice(0, 2000))}
            />
            <ol className="space-y-3">
              {questions.map((q, i) => (
                <QuestionCard
                  room={room}
                  key={q.id}
                  q={q}
                  ymap={qArr.get(i)}
                  index={i}
                  total={questions.length}
                  onMove={(d) => move(i, d)}
                  onDelete={() => ydoc.transact(() => qArr.delete(i, 1), "user")}
                />
              ))}
            </ol>
            {/* Adding a question: every kind, one click each. */}
            <div className="mt-4 rounded-2xl border border-dashed border-line-strong p-3" data-testid="add-question">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-fg-muted">
                <Plus className="h-4 w-4" /> Add a question
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {QUESTION_TYPES.map((t) => {
                  const Icon = QUESTION_ICON[t];
                  return (
                    <button
                      key={t}
                      onClick={() => ydoc.transact(() => qArr.push([makeQuestion({ type: t, title: "" })]), "user")}
                      className="press flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-left text-sm hover:border-line-strong"
                      data-testid={`add-${t}`}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-fg-muted" /> {QUESTION_LABEL[t]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4" data-testid="form-responses">
            <div className="flex flex-wrap gap-2">
              <button
                disabled={!responses.length}
                onClick={() => download(`${safeName(file.title, "form")} responses.csv`, "text/csv", toCsv(responseRows(ydoc)))}
                className="rounded-md border border-line-strong bg-surface px-2 py-1 text-sm disabled:opacity-40"
              >
                ⬇ CSV
              </button>
              <button
                disabled={!responses.length}
                onClick={() => sendFromEditor({ t: "form_to_sheet", id: file.id })}
                className="rounded-md border border-line-strong bg-surface px-2 py-1 text-sm disabled:opacity-40"
                data-testid="form-to-sheet"
              >
                📊 Send to a sheet
              </button>
            </div>
            {!responses.length && <p className="text-sm text-fg-muted">No responses yet. Share the link and they'll show up here live.</p>}
            {!!responses.length &&
              questions.map((q) => {
                const vals = responses.map((r) => r.answers[q.id]).filter((v) => v !== undefined);
                return (
                  <section key={q.id} className="rounded-xl border border-line bg-surface p-3">
                    <h3 className="font-medium">{q.title || "Untitled question"}</h3>
                    <p className="mb-2 text-xs text-fg-muted">{vals.length} answer{vals.length === 1 ? "" : "s"}</p>
                    {hasOptions(q.type) ? (
                      <div className="space-y-1">
                        {(q.options ?? []).map((o) => (
                          <Bar key={o} label={o} n={vals.filter((v) => (Array.isArray(v) ? v.includes(o) : v === o)).length} total={vals.length} />
                        ))}
                      </div>
                    ) : q.type === "scale" ? (
                      <div className="space-y-1">
                        {Array.from({ length: q.max ?? 5 }, (_, i) => i + 1).map((n) => (
                          <Bar key={n} label={String(n)} n={vals.filter((v) => Number(v) === n).length} total={vals.length} />
                        ))}
                        <p className="text-xs text-fg-muted">
                          Average {vals.length ? (vals.reduce((a: number, v) => a + Number(v), 0) / vals.length).toFixed(1) : "–"}
                        </p>
                      </div>
                    ) : (
                      <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                        {vals.slice(-50).reverse().map((v, i) => (
                          <li key={i} className="rounded bg-bg px-2 py-1 ">{String(v)}</li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
