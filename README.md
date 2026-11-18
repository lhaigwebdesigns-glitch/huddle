# Huddle: a multiplayer AI workspace

Huddle is free and open source. Someone starts a room and shares the **party code**, and everyone chats with the same AI in real time. The AI can search the web, read pages, follow 20 built-in skills, and build **docs, sheets, slides, whiteboards, forms and mini-apps that everyone co-edits live**. It runs on **free, open-weight models** (including one on your own GPU), so there is no AI bill.

## What works today
- **A live office suite, built by the AI or by hand**:
  - **Docs**: Word export.
  - **Sheets**: 35 formula functions, charts, `.xlsx` and CSV.
  - **Slides**: 6 layouts and 5 themes, present with **follow-along**, `.pptx` export.
  - **Whiteboards**: Excalidraw; the AI draws from Mermaid.
  - **Forms**: public link, live response charts, send responses to a sheet.
  - **Artifacts**: AI-built mini apps in a sandbox.
  - Every file has version history, duplicate and delete in the Drive sidebar.
- **Chat extras**:
  - edit and resend, Regenerate
  - reactions and polls
  - Mermaid diagrams
  - slash commands (`/doc`, `/sheet`, `/slides`, …)
  - clickable starter prompts
  - Deep Research mode and opt-in room memory
- **Your own GPU as the AI**: point `OLLAMA_BASE_URL` at [Ollama](https://ollama.com) and Huddle uses it first, with no rate or token limits (see `ollama/Modelfile`).
- **Launch protection**:
  - per-IP limits on room creation, feedback and forms
  - a site-wide daily AI cap shown in `/admin`
  - a "switch to Local mode" banner when the free cloud AI is out of quota
- **Party-code rooms**: create a room, share `K7Q-29F` or the invite link, and friends join with just a name. Rooms show who's online, typing indicators, a host badge, room lock and removing people.
- **Shared AI chat**: one AI reply is streamed to everyone. It knows who said what and replies to every message or only on `@ai`. Anyone can press Stop, and messages sent while it's answering are batched into its next turn.
- **Free model router**: tries your own GPU (Ollama) → Groq (two models) → Cerebras → Cloudflare Workers AI → OpenRouter `:free`, waits out short rate limits, and skips any provider that is down. It also unlinks citations the model invented.
- **Local mode**: the host's browser runs Qwen3, Llama 3.2 or Phi with [WebLLM](https://github.com/mlc-ai/web-llm) (WebGPU). It's unlimited and private, and its tokens are relayed to the whole room.
- **Web tools**: `web_search` (Tavily → Jina → DuckDuckGo) and `fetch_url` (Jina Reader, no key needed). Answers show source chips.
- **Skills**: 20 playbooks in the open Agent Skills `SKILL.md` format, covering writing, editing, problem solving, math, debugging, research, deep research, web design, frontend, UX copy, accessibility, docs, slides, spreadsheets, facilitation and tutoring. The AI loads them on demand, and hosts can toggle them per room.
- **Feedback loop**: 👍/👎 plus a comment on every AI reply, a "Send feedback" box, and an `/admin` dashboard.
- Markdown, tables, code blocks with a copy button, LaTeX math, dark mode and a mobile layout.

## Run it locally
```bash
npm install
cp .dev.vars.example .dev.vars   # MOCK_AI=true works with zero keys
npm run dev                      # http://localhost:5173
```
Open two browser windows (one normal, one private), create a room in one and join with the code in the other.

For real answers, add at least one free key to `.dev.vars`, set `MOCK_AI=false`, and restart:

| Key | Where (all free, no card) | Used for |
|---|---|---|
| `GROQ_API_KEY` | console.groq.com | Fast open models (gpt-oss-120b default) |
| `CEREBRAS_API_KEY` | cloud.cerebras.ai | Fast open models |
| `OPENROUTER_API_KEY` | openrouter.ai | `:free` models only |
| `TAVILY_API_KEY` / `JINA_API_KEY` | tavily.com / jina.ai | Reliable web search |
| (Workers AI) | Your Cloudflare account | Free daily allowance; works after `npx wrangler login` (`HUDDLE_REMOTE=1 npm run dev` locally) |

Without a search key, search falls back to DuckDuckGo, which often blocks cloud servers. Add a free Tavily key before inviting testers.

## Deploy for free (Cloudflare)
```bash
npx wrangler login
npx wrangler d1 create huddle        # paste the database_id into wrangler.jsonc
npx wrangler secret put GROQ_API_KEY # repeat for each key + ADMIN_TOKEN
npm run deploy                       # → https://huddle.<you>.workers.dev
```
Everything fits Cloudflare's free plan (Workers, Durable Objects with SQLite, D1, Workers AI daily allowance). You don't need a paid domain.

## How it works
```
Browser (React) ──WebSocket──► Room Durable Object (one per party code)
                                 presence · chat log (SQLite) · AI turn queue
                                 agent loop → free model router → tools
             ──WebSocket──► Doc Durable Object (one per doc) — Yjs CRDT sync
Worker (Hono): /api/rooms · /api/feedback · /api/admin
```
- `src/server/room.ts`: rooms, presence, the AI agent loop, Local-mode relay
- `src/server/doc.ts` + `markdown-yjs.ts`: collaborative docs; the AI writes Markdown straight into the live doc
- `src/server/ai/`: model list (`models.ts`), router (`providers.ts`), tools, skills loader
- `skills/<name>/SKILL.md`: add a folder to add a skill
- `src/client/`: React app (chat, doc editor, settings, admin)

## Tests
```bash
npm test            # unit tests: codes, skills, markdown⇄Yjs, provider fallback
npm run dev & npm run e2e   # two real browsers: join by code, chat, AI doc, live co-editing
```

## Roadmap
**Picking this up in a new Claude Code session? Start with [`HANDOFF.md`](HANDOFF.md)** — what is built, lessons learned, and the phase-by-phase build plan. Original plan: `ROADMAP.md`. Next up: Sheets (Univer), Slides + present mode, Forms, Whiteboard (Excalidraw), artifacts/canvas preview, file uploads with vision, knowledge/RAG, memory, voice, image generation, accounts, and later payments.

MIT licensed.
