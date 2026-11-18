import { describe, expect, it } from "vitest";
import { expandSlash, matchSlash, parsePoll } from "./slash";

describe("slash commands", () => {
  it("expands known commands into an @ai request", () => {
    expect(expandSlash("/doc bake sale plan")).toBe("@ai Create a doc: bake sale plan");
    expect(expandSlash("/SEARCH  best free maps API ")).toBe("@ai Search the web for: best free maps API");
  });

  it("leaves plain text and unknown commands alone", () => {
    expect(expandSlash("hello /doc")).toBe("hello /doc");
    expect(expandSlash("/shrug")).toBe("/shrug");
  });

  it("needs an argument", () => {
    expect(expandSlash("/doc")).toBeNull();
  });

  it("filters the menu by prefix", () => {
    expect(matchSlash("/s").map((c) => c.name)).toEqual(["search", "sheet", "slides"]);
    expect(matchSlash("/doc x")).toEqual([]);
  });

  it("parses polls", () => {
    expect(parsePoll("/poll Lunch? | Pizza | Tacos")).toEqual({ question: "Lunch?", options: ["Pizza", "Tacos"] });
    expect(parsePoll("/poll Lunch? | Pizza")).toBeNull();
  });
});
