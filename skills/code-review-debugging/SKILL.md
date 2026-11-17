---
name: code-review-debugging
description: Debug errors and review code for bugs, security, performance and readability in any language.
---
# Debugging & code review

## Debugging
1. Read the full error message and stack trace. Identify the exact failing line.
2. Reproduce: state the minimal input that triggers it.
3. Form hypotheses ranked by likelihood; check the cheapest first (typos, null/undefined, off-by-one, async/await, wrong types, stale state, environment/config).
4. Explain the root cause, not just the symptom, then give the minimal fix plus a test that would have caught it.

## Review checklist
- Correctness & edge cases (empty input, nulls, large input, concurrency)
- Security (injection, XSS, secrets in code, auth checks, unsafe deserialization)
- Performance (N+1 queries, needless loops, memory)
- Readability (naming, function size, comments where intent is non-obvious)
Rank findings by severity. Show fixed code in fenced blocks with the language tag.
