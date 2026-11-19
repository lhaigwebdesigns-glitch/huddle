import { describe, expect, it } from "vitest";
import { compactDocArgs, withFreshNote } from "./turn";
import type { ToolCall } from "./providers";

describe("AI turn helpers", () => {
  it("points the model at the message that arrived after its last reply", () => {
    const out = withFreshNote([
      { role: "user", content: "Bob: what's 17 times 23?" },
      { role: "assistant", content: "Bob, it's 391." },
      { role: "user", content: "Alice: name for a cat?" },
    ]);
    expect(out).toHaveLength(3);
    expect(out[2].content).toMatch(/^Alice: name for a cat\?\n\n\[Huddle note: reply only to the message\(s\) from Alice/);
    expect(out[0].content).toBe("Bob: what's 17 times 23?");
  });

  it("leaves a single speaker's first message untouched", () => {
    const hist = [{ role: "user" as const, content: "Alice: hi" }];
    expect(withFreshNote(hist)).toEqual(hist);
  });

  it("asks for an answer to everyone when several people speak at once", () => {
    const out = withFreshNote([
      { role: "user", content: "Bob: 17 times 23?" },
      { role: "user", content: "Alice: cat name?" },
    ]);
    expect(out[0].content).toBe("Bob: 17 times 23?");
    expect(out[1].content).toContain("Bob and Alice have each sent a message");
  });

  it("compacts doc Markdown in tool-call history but leaves other tools alone", () => {
    const doc: ToolCall = {
      id: "1",
      type: "function",
      function: { name: "create_doc", arguments: JSON.stringify({ title: "Plan", markdown: "x".repeat(2000) }) },
    };
    compactDocArgs(doc);
    const args = JSON.parse(doc.function.arguments);
    expect(args.title).toBe("Plan");
    expect(args.markdown).toMatch(/2000 characters/);

    const search: ToolCall = { id: "2", type: "function", function: { name: "web_search", arguments: '{"query":"x"}' } };
    compactDocArgs(search);
    expect(search.function.arguments).toBe('{"query":"x"}');
  });
});

describe("wantsResearch", () => {
  it("spots research requests but not everyday words", async () => {
    const { wantsResearch } = await import("./turn");
    expect(wantsResearch("Logan: do a deep research and compile a doc about thermodynamics, cite the sites")).toBe(true);
    expect(wantsResearch("can you research flights?")).toBe(true);
    expect(wantsResearch("I'm so excited for Friday")).toBe(false);
    expect(wantsResearch("what are good sources of protein?")).toBe(false);
  });
});
