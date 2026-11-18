import { useState } from "react";
import * as Y from "yjs";
import type { EditorProps } from "./FilePanel";
import { useYObserve } from "../lib/useYDoc";
import {
  formMetaOf,
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

const input = "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

function QuestionCard({ q, ymap, index, total, onMove, onDelete }: { q: Question; ymap: Y.Map<any>; index: number; total: number; onMove: (d: -1 | 1) => void; onDelete: () => void }) {
  const options = q.options ?? [];
  const setOptions = (next: string[]) => ymap.set("options", next.slice(0, 20));
  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900" data-testid="form-question">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-zinc-400">{index + 1}</span>
        <input
          aria-label={`Question ${index + 1}`}
          className={`${input} min-w-0 flex-1 font-medium`}
          value={q.title}
          placeholder="Question"
          onChange={(e) => ymap.set("title", e.target.value.slice(0, 300))}
        />
        <select
          aria-label="Question type"
          className="rounded-md border border-zinc-300 bg-white px-1 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={q.type}
          onChange={(e) => {
            const type = e.target.value as QuestionType;
            ymap.doc!.transact(() => {
              ymap.set("type", type);
              if ((type === "choice" || type === "checkbox") && !options.length) ymap.set("options", ["Option 1", "Option 2"]);
              if (type === "scale" && !ymap.get("max")) ymap.set("max", 5);
            });
          }}
        >
          {QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>{QUESTION_LABEL[t]}</option>
          ))}
        </select>
      </div>
      {(q.type === "choice" || q.type === "checkbox") && (
        <ul className="mt-2 space-y-1 pl-5">
          {options.map((o, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="text-zinc-400" aria-hidden>{q.type === "choice" ? "○" : "☐"}</span>
              <input
                aria-label={`Option ${i + 1}`}
                className={input}
                value={o}
                onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value.slice(0, 120) : x)))}
              />
              <button onClick={() => setOptions(options.filter((_, j) => j !== i))} disabled={options.length <= 1} className="px-1 text-zinc-400 hover:text-red-600 disabled:opacity-30" aria-label={`Remove option ${i + 1}`}>
                ✕
              </button>
            </li>
          ))}
          <li>
            <button onClick={() => setOptions([...options, `Option ${options.length + 1}`])} className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
              + Add option
            </button>
          </li>
        </ul>
      )}
      {q.type === "scale" && (
        <label className="mt-2 flex items-center gap-2 pl-5 text-sm text-zinc-500">
          1 to
          <select aria-label="Scale maximum" className="rounded border border-zinc-300 bg-white px-1 dark:border-zinc-700 dark:bg-zinc-900" value={q.max ?? 5} onChange={(e) => ymap.set("max", Number(e.target.value))}>
            {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      )}
      <div className="mt-2 flex items-center gap-3 border-t border-zinc-100 pt-2 text-xs text-zinc-500 dark:border-zinc-800">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={!!q.required} onChange={(e) => ymap.set("required", e.target.checked)} /> Required
        </label>
        <span className="flex-1" />
        <button onClick={() => onMove(-1)} disabled={index === 0} className="rounded px-1 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800" aria-label="Move question up">↑</button>
        <button onClick={() => onMove(1)} disabled={index === total - 1} className="rounded px-1 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800" aria-label="Move question down">↓</button>
        <button onClick={onDelete} className="rounded px-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">Delete</button>
      </div>
    </li>
  );
}

function Bar({ label, n, total }: { label: string; n: number; total: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-32 shrink-0 truncate" title={label}>{label}</span>
      <span className="h-3 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
        <span className="block h-full rounded bg-indigo-500" style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
      </span>
      <span className="w-14 text-right text-xs text-zinc-500">{n} ({total ? Math.round((n / total) * 100) : 0}%)</span>
    </div>
  );
}

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
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 dark:border-zinc-800">
        <span>{synced ? "● Live" : "Connecting…"}</span>
        <div className="ml-2 flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800" role="tablist">
          {(["questions", "responses"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-md px-2 py-0.5 text-sm ${tab === t ? "bg-white font-medium text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100" : ""}`}
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
          onClick={() => {
            navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-md bg-indigo-600 px-2.5 py-1 font-semibold text-white hover:bg-indigo-500"
          data-testid="form-share"
          data-link={link}
        >
          {copied ? "Link copied!" : "🔗 Share link"}
        </button>
        <a href={link} target="_blank" rel="noreferrer" className="hover:text-zinc-900 dark:hover:text-zinc-100">Open ↗</a>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-50 p-4 dark:bg-zinc-950">
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
            <details className="mt-3">
              <summary className="cursor-pointer rounded-xl border border-dashed border-zinc-300 py-2 text-center text-sm text-zinc-500 hover:bg-white dark:border-zinc-700 dark:hover:bg-zinc-900" data-testid="add-question">
                + Add question
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
                {QUESTION_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={(e) => {
                      (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
                      ydoc.transact(() => qArr.push([makeQuestion({ type: t, title: "" })]), "user");
                    }}
                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm hover:border-indigo-300 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    {QUESTION_LABEL[t]}
                  </button>
                ))}
              </div>
            </details>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4" data-testid="form-responses">
            <div className="flex flex-wrap gap-2">
              <button
                disabled={!responses.length}
                onClick={() => download(`${safeName(file.title, "form")} responses.csv`, "text/csv", toCsv(responseRows(ydoc)))}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900"
              >
                ⬇ CSV
              </button>
              <button
                disabled={!responses.length}
                onClick={() => sendFromEditor({ t: "form_to_sheet", id: file.id })}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900"
                data-testid="form-to-sheet"
              >
                📊 Send to a sheet
              </button>
            </div>
            {!responses.length && <p className="text-sm text-zinc-500">No responses yet. Share the link and they'll show up here live.</p>}
            {!!responses.length &&
              questions.map((q) => {
                const vals = responses.map((r) => r.answers[q.id]).filter((v) => v !== undefined);
                return (
                  <section key={q.id} className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                    <h3 className="font-medium">{q.title || "Untitled question"}</h3>
                    <p className="mb-2 text-xs text-zinc-500">{vals.length} answer{vals.length === 1 ? "" : "s"}</p>
                    {q.type === "choice" || q.type === "checkbox" ? (
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
                        <p className="text-xs text-zinc-500">
                          Average {vals.length ? (vals.reduce((a: number, v) => a + Number(v), 0) / vals.length).toFixed(1) : "–"}
                        </p>
                      </div>
                    ) : (
                      <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                        {vals.slice(-50).reverse().map((v, i) => (
                          <li key={i} className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-800">{String(v)}</li>
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
