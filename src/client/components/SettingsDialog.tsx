import { confirmDialog } from "./Dialogs";
import { Modal } from "./Modal";
import type { Ban, ClientMsg, Member, RoomSettings, RubricGrid, SkillInfo } from "../../shared/protocol";
import { PartyLists } from "./PartyLists";
import { hasWebGPU, LOCAL_MODELS } from "../lib/local-llm";
import { useState } from "react";
import { formatCode } from "../../shared/code";
import { X } from "lucide-react";
import { ThemeToggle } from "./ui";
import { EMPTY_PROJECT, ProjectEditor, type ProjectDraft } from "./ProjectEditor";
import type { Schedule } from "../../shared/schedule";

/** Host only: turn the room into a school project and set its rules. */
function ProjectSection({ settings, members, send }: { settings: RoomSettings; members: Member[]; send: (m: ClientMsg) => void }) {
  const saved = settings.project;
  const [draft, setDraft] = useState<ProjectDraft>(() => (saved ? { ...saved } : EMPTY_PROJECT));
  const [msg, setMsg] = useState("");
  const save = (d: ProjectDraft) => {
    // null clears a due date or schedule that was removed.
    send({ t: "settings", patch: { project: { ...d, dueAt: (d.dueAt ?? null) as number | undefined, schedule: (d.schedule ?? null) as Schedule | undefined, rubricGrid: (d.rubricGrid ?? null) as RubricGrid | undefined } } });
    setMsg("Saved");
    setTimeout(() => setMsg(""), 1500);
  };
  return (
    <div className="rounded-2xl border border-line px-4 py-3" data-testid="project-section">
      <label className="flex items-center justify-between gap-3">
        <span>
          <span className="text-sm font-medium">School project</span>
          <span className="block text-xs text-fg-subtle">Add instructions, a due date and AI rules for a group assignment.</span>
        </span>
        <input
          type="checkbox"
          checked={!!saved}
          data-testid="project-toggle"
          aria-label="Make this a project"
          onChange={async (e) => {
            if (e.target.checked) return save(draft);
            if (await confirmDialog({ title: "Stop treating this as a project?", message: "Its instructions and AI rules will be removed.", confirmLabel: "Stop", danger: true }))
              send({ t: "settings", patch: { project: null } });
          }}
        />
      </label>
      {saved && (
        <div className="mt-3">
          <ProjectEditor value={draft} onChange={setDraft} members={members} hostId={settings.hostId} compact />
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={() => save(draft)} className="press rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:bg-primary-hover" data-testid="project-save">
              Save project
            </button>
            {msg && <span className="text-xs text-fg-subtle" role="status">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Custom assistant: name + standing instructions, shareable between rooms by code. */
function AssistantEditor({ settings, patch }: { settings: RoomSettings; patch: (p: Partial<RoomSettings>) => void }) {
  const [name, setName] = useState(settings.assistant?.name ?? "");
  const [instructions, setInstructions] = useState(settings.assistant?.instructions ?? "");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const dirty = name !== (settings.assistant?.name ?? "") || instructions !== (settings.assistant?.instructions ?? "");
  return (
    <div data-testid="assistant-editor">
      <span className="text-sm font-medium">🤖 Custom assistant</span>
      <span className="block text-xs text-zinc-500">Give the room's AI a name and standing instructions (a persona, a tutor for one subject, a strict editor…).</span>
      <input
        aria-label="Assistant name"
        placeholder="Name (e.g. Coach Kai)"
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        className="mt-2 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-sm dark:border-zinc-700"
      />
      <textarea
        aria-label="Assistant instructions"
        placeholder="Instructions (e.g. You are a patient physics tutor. Ask a question back before giving answers.)"
        value={instructions}
        maxLength={4000}
        rows={3}
        onChange={(e) => setInstructions(e.target.value)}
        className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-sm dark:border-zinc-700"
      />
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
        <button type="button" disabled={!dirty} onClick={() => patch({ assistant: { name, instructions } })} className="rounded-lg bg-primary px-3 py-1 font-medium text-primary-fg disabled:opacity-40" data-testid="assistant-apply">
          Apply to room
        </button>
        <button
          type="button"
          disabled={!name && !instructions}
          onClick={async () => {
            const r = await fetch("/api/assistants", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, instructions }) });
            const d = (await r.json()) as { code?: string; error?: string };
            setMsg(d.code ? `Share code: ${formatCode(d.code)} (load it in any room)` : (d.error ?? "Couldn't save"));
          }}
          className="rounded-lg border border-zinc-300 px-3 py-1 disabled:opacity-40 dark:border-zinc-700"
          data-testid="assistant-share"
        >
          Get share code
        </button>
        {settings.assistant && (
          <button type="button" onClick={() => (patch({ assistant: null as unknown as undefined }), setName(""), setInstructions(""))} className="text-xs text-red-600 hover:underline">
            Reset to Cairn AI
          </button>
        )}
      </div>
      <div className="mt-1 flex gap-2">
        <input aria-label="Assistant code" placeholder="Load from code" value={code} maxLength={7} onChange={(e) => setCode(e.target.value)} className="w-32 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 font-mono text-sm uppercase dark:border-zinc-700" />
        <button
          type="button"
          disabled={code.replace(/\W/g, "").length !== 6}
          onClick={async () => {
            const r = await fetch(`/api/assistants/${encodeURIComponent(code.replace(/\W/g, ""))}`);
            const d = (await r.json()) as { name?: string; instructions?: string; error?: string };
            if (!r.ok) return setMsg(d.error ?? "Not found");
            setName(d.name ?? "");
            setInstructions(d.instructions ?? "");
            setMsg("Loaded. Press “Apply to room” to use it.");
          }}
          className="rounded-lg border border-zinc-300 px-3 py-1 text-sm disabled:opacity-40 dark:border-zinc-700"
        >
          Load
        </button>
      </div>
      {msg && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400" role="status" data-testid="assistant-msg">{msg}</p>}
    </div>
  );
}

export function SettingsDialog({
  settings,
  isHost,
  skills,
  providers,
  members,
  me,
  memory,
  bans,
  send,
  onClose,
}: {
  bans: Ban[];
  settings: RoomSettings;
  isHost: boolean;
  skills: SkillInfo[];
  providers: string[];
  members: Member[];
  me: Member;
  memory: string[];
  send: (m: ClientMsg) => void;
  onClose: () => void;
}) {
  const patch = (p: Partial<RoomSettings>) => send({ t: "settings", patch: p });
  const disabled = !isHost;
  return (
    <Modal title="Room settings" subtitle={isHost ? "Changes apply for everyone in the room right away." : "Only the host can change these."} onClose={onClose} testId="settings-dialog" closeLabel="Close settings">
      <div className="settings-cols">
        <div className="flex items-center justify-between rounded-2xl border border-line px-4 py-3">
          <span className="text-sm font-medium">Appearance</span>
          <ThemeToggle />
        </div>

        <fieldset disabled={disabled} className="contents disabled:opacity-60">
          {isHost && <ProjectSection settings={settings} members={members} send={send} />}
          <label className="block">
            <span className="text-sm font-medium">Room name</span>
            <input
              defaultValue={settings.title}
              onBlur={(e) => e.target.value !== settings.title && patch({ title: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
            />
          </label>

          <div>
            <span className="text-sm font-medium">When should the AI reply?</span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["always", "mention"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => patch({ aiMode: v })}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${settings.aiMode === v ? "border-fg bg-surface-2 " : "border-zinc-300 dark:border-zinc-700"}`}
                >
                  <div className="font-medium">{v === "always" ? "Every message" : "Only when @ai"}</div>
                  <div className="text-xs text-zinc-500">
                    {v === "always" ? "Like a 1:1 chat, but shared" : "People chat freely; AI joins on mention"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-sm font-medium">AI engine</span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={() => patch({ engine: "auto" })}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${settings.engine === "auto" ? "border-fg bg-surface-2 " : "border-zinc-300 dark:border-zinc-700"}`}
              >
                <div className="font-medium">Cloud (free open models)</div>
                <div className="text-xs text-zinc-500">Big models, web search & docs</div>
              </button>
              <button
                onClick={() => patch({ engine: "local" })}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${settings.engine === "local" ? "border-fg bg-surface-2 " : "border-zinc-300 dark:border-zinc-700"}`}
              >
                <div className="font-medium">Local (host's device)</div>
                <div className="text-xs text-zinc-500">Private & unlimited, no tools</div>
              </button>
            </div>
            {settings.engine === "auto" && (
              <p className="mt-2 text-xs text-zinc-500">
                {providers.length
                  ? `Free providers in order: ${providers.join(" → ")}`
                  : "No cloud provider keys configured on the server yet."}
              </p>
            )}
            {settings.engine === "local" && (
              <div className="mt-2">
                <select
                  value={settings.localModel}
                  onChange={(e) => patch({ localModel: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                >
                  {LOCAL_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-zinc-500">
                  Runs with WebGPU in the host's browser; downloads once, then cached.{" "}
                  {isHost && !hasWebGPU() && <b className="text-amber-600">Your browser doesn't support WebGPU — try Chrome or Edge.</b>}
                </p>
              </div>
            )}
          </div>

          <AssistantEditor settings={settings} patch={patch} />

          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="text-sm font-medium">🔬 Deep Research mode</span>
              <span className="block text-xs text-zinc-500">The AI runs several searches, reads sources and writes a cited doc. Slower; uses more of the free quota.</span>
            </span>
            <input type="checkbox" checked={!!settings.deepResearch} onChange={(e) => patch({ deepResearch: e.target.checked })} data-testid="toggle-deep-research" />
          </label>

          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="text-sm font-medium">🧠 Room memory</span>
              <span className="block text-xs text-zinc-500">The AI may save facts (names, goals, deadlines) it sees in every turn. Everyone here can see and delete them.</span>
            </span>
            <input type="checkbox" checked={!!settings.memory} onChange={(e) => patch({ memory: e.target.checked })} data-testid="toggle-memory" />
          </label>

          <label className="flex items-center justify-between">
            <span>
              <span className="text-sm font-medium">Lock room</span>
              <span className="block text-xs text-zinc-500">New people can't join with the code</span>
            </span>
            <input type="checkbox" checked={settings.locked} onChange={(e) => patch({ locked: e.target.checked })} />
          </label>

          <div>
            <span className="text-sm font-medium">Skills ({skills.length - settings.disabledSkills.length} on)</span>
            <div className="mt-2 grid max-h-56 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
              {skills.map((s) => {
                const on = !settings.disabledSkills.includes(s.name);
                return (
                  <label key={s.name} className="flex items-start gap-2 rounded p-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800" title={s.description}>
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={on}
                      onChange={() =>
                        patch({
                          disabledSkills: on
                            ? [...settings.disabledSkills, s.name]
                            : settings.disabledSkills.filter((x) => x !== s.name),
                        })
                      }
                    />
                    {s.name}
                  </label>
                );
              })}
            </div>
          </div>
        </fieldset>

        {(settings.memory || memory.length > 0) && (
          <div className="mt-5" data-testid="memory-list">
            <span className="text-sm font-medium">Memory ({memory.length})</span>
            {memory.length === 0 ? (
              <p className="mt-1 text-xs text-zinc-500">Nothing yet. Say "remember that…" to the AI.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {memory.map((f, i) => (
                  <li key={i} className="flex items-start justify-between gap-2 rounded bg-zinc-50 px-2 py-1 text-sm dark:bg-zinc-800">
                    <span>{f}</span>
                    <button onClick={() => send({ t: "forget", index: i })} className="shrink-0 text-xs text-red-600 hover:underline" aria-label={`Forget: ${f}`}>
                      Forget
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {isHost && (
          <div className="mt-6 border-t border-line pt-5" data-testid="manage-party">
            <span className="text-sm font-medium">Manage party</span>
            <p className="mt-0.5 text-xs text-fg-muted">Kick removes someone now (they can rejoin with the code). Ban also blocks them from coming back.</p>
            <div className="mt-3">
              <PartyLists
                people={members.map((m) => ({ ...m, online: true }))}
                bans={bans}
                onAct={(action, p) => send({ t: action, uid: p.uid })}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
