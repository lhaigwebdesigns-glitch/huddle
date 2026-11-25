# Cairn: build plan

Last updated Nov 22, 2026. Sizes: **S** = an evening, **M** = a weekend, **L** = a few weekends.

**Status:** ✅ done · 🟡 partly done · ⬜ not started

## Where things stand

**Build 1 is live (PR #10):**
- project rooms
- three AI settings
- tutor mode
- paste block
- turn in with locked files

**Builds 1–11 are live.** The product is now **Cairn** (renamed from Huddle in November 2026): new name, logo, colors, rock-character illustrations, landing page and app theme, in light and dark. Next: **the pilot** with your teacher's class.

**After launch (November 2026):**
- Step 1, polish: done (nav, light mode first, Cairn date pickers and dialogs).
- Step 2, security: done (everyone signs in, class lists with a waiting list, class rooms only for their students, Turnstile ready).
- Teacher and student accounts: done (student accounts never get teacher tools).
- Step 3, worksheets: built. A teacher adds a worksheet to an assignment: a blank doc or slides, or their own Word or PowerPoint file. Every student or group gets their own copy when they first open the assignment. An optional answer key stays with the teacher and shows beside the work when grading. Anyone can also bring a Word or PowerPoint file into a room from New file.
- Step 4, writing replay: built. Every doc records its changes from now on. "Replay" on a doc plays it back like a sped-up video: typing at its pace, long breaks squeezed, large pastes marked as dots, work sessions split at long breaks. Students see it for their own docs; the teacher sees it from the grading screen. It shows what happened and never scores or guesses. Docs only for now (not slides or sheets), and docs made before this update replay from the day it shipped.
- Sign-in: Google only (GitHub removed). Class lists also take a CSV or text file of emails.
- Onboarding and tours: built. A new account picks teacher or student, then gets a short welcome. Teachers: their name and subject (used to order the templates), then what Cairn does for them. Students: their name, the 13+ check, three screens on what they get, and an optional class code. Students who arrive through an assignment link go straight to their work and see the welcome later. Each main screen (Today, a class, grading, a student's class page, a student's first room) has a 2–4 step spotlight tour with animated pebble scenes; the "?" button replays it, and "Don't show tips like this" turns them off.

**Known limit of imports:** Word keeps headings, bold, italic, underline, lists, tables, pictures and links, but not text colors, exact fonts or page layout. PowerPoint keeps each slide's text boxes, pictures, shapes, background color, text size, color and bold, and speaker notes, but not themes, charts, SmartArt or animations.

**Known limit of receipts:** when someone splits a paragraph in the middle (presses Enter inside it), the doc editor rewrites the text after the split, so that text is credited to the person who split it. Typing, deleting and pressing Enter at the end of a paragraph are counted correctly.

## The builds, in order

Each build is one PR, tested and deployed before the next one starts. Builds 1–11 come before the pilot.

| Build | What | Items | Size | Why now |
|---|---|---|---|---|
| ✅ 1 | Project rooms, AI settings, tutor mode, paste block, turn in | 8, 9, 10, 12 (files) | L | The base everything else needs |
| ✅ 2 | **Contribution receipts** | 1, 3, 5, 6, 7, 12 (receipt) | L | The core idea: proof of who did the work |
| ✅ 3 | **Tasks, roles and templates** | 11, 13, 46, 53, 60 | L | Groups split the work, and tasks count on the receipt |
| ✅ 4 | **Teacher class page and grading** | 22, 23, 24, 25, 65 | L | The teacher's side: one place for all groups, fast grading |
| ✅ 5 | **Google sign-in and Share to Classroom** | 15, 14, start 19 | M | No friction for schools; Google's review takes weeks, so start it here |
| ✅ 6 | **Safety and limits** | 64, 66, 67, 68, 69, 70, 62, 63 | M | Required before any students use it |
| ✅ 7 | **Docs and slides basics** | 39, 40, 42, 45, 48, 52 | L | What students need to make real projects |
| ✅ 8 | **New landing page** | 28–38 | M | Teachers need a page to sign up from |
| ✅ 9 | **Assignments for every student** | new | L | One link per assignment; solo or groups; a room per student made on first click; per-student grading queue; work timeline |
| ✅ 10 | **Timed assignments** | new | M | Work windows (e.g. class time only), changing deadlines, extra-time requests, teacher overrides |
| ✅ 11 | **The teacher's path** | 72 + new | M | Today home screen, step-by-step assignment wizard, first-time tour, plain words everywhere |
| | **The pilot with your teacher's class** | | | Fix her class's top complaints first |
| ⬜ 12 | AI labels and "Who wrote this?" | 2, 4, 47 | M | After receipts prove useful |
| ⬜ 13 | Classroom connection | 16, 17, 18, 21 | L | After Google approves the access |
| ⬜ 14 | Confusion summary | 26, 27 | L | Only if your teacher says she'd use it |
| ⬜ 15 | The rest of Priority 2 | 41, 43, 44, 49–51, 54–59, 61, 71, 73, 74 | L | Polish after the pilot |
| ⬜ 16 | Paid plans | 75–78 | M | Before charging |

**Steps that aren't code:** talk to your teacher (grading, Classroom, school app approval, and whether she'd want "where they got stuck"); have the privacy policy reviewed; decide about paid AI; later, a domain and an adult-owned Google Cloud project for the Classroom connection.

## Builds 9–11 (next, before the pilot)

### Build 9: assignments for every student
- **One link per assignment** (`/c/CODE/a/ID`), posted to Classroom once. The same link works for solo and group work.
- **Solo or groups,** chosen per assignment. Solo gives every student their own room.
- **Rooms made on first click,** so late joiners just work, and big classes don't create dozens of empty rooms up front.
- **One assignment page for the teacher:** a row per student (or group) with status, and a **grading queue**: Start grading → Save & next → done.
- **Work timeline** for each student: words added per session, in class or at home, and large pastes shown openly.
- **Reflection at turn in:** one short question ("What was hardest?").

### Build 10: timed assignments
- **Work windows:** e.g. "Mon–Fri, 9:10–9:55". Outside them, files are read-only with a note saying when they open again.
- **Deadlines** changeable for everyone, one group or one student.
- **Extra time:** students request it with a reason; teachers approve or decline from the dashboard.
- **Overrides:** the teacher unlocks or extends anyone without a request (absences, accommodations).
- **Grading** shows extensions and late turn-ins.

### Build 11: the teacher's path
- **Today home screen:** to grade, needs your answer (time requests, reports), heads-up (due soon, not started), or "You're all caught up."
- **Step-by-step assignment wizard:** What is it → How students work → Share. Sensible defaults; advanced options hidden.
- **First-time steps:** make a class, make an assignment and post it, grade. Shown on Today until the first grade, one button at a time.
- **Plain words and one main button per screen,** across every teacher page.

### Waiting on the pilot
- **"Where they got stuck"** for solo work (topics asked in tutor mode, shown to the student too).
- **Focus record** for timed sessions (left the page N times), shown openly.

Ask your teacher about both before building them.

---

## Build 2: contribution receipts (done)

**Goal:** every project has a receipt. Each member's share of the work, built up automatically, which the group reviews together before turning it in.

**What gets tracked:** only work inside Huddle, never what students type in other apps.
- **Docs:** words each person added and removed
- **Slides:** slides each person added or edited
- **Sheets:** cells each person filled
- **Forms and whiteboards:** questions and shapes each person added
- **Files:** who created each file
- **Chat:** message count only, never the content. The chat stays private to the group.
- **AI:** what the AI wrote into files when a student asked it to. It's credited to the student who asked and labelled as AI help. It's never a "% AI" score and never something to grade.

**How it works:**
1. **Counting on the server.** Each file's server already receives every edit, and knows which person's connection sent it.
   - It adds up each person's changes (words, cells, slides) into small totals saved with the file.
   - AI edits come through a different path, so they're labelled as AI help, along with which student asked.
2. **Room totals.** The room combines every file's totals into the receipt, plus the files each person created and their chat message count.
3. **Receipt panel** in the project, which anyone in the group can open:
   - each member's share of the work as a simple bar, and their numbers by file
   - a timeline: who worked on what, by day
   - each person's note
4. **Group review before turning in:**
   - Pressing **Turn in** first shows the receipt.
   - Each member can add one note, like "I did the research at the library" or "I led the presentation."
   - Then they confirm.
5. **"What your teacher sees" preview:** the exact receipt the teacher will get, with nothing extra. It's available at all times.
6. **Locked at turn in:** the receipt is saved as part of the submitted version, along with the files.
7. **Privacy:**
   - The group sees its own receipt at all times.
   - The teacher's copy only exists after the project is turned in.
   - The teacher never sees the chat.
8. **Export** the receipt as a PDF, for the student or the teacher.

**Done when:**
- Two students editing the same doc get the right word counts.
- AI-written text is labelled and credited to the student who asked.
- Notes appear on the receipt.
- The receipt is frozen after turning in and unfrozen when the teacher reopens.
- Unit tests cover the counting, and an e2e test runs the whole flow.

**Open question for this build:** should "share of the work" weigh different kinds of work differently? For example, is one slide worth more than 50 words? My plan is to start by showing the plain numbers per type of work, with no single overall score, and add a combined share only if teachers ask for it.

---

## Build 3: tasks, roles and templates
- **Task list in the project:** each task has an owner, a due date and a done state. Finished tasks show on the receipt.
- **Roles:** for example researcher, writer, designer, presenter. They show beside each person's name.
- **Section owners:** shown in the doc margin ("Maya: introduction"), and slide owners shown on slides ("Alex: slides 4–6"). Both are linked to tasks.
- **Templates:** research paper, presentation, science lab, survey project, debate prep. Each creates the right files, tasks and roles in one click.
- **Group-aware AI:** it knows the tasks, owners and due dates ("Maya, your introduction is due tomorrow").

## Build 4: teacher class page and grading
- **Teacher and student account types.**
- **Class page:**
  - create a class
  - get a class code; students join with it and are put into groups
  - one project assigned to every group at once
- **Teacher dashboard:** each group's progress, last activity, and turned in or not. Submitted work only, never live monitoring.
- **Grading screen:**
  - the group's work on the left
  - the receipt and student notes on the right
  - the rubric at the bottom, with one click per row
  - an optional grade per student
- **Grade export** to CSV or PDF.

## Build 5: Google sign-in and Share to Classroom
- Google sign-in as the main way in, so school accounts work.
- A **Share to Classroom** button that posts a project as an assignment.
- **Start Google's review** of Huddle's Classroom access: the paperwork, privacy policy and verification. It takes weeks, so it runs while Builds 6–8 happen.

## Build 6: safety and limits (before any students use it)
- **Age check at sign-up** (13 and up).
- **Privacy policy and terms** for students and schools. I'll draft them; have a professional review them before the pilot.
- **AI content safety** filters.
- **Report button:** a student can send a chat message or file to the teacher. This is the only way a teacher ever sees the chat.
- **Teacher controls:** remove a student, lock a project, erase a class and all its data.
- **Paid AI fallback, per-room daily limits, and a router that repairs itself,** so a class of 30 doesn't break the free AI tiers.

## Build 7: docs and slides basics
- **Docs:** images, tables, highlight, color, links, checklists, alignment, and export to PDF and Word in school-paper format.
- **Slides:** free placement (drag, resize and line up text, images and shapes) and presenter mode, where the room follows along live.

## Build 8: new landing page
- **Hero:** "Group projects where everyone gets credit."
- **Two paths,** for teachers and for students.
- **Sections:**
  - the teacher section and the student section
  - how it works in 3 steps
  - the AI settings explained
  - a teacher pilot form
  - new questions ("Is this an AI detector?" "Does my teacher read our chat?")
- **Remove** the AI provider talk.
- **Leave a spot** for the pilot quote and video.
- **Check it on a phone.**

---

## The full list with status

### 1. Contribution receipts (Priority 1)
| # | Build | Size | Status |
|---|---|---|---|
| 1 | Track who did what in every file: words, edits, slides, cells, files, tasks | L | ✅ Build 2 (tasks in Build 3) |
| 2 | Label AI help inside files (information only, no "% AI" score) | M | ⬜ Build 12 (receipts count AI help from Build 2) |
| 3 | Contribution receipt: share of the work, timeline, files touched, PDF | M | ✅ Build 2 |
| 4 | "Who wrote this?" view | M | ⬜ Build 12 |
| 5 | Group review and notes before turning in | S | ✅ Build 2 |
| 6 | "What your teacher sees" preview | S | ✅ Build 2 |
| 7 | Privacy rules: teacher sees turned-in receipts only, never the chat | S | ✅ Builds 2 and 4 |

### 2. Project rooms and AI settings (Priority 1)
| # | Build | Size | Status |
|---|---|---|---|
| 8 | Project setup: title, due date, instructions, rubric | S | ✅ Build 1 |
| 9 | Three AI settings, enforced by the server and shown to students | M | ✅ Build 1 |
| 10 | Tutor mode | M | ✅ Build 1 |
| 11 | Task list | M | ✅ Build 3 |
| 12 | Turn in: locks the files and the receipt | S | ✅ Builds 1 and 2 |
| 13 | Assignment templates | M | ✅ Build 3 |
| new | Block pasting from outside Huddle, with exceptions for accessibility | S | ✅ Build 1 |

### 3. Google Classroom
| # | Build | Size | Status |
|---|---|---|---|
| 14 | Share to Classroom button | S | ✅ Build 5 |
| 15 | Google sign-in as the main way in | S | ✅ Build 5 |
| 16 | Classroom connection: roster, assignment, turned-in status | L | ⬜ Build 13 |
| 17 | Automatic groups from the roster | M | 🟡 Random groups from the class roster (Build 4); Classroom roster in Build 13 |
| 18 | Send grades back to Classroom | M | ⬜ Build 13 |
| 19 | Google's review of Classroom access | M | 🟡 Checklist ready (docs/GOOGLE_CLASSROOM_REVIEW.md); needs your own domain and an adult-owned Google Cloud project first |
| 20 | Huddle inside Classroom (add-on) | L | ⬜ After the pilot |
| 21 | Assign, turn in and grade without Classroom | M | ⬜ Build 13 |

### 4. Teacher tools
| # | Build | Size | Status |
|---|---|---|---|
| 22 | Class page and class code | M | ✅ Build 4 |
| 23 | Teacher dashboard (submitted work only) | M | ✅ Build 4 |
| 24 | Grading screen | L | ✅ Build 4 |
| 25 | Grade export | S | ✅ Build 4 (CSV) |
| 26 | Confusion summary | L | ⬜ Build 14, only if the teacher wants it |
| 27 | "I'm still stuck, tell my teacher" button | S | ⬜ Build 14 |

### 5. Landing page
| # | Change | Size | Status |
|---|---|---|---|
| 28–38 | New landing page, top to bottom | M | ✅ Build 8 (proof spot waits for real pilot quotes) |

### 6. Docs
| # | Build | Size | Status |
|---|---|---|---|
| 39 | Images | M | ✅ Build 7 |
| 40 | Tables | M | ✅ Build 7 |
| 41 | Comments | L | ⬜ Build 15 |
| 42 | Highlight, color, links, checklists, alignment | S | ✅ Build 7 |
| 43 | Outline, word count, page count | S | ⬜ Build 15 |
| 44 | Citations | M | ⬜ Build 15 |
| 45 | Export to PDF and Word in school format | M | ✅ Build 7 |
| 46 | Section owners | S | ⬜ Build 15 (slide owners shipped in Build 7) |
| 47 | AI on selected text | M | ⬜ Build 12 |

### 7. Slides
| # | Build | Size | Status |
|---|---|---|---|
| 48 | Free placement | L | ✅ Build 7 (free-layout slides: text, images, shapes; drag, resize, snap guides) |
| 49 | More layouts and themes | M | ⬜ Build 15 |
| 50 | Images on slides | M | ⬜ Build 15 |
| 51 | Speaker notes | S | ✅ Already there |
| 52 | Presenter mode | M | ✅ Already there (present, notes, the room follows along) |
| 53 | Slide owners | S | ✅ Build 7 |
| 54 | Reorder, duplicate, sorter view | S | ⬜ Build 15 |
| 55 | Better AI decks | M | ⬜ Build 15 |
| 56 | PDF export and Google Slides check | S | 🟡 PPTX and PDF (print) work, including free-layout slides; Google Slides import not checked |

### 8. Sheets, forms and whiteboard
| # | Build | Size | Status |
|---|---|---|---|
| 57 | Sheets: sort, filter, freeze, resize, tabs | M | ⬜ Build 15 |
| 58 | Forms into sheets and charts | S | 🟡 Partly exists |
| 59 | Whiteboard basics and a brainstorm template | M | ⬜ Build 15 |

### 9. AI
| # | Build | Size | Status |
|---|---|---|---|
| 60 | Group-aware AI | M | ✅ Builds 1 and 3 (knows tasks, owners, roles; can add tasks) |
| 61 | Feedback against the rubric | M | 🟡 The AI has the rubric (Build 1); a dedicated button in Build 15 |
| 62 | Paid AI fallback and per-room limits | M | 🟡 Per-room and per-person limits exist; a paid fallback needs your OK to spend money |
| 63 | Self-repairing router | S | ✅ Build 6 (skips retired models, alerts on /admin) |

### 10. Accounts, safety and trust
| # | Build | Size | Status |
|---|---|---|---|
| 64 | Age check (13+) | S | ✅ Build 6 |
| 65 | Teacher and student accounts | S | ✅ Build 4 (teacher = owns a class; student = joined one) |
| 66 | Privacy policy and terms, plus a professional review | S | 🟡 Draft written (Build 6); needs a professional review |
| 67 | AI content safety | M | ✅ Build 6 (Llama Guard check plus school rules) |
| 68 | Report button | S | ✅ Build 6 |
| 69 | Teacher controls | S | ✅ Build 6 (remove a student; send back) |
| 70 | Erase a class and its data | S | ✅ Build 6 |

### 11. Feel and polish
| # | Build | Size | Status |
|---|---|---|---|
| 71 | Phone experience everywhere | M | ⬜ Build 15 |
| 72 | First-project walkthrough | S | ✅ Build 11 |
| 73 | In-app reminders | M | ⬜ Build 15 |
| 74 | Fast on slow Wi-Fi | S | ⬜ Build 15 |

### 12. Before you charge
| # | Build | Size | Status |
|---|---|---|---|
| 75–78 | Plans, Stripe (owned by your guardian), billing page, founding price | M | ⬜ Build 16 |
