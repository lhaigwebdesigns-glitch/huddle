import { describe, expect, it } from "vitest";
import { PasteGuard } from "./pasteGuard";

describe("paste guard", () => {
  const essay = "The main cause of the war was the alliance system between the great powers.";

  it("blocks long text that wasn't copied in Huddle", () => {
    expect(new PasteGuard().allows(essay)).toBe(false);
  });

  it("always allows short pastes", () => {
    expect(new PasteGuard().allows("Maya")).toBe(true);
    expect(new PasteGuard().allows("https://x.co/a")).toBe(true);
  });

  it("allows text copied inside Huddle, or part of it", () => {
    const g = new PasteGuard();
    g.noteCopy(essay);
    expect(g.allows(essay)).toBe(true);
    expect(g.allows("alliance system between the great powers")).toBe(true);
    expect(g.allows(`  ${essay.replace(/ /g, "  ")} `)).toBe(true);
  });

  it("still blocks outside text that merely contains a short internal copy", () => {
    const g = new PasteGuard();
    g.noteCopy("the alliance system");
    expect(g.allows(essay)).toBe(false);
  });
});
