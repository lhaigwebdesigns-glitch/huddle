import type { ClientMsg, Member, RoomSettings, SkillInfo } from "../../shared/protocol";
import { hasWebGPU, LOCAL_MODELS } from "../lib/local-llm";

export function SettingsDialog({
  settings,
  isHost,
  skills,
  providers,
  members,
  me,
  send,
  onClose,
}: {
  settings: RoomSettings;
  isHost: boolean;
  skills: SkillInfo[];
  providers: string[];
  members: Member[];
  me: Member;
  send: (m: ClientMsg) => void;
  onClose: () => void;
}) {
  const patch = (p: Partial<RoomSettings>) => send({ t: "settings", patch: p });
  const disabled = !isHost;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Room settings</h2>
          <button onClick={onClose} className="text-zinc-500">✕</button>
        </div>
        {!isHost && <p className="mt-1 text-sm text-zinc-500">Only the host can change these.</p>}

        <fieldset disabled={disabled} className="mt-4 space-y-5 disabled:opacity-60">
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
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${settings.aiMode === v ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40" : "border-zinc-300 dark:border-zinc-700"}`}
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
                className={`rounded-lg border px-3 py-2 text-left text-sm ${settings.engine === "auto" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40" : "border-zinc-300 dark:border-zinc-700"}`}
              >
                <div className="font-medium">Cloud (free open models)</div>
                <div className="text-xs text-zinc-500">Big models, web search & docs</div>
              </button>
              <button
                onClick={() => patch({ engine: "local" })}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${settings.engine === "local" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40" : "border-zinc-300 dark:border-zinc-700"}`}
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

        {isHost && members.length > 1 && (
          <div className="mt-5">
            <span className="text-sm font-medium">People</span>
            <ul className="mt-2 space-y-1">
              {members
                .filter((m) => m.uid !== me.uid)
                .map((m) => (
                  <li key={m.uid} className="flex items-center justify-between text-sm">
                    <span>{m.name}</span>
                    <button onClick={() => send({ t: "kick", uid: m.uid })} className="text-xs text-red-600 hover:underline">
                      Remove
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
