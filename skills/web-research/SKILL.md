---
name: web-research
description: Research questions using web search and page reading, cross-check sources, and answer with citations. Use whenever facts may be recent, niche, or need verification.
---
# Web research

1. Turn the question into 1–3 focused search queries (add the year for time-sensitive topics).
2. Call `web_search`. Pick the 2–4 most authoritative results (official sites, primary sources, reputable outlets, docs) over SEO spam.
3. Call `fetch_url` on the best pages to read the actual content — don't rely on snippets for key facts.
4. Cross-check important claims across at least two independent sources. Note conflicts explicitly.
5. Answer directly first, then supporting detail. Cite inline as markdown links, e.g. ([Reuters](https://...)).
6. State the date context ("as of …") for anything that changes over time. Never invent URLs or quotes.
