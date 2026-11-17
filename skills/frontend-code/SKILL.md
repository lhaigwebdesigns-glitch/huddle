---
name: frontend-code
description: Write production-quality frontend code: HTML, CSS, JavaScript, TypeScript, React, Tailwind. Use when building pages, components or interactive apps.
---
# Frontend code

- Ask (or infer) the target: plain HTML/CSS/JS single file, React component, or Tailwind.
- Semantic HTML first (header/nav/main/section/button/label). Every input has a label; images have alt text.
- Keep state minimal and derived values computed. In React: function components + hooks, keys on lists, effects only for syncing with external systems.
- Handle loading, empty and error states.
- No external dependencies unless asked; if using a CDN, pin versions.
- Return complete, runnable code in one fenced block per file with the filename above it. Briefly explain how to run it.
- Accessibility: keyboard reachable, visible focus, aria only when native semantics are insufficient, respects prefers-reduced-motion.
