import { useEffect, useState } from "react";
import type { EditorProps } from "./FilePanel";
import { useYObserve } from "../lib/useYDoc";
import { versionsOf } from "../../shared/artifact-model";
import { download, safeName } from "../lib/download";

/**
 * Renders an AI-made page in a sandboxed iframe: scripts run, but with an opaque origin they
 * can't read Huddle's cookies, storage or the parent page.
 */
export default function ArtifactViewer({ ydoc, file, synced }: EditorProps) {
  const versions = versionsOf(ydoc);
  useYObserve([versions]);
  const all = versions.toArray();
  const [pick, setPick] = useState<number | null>(null); // null = follow the latest
  const [code, setCode] = useState(false);
  const [reload, setReload] = useState(0);
  const idx = pick === null ? all.length - 1 : Math.min(pick, all.length - 1);
  const v = all[idx];
  useEffect(() => setPick(null), [all.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="artifact-viewer">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-3 py-1 text-xs text-zinc-500 dark:border-zinc-800">
        <span>{synced ? "● Live" : "Connecting…"}</span>
        {all.length > 1 && (
          <select
            aria-label="Version"
            className="rounded border border-zinc-200 bg-transparent px-1 py-0.5 dark:border-zinc-700"
            value={idx}
            onChange={(e) => setPick(Number(e.target.value))}
          >
            {all.map((x, i) => (
              <option key={i} value={i}>
                v{i + 1}{i === all.length - 1 ? " (latest)" : ""} · {x.note}
              </option>
            ))}
          </select>
        )}
        <span className="flex-1" />
        <button className="hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => setReload((r) => r + 1)}>↻ Reload</button>
        <button className="hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => setCode((c) => !c)} aria-pressed={code}>
          {code ? "Preview" : "</> Code"}
        </button>
        <button className="hover:text-zinc-900 dark:hover:text-zinc-100" disabled={!v} onClick={() => v && download(`${safeName(file.title, "artifact")}.html`, "text/html", v.html)}>
          ⬇ HTML
        </button>
      </div>
      {!v ? (
        <div className="p-6 text-sm text-zinc-500">Nothing here yet. Ask the AI to build something.</div>
      ) : code ? (
        <pre className="min-h-0 flex-1 overflow-auto bg-zinc-50 p-3 text-xs dark:bg-zinc-950" data-testid="artifact-code">
          <code>{v.html}</code>
        </pre>
      ) : (
        <iframe
          key={`${idx}-${reload}`}
          title={file.title}
          sandbox="allow-scripts allow-forms allow-modals allow-popups"
          referrerPolicy="no-referrer"
          srcDoc={v.html}
          className="min-h-0 w-full flex-1 bg-white"
          data-testid="artifact-frame"
        />
      )}
      <div className="border-t border-zinc-200 px-3 py-1 text-[11px] text-zinc-400 dark:border-zinc-800">
        Made by AI and runs in a sandbox. Don't type passwords or personal info into it.
      </div>
    </div>
  );
}
