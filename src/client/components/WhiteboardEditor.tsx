import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { CaptureUpdateAction, convertToExcalidrawElements, Excalidraw, exportToBlob, MainMenu, reconcileElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import type { EditorProps } from "./FilePanel";
import { elementsOf, pendingOf, remapIds, type PendingDrawing } from "../../shared/whiteboard-model";
import { download, safeName } from "../lib/download";

type El = Record<string, any> & { id: string; version: number; versionNonce: number };

/**
 * Excalidraw (MIT) synced through Yjs: every element lives in a Y.Map by id and merges by
 * Excalidraw's own version numbers, so concurrent drawing never loses strokes. Pointers and
 * names travel over awareness.
 */
export default function WhiteboardEditor({ ydoc, provider, file, me, synced }: EditorProps) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const els = elementsOf(ydoc);
  const pending = pendingOf(ydoc);
  const applyingRemote = useRef(false);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [busy, setBusy] = useState<string | null>(null);
  // Live shape count (also used by tests); updated from Yjs without re-rendering the canvas.
  const [shapeCount, setShapeCount] = useState(0);
  useEffect(() => {
    const count = () => setShapeCount([...els.values()].filter((e) => e && !e.isDeleted).length);
    count();
    els.observe(count);
    return () => els.unobserve(count);
  }, [els]);

  useEffect(() => {
    const mo = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  // Remote → canvas
  const pull = useCallback(() => {
    if (!api) return;
    const remote = [...els.values()] as El[];
    const local = api.getSceneElementsIncludingDeleted() as unknown as El[];
    const merged = reconcileElements(local as any, remote as any, api.getAppState());
    applyingRemote.current = true;
    api.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER });
    applyingRemote.current = false;
  }, [api, els]);

  useEffect(() => {
    if (!api) return;
    pull();
    const onChange = (_e: Y.YMapEvent<any>, tx: Y.Transaction) => {
      if (tx.local) return;
      pull();
    };
    els.observe(onChange);
    return () => els.unobserve(onChange);
  }, [api, els, pull]);

  // Canvas → Yjs (only elements whose version moved past what's stored)
  const push = useCallback(
    (elements: readonly any[]) => {
      if (applyingRemote.current) return;
      const changed = elements.filter((e) => {
        const prev = els.get(e.id);
        return !prev || prev.version < e.version || (prev.version === e.version && prev.versionNonce !== e.versionNonce && e.versionNonce < prev.versionNonce);
      });
      if (!changed.length) return;
      ydoc.transact(() => {
        for (const e of changed) els.set(e.id, JSON.parse(JSON.stringify(e)));
      }, "user");
    },
    [els, ydoc],
  );

  // AI drawings waiting to be laid out (Mermaid needs a browser). Deterministic ids mean two
  // browsers converting at once produce the same elements, so nothing is duplicated.
  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    const drain = async () => {
      const items = pending.toArray() as PendingDrawing[];
      if (!items.length) return;
      const existing = [...els.values()].filter((e) => !e.isDeleted);
      let offsetX = existing.length ? Math.max(...existing.map((e) => (e.x ?? 0) + (e.width ?? 0))) + 120 : 0;
      for (const item of items) {
        if (cancelled) return;
        setBusy("Drawing the AI's sketch…");
        try {
          let skeleton: any[] = Array.isArray(item.shapes) ? (item.shapes as any[]) : [];
          if (item.mermaid) {
            const { parseMermaidToExcalidraw } = await import("@excalidraw/mermaid-to-excalidraw");
            const res = await parseMermaidToExcalidraw(item.mermaid, { themeVariables: { fontSize: "18px" } } as any);
            skeleton = res.elements as any[];
          }
          const converted = convertToExcalidrawElements(skeleton as any, { regenerateIds: false }) as unknown as El[];
          const placed: El[] = remapIds(converted, item.id).map((e) => ({ ...e, x: (e.x ?? 0) + offsetX }));
          offsetX += Math.max(0, ...placed.map((e) => (e.x ?? 0) + (e.width ?? 0) - offsetX)) + 120;
          ydoc.transact(() => {
            for (const e of placed) if (!els.has(e.id)) els.set(e.id, JSON.parse(JSON.stringify(e)));
            const i = pending.toArray().findIndex((p: PendingDrawing) => p.id === item.id);
            if (i >= 0) pending.delete(i, 1);
          }, "user");
        } catch (err) {
          console.warn("AI drawing failed", err);
          ydoc.transact(() => {
            const i = pending.toArray().findIndex((p: PendingDrawing) => p.id === item.id);
            if (i >= 0) pending.delete(i, 1);
          }, "user");
          setBusy(`Couldn't draw that sketch: ${String(err).slice(0, 80)}`);
          setTimeout(() => setBusy(null), 4000);
          return;
        }
      }
      setBusy(null);
      pull();
      api.scrollToContent(undefined, { fitToContent: true, animate: true });
    };
    void drain();
    const obs = () => void drain();
    pending.observe(obs);
    return () => {
      cancelled = true;
      pending.unobserve(obs);
    };
  }, [api, els, pending, ydoc, pull]);

  // Collaborator pointers
  useEffect(() => {
    if (!api) return;
    const aw = provider.awareness;
    const update = () => {
      const collaborators = new Map<any, any>();
      aw.getStates().forEach((s: any, id: number) => {
        if (id === aw.clientID || !s?.user) return;
        collaborators.set(String(id), {
          username: s.user.name,
          color: { background: s.user.color, stroke: s.user.color },
          pointer: s.wbPointer ?? undefined,
          button: s.wbButton ?? "up",
          id: String(id),
        });
      });
      api.updateScene({ collaborators, captureUpdate: CaptureUpdateAction.NEVER });
    };
    update();
    aw.on("change", update);
    return () => aw.off("change", update);
  }, [api, provider]);

  const exportPng = async () => {
    if (!api) return;
    const blob = await exportToBlob({
      elements: api.getSceneElements(),
      appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false },
      files: api.getFiles(),
      mimeType: "image/png",
    });
    download(`${safeName(file.title, "whiteboard")}.png`, "image/png", blob);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-testid="whiteboard-editor">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-3 py-1 text-xs text-zinc-500 dark:border-zinc-800">
        <span>{synced ? "● Live — everyone draws on the same board" : "Connecting…"}</span>
        <span data-testid="wb-count" className="sr-only">{shapeCount}</span>
        <button className="hover:text-zinc-900 dark:hover:text-zinc-100" onClick={exportPng}>⬇ PNG</button>
      </div>
      {busy && (
        <div className="absolute left-1/2 top-12 z-10 -translate-x-1/2 rounded-full bg-zinc-900 px-3 py-1 text-xs text-white shadow">{busy}</div>
      )}
      <div className="min-h-0 flex-1">
        <Excalidraw
          excalidrawAPI={setApi}
          theme={dark ? "dark" : "light"}
          isCollaborating
          name={file.title}
          onChange={(elements) => push(elements)}
          onPointerUpdate={({ pointer, button }) => {
            provider.awareness.setLocalStateField("wbPointer", { x: pointer.x, y: pointer.y, tool: pointer.tool });
            provider.awareness.setLocalStateField("wbButton", button);
          }}
          UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false } }}
        >
          <MainMenu>
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.ToggleTheme />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
          </MainMenu>
        </Excalidraw>
      </div>
      <span className="sr-only">{me.name}</span>
    </div>
  );
}
