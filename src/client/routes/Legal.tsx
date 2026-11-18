import { Link } from "react-router-dom";

const UPDATED = "November 18, 2026";

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
        <Link to="/" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
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

export function Privacy() {
  return (
    <Page title="Privacy Policy">
      <p>Huddle is a shared AI workspace. This page explains what it stores, why, and who else sees it.</p>
      <section>
        <h2>What we store</h2>
        <ul>
          <li><b>Room content:</b> messages, files (docs, sheets, slides, whiteboards, forms, mini-apps), uploads and room memory, so everyone in the room sees the same thing.</li>
          <li><b>Your display name</b> as you type it when joining a room.</li>
          <li><b>If you sign in with GitHub or Google:</b> your name, email address and profile picture from that account, and the list of rooms you've joined, so they show under "My rooms". We never receive your password.</li>
          <li><b>Your IP address</b>, briefly, to limit abuse (for example how many rooms one address can create per hour).</li>
          <li><b>Feedback</b> you send, and daily counts of AI usage (no message content).</li>
        </ul>
      </section>
      <section>
        <h2>Who processes it</h2>
        <ul>
          <li><b>Cloudflare</b> hosts Huddle and stores the data above.</li>
          <li><b>AI providers</b> (such as Groq and Cloudflare Workers AI) receive the recent conversation and file contents when someone asks the AI something, to generate the reply.</li>
          <li><b>Search providers</b> (such as Tavily) receive the search terms when the AI searches the web.</li>
          <li><b>GitHub or Google</b>, only if you choose to sign in with them.</li>
        </ul>
        <p className="mt-2">We don't sell your data, show ads, or use it for anything other than running Huddle.</p>
      </section>
      <section>
        <h2>Who can see a room</h2>
        <p>Anyone with a room's party code or invite link can join it and see its chat and files. A room's host can also create a read-only share link. Don't put anything in a room you wouldn't share with the people who have its code.</p>
      </section>
      <section>
        <h2>Cookies</h2>
        <p>If you sign in, one cookie keeps you signed in. Huddle also remembers your name and settings in your browser. There are no tracking or advertising cookies.</p>
      </section>
      <section>
        <h2>Deleting your data</h2>
        <p>Files can be deleted from inside a room. To delete your account or a whole room, use <b>Send feedback</b> in any room and we'll remove it.</p>
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
      <p>By using Huddle you agree to these terms.</p>
      <section>
        <h2>Using Huddle</h2>
        <ul>
          <li>Don't use Huddle for anything illegal, to harass people, or to share content you don't have the right to share.</li>
          <li>Don't try to break, overload or get around the limits of the service.</li>
          <li>You're responsible for what you post in a room and for who you give its code to.</li>
        </ul>
      </section>
      <section>
        <h2>AI answers</h2>
        <p>AI replies can be wrong. Check anything important, especially facts, numbers, code, and medical, legal or financial information, before relying on it.</p>
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
