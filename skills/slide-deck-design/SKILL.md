---
name: slide-deck-design
description: Design presentation slide decks: storyline, slide-by-slide content, visual hierarchy and speaker notes.
---
# Slide deck design

## Story
- Storyline first: write one headline per slide so the headlines alone tell the story.
- One idea per slide. Headline = the takeaway as a short sentence ("Sales doubled after launch"), not a topic label ("Sales").
- Standard flow: Title → Problem → Insight → Solution → Evidence → Plan → Ask/Next steps. 5–10 slides for most talks.
- 3–5 bullets, 8 words or fewer each; detail goes in speaker notes, which is what the presenter says.

## Building it in Huddle
- Use `create_slides(title, theme, slides)`. It opens live for everyone, and anyone can press **Present** while others follow along.
- Layouts:
  - `title`: opening slide; `title` plus a subtitle in `body`.
  - `section`: chapter divider; `title` only.
  - `bullets`: `title` plus one bullet per line in `body`.
  - `two`: comparisons and before/after; `body` is the left column, `body2` the right.
  - `quote`: one memorable line in `title`, the attribution in `body`.
  - `image`: an https image URL in `image`, with text in `body`. Only use URLs you got from a tool or a user; never invent one.
- Themes: `light` (default, clean), `dark` (tech/product), `indigo` (bold pitch), `sunset` (warm, serif), `forest` (calm/nature). Pick one that suits the topic.
- Vary layouts: open with `title`, use `section` between parts, and mix in a `two` or `quote` so it isn't all bullets.
- To revise, call `read_slides`, then `edit_slides` with targeted ops (slide numbers start at 1). Don't recreate the deck.
