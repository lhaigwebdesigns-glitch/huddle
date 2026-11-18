#!/usr/bin/env node
// One-time Cloudflare setup for deploying Huddle on the free plan.
//   1. npx wrangler login          (opens your browser; you approve it)
//   2. npm run setup:cloudflare     (this script)
//   3. npm run deploy
// It creates the D1 database and R2 bucket, writes the database id into wrangler.jsonc,
// and uploads the secrets you already have in .dev.vars (it never prints their values).
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const run = (cmd) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const step = (msg) => console.log(`\n▶ ${msg}`);

step("Checking you're logged in to Cloudflare");
try {
  const who = run("npx wrangler whoami");
  if (/not authenticated/i.test(who)) throw new Error();
  console.log("  ✓ logged in");
} catch {
  console.error("  ✗ Not logged in. Run `npx wrangler login` first, then run this again.");
  process.exit(1);
}

step("D1 database (feedback, rate limits, accounts, usage)");
let config = readFileSync("wrangler.jsonc", "utf8");
if (/"database_id":\s*"0{8}-/.test(config)) {
  let out = "";
  try {
    out = run("npx wrangler d1 create huddle");
  } catch (e) {
    out = String(e.stdout ?? "") + String(e.stderr ?? "");
    if (/already exists/i.test(out)) out = run("npx wrangler d1 info huddle --json");
  }
  const id = /"?(?:database_id|uuid)"?\s*[:=]\s*"([0-9a-f-]{36})"/i.exec(out)?.[1];
  if (!id) {
    console.error("  ✗ Couldn't read the database id. Output was:\n" + out);
    process.exit(1);
  }
  config = config.replace(/"database_id":\s*"0{8}-0{4}-0{4}-0{4}-0{12}"/, `"database_id": "${id}"`);
  writeFileSync("wrangler.jsonc", config);
  console.log(`  ✓ database ${id} saved in wrangler.jsonc (commit this change)`);
} else console.log("  ✓ already set in wrangler.jsonc");

step("R2 bucket for uploads and images");
try {
  run("npx wrangler r2 bucket create huddle-files");
  console.log("  ✓ created huddle-files");
} catch (e) {
  const msg = String(e.stderr ?? e.stdout ?? e);
  if (/already exists/i.test(msg)) console.log("  ✓ already exists");
  else console.log("  ! Couldn't create it. Enable R2 in the Cloudflare dashboard (free), then rerun. Uploads stay off until then.\n    " + msg.split("\n")[0]);
}

step("Secrets from .dev.vars");
const SECRET_KEYS = [
  "GROQ_API_KEY", "CEREBRAS_API_KEY", "OPENROUTER_API_KEY", "TAVILY_API_KEY", "JINA_API_KEY", "ADMIN_TOKEN",
  "OLLAMA_BASE_URL", "OLLAMA_API_KEY", "AUTH_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
];
if (!existsSync(".dev.vars")) console.log("  (no .dev.vars found; skipping)");
else {
  const vars = Object.fromEntries(
    readFileSync(".dev.vars", "utf8")
      .split(/\r?\n/)
      .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()))
      .filter(Boolean)
      .map((m) => [m[1], m[2].trim()]),
  );
  for (const k of SECRET_KEYS) {
    const v = vars[k];
    if (!v) continue;
    if (k === "OLLAMA_BASE_URL" && /127\.0\.0\.1|localhost/.test(v)) {
      console.log(`  - skipped ${k} (a local address can't be reached from Cloudflare; use a tunnel URL)`);
      continue;
    }
    const r = spawnSync("npx", ["wrangler", "secret", "put", k], { input: v, encoding: "utf8", shell: true });
    console.log(r.status === 0 ? `  ✓ ${k}` : `  ✗ ${k}: ${(r.stderr || "").split("\n")[0]}`);
  }
}

console.log("\nDone. Next: `npm run deploy`. Your site will be at https://huddle.<your-subdomain>.workers.dev");
