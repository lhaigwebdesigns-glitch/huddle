import { describe, expect, it } from "vitest";
import { projectPrompt, toolAllowed } from "./turn";
import { cleanProject } from "../../shared/protocol";

// Tool names from tools.ts (it imports Workers-only modules, so it can't load here).
const names = ["web_search","fetch_url","load_skill","create_doc","read_doc","edit_doc","create_sheet","read_sheet","edit_sheet","create_slides","read_slides","edit_slides","draw_whiteboard","create_form","read_form_responses","search_knowledge","describe_image","generate_image","remember","make_artifact","read_artifact","read_whiteboard"];

describe("project AI rules", () => {
  it("AI off allows no tools", () => {
    expect(names.filter((n) => toolAllowed(n, "off"))).toEqual([]);
  });

  it("tutor mode can look things up and read, but never write files", () => {
    const allowed = names.filter((n) => toolAllowed(n, "tutor"));
    expect(allowed).toContain("web_search");
    expect(allowed).toContain("read_doc");
    for (const n of allowed) expect(n).not.toMatch(/^(create_|edit_|draw_|make_|generate_)/);
  });

  it("full help allows everything until the project is turned in", () => {
    expect(names.every((n) => toolAllowed(n, "full"))).toBe(true);
    const after = names.filter((n) => toolAllowed(n, "full", true));
    expect(after).not.toContain("create_doc");
    expect(after).not.toContain("edit_slides");
    expect(after).toContain("read_doc");
  });

  it("the tutor prompt forbids writing the work, and includes the rubric and due date", () => {
    const p = projectPrompt({ instructions: "Make slides", rubric: "Sources 50%", dueAt: Date.now() + 7_200_000, ai: "tutor" }).join("\n");
    expect(p).toMatch(/TUTOR MODE/);
    expect(p).toMatch(/Never write finished answers/);
    expect(p).toMatch(/Sources 50%/);
    expect(p).toMatch(/Due:/);
    const full = projectPrompt({ instructions: "", rubric: "", ai: "full" }).join("\n");
    expect(full).not.toMatch(/TUTOR MODE/);
  });
});

describe("cleanProject", () => {
  it("fills defaults and clamps text", () => {
    const p = cleanProject({ instructions: "x".repeat(9000), ai: "tutor" })!;
    expect(p.instructions.length).toBe(6000);
    expect(p.ai).toBe("tutor");
    expect(p.pasteExempt).toEqual([]);
  });

  it("ignores bad values and keeps the previous ones", () => {
    const prev = cleanProject({ ai: "off", pasteGuard: true })!;
    const next = cleanProject({ ai: "nope" as never, dueAt: -5 }, prev)!;
    expect(next.ai).toBe("off");
    expect(next.pasteGuard).toBe(true);
    expect(next.dueAt).toBeUndefined();
  });

  it("turns paste blocking off with full AI help, clears dates on null, and clears the project on null", () => {
    expect(cleanProject({ ai: "full", pasteGuard: true })!.pasteGuard).toBe(false);
    const dated = cleanProject({ dueAt: 1_800_000_000_000 })!;
    expect(cleanProject({ dueAt: null as never }, dated)!.dueAt).toBeUndefined();
    expect(cleanProject(null, dated)).toBeUndefined();
  });

  it("can't be used to fake a turn-in", () => {
    const p = cleanProject({ turnedInAt: 123, turnedInBy: "x" } as never)!;
    expect(p.turnedInAt).toBeUndefined();
  });
});
