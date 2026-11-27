import { cleanRubricGrid, type RubricCriterion, type RubricGrid, type RubricLevel } from "./protocol";

/**
 * Turns a pasted rubric into a grid, when it looks like one. Two shapes are understood:
 *
 * 1. A table (copied from Google Docs, Word or Sheets: cells split by tabs). The first line names
 *    the levels ("Criteria | Excellent (4) | Good (3) | Needs work (1)"), each line after is a row:
 *    its name, then what each level looks like.
 * 2. A list, the way a Google Classroom rubric copies: a row's name (and a line about it), then for
 *    each level its name, its points ("3 pts") and what it looks like.
 *
 * Anything else (like "Research 40%, Slides 30%") isn't a grid, and stays as typed text.
 */
export function parseRubricGrid(text: string): RubricGrid | undefined {
  const lines = text.replace(/\r/g, "").split("\n");
  return fromTable(lines) ?? fromList(lines);
}

const POINTS = /^\(?\s*(\d+(?:\.\d+)?)\s*(?:pts?|points?)?\.?\s*\)?$/i;
const TRAILING_POINTS = /^(.*?\S)\s*[-–—:(]?\s*(\d+(?:\.\d+)?)\s*(?:pts?|points?)\s*\)?$/i;
const PAREN_POINTS = /^(.*?\S)\s*\(\s*(\d+(?:\.\d+)?)\s*(?:pts?|points?)?\s*\)$/i;

/** "Excellent (4)", "Good - 3 pts", "4", "Proficient": a level's name and points, if it has some. */
function splitLevel(cell: string): { label: string; points?: number } {
  const c = cell.trim();
  const only = c.match(POINTS);
  if (only) return { label: "", points: Number(only[1]) };
  const m = c.match(TRAILING_POINTS) ?? c.match(PAREN_POINTS);
  if (m) return { label: m[1].trim(), points: Number(m[2]) };
  return { label: c };
}

/** Levels with no points get them counting down from the top (4, 3, 2, 1). */
function fillPoints(levels: { label: string; points?: number }[]): { label: string; points: number }[] {
  const n = levels.length;
  return levels.map((l, i) => ({ label: l.label || `Level ${i + 1}`, points: l.points ?? n - i }));
}

function fromTable(lines: string[]): RubricGrid | undefined {
  const rows = lines.filter((l) => l.trim()).map((l) => l.split("\t").map((c) => c.trim()));
  if (rows.length < 2 || rows[0].length < 3) return undefined;
  if (!rows.every((r) => r.length >= 3)) return undefined;
  const header = rows[0];
  // The first header cell names the rows ("Criteria"); the rest are the levels.
  const levels = fillPoints(header.slice(1).map(splitLevel));
  const grid: RubricGrid = {
    rows: rows.slice(1).map((r) => ({
      title: r[0],
      levels: levels.map((l, i) => ({ ...l, desc: r[i + 1] ?? "" })),
    })),
  };
  return cleanRubricGrid(grid);
}

function fromList(raw: string[]): RubricGrid | undefined {
  const lines = raw.map((l) => l.trim()).filter(Boolean);
  // Where each level is: a points line ("3 pts") after its name, or the name and points on one line.
  type Mark = { label: string; points: number; start: number; end: number };
  const marks: Mark[] = [];
  for (let i = 0; i < lines.length; i++) {
    const only = lines[i].match(POINTS);
    if (only && /pt|point/i.test(lines[i]) && i > 0 && !marks.some((m) => m.end === i - 1 || m.start === i - 1)) {
      marks.push({ label: lines[i - 1], points: Number(only[1]), start: i - 1, end: i });
      continue;
    }
    const both = lines[i].match(TRAILING_POINTS);
    if (both) marks.push({ label: both[1].trim(), points: Number(both[2]), start: i, end: i });
  }
  if (marks.length < 2) return undefined;
  const rows: RubricCriterion[] = [];
  let current: RubricCriterion | null = null;
  const head = lines.slice(0, marks[0].start);
  if (!head.length) return undefined;
  current = { title: head[0], ...(head.length > 1 ? { desc: head.slice(1).join(" ") } : {}), levels: [] };
  for (let k = 0; k < marks.length; k++) {
    const m = marks[k];
    const next = marks[k + 1];
    const between = lines.slice(m.end + 1, next ? next.start : lines.length);
    const level: RubricLevel = { label: m.label, points: m.points, desc: "" };
    current.levels.push(level);
    // The points go back up (or stay the same): the next level starts a new row.
    const newRow = next && next.points >= m.points && current.levels.length >= 2;
    if (!newRow) {
      level.desc = between.join(" ");
      continue;
    }
    // Lines before the next row: this level's description, then the row's name and its line.
    const titleAt = between.length >= 2 ? 1 : 0;
    level.desc = between.slice(0, titleAt).join(" ");
    rows.push(current);
    const t = between.slice(titleAt);
    if (!t.length) return undefined;
    current = { title: t[0], ...(t.length > 1 ? { desc: t.slice(1).join(" ") } : {}), levels: [] };
  }
  rows.push(current);
  if (rows.some((r) => r.levels.length < 2)) return undefined;
  return cleanRubricGrid({ rows });
}
