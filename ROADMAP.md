# Huddle roadmap

Working name: **Huddle** (rename anytime). The repo starts empty at `/home/user/huddle`.

## Context
You want an AI website like Claude.ai or ChatGPT that is **multiplayer from the start**. Someone creates a room and gets a party code like `K7Q-29F`. Friends join with it, and everyone sees each other's messages and the AI's replies stream in live.

The AI can build a whole **Google-style suite** that everyone co-edits in real time: Docs, Sheets, Slides, Forms, Whiteboards and a Drive-style file list. It uses **open-source models**, has a skills library, and can search and read the web.

Hard constraints:
- **$0 AI spend.** Free tiers only, and no paid credits.
- **Fully open source.** Open-weight models only, MIT/Apache libraries only, and the app itself published as open source (MIT).
- Collect feedback from early users first. Payments come later.

Decisions already made:
- AI is **hybrid**: free hosted open-weight models, plus an in-browser Local mode.
- Hosting is **Cloudflare**: Workers, Durable Objects, D1 and R2, all on the free plan.
- **Guests join with a nickname.** Signing in is optional and required to create rooms.

## Staying at $0, honestly
Free AI tiers have **daily caps**, so the app is built to stretch them and to fall back gracefully instead of costing money.

| Need | Free source (all open-weight / OSS) | Limit to design around |
|---|---|---|
| Main chat models | **Cloudflare Workers AI** (Llama, Qwen, DeepSeek-R1-distill, gpt-oss, Mistral) | ~10k "neurons"/day free |
| Faster or bigger models | **Groq** free tier, **Cerebras** free tier, **OpenRouter `:free` models** | Per-minute and per-day request caps |
| Unlimited fallback | **Local mode: WebLLM** in the browser (Qwen3-4B, Llama-3.2-3B, Phi) | Needs a WebGPU device |
| Images | Workers AI **FLUX.1-schnell** / Stable Diffusion | Shares the neuron budget |
| Voice | Workers AI **Whisper** (speech→text), browser SpeechSynthesis (text→speech) | Free |
| Web search | **Tavily** free (1,000/mo) → **Jina** search/reader (free, keyless rate limit) → DuckDuckGo HTML fallback | Monthly caps |
| Code execution | **Pyodide** (Python) + sandboxed iframe (JS), run in the user's browser | Free, no server |
| Hosting/DB/storage | Cloudflare free plan + `*.workers.dev` subdomain (no paid domain) | 100k requests/day |

How the app protects the budget:
- A **provider router** tries free providers in order and skips any that return a rate limit (429).
- Per-user and per-room daily message caps.
- Short replies by default, prompt caching, and cheap models for small tasks like titles and summaries.
- An admin **quota meter**. When every free quota is used up, rooms switch to Local mode with a clear banner.

No credit card is needed anywhere. (The one exception is that OpenRouter raises free limits after a $10 top-up, which we skip.)

## Architecture
```
Browser (React + Vite, Tailwind, shadcn/ui)
 ├─ Chat · Docs (Tiptap+Yjs) · Sheets (Univer+Yjs) · Slides · Forms · Whiteboard (Excalidraw+Yjs)
 ├─ Artifacts/Canvas pane (live HTML/React preview, Pyodide runner)
 └─ Local mode: WebLLM ──────────────────────────┐
            │ WebSocket                           │ (host's tokens relayed to room)
            ▼                                     ▼
Room Durable Object (one per party code, via PartyServer/y-partyserver)
 • presence, typing, cursors, roles      • chat log + AI turn queue
 • Yjs state for every file in the room  • runs the AI agent loop, streams to everyone
Cloudflare Worker (Hono API): auth (Better Auth), rooms, files, feedback, admin, AI router + tools
Storage: D1 (users, rooms, messages, files index, feedback, usage), R2 (uploads/exports), DO storage (live Yjs)
```
- **One Durable Object per room** gives a single authority for that room, so everyone sees the same messages and edits in the same order.
- **Yjs CRDTs** handle conflict-free co-editing. The AI edits the same Yjs document as the humans, so its changes appear live with an "AI is editing" cursor.
- **The AI runs server-side inside the room.** One reply is generated once and streamed to everyone. API keys never reach the browser.

## The Google-style suite (all multiplayer, all AI-buildable)
Each file type gets: a live co-editor with named cursors, AI **create** and **edit** tools, comments, version history (Yjs snapshots), and exports.

| App | Editor (OSS) | AI can… | Export |
|---|---|---|---|
| **Docs** | Tiptap (MIT) + Yjs | write and rewrite sections, summarize, fix tone | .docx (`docx`), PDF, Markdown |
| **Sheets** | **Univer** (Apache-2.0) bound to Yjs | build tables, write formulas, clean data, make charts, answer "what's the total by month" | .xlsx (SheetJS CE), CSV |
| **Slides** | Custom canvas editor (JSON slide schema in Yjs) + present mode | generate decks with themes and layouts, add images (FLUX), write speaker notes | .pptx (`pptxgenjs`), PDF |
| **Forms** | Custom builder in Yjs | create surveys and quizzes; responses go into a linked Sheet | share link |
| **Whiteboard** | **Excalidraw** (MIT) + Yjs | draw flowcharts, mind maps and diagrams from a prompt | PNG/SVG |
| **Drive** | File list per room + personal "My files" | find, rename and organize files; "make a sheet from this PDF" | — |

We avoid tldraw (its license needs a commercial key or watermark) and Tiptap's paid cloud. Calendar and Gmail-style apps are out of scope for now.

## Features from top AI sites to include
Must-have, built into the phases below:
1. **Artifacts / Canvas.** The AI writes HTML/React/SVG and it renders live in a side pane. Everyone sees it, and anyone can ask for changes. This is great for web design.
2. **Edit, regenerate and branch.** Edit any message or regenerate a reply, with ← 1/3 → branch arrows.
3. **File and image upload.** Chat with PDFs, images (vision models on Workers AI or Groq) and CSVs.
4. **Projects / Knowledge.** Each room has uploaded files that are embedded (Workers AI embeddings + **Vectorize** free tier) so the AI answers from them (RAG).
5. **Web search with citations** and a **Deep Research mode**: multi-step search → read → synthesize into a cited report saved as a Doc.
6. **Code interpreter.** Python runs in the browser with Pyodide for data analysis and charts.
7. **Image generation** with FLUX.1-schnell.
8. **Voice mode.** Push-to-talk with Whisper and spoken replies.
9. **Memory.** Opt-in facts per user and per room ("remember we're using APA style"), which can be viewed and deleted.
10. **Custom assistants (like GPTs/Gems).** Saved persona, instructions, skills and files, shareable by code.
11. **Share links.** Read-only public snapshot of a chat or file.
12. **Quality of life:** Markdown, code blocks with copy, LaTeX math (KaTeX), Mermaid diagrams, dark mode, keyboard shortcuts, slash commands (`/doc`, `/sheet`, `/slides`, `/search`, `/image`), mobile layout.

Multiplayer extras specific to Huddle: `@ai` mentions, AI turn queue, emoji reactions, group polls, "follow the presenter", and per-member roles (host, editor, viewer).

Later: scheduled tasks, browser automation, MCP connectors.

## The AI layer
- `src/server/ai/models.ts` is a config list of free models by role (chat, fast, reasoning, vision, image, embeddings), so models can be swapped as better open-weight ones come out.
- `src/server/ai/router.ts` holds the provider fallback chain (Workers AI → Groq → Cerebras → OpenRouter free → tell clients to use Local mode).
- `src/server/ai/agent.ts` runs the OpenAI-compatible tool-calling loop (max N steps). Tool steps show live in chat ("Searching…", "Editing Sheet1!B2:B20…").
- **Tools:** `web_search`, `fetch_url`, `deep_research`, `load_skill`, `create_file`, `edit_doc`, `edit_sheet`, `edit_slides`, `edit_form`, `draw_whiteboard`, `make_artifact`, `generate_image`, `search_knowledge`, `remember`.
- **Skills** use the open Agent Skills format, `skills/<name>/SKILL.md` (frontmatter `name` + `description`, then instructions). Only names and descriptions are in the prompt; the model calls `load_skill` on demand.
  - Starter pack, written by us and adapted from permissively licensed collections such as anthropics/skills (Apache-2.0 parts):
    - **Writing:** clear-writing, editing, essays, storytelling, email.
    - **Thinking:** problem-solving, step-by-step math, debugging/code review, decision-matrix.
    - **Research:** web-research, deep-research, citations.
    - **Design:** web-design, frontend-code, UX copy, accessibility.
    - **Office:** doc-structure, spreadsheet-modeling and formulas, slide-deck-design, form/survey design, diagramming.
    - **Group:** brainstorming/facilitation.
  - Hosts can toggle skills per room.

## Rooms, users, feedback, payments
- 6-character codes from an unambiguous alphabet, with links like `/j/K7Q29F`. The host can rotate the code, lock the room, kick members and set roles. Rooms hold up to about 10 people.
- Guests use a signed cookie. Signing in (Better Auth: Google or GitHub OAuth plus email magic link through a free tier) claims guest history.
- **Feedback:** 👍/👎 plus a comment on every reply, a feedback widget, and `/admin` showing feedback, active rooms, quota usage and errors. Product analytics use self-hosted-friendly, open-source **PostHog** (free cloud tier) or Umami.
- **Payments (later):** Stripe. Usage is metered in D1 from day one so pricing is based on real numbers. The open-source code stays free to self-host, and the hosted version sells higher limits.

## Project layout
```
huddle/  (MIT license, public GitHub repo)
  wrangler.toml                  # Worker, Room DO, D1, R2, Vectorize, Workers AI bindings
  src/server/  index.ts room.ts auth.ts db/schema.ts
               ai/{models,router,agent,skills,memory}.ts  ai/tools/*.ts
  src/client/  routes/{home,join,room,admin,share}
               components/{chat,doc,sheet,slides,form,whiteboard,artifact,drive}/
               lib/{local-llm.ts,pyodide.ts,yjs.ts}
  skills/<name>/SKILL.md
  migrations/
```

## Build phases (each ends with something testers can use)
1. **Foundation.** Vite/React + Hono Worker, D1/Drizzle, guest + optional auth, create/join by code, Room DO with presence and realtime group chat.
2. **AI in the room.** Free provider router, streaming to everyone, `@ai`/always-reply, stop, queue, model picker, quotas, edit/regenerate/branch, Markdown/KaTeX/Mermaid.
3. **Skills + web.** SKILL.md loader and starter pack, search, fetch, citations, Deep Research.
4. **Docs + Drive.** Tiptap co-editing, AI edit tools, comments, versions, exports.
5. **Sheets + Forms.** Univer co-editing, AI formulas and charts, forms linked to response sheets.
6. **Slides + Whiteboard.** Deck editor, present mode, AI decks with FLUX images, Excalidraw diagrams.
7. **Power features.** Artifacts pane, Pyodide, uploads and vision, Knowledge/RAG, memory, voice, custom assistants, share links.
8. **Local mode.** WebLLM with the host as generator, automatic fallback when quotas run out.
9. **Beta launch.** Landing page, rate limits, feedback widget, admin dashboard, analytics, deploy to `huddle.<you>.workers.dev`, invite testers.
10. **Payments.** Stripe plans once feedback shows people want it.

## Free accounts you'll need (no card)
Cloudflare, Groq, Cerebras, OpenRouter, Tavily, GitHub (repo + OAuth), Google OAuth (optional), PostHog (optional). Keys are stored via `wrangler secret put` and never committed.

## Verification
- `npm run dev`. Open 3 browser windows as different guests in one room. Check that chat, AI streaming and typing indicators sync, and that co-edits in Doc, Sheet, Slides and Whiteboard converge.
- Playwright end-to-end tests with 2 contexts: join by code; AI reply appears for both; both edit a Doc and a Sheet cell and see each other's edits; AI-generated deck appears live.
- Vitest unit tests: code generator, SKILL.md parser, router fallback on mocked 429, slide JSON→pptx, sheet ops→xlsx.
- Manual checks:
  - "today's news about X": confirm search and citations.
  - "budget sheet for a trip": confirm formulas work.
  - "6-slide deck on Y": confirm it builds live.
  - Disable all API keys and confirm the app falls back to Local mode.
  - Open the exports in Word, Excel and PowerPoint.
- `wrangler deploy` and smoke-test the live URL. Confirm the Cloudflare dashboard shows $0 usage.
