# Huddle: Handoff for Claude Code

> Open a Claude Code session in the cloned `huddle` repo and say: **"Read HANDOFF.md, get Huddle running at localhost:5173, then continue with the next steps in section 3."**

Repo: https://github.com/lhaigwebdesigns-glitch/huddle

---

## 1. Product vision
Huddle is a **free, open-source, multiplayer AI workspace**, like Claude.ai/ChatGPT but for groups:
- Someone creates a **room** and gets a **party code** (e.g. `K7Q-29F`). Friends join with just a name.
- Everyone chats with the **same AI in real time**: one streamed answer, seen by all, and the AI knows who said what.
- The AI **searches the web**, uses **skills**, and builds a **Google-style suite** that everyone **co-edits live**: Docs, Sheets, Slides, Whiteboards, Forms and Artifacts (mini web apps).
- Goal now: get early testers and feedback. Payments come later.

### Hard constraints (do not break)
- **$0 AI spend.** Only free tiers of hosted open-weight models, a self-hosted model on your own GPU, and in-browser models. No paid or closed models.
- **Fully open source, MIT.** Only MIT/Apache/BSD dependencies; check the license before adding one (the last full scan was clean).
- **Hosting:** Cloudflare free plan (Workers, Durable Objects with SQLite, D1, R2, Workers AI) and a `*.workers.dev` domain.
- **Multiplayer everywhere.** Every feature syncs live between room members.

---

## 2. What's built (all working and tested)

### Stack
Vite 8 + React 18 + Tailwind 4. A Cloudflare Worker (Hono) with Durable Objects via `partyserver` / `y-partyserver`. Yjs for every file. Tiptap 3 (docs), a custom grid and formula engine (sheets), a custom slide canvas, Excalidraw (whiteboards), Chart.js, Mermaid, WebLLM (Local mode). Built with `@cloudflare/vite-plugin`.

### Rooms and chat
| Feature | Where |
|---|---|
| Party codes, invite links `/j/CODE`, guest identity, recent rooms | `shared/code.ts`, `client/lib/identity.ts`, `routes/Home.tsx` |
| Room DO: presence, typing, host, lock, kick, 12 people max, chat log in SQLite | `server/room.ts` |
| Shared AI turns, streamed to everyone; Stop (any member); messages sent mid-answer get their own turn, and only if they're really new (`hasUnseenUserMessages`) | `room.ts` (`queueAi`, `aiTurn`) |
| **Edit & resend** your last message (the AI's answer is replaced), **Regenerate** | `room.ts` (`edit`, `regenerate`), `components/Chat.tsx` |
| Grouped messages and day separators, clickable starter **suggestions**, **slash commands** (`/doc /search /sheet /slides /whiteboard /form /poll`) | `Chat.tsx`, `client/lib/slash.ts` |
| **Reactions** and **polls** | `room.ts` (`react`, `poll`, `vote`), `Chat.tsx` |
| **Mermaid** code blocks render as diagrams | `components/Markdown.tsx` |
| Markdown, tables, KaTeX, code copy, dark mode, mobile layout, focus rings, ARIA live regions, reduced motion | `Chat.tsx`, `Markdown.tsx`, `styles.css` |

### AI
| Feature | Where |
|---|---|
| Provider router: **your own GPU (Ollama)** → Groq (gpt-oss-120b, then gpt-oss-20b) → Cerebras → Workers AI → OpenRouter `:free`. Waits out short 429s (≤20s), 60s response timeout for self-hosted, stops at `[DONE]` | `server/ai/models.ts`, `server/ai/providers.ts` |
| Agent loop: 6 steps (15 in **Deep Research** mode); empty replies are retried once | `room.ts` |
| Tools: `web_search`, `fetch_url`, `load_skill`, docs, sheets, slides, whiteboard, forms, artifacts, `remember` | `server/ai/tools.ts` |
| Invented-citation guard (unlinks URLs that never appeared in tool results); failed pages are never listed as sources | `server/ai/citations.ts` |
| Token diet for free tiers: clipped old replies, compacted tool-call payloads, volatile prompt parts last (lets Ollama reuse its cache) | `server/ai/turn.ts`, `room.ts` (`systemPrompt`) |
| **Room memory** (opt-in): the AI saves facts it sees every turn; anyone can view and delete them in Settings | `room.ts` (`remember`, `forget`), `SettingsDialog.tsx` |
| 20 skills (`skills/*/SKILL.md`), toggleable per room; the spreadsheet and slide skills teach the real tools | `server/ai/skills.ts` |
| Local mode (WebLLM in the host's browser, no tools) | `client/lib/local-llm.ts` |

### Files (one Yjs doc per file, in one Durable Object type)
The `Doc` DO (`server/doc.ts`) is the generic **file server** for every kind: chunked storage (no 128 KB value cap), **version history** (snapshot every 10 min, before AI rewrites, or on demand; last 30 kept; restore can be undone), duplicate and delete. Each kind's Yjs schema is in `shared/files.ts`. Editors are lazy-loaded (`client/editors.ts`) inside `FilePanel.tsx` (rename, 🕘 history). The **Drive** sidebar (`Drive.tsx`) has `+ New`, search, rename, duplicate and delete.

| Kind | Editor | Model + AI tools | Export |
|---|---|---|---|
| **Doc** | Tiptap + live cursors (`DocEditor.tsx`) | `markdown-yjs.ts`; `create_doc`, `read_doc`, `edit_doc` | Word, Text |
| **Sheet** | Virtualized grid, formula bar, keyboard navigation, copy/paste, formats, fills, column resize, others' selections, charts (`SheetEditor.tsx`, `SheetChart.tsx`) | `shared/formula.ts` (35 functions, Excel-style errors), `shared/sheet-model.ts`; `create_sheet`, `read_sheet`, `edit_sheet` (tool results show the sheet back to the model) | CSV, **.xlsx** (write-excel-file); CSV import |
| **Slides** | Thumbnails with who-is-where dots, inline editing on a 960×540 canvas, 6 layouts, 5 themes, notes, **Present** plus **Follow along** (`SlidesEditor.tsx`, `SlideView.tsx`) | `shared/slides-model.ts` (Y.Text fields merge concurrent typing); `create_slides`, `read_slides`, `edit_slides` | **.pptx** (pptxgenjs), printable HTML→PDF |
| **Whiteboard** | Excalidraw synced via Yjs plus pointers (`WhiteboardEditor.tsx`) | `shared/whiteboard-model.ts`; `draw_whiteboard` (Mermaid, converted in the browser with deterministic ids, so no duplicates), `read_whiteboard` | PNG |
| **Form** | Builder (6 question types), live responses with charts (`FormEditor.tsx`); public page `/f/:code/:id` (`routes/PublicForm.tsx`) | `shared/forms-model.ts` (validation); `create_form`, `read_form_responses` | CSV, **Send to a sheet** |
| **Artifact** | Sandboxed iframe (scripts on, no same-origin), versions, code view (`ArtifactViewer.tsx`) | `shared/artifact-model.ts`; `make_artifact`, `read_artifact` | HTML |

### Launch protection and admin
- Per-IP rate limits in D1: 20 rooms/hour (`ROOMS_PER_IP_HOUR`), 30 feedback posts/hour, 20 form submits/hour per form. Local dev (loopback) isn't limited.
- Site-wide daily AI counter in D1 (`GLOBAL_DAILY_AI_LIMIT`, default 5000), plus the per-room limit. When AI is unavailable, everyone sees a room banner, and the host gets a one-click **Switch to Local mode**.
- `/admin` (`ADMIN_TOKEN`): AI turns per day by provider, plus all feedback.

### WebSocket protocol
Every message type is in `src/shared/protocol.ts` (`ClientMsg` / `ServerMsg`). **Extend it first** when adding a feature.

### Tests
- `npm test`: 53 unit tests (formula engine, sheet/slides/forms/whiteboard models, version restore and chunking, providers incl. retry/timeout/`[DONE]`, citations, slash commands, …).
- `npm run typecheck`: clean. `npm run build`: OK (main bundle 685 KB, 209 KB gzipped; editors load on demand).
- `npm run e2e` with `npm run dev` and `MOCK_AI=true`: **43 checks**, all passing twice in a row. Two browsers (plus a third and a stranger) cover: join, chat, AI streaming, docs co-editing, history, edit and regenerate, slash commands, Drive duplicate/restore/delete, sheets (formulas, chart, live sync), slides (live text, follow presenter), whiteboard (no duplicate AI drawing, live shapes), forms (public submit → live responses → sheet), artifacts (sandbox), Mermaid, reactions, polls, memory, and rate limiting. Each file tool has a mock trigger in `providers.ts` (`MOCK_TOOL_CALLS`).
- Real-model runs: Groq gpt-oss-120b and the self-hosted Qwen3-14B on an RX 9070 GRE (chat ~2s; files 7–15s; a whole artifact app ~50s).

### Lessons learned (keep these)
- Create the Yjs doc and provider **inside `useEffect`** (`useYDoc`), and don't mount editors until the first sync.
- Tiptap StarterKit: `trailingNode: false`, `undoRedo: false`. Build detached Yjs text with `applyDelta`.
- `.npmrc` has `legacy-peer-deps=true`. Install scripts for esbuild/workerd are blocked by npm's allowlist, and that's fine.
- The Workers AI binding needs a Cloudflare login (`HUDDLE_REMOTE=1`); without one it fails, and the router cools it down for 24h.
- **Search needs a free `TAVILY_API_KEY`** (DuckDuckGo blocks cloud IPs).
- **Groq free tier: ~8k tokens/min and 1,000 requests/day per model**, hence the second Groq model, the waits and the token diet. For real load, add Cerebras/OpenRouter keys, or run Ollama.
- Models **invent URLs** (the citation guard handles it). gpt-oss/Qwen **ignore late `system` messages**: put per-turn nudges in user-role notes (`withFreshNote`).
- Models claim work they didn't do (e.g. "added a total row"). Tool results now **echo what the file actually contains**.
- Qwen3 sends slide bullets as **arrays**; models accept both. Qwen3 "thinking" makes replies ~10× slower; off by default (`OLLAMA_REASONING`).
- Ollama's default 4k context is too small. `ollama/Modelfile` sets 12k, which fits 100% on a 12 GB GPU (16k spilled to the CPU). Use `127.0.0.1`, not `localhost`, in `OLLAMA_BASE_URL`.
- Put volatile prompt parts **last** so self-hosted models reuse their cached prefix.
- Controlled checkboxes that wait for the server break Playwright's `check()`: click, then wait for the round trip.
- Excalidraw: sync with its `reconcileElements` and version numbers; `remapIds` makes AI conversions deterministic.
- `DEBUG_AI=1` logs every AI step, tool call and timing.

### Running locally
```
npm install
cp .dev.vars.example .dev.vars     # MOCK_AI=true = fake AI, no keys needed
npm run dev                        # http://localhost:5173
```
For real AI, set `MOCK_AI=false` and add any of:
- **Your GPU:** install Ollama, run `ollama pull qwen3:14b` and `ollama create huddle -f ollama/Modelfile`, then set `OLLAMA_BASE_URL=http://127.0.0.1:11434` and `OLLAMA_MODEL=huddle`.
- **Free cloud keys:** `GROQ_API_KEY` (console.groq.com), `TAVILY_API_KEY` (search), optionally `CEREBRAS_API_KEY` and `OPENROUTER_API_KEY`, plus `ADMIN_TOKEN`.

---

## 3. What's next

### Needs the owner (accounts and logins)
1. **Deploy** (Phase A2): `npx wrangler login`, then `npx wrangler d1 create huddle` (put the id in `wrangler.jsonc`), then `wrangler secret put` for each key, then `npm run deploy`. Add a GitHub Action that deploys on push to `main` (needs a `CLOUDFLARE_API_TOKEN` repo secret).
2. **Self-hosted model online:** expose Ollama with a Cloudflare Tunnel (`cloudflared`), set `OLLAMA_BASE_URL` to the tunnel URL and `OLLAMA_API_KEY` to a shared secret. Ollama itself doesn't check keys, so put the tunnel behind Cloudflare Access or a small auth proxy before going public.
3. **Accounts** (Phase A3): Better Auth (MIT) on D1 with GitHub/Google OAuth (needs OAuth apps) and email magic links. Guests can still join; signing in is required to create rooms. Add a "My files" list across rooms.

### Code-only follow-ups
- Comments on Docs (Tiptap marks + a Y.Map); real tables in Docs (Tiptap table extension, MIT); rows/columns insert and shift in Sheets (formula reference rewriting); freeze panes.
- Code interpreter (Pyodide in the browser, outputs posted to the room).
- Custom assistants (persona + skills + files, shareable by code); read-only share links for chats and files.
- Per-user memory (once accounts exist).
- Analytics (Umami self-hosted or PostHog free), deliberately skipped so far.

### Needs a deployed account (Workers AI / R2 / Vectorize)
- Uploads + vision, PDF text; knowledge/RAG per room (`bge` embeddings + Vectorize); voice (Whisper); AI images (FLUX) on slides.

### Phase G: Payments (only after testers ask)
Stripe Checkout + webhook. Free vs Pro limits (usage is already counted per room and per day; move it to per user). The code stays MIT and self-hostable; the hosted version sells limits, not features.

---

## 4. Rules for the next Claude Code session
- **Read before changing:** `shared/protocol.ts`, `server/room.ts`, `server/ai/*`, `server/doc.ts`, `shared/files.ts`, `client/lib/useRoom.ts`.
- A new AI ability needs: a definition in `TOOL_DEFS` + a `dispatch` case (`tools.ts`) + a `MOCK_TOOL_CALLS` entry + an e2e assertion + a line in `FILE_GUIDE` (`room.ts`) if it creates files.
- A new file kind needs: `shared/files.ts` (kind + schema) → a `shared/<kind>-model.ts` with tests → `Doc` RPC methods → an editor registered in `client/editors.ts` → AI tools → export → an e2e test with two browsers.
- Keep tool descriptions short: every tool definition is sent on every AI request.
- MIT/Apache/BSD dependencies only. Never add paid AI; new providers go through `getProviders()`.
- Secrets only in `.dev.vars` (gitignored) and `wrangler secret put`.
- After each phase: `npm test`, `npm run typecheck`, `npm run build`, `npm run e2e` (mock), then commit, push and open a PR.
