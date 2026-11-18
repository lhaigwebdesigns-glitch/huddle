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

  // Edit & resend: the AI's answer to the edited message is replaced, not duplicated.
  const aiCount = async (p) => p.getByTestId("ai-message").count();
  const waitAiCount = async (p, n) => {
    for (let i = 0; i < 60 && (await aiCount(p)) !== n; i++) await p.waitForTimeout(250);
    return aiCount(p);
  };
  await alice.getByTestId("composer").fill("first draft question");
  await alice.getByTestId("composer").press("Enter");
  await alice.getByTestId("ai-message").last().getByText(/first draft question/).waitFor();
  await alice.getByTestId("regenerate").waitFor();
  const before = await aiCount(alice);
  await alice.getByTestId("user-message").last().hover();
  await alice.getByTestId("edit-message").click();
  await alice.getByLabel("Edit message").fill("second draft question");
  await alice.getByRole("button", { name: "Save & resend" }).click();
  await bob.getByText("second draft question").waitFor();
  await alice.getByTestId("ai-message").last().getByText(/second draft question/).waitFor({ timeout: 10000 });
  ok((await waitAiCount(alice, before)) === before, "editing the last message replaces the AI's answer for everyone");
  ok((await bob.getByText("(edited)").count()) > 0, "Bob sees the (edited) marker");

  // Regenerate swaps the last AI reply rather than adding another one.
  await alice.getByTestId("regenerate").click();
  await alice.waitForTimeout(400);
  await alice.getByTestId("regenerate").waitFor({ timeout: 10000 });
  ok((await waitAiCount(alice, before)) === before, "Regenerate replaces the last AI reply");

  // Slash command menu
  await alice.getByTestId("composer").fill("/do");
  await alice.getByTestId("slash-menu").waitFor();
  await alice.getByTestId("composer").press("Enter");
  ok((await alice.getByTestId("composer").inputValue()) === "/doc ", "slash menu completes /doc");
  await alice.getByTestId("composer").pressSequentially("road trip checklist");
  await alice.getByTestId("composer").press("Enter");
  await bob.getByText("@ai Create a doc: road trip checklist").waitFor();
  ok(true, "/doc expands into an AI request");

  // Invite link toast
  await alice.getByTestId("party-code").click();
  await alice.getByTestId("toast").getByText(/Invite link copied/).waitFor();
  ok(true, "copy invite link shows a toast");

  // Empty room shows clickable suggestions
  const carol = await (await browser.newContext()).newPage();
  await carol.goto(BASE);
  await carol.getByPlaceholder("e.g. Sam").fill("Carol");
  await carol.getByRole("button", { name: /Create room/ }).click();
  await carol.waitForURL(/\/r\/[A-Z0-9]{6}$/);
  await carol.getByTestId("suggestions").getByRole("button").first().click();
  await carol.getByTestId("ai-message").first().waitFor();
  ok(true, "clicking a suggestion sends it");

  // Drive: duplicate copies content, history restores, delete removes for everyone.
  const docRow = alice.getByTestId("drive-file").filter({ hasText: "Mock plan" }).first();
  await docRow.hover();
  await docRow.getByRole("button", { name: /More actions/ }).click();
  await alice.getByRole("menuitem", { name: "Duplicate" }).click();
  await alice.waitForFunction(
    () => document.querySelector('[data-testid=file-panel] input[aria-label="File name"]')?.value === "Copy of Mock plan",
  );
  await alice.getByTestId("doc-editor").getByText("This doc was written by the").waitFor();
  ok(true, "duplicating a doc copies its content");
  await bob.getByTestId("drive-file").filter({ hasText: "Copy of Mock plan" }).waitFor();
  ok(true, "Bob sees the duplicate in the Drive");

  await alice.getByRole("button", { name: "Version history" }).click();
  await alice.getByRole("button", { name: "Save version now" }).click();
  await alice.getByTestId("history").getByRole("button", { name: "Restore" }).first().waitFor();
  await alice.getByTestId("doc-editor").getByText("Second point").click();
  await alice.waitForTimeout(150);
  await alice.keyboard.press("End");
  await alice.keyboard.type(" EDIT-TO-UNDO");
  await alice.getByTestId("doc-editor").getByText(/EDIT-TO-UNDO/).waitFor();
  alice.once("dialog", (d) => d.accept());
  await alice.getByTestId("history").getByRole("button", { name: "Restore" }).last().click();
  await alice.getByTestId("doc-editor").getByText(/EDIT-TO-UNDO/).waitFor({ state: "detached", timeout: 10000 });
  ok(true, "restoring a version rolls the doc back live");

  const copyRow = alice.getByTestId("drive-file").filter({ hasText: "Copy of Mock plan" });
  await copyRow.hover();
  await copyRow.getByRole("button", { name: /More actions/ }).click();
  alice.once("dialog", (d) => d.accept());
  await alice.getByRole("menuitem", { name: "Delete" }).click();
  await bob.getByTestId("drive-file").filter({ hasText: "Copy of Mock plan" }).waitFor({ state: "detached" });
  ok(true, "deleting a file removes it for everyone");

  // Sheets: AI builds one with formulas + a chart; a formula typed by Alice computes for Bob.
  await bob.getByTestId("composer").fill("make a sheet of our costs");
  await bob.getByTestId("composer").press("Enter");
  await alice.getByTestId("sheet-editor").waitFor({ timeout: 15000 });
  await bob.locator('[data-cell="B4"]').getByText("$32.50").waitFor();
  ok(true, "AI-built sheet computes =SUM for everyone");
  await bob.getByTestId("sheet-chart").waitFor();
  ok(true, "AI-added chart renders");
  await alice.locator('[data-cell="C2"]').click();
  await alice.keyboard.type("=B2*2");
  await alice.keyboard.press("Enter");
  await bob.locator('[data-cell="C2"]').getByText("40").waitFor({ timeout: 10000 });
  ok(true, "a formula Alice types computes live for Bob");
  await alice.locator('[data-cell="C2"]').click();
  ok((await alice.getByTestId("formula-bar").inputValue()) === "=B2*2", "formula bar shows the formula");

  // Slides: AI deck, live co-editing of a text box, and "follow the presenter".
  await bob.getByTestId("composer").fill("make slides for our pitch");
  await bob.getByTestId("composer").press("Enter");
  await alice.getByTestId("slides-editor").waitFor({ timeout: 15000 });
  await bob.getByTestId("slides-editor").waitFor();
  ok((await bob.getByTestId("slide-thumb").count()) === 3, "AI deck has 3 slides for everyone");
  const titleBox = alice.getByTestId("slide-canvas").locator('textarea[data-field="title"]');
  await titleBox.click();
  await alice.keyboard.press("End");
  await alice.keyboard.type(" v2");
  await bob.waitForFunction(() => document.querySelector('[data-testid=slide-canvas] textarea[data-field="title"]')?.value === "Mock deck v2", null, { timeout: 10000 });
  ok(true, "slide text edits sync live");
  await alice.getByTestId("present-button").click();
  await alice.getByTestId("present").waitFor();
  await bob.getByTestId("follow-presenter").click();
  await bob.getByTestId("present-index").getByText("Following Alice · 1 / 3").waitFor();
  await alice.keyboard.press("ArrowRight");
  await bob.getByTestId("present-index").getByText("Following Alice · 2 / 3").waitFor({ timeout: 10000 });
  ok(true, "Bob follows Alice's presentation slide by slide");
  await bob.keyboard.press("Escape");
  await alice.keyboard.press("Escape");
  await alice.getByTestId("present").waitFor({ state: "detached" });

  // Whiteboard: AI Mermaid sketch converts once (no duplicates with two browsers open), and
  // shapes Alice draws appear for Bob.
  await bob.getByTestId("composer").fill("make a whiteboard of our launch flow");
  await bob.getByTestId("composer").press("Enter");
  await alice.getByTestId("whiteboard-editor").waitFor({ timeout: 15000 });
  await bob.getByTestId("whiteboard-editor").waitFor();
  const wbCount = (p) => p.getByTestId("wb-count").textContent().then(Number);
  await alice.waitForFunction(() => Number(document.querySelector("[data-testid=wb-count]")?.textContent) > 0, null, { timeout: 30000 });
  await bob.waitForTimeout(2500); // let both browsers finish converting
  const aiShapes = await wbCount(alice);
  ok(aiShapes > 0 && aiShapes === (await wbCount(bob)), `AI diagram drawn once for both (${aiShapes} shapes, no duplicates)`);
  const canvas = alice.locator("canvas.interactive");
  const box = await canvas.boundingBox();
  // An open spot left of centre, clear of the top and bottom toolbars.
  const y0 = box.y + box.height * 0.3;
  await alice.mouse.click(box.x + 80, y0);
  await alice.keyboard.press("r");
  await alice.mouse.move(box.x + 80, y0);
  await alice.mouse.down();
  await alice.mouse.move(box.x + 180, y0 + 70, { steps: 6 });
  await alice.mouse.up();
  await bob.waitForFunction((n) => Number(document.querySelector("[data-testid=wb-count]")?.textContent) === n + 1, aiShapes, { timeout: 10000 });
  ok(true, "a rectangle Alice draws appears on Bob's board");

  // Forms: AI builds one, a stranger fills the public link, responses appear live.
  await bob.getByTestId("composer").fill("make a form for volunteers");
  await bob.getByTestId("composer").press("Enter");
  await alice.getByTestId("form-editor").waitFor({ timeout: 15000 });
  ok((await alice.getByTestId("form-question").count()) === 3, "AI form has 3 questions");
  const formLink = await alice.getByTestId("form-share").getAttribute("data-link");
  const dave = await (await browser.newContext()).newPage();
  await dave.goto(formLink);
  await dave.getByTestId("public-form-title").getByText("Mock signup").waitFor();
  await dave.getByTestId("form-submit").click(); // name is required → blocked
  ok((await dave.getByTestId("form-thanks").count()) === 0, "required questions are enforced");
  await dave.getByLabel(/Your name/).fill("Dave");
  await dave.getByLabel("Afternoon").check();
  await dave.getByText("4", { exact: true }).click();
  await dave.getByTestId("form-submit").click();
  await dave.getByTestId("form-thanks").waitFor();
  ok(true, "a stranger submits the public form");
  await alice.getByTestId("form-tab-responses").getByText("Responses (1)").waitFor({ timeout: 10000 });
  await alice.getByTestId("form-tab-responses").click();
  await alice.getByTestId("form-responses").getByText("Afternoon").waitFor();
  ok(true, "the response shows up live for the room");
  await alice.getByTestId("form-to-sheet").click();
  await alice.getByTestId("sheet-editor").waitFor({ timeout: 10000 });
  await alice.locator('[data-cell="B2"]').getByText("Dave").waitFor();
  ok(true, "responses copy into a new sheet");

  // Artifacts: AI builds a mini app that runs in a sandboxed iframe for everyone.
  await bob.getByTestId("composer").fill("make an app that counts clicks");
  await bob.getByTestId("composer").press("Enter");
  await alice.getByTestId("artifact-viewer").waitFor({ timeout: 15000 });
  const frame = alice.frameLocator('[data-testid="artifact-frame"]');
  await frame.getByRole("button", { name: "Clicked 0 times" }).click();
  await frame.getByRole("button", { name: "Clicked 1 times" }).waitFor();
  ok(true, "AI artifact runs interactively in a sandbox");
  const sandbox = await alice.getByTestId("artifact-frame").getAttribute("sandbox");
  ok(!/allow-same-origin/.test(sandbox ?? ""), "artifact iframe has no same-origin access");

  // Mermaid diagrams render in chat.
  await alice.getByTestId("composer").fill("show a diagram of our plan");
  await alice.getByTestId("composer").press("Enter");
  await bob.getByTestId("mermaid").last().locator("svg").waitFor({ timeout: 15000 });
  ok(true, "Mermaid block renders as a diagram for everyone");

  // Reactions and polls sync live.
  const bobMsg = alice.getByTestId("user-message").filter({ hasText: "make an app that counts clicks" }).last();
  await bobMsg.hover();
  await bobMsg.getByTestId("add-reaction").click();
  await alice.getByRole("button", { name: "React 🎉" }).click();
  await bob.getByTestId("user-message").filter({ hasText: "make an app that counts clicks" }).last().getByTestId("reaction").getByText("🎉 1").waitFor();
  ok(true, "a reaction shows up for everyone");
  await alice.getByTestId("composer").fill("/poll Lunch? | Pizza | Tacos");
  await alice.getByTestId("composer").press("Enter");
  await bob.getByTestId("poll").last().getByTestId("poll-option").filter({ hasText: "Tacos" }).click();
  await alice.getByTestId("poll").last().getByTestId("poll-option").filter({ hasText: "Tacos" }).getByText("1 · 100%").waitFor();
  ok(true, "poll votes sync live");

  // Room memory (host turns it on; the AI remembers; everyone can see it).
  await alice.getByRole("button", { name: /Room settings/ }).click();
  // The checkbox reflects the server's settings, so click and wait for the round trip.
  await alice.getByTestId("toggle-memory").click();
  await alice.waitForFunction(() => document.querySelector('[data-testid="toggle-memory"]')?.checked === true);
  await alice.getByRole("button", { name: "✕" }).first().click();
  await alice.getByTestId("composer").fill("remember that the deadline is Friday");
  await alice.getByTestId("composer").press("Enter");
  await alice.getByTestId("ai-message").last().getByText(/Remembering a fact/).waitFor({ timeout: 15000 });
  await bob.getByRole("button", { name: /Room settings/ }).click();
  await bob.getByTestId("memory-list").getByText("The bake sale deadline is Friday.").waitFor();
  ok(true, "room memory saved and visible to everyone");
  await bob.getByRole("button", { name: "✕" }).first().click();

  // Per-IP rate limit on room creation (cf-connecting-ip is set by Cloudflare in production).
  const statuses = await alice.evaluate(async () => {
    const ip = `e2e-${Math.random()}`;
    const out = [];
    for (let i = 0; i < 22; i++) {
      const r = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": ip },
        body: JSON.stringify({ uid: "rl-test" }),
      });
      out.push(r.status);
    }
    return out;
  });
  ok(statuses.slice(0, 20).every((s) => s === 200) && statuses[21] === 429, "room creation is rate-limited per IP");

  if (shots) {
    await alice.screenshot({ path: `${shots}/room-alice.png` });
    await bob.goto(BASE);
    await bob.screenshot({ path: `${shots}/home.png` });
  }
  console.log("\nAll multiplayer checks passed.");
} finally {
  await browser.close();
}
