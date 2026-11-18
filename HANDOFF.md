# Huddle — Handoff Plan for Claude Code

> Paste this whole document into a new Claude Code session that runs on your computer, opened in an empty folder or in the cloned `huddle` repo. First message to send with it: **"Read this handoff, clone the repo if it's not here, get it running at localhost:5173, then start on Phase A."**

Repo: https://github.com/lhaigwebdesigns-glitch/huddle (branch `main`, initial commit `8aee97e`)

---

## 1. Product vision (what we're building)
Huddle is a **free, open-source, multiplayer AI workspace**, like Claude.ai/ChatGPT but for groups:
- Someone creates a **room** and gets a **party code** (e.g. `K7Q-29F`). Friends join with just a name.
- Everyone chats with the **same AI in real time**: one streamed answer, seen by all, and the AI knows who said what.
- The AI can **search the web**, **read pages**, use a library of **skills**, and build a **Google-style suite** (Docs, Sheets, Slides, Forms, Whiteboard) that everyone **co-edits live**.
- Goals: get early users and collect feedback; add payments later.

### Hard constraints (do not break)
- **$0 AI spend.** Only free tiers of hosted open-weight models plus in-browser models. No paid credits and no closed models (no OpenAI/Anthropic/Google paid APIs).
- **Fully open source.** MIT license. Only MIT/Apache/BSD-licensed libraries: Excalidraw yes, tldraw no; Tiptap core yes, Tiptap paid cloud no.
- **Hosting:** Cloudflare free plan (Workers, Durable Objects with SQLite, D1, R2, Workers AI, Vectorize) and a `*.workers.dev` domain.
- **Multiplayer everywhere.** Every feature must sync live between room members.

---

## 2. What's built (current state — all working and tested)

### Stack
Vite 8 + React 18 + Tailwind 4 frontend. Cloudflare Worker (Hono) + Durable Objects via `partyserver` / `y-partyserver`. Yjs CRDTs, Tiptap 3 editor, WebLLM for local models. Built and served with `@cloudflare/vite-plugin`.

### Features done
| Feature | Where |
|---|---|
| Create/join rooms by 6-char party code (no 0/O/1/I/L), invite link `/j/CODE` | `src/shared/code.ts`, `src/server/index.ts` (`POST /api/rooms`, `GET /api/rooms/:code`), `src/client/routes/Home.tsx` |
| Guest identity (uid/name/color in localStorage), recent rooms | `src/client/lib/identity.ts` |
| Room Durable Object: presence, typing, host role, lock room, kick, max 12 people, chat log in SQLite | `src/server/room.ts` |
| Shared AI turns: streamed to all with 40ms delta batching, "always" or "@ai" mode, Stop, queueing of messages sent mid-answer, per-user hourly + per-room daily limits | `src/server/room.ts` (`queueAi`, `aiTurn`) |
| Free model router: Groq → Cerebras → Workers AI → OpenRouter `:free`, 429 cooldown, falls through only if nothing has streamed yet | `src/server/ai/models.ts`, `src/server/ai/providers.ts` |
| Agent loop with tool calling (max 6 steps), tool steps shown as chips, sources shown as link chips | `room.ts` + `src/server/ai/tools.ts` |
| Tools: `web_search` (Tavily → Jina → DuckDuckGo), `fetch_url` (Jina Reader → direct), `load_skill`, `create_doc`, `read_doc`, `edit_doc` | `src/server/ai/tools.ts` |
| 20 skills in the open Agent Skills `SKILL.md` format, bundled via `import.meta.glob`, toggleable per room | `skills/*/SKILL.md`, `src/server/ai/skills.ts` |
| Local mode: host's browser runs Qwen3/Llama/Phi with WebLLM, tokens relayed to the room (no tools) | `src/client/lib/local-llm.ts`, `useRoom.ts` (`local_request`), `room.ts` (`localTurn`) |
| Collaborative Docs: one Doc DO per doc (`ROOMCODE--fileId`), Tiptap + Yjs, live cursors, AI writes Markdown straight into the live Yjs doc, export to Word/Text | `src/server/doc.ts`, `src/server/markdown-yjs.ts`, `src/client/components/DocEditor.tsx` |
| Chat UI: Markdown, GFM tables, KaTeX math, code blocks with copy, dark mode, mobile layout | `src/client/components/Chat.tsx`, `Markdown.tsx`, `routes/RoomPage.tsx` |
| Room settings dialog: AI mode, engine (cloud/local), local model, lock, skills, kick | `src/client/components/SettingsDialog.tsx` |
| Feedback: 👍/👎 plus comment per AI reply, "Send feedback" dialog, D1 storage, `/admin` page (`ADMIN_TOKEN`) | `src/server/index.ts`, `FeedbackDialog.tsx`, `routes/Admin.tsx` |

### WebSocket protocol
All message types live in `src/shared/protocol.ts` (`ClientMsg` / `ServerMsg`). **Extend this file first** whenever you add a feature.

### Tests
- `npm test`: Vitest. Covers party codes, SKILL.md parsing, Markdown ⇄ Yjs, provider fallback and tool-call assembly. 11 passing.
- `npm run dev` then `npm run e2e`: Playwright (`tests/e2e.mjs`). Two browsers join by code, chat, AI streaming, AI-created doc, live co-editing, persistence, feedback, bad code. All passing.
- `npm run typecheck`: clean.

### Lessons learned (keep these)
- Create the Yjs doc and `YProvider` **inside `useEffect`**, not `useMemo`, or React StrictMode destroys them.
- **Don't mount the Tiptap editor until the first Yjs sync**, and keep it mounted after that (`ready` flag in `DocEditor.tsx`).
- Tiptap StarterKit: set `trailingNode: false` and `undoRedo: false` (Collaboration provides undo).
- Building Yjs text before it's attached to a doc: use `applyDelta`, not repeated `insert` (insert positions are ignored until it's attached → reversed text).
- Playwright: pause about 150ms after clicking into ProseMirror before pressing keys (the browser's `selectionchange` is async).
- `.npmrc` has `legacy-peer-deps=true` (a peer-dependency conflict between partyserver and workers-types).
- The Workers AI binding needs a Cloudflare login. Local dev only uses it with `HUDDLE_REMOTE=1` (see `vite.config.ts`).
- DuckDuckGo blocks cloud IPs, so **a free `TAVILY_API_KEY` or `JINA_API_KEY` is required** for reliable search.
- **Groq free tier = ~8k tokens/min and 1,000 requests/day per model.** One doc-writing turn uses most of a minute's budget. Mitigations in place: wait up to 20s on short 429s (`providers.ts`), a second Groq model (`GROQ_FALLBACK_MODEL`, default `openai/gpt-oss-20b`), `reasoning_effort: "low"` for gpt-oss, clipped old AI replies in history, and compacted doc Markdown in tool-call history (`ai/turn.ts`). For real multi-user load, add Cerebras/OpenRouter keys.
- gpt-oss **invents plausible URLs** (e.g. fake article ids). `ai/citations.ts` unlinks any Markdown link whose URL never appeared in tool results or user messages, and `fetch_url` no longer records failed pages as sources.
- gpt-oss mostly **ignores `system` messages placed after the conversation starts** (harmony format). Put per-turn instructions in the latest user message instead (`withFreshNote` in `ai/turn.ts`).
- Queued AI turns: only run another turn if a user message arrived after the previous turn read the history (`hasUnseenUserMessages` in `room.ts`), or the AI re-answers.
- Aborting the provider `fetch` ends the stream cleanly; Stop works for any member (checked with a real model).

### Running locally
```
npm install
cp .dev.vars.example .dev.vars     # MOCK_AI=true = fake AI, no keys needed
npm run dev                        # http://localhost:5173
```
For real AI: set `MOCK_AI=false` and add a free `GROQ_API_KEY` (console.groq.com). Optionally add `CEREBRAS_API_KEY`, `OPENROUTER_API_KEY`, `TAVILY_API_KEY` and `ADMIN_TOKEN`.

---

## 3. What to build next (in this order)
Each phase should end **working, tested (unit + e2e), committed and pushed**, and usable by testers.

### Phase A — Launch-ready beta (do first)
1. **Real-model smoke test**: add a Groq key, confirm streaming, tool calls (search/doc), and that the `gpt-oss` reasoning field is ignored properly. Tune the system prompt in `room.ts → systemPrompt()`.
2. **Deploy**: `wrangler login`, `wrangler d1 create huddle` (put the id in `wrangler.jsonc`), `wrangler secret put` for each key, then `npm run deploy`. Add a GitHub Action that deploys on push to `main` (needs a `CLOUDFLARE_API_TOKEN` repo secret).
3. **Accounts (optional sign-in)**: Better Auth (MIT) on D1 with GitHub/Google OAuth and email magic link. Guests can still join. Signing in is required to **create** rooms (protects quotas) and claims the guest's uid/history. Add a "My rooms" list.
4. **Abuse/quota protection**: per-IP rate limit on `POST /api/rooms` and `/api/feedback`; a global daily AI counter in D1 shown in `/admin`; a banner when the room falls back to Local mode.
5. **Polish**:
   - Edit-and-resend your own message, plus **Regenerate**.
   - Copy-room-link toast.
   - Message timestamps grouped.
   - Empty-state prompt suggestions (clickable).
   - Slash commands in the composer: `/doc`, `/search`, `/sheet`, `/slides`.
   - Accessible focus states.
   - Analytics (PostHog free tier or self-hosted Umami).

### Phase B — Drive + file model refactor
- Generalize `RoomFile.kind` to `"doc" | "sheet" | "slides" | "form" | "whiteboard"` (`protocol.ts`, `room.ts` files table).
- Rename the Doc DO pattern to a generic **File DO** (one Yjs doc per file; the type decides the editor). Keep `Doc` for compatibility or migrate with a new DO migration tag.
- Add a Drive panel: search, rename, delete and duplicate, plus "My files" across rooms (D1 index) for signed-in users.
- Version history: snapshot `Y.encodeStateAsUpdate` to DO storage every N minutes, with a restore UI.
- Comments on Docs (Tiptap comment marks stored in a Y.Map).

### Phase C — Sheets
- Editor: **Univer** (Apache-2.0). Store the workbook in Yjs (a Y.Map of sheets → Y.Map of cells `{v, f, style}`). Write a small binding between Univer's command events and Yjs. **Fallback** if Univer + Yjs is too heavy: build a custom virtualized grid with `fast-formula-parser` or `formula.js` (both MIT). Avoid HyperFormula: it's GPLv3 or a paid commercial license, which conflicts with the MIT rule.
- AI tools: `create_sheet(title, csv | cells)`, `read_sheet(file_id, range)`, `edit_sheet(file_id, ops[])` where ops = set cell/formula/format, insert rows, add chart.
- Charts: Chart.js (MIT) from a range.
- Export: `.xlsx` with SheetJS CE (Apache-2.0) and CSV. Import CSV/XLSX.
- New skill: extend `skills/spreadsheet-modeling/SKILL.md` with the tool usage.

### Phase D — Slides
- Deck schema in Yjs: `slides: Y.Array<Y.Map>`. Each slide has a layout (title, bullets, two-column, image+text, quote, section), elements (text/image/shape with x/y/w/h), notes and a theme.
- Editor: custom React canvas with drag/resize (`react-moveable`, MIT), thumbnails rail, theme picker, live cursors via awareness.
- **Present mode**: full screen, and other members can "follow the presenter" (presenter's slide index in awareness).
- AI tools: `create_slides(title, outline[])`, `edit_slides(file_id, ops[])`. Use the `slide-deck-design` skill (update it: stop saying "Until the Slides editor ships").
- Images: Workers AI **FLUX.1-schnell** (`generate_image` tool) stored in R2.
- Export: `.pptx` via `pptxgenjs` (MIT), and PDF via print CSS.

### Phase E — Forms + Whiteboard
- **Forms**: builder in Yjs (questions: short, long, multiple choice, checkbox, scale, date), public share link `/f/:id`, responses written to a linked Sheet. AI tool `create_form`.
- **Whiteboard**: **Excalidraw** (MIT) synced via Yjs (y-excalidraw pattern or a custom elements Y.Map). AI tool `draw_whiteboard(mermaid | elements)`; convert Mermaid with `@excalidraw/mermaid-to-excalidraw` (MIT).

### Phase F — "Top AI site" power features
1. **Artifacts/Canvas pane**: AI writes HTML/React/SVG and it renders in a sandboxed iframe beside the chat, synced for the room, with versions. Tool: `make_artifact`.
2. **Code interpreter**: Pyodide in the browser (runs on the requester's device), with output and charts posted back to the room.
3. **Uploads + vision**: images, PDFs and CSVs go to R2. Vision through a free provider model (e.g. Llama vision on Groq/Workers AI); PDF text via `pdfjs-dist`.
4. **Knowledge/RAG per room**: chunk uploads, embed with Workers AI `bge` embeddings into **Vectorize** (free tier); tool `search_knowledge`.
5. **Memory**: opt-in facts per user and per room (`remember` tool), viewable and deletable in settings.
6. **Deep Research mode**: a toggle that runs the `deep-research` skill with a higher step budget (e.g. 15) and writes a cited Doc.
7. **Voice**: push-to-talk → Workers AI Whisper; replies read aloud with browser `speechSynthesis`.
8. **Custom assistants**: saved persona + instructions + skills + files, shareable by code.
9. **Share links**: read-only public snapshot of a chat or file.
10. **Reactions + polls** in chat; Mermaid diagram rendering in chat.

### Phase G — Payments (only after testers ask for more)
- Stripe Checkout + webhook to the Worker. Plans: Free (current limits) and Pro (higher limits, bigger rooms, more searches, priority models). Usage is already counted per room per day (`ai-count:` keys); move it to D1 per user.
- Keep the code MIT and self-hostable. The hosted version sells limits, not features.

---

## 4. Rules for the next Claude Code session
- **Read before changing**: `src/shared/protocol.ts`, `src/server/room.ts`, `src/server/ai/*`, `src/client/lib/useRoom.ts`.
- New AI ability = tool definition in `TOOL_DEFS` + a `dispatch` case in `tools.ts` + a mock path in `providers.ts` (`mockChat`) so the e2e test can exercise it without keys + an e2e assertion.
- New file type = `protocol.ts` kind → File DO → editor component → AI tools → export → e2e test (two browsers co-editing).
- Keep every new dependency MIT/Apache/BSD and check its license before adding it.
- Never add paid AI. Any new provider must be free-tier and go through `getProviders()` in `models.ts`.
- Secrets only via `.dev.vars` (gitignored) and `wrangler secret put`; never commit keys.
- After each phase: `npm test`, `npm run typecheck`, `npm run e2e`, then commit and push to a branch and open a PR.

## 5. Definition of done for the beta (Phase A)
- Live at `https://huddle.<account>.workers.dev` with a real free model and Tavily search.
- 3 people can join one room by code from different devices, chat with the AI, and co-write a doc.
- Feedback shows up in `/admin`.
- No AI cost on the Cloudflare/Groq dashboards.

## Verification (for this handoff document itself)
After approval: save this document into the repo as `HANDOFF.md`, link it from `README.md`, then commit and push to `main` so the next session can read it from GitHub.
