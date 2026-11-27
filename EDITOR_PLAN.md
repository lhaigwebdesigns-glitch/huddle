# Editor upgrades plan

Why: from testing, the docs, slides and sheets "feel like 2015". This plan compares each Cairn editor with what Google Docs, Slides, Sheets and Forms do today. It picks what Cairn needs to keep up, and names what to leave out.

## How each feature was sorted

- **Must**: people expect it. Without it, the editor feels broken or old, or a school assignment can't be done.
- **Should**: makes it feel modern. Add it after the musts.
- **Skip**: Google has it, but a class assignment doesn't need it, or Cairn already covers it another way.

Cairn doesn't need to match Google feature for feature. It needs the everyday tools to feel just as good, plus the things Google doesn't have:
- the work record and replay
- contribution receipts
- the tutor that knows the assignment

Sizes are rough: **S** is about a day, **M** is a few days, **L** is a week or more.

---

## 1. Docs

**Has today**
- Text styles, plus bold, italic, underline and strikethrough
- Text color and highlight
- Bulleted, numbered and checklist lists
- Alignment, links, images and tables
- Undo and redo
- Live cursors
- Word import, plus Word and PDF export with a school header
- Replay
- AI edits

**Must**

| # | Feature | Why | Size |
|---|---|---|---|
| D1 | **Word count**: live in the corner, plus a count for the selection | Essays have word limits. Students check this constantly. | S |
| D2 | **Comments** on selected text: threads, reply, resolve, @name | Teachers give feedback and groups review each other. This is the #1 thing Google Docs is used for in class. | L |
| D3 | **Font and size**: about 6 good fonts (including Times New Roman and Arial for MLA) and sizes 8–72 | Teachers ask for 12pt Times New Roman. | S |
| D4 | **Line spacing** (1, 1.15, 1.5, 2) and **indent / outdent** | Double spacing is the school default. | S |
| D5 | **Find and replace** (Ctrl+F, Ctrl+H) | Basic expectation | M |
| D6 | **Page view**: a toggle between pageless and Letter pages with 1-inch margins, page breaks, and page numbers in the paged view | Students need to see "3 pages". | M |
| D7 | **Better tables and images**: add or remove rows and columns from a small menu, a header row, resizable columns; resize images, align them, and add a caption | The current table and image tools are bare. | M |
| D8 | **Citations**: add a source (website, book, article), cite it in the text, and insert a Works Cited / References list in MLA or APA | Research papers are a core assignment. Google has a built-in citations tool. | M |
| D9 | **Version history with restore**: named versions and "Restore this version" | Replay can show the past but can't bring it back. | M |
| D10 | **Sticky, compact toolbar** that stays visible while scrolling, with a Format menu for less-used items | This is most of the "2015" feel. | S |

**Should**
- **Outline**: a side list of the headings that jumps to each one. (S)
- **"/" menu** to insert a heading, table, image, checklist, divider or citation. (S)
- **Equations** (LaTeX, shown with KaTeX) for math and science. (M)
- **Footnotes**. (M)
- **Suggesting mode**: edits show as suggestions to accept or reject. It's powerful for peer review, but heavy to build with live editing, so do it after comments. (L)
- **Keyboard shortcuts** sheet (Ctrl+/). (S)

**Skip**
- Gemini-style "write it for me": Cairn's AI already does this, under the teacher's rules.
- Smart chips (people, calendar, files), building blocks, e-signatures, mail merge.
- Document tabs, multiple columns, watermarks, drawings inside a doc.
- Translate document, voice typing (the browser already has dictation), add-ons.
- Cross-references and tables of captions (new in Google, but rare in school work).

---

## 2. Slides

**Has today**
- Fixed layouts (title, section, quote, two columns, image) and themes
- Free-layout slides from PowerPoint imports, where text boxes can be moved, resized and resized in text
- Speaker notes
- Reordering with up and down buttons
- Present mode with follow-the-presenter
- PowerPoint export and a printable PDF
- PowerPoint import
- Slide owners

The biggest problem is that there are two editing models: layout slides with fixed fields, and free slides for imports. Google Slides has just one, where everything is an object you can move. That gap is most of the "2015" feel.

**Must**

| # | Feature | Why | Size |
|---|---|---|---|
| S1 | **One editing model**: every slide is free-form. Layouts become starting points that place text boxes, then everything can be selected, moved, resized, rotated, duplicated and deleted. | This is how every modern slide tool works. | L |
| S2 | **Snapping guides** (centers and edges), arrow-key nudging, multi-select, bring forward / send back | Without these, layouts look messy. | M |
| S3 | **Text formatting in boxes**: font, size, color, B/I/U, align, bullets, line spacing | Today only bigger and smaller text work on free slides. | M |
| S4 | **Insert**: upload, paste or drag in an image (not a URL), text box, shapes (rectangle, circle, line, arrow) | Pasting an image URL feels old. | M |
| S5 | **Slide sorter**: drag thumbnails to reorder; right-click to duplicate, delete or skip | Up and down buttons don't scale past about 5 slides. | M |
| S6 | **Undo / redo** (Ctrl+Z) | Missing today. Required. | S |
| S7 | **Backgrounds**: a color or image per slide, plus 6–8 polished themes | Most presentations are judged on looks first. | M |
| S8 | **Presenter view**: current and next slide, notes, and a timer in a second window | Students present from Cairn. | M |

**Should**
- **Fade transition** between slides, and "appear" for an item (one style each, not a gallery). (S)
- **Image crop** and **YouTube embed**. (M)
- **Tables** on slides. (M)
- **Align and distribute** buttons. (S)

**Skip**
- The transition and animation gallery, motion paths, editing the slide master.
- Audience Q&A, recording, live captions, laser pointer.
- Linked charts from Sheets, Gemini image generation (Cairn's AI can already make images).

---

## 3. Sheets

**Has today**
- One grid with keyboard movement, range select, copy and paste
- Bold, italic, alignment, fill color, number formats
- About 35 functions (SUM, AVERAGE, IF, SUMIF, COUNTIF, text functions…)
- Bar, line and pie charts
- Add rows and columns
- CSV import, CSV and Excel export

**Must**

| # | Feature | Why | Size |
|---|---|---|---|
| X1 | **Undo / redo** | Missing today. Required. | S |
| X2 | **Resizable columns and rows**, plus **freeze** the top row and first column | Basic for any table of data | M |
| X3 | **Fill handle**: drag a cell's corner to copy it or continue a series (1, 2, 3… / Mon, Tue…) | The one gesture everyone uses | M |
| X4 | **Sort and filter** a range (A→Z, Z→A, filter by value) | Science labs and surveys need it. | M |
| X5 | **More functions**: VLOOKUP / XLOOKUP, ROUND variants, dates (DATE, YEAR, MONTH, DAYS), STDEV, COUNTIFS / SUMIFS / AVERAGEIF(S), MAX/MINIFS, UNIQUE, SORT; formula autocomplete with argument hints | Statistics and lab assignments | M |
| X6 | **Multiple sheet tabs** | Data on one tab, analysis on another | M |
| X7 | **Borders, text wrap, merge cells, text color** | Expected on a formatting toolbar | M |
| X8 | **Excel (.xlsx) import** | Teachers hand out .xlsx files. Today only CSV comes in. | M |
| X9 | **Better charts**: scatter plots (science), axis titles, a chart editor to change the range and type | Labs graph data as x vs y. | M |

**Should**
- **Conditional formatting** (color scale, "greater than"). (M)
- **Cell comments** (shared with docs comments, D2). (S once D2 exists)
- **Data validation** (dropdown in a cell). (M)
- **Find** (Ctrl+F). (S)

**Skip**
- Pivot tables, macros and Apps Script, connected sheets, named functions, LAMBDA.
- Protected ranges, IMPORTRANGE, Explore and Gemini analysis (Cairn's AI can already read the sheet).
- Timeline view, smart chips.

---

## 4. Forms

**Has today**
- Question types: short answer, long answer, multiple choice, checkboxes, scale, date
- Required questions, open and closed
- A public link
- A responses list and CSV export

**Must**

| # | Feature | Why | Size |
|---|---|---|---|
| F1 | **Quiz mode**: an answer key and points per question, auto-grading for choice and short answer, a score shown after submitting (teacher's choice) | This is how teachers mostly use Google Forms. | L |
| F2 | **Response summary**: a chart for each question (pie or bar) plus the individual answers | Today it's only a list and a CSV. | M |
| F3 | **Dropdown** question, plus **images** in questions and options | Common question formats | S |
| F4 | **Sections**: split a form into pages | Longer forms and surveys | M |
| F5 | **Settings**: one response per person (signed in), shuffle question order, a custom confirmation message | Basic for quizzes | M |

**Should**
- **Go to section based on answer** (branching). (M)
- **Open in a Sheet**: send responses to a Cairn sheet. (S)

**Skip**
- File-upload questions (they need storage and moderation; turning in work happens in the room), the grid question type, add-ons.
- Locked mode, which only works on managed Chromebooks.
- Gemini "make a quiz": Cairn's AI already builds forms.

---

## 5. Whiteboard

This is Excalidraw, which is already modern: shapes, arrows, freehand, text, images, library, export. **No big work.** Just keep it current with Excalidraw releases and match the rest of the app's colors.

---

## Across every editor

| # | Feature | Size |
|---|---|---|
| A1 | **Comments system**, shared by docs, slides and sheets (built once with D2) | (in D2) |
| A2 | **Version history and restore** everywhere (built once with D9) | (in D9) |
| A3 | **The same toolbar look**: the same button sizes, menus and icons in every editor | M |
| A4 | **Works on a phone and tablet**: read and make light edits | M |
| A5 | **Keep the work record and receipt honest**: every new feature (comments, restore, fill handle, sort) must still credit the right person | (part of each) |

---

## Suggested order

Each phase is one PR or a few, shipped the same way as the screen pass.

1. ✅ **Quick wins that remove the "old" feel**: D1 word count, D3 fonts and sizes, D4 spacing and indent (plus an underline button), S6 and X1 undo, X2 freeze rows and columns with a visible column-resize handle, F3 dropdown and a picture per question.
   - Already there before phase 1: D10 (the doc toolbar already stays put while the doc scrolls), F2 partly (each question already had a bar summary), and "open in a sheet" for form responses.
   - Moved to phase 5: resizing row heights (the grid draws only the rows on screen and assumes they're all the same height) and pictures on answer options.
2. **Slides rebuild** (about 2 weeks): S1 one editing model, S2 guides, S3 text formatting, S4 insert, S5 sorter, S7 backgrounds and themes.
3. **Feedback** (about 1–2 weeks): D2 / A1 comments, then cell and slide comments, D9 / A2 version restore.
4. **School essentials** (about 1–2 weeks): D8 citations, D6 page view, F1 quiz mode, F2 response summary.
5. **Sheets depth** (about 1–2 weeks): X3 fill handle, X4 sort and filter, X5 functions, X6 tabs, X7 formatting, X8 Excel import, X9 charts.
6. **The rest**: D5 find, D7 tables and images, S8 presenter view, F4 and F5, then the Should lists.

Open question for you: **suggesting mode** (Docs) is the most-requested "pro" feature for peer review, but it's also the hardest to build on top of live collaboration. Decide after comments ship whether it's worth it.

Sources checked (November 2026):
- [Google Workspace Updates: Gemini in Docs](https://workspaceupdates.googleblog.com/2026/04/new-gemini-capabilities-in-google-docs-help-you-go-from-blank-page-to-brilliance.html)
- [Gemini comment workflows in Docs](https://workspaceupdates.googleblog.com/2026/07/streamline-collaboration-in-google-docs-with-Gemini-powered-comment-workflows.html?hl=engb)
- [Docs captions and cross-references](https://androidauthority.com/google-docs-captions-cross-references-3737416)
- [Gemini quiz creation in Forms](https://workspaceupdates.googleblog.com/2026/07/use-gemini-in-google-forms-to-quickly-create-a-new-quiz.html)
- [Google Forms for teachers](https://www.educatorstechnology.com/2026/10/google-forms-for-teachers.html)
