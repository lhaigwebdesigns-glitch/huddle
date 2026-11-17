// Multiplayer smoke test: two browsers join one room by party code, chat with the AI,
// and co-edit an AI-created doc. Run against `npm run dev` with MOCK_AI=true in .dev.vars.
import { createRequire } from "node:module";
// Uses a globally installed Playwright if present, else the local devDependency.
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const shots = process.env.SHOTS_DIR;
const browser = await chromium.launch();
const ok = (cond, msg) => {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("✓", msg);
};

try {
  const alice = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const bob = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();

  // Alice creates a room
  await alice.goto(BASE);
  await alice.getByPlaceholder("e.g. Sam").fill("Alice");
  await alice.getByPlaceholder(/Room name/).fill("Science project");
  await alice.getByRole("button", { name: /Create room/ }).click();
  await alice.waitForURL(/\/r\/[A-Z0-9]{6}$/);
  const code = alice.url().split("/r/")[1];
  ok(/^[A-Z0-9]{6}$/.test(code), `room created with party code ${code}`);

  // Bob joins with the code
  await bob.goto(BASE);
  await bob.getByPlaceholder("e.g. Sam").fill("Bob");
  await bob.getByPlaceholder("K7Q-29F").fill(code.slice(0, 3) + "-" + code.slice(3));
  await bob.getByRole("button", { name: "Join", exact: true }).click();
  await bob.waitForURL(new RegExp(`/r/${code}$`));
  await alice.getByTestId("members").getByText("Bob").waitFor();
  ok(true, "Alice sees Bob join (presence)");

  // Alice chats; both see her message and the streamed AI reply
  await alice.getByTestId("composer").fill("Hello everyone, what should we research?");
  await alice.getByTestId("composer").press("Enter");
  await bob.getByText("Hello everyone, what should we research?", { exact: true }).waitFor();
  ok(true, "Bob sees Alice's message in real time");
  await bob.getByTestId("ai-message").first().getByText(/mock AI/).waitFor();
  await alice.getByTestId("ai-message").first().getByText(/mock AI/).waitFor();
  ok(true, "Both see the AI reply stream in");

  // Bob asks the AI to make a doc → it opens for both
  await bob.getByTestId("composer").fill("make a doc with our plan");
  await bob.getByTestId("composer").press("Enter");
  await alice.getByTestId("doc-editor").getByText("This doc was written by the").waitFor({ timeout: 15000 });
  await bob.getByTestId("doc-editor").getByText("This doc was written by the").waitFor();
  ok(true, "AI-created doc opens live for both users");

  // Co-editing: Alice types, Bob sees it
  await alice.getByTestId("doc-editor").getByText("Second point").click();
  await alice.waitForTimeout(150); // human-speed pause so the browser reports the caret position
  await alice.keyboard.press("End");
  await alice.keyboard.press("Enter");
  await alice.keyboard.type("Alice added this line live.");
  await bob.getByTestId("doc-editor").getByText("Alice added this line live.").waitFor({ timeout: 10000 });
  const bobHtml = await bob.getByTestId("doc-editor").innerHTML();
  ok(/Second point[\s\S]*Alice added this line live/.test(bobHtml), "edit landed where Alice clicked (after 'Second point')");
  ok(true, "Bob sees Alice's doc edits in real time");

  // Persistence: reload Bob, history and doc are still there
  await bob.reload();
  await bob.getByText("Hello everyone, what should we research?", { exact: true }).waitFor();
  ok(true, "Chat history persists across reloads");

  // Feedback endpoint
  const fb = await alice.evaluate(async (room) => {
    const r = await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room, uid: "x", name: "Alice", rating: 1, comment: "love it" }),
    });
    return r.status;
  }, code);
  ok(fb === 200, "feedback saved to D1");

  // Bad code is rejected
  const bad = await alice.evaluate(async () => (await fetch("/api/rooms/ZZZZZZ")).status);
  ok(bad === 404, "unknown party code is rejected");

  if (shots) {
    await alice.screenshot({ path: `${shots}/room-alice.png` });
    await bob.goto(BASE);
    await bob.screenshot({ path: `${shots}/home.png` });
  }
  console.log("\nAll multiplayer checks passed.");
} finally {
  await browser.close();
}
