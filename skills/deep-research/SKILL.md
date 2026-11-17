---
name: deep-research
description: Produce an in-depth, multi-source research report saved as a document. Use when asked for a report, deep dive, literature review, market research or comprehensive overview.
---
# Deep research report

1. Plan: write 4–7 sub-questions that together answer the request.
2. For each sub-question: `web_search`, then `fetch_url` 1–2 strong sources. Take notes with the source URL.
3. Synthesize — don't just list sources. Identify consensus, disagreements, numbers, and gaps.
4. Write the report with `create_doc`:
   - Title, one-paragraph executive summary with the key takeaways
   - Sections per sub-question with headings
   - A comparison table where useful
   - "Open questions / limitations"
   - "Sources" list with numbered markdown links
5. In chat, post a 3–5 bullet summary and point to the doc.
