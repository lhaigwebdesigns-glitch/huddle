import { describe, expect, it } from "vitest";
import { greetName } from "./greet";

describe("greetName", () => {
  it("uses the first name", () => {
    expect(greetName("Ava Lin")).toBe("Ava");
    expect(greetName("  Cam  ")).toBe("Cam");
  });
  it("keeps a title with the name after it", () => {
    expect(greetName("Mrs. Pat Lee")).toBe("Mrs. Pat");
    expect(greetName("Dr Okafor")).toBe("Dr Okafor");
    expect(greetName("mr. smith")).toBe("mr. smith");
  });
  it("leaves a lone title alone", () => {
    expect(greetName("Ms.")).toBe("Ms.");
  });
});
