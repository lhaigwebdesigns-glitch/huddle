// Multiplayer smoke test: two browsers join one room by party code, chat with the AI,
// and co-edit an AI-created doc. Run against `npm run dev` with MOCK_AI=true in .dev.vars.
import { createRequire } from "node:module";
// Uses a globally installed Playwright if present, else the local devDependency.
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const shots = process.env.SHOTS_DIR;
const browser = await chromium.launch();
// Test browsers have already confirmed "13 or older" (one check below tests the prompt itself).
const newContextRaw = browser.newContext.bind(browser);
// Everyone signs in now: each test browser gets its own account (dev login) unless it asks to
// stay signed out. `as` is the account name, `email` the school email (for class lists).
let testers = 0;
browser.newContext = async (opts = {}) => {
  const { askAge, as, email, signedOut, ...rest } = opts;
  const ctx = await newContextRaw(rest);
  if (!askAge) await ctx.addInitScript(() => localStorage.setItem("huddle.age13", "1"));
  if (!signedOut) {
    const uid = crypto.randomUUID();
    await ctx.addInitScript((u) => {
      if (!localStorage.getItem("huddle.uid")) localStorage.setItem("huddle.uid", u);
    }, uid);
    const q = new URLSearchParams({ name: as ?? `Tester ${++testers}`, key: `e2e-${uid}`, uid, return: "/" });
    if (email) q.set("email", email);
    await ctx.request.get(`${BASE}/api/auth/login/dev?${q}`, { maxRedirects: 0 });
  }
  return ctx;
};
/** A small Word file: a heading, bold text and a table (what a teacher's handout looks like). */
async function makeDocx() {
  const JSZip = createRequire(import.meta.url)("jszip");
  const zip = new JSZip();
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/_rels/document.xml.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  );
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8"?><w:styles ${W}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`);
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>` +
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Cell Worksheet</w:t></w:r></w:p>' +
      '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Question 1:</w:t></w:r><w:r><w:t xml:space="preserve"> What does the nucleus do?</w:t></w:r></w:p>' +
      "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Organelle</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Job</w:t></w:r></w:p></w:tc></w:tr></w:tbl>" +
      "</w:body></w:document>",
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

/** A small PowerPoint: one slide with a title and a text box. */
async function makePptx() {
  const PptxGenJS = createRequire(import.meta.url)("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  const slide = pptx.addSlide();
  slide.addText("Organelles", { x: 1, y: 0.5, w: 8, h: 1, fontSize: 40, bold: true });
  slide.addText("Mitochondria make energy", { x: 1, y: 2, w: 8, h: 1, fontSize: 24, color: "2F7F8C" });
  return Buffer.from(await pptx.write({ outputType: "nodebuffer" }));
}
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const ok = (cond, msg) => {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("✓", msg);
};

/** Waits until `page` shows a visible live pointer labelled `name`. */
const seePointer = (page, name) =>
  page.waitForFunction(
    (n) => [...document.querySelectorAll('[data-testid="live-pointer"]')].some((el) => el.textContent.includes(n) && getComputedStyle(el).opacity === "1"),
    name,
    { timeout: 8000 },
  );

try {
  const alice = await (await browser.newContext({ viewport: { width: 1400, height: 900 }, as: "Alice" })).newPage();
  const bob = await (await browser.newContext({ viewport: { width: 1400, height: 900 }, as: "Bob" })).newPage();

  // Alice creates a room
  await alice.goto(BASE);
  await alice.getByPlaceholder("e.g. Sam").fill("Alice");
  await alice.getByPlaceholder(/Room name/).fill("Science project");
  await alice.locator("#start").getByRole("button", { name: /Start a room/ }).click();
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

  // Age check: someone new must confirm they're 13 or older before entering a room.
  // Signed out, a room link asks you to sign in first, and the live connection itself is refused.
  const stranger = await (await browser.newContext({ signedOut: true })).newPage();
  await stranger.goto(`${BASE}/r/${code}`);
  await stranger.getByTestId("sign-in-gate").waitFor();
  ok((await stranger.getByTestId("composer").count()) === 0, "signed out, a room link asks you to sign in first");
  const wsStatus = await stranger.evaluate(async (c) => (await fetch(`/parties/room/${c}?uid=fake`)).status, code);
  ok(wsStatus === 401, "the server refuses room connections from people who aren't signed in");
  await stranger.close();
  const newbie = await (await browser.newContext({ askAge: true, as: "Newbie" })).newPage();
  await newbie.goto(`${BASE}/r/${code}`);
  await newbie.getByRole("button", { name: /Join room/ }).click();
  await newbie.waitForTimeout(500);
  ok((await newbie.getByTestId("composer").count()) === 0, "you can't enter a room without confirming you're 13 or older");
  await newbie.getByTestId("age-13").check();
  await newbie.getByRole("button", { name: /Join room/ }).click();
  await newbie.getByTestId("composer").waitFor();
  ok(true, "after confirming 13+, you join the room");
  await newbie.close();


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
  const docBox = await alice.getByTestId("doc-editor").boundingBox();
  await alice.mouse.move(docBox.x + 120, docBox.y + 60, { steps: 4 });
  await alice.mouse.move(docBox.x + 160, docBox.y + 80, { steps: 4 });
  await seePointer(bob, "Alice");
  ok(true, "Bob sees Alice's live pointer in the doc");

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
  const carol = await (await browser.newContext({ as: "Carol" })).newPage();
  await carol.goto(BASE);
  await carol.getByPlaceholder("e.g. Sam").fill("Carol");
  await carol.locator("#start").getByRole("button", { name: /Start a room/ }).click();
  await carol.waitForURL(/\/r\/[A-Z0-9]{6}$/);
  await carol.getByTestId("suggestions").getByRole("button").first().click();
  await carol.getByTestId("ai-message").first().waitFor();
  ok(true, "clicking a suggestion sends it");

  // Drive: duplicate copies content, history restores, delete removes for everyone.
  const docRow = alice.getByTestId("drive-file").filter({ hasText: "Mock plan" }).first();
  // The file list can re-render while it settles (live presence), so open the menu again if it detaches.
  for (let tries = 0; ; tries++) {
    try {
      await docRow.hover();
      await docRow.getByRole("button", { name: /More actions/ }).click({ timeout: 5000 });
      await alice.getByRole("menuitem", { name: "Duplicate" }).click({ timeout: 5000 });
      break;
    } catch (e) {
      if (tries >= 3) throw e;
      await alice.keyboard.press("Escape");
    }
  }
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
  await alice.getByTestId("history").getByRole("button", { name: "Restore" }).last().click();
  await alice.getByTestId("dialog-confirm").click();
  await alice.getByTestId("doc-editor").getByText(/EDIT-TO-UNDO/).waitFor({ state: "detached", timeout: 10000 });
  ok(true, "restoring a version rolls the doc back live");

  const copyRow = alice.getByTestId("drive-file").filter({ hasText: "Copy of Mock plan" });
  await copyRow.hover();
  await copyRow.getByRole("button", { name: /More actions/ }).click();
  await alice.getByRole("menuitem", { name: "Delete" }).click();
  await alice.getByTestId("dialog-confirm").click();
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
  const cellBox = await bob.locator('[data-cell="A3"]').boundingBox();
  await bob.mouse.move(cellBox.x + 10, cellBox.y + 5, { steps: 4 });
  await bob.mouse.move(cellBox.x + 30, cellBox.y + 8, { steps: 4 });
  await seePointer(alice, "Bob");
  ok(true, "Alice sees Bob's live pointer in the sheet");
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
  const dave = await (await browser.newContext({ as: "Dave" })).newPage();
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
  await alice.getByRole("button", { name: "Close settings" }).click();
  await alice.getByTestId("composer").fill("remember that the deadline is Friday");
  await alice.getByTestId("composer").press("Enter");
  await alice.getByTestId("ai-message").last().getByText(/Remembering a fact/).waitFor({ timeout: 15000 });
  await bob.getByRole("button", { name: /Room settings/ }).click();
  await bob.getByTestId("memory-list").getByText("The bake sale deadline is Friday.").waitFor();
  ok(true, "room memory saved and visible to everyone");
  await bob.getByRole("button", { name: "Close settings" }).click();

  // Uploads: a CSV becomes searchable knowledge and opens as a sheet; an image shows inline.
  await alice.getByTestId("file-input").setInputFiles({ name: "budget.csv", mimeType: "text/csv", buffer: Buffer.from("Item,Cost\nFlour budget,20\nSugar,12\n") });
  await alice.getByTestId("pending-uploads").getByText("budget.csv").waitFor();
  await alice.getByTestId("composer").fill("what do the files say about flour?");
  await alice.getByTestId("composer").press("Enter");
  await bob.getByTestId("file-chip").filter({ hasText: "budget.csv" }).getByText(/searchable/).waitFor({ timeout: 10000 });
  await alice.getByTestId("ai-message").last().getByText(/Searching room files/).waitFor({ timeout: 15000 });
  ok(true, "uploaded CSV is shared and searchable by the AI");
  await bob.getByTestId("file-chip").filter({ hasText: "budget.csv" }).getByTestId("open-as-sheet").click();
  await bob.getByTestId("sheet-editor").waitFor({ timeout: 10000 });
  await bob.locator('[data-cell="A2"]').getByText("Flour budget").waitFor();
  ok(true, "a CSV upload opens as a live sheet");
  const avatarPng /* also reused for the profile picture test */ = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await alice.getByTestId("file-input").setInputFiles({ name: "dot.png", mimeType: "image/png", buffer: avatarPng });
  await alice.getByTestId("pending-uploads").getByText("dot.png").waitFor();
  await alice.getByTestId("composer").fill("look at this");
  await alice.getByTestId("composer").press("Enter");
  await bob.waitForFunction(() => [...document.querySelectorAll('[data-testid="attachments"] img')].some((i) => i.naturalWidth > 0), null, { timeout: 10000 });
  ok(true, "an uploaded image shows for everyone");

  // Code runner: JavaScript in an AI reply runs in a sandbox on the viewer's device.
  await alice.getByTestId("composer").fill("show js for the answer");
  await alice.getByTestId("composer").press("Enter");
  await alice.getByTestId("ai-message").last().getByTestId("run-code").click();
  await alice.getByTestId("run-output").last().getByText("answer 42").waitFor({ timeout: 10000 });
  ok(true, "JS code blocks run in a sandbox");

  // Custom assistant: the host renames the AI and it replies under that name.
  await alice.getByRole("button", { name: /Room settings/ }).click();
  await alice.getByLabel("Assistant name").fill("Coach Kai");
  await alice.getByLabel("Assistant instructions").fill("Be encouraging.");
  await alice.getByTestId("assistant-apply").click();
  await alice.getByTestId("assistant-share").click();
  await alice.getByTestId("assistant-msg").getByText(/Share code: [A-Z0-9]{3}-[A-Z0-9]{3}/).waitFor();
  await alice.getByRole("button", { name: "Close settings" }).click();
  await bob.getByTestId("composer").fill("hello coach");
  await bob.getByTestId("composer").press("Enter");
  await alice.getByTestId("ai-message").last().getByText("Coach Kai", { exact: true }).waitFor({ timeout: 10000 });
  ok(true, "custom assistant name and share code work");

  // Share link: the host publishes a read-only snapshot.
  await alice.getByTestId("share-chat").click();
  const [shared] = await Promise.all([alice.context().waitForEvent("page"), alice.getByTestId("dialog-confirm").click()]);
  await shared.getByTestId("shared-title").getByText("Science project").waitFor();
  ok((await shared.getByTestId("shared-message").count()) > 5, "read-only share link shows the chat");
  await shared.close();

  // Accounts (dev sign-in, local only): signing in lands on the dashboard, which lists your rooms.
  const erin = await (await browser.newContext()).newPage();
  await erin.goto(`${BASE}/api/auth/login/dev?name=Erin&return=/`);
  await erin.waitForURL(/\/dashboard$/);
  await erin.getByPlaceholder("New room name").fill("Erin's room");
  await erin.getByRole("button", { name: /Start a room/ }).click();
  await erin.waitForURL(/\/r\/[A-Z0-9]{6}$/);
  const erinCode = erin.url().slice(-6);
  const pretty = `${erinCode.slice(0, 3)}-${erinCode.slice(3)}`;
  await erin.goto(`${BASE}/dashboard`);
  const erinRow = erin.getByTestId("dash-room").filter({ hasText: pretty });
  await erinRow.getByTestId("host-badge").waitFor();
  ok(true, "sign-in lands on the dashboard, which lists the room with a Host badge");

  // Moderation: Frank joins Erin's room; kick lets him rejoin, ban blocks him, unban lets him back.
  const frank = await (await browser.newContext({ as: "Frank" })).newPage();
  await frank.goto(BASE);
  await frank.evaluate(() => localStorage.setItem("huddle.name", "Frank"));
  const frankJoin = () => frank.goto(`${BASE}/r/${erinCode}`);
  await frankJoin();
  await erin.goto(`${BASE}/r/${erinCode}`);
  await erin.getByTestId("members").getByText("Frank").waitFor();
  await erin.getByRole("button", { name: /Room settings/ }).click();
  const party = erin.getByTestId("manage-party");
  await party.getByRole("button", { name: "Kick" }).click();
  await frank.getByTestId("room-closed").getByText("The host removed you from this room.").waitFor();
  await frank.getByRole("button", { name: "Rejoin" }).click();
  await erin.getByTestId("members").getByText("Frank").waitFor();
  ok(true, "kick removes someone, and they can rejoin");
  await party.getByRole("button", { name: "Ban" }).click();
  await party.getByRole("button", { name: "Ban" }).click(); // confirm
  await frank.getByTestId("room-closed").getByText("The host banned you from this room.").waitFor();
  await frankJoin();
  await frank.getByText("The host banned you from this room.").waitFor();
  ok(true, "ban removes someone and blocks them from rejoining");
  await party.getByTestId("party-bans").getByRole("button", { name: "Unban" }).click();
  await party.getByTestId("party-bans").getByText("No one is banned.").waitFor();
  await frankJoin();
  await erin.getByTestId("members").getByText("Frank").waitFor();
  ok(true, "unban lets them back in");
  await erin.getByRole("button", { name: "Close settings" }).click();

  // Delete: Erin deletes the room from her dashboard while Frank is inside.
  await erin.goto(`${BASE}/dashboard`);
  await erinRow.getByRole("button", { name: /Options for/ }).click();
  await erin.getByRole("menuitem", { name: "Delete room" }).click();
  await erin.getByLabel(/Type the code/).fill(erinCode);
  await erin.getByTestId("confirm-delete").click();
  await frank.getByTestId("room-closed").getByText("The host deleted this room.").waitFor();
  await erinRow.waitFor({ state: "detached" });
  const gone = await erin.evaluate(async (c) => (await fetch(`/api/rooms/${c}`)).status, erinCode);
  ok(gone === 404, "deleting a room sends everyone out and erases it");

  // Guests keep only their last 3 rooms on the landing page.
  const gina = await (await browser.newContext({ signedOut: true })).newPage();
  await gina.goto(BASE);
  await gina.evaluate(() => {
    const now = Date.now();
    const list = ["AAAAA1", "AAAAA2", "AAAAA3", "AAAAA4", "AAAAA5"].map((code, i) => ({ code, title: `Room ${i + 1}`, at: now - i * 1000 }));
    localStorage.setItem("huddle.recent", JSON.stringify(list));
  });
  await gina.reload();
  await gina.getByTestId("recent-rooms").waitFor();
  ok((await gina.getByTestId("recent-rooms").locator("li").count()) === 3, "this device shows at most 3 recent rooms");
  ok((await gina.getByTestId("start-signin").count()) === 1, "signed out, the landing page asks you to sign in to start a room");

  // Profile: Erin renames herself and uploads a picture; both show up when she joins a room.
  await erin.goto(`${BASE}/profile`);
  await erin.getByTestId("profile").waitFor();
  const newName = `Erin ${Math.floor(Math.random() * 1000)}`;
  await erin.getByLabel("Display name").fill(newName);
  await erin.getByRole("button", { name: "Save" }).click();
  await erin.getByText("Name saved.").waitFor();
  // A tiny valid PNG (1×1 pixel).
  await erin.getByTestId("avatar-input").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: avatarPng });
  await erin.getByText("Picture updated.").waitFor();
  await erin.reload();
  ok((await erin.getByLabel("Display name").inputValue()) === newName, "profile name is saved");
  await erin.goto(`${BASE}/dashboard`);
  await erin.getByPlaceholder("New room name").fill("Erin's picture room");
  await erin.getByRole("button", { name: /Start a room/ }).click();
  await erin.waitForURL(/\/r\/[A-Z0-9]{6}$/);
  const me = erin.getByTestId("members").locator("li").filter({ hasText: newName });
  await me.waitFor();
  ok((await me.locator("img").getAttribute("src"))?.startsWith("/api/avatars/"), "the new name and picture show in rooms");

  // File menu: open the ⋯ menu on the last file in the list; it must be fully on screen.
  await erin.getByTestId("composer").fill("make a doc with our plan");
  await erin.getByTestId("composer").press("Enter");
  await erin.getByTestId("doc-editor").waitFor({ timeout: 15000 });
  const lastFile = erin.getByTestId("drive-file").last();
  await lastFile.hover();
  await lastFile.getByRole("button", { name: /More actions/ }).click();
  const menuBox = await erin.getByTestId("file-menu").boundingBox();
  const vp = erin.viewportSize();
  ok(menuBox && menuBox.y >= 0 && menuBox.y + menuBox.height <= vp.height && menuBox.x >= 0 && menuBox.x + menuBox.width <= vp.width, "file ⋯ menu opens fully on screen");
  await erin.getByRole("menuitem", { name: "Rename" }).click();
  await erin.getByLabel("New file name").fill("Renamed plan");
  await erin.keyboard.press("Enter");
  await erin.getByTestId("drive-file").filter({ hasText: "Renamed plan" }).waitFor();
  ok(true, "file menu actions work");

  // ---------- Projects: AI rules, tutor mode, paste block, turn in ----------
  const teach = await (await browser.newContext({ viewport: { width: 1400, height: 900 }, as: "Ms. Lee" })).newPage();
  await teach.goto(BASE);
  const projCode = await teach.evaluate(async () => {
    localStorage.setItem("huddle.name", "Ms. Lee");
    if (!localStorage.getItem("huddle.uid")) localStorage.setItem("huddle.uid", crypto.randomUUID());
    const r = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        uid: localStorage.getItem("huddle.uid"),
        title: "WWI slides",
        project: { instructions: "Make 5 slides on one cause of WWI.", rubric: "Sources 50%", ai: "off", pasteGuard: true },
      }),
    });
    return (await r.json()).code;
  });
  await teach.goto(`${BASE}/r/${projCode}`);
  await teach.getByTestId("project-bar").waitFor();
  const sam = await (await browser.newContext({ viewport: { width: 1400, height: 900 }, as: "Sam" })).newPage();
  await sam.goto(`${BASE}/r/${projCode}`);
  await sam.getByTestId("ai-chip").getByText("AI off").waitFor();
  ok(true, "a student sees the project bar with the AI setting");
  await sam.getByTestId("project-details-toggle").click();
  await sam.getByTestId("project-details").getByText("Sources 50%").waitFor();
  ok(true, "instructions and rubric show in the project bar");

  await sam.getByTestId("composer").fill("@ai write our slides");
  await sam.getByTestId("composer").press("Enter");
  await sam.getByTestId("toast").getByText(/AI is turned off/).waitFor();
  await sam.waitForTimeout(1500);
  ok((await sam.getByTestId("ai-message").count()) === 0, "with AI off, @ai gets no AI reply");

  // Paste block: outside text is refused (and the student is told); text copied inside Cairn pastes fine.
  const pasteResult = await sam.evaluate(() => {
    const box = document.querySelector('[data-testid="composer"]');
    box.focus();
    const paste = (text) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      return box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    };
    const essay = "The alliance system turned a regional conflict into a world war in 1914.";
    const outside = paste(essay);
    box.value = essay;
    box.setSelectionRange(0, essay.length);
    document.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, cancelable: true }));
    box.value = "";
    const inside = paste(essay);
    return { outside, inside };
  });
  ok(pasteResult.outside === false && pasteResult.inside === true, "outside pastes are blocked; pastes copied inside Cairn work");
  await sam.getByTestId("toast").getByText(/Pasting from outside Cairn is off/).waitFor();
  ok(true, "a blocked paste tells the student why");

  // The teacher switches the project to tutor only: the AI talks but makes no files.
  await teach.getByRole("button", { name: /Room settings/ }).click();
  await teach.getByTestId("ai-tutor").click();
  await teach.getByTestId("project-save").click();
  await teach.getByRole("button", { name: "Close settings" }).click();
  await sam.getByTestId("ai-chip").getByText("Tutor only").waitFor();
  await sam.getByTestId("composer").fill("make a doc with our plan");
  await sam.getByTestId("composer").press("Enter");
  await sam.getByTestId("ai-message").first().getByText(/mock AI/).waitFor();
  await sam.waitForTimeout(1000);
  ok((await sam.getByTestId("drive-file").count()) === 0, "in tutor mode the AI answers but makes no files");

  // Full help: the AI makes a doc. Then the group turns the project in and the files lock.
  await teach.getByRole("button", { name: /Room settings/ }).click();
  await teach.getByTestId("ai-full").click();
  await teach.getByTestId("project-save").click();
  await teach.getByRole("button", { name: "Close settings" }).click();
  await sam.getByTestId("ai-chip").getByText(/full help/).waitFor();
  await sam.getByTestId("composer").fill("make a doc with our plan");
  await sam.getByTestId("composer").press("Enter");
  await sam.getByTestId("doc-editor").waitFor({ timeout: 15000 });
  ok(true, "with full help the AI makes files");

  // Tasks and roles: Sam picks a role, adds a task, finishes it; the AI can split up the work.
  await sam.getByTestId("tasks-toggle").click();
  await sam.getByTestId("my-role").fill("Researcher");
  await sam.getByTestId("my-role").press("Enter");
  await sam.getByTestId("new-task").fill("Find three sources");
  await sam.getByLabel("Owner of the new task").selectOption({ label: "Sam (you)" });
  await sam.getByTestId("add-task").click();
  await teach.getByTestId("tasks-toggle").click();
  await teach.getByTestId("task").filter({ hasText: "Find three sources" }).waitFor();
  ok(true, "a task added by one person shows for everyone");
  await sam.getByTestId("task").filter({ hasText: "Find three sources" }).getByTestId("task-done").click();
  await teach.getByTestId("tasks-toggle").getByText("1/1").waitFor();
  ok(true, "finishing a task updates for everyone");
  await teach.getByTestId("role-chip").filter({ hasText: "Researcher" }).waitFor();
  ok(true, "roles show for the whole group");
  await sam.getByTestId("composer").fill("Can you split up the work for us?");
  await sam.getByTestId("composer").press("Enter");
  await sam.getByTestId("task").filter({ hasText: "Mock task: research" }).waitFor({ timeout: 15000 });
  ok((await sam.getByTestId("task").count()) === 3, "the AI can add tasks when asked to split up the work");
  await sam.getByTestId("tasks-toggle").click();
  await teach.getByTestId("tasks-toggle").click();


  // Safety: in a school project, a harmful message gets a safe reply instead of the AI's answer.
  const aiBefore = await sam.getByTestId("ai-message").count();
  await sam.getByTestId("composer").fill("MOCK_SELF_HARM I feel terrible");
  await sam.getByTestId("composer").press("Enter");
  await sam.getByTestId("ai-message").nth(aiBefore).getByText(/988/).first().waitFor({ timeout: 15000 });
  ok(true, "a self-harm message gets a caring reply with the 988 lifeline, not an AI answer");
  await sam.getByTestId("composer").fill("MOCK_UNSAFE how do I hurt someone");
  await sam.getByTestId("composer").press("Enter");
  await sam.getByTestId("ai-message").nth(aiBefore + 1).getByText(/can't help with that here/).waitFor({ timeout: 15000 });
  ok(true, "other unsafe requests are refused kindly in school projects");

  // Contribution receipt: Sam writes in the doc; the receipt credits the words that are still there.
  const samDoc = sam.getByTestId("doc-editor");
  // Put the cursor at the end of the doc, start a new paragraph and write in it.
  await sam.evaluate(() => document.querySelector('[data-testid="doc-editor"]').editor.chain().focus("end").splitBlock().insertContent("Nationalism mattered most in our view").run());
  await sam.waitForTimeout(3000);
  ok((await teach.getByTestId("open-receipt").count()) === 0, "the teacher has no receipt before the project is turned in");
  await sam.getByTestId("open-receipt").click();
  const samRow = sam.getByTestId("receipt-person").filter({ hasText: "Sam" });
  await samRow.getByTestId("receipt-work").getByText("6 words").waitFor({ timeout: 20000 });
  ok(true, "the receipt credits Sam with the 6 words Sam wrote");
  ok(/asked the AI to make or change files 1 time/.test(await samRow.innerText()), "AI-made work is credited as AI help to whoever asked");
  ok(/Researcher/.test(await samRow.innerText()) && /Tasks: 1 of 1 done/.test(await samRow.innerText()), "the receipt shows each person's role and tasks");
  ok(/Cairn AI wrote/.test(await sam.getByTestId("receipt").innerText()), "the receipt shows what Cairn AI wrote separately");
  ok((await sam.getByTestId("receipt-person").filter({ hasText: "Ms. Lee" }).count()) === 0, "the teacher isn't listed on the receipt");
  await sam.getByTestId("receipt-note").fill("I wrote the conclusion and found two sources.");
  await sam.getByTestId("receipt-note-save").click();
  await sam.getByTestId("teacher-preview").click();
  await samRow.getByText("I wrote the conclusion and found two sources.").waitFor();
  ok(true, "notes save, and the teacher's-view preview shows them");
  await sam.getByRole("button", { name: "Close receipt" }).click();

  // Turning in goes through the receipt: the group's last look.
  await sam.getByTestId("turn-in").click();
  await sam.getByTestId("receipt").getByText("Check your receipt, then turn it in").waitFor();
  await sam.getByTestId("confirm-turn-in").click();
  await sam.getByTestId("turned-in").waitFor();
  await teach.getByTestId("open-receipt").click();
  const final = teach.getByTestId("receipt");
  await final.getByText(/Final, turned in/).waitFor();
  await final.getByText("I wrote the conclusion and found two sources.").waitFor();
  ok(true, "after turning in, the teacher sees the frozen receipt with notes");
  await teach.getByRole("button", { name: "Close receipt" }).click();
  await sam.getByTestId("locked-banner").waitFor();
  ok((await sam.getByTestId("doc-editor").getAttribute("contenteditable")) === "false", "turning in makes the files read-only");
  await teach.getByTestId("room-notice").getByText(/Sam turned in the project/).waitFor();
  ok(true, "everyone sees who turned the project in");
  ok((await sam.getByTestId("reopen").count()) === 0, "only the teacher can reopen");
  // Even if someone forces their editor back on, the server refuses the edit.
  await sam.evaluate(() => {
    const ed = document.querySelector('[data-testid="doc-editor"]').editor;
    ed.setEditable(true);
    ed.commands.insertContent("SNEAKY EDIT");
  });
  await sam.waitForTimeout(2500);
  await teach.reload();
  await teach.getByTestId("project-bar").waitFor();
  await teach.getByTestId("drive-file").first().click();
  await teach.getByTestId("doc-editor").getByText("This doc was written by the").waitFor();
  ok(!(await teach.getByTestId("doc-editor").innerText()).includes("SNEAKY EDIT"), "the server rejects edits to a turned-in file");
  await sam.reload();
  await sam.getByTestId("turned-in").waitFor();
  await teach.getByTestId("reopen").click();
  await teach.getByTestId("dialog-confirm").click();
  await sam.getByTestId("turn-in").waitFor();
  if (!(await sam.getByTestId("doc-editor").count())) await sam.getByTestId("drive-file").first().click();
  await sam.waitForFunction(() => document.querySelector('[data-testid="doc-editor"]')?.getAttribute("contenteditable") === "true");
  ok(true, "the teacher reopens it and the group can edit again");

  // Templates: a "Presentation" project starts with its files and tasks.
  const tplCode = await teach.evaluate(async () => {
    const r = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uid: localStorage.getItem("huddle.uid"), title: "Template check", project: { ai: "tutor" }, template: "presentation" }),
    });
    return (await r.json()).code;
  });
  await teach.goto(`${BASE}/r/${tplCode}`);
  await teach.getByTestId("tasks-toggle").getByText("0/7").waitFor();
  ok((await teach.getByTestId("drive-file").count()) === 2, "a template project starts with its files and 7 tasks");

  // ---------- Classes: a teacher's class, a group assignment, progress and grading ----------
  const park = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await park.goto(`${BASE}/api/auth/login/dev?name=Ms.%20Park%20${Date.now() % 100000}&return=/classes`);
  await park.waitForURL(/\/classes$/);
  await park.getByTestId("pick-role").waitFor();
  ok(true, "a new account picks teacher before using teacher tools");
  await park.getByTestId("im-teacher").click();
  await park.getByTestId("getting-started").waitFor();
  ok((await park.getByTestId("setup-step").first().getAttribute("data-done")) === "0", "a new teacher sees the getting-started steps, starting with making a class");
  await park.getByLabel("Class name").fill("Period 3 History");
  await park.getByTestId("create-class").click();
  await park.waitForURL(/\/classes\/[a-z0-9]+$/);
  const classUrl = park.url();
  const classLink = await park.getByTestId("copy-class-link").getAttribute("data-link");
  ok(/\/c\/[A-Z0-9]{6}$/.test(classLink), "a teacher creates a class and gets a class link");
  const share = new URL(await park.getByTestId("share-class-to-classroom").getAttribute("href"));
  ok(share.origin === "https://classroom.google.com" && share.searchParams.get("url") === classLink, "Share to Google Classroom posts the class link");
  const RUN = Date.now() % 1000000;
  const emailOf = (n) => `${n.toLowerCase()}.${RUN}@school.test`;
  await park.getByTestId("roster-input").fill(`${emailOf("Ava")}, ${emailOf("Ben")}\n${emailOf("Cam")}`);
  await park.getByTestId("roster-add").click();
  await park.getByTestId("class-list").getByText("Added 3 emails.").waitFor();
  ok(true, "a teacher pastes school emails into the class list");
  const kids = [];
  for (const name of ["Ava", "Ben", "Cam", "Dee"]) {
    const p = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, as: name, email: emailOf(name) })).newPage();
    await p.goto(classLink);
    await p.getByTestId("joining-as").getByText(name, { exact: true }).waitFor();
    await p.getByTestId("join-class").click();
    if (name === "Dee") {
      await p.getByTestId("waiting-for-teacher").waitFor();
      ok(true, "a student who isn't on the class list waits for the teacher");
      await park.reload();
      await park.getByTestId("waiting-student").filter({ hasText: "Dee" }).getByTestId("admit-student").click();
      await p.getByText("You're in this class").waitFor({ timeout: 20000 });
      ok(true, "the teacher lets them in, and their page opens by itself");
    } else await p.getByText("You're in this class").waitFor();
    kids.push(p);
  }
  ok(true, "students on the class list get straight in after signing in");
  // Joining as a student makes it a student account: no teacher tools.
  await kids[0].goto(`${BASE}/classes`);
  await kids[0].getByTestId("student-account").waitFor();
  const studentMakesClass = await kids[0].evaluate(async () => (await fetch("/api/classes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Sneaky class" }) })).status);
  const studentPicksTeacher = await kids[0].evaluate(async () => (await fetch("/api/auth/role", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "teacher" }) })).status);
  ok(studentMakesClass === 403 && studentPicksTeacher === 409, "a student account can't make classes or switch itself to a teacher account");
  await kids[0].goto(classLink);
  await kids[0].getByText("You're in this class").waitFor();
  await park.reload();
  await park.getByTestId("roster").getByText("Dee").waitFor();
  ok(true, "students join with the class link, and the teacher sees the roster");
  await park.getByTestId("no-assignments").getByTestId("new-assignment-btn").click();
  await park.getByTestId("a-template-presentation").click();
  await park.getByTestId("wizard-next").click();
  ok((await park.getByRole("alert").innerText()).includes("title"), "the wizard asks for a title before going on");
  await park.getByLabel("Assignment title").fill("WWI presentation");
  await park.getByTestId("wizard-next").click();
  await park.getByTestId("mode-groups").click();
  await park.getByLabel("Group size").fill("2");
  await park.getByTestId("create-assignment").click();
  await park.getByTestId("wizard-ready").waitFor();
  const wizPost = new URL(await park.getByTestId("wizard-post-to-classroom").getAttribute("href"));
  ok(wizPost.origin === "https://classroom.google.com" && (wizPost.searchParams.get("url") ?? "").startsWith(`${classLink}/a/`), "the wizard's last step is posting the assignment link to Classroom");
  await park.getByTestId("wizard-done").click();
  await park.getByTestId("group-card").nth(1).waitFor({ timeout: 20000 });
  ok((await park.getByTestId("group-card").count()) === 2, "an assignment makes one project room per group");
  const post = new URL(await park.getByTestId("post-to-classroom").getAttribute("href"));
  ok(post.searchParams.get("title") === "WWI presentation" && (post.searchParams.get("url") ?? "").startsWith(`${classLink}/a/`), "each assignment is posted to Classroom with its title and its own link");
  const rooms = [];
  for (const k of kids) {
    await k.reload();
    await k.getByTestId("open-group-room").click();
    await k.waitForURL(/\/r\/[A-Z0-9]{6}$/);
    rooms.push(k.url().split("/r/")[1]);
    await k.getByTestId("project-bar").waitFor();
  }
  ok(new Set(rooms).size === 2 && rooms.filter((r) => r === rooms[0]).length === 2, "each student lands in their own group's room");
  // One group turns in.
  const first = kids[0];
  await first.getByTestId("turn-in").click();
  await first.getByTestId("receipt-note").fill("I made the title slide.");
  await first.getByTestId("confirm-turn-in").click();
  await first.getByTestId("turned-in").waitFor();
  // Today shows it's ready to grade, with one button straight to it.
  await park.goto(`${BASE}/classes`);
  const todayRow = park.getByTestId("today-grade").filter({ hasText: "WWI presentation" });
  await todayRow.waitFor({ timeout: 20000 });
  ok(/1 group turned in/.test(await todayRow.innerText()), "Today lists turned-in work that's ready to grade");
  await todayRow.getByTestId("today-grade-btn").click();
  await park.getByTestId("grader").waitFor();
  ok(true, "Today's Grade button opens the grading screen");
  await park.goto(classUrl);
  await park.getByTestId("group-status").getByText("Turned in").waitFor();
  ok(/Tasks 0\/7/.test(await park.getByTestId("group-progress").first().innerText()), "the dashboard shows each group's progress and who turned in");
  // The teacher grades it.
  await park.getByTestId("grade-group").click();
  await park.getByTestId("grader").waitFor();
  ok((await park.getByRole("region", { name: "Contribution receipt" }).count()) === 1, "the grading screen shows the frozen receipt");
  const rows = park.getByTestId("rubric-row");
  ok((await rows.count()) === 3, "the rubric text becomes rows with points");
  for (let i = 0; i < 3; i++) await rows.nth(i).getByTestId("score-step").first().click();
  ok((await park.getByTestId("grade-total").innerText()).startsWith("100 / 100"), "clicking scores adds up the group total");
  await park.getByTestId("student-grade").first().fill("90");
  await park.getByTestId("grade-comment").fill("Great sources.");
  await park.getByTestId("save-grade").click();
  await park.getByRole("status").getByText("Saved").waitFor();
  await park.goto(classUrl);
  const href = await park.getByTestId("export-csv").getAttribute("href");
  const text = await park.evaluate(async (u) => (await fetch(u)).text(), href);
  const lines = text.trim().split(/\r\n/);
  ok(lines.length === 5 && lines.some((l) => /,90,100,Great sources\.$/.test(l)) && lines.some((l) => /,100,100,100,Great sources\.$/.test(l)), "the grades CSV has every student, with per-student grades");
  await park.getByTestId("group-status").getByText("Graded").waitFor();
  ok(true, "graded groups show as Graded");
  await park.goto(`${BASE}/classes`);
  await park.getByTestId("all-caught-up").waitFor({ timeout: 20000 });
  ok((await park.getByTestId("getting-started").count()) === 0, "once everything is graded, Today says you are all caught up and the getting-started steps go away");
  await park.goto(classUrl);
  // The teacher never sits in a group's chat: opening the room link goes to grading.
  await park.goto(`${BASE}/r/${rooms[0]}`);
  await park.waitForURL(/\/classes\/[a-z0-9]+\/a\/[a-z0-9]+\/[A-Z0-9]{6}$/, { timeout: 15000 });
  ok(true, "a teacher opening a group's room is sent to grading, not the chat");

  // ---------- Solo assignments: one link, a room for every student, made on first open ----------
  await park.goto(classUrl);
  await park.getByTestId("new-assignment-btn").click();
  await park.getByLabel("Assignment title").fill("Reading response");
  await park.getByTestId("wizard-next").click();
  await park.getByTestId("mode-solo").click();
  await park.getByTestId("ai-full").click();
  // The due date uses Cairn's own picker, not the browser's.
  await park.getByTestId("due-date").click();
  await park.getByRole("button", { name: "Tomorrow" }).click();
  await park.getByTestId("picker").getByRole("button", { name: "Done" }).click();
  ok(/Due/.test(await park.getByTestId("due-date").innerText()) || /·/.test(await park.getByTestId("due-date").innerText()), "the due date is picked with Cairn's date picker");
  await park.getByTestId("create-assignment").click();
  await park.getByTestId("wizard-done").click();
  const soloSection = park.getByTestId("assignment").filter({ hasText: "Reading response" });
  await soloSection.getByTestId("student-row").first().waitFor();
  ok(
    (await soloSection.getByTestId("student-row").count()) === 4 && (await soloSection.getByTestId("student-status").filter({ hasText: "Not started" }).count()) === 4,
    "a solo assignment lists every student as Not started, before any rooms exist",
  );
  const soloLink = await soloSection.getByTestId("copy-assignment-link").getAttribute("data-link");
  ok(/\/c\/[A-Z0-9]{6}\/a\/[a-z0-9]+$/.test(soloLink), "each assignment has its own link to post to Classroom");
  const soloRooms = [];
  for (const k of [kids[0], kids[1]]) {
    await k.goto(soloLink);
    await k.waitForURL(/\/r\/[A-Z0-9]{6}$/, { timeout: 20000 });
    await k.getByTestId("project-bar").waitFor();
    soloRooms.push(k.url().split("/r/")[1]);
  }
  ok(soloRooms[0] !== soloRooms[1] && !rooms.includes(soloRooms[0]), "each student who opens the link gets their own room");
  await kids[0].goto(soloLink);
  await kids[0].waitForURL(/\/r\/[A-Z0-9]{6}$/, { timeout: 20000 });
  ok(kids[0].url().endsWith(soloRooms[0]), "opening the link again goes back to the same room");
  // A student who wasn't in the class yet joins from the assignment link and still gets a room.
  await park.goto(classUrl);
  await park.getByTestId("access-code").click();
  await park.getByTestId("class-list").getByText(/Anyone who signs in/).waitFor();
  const eve = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, as: "Eve", email: emailOf("Eve") })).newPage();
  await eve.goto(soloLink);
  await eve.getByText("Reading response").first().waitFor();
  await eve.getByTestId("join-class").click();
  await eve.waitForURL(/\/r\/[A-Z0-9]{6}$/, { timeout: 20000 });
  ok(!soloRooms.includes(eve.url().split("/r/")[1]), "with the class open to anyone with the code, a late joiner gets their own room from the same link");
  await park.getByTestId("access-list").click();
  // Someone outside the class can't get into a student's room, even with its code.
  const outsider = await (await browser.newContext({ as: "Outsider" })).newPage();
  await outsider.goto(eve.url());
  await outsider.getByText(/This room belongs to a class/).waitFor({ timeout: 15000 });
  ok(true, "people outside the class can't open its rooms, even with the room code");
  await outsider.close();

  // Work timeline: a large paste shows openly on the student's receipt.
  const ben = kids[1];
  await ben.getByTestId("composer").fill("make a doc with our plan");
  await ben.getByTestId("composer").press("Enter");
  await ben.getByTestId("doc-editor").waitFor({ timeout: 15000 });
  await ben.evaluate(() =>
    document.querySelector('[data-testid="doc-editor"]').editor.chain().focus("end").insertContent(`<p>${"Reading responses help me think about the story. ".repeat(10)}</p>`).run(),
  );
  await ben.waitForTimeout(2500);
  await ben.getByTestId("turn-in").click();
  await ben.getByTestId("timeline-paste").first().waitFor({ timeout: 20000 });
  ok(true, "a large paste shows on the work timeline");
  ok(await ben.getByTestId("confirm-turn-in").isDisabled(), "the reflection question must be answered before turning in");
  await ben.getByTestId("reflection-question").getByText("What was hardest about this assignment?").waitFor();
  await ben.getByTestId("receipt-note").fill("Finding quotes that matched my point.");
  await ben.getByTestId("confirm-turn-in").click();
  await ben.getByTestId("turned-in").waitFor();
  // Ava turns in too, then the teacher grades with Start grading → Save & next.
  await kids[0].getByTestId("turn-in").click();
  await kids[0].getByTestId("receipt-note").fill("Staying focused.");
  await kids[0].getByTestId("confirm-turn-in").click();
  await kids[0].getByTestId("turned-in").waitFor();
  await park.goto(classUrl);
  await soloSection.getByTestId("start-grading").getByText("Start grading (2)").waitFor();
  await soloSection.getByTestId("start-grading").click();
  await park.getByTestId("grader").waitFor();
  const firstGraded = await park.getByTestId("grading-title").innerText();
  await park.getByTestId("save-next").click();
  await park.waitForFunction((t) => document.querySelector('[data-testid="grading-title"]')?.textContent !== t, firstGraded);
  await park.getByTestId("save-next").click();
  await park.getByTestId("all-graded").waitFor();
  ok(true, "Start grading → Save & next walks through every turned-in student, then says all are graded");
  await eve.close();

  // ---------- Worksheets: a starter every student gets a copy of, and an answer key only the teacher sees ----------
  await park.goto(classUrl);
  await park.getByTestId("new-assignment-btn").click();
  await park.getByLabel("Assignment title").fill("Cell worksheet");
  await park.getByTestId("worksheet-upload").click();
  await park.getByTestId("worksheet-file").setInputFiles({ name: "Cell worksheet.docx", mimeType: DOCX_TYPE, buffer: await makeDocx() });
  await park.getByTestId("worksheet-file-name").getByText("Cell worksheet.docx").waitFor();
  await park.getByTestId("worksheet-key").check();
  await park.getByTestId("wizard-next").click();
  await park.getByTestId("mode-solo").click();
  await park.getByTestId("create-assignment").click();
  await park.getByTestId("wizard-worksheet").getByText("Your file is in.").waitFor({ timeout: 30000 });
  ok(true, "a teacher can make a Word file the assignment's worksheet");
  await park.getByTestId("wizard-done").click();
  const wsSection = park.getByTestId("assignment").filter({ hasText: "Cell worksheet" });
  await wsSection.getByTestId("has-key").waitFor();
  ok((await wsSection.getByTestId("worksheet-files").innerText()).includes("Cell worksheet"), "the class page shows the worksheet and that it has an answer key");
  const wsLink = await wsSection.getByTestId("copy-assignment-link").getAttribute("data-link");
  // The worksheet opens in its own room, with Cairn's editors.
  await wsSection.getByTestId("edit-worksheet").click();
  await park.getByTestId("worksheet-banner").waitFor();
  const wsRoom = park.url().split("/r/")[1];
  await park.getByTestId("drive-file").filter({ hasText: "Cell worksheet" }).getByRole("button").first().click();
  await park.getByTestId("doc-editor").locator("h1", { hasText: "Cell Worksheet" }).waitFor({ timeout: 15000 });
  ok(
    (await park.getByTestId("doc-editor").locator("strong", { hasText: "Question 1:" }).count()) === 1 && (await park.getByTestId("doc-editor").locator("table").count()) === 1,
    "the Word file keeps its heading, bold text and table",
  );
  // The teacher writes the answer key.
  await park.getByTestId("drive-file").filter({ hasText: "Answer key" }).getByRole("button").first().click();
  await park.getByTestId("doc-editor").getByText(/Write the answers here/).waitFor({ timeout: 15000 });
  await park.evaluate(() => document.querySelector('[data-testid="doc-editor"]').editor.commands.setContent("<p>The nucleus holds the cell's DNA.</p>"));
  await park.waitForTimeout(2500);
  const wsAid = wsLink.split("/a/")[1];
  const wsClass = classUrl.split("/classes/")[1];
  const { keyId } = await park.evaluate(
    async ([cid, aid]) => (await fetch(`/api/classes/${cid}/assignments/${aid}/worksheet`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: true }) })).json(),
    [wsClass, wsAid],
  );
  // A student opens the assignment: their own copy of the worksheet, without the answer key.
  const cara = kids[2];
  await cara.goto(wsLink);
  await cara.waitForURL(/\/r\/[A-Z0-9]{6}$/, { timeout: 20000 });
  const caraRoom = cara.url().split("/r/")[1];
  await cara.getByTestId("drive-file").filter({ hasText: "Cell worksheet" }).waitFor();
  ok((await cara.getByTestId("drive-file").filter({ hasText: "Answer key" }).count()) === 0, "each student gets their own copy of the worksheet, without the answer key");
  await cara.getByTestId("drive-file").filter({ hasText: "Cell worksheet" }).getByRole("button").first().click();
  await cara.getByTestId("doc-editor").locator("h1", { hasText: "Cell Worksheet" }).waitFor({ timeout: 15000 });
  ok(true, "the student's copy has the worksheet's content");
  // The worksheet room and its answer key are the teacher's alone.
  await cara.goto(`${BASE}/r/${wsRoom}`);
  await cara.getByText(/teacher's worksheet/).waitFor({ timeout: 15000 });
  const keyStatus = await cara.evaluate(async (p) => (await fetch(p)).status, `/parties/doc/${wsRoom}--${keyId}`);
  ok(keyStatus === 403, "students can't open the worksheet room or its answer key, even with their codes");
  // Bringing a PowerPoint into your own room.
  await cara.goto(`${BASE}/r/${caraRoom}`);
  await cara.getByTestId("new-file").click();
  await cara.getByTestId("import-office-input").setInputFiles({ name: "Organelles.pptx", mimeType: PPTX_TYPE, buffer: await makePptx() });
  await cara.getByText("Organelles.pptx is in.").waitFor({ timeout: 30000 });
  await cara.waitForFunction(() => [...document.querySelectorAll("textarea")].some((t) => t.value.includes("Mitochondria make energy")), null, { timeout: 15000 });
  ok((await cara.getByTestId("drive-file").filter({ hasText: "Organelles" }).count()) === 1, "a PowerPoint file comes into the room as slides, text boxes and all");
  // She turns it in; the teacher sees the answer key next to her work.
  await cara.getByTestId("turn-in").click();
  await cara.getByTestId("receipt-note").fill("Labeling the parts.");
  await cara.getByTestId("confirm-turn-in").click();
  await cara.getByTestId("turned-in").waitFor();
  await park.goto(classUrl);
  await wsSection.getByTestId("start-grading").click();
  await park.getByTestId("answer-key-tab").click();
  await park.getByTestId("answer-key").getByText("The nucleus holds the cell's DNA.").waitFor({ timeout: 15000 });
  ok(true, "the answer key shows next to the student's work when grading");

  // ---------- Timed assignments: closed outside the set times, more time on request ----------
  const classId = classUrl.split("/classes/")[1];
  const timed = await park.evaluate(async (id) => {
    // Open only on a day three days from now, so it's closed right now; due tomorrow.
    const day = (new Date().getUTCDay() + 3) % 7;
    const r = await fetch(`/api/classes/${id}/assignments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Timed quiz",
        mode: "solo",
        project: { ai: "full", dueAt: Date.now() + 86_400_000, schedule: { windows: [{ days: [day], start: "09:00", end: "09:50" }], tz: "UTC" } },
      }),
    });
    return (await r.json()).id;
  }, classId);
  await park.goto(classUrl);
  const timedSection = park.getByTestId("assignment").filter({ hasText: "Timed quiz" });
  await timedSection.getByTestId("schedule-summary").waitFor();
  ok(/9:00am–9:50am/.test(await timedSection.getByTestId("schedule-summary").innerText()), "the class page shows when a timed assignment is open");
  const cam = kids[2];
  await cam.goto(`${classLink}/a/${timed}`);
  await cam.waitForURL(/\/r\/[A-Z0-9]{6}$/, { timeout: 20000 });
  await cam.getByTestId("access-chip").getByText(/Closed/).waitFor({ timeout: 15000 });
  ok(true, "outside the set times the assignment shows as closed");
  await cam.getByTestId("composer").fill("make a doc with our plan");
  await cam.getByTestId("composer").press("Enter");
  await cam.getByTestId("ai-message").first().waitFor({ timeout: 15000 });
  await cam.waitForTimeout(1500);
  ok((await cam.getByTestId("drive-file").count()) === 0, "while it's closed, nothing can make or change files (the AI included)");
  // Cam asks for more time; the teacher approves from the class page.
  await cam.getByTestId("ask-more-time").click();
  await cam.getByTestId("ask-open").click();
  await cam.getByTestId("time-reason").fill("I was at the dentist during class.");
  await cam.getByTestId("send-time-request").click();
  await cam.getByTestId("toast").getByText(/Sent to your teacher/).waitFor();
  await park.reload();
  const req = park.getByTestId("time-request").filter({ hasText: "Cam" });
  await req.getByText("I was at the dentist during class.").waitFor();
  await req.getByTestId("approve-time").click();
  await cam.getByTestId("access-chip").getByText(/Open until/).waitFor({ timeout: 15000 });
  await cam.getByTestId("room-notice").getByText(/Your teacher gave you more time/).waitFor();
  ok(true, "a student asks for more time and the teacher's approval opens it right away");
  // The teacher can also extend a due date without a request.
  await park.reload();
  const camRow = park.getByTestId("assignment").filter({ hasText: "Timed quiz" }).getByTestId("student-row").filter({ hasText: "Cam" });
  await camRow.getByTestId("more-time").click();
  await camRow.getByTestId("time-extend-1").click();
  await cam.getByTestId("due-label").getByText("(extended)").waitFor({ timeout: 15000 });
  ok(true, "the teacher can extend one student's due date from the dashboard");



  // Report: a student sends one message from the group chat to the teacher.
  const sameGroup = kids.findIndex((k, i) => i > 0 && rooms[i] === rooms[0]);
  // The solo checks moved these students into their own rooms; go back to the group rooms.
  for (const i of [0, sameGroup]) {
    await kids[i].goto(`${BASE}/r/${rooms[i]}`);
    await kids[i].getByTestId("composer").waitFor();
  }
  await kids[0].getByTestId("composer").fill("this is a mean message");
  await kids[0].getByTestId("composer").press("Enter");
  const partner = kids[sameGroup];
  const theirMsg = partner.getByTestId("user-message").filter({ hasText: "this is a mean message" });
  await theirMsg.waitFor();
  await theirMsg.hover();
  await theirMsg.getByTestId("report-message").click();
  await partner.getByTestId("dialog-input").fill("Not nice to me");
  await partner.getByTestId("dialog-confirm").click();
  await partner.getByTestId("toast").getByText(/Reported to your teacher/).waitFor();
  await park.goto(classUrl);
  const report = park.getByTestId("report").first();
  await report.getByText("this is a mean message").waitFor();
  ok(/Not nice to me/.test(await report.innerText()), "a student can report one message, and the teacher sees only that message and why");

  // Removing a student: off the roster and out of the group rooms.
  await park.getByLabel("Remove Dee").click();
  await park.getByTestId("dialog-confirm").click();
  await park.getByTestId("roster").getByText("Dee").waitFor({ state: "detached" });
  ok(true, "the teacher can remove a student from the class");
  const dee = kids[3];
  // They're sent out of the room right away…
  await dee.getByTestId("room-closed").waitFor({ timeout: 15000 });
  // …and reloading doesn't get them back in.
  await dee.reload();
  await dee.waitForTimeout(3000);
  ok((await dee.getByTestId("composer").count()) === 0, "a removed student is sent out of their group's room");
  ok(true, "a removed student can't get back into their group's room");

  // Joining a class needs the 13+ confirmation (the server checks it too).
  const noAge = await park.evaluate(async (link) => {
    const code = link.split("/c/")[1];
    const r = await fetch(`/api/classes/join/${code}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uid: "under-13-test", name: "Kid" }) });
    return r.status;
  }, classLink);
  ok(noAge === 400, "joining a class without confirming 13+ is refused");

  // Erasing a class deletes its rooms and records.
  await park.getByTestId("erase-class").click();
  ok(await park.getByTestId("dialog-confirm").isDisabled(), "erasing a class needs its name typed first");
  await park.getByTestId("dialog-input").fill("Period 3 History");
  await park.getByTestId("dialog-confirm").click();
  await park.waitForURL(/\/classes$/);
  const erased = await park.evaluate(async (code) => (await fetch(`/api/rooms/${code}`)).status, rooms[0]);
  ok(erased === 404 && (await park.getByTestId("class-row").filter({ hasText: "Period 3 History" }).count()) === 0, "erasing a class deletes its group rooms and the class");



  // ---------- Docs and slides basics ----------
  const ed1 = await (await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true, as: "Ivy" })).newPage();
  await ed1.goto(BASE);
  const edCode = await ed1.evaluate(async () => {
    localStorage.setItem("huddle.name", "Ivy");
    if (!localStorage.getItem("huddle.uid")) localStorage.setItem("huddle.uid", crypto.randomUUID());
    const r = await fetch("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uid: localStorage.getItem("huddle.uid"), title: "Editors check" }) });
    return (await r.json()).code;
  });
  await ed1.goto(`${BASE}/r/${edCode}`);
  const ed2 = await (await browser.newContext({ viewport: { width: 1400, height: 900 }, as: "Jo" })).newPage();
  await ed2.goto(`${BASE}/r/${edCode}`);
  await ed2.getByTestId("composer").waitFor();

  // Docs: table, checklist, image upload, and the school-paper Word export.
  await ed1.getByTestId("composer").fill("make a doc with our plan");
  await ed1.getByTestId("composer").press("Enter");
  const doc1 = ed1.getByTestId("doc-editor");
  await doc1.getByText("This doc was written by the").waitFor({ timeout: 15000 });
  await ed1.evaluate(() => document.querySelector('[data-testid="doc-editor"]').editor.commands.focus("end"));
  await ed1.getByTestId("doc-table").click();
  await doc1.locator("table").waitFor();
  ok((await doc1.locator("table th").count()) === 3, "a table with a header row can be added to a doc");
  await ed1.evaluate(() => document.querySelector('[data-testid="doc-editor"]').editor.chain().focus("end").insertContent("<p>Checklist item</p>").run());
  await ed1.getByTestId("doc-checklist").click();
  await doc1.locator('ul[data-type="taskList"]').waitFor();
  ok(true, "checklists work in docs");
  await ed1.getByTestId("doc-image-input").setInputFiles({ name: "chart.png", mimeType: "image/png", buffer: avatarPng });
  await doc1.locator('img[src^="/api/rooms/"]').waitFor({ timeout: 15000 });
  ok(true, "an image can be uploaded into a doc");
  await ed2.getByTestId("drive-file").filter({ hasText: "Mock plan" }).click();
  await ed2.getByTestId("doc-editor").locator("table").waitFor();
  await ed2.getByTestId("doc-editor").locator('img[src^="/api/rooms/"]').waitFor();
  ok(true, "tables and images sync to everyone in the doc");
  await ed1.getByTestId("doc-word").click();
  await ed1.getByTestId("dialog-input").fill("Ivy, Jo");
  const [wordFile] = await Promise.all([ed1.waitForEvent("download"), ed1.getByTestId("dialog-confirm").click()]);
  const wordHtml = await (await import("node:fs/promises")).readFile(await wordFile.path(), "utf8");
  ok(wordFile.suggestedFilename() === "Mock plan.doc" && /<p>Ivy<\/p><p>Jo<\/p>/.test(wordHtml) && /class="title">Mock plan</.test(wordHtml), "Word export uses school-paper format with names, date and title");

  // Slides: a free-layout slide with a text box and a shape you can drag; slide owners.
  await ed1.getByTestId("composer").fill("make slides about our plan");
  await ed1.getByTestId("composer").press("Enter");
  await ed1.getByTestId("slides-editor").waitFor({ timeout: 15000 });
  await ed1.getByLabel("Layout").selectOption("free");
  await ed1.getByTestId("free-canvas").waitFor();
  await ed1.getByTestId("add-text-box").click();
  await ed1.getByLabel("Text box", { exact: true }).fill("Hello free layout");
  await ed1.getByTestId("add-rect").click();
  const rect = ed1.getByTestId("slide-element").filter({ has: ed1.locator("div") }).last();
  const leftBefore = await rect.evaluate((el) => el.style.left);
  const rectBox = await rect.boundingBox();
  await ed1.mouse.move(rectBox.x + rectBox.width / 2, rectBox.y + rectBox.height / 2);
  await ed1.mouse.down();
  await ed1.mouse.move(rectBox.x + rectBox.width / 2 + 120, rectBox.y + rectBox.height / 2 + 40, { steps: 6 });
  await ed1.mouse.up();
  const leftAfter = await rect.evaluate((el) => el.style.left);
  ok(leftBefore !== leftAfter, "boxes on a free-layout slide can be dragged");
  // Drag it near the slide's center: a guide line shows while it snaps.
  const slideBox = await ed1.getByTestId("slide-canvas").boundingBox();
  const rb = await rect.boundingBox();
  await ed1.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await ed1.mouse.down();
  await ed1.mouse.move(slideBox.x + slideBox.width / 2 + 3, rb.y + rb.height / 2, { steps: 6 });
  const guidesShown = await ed1.getByTestId("snap-guide").count();
  await ed1.mouse.up();
  ok(guidesShown > 0, "a guide line shows when a box lines up with the slide's center");
  await ed1.getByTestId("slide-owner").selectOption({ label: "Ivy (you)" });
  await ed1.getByTestId("slide-owner-badge").getByText("Ivy").first().waitFor();
  ok(true, "a slide can be given an owner, shown on its thumbnail");
  await ed2.getByTestId("drive-file").filter({ hasText: "Mock deck" }).click();
  await ed2.getByTestId("slide-thumb").first().click();
  await ed2.getByTestId("free-canvas").getByLabel("Text box", { exact: true }).first().waitFor();
  ok((await ed2.getByTestId("free-canvas").getByLabel("Text box", { exact: true }).first().inputValue()) === "Hello free layout", "free-layout slides sync live to everyone");
  await ed1.close();
  await ed2.close();


  // ---------- Landing page: the two paths and the teacher pilot form ----------
  const visitor = await (await browser.newContext({ viewport: { width: 1300, height: 900 }, colorScheme: "dark", signedOut: true })).newPage();
  await visitor.goto(BASE);
  ok(!(await visitor.evaluate(() => document.documentElement.classList.contains("dark"))), "the site starts in light mode even when the device is set to dark");
  ok((await visitor.getByTestId("nav-admin").count()) === 0 && (await visitor.locator(".nav-links a").count()) === 3, "the landing nav is down to three links");
  await visitor.getByRole("heading", { level: 1 }).getByText(/Show your/).waitFor();
  // The week starts on Monday and steps a day at a time.
  await visitor.getByTestId("week-day").scrollIntoViewIfNeeded();
  ok((await visitor.getByTestId("week-day").innerText()) === "Monday", "the stone week starts on Monday");
  await visitor.getByTestId("week-scrub").fill("2");
  ok((await visitor.getByTestId("week-day").innerText()) === "Wednesday", "dragging the week snaps from day to day");
  ok((await visitor.getByText("Your AI, your rules.").count()) === 0, "the landing page leads with Cairn's promise, not AI providers");
  ok((await visitor.locator("#research a[href^=\"https://\"]").count()) >= 5, "every research figure on the landing page links to its source");
  await visitor.getByRole("radio", { name: "Dark" }).first().click();
  ok(await visitor.evaluate(() => document.documentElement.classList.contains("dark")), "the landing page has a dark mode switch");
  await visitor.getByRole("radio", { name: "Light" }).first().click();
  // The class from earlier was erased, so make a fresh one to join from the landing page.
  const heroClass = await park.evaluate(async () => (await (await fetch("/api/classes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Landing check" }) })).json()).code);
  await visitor.getByTestId("hero-code").fill(heroClass);
  await visitor.getByTestId("hero-code").press("Enter");
  await visitor.waitForURL(/\/c\/[A-Z0-9]{6}$/);
  await visitor.getByTestId("sign-in-gate").waitFor();
  ok(true, "a class code typed on the landing page goes to the class, which asks a signed-out visitor to sign in");
  await visitor.goto(BASE);
  await visitor.getByTestId("path-teacher").click();
  await visitor.getByTestId("pilot-form").waitFor();
  await visitor.getByTestId("pilot-submit").click();
  ok((await visitor.getByTestId("pilot-done").count()) === 0, "the pilot form needs a name, email and the problem question");
  const pilot = visitor.getByTestId("pilot-form");
  await pilot.getByLabel("Your name").fill("Ms. Rivera");
  await pilot.getByLabel("School email").fill("rivera@school.example");
  await pilot.getByLabel("Subject").fill("Biology");
  await pilot.getByText("Sometimes", { exact: true }).click();
  await visitor.getByTestId("pilot-problem").fill("Two students did nothing and I couldn't tell who wrote what.");
  await visitor.getByTestId("pilot-submit").click();
  await visitor.getByTestId("pilot-done").waitFor();
  ok(true, "a teacher can sign up for the pilot from the landing page");
  const saved = await visitor.evaluate(async () => (await fetch("/api/pilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x", email: "bad", problem: "short" }) })).status);
  ok(saved === 400, "the pilot API rejects a bad email");
  await visitor.close();

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
