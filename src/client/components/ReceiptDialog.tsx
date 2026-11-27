import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, Download, Eye, ListChecks, Lock, MessageCircleQuestion, PenLine, Send, Sparkles, X } from "lucide-react";
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

/** One plain line on the student's card: an icon and a sentence. */
function Glance({ icon, children, testId }: { icon: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <li className="flex gap-2.5 py-1" data-testid={testId}>
      <span className="mt-0.5 shrink-0 text-fg-muted" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1 text-[15px]">{children}</div>
    </li>
  );
}

/**
 * What this person asked the AI tutor about, as one plain line: "Didn't use the AI tutor", or
 * how many questions and the topics (Cairn's summary of the questions, never the chat itself).
 */
function TutorLine({ p, you, final, done }: { p: ReceiptPerson; you: boolean; final: boolean; done: boolean }) {
  const n = p.tutorQuestions ?? 0;
  const Who = you ? "You" : p.name.split(" ")[0];
  const icon = <MessageCircleQuestion className="h-[18px] w-[18px]" />;
  if (n === 0)
    return (
      <Glance icon={icon} testId="receipt-tutor">
        <span data-testid="receipt-stuck-none">{you ? "You haven't used the AI tutor" : "Didn't use the AI tutor"}</span>
      </Glance>
    );
  if (p.stuck?.length)
    return (
      <Glance icon={icon} testId="receipt-tutor">
        Asked the AI tutor {plural(n, "question", "questions")}, mostly about:
        <ul className="mt-1 space-y-1" data-testid="receipt-stuck">
          {p.stuck.map((x, i) => (
            <li key={i} className="flex gap-2 text-fg-muted">
              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-peri" aria-hidden />
              <span>{x}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-fg-subtle">Cairn summed up the questions. The chat itself isn't shown{you ? ", and your teacher sees exactly this" : ""}.</p>
      </Glance>
    );
  return (
    <Glance icon={icon} testId="receipt-tutor">
      Asked the AI tutor {plural(n, "question", "questions")}
      <span className="block text-sm text-fg-muted" data-testid={final && !done ? "receipt-stuck-pending" : undefined}>
        {!final
          ? `When it's turned in, Cairn sums up what ${you ? "you" : "they"} asked about.`
          : !done
            ? "Cairn is summing up what they asked about. It shows here in a few seconds."
            : "Cairn couldn't sum up the questions this time."}
      </span>
    </Glance>
  );
}

/** "Wrote 17 words and made 3 slides": what this person has in the files, as a sentence. */
function wroteLine(p: Parameters<typeof workLine>[0], you: boolean) {
  const line = workLine(p);
  if (line === "Nothing in the files yet") return you ? "You haven't written anything in the files yet" : "Hasn't written anything in the files yet";
  return `Wrote ${line.replace(/ · /g, ", ")}`;
}

/** A short, foldable guide to every part of the receipt (folded until opened). */
function HowToRead() {
  const KEY = "cairn.receiptGuide";
  // Folded by default: each card says what it means in plain words now.
  const [open, setOpen] = useState(false);
  const toggle = () => {
    setOpen((o) => !o);
    try {
      localStorage.setItem(KEY, "seen");
    } catch {
      /* private mode */
    }
  };
  return (
    <div className="mb-4 rounded-xl border border-line bg-surface-2/60" data-testid="receipt-guide">
      <button type="button" onClick={toggle} aria-expanded={open} className="press flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] font-semibold">
        <span className="flex-1">How to read this receipt</span>
        <ChevronDown className={`h-4 w-4 text-fg-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <ul className="space-y-1.5 px-3.5 pb-3 text-xs leading-relaxed text-fg-muted">
          <li>
            <b className="text-fg">Words and items</b>: what each person wrote that's still in the files. Text the AI wrote counts for whoever asked for it, and is listed separately below.
          </li>
          <li>
            <b className="text-fg">What they asked the AI tutor about</b>: a few short points Cairn writes at turn-in from each student's questions to the tutor. Not the chat itself.
          </li>
          <li>
            <b className="text-fg">Chat messages</b>: only how many were sent. Nobody's messages are shown.
          </li>
          <li>
            <b className="text-fg">Files and Timeline</b>: who wrote how much of each file, and what happened on each day. Open a doc and press Replay to watch it being written.
          </li>
          <li>Students see this same receipt before and after they turn in.</li>
        </ul>
      )}
    </div>
  );
}

/** Opens a printable copy; the browser's print dialog saves it as a PDF. */
function printReceipt(r: Receipt) {
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) return;
  const people = r.people
    .map(
      (p) => `<section><h3>${esc(p.name)}${p.role ? ` <span class="muted">(${esc(p.role)})</span>` : ""}</h3><p>${esc(workLine(p))}</p>
      ${p.tasks?.length ? `<p>Tasks: ${p.tasks.filter((t) => t.done).length} of ${p.tasks.length} done (${p.tasks.map((t) => esc((t.done ? "✓ " : "") + t.title)).join(", ")})</p>` : ""}
      <p class="muted">${plural(p.filesCreated, "file", "files")} created · ${plural(p.messages, "chat message", "chat messages")} · active ${plural(p.daysActive, "day", "days")}${p.aiAsks ? ` · asked the AI to make or change files ${plural(p.aiAsks, "time", "times")}` : ""}${p.tutorQuestions ? ` · asked the tutor ${plural(p.tutorQuestions, "question", "questions")}` : ""}</p>
      ${p.stuck?.length ? `<p><b>Where they got stuck:</b> ${p.stuck.map(esc).join("; ")}</p>` : ""}
      ${p.note ? `<blockquote>${esc(p.note)}</blockquote>` : ""}</section>`,
    )
    .join("");
  const files = r.files
    .map((f) => {
      const rows = Object.entries(f.shares)
        .map(([uid, s]) => `<li>${esc(uid === "ai" ? "Cairn AI" : (r.people.find((p) => p.uid === uid)?.name ?? "Someone"))}: ${esc(workLine({ words: s.words, units: s.units ? { [f.kind]: s.units } : {} }))}</li>`)
        .join("");
      return `<h4>${esc(f.title)} <span class="muted">(${esc(FILE_INFO[f.kind].label)})</span></h4><ul>${rows || "<li>Empty</li>"}</ul>`;
    })
    .join("");
  const days = r.days
    .map(
      (d) =>
        `<li><b>${esc(dayLabel(d.day))}</b>: ${Object.entries(d.people)
          .map(([uid, e]) => `${esc(r.people.find((p) => p.uid === uid)?.name ?? "Someone")} (${[e.words ? `~${plural(e.words, "word", "words")}` : "", ...e.files.map(esc), e.messages ? plural(e.messages, "message", "messages") : "", ...(e.pastes ?? []).map((p) => `pasted ~${p.words} words at ${new Date(p.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`)].filter(Boolean).join(", ")})`)
          .join("; ")}</li>`,
    )
    .join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Contribution receipt: ${esc(r.title)}</title>
  <style>body{font:14px/1.5 system-ui,sans-serif;color:#111;max-width:720px;margin:32px auto;padding:0 16px}h1{font-size:22px;margin:0}h2{font-size:16px;margin:24px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}h3{margin:12px 0 2px;font-size:15px}h4{margin:10px 0 2px}p{margin:2px 0}.muted{color:#666}blockquote{margin:6px 0;padding:6px 10px;border-left:3px solid #ccc;color:#333}ul{margin:2px 0;padding-left:20px}</style></head><body>
  <h1>Contribution receipt: ${esc(r.title)}</h1>
  <p class="muted">${r.final && r.turnedInAt ? `Turned in ${esc(new Date(r.turnedInAt).toLocaleString())}` : `Live receipt, ${esc(new Date(r.generatedAt).toLocaleString())}`}. Counts what's in the project's files now and who wrote it. Chat messages are counted, never shown.</p>
  <h2>People</h2>${people || "<p>No work yet.</p>"}
  ${r.aiWords || r.aiUnits ? `<p class="muted">Cairn AI wrote ${esc(plural(r.aiWords, "word", "words"))}${r.aiUnits ? ` and ${r.aiUnits} other items` : ""} that are still in the files.</p>` : ""}
  <h2>Files</h2>${files || "<p>No files.</p>"}
  <h2>Timeline</h2><ul>${days || "<li>No activity yet.</li>"}</ul>
  <script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

/** Stacked bar of who has what in one file (people plus Cairn AI). */
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
  embedded = false,
  reflection,
  solo = false,
}: {
  receipt?: Receipt;
  meUid: string;
  isHost: boolean;
  mode: "view" | "turnin";
  send: (m: ClientMsg) => void;
  onClose: () => void;
  /** Shown inside another page (the teacher's grading screen) instead of as a dialog. */
  embedded?: boolean;
  /** The teacher's reflection question: the student's note answers it, and is required to turn in. */
  reflection?: string;
  /** A student's own room (not a group's): the words say "you", not "your group". */
  solo?: boolean;
}) {
  const r = receipt;
  // Ask for a fresh receipt on open, and keep a live one current while it's open.
  useEffect(() => {
    if (embedded) return;
    send({ t: "receipt" });
    const t = setInterval(() => send({ t: "receipt" }), 15_000);
    return () => clearInterval(t);
  }, [send, embedded]);
  useEffect(() => {
    if (embedded) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [embedded, onClose]);
  const mine = r?.people.find((p) => p.uid === meUid);
  const [note, setNote] = useState(mine?.note ?? "");
  const [noteSaved, setNoteSaved] = useState(false);
  useEffect(() => setNote(mine?.note ?? ""), [mine?.note]);
  const [preview, setPreview] = useState(false);
  const colorOf = useMemo(() => {
    const map = new Map(r?.people.map((p, i) => [p.uid, PALETTE[i % PALETTE.length]]) ?? []);
    return (uid: string) => (uid === "ai" ? AI_COLOR : (map.get(uid) ?? "#6b7280"));
  }, [r]);
  const nameOf = (uid: string) => (uid === "ai" ? "Cairn AI" : (r?.people.find((p) => p.uid === uid)?.name ?? "Someone"));
  const editable = !!r && !r.final && !isHost && !preview;
  const totalWords = r?.people.reduce((t, p) => t + p.words, 0) ?? 0;
  const saveNote = () => {
    send({ t: "receipt_note", text: note });
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 1500);
  };
  // Where you write your note (or answer the teacher's reflection question).
  const noteBox = (
        <div className="mt-2">
          {reflection && (
            <p className="mb-1 text-sm font-medium" data-testid="reflection-question">
              {reflection}
            </p>
          )}
          <textarea
            aria-label={reflection ?? "Your note for the receipt"}
            value={note}
            maxLength={500}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
            placeholder={reflection ? "Your answer (your teacher will read this)" : "Add a note about your part (e.g. I did the research at the library)"}
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
  );

  return (
    <div
      className={embedded ? "flex h-full min-h-0" : "fade fixed inset-0 z-50 flex items-stretch justify-center bg-black/45 backdrop-blur-[2px] sm:items-center sm:p-6"}
      onClick={embedded ? undefined : onClose}
    >
      <div
        role={embedded ? "region" : "dialog"}
        aria-modal={embedded ? undefined : true}
        aria-label="Contribution receipt"
        className={
          embedded
            ? "flex min-h-0 w-full flex-col overflow-hidden"
            : "modal-in flex h-[100dvh] w-full flex-col overflow-hidden bg-surface shadow-[0_40px_100px_-30px_rgba(0,0,0,0.5)] sm:h-auto sm:max-h-[88vh] sm:w-[min(80vw,1080px)] sm:rounded-[28px] sm:border sm:border-line"
        }
        onClick={(e) => e.stopPropagation()}
        data-testid="receipt"
      >
        <div className="flex items-start gap-3 border-b border-line px-6 pb-4 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className={embedded ? "text-xl font-semibold tracking-tight" : "font-display text-[1.6rem] font-extrabold leading-tight tracking-[-0.02em]"}>{mode === "turnin" ? "Check your receipt, then turn it in" : "Contribution receipt"}</h2>
            <p className="mt-0.5 text-sm text-fg-muted">
              {r?.final && r.turnedInAt ? (
                <span className="inline-flex items-center gap-1">
                  <Lock className="h-3.5 w-3.5" aria-hidden /> Final, turned in {new Date(r.turnedInAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              ) : (
                solo ? "Live: it updates as you work." : "Live: it updates as your group works."
              )}
            </p>
          </div>
          {r && (
            <button onClick={() => printReceipt(r)} className="press flex items-center gap-1 rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium hover:bg-surface-2" data-testid="receipt-pdf">
              <Download className="h-3.5 w-3.5" /> PDF
            </button>
          )}
          {!embedded && (
            <button onClick={onClose} className="press rounded-full p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Close receipt">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {!isHost && (
            <div className="flex items-start gap-2.5 rounded-xl border border-line bg-sidebar px-3.5 py-2.5 text-[13px] text-fg-muted">
              <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="flex-1">
                <b className="font-medium text-fg">Your teacher sees exactly this</b> once you turn it in: what's in the files and who wrote it. Never your chat, only how many messages. At turn-in, Cairn also sums up what you asked the tutor.
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

          {mode === "turnin" && reflection && !preview && (
            <section className="rounded-2xl border-2 border-primary/60 bg-mint/30 px-4 py-3 dark:bg-mint/10" aria-label="Before you turn it in" data-testid="turnin-question">
              <div className="text-xs font-bold uppercase tracking-[0.08em] text-fg-muted">Before you turn it in</div>
              {noteBox}
            </section>
          )}
          {!r ? (
            <p className="text-sm text-fg-subtle">Adding up everyone's work…</p>
          ) : (
            <>
              <section aria-label="People">
                <HowToRead />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">People</h3>
                {r.people.length === 0 && <p className="mt-2 text-sm text-fg-subtle">Nobody has worked on the project yet.</p>}
                <ul className="mt-2 space-y-2">
                  {r.people.map((p) => (
                    <li key={p.uid} className="rounded-2xl border border-line px-4 py-3" data-testid="receipt-person">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(p.uid) }} aria-hidden />
                        <span className="text-[17px] font-semibold">{p.name}</span>
                        {p.uid === meUid && <span className="text-xs text-fg-subtle">(you)</span>}
                        {p.role && <span className="rounded-full border border-line px-2 py-0.5 text-xs text-fg-muted">{p.role}</span>}
                      </div>
                      <ul className="mt-2" aria-label={`${p.name} at a glance`}>
                        <Glance icon={<PenLine className="h-[18px] w-[18px]" />}>
                          <span className="tabular" data-testid="receipt-work">
                            {wroteLine(p, p.uid === meUid)}
                          </span>
                          {totalWords > 0 && p.words > 0 && r.people.length > 1 && (
                            <span className="text-fg-muted"> ({Math.round((p.words / totalWords) * 100)}% of the group's words)</span>
                          )}
                        </Glance>
                        <TutorLine p={p} you={p.uid === meUid} final={!!r.final} done={!!r.tutorSummaryDone} />
                        {p.aiAsks > 0 && (
                          <Glance icon={<Sparkles className="h-[18px] w-[18px]" />}>Asked the AI to write or change files {plural(p.aiAsks, "time", "times")}</Glance>
                        )}
                        <Glance icon={<CalendarDays className="h-[18px] w-[18px]" />}>
                          {p.daysActive ? <>Worked on {plural(p.daysActive, "day", "days")}</> : "No work in the room yet"}
                          <span className="text-fg-muted">
                            {" "}
                            · {plural(p.messages, "chat message", "chat messages")}
                            {p.filesCreated > 0 && <> · made {plural(p.filesCreated, "file", "files")}</>}
                          </span>
                        </Glance>
                        {p.tasks && p.tasks.length > 0 && (
                          <Glance icon={<ListChecks className="h-[18px] w-[18px]" />} testId="receipt-tasks">
                            Did {p.tasks.filter((t) => t.done).length} of {plural(p.tasks.length, "task", "tasks")}
                            <span className="block text-sm text-fg-muted">{p.tasks.map((t) => `${t.done ? "✓ " : ""}${t.title}`).join(", ")}</span>
                          </Glance>
                        )}
                      </ul>
                      {p.uid === meUid && editable ? (
                        mode === "turnin" && reflection ? null : noteBox
                      ) : (
                        p.note && (
                          <div className="mt-3 rounded-xl bg-surface-2 px-3.5 py-2.5" data-testid="receipt-person-note">
                            <div className="text-xs font-semibold text-fg-subtle">
                              {reflection ? reflection : p.uid === meUid ? "Your note when turning in" : `${p.name.split(" ")[0]}'s note when turning in`}
                            </div>
                            <p className="mt-0.5 whitespace-pre-wrap text-[15px]">{p.note}</p>
                          </div>
                        )
                      )}
                    </li>
                  ))}
                </ul>
                {editable && !mine && (
                  <div className="mt-2 rounded-2xl border border-dashed border-line px-4 py-3" data-testid="my-note-card">
                    <div className="text-sm font-medium">You</div>
                    <p className="text-xs text-fg-subtle">Nothing of yours is in the files yet.</p>
                    {mode === "turnin" && reflection ? null : noteBox}
                  </div>
                )}
                {(r.aiWords > 0 || r.aiUnits > 0) && (
                  <p className="mt-2 flex items-center gap-2 text-xs text-fg-subtle">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: AI_COLOR }} aria-hidden />
                    Cairn AI wrote {plural(r.aiWords, "word", "words")}
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
                              {[
                                e.words ? `~${plural(e.words, "word", "words")}` : "",
                                e.files.join(", "),
                                e.messages ? plural(e.messages, "message", "messages") : "",
                              ]
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                            {e.pastes?.map((p) => (
                              <span key={p.at} className="ml-1 rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-muted" data-testid="timeline-paste">
                                pasted ~{p.words} words, {new Date(p.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                              </span>
                            ))}
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-6 py-4">
            <p className="min-w-[12rem] flex-1 text-sm text-fg-subtle">
              {reflection && !note.trim()
                ? "Answer the question at the top to turn it in."
                : solo
                  ? "Turning in locks your files and this receipt. Your teacher can reopen it."
                  : "Turning in locks the files and this receipt for the whole group. Your teacher can reopen it."}
            </p>
            <button onClick={onClose} className="press rounded-xl px-4 py-2 text-[15px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg">
              Not yet
            </button>
            <button
              onClick={() => {
                if (note !== (mine?.note ?? "")) send({ t: "receipt_note", text: note });
                send({ t: "turn_in" });
                onClose();
              }}
              disabled={!r || (!!reflection && !note.trim())}
              className="ledge-btn min-w-[180px] px-5 disabled:opacity-40"
              data-testid="confirm-turn-in"
            >
              <Send className="h-4 w-4" /> {solo ? "Turn it in" : "Turn in for the group"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
