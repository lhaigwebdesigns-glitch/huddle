import { confirmDialog } from "./Dialogs";
import { Modal } from "./Modal";
import type { Ban, ClientMsg, Member, RoomSettings, RubricGrid, SkillInfo } from "../../shared/protocol";
import { PartyLists } from "./PartyLists";
import { hasWebGPU, LOCAL_MODELS } from "../lib/local-llm";
import { useState, type ReactNode } from "react";
import { formatCode } from "../../shared/code";
import { ChevronRight } from "lucide-react";
import { ThemeToggle } from "./ui";
import { EMPTY_PROJECT, ProjectEditor, type ProjectDraft } from "./ProjectEditor";
import type { Schedule } from "../../shared/schedule";

const field = "w-full rounded-xl border border-line-strong bg-transparent px-3 py-2 text-sm placeholder:text-fg-subtle";
const quietBtn = "press rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-40";
const primaryBtn = "press rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-40";

/** A titled group of settings. */
function Group({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="space-y-4" data-testid={testId}>
      <h3 className="font-display text-base font-bold">{title}</h3>
      {children}
    </section>
  );
}

/** A setting that is on or off: the words on the left, the box on the right. */
function Toggle({ title, hint, checked, onChange, testId }: { title: string; hint: string; checked: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-fg-muted">{hint}</span>
      </span>
      <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#44cf6c]" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
    </label>
  );
}

/** Two big choices side by side. */
function Choice<T extends string>({ value, options, onPick }: { value: T; options: { id: T; title: string; hint: string }[]; onPick: (v: T) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onPick(o.id)}
          className={`press rounded-xl border px-3 py-2 text-left text-sm ${value === o.id ? "border-fg bg-surface-2" : "border-line-strong hover:bg-surface-2"}`}
        >
          <span className="block font-medium">{o.title}</span>
          <span className="block text-xs text-fg-muted">{o.hint}</span>
        </button>
      ))}
    </div>
  );
}

/** "persuasive-essays" reads as "Persuasive essays". */
const skillLabel = (name: string) => {
  const s = name.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

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
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span>
          <span className="block text-sm font-medium">School project</span>
          <span className="block text-xs text-fg-muted">Add instructions, a due date and AI rules for a group assignment.</span>
        </span>
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-[#44cf6c]"
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
            <button type="button" onClick={() => save(draft)} className={primaryBtn} data-testid="project-save">
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
      <span className="block text-sm font-medium">Custom assistant</span>
      <span className="block text-xs text-fg-muted">Give the room's AI a name and standing instructions: a persona, a tutor for one subject, a strict editor.</span>
      <input aria-label="Assistant name" placeholder="Name (e.g. Coach Kai)" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className={`mt-2 ${field}`} />
      <textarea
        aria-label="Assistant instructions"
        placeholder="Instructions (e.g. You are a patient physics tutor. Ask a question back before giving answers.)"
        value={instructions}
        maxLength={4000}
        rows={3}
        onChange={(e) => setInstructions(e.target.value)}
        className={`mt-2 ${field}`}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={!dirty} onClick={() => patch({ assistant: { name, instructions } })} className={primaryBtn} data-testid="assistant-apply">
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
          className={quietBtn}
          data-testid="assistant-share"
        >
          Get share code
        </button>
        {settings.assistant && (
          <button type="button" onClick={() => (patch({ assistant: null as unknown as undefined }), setName(""), setInstructions(""))} className="press rounded-lg px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">
            Reset to Cairn AI
          </button>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          aria-label="Assistant code"
          placeholder="Have a share code?"
          value={code}
          maxLength={7}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="w-44 rounded-xl border border-line-strong bg-transparent px-3 py-1.5 font-mono text-sm placeholder:font-sans placeholder:text-fg-subtle"
        />
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
          className={quietBtn}
        >
          Load
        </button>
      </div>
      {msg && (
        <p className="mt-2 text-xs text-fg-muted" role="status" data-testid="assistant-msg">
          {msg}
        </p>
      )}
    </div>
  );
}

function MemoryList({ memory, send }: { memory: string[]; send: (m: ClientMsg) => void }) {
  return (
    <div data-testid="memory-list">
      <span className="block text-sm font-medium">What the AI remembers ({memory.length})</span>
      {memory.length === 0 ? (
        <p className="mt-1 text-xs text-fg-muted">Nothing yet. Say “remember that…” to the AI.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {memory.map((f, i) => (
            <li key={i} className="flex items-start justify-between gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-sm">
              <span>{f}</span>
              <button onClick={() => send({ t: "forget", index: i })} className="press shrink-0 text-xs font-medium text-red-600 hover:underline dark:text-red-400" aria-label={`Forget: ${f}`}>
                Forget
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SettingsDialog({
  settings,
  isHost,
  skills,
  members,
  memory,
  bans,
  send,
  onClose,
}: {
  bans: Ban[];
  settings: RoomSettings;
  isHost: boolean;
  skills: SkillInfo[];
  /** Kept for callers; the provider list is an operator detail, not shown here. */
  providers?: string[];
  members: Member[];
  me?: Member;
  memory: string[];
  send: (m: ClientMsg) => void;
  onClose: () => void;
}) {
  const patch = (p: Partial<RoomSettings>) => send({ t: "settings", patch: p });
  const appearance = (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
      <span>
        <span className="block text-sm font-medium">Appearance</span>
        <span className="block text-xs text-fg-muted">Just for you, on this device.</span>
      </span>
      <ThemeToggle labeled />
    </div>
  );
  const showMemory = settings.memory || memory.length > 0;

  // Everyone but the host: nothing to change but their own look, so don't show a wall of locked controls.
  if (!isHost) {
    const host = members.find((m) => m.uid === settings.hostId);
    return (
      <Modal title="Room settings" size="md" onClose={onClose} testId="settings-dialog" closeLabel="Close settings">
        <div className="space-y-6">
          {appearance}
          <p className="text-sm text-fg-muted" data-testid="settings-who">
            {settings.classLink
              ? "Your teacher set up this room. If something needs to change, like more time or the AI rules, ask them."
              : `Only the host${host ? `, ${host.name},` : ""} can change this room's name, AI and who can join.`}
          </p>
          {showMemory && <MemoryList memory={memory} send={send} />}
        </div>
      </Modal>
    );
  }

  const skillsOn = skills.length - settings.disabledSkills.length;
  return (
    <Modal title="Room settings" subtitle="Changes apply for everyone in the room right away." onClose={onClose} testId="settings-dialog" closeLabel="Close settings">
      <div className="grid gap-x-12 gap-y-8 lg:grid-cols-2">
        <div className="space-y-8">
          <Group title="Room">
            <label className="block">
              <span className="text-sm font-medium">Room name</span>
              <input defaultValue={settings.title} onBlur={(e) => e.target.value !== settings.title && patch({ title: e.target.value })} className={`mt-1 ${field} py-2.5 text-base`} />
            </label>
            <Toggle title="Lock room" hint="New people can't join with the code." checked={settings.locked} onChange={(v) => patch({ locked: v })} testId="toggle-lock" />
            {appearance}
          </Group>
          {!settings.classLink && <ProjectSection settings={settings} members={members} send={send} />}
          <Group title="Kick or ban" testId="manage-party">
            <p className="-mt-2 text-xs text-fg-muted">Kick removes someone now; they can rejoin with the code. Ban also keeps them out.</p>
            <PartyLists people={members.map((m) => ({ ...m, online: true }))} bans={bans} onAct={(action, p) => send({ t: action, uid: p.uid })} />
          </Group>
        </div>

        <div className="space-y-8">
          <Group title="AI">
            <div>
              <span className="mb-2 block text-sm font-medium">When should the AI reply?</span>
              <Choice
                value={settings.aiMode}
                onPick={(v) => patch({ aiMode: v })}
                options={[
                  { id: "always", title: "Every message", hint: "Like a 1:1 chat, but shared" },
                  { id: "mention", title: "Only when @ai", hint: "People chat freely; the AI joins when asked" },
                ]}
              />
            </div>
            <Toggle title="Room memory" hint="The AI can save facts it sees (names, goals, deadlines). Everyone here can see and delete them." checked={!!settings.memory} onChange={(v) => patch({ memory: v })} testId="toggle-memory" />
            {showMemory && <MemoryList memory={memory} send={send} />}
            <Toggle title="Deep research" hint="The AI runs several searches, reads sources and writes a cited doc. Slower." checked={!!settings.deepResearch} onChange={(v) => patch({ deepResearch: v })} testId="toggle-deep-research" />
            <AssistantEditor settings={settings} patch={patch} />
          </Group>

          <details className="group rounded-2xl border border-line px-4 py-3" data-testid="settings-advanced">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
              Advanced
              <span className="font-normal text-fg-muted">Where the AI runs, skills</span>
            </summary>
            <div className="mt-4 space-y-6">
              <div>
                <span className="mb-2 block text-sm font-medium">Where the AI runs</span>
                <Choice
                  value={settings.engine === "local" ? "local" : "auto"}
                  onPick={(v) => patch({ engine: v })}
                  options={[
                    { id: "auto", title: "Cloud", hint: "Big models, web search and files" },
                    { id: "local", title: "This device", hint: "Private, but no search or files" },
                  ]}
                />
                {settings.engine === "local" && (
                  <div className="mt-2">
                    <select aria-label="Local model" value={settings.localModel} onChange={(e) => patch({ localModel: e.target.value })} className={field}>
                      {LOCAL_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-fg-muted">
                      Runs in the host's browser and downloads once.{" "}
                      {!hasWebGPU() && <b className="font-semibold text-amber-700 dark:text-amber-400">This browser can't run it. Try Chrome or Edge.</b>}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <span className="block text-sm font-medium">
                  Skills <span className="font-normal text-fg-muted">({skillsOn} of {skills.length} on)</span>
                </span>
                <span className="block text-xs text-fg-muted">Know-how the AI can pull in. Turn off any this room doesn't need.</span>
                <div className="mt-2 grid max-h-56 grid-cols-1 gap-0.5 overflow-y-auto sm:grid-cols-2">
                  {skills.map((s) => {
                    const on = !settings.disabledSkills.includes(s.name);
                    return (
                      <label key={s.name} className="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-surface-2" title={s.description}>
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 accent-[#44cf6c]"
                          checked={on}
                          onChange={() => patch({ disabledSkills: on ? [...settings.disabledSkills, s.name] : settings.disabledSkills.filter((x) => x !== s.name) })}
                        />
                        {skillLabel(s.name)}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </Modal>
  );
}
