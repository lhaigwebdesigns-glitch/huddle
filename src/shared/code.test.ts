import { describe, expect, it } from "vitest";
import { formatCode, isValidCode, makeCode, normalizeCode } from "./code";

describe("party codes", () => {
  it("generates valid unambiguous codes", () => {
    for (let i = 0; i < 200; i++) {
      const c = makeCode();
      expect(isValidCode(c)).toBe(true);
      expect(c).not.toMatch(/[01OIL]/);
    }
  });
  it("normalizes user input", () => {
    expect(normalizeCode(" k7q-29f ")).toBe("K7Q29F");
    expect(formatCode("K7Q29F")).toBe("K7Q-29F");
  });
});
