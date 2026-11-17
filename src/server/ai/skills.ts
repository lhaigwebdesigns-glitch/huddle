import type { SkillInfo } from "../../shared/protocol";

// Skills follow the open "Agent Skills" format: skills/<name>/SKILL.md with YAML frontmatter.
// Drop a new folder into /skills to add one; it is bundled at build time.
const files = import.meta.glob("/skills/*/SKILL.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export interface Skill extends SkillInfo {
  body: string;
}

export function parseSkill(raw: string): Skill | null {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  if (!meta.name || !meta.description) return null;
  return { name: meta.name, description: meta.description, body: m[2].trim() };
}

export const SKILLS: Skill[] = Object.values(files)
  .map(parseSkill)
  .filter((s): s is Skill => !!s)
  .sort((a, b) => a.name.localeCompare(b.name));

export function getSkill(name: string): Skill | undefined {
  return SKILLS.find((s) => s.name === name);
}
