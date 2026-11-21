import { useState } from "react";
import { X } from "lucide-react";
import { Button, Input } from "./ui";
import { EMPTY_PROJECT, ProjectEditor, type ProjectDraft } from "./ProjectEditor";
import { PROJECT_TEMPLATES } from "../../shared/templates";
import { FILE_INFO } from "../../shared/files";

/** Start a group project: a title plus the teacher's rules. Creates the room and opens it. */
export function NewProjectDialog({ uid, onCreated, onClose }: { uid: string; onCreated: (code: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [project, setProject] = useState<ProjectDraft>(EMPTY_PROJECT);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [templateId, setTemplateId] = useState("");
  const template = PROJECT_TEMPLATES.find((t) => t.id === templateId);
  const pick = (id: string) => {
    const t = PROJECT_TEMPLATES.find((x) => x.id === id);
    setTemplateId(id);
    // A template fills in starter instructions and a rubric; the teacher can edit both.
    setProject((p) => (t ? { ...p, instructions: t.instructions, rubric: t.rubric, ai: t.ai } : { ...EMPTY_PROJECT, dueAt: p.dueAt }));
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setErr("Give the project a name.");
    setErr("");
    setBusy(true);
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uid, title: title.trim(), project, ...(templateId ? { template: templateId } : {}) }),
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
        <fieldset className="mt-5">
          <legend className="text-sm font-medium">Start from a template</legend>
          <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Template">
            {[{ id: "", label: "Blank" }, ...PROJECT_TEMPLATES].map((t) => (
              <button
                key={t.id || "blank"}
                type="button"
                role="radio"
                aria-checked={templateId === t.id}
                onClick={() => pick(t.id)}
                className={`press rounded-full border px-3 py-1 text-sm ${templateId === t.id ? "border-fg bg-surface-2 font-medium" : "border-line-strong text-fg-muted hover:text-fg"}`}
                data-testid={`template-${t.id || "blank"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {template && (
            <p className="mt-2 text-xs text-fg-subtle" data-testid="template-summary">
              {template.description} Creates {template.files.map((f) => `${f.title} (${FILE_INFO[f.kind].label.toLowerCase()})`).join(" and ")}, plus {template.tasks.length} starter tasks.
            </p>
          )}
        </fieldset>
        <label className="mt-4 block">
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
