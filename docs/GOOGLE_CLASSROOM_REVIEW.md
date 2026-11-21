# Getting Google to approve Huddle's Classroom access

Last updated Nov 21, 2026. Google changes these steps often, so check each one against Google's current pages before you start. The items marked **(verify)** come from what I know, not from a page I opened today.

## What works today, with no approval
**Share to Classroom** (Build 5) uses Google's public share link (`classroom.google.com/share`). A teacher clicks it, Classroom opens, and they post the class link as an assignment or announcement. Huddle never touches the teacher's Google data, so Google doesn't need to review anything.

## What needs Google's approval
**The Classroom connection (Build 10)** reads the class roster, posts the assignment with its due date, marks it turned in, and sends grades back. To do that, Huddle must call the Google Classroom API with the teacher's permission. The permissions it would ask for (**verify** the exact names):

| What Huddle does | Permission (scope) |
|---|---|
| List the teacher's classes | `classroom.courses.readonly` |
| Import the roster (names and emails) | `classroom.rosters.readonly`, `classroom.profile.emails` |
| Post the assignment, mark turned in, send grades | `classroom.coursework.students` |

Google treats these as **sensitive** permissions. Until Google verifies the app:
- only test users you list can use it
- everyone else sees an "unverified app" warning

## Before you can even apply

1. **Your own domain (blocker).**
   - Google verifies apps on a domain you own and can prove you control. `huddle-chat.workers.dev` belongs to Cloudflare, so it can't be used.
   - Buy a domain (about $10–15 a year) and point it at the Worker in Cloudflare.
   - This also unblocks email sign-in, which was waiting on a domain.
2. **An adult owns the Google Cloud project.**
   - Google's API terms are a contract.
   - Like Stripe, this should be a parent or guardian's account, or a company they own. Ask them before you create anything.
3. **A privacy policy for students and schools,** on your domain. It must say exactly what Huddle does with Google data:
   - read the roster
   - post assignments
   - send grades
   - never sell it, never use it for ads, never use it to train AI

   It also has to include Google's "Limited Use" statement **(verify the wording on Google's API Services User Data Policy page)**. Build 6 drafts this policy; have a professional review it.
4. **A home page and terms of service** on the same domain. Build 8's new landing page covers the home page.

## The application (Google Cloud Console)
- [ ] Create a Google Cloud project, owned by the adult account.
- [ ] Turn on the **Google Classroom API**.
- [ ] Set up the **OAuth consent screen:**
  - app name "Huddle", a logo, and a support email
  - your domain as an authorized domain, plus the home page, privacy policy and terms links
- [ ] Add the scopes above, and only those. Each extra scope makes review harder.
- [ ] Add yourself and your pilot teacher as **test users**, so you can build and test before approval.
- [ ] Record a **demo video,** a short unlisted YouTube link **(verify the requirements)** that shows:
  - signing in with Google and the consent screen
  - each permission being used (importing a roster, posting an assignment, sending a grade)
- [ ] Explain why each scope is needed, in plain words. Use the table above.
- [ ] Submit for verification and answer Google's emails quickly. Reviews usually take **several weeks** **(verify current times)**.

## After approval: what schools still need
- **School IT approval.** Many school districts block third-party apps on student Google accounts until their admin allows them. Your teacher's first question to IT is: "How do I get an app approved for our Google accounts?"
- **Student data agreements.** In New York, a company handling student data for a school usually signs a data privacy agreement under Education Law 2-d. Get professional advice before any school or district deal.
- **Huddle inside Classroom (add-on, later).** This needs a separate Google Workspace Marketplace listing and review. Schools may also need a particular Google Workspace for Education edition to use add-ons **(verify)**.

## Suggested order
1. Talk to your parent or guardian: who owns the Google Cloud project and Stripe.
2. Buy the domain and point it at Huddle.
3. Build 6 (privacy policy draft and safety) and Build 8 (landing page).
4. Have the policy reviewed, then submit the Google application.
5. Meanwhile, the pilot runs on Share to Classroom, which needs no approval.
