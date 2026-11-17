import { describe, expect, it } from "vitest";
import { parseSkill, SKILLS } from "./skills";

describe("skills", () => {
  it("parses SKILL.md frontmatter", () => {
    const s = parseSkill("---\nname: demo\ndescription: A demo skill\n---\n# Body\nDo things.");
    expect(s).toEqual({ name: "demo", description: "A demo skill", body: "# Body\nDo things." });
  });
  it("bundles the starter pack", () => {
    expect(SKILLS.length).toBeGreaterThanOrEqual(20);
    expect(SKILLS.map((s) => s.name)).toContain("web-design");
  });
});
