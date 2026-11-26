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
| 1 | Welcome (sign-up): teacher and student | `/welcome` | 👀 | All paths work. Fixed: button placement on desktop, header alignment, "signing up as a … · Change" on the last step, age hint, red code box that clears, one focus ring, step announcements for screen readers. |
| 2 | Today | `/classes` | ⬜ | |
| 3 | Class page: assignments, class list, waiting, requests | `/classes/:id` | ⬜ | |
| 4 | New assignment wizard | modal on the class page | ⬜ | |
| 5 | Worksheet room (teacher) | `/r/:code` | ⬜ | |
| 6 | Student class page: join, waiting, in the class | `/c/:code` | ⬜ | |
| 7 | Room: sidebar, chat and tutor, project bar, tasks | `/r/:code` | ⬜ | |
| 8 | Doc editor: writing, replay, import | inside a room | ⬜ | |
| 9 | Slides editor | inside a room | ⬜ | |
| 10 | Sheets, forms, whiteboard | inside a room | ⬜ | |
| 11 | Receipt and turn in, unsubmit, more time | modal in a room | ⬜ | |
| 12 | Grading and Save & next | `/classes/:id/a/:aid/:room` | ⬜ | |
| 13 | Your rooms and Profile | `/dashboard`, `/profile` | ⬜ | |
| 14 | Room settings | modal in a room | ⬜ | |
| 15 | Landing page | `/` | ⬜ | |
| 16 | Small pages: shared chat, public form, privacy, terms, admin | various | ⬜ | |
