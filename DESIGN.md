---
name: Cairn
description: A school workspace where students show what they did and remember it, drawn in five fixed colors, shape tiles and grainy rock people.
colors:
  ink: "#0a100d"
  mint: "#a9fdac"
  green: "#44cf6c"
  periwinkle: "#8fa6cb"
  teal: "#5eb1bf"
  green-ledge: "#2a9a4b"
  green-hover: "#57d97c"
  green-hover-app: "#3bbf61"
  link-green: "#1d7a3b"
  paper: "#ffffff"
  mist: "#f6faf7"
  sage-wash: "#eef4f0"
  line: "#dfe7e2"
  line-strong: "#c7d3cc"
  fg-muted: "#3b4640"
  fg-subtle: "#5a6760"
  accent-soft: "#e6fbe8"
  night-ground: "#0d1511"
  night-surface: "#141f19"
  night-surface-2: "#1b2822"
  night-line: "#24322a"
  night-fg: "#eef5f0"
  night-fg-muted: "#b4c2ba"
  night-ink-tile: "#23332b"
  night-rock-edge: "#6f8a7b"
  night-link: "#7fe39a"
typography:
  display:
    fontFamily: "Lexend Variable, Figtree Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(3rem, 8vw, 5.6rem)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Lexend Variable, Figtree Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(2rem, 4.6vw, 3.2rem)"
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Lexend Variable, Figtree Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "1.3rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Figtree Variable, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
  body-app:
    fontFamily: "Figtree Variable, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Figtree Variable, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 700
    letterSpacing: "0.06em"
  hand:
    fontFamily: "Caveat Brush, Comic Sans MS, cursive"
    fontSize: "1.35rem"
    fontWeight: 400
    lineHeight: 1.1
rounded:
  sm: "8px"
  md: "12px"
  button: "14px"
  card: "18px"
  panel: "24px"
  stage: "28px"
  pill: "999px"
spacing:
  gutter: "16px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "28px"
  section: "clamp(72px, 10vw, 128px)"
  container: "1180px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.button}"
    padding: "0 24px"
    height: "52px"
  button-primary-hover:
    backgroundColor: "{colors.green-hover}"
    textColor: "{colors.ink}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "0 24px"
    height: "52px"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.button}"
    padding: "0 24px"
    height: "52px"
  button-app-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.ink}"
    typography: "{typography.body-app}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-app-primary-hover:
    backgroundColor: "{colors.green-hover-app}"
  button-app-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body-app}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "40px"
  code-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "0 4px 0 16px"
    height: "52px"
  badge-example:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 9px"
  chip:
    backgroundColor: "{colors.sage-wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  card-finding:
    backgroundColor: "{colors.night-surface}"
    textColor: "{colors.night-fg}"
    rounded: "{rounded.card}"
    padding: "28px"
  card-stage:
    backgroundColor: "{colors.periwinkle}"
    textColor: "{colors.ink}"
    rounded: "{rounded.stage}"
    padding: "28px"
---

# Design System: Cairn

## Overview

**Creative North Star: "Stones on the Trail"**

A cairn is a stack of stones hikers leave to show the way and prove someone passed. Cairn's interface works the same way: bright, flat shapes stacked into friendly figures, each one a marker of real work a student did. The world is a white page with near-black ink, five fixed colors laid down as solid geometric tiles, and a cast of grainy rock people with faces, limbs and school props. It borrows the familiar education-site arrangement (split hero, proof band, how it works, audiences, story, close) and holds it to Duolingo and Khan Academy craft: chunky pressable buttons, heavy rounded display type, generous air, and color used in big confident fields rather than thin accents.

Density is relaxed on the landing page and moderate in the app, where the same tokens run quieter: green actions, sage-washed surfaces, periwinkle and teal as role markers, rock art saved for empty states and moments of success. Light and dark are both first-class. Dark mode keeps the palette and swaps the ground for a deep green-black, never a neutral gray.

The system refuses the dark, chat-window look of AI tools and anything that reads as surveillance: no monitoring dashboards, no warning reds as decoration, no cold neutral grays.

**Key Characteristics:**
- Five fixed brand colors with fixed roles; neutrals lean green so they belong to the ink.
- Heavy geometric display face (Lexend, 800) over a friendly humanist body (Figtree).
- Solid shape tiles (half-discs, quarter circles, D-shapes, rings) as the structural ornament.
- Flat rock characters with a grain filter, faces, arms, legs and props.
- Sparkles, squiggle underlines and hand-drawn arrows with Caveat Brush notes.
- Pressable primary actions with a 4px ledge underneath, Duolingo style.

## Colors

A bright, flat, five-color set over white and ink, where every hue carries a job.

### Primary
- **Go Green** (green): the one action color. Primary buttons, the closing call-to-action band, the top stone of the logo. Always carries ink text, never white.
- **Ledge Green** (green-ledge): the 4px ledge under primary buttons and the light-mode focus ring.

### Secondary
- **Highlighter Mint** (mint): good news and emphasis. The highlighter swipe inside running text, "Graded" status, the hopeful research card, the receipt card, text selection, big research numerals on the ink band, and the dark-mode focus ring.

### Tertiary
- **Student Periwinkle** (periwinkle): students. The student week stage, "Working" status, the founder portrait shape, outline tiles, the logo sparkle.
- **Teacher Teal** (teal): teachers. Step numerals in the teacher walkthrough, the "shown, not watched" band, the middle stone of the logo, teacher-side rock art.

### Neutral
- **Ink** (ink): text, the research band ground in light mode, ink tiles, ink buttons, the base stone of the logo.
- **Paper** (paper): page ground and card surface in light mode.
- **Mist** (mist) and **Sage Wash** (sage-wash): sidebar and secondary surfaces; Sage Wash also fills the students band and neutral chips.
- **Line** (line) and **Strong Line** (line-strong): 2px borders on the landing page, 1px hairlines in the app.
- **Muted Ink** (fg-muted) and **Subtle Ink** (fg-subtle): secondary copy and placeholders.
- **Night Ground / Night Surface / Night Surface 2** (night-ground, night-surface, night-surface-2): the dark-mode ground ladder, all green-black.

The Tailwind zinc scale is re-pointed at these green-leaning neutrals (#f6faf7 to #0d1511), so every zinc class in the app follows the palette.

### Named Rules
**The Five Stones Rule.** The five brand colors are fixed. New surfaces get color by role (green acts, mint marks good news, periwinkle is students, teal is teachers, ink grounds), never by inventing a sixth hue.

**The Ink-On-Color Rule.** Text on green, mint, periwinkle and teal is ink. White text appears only on ink, and on the darker member-avatar shades.

**The Green-Leaning Neutral Rule.** No neutral gray. Every gray in the system is tinted toward the ink's green.

## Typography

**Display Font:** Lexend Variable (with Figtree Variable, Segoe UI, system-ui)
**Body Font:** Figtree Variable (with -apple-system, Segoe UI, system-ui)
**Hand Font:** Caveat Brush (with Comic Sans MS, cursive)

**Character:** Lexend at 800 is round, geometric and loud like a textbook cover; Figtree is warm and easy at reading sizes. Caveat Brush is the teacher's pen in the margin, used for short annotations only.

### Hierarchy
- **Display** (800, clamp(3rem, 8vw, 5.6rem), 0.98): the landing hero headline only.
- **Headline** (800, clamp(2rem, 4.6vw, 3.2rem), 1.04): section headings; the closing band runs it larger, up to 4.6rem.
- **Title** (700, 1.3rem, 1.2): card and step headings, FAQ summaries, empty-state titles in the app.
- **Body** (400, 1.0625rem, 1.6): landing copy, held to 36 to 62ch. The app runs body at 15px.
- **Label** (700, 0.78rem, 0.06em tracking, uppercase): the "Example" badge and small group labels inside product UI. In the app, panel headings such as "People" or "Rubric" use the same small uppercase style as the heading itself.
- **Hand** (Caveat Brush, 1.35rem, 1.1): callouts beside hand-drawn arrows, short notes, the founder's signature.

Headings get `text-wrap: balance`; paragraphs get `text-wrap: pretty`. h1 and h2 tighten to at least -0.03em.

### Named Rules
**The No Kicker Rule.** No eyebrow or kicker label sits above a heading. The heading opens its section by itself; a squiggle underline may follow it.

**The Highlighter Rule.** Emphasis inside long text is a mint highlighter swipe across the lower half of the line (same size, same weight), never a large pull quote. In dark mode the swipe drops to mint at 32% opacity.

## Layout

The landing page is the category-standard education layout: sticky blurred nav (76px), split hero with copy left and a 3x3 shape-tile mosaic right, a full-bleed ink research band, a two-column "turn", a sage students band, the teacher walkthrough with a product mock, a mint receipt, a teal promises band, the founder letter, a green close with a crew of rock people standing on the bottom edge, then FAQ and footer.

- **Container:** 1180px max, with a 16px side gutter that respects safe-area insets.
- **Section rhythm:** clamp(72px, 10vw, 128px) vertical padding per section; color bands run full bleed.
- **Grids:** two-column splits collapse to one column at 900px; the research findings use a 12-column grid (7/5 split, plus full-width rows); feature grids step 3 to 2 to 1 at 900px and 560px.
- **Breakpoints observed:** 1100px (callouts drop under the mock), 960px (nav links hide), 900px (splits stack), 760px, 560px and 520px (phone tightening).
- **Gaps:** 8, 12, 16, 20, 24 and 28px inside components; 32 to 88px between split columns via clamp.
- **The app** uses the same tokens at app density: a sidebar on Mist, 40px controls, 1px hairlines.

The theme switch lives in the landing footer, not in the nav.

## Elevation & Depth

Mostly flat. Depth comes from solid color fields stacked on white, the way paper shapes sit on a desk. Two shadow ideas exist, and each has one job.

### Shadow Vocabulary
- **Ledge** (`box-shadow: 0 4px 0 #2a9a4b`): the solid ledge under primary buttons; the code field uses the same ledge in Line color. On press it collapses to `0 1px 0` while the button moves down 3px.
- **Lift** (`box-shadow: 0 18px 40px -22px rgba(10, 16, 13, 0.35)`; dark `rgba(0, 0, 0, 0.7)`): a soft drop under floating demo cards, the teacher mock and the start box.
- **Pill glow** (`box-shadow: 0 2px 8px rgb(0 0 0 / 0.15)`): live-pointer and caret name pills in collaborative views.

### Named Rules
**The Ledge Is For Pressing Rule.** The 4px ledge belongs only to things you press (primary buttons, the code field). Cards, tiles and badges never get a hard offset shadow.

## Shapes

The form language is the geometric shape tile: half-discs, a quarter circle, a D-shape, a circle and a thick periwinkle ring, each a solid flat fill, arranged in a 3x3 mosaic with rock people sitting inside them. The founder portrait is a bowl shape (square top, round bottom).

- **Corners:** 8px for small controls and focus rings, 12px for app inputs and buttons, 14px for landing buttons and the code field, 18px for research cards and option rows, 24px for mocks and panels, 28px for big stage cards, full pills for chips, badges and the theme switch.
- **Borders:** 2px on the landing page (quiet buttons, option rows, mocks, FAQ dividers, footer rule), 1px in the app. The day-card total uses a 2px dashed rule.
- **Illustration:** rock people are drawn in a 100x100 box: a stone body with a grain filter (fractal noise speckled inside the edge), 6.5px round-capped limbs, shoes, a simple face, and an optional prop (book, laptop, pencil, speech bubble). Ink-bodied rocks gain a soft edge stroke in dark mode so they stay visible. Four-point sparkles, squiggle underlines and a curved hand-drawn arrow (3px round stroke) complete the kit.

### Named Rules
**The Flat Grainy People Rule.** Characters are flat rock people with grain, faces and limbs, in brand colors only. No gradients, no glossy 3D, no photo people.

## Components

### Buttons
Chunky, friendly and physical: they look pressable and answer when pressed.
- **Shape:** 14px corners, 52px tall on the landing page (44px in the nav); the app primitive is 40px with 12px corners (32px small with 8px; large is a full pill).
- **Primary:** Go Green with ink text, 700 weight, 24px side padding, sitting on the green ledge. Hover lightens to Green Hover.
- **Press:** scale to 0.97 in 120 to 160ms ease-out; the landing primary also drops 3px onto its collapsed ledge.
- **Quiet:** transparent with a 2px Line border; hover darkens the border to ink.
- **Ink:** ink ground with white text, used for the code field's Join button (mint with ink text in dark mode).
- **App secondary / ghost:** paper with a Strong Line border, or text-only in Muted Ink; both hover to Sage Wash.

### Chips and Badges
- **Example badge:** a small uppercase pill (Label type, 10% ink wash) on every piece of demo data.
- **"Not" chips:** Sage Wash pills with a small cross icon, 600 weight.
- **Status chips (app):** "Graded" on mint with ink text, "Working" on periwinkle at 35%; dark mode drops to 15 to 20% tints.
- **Form chips:** 2px ink border on white; the selected chip inverts to ink with white text.

### Cards / Containers
- **Research cards:** Night Surface on the ink band, 18px corners, 28px padding; the hopeful card flips to mint with ink text.
- **Stage cards:** periwinkle (students) or mint (receipt), 28px corners, 28px padding, ink text.
- **Floating cards:** paper with the Lift shadow and 24 to 28px corners.
- **Option rows:** 2px Line border, 18px corners; the selected row fills mint with an ink border.

### Inputs / Fields
- **App input:** 40px, 12px corners, 1px Strong Line border on paper. Focus darkens the border to ink and adds a 4px ink ring at 10%.
- **Code field:** 52px, 2px Line border, 14px corners, sitting on a Line-colored ledge; the code types in Lexend 700 uppercase with 0.14em tracking. Focus darkens the border to ink.
- **Form fields on color:** on the green close band, fields are white with a 2px ink border and 12px corners.
- **Focus (global):** a 2px outline in the Ring color (Ledge Green in light, mint in dark) with 2px offset.
- **Error:** red text at 600 weight below the field.

### Navigation
A sticky top bar 76px tall, ground at 84% with a 16px blur. The wordmark is Lexend 800 at 1.55rem next to the three-stone logo. Links are Figtree 600 in Muted Ink, darkening to ink on hover; they hide below 960px, and the quiet actions hide below 560px.

### Logo
Three stacked ellipses (base in the foreground color, middle teal, top green) with a periwinkle four-point sparkle at the top right.

### Rock People (signature)
RockPerson, RockFace and RockArt place grainy stone characters with poses (hold, wave, cheer, carry, sit) and props in a 100x100 box. RockDefs, with the grain filter, sparkle and arrow symbols, renders once at the app root. In the app, rock art appears in empty states and moments of success; teal rocks for teacher contexts, periwinkle for students, mint for celebrations.

### Member Colors
Avatars and live pointers draw from deeper shades of the brand hues (#2a9a4b, #2f7f8c, #5a72a0, #3a8f6a, #46647f, #1f7a5a, #4d6fae, #36796b) so white initials stay readable.

### Motion
Quick and physical. Durations are 150, 220 and 320ms; ease-out is cubic-bezier(0.23, 1, 0.32, 1); drawers use cubic-bezier(0.32, 0.72, 0, 1). The landing page has one authored moment: the hero cairn builds itself, each stone dropping 140px with a slight overshoot settle, 260ms apart, then the flag pops. Sections reveal once on scroll. Reduced motion turns all of it into instant or short fades.

## Do's and Don'ts

### Do:
- **Do** give every color a role: green acts, mint marks good news, periwinkle is students, teal is teachers.
- **Do** put ink text on every brand color fill.
- **Do** use Lexend 800 with tight tracking (-0.03em to -0.04em) for headlines and Figtree for everything you read.
- **Do** mark emphasis in long text with the mint highlighter swipe.
- **Do** label every piece of demo data with the "Example" badge.
- **Do** use rock people in the flat, grainy style for empty states and illustration.
- **Do** keep the ledge on primary pressables and collapse it on press.
- **Do** ship light and dark together; dark keeps the palette on a green-black ground.

### Don't:
- **Don't** add a sixth brand color or recolor the five.
- **Don't** put an eyebrow or kicker label above a heading.
- **Don't** use large pull quotes for emphasis.
- **Don't** fabricate testimonials, quotes or results.
- **Don't** put white text on green, mint, periwinkle or teal.
- **Don't** use neutral grays; neutrals lean green.
- **Don't** build the dark, chat-window look of AI tools or anything that reads as monitoring.
- **Don't** put the theme switch in the landing nav; it lives in the footer.
- **Don't** give cards or tiles a hard offset shadow; the ledge is for pressing.
