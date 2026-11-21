import { CANVAS } from "./slides-model";

/** How close (in canvas pixels) an edge must be to a guide to snap to it. */
export const SNAP = 8;

/**
 * Where a moving box should snap: to the slide's edges and center, and to other boxes'
 * edges and centers. Returns the adjusted position and the guide lines to draw.
 */
export function snapBox(
  box: { x: number; y: number; w: number; h: number },
  others: { x: number; y: number; w: number; h: number }[],
  canvas = CANVAS,
): { x: number; y: number; guides: { v: number[]; h: number[] } } {
  const xs = [0, canvas.w / 2, canvas.w, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
  const ys = [0, canvas.h / 2, canvas.h, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
  const pick = (pos: number, size: number, lines: number[]) => {
    let best: { delta: number; line: number } | null = null;
    for (const edge of [pos, pos + size / 2, pos + size]) {
      for (const line of lines) {
        const d = line - edge;
        if (Math.abs(d) <= SNAP && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, line };
      }
    }
    return best;
  };
  const sx = pick(box.x, box.w, xs);
  const sy = pick(box.y, box.h, ys);
  return { x: box.x + (sx?.delta ?? 0), y: box.y + (sy?.delta ?? 0), guides: { v: sx ? [sx.line] : [], h: sy ? [sy.line] : [] } };
}

