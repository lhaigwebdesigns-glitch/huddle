import { describe, expect, it } from "vitest";
import { claimsImage, wantsImage } from "./turn";

describe("image requests and claims", () => {
  it("spots requests for a new image", () => {
    expect(wantsImage("Logan: can you make a logo for our bake sale?")).toBe(true);
    expect(wantsImage("draw a picture of a cat astronaut")).toBe(true);
    expect(wantsImage("generate an image of a sunset over the ocean")).toBe(true);
  });

  it("ignores ordinary questions", () => {
    expect(wantsImage("what does this picture show?")).toBe(false);
    expect(wantsImage("make a doc with our plan")).toBe(false);
    expect(wantsImage("I love that art museum")).toBe(false);
  });

  it("catches replies that claim an image was made", () => {
    expect(claimsImage("Here's your image of a cat astronaut floating in space!")).toBe(true);
    expect(claimsImage("I've created a logo with a cupcake and bold lettering.")).toBe(true);
    expect(claimsImage("I have generated the poster you asked for.")).toBe(true);
  });

  it("doesn't flag normal replies", () => {
    expect(claimsImage("Here's the plan for Saturday.")).toBe(false);
    expect(claimsImage("I made a doc with the schedule.")).toBe(false);
  });
});
