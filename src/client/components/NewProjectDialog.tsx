import { useState } from "react";
import { Field, Modal } from "./Modal";
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
    <Modal
      title="New group project"
      subtitle="Set it up once, then share the code with your class. You can change any of this later in Room settings."
      onClose={onClose}
      onSubmit={submit}
      testId="new-project-dialog"
      footer={
        <>
          {err && (
            <p className="w-full text-sm font-semibold text-red-600 dark:text-red-400" role="alert">
              {err}
            </p>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <span className="flex-1" />
          <button type="submit" disabled={busy} className="ledge-btn min-w-[200px]" data-testid="create-project">
            {busy ? "Creating…" : "Create project"}
          </button>
        </>
      }
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          <label className="block">
            <span className="text-[15px] font-semibold">Project name</span>
            <Input autoFocus aria-label="Project name" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Causes of World War I" className="mt-2 h-12 text-base" />
          </label>
          <Field label="Start from a template" hint="Sets up the files, tasks, instructions and rubric for you.">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Template">
              {[{ id: "", label: "Blank" }, ...PROJECT_TEMPLATES].map((t) => (
                <button key={t.id || "blank"} type="button" role="radio" aria-checked={templateId === t.id} onClick={() => pick(t.id)} className="chip-pick" data-testid={`template-${t.id || "blank"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            {template && (
              <p className="mt-3 text-sm text-fg-muted" data-testid="template-summary">
                {template.description} Creates {template.files.map((f) => `${f.title} (${FILE_INFO[f.kind].label.toLowerCase()})`).join(" and ")}, plus {template.tasks.length} starter tasks.
              </p>
            )}
          </Field>
        </div>
        <div className="space-y-8 lg:border-l lg:border-line lg:pl-10">
          <ProjectEditor value={project} onChange={setProject} />
        </div>
      </div>
    </Modal>
  );
}
