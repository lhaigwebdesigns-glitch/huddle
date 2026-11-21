import { useEffect, useMemo, useState } from "react";
import { Download, Eye, Lock, Send, X } from "lucide-react";
import type { ClientMsg, Receipt, ReceiptPerson } from "../../shared/protocol";
import { FILE_INFO, type FileKind } from "../../shared/files";
import { UNIT_LABEL } from "../../shared/contrib";
import { FileIcon } from "./FileIcon";

const PALETTE = ["#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#0891b2", "#dc2626", "#4d7c0f"];
const AI_COLOR = "#9ca3af";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

/** "412 words · 3 slides · 12 cells": everything a person has in the files, by kind. */
export function workLine(p: Pick<ReceiptPerson, "words" | "units">) {
  const parts = [p.words ? plural(p.words, "word", "words") : ""];
  for (const [kind, n] of Object.entries(p.units) as [FileKind, number][]) {
    const label = UNIT_LABEL[kind];
    if (n && label) parts.push(plural(n, label[0], label[1]));
  }
  return parts.filter(Boolean).join(" · ") || "Nothing in the files yet";
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Opens a printable copy; the browser's print dialog saves it as a PDF. */
function printReceipt(r: Receipt) {
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) return;
  const people = r.people
    .map(
      (p) => `<section><h3>${esc(p.name)}${p.role ? ` <span class="muted">(${esc(p.role)})</span>` : ""}</h3><p>${esc(workLine(p))}</p>
      ${p.tasks?.length ? `<p>Tasks: ${p.tasks.filter((t) => t.done).length} of ${p.tasks.length} done (${p.tasks.map((t) => esc((t.done ? "✓ " : "") + t.title)).join(", ")})</p>` : ""}
      <p class="muted">${plural(p.filesCreated, "file", "files")} created · ${plural(p.messages, "chat message", "chat messages")} · active ${plural(p.daysActive, "day", "days")}${p.aiAsks ? ` · asked the AI to make or change files ${plural(p.aiAsks, "time", "times")}` : ""}</p>
      ${p.note ? `<blockquote>${esc(p.note)}</blockquote>` : ""}</section>`,
    )
    .join("");
  const files = r.files
    .map((f) => {
      const rows = Object.entries(f.shares)
        .map(([uid, s]) => `<li>${esc(uid === "ai" ? "Huddle AI" : (r.people.find((p) => p.uid === uid)?.name ?? "Someone"))}: ${esc(workLine({ words: s.words, units: s.units ? { [f.kind]: s.units } : {} }))}</li>`)
        .join("");
      return `<h4>${esc(f.title)} <span class="muted">(${esc(FILE_INFO[f.kind].label)})</span></h4><ul>${rows || "<li>Empty</li>"}</ul>`;
    })
    .join("");
  const days = r.days
    .map(
      (d) =>
        `<li><b>${esc(dayLabel(d.day))}</b>: ${Object.entries(d.people)
          .map(([uid, e]) => `${esc(r.people.find((p) => p.uid === uid)?.name ?? "Someone")} (${[...e.files.map(esc), e.messages ? plural(e.messages, "message", "messages") : ""].filter(Boolean).join(", ")})`)
          .join("; ")}</li>`,
    )
    .join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Contribution receipt: ${esc(r.title)}</title>
  <style>body{font:14px/1.5 system-ui,sans-serif;color:#111;max-width:720px;margin:32px auto;padding:0 16px}h1{font-size:22px;margin:0}h2{font-size:16px;margin:24px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}h3{margin:12px 0 2px;font-size:15px}h4{margin:10px 0 2px}p{margin:2px 0}.muted{color:#666}blockquote{margin:6px 0;padding:6px 10px;border-left:3px solid #ccc;color:#333}ul{margin:2px 0;padding-left:20px}</style></head><body>
  <h1>Contribution receipt: ${esc(r.title)}</h1>
  <p class="muted">${r.final && r.turnedInAt ? `Turned in ${esc(new Date(r.turnedInAt).toLocaleString())}` : `Live receipt, ${esc(new Date(r.generatedAt).toLocaleString())}`}. Counts what's in the project's files now and who wrote it. Chat messages are counted, never shown.</p>
  <h2>People</h2>${people || "<p>No work yet.</p>"}
  ${r.aiWords || r.aiUnits ? `<p class="muted">Huddle AI wrote ${esc(plural(r.aiWords, "word", "words"))}${r.aiUnits ? ` and ${r.aiUnits} other items` : ""} that are still in the files.</p>` : ""}
  <h2>Files</h2>${files || "<p>No files.</p>"}
  <h2>Timeline</h2><ul>${days || "<li>No activity yet.</li>"}</ul>
  <script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

/** Stacked bar of who has what in one file (people plus Huddle AI). */
function FileBar({ shares, colorOf, kind }: { shares: Record<string, { words: number; units: number }>; colorOf: (uid: string) => string; kind: FileKind }) {
  // Slides, sheets, forms and boards are measured in their units; docs in words.
  const measure = (s: { words: number; units: number }) => (UNIT_LABEL[kind] ? s.units || s.words / 50 : s.words);
  const total = Object.values(shares).reduce((t, s) => t + measure(s), 0);
  if (!total) return <div className="h-2 rounded-full bg-surface-2" />;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
      {Object.entries(shares).map(([uid, s]) => (
        <span key={uid} style={{ width: `${(measure(s) / total) * 100}%`, background: colorOf(uid) }} />
      ))}
    </div>
  );
}

/**
 * The contribution receipt: what each student has in the files, the files they made, how much
 * they chatted (a count, never the messages), the days they worked, and their own note.
 * In "turnin" mode it's the group's last look before turning the project in.
 */
export function ReceiptDialog({
  receipt,
  meUid,
  isHost,
  mode,
  send,
  onClose,
}: {
  receipt?: Receipt;
  meUid: string;
  isHost: boolean;
  mode: "view" | "turnin";
  send: (m: ClientMsg) => void;
  onClose: () => void;
}) {
  const r = receipt;
  // Ask for a fresh receipt on open, and keep a live one current while it's open.
  useEffect(() => {
    send({ t: "receipt" });
    const t = setInterval(() => send({ t: "receipt" }), 15_000);
    return () => clearInterval(t);
  }, [send]);
  const mine = r?.people.find((p) => p.uid === meUid);
  const [note, setNote] = useState(mine?.note ?? "");
  const [noteSaved, setNoteSaved] = useState(false);
  useEffect(() => setNote(mine?.note ?? ""), [mine?.note]);
  const [preview, setPreview] = useState(false);
  const colorOf = useMemo(() => {
    const map = new Map(r?.people.map((p, i) => [p.uid, PALETTE[i % PALETTE.length]]) ?? []);
    return (uid: string) => (uid === "ai" ? AI_COLOR : (map.get(uid) ?? "#6b7280"));
  }, [r]);
  const nameOf = (uid: string) => (uid === "ai" ? "Huddle AI" : (r?.people.find((p) => p.uid === uid)?.name ?? "Someone"));
  const editable = !!r && !r.final && !isHost && !preview;
  const saveNote = () => {
    send({ t: "receipt_note", text: note });
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Contribution receipt"
        className="pop flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-line bg-surface shadow-[0_30px_80px_-20px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
        data-testid="receipt"
      >
        <div className="flex items-start gap-3 border-b border-line px-6 pb-4 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold tracking-tight">{mode === "turnin" ? "Check your receipt, then turn it in" : "Contribution receipt"}</h2>
            <p className="mt-0.5 text-sm text-fg-muted">
              {r?.final && r.turnedInAt ? (
                <span className="inline-flex items-center gap-1">
                  <Lock className="h-3.5 w-3.5" aria-hidden /> Final, turned in {new Date(r.turnedInAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              ) : (
                "Live: it updates as your group works."
              )}
            </p>
          </div>
          {r && (
            <button onClick={() => printReceipt(r)} className="press flex items-center gap-1 rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium hover:bg-surface-2" data-testid="receipt-pdf">
              <Download className="h-3.5 w-3.5" /> PDF
            </button>
          )}
          <button onClick={onClose} className="press rounded-full p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Close receipt">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {!isHost && (
            <div className="flex items-start gap-2.5 rounded-xl border border-line bg-sidebar px-3.5 py-2.5 text-[13px] text-fg-muted">
              <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="flex-1">
                <b className="font-medium text-fg">This is exactly what your teacher sees</b> once you turn it in. It counts what's in the files and who wrote it. Your chat is never shown,
                only how many messages each person sent.
              </div>
              <button
                onClick={() => setPreview((p) => !p)}
                aria-pressed={preview}
                className="press shrink-0 rounded-lg border border-line-strong px-2 py-0.5 text-xs font-medium text-fg hover:bg-surface-2"
                data-testid="teacher-preview"
              >
                {preview ? "Back to editing" : "Teacher's view"}
              </button>
            </div>
          )}

          {!r ? (
            <p className="text-sm text-fg-subtle">Adding up everyone's work…</p>
          ) : (
            <>
              <section aria-label="People">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">People</h3>
                {r.people.length === 0 && <p className="mt-2 text-sm text-fg-subtle">Nobody has worked on the project yet.</p>}
                <ul className="mt-2 space-y-2">
                  {r.people.map((p) => (
                    <li key={p.uid} className="rounded-2xl border border-line px-4 py-3" data-testid="receipt-person">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(p.uid) }} aria-hidden />
                        <span className="font-medium">{p.name}</span>
                        {p.uid === meUid && <span className="text-xs text-fg-subtle">(you)</span>}
                        {p.role && <span className="rounded-full border border-line px-2 py-0.5 text-xs text-fg-muted">{p.role}</span>}
                      </div>
                      <p className="mt-1 text-sm tabular" data-testid="receipt-work">
                        {workLine(p)}
                      </p>
                      <p className="mt-0.5 text-xs text-fg-subtle tabular">
                        {plural(p.filesCreated, "file", "files")} created · {plural(p.messages, "chat message", "chat messages")} · active {plural(p.daysActive, "day", "days")}
                        {p.aiAsks > 0 && <> · asked the AI to make or change files {plural(p.aiAsks, "time", "times")}</>}
                      </p>
                      {p.tasks && p.tasks.length > 0 && (
                        <p className="mt-1 text-xs text-fg-muted" data-testid="receipt-tasks">
                          Tasks: {p.tasks.filter((t) => t.done).length} of {p.tasks.length} done ({p.tasks.map((t) => `${t.done ? "✓ " : ""}${t.title}`).join(", ")})
                        </p>
                      )}
                      {p.uid === meUid && editable ? (
                        <div className="mt-2">
                          <textarea
                            aria-label="Your note for the receipt"
                            value={note}
                            maxLength={500}
                            rows={2}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Add a note about your part (e.g. I did the research at the library)"
                            className="w-full rounded-xl border border-line-strong bg-transparent px-3 py-2 text-sm outline-none focus:border-fg/40"
                            data-testid="receipt-note"
                          />
                          <div className="mt-1 flex items-center gap-2">
                            <button onClick={saveNote} className="press rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-fg hover:bg-primary-hover" data-testid="receipt-note-save">
                              Save note
                            </button>
                            {noteSaved && <span className="text-xs text-fg-subtle">Saved</span>}
                          </div>
                        </div>
                      ) : (
                        p.note && <blockquote className="mt-2 border-l-2 border-line-strong pl-3 text-sm text-fg-muted">{p.note}</blockquote>
                      )}
                    </li>
                  ))}
                </ul>
                {(r.aiWords > 0 || r.aiUnits > 0) && (
                  <p className="mt-2 flex items-center gap-2 text-xs text-fg-subtle">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: AI_COLOR }} aria-hidden />
                    Huddle AI wrote {plural(r.aiWords, "word", "words")}
                    {r.aiUnits > 0 && <> and {r.aiUnits} other items</>} that are still in the files, credited above to whoever asked.
                  </p>
                )}
              </section>

              <section aria-label="Files">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Files</h3>
                {r.files.length === 0 && <p className="mt-2 text-sm text-fg-subtle">No files yet.</p>}
                <ul className="mt-2 space-y-3">
                  {r.files.map((f) => (
                    <li key={f.id}>
                      <div className="flex items-center gap-2 text-sm">
                        <FileIcon kind={f.kind} className="h-4 w-4 shrink-0 text-fg-muted" />
                        <span className="min-w-0 truncate font-medium">{f.title}</span>
                      </div>
                      <div className="mt-1.5">
                        <FileBar shares={f.shares} colorOf={colorOf} kind={f.kind} />
                      </div>
                      <p className="mt-1 text-xs text-fg-subtle">
                        {Object.entries(f.shares)
                          .map(([uid, s]) => `${nameOf(uid)}: ${workLine({ words: s.words, units: s.units ? { [f.kind]: s.units } : {} })}`)
                          .join(" · ") || "Empty"}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-label="Timeline">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Timeline</h3>
                {r.days.length === 0 && <p className="mt-2 text-sm text-fg-subtle">No activity yet.</p>}
                <ol className="mt-2 space-y-1.5 text-sm">
                  {r.days.map((d) => (
                    <li key={d.day} className="flex gap-3">
                      <span className="w-24 shrink-0 text-fg-subtle tabular">{dayLabel(d.day)}</span>
                      <span className="min-w-0">
                        {Object.entries(d.people).map(([uid, e], i) => (
                          <span key={uid}>
                            {i > 0 && <span className="text-fg-subtle"> · </span>}
                            <span className="font-medium">{nameOf(uid)}</span>{" "}
                            <span className="text-fg-muted">
                              {[e.files.join(", "), e.messages ? plural(e.messages, "message", "messages") : ""].filter(Boolean).join(", ")}
                            </span>
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </div>

        {mode === "turnin" && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-4">
            <p className="min-w-0 flex-1 text-xs text-fg-subtle">Turning in locks the files and this receipt for the whole group. Your teacher can reopen it.</p>
            <button onClick={onClose} className="press rounded-lg px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg">
              Not yet
            </button>
            <button
              onClick={() => {
                if (note !== (mine?.note ?? "")) send({ t: "receipt_note", text: note });
                send({ t: "turn_in" });
                onClose();
              }}
              disabled={!r}
              className="press flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-40"
              data-testid="confirm-turn-in"
            >
              <Send className="h-4 w-4" /> Turn in for the group
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
