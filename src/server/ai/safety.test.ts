import { describe, expect, it } from "vitest";
import { parseGuard, safetyReply, SCHOOL_RULES } from "./safety";
import { isRetiredModelError } from "./router-health";

describe("safety check", () => {
  it("reads Llama Guard's text answers", () => {
    expect(parseGuard({ response: "safe" })).toEqual({ safe: true });
    expect(parseGuard({ response: "unsafe\nS11" })).toEqual({ safe: false, category: "S11" });
    expect(parseGuard("unsafe\nS1")).toEqual({ safe: false, category: "S1" });
  });

  it("reads object answers too", () => {
    expect(parseGuard({ response: { safe: true } })).toEqual({ safe: true });
    expect(parseGuard({ response: { safe: false, categories: ["S12"] } })).toEqual({ safe: false, category: "S12" });
  });

  it("lets school-appropriate topics through (elections, defamation, specialized advice)", () => {
    expect(parseGuard({ response: "unsafe\nS13" })).toEqual({ safe: true });
    expect(parseGuard({ response: "unsafe\nS5" })).toEqual({ safe: true });
  });

  it("answers self-harm with care and real help, and other refusals kindly", () => {
    const care = safetyReply("S11");
    expect(care).toMatch(/988/);
    expect(care).toMatch(/trusted adult/);
    expect(safetyReply("S1")).toMatch(/school project/);
    expect(SCHOOL_RULES).toMatch(/13 and up/);
  });
});

describe("router that repairs itself", () => {
  it("spots a retired or renamed model, but not a rate limit or outage", () => {
    expect(isRetiredModelError(400, 'groq 400: {"error":{"message":"The model `llama3-70b` has been decommissioned"}}')).toBe(true);
    expect(isRetiredModelError(404, "openrouter 404: No endpoints found for model: foo/bar. model_not_found")).toBe(true);
    expect(isRetiredModelError(404, "nvidia 404: The model `x` does not exist")).toBe(true);
    expect(isRetiredModelError(429, "rate limit reached for model")).toBe(false);
    expect(isRetiredModelError(503, "model unavailable")).toBe(false);
    expect(isRetiredModelError(400, "bad request: messages must not be empty")).toBe(false);
  });
});
