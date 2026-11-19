import { useEffect, useRef, useState, type ReactNode } from "react";
import type YProvider from "y-partyserver/provider";
import type { EditorView } from "@tiptap/pm/view";

/**
 * Figma-style live pointers: everyone in a file sees where the others are pointing and clicking.
 *
 * Positions travel over the file's Yjs awareness (field `pointer`):
 * - docs: anchored to the text ({pos, dx, dy}), so they line up even when screens differ in width;
 * - everything else: relative to the editor's main scroll area ({x as a share of its width, y in px}).
 * Rendering writes transforms straight to the DOM every frame, so React doesn't re-render on move.
 */
type Pointer =
  | { kind: "text"; pos: number; dx: number; dy: number; click?: number }
  | { kind: "area"; x: number; y: number; click?: number };

interface Peer {
  id: number;
  name: string;
  color: string;
  pointer: Pointer | null;
  seenAt: number;
  clickAt: number;
}

const SEND_EVERY_MS = 33;
const IDLE_FADE_MS = 4000;

/** The editor's main scroll area: the biggest scrollable element inside `root` (cached ~1s per root). */
const areaCache = new WeakMap<HTMLElement, { el: HTMLElement; at: number }>();
function scrollArea(root: HTMLElement): HTMLElement {
  const hit = areaCache.get(root);
  if (hit && performance.now() - hit.at < 1000 && hit.el.isConnected) return hit.el;
  let best: HTMLElement = root;
  let bestArea = 0;
  for (const el of root.querySelectorAll<HTMLElement>("*")) {
    const cs = getComputedStyle(el);
    if (!/(auto|scroll)/.test(cs.overflowY + cs.overflowX)) continue;
    const area = el.clientWidth * el.clientHeight;
    if (area > bestArea) {
      best = el;
      bestArea = area;
    }
  }
  areaCache.set(root, { el: best, at: performance.now() });
  return best;
}

/** The ProseMirror view of a tiptap doc inside `root`, if there is one (tiptap puts it on the DOM node). */
function proseView(root: HTMLElement): EditorView | null {
  const el = root.querySelector(".ProseMirror") as (HTMLElement & { editor?: { view: EditorView } }) | null;
  return el?.editor?.view ?? null;
}

export function LivePointers({ provider, enabled = true, children }: { provider: YProvider; enabled?: boolean; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<number, HTMLDivElement>());
  const [peers, setPeers] = useState<Peer[]>([]);
  const peerData = useRef(new Map<number, Peer>());

  // Receive: keep a map of peers' pointers; React only re-renders when someone arrives or leaves.
  useEffect(() => {
    if (!enabled) return;
    const aw = provider.awareness;
    const update = () => {
      const now = performance.now();
      const next = new Map<number, Peer>();
      for (const [id, st] of aw.getStates()) {
        if (id === aw.clientID || !st?.user) continue;
        const prev = peerData.current.get(id);
        const pointer = (st.pointer ?? null) as Pointer | null;
        const moved = JSON.stringify(pointer) !== JSON.stringify(prev?.pointer ?? null);
        const clicked = pointer?.click && pointer.click !== prev?.pointer?.click;
        next.set(id, {
          id,
          name: String(st.user.name || "Guest"),
          color: String(st.user.color || "#6366f1"),
          pointer,
          seenAt: moved ? now : (prev?.seenAt ?? now),
          clickAt: clicked ? now : (prev?.clickAt ?? 0),
        });
      }
      const sameIds = next.size === peerData.current.size && [...next.keys()].every((k) => peerData.current.has(k));
      peerData.current = next;
      if (!sameIds) setPeers([...next.values()]);
    };
    update();
    aw.on("change", update);
    return () => aw.off("change", update);
  }, [provider, enabled]);

  // Send: my pointer, throttled; cleared when I leave the file.
  useEffect(() => {
    const el = root.current;
    if (!el || !enabled) return;
    const aw = provider.awareness;
    let last = 0;
    let pending: Pointer | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      timer = undefined;
      last = performance.now();
      aw.setLocalStateField("pointer", pending);
    };
    const queue = (p: Pointer | null, now = false) => {
      pending = p;
      const wait = SEND_EVERY_MS - (performance.now() - last);
      if (now || wait <= 0) {
        clearTimeout(timer);
        flush();
      } else timer ??= setTimeout(flush, wait);
    };
    const locate = (e: PointerEvent, click?: number): Pointer | null => {
      const view = proseView(el);
      if (view) {
        const hit = view.posAtCoords({ left: e.clientX, top: e.clientY });
        if (hit) {
          const c = view.coordsAtPos(hit.pos);
          return { kind: "text", pos: hit.pos, dx: Math.round(e.clientX - c.left), dy: Math.round(e.clientY - c.top), click };
        }
      }
      const area = scrollArea(el);
      const r = area.getBoundingClientRect();
      const w = Math.max(1, area.scrollWidth);
      return { kind: "area", x: (e.clientX - r.left + area.scrollLeft) / w, y: Math.round(e.clientY - r.top + area.scrollTop), click };
    };
    let lastClick: number | undefined;
    const move = (e: PointerEvent) => e.pointerType !== "touch" && queue(locate(e, lastClick));
    const down = (e: PointerEvent) => {
      lastClick = Date.now();
      queue(locate(e, lastClick), true);
    };
    const leave = () => queue(null, true);
    el.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerdown", down, { passive: true });
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerleave", leave);
      clearTimeout(timer);
      aw.setLocalStateField("pointer", null);
    };
  }, [provider, enabled]);

  // Draw: place every pointer each frame (follows scrolling, typing and resizes for free).
  useEffect(() => {
    if (!peers.length) return;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const el = root.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const now = performance.now();
      const view = proseView(el);
      const area = scrollArea(el);
      const ar = area.getBoundingClientRect();
      for (const p of peerData.current.values()) {
        const node = els.current.get(p.id);
        if (!node) continue;
        let x: number | null = null;
        let y: number | null = null;
        const ptr = p.pointer;
        if (ptr?.kind === "text" && view) {
          try {
            const c = view.coordsAtPos(Math.min(ptr.pos, view.state.doc.content.size));
            x = c.left + ptr.dx - box.left;
            y = c.top + ptr.dy - box.top;
          } catch {
            /* position no longer exists */
          }
        } else if (ptr?.kind === "area") {
          x = ptr.x * area.scrollWidth - area.scrollLeft + ar.left - box.left;
          y = ptr.y - area.scrollTop + ar.top - box.top;
        }
        const visible = x !== null && y !== null && x >= -4 && y >= -4 && x <= box.width && y <= box.height && now - p.seenAt < IDLE_FADE_MS;
        node.style.opacity = visible ? "1" : "0";
        if (x !== null && y !== null) node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        node.dataset.click = now - p.clickAt < 500 ? "1" : "";
      }
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [peers]);

  return (
    <div ref={root} className="relative flex min-h-0 flex-1 flex-col">
      {children}
      <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-hidden data-testid="live-pointers">
        {peers.map((p) => (
          <div
            key={p.id}
            ref={(n) => {
              if (n) els.current.set(p.id, n);
              else els.current.delete(p.id);
            }}
            className="live-pointer absolute left-0 top-0"
            style={{ opacity: 0, ["--c" as string]: p.color }}
            data-testid="live-pointer"
          >
            <span className="live-pointer-ripple" />
            <svg width="18" height="18" viewBox="0 0 18 18" className="drop-shadow-sm">
              <path d="M2 1.5 L15.5 8.2 L9.2 9.6 L6.3 15.8 Z" fill="var(--c)" stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
            <span className="live-pointer-name">{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
