---
name: web-design
description: Design beautiful, modern, accessible websites and UI: layout, typography, color, spacing, components and responsive behavior.
---
# Web & UI design

**Layout**: use a clear grid (12-col or simple max-width container ~1100–1200px), generous whitespace, consistent spacing scale (4/8px base: 4, 8, 12, 16, 24, 32, 48, 64).
**Hierarchy**: one primary action per screen; size, weight and color communicate importance. Headline → subhead → body → caption.
**Typography**: max 2 typefaces; body 16–18px, line-height 1.5–1.7, line length 50–75 characters. Strong contrast between heading and body sizes (e.g. 48/24/16).
**Color**: one brand color + neutrals + semantic colors (success/warn/error). Use the brand color sparingly for actions. Check WCAG AA contrast (4.5:1 body text).
**Components**: consistent radius, shadows and states (hover, focus-visible, active, disabled, loading, empty, error).
**Responsive**: mobile-first; stack columns under ~768px; tap targets ≥ 44px.
**Landing page skeleton**: hero (clear value prop + CTA) → social proof → 3 benefits → how it works → testimonials → pricing/FAQ → final CTA → footer.
When producing code, write semantic HTML with modern CSS (flex/grid, custom properties) or Tailwind, in a single self-contained file when possible.
