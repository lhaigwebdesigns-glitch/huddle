import { Link } from "react-router-dom";

const UPDATED = "November 21, 2026";

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
        <Link to="/" className="text-sm text-fg hover:underline ">
          ← Huddle
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-zinc-900 dark:text-white">{title}</h1>
        <p className="mt-1 text-sm text-zinc-500">Last updated {UPDATED}</p>
        <div className="mt-8 space-y-6 leading-relaxed [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-900 dark:[&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
          {children}
        </div>
        <p className="mt-12 text-sm text-zinc-500">
          <Link to="/privacy" className="hover:underline">Privacy</Link> · <Link to="/terms" className="hover:underline">Terms</Link>
        </p>
      </div>
    </div>
  );
}

/** Shown until a professional has reviewed these pages for use with schools. */
function DraftNote() {
  return (
    <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200" data-testid="legal-draft">
      <b>Draft.</b> This page is being reviewed by a professional before Huddle is used with schools. It describes how Huddle works today.
    </p>
  );
}

export function Privacy() {
  return (
    <Page title="Privacy Policy">
      <DraftNote />
      <p>Huddle is a shared AI workspace for groups, including school group projects. This page explains what it stores, why, and who can see it. Huddle is for people aged 13 and up.</p>
      <section>
        <h2>What we store</h2>
        <ul>
          <li><b>Room content:</b> messages, files (docs, sheets, slides, whiteboards, forms, mini-apps), uploads, tasks and room memory, so everyone in the room sees the same thing.</li>
          <li><b>Your display name</b> as you type it when joining a room or class.</li>
          <li><b>If you sign in with Google or GitHub:</b> your name, email address and profile picture from that account, and the rooms you've joined. We never receive your password.</li>
          <li><b>For school projects:</b> who wrote what in the project's files (to build the contribution receipt), who turned it in, task lists, notes students add to their receipt, and grades the teacher gives.</li>
          <li><b>Your IP address</b>, briefly, to limit abuse (for example how many rooms one address can create per hour).</li>
          <li><b>Feedback</b> you send, and daily counts of AI usage (no message content).</li>
        </ul>
      </section>
      <section>
        <h2>School projects: who sees what</h2>
        <ul>
          <li><b>The group</b> sees its own chat, files, tasks and contribution receipt.</li>
          <li><b>The teacher</b> sees each group's progress as numbers (tasks done, last activity, turned in or not). After a group turns its project in, the teacher sees the turned-in files and the contribution receipt.</li>
          <li><b>The teacher never sees the group's chat.</b> The only exception is a message a student chooses to report to the teacher; then the teacher sees that one message.</li>
          <li>The contribution receipt counts what each person has in the files and how many chat messages they sent. It never includes what the messages said, and it isn't an AI detector.</li>
        </ul>
      </section>
      <section>
        <h2>AI and safety</h2>
        <ul>
          <li>When someone asks the AI something, the recent conversation and the files it needs are sent to an AI provider to write the reply.</li>
          <li>In school projects, each student message is checked by a safety model before the AI answers, so the AI stays appropriate for school. The check only decides whether a message is safe; it isn't stored.</li>
          <li>Huddle doesn't use your content to train AI models. Some of the free AI providers Huddle uses may keep requests under their own terms; before Huddle is used with schools, we'll limit school projects to providers that don't.</li>
        </ul>
      </section>
      <section>
        <h2>Who processes it</h2>
        <ul>
          <li><b>Cloudflare</b> hosts Huddle and stores the data above.</li>
          <li><b>AI providers</b> (such as Groq, NVIDIA, OpenRouter and Cloudflare Workers AI) receive the conversation and file contents needed to write a reply.</li>
          <li><b>Search providers</b> (such as Tavily) receive the search terms when the AI searches the web.</li>
          <li><b>Google or GitHub</b>, only if you choose to sign in with them.</li>
          <li><b>Google Classroom</b>, only when a teacher uses "Share to Classroom", which opens Classroom with a link. Huddle doesn't read Classroom data today.</li>
        </ul>
        <p className="mt-2">We don't sell your data, show ads, or use it for anything other than running Huddle.</p>
      </section>
      <section>
        <h2>Ages</h2>
        <p>Huddle is for people aged 13 and up. Everyone confirms this before joining a room or class. If you believe someone under 13 has used Huddle, tell us with <b>Send feedback</b> and we'll delete their data.</p>
      </section>
      <section>
        <h2>Who can see a room</h2>
        <p>Anyone with a room's code or invite link can join it. A room's host can lock a room, remove people, and create a read-only share link. Don't put anything in a room you wouldn't share with the people who have its code.</p>
      </section>
      <section>
        <h2>Cookies</h2>
        <p>If you sign in, one cookie keeps you signed in. Huddle also remembers your name and settings in your browser. There are no tracking or advertising cookies.</p>
      </section>
      <section>
        <h2>Deleting your data</h2>
        <ul>
          <li>Files can be deleted from inside a room, and a room's host can delete the whole room.</li>
          <li>A teacher can erase a whole class in one step: every group room, its chats, files and uploads, the roster and the grades.</li>
          <li>To delete your account, use <b>Send feedback</b> in any room and we'll remove it.</li>
        </ul>
      </section>
      <section>
        <h2>Changes</h2>
        <p>If this policy changes, we'll update this page and the date above.</p>
      </section>
    </Page>
  );
}

export function Terms() {
  return (
    <Page title="Terms of Use">
      <DraftNote />
      <p>By using Huddle you agree to these terms. Huddle is for people aged 13 and up.</p>
      <section>
        <h2>Using Huddle</h2>
        <ul>
          <li>Don't use Huddle for anything illegal, to harass or bully people, or to share content you don't have the right to share.</li>
          <li>Don't try to break, overload or get around the limits of the service, including the AI and paste rules a teacher sets for a project.</li>
          <li>You're responsible for what you post in a room and for who you give its code to.</li>
        </ul>
      </section>
      <section>
        <h2>School projects</h2>
        <ul>
          <li>Teachers choose a project's AI rules (off, tutor only, or full help). Follow your teacher's rules and your school's policies about AI.</li>
          <li>The contribution receipt shows what each person added to the files. It's there to make group grades fair. It doesn't judge whether work was done honestly, and it isn't an AI detector.</li>
          <li>Use <b>Report to teacher</b> if someone in your group posts something hurtful or unsafe.</li>
        </ul>
      </section>
      <section>
        <h2>AI answers</h2>
        <p>AI replies can be wrong. Check anything important, especially facts, numbers, code, and medical, legal or financial information, before relying on it. If you're going through something hard, please talk to a trusted adult; in the US you can call or text 988 any time.</p>
      </section>
      <section>
        <h2>Your content</h2>
        <p>You keep ownership of what you create. You let Huddle store and process it so the service works for you and the people in your rooms.</p>
      </section>
      <section>
        <h2>No guarantees</h2>
        <p>Huddle is a free service provided "as is". It may change, have downtime, or lose data, so keep your own copies of anything important (every file can be downloaded). Free AI allowances are shared and may run out for the day.</p>
      </section>
      <section>
        <h2>Ending access</h2>
        <p>We may remove content or block access that breaks these terms.</p>
      </section>
    </Page>
  );
}
