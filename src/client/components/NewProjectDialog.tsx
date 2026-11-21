import { useState } from "react";
import { X } from "lucide-react";
import { Button, Input } from "./ui";
import { EMPTY_PROJECT, ProjectEditor, type ProjectDraft } from "./ProjectEditor";

/** Start a group project: a title plus the teacher's rules. Creates the room and opens it. */
export function NewProjectDialog({ uid, onCreated, onClose }: { uid: string; onCreated: (code: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [project, setProject] = useState<ProjectDraft>(EMPTY_PROJECT);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setErr("Give the project a name.");
    setErr("");
    setBusy(true);
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uid, title: title.trim(), project }),
    });
    const d = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
    setBusy(false);
    if (!res.ok || !d.code) return setErr(d.error ?? "Couldn't create the project.");
    onCreated(d.code);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label="New project"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="pop max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[24px] border border-line bg-surface p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.4)]"
        data-testid="new-project-dialog"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">New group project</h2>
          <button type="button" onClick={onClose} className="press rounded-full p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-fg-muted">Set it up once, then share the code with your class. You can change any of this later in Room settings.</p>
        <label className="mt-5 block">
          <span className="text-sm font-medium">Project name</span>
          <Input autoFocus aria-label="Project name" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Causes of World War I" className="mt-1" />
        </label>
        <div className="mt-4">
          <ProjectEditor value={project} onChange={setProject} />
        </div>
        {err && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {err}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy} data-testid="create-project">
            {busy ? "Creating…" : "Create project"}
          </Button>
        </div>
      </form>
    </div>
  );
}
