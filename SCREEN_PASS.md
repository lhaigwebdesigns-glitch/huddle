# Screen-by-screen pass

One screen at a time: test everything on it, fix what's broken, make the styling right, then move on. Nothing new gets added in the middle of a screen.

**For each screen:**
1. **List** every button, field, state and message on it.
2. **Test** each one in the browser:
   - teacher and student
   - light and dark
   - desktop and phone
   - empty, full and error states
3. **Style:** hierarchy (the most important thing stands out most), spacing, and wording.
4. **Fix** everything found, in one PR for that screen.
5. **You check** it on the live site.
6. **Mark it done** here, and only then start the next screen.

**Status:** ⬜ not started · 🔍 testing · 🛠️ fixing · 👀 waiting on your check · ✅ done

The order follows what the pilot teacher and her students hit first.

| # | Screen | Where | Status | Notes |
|---|---|---|---|---|
| 1 | Welcome (sign-up): teacher and student | `/welcome` | ✅ | All paths work. Fixed: button placement on desktop, header alignment, "signing up as a … · Change" on the last step, age hint, red code box that clears, one focus ring, step announcements for screen readers. |
| 2 | Today | `/classes` | ✅ | All states work (new, one class, busy, all caught up, Hide, student, signed out). Fixed: work comes before the setup card, no duplicate Grade button, Answer jumps to the waiting list/requests/reports, quieter New class box, true sign-in wording, no errors for students. |
| 3 | Class page: assignments, class list, waiting, requests | `/classes/:id` | ✅ | Everything works. Fixed: phone header, reported-message wording, shorter section titles, assignment actions tidied into a More menu, Class list + Students merged into one Students list, phone waiting row. | |
| 4 | New assignment wizard | modal on the class page | ✅ | New "Write the worksheet" step with the worksheet and answer key editors right in the wizard; Google Drive as its own choice with its logo; icons on templates and worksheet choices; real Google Classroom-style mark; bigger modal. |
| 5 | Worksheet room (teacher) | `/r/:code` | ✅ | Works (banner, files, AI help, add answer key). Fixed: back link goes to the class, worksheet-specific AI suggestions and chat hint, no room code or Share chat / Leave room. Also: the welcome screens now lead with the AI tutor and "Show your work", like the landing page. |
| 6 | Student class page: join, waiting, in the class | `/c/:code` | 👀 | Works (join, 13+ check, waiting, turned away, opening from a link, sidebar). Fixed: rows stack on phones, To do and Done sections (soonest first), Late shown in red, grades and the teacher's comment shown once the teacher returns them (new Return step: Return grades on the class page, Return to the student while grading; Send back renamed Reopen for changes), extended due dates shown, a wrong code lets you type the right one, "Use a different account" on waiting and turned-away, sidebar says Your classes. |
| 7 | Room: sidebar, chat and tutor, project bar, tasks | `/r/:code` | 👀 | Works (solo and group rooms, tutor, tasks, turn in, teacher view, plain rooms). Fixed: class rooms have no party code or Leave room, solo rooms say they're yours (no members list, Steps instead of roles and owners), the title shows once with no tech labels, the assignment bar is one row with Turn in last, the message box says who you're talking to, no empty gap under AI replies, file hint fits tutor rooms. |
| 8 | Doc editor: writing, replay, import | inside a room | 👀 | Works (writing, formatting, lists, tables, images, paste blocking, version history, replay, export, two people at once, read-only after turn-in). Fixed: toolbar fits one row (Text style and Align dropdowns, an Insert menu for image, table, quote and code), tables have visible borders and a header row, a hint in an empty doc, new files in a class room are named after the assignment, "Saves as you type" instead of "sync for everyone", Replay opens on the finished doc. |
| 9 | Slides editor | inside a room | 👀 | Your reports fixed: big decks import (150 MB limit, photos shrunk before upload, pictures upload 4 at a time, progress shown, the page never freezes), imported slides look like the original (master and layout styles, theme fonts and lighter/darker colors, italic, underline, centering, shrink-to-fit, picture and gradient backgrounds, rounded corners, outlines, see-through fills, rotation, the master's logos and bands), present mode covers the whole screen (no page scroll, no fullscreen flicker, click to advance, Home/End), the wizard shows import progress instead of freezing, and teachers can delete an assignment. Not yet: editing tools for the new styles (italic, align, font) in the slide editor. |
| 10 | Sheets, forms, whiteboard | inside a room | 👀 | Works (sheet formulas and formats, charts, CSV/Excel, forms with every question type and the public link, whiteboard drawing synced live). Fixed: Cairn's colors (not hard-coded grays) in all three, real icons instead of symbols and emoji in the sheet toolbar, Share link shows the link when the browser blocks copying (it used to fail), Add a question is a visible row of every type, "Saves as you type" everywhere. |
| 11 | Receipt and turn in, unsubmit, more time | modal in a room | ⬜ | |
| 12 | Grading and Save & next | `/classes/:id/a/:aid/:room` | ⬜ | |
| 13 | Your rooms and Profile | `/dashboard`, `/profile` | ⬜ | |
| 14 | Room settings | modal in a room | ⬜ | |
| 15 | Landing page | `/` | ⬜ | |
| 16 | Small pages: shared chat, public form, privacy, terms, admin | various | ⬜ | |

## Ideas worth building (found during the pass)

- ✅ **Copy an assignment to my other classes.** Built: More → Copy to another class. Teachers teach the same lesson to several periods; today they rebuild the assignment and its worksheet in each class.
- ✅ **Preview as a student.** Built: More → Preview as a student, and on the wizard's last step. See exactly what a student gets (worksheet copy, AI setting, instructions) before posting the link.

## Your list (from testing, Nov 27)

- ✅ Big slideshows import (20+ slides, big photos) — screen 9
- ✅ Imported slides look like the original — screen 9
- ✅ Present mode — screen 9
- ✅ The wizard froze on "Make it" with a big deck — screen 9
- ✅ Delete an assignment — screen 9
- ⬜ Docs, slides and sheets feel like 2015: bring the editors up to what people expect now (plan first)
- ✅ Landing page: the "Cairn stack" timing is too slow (a stone every 3 s, was 12)
- ✅ Animate the pebbles (they breathe, blink and wave, each on its own beat; hover to hop)
- ⬜ Finish the screen pass (screens 11–16; 10 done)
- ⬜ Styling pass on the whole app, then get feedback
- ⬜ Pricing: how Cairn makes money
- ⬜ Marketing
