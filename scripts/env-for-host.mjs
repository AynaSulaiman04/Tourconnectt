/**
 * Prints the production environment, derived from .env.local.
 *
 *   npm run env:render                                   # print, ready to paste
 *   npm run env:render -- --url=https://x.onrender.com   # before DNS is cut over
 *   npm run env:render -- --write                        # also save to a file
 *   npm run env:vercel                                   # same, Vercel wording
 *
 * There is deliberately no second env file kept on disk. .env.local is the one
 * source of truth; this applies the handful of values that differ in
 * production and prints the result, so the two can never drift apart.
 *
 * The URL matters: it builds every link that leaves the app — email links and
 * the WiPay return URL — so while the site is still on a temporary
 * *.onrender.com address, pass --url to match. Change it, and the Google
 * redirect URI in the Google Cloud console, once the domain is cut over.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(projectRoot, ".env.local");
const write = process.argv.includes("--write");

const host = process.argv.includes("--host=vercel") ? "vercel" : "render";
const urlArgument = process.argv.find((argument) => argument.startsWith("--url="));
const DOMAIN = (urlArgument?.slice("--url=".length) ?? "https://tourconnectt.com").replace(/\/$/, "");

/**
 * Render generates these itself when render.yaml is applied, so pasting the
 * local values over them would replace a strong secret with a laptop one.
 */
const RENDER_GENERATES = new Set([
  "CRON_SECRET",
  "ICAL_FEED_SECRET",
  "GOOGLE_OAUTH_STATE_SECRET",
  "INQUIRY_RATE_LIMIT_SECRET",
  "CONCIERGE_IP_SALT",
]);

/** The only values that differ between a laptop and the live site. */
const PRODUCTION_OVERRIDES = {
  NEXT_PUBLIC_APP_URL: DOMAIN,
  GOOGLE_REDIRECT_URI: `${DOMAIN}/api/google/calendar/callback`,
};

/** Read by local scripts only; Vercel has no use for them. */
const LOCAL_ONLY = new Set([
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "ADMIN_FULL_NAME",
  "DEMO_ADMIN_EMAIL",
  "DEMO_ADMIN_NAME",
  "DEMO_OPERATOR_EMAIL",
  "DEMO_OPERATOR_NAME",
  "DEMO_TRAVELER_EMAIL",
  "DEMO_TRAVELER_NAME",
  "DEMO_ACCOUNT_PASSWORD",
  "DEMO_DEMOTE_LEGACY_LISTINGS",
  "CLEANUP_APPLY",
  "CLEANUP_EXTRA_EMAILS",
]);

/** Blank here means the live site loses a feature, so say which. */
const REQUIRED = {
  NEXT_PUBLIC_SUPABASE_URL: "the site cannot reach the database",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "the site cannot reach the database",
  SUPABASE_SERVICE_ROLE_KEY: "server-side data access fails",
  NEXT_PUBLIC_APP_URL: "email and payment links point at the wrong place",
  SMTP_HOST: "no email is sent",
  SMTP_USER: "no email is sent",
  SMTP_PASS: "no email is sent — needs a Gmail App Password",
  SMTP_FROM: "no email is sent",
  CRON_SECRET: "reminders and review requests never send",
  WIPAY_ACCOUNT_NUMBER: "payments cannot be taken",
  WIPAY_API_KEY: "payments cannot be taken",
  WIPAY_WEBHOOK_SECRET: "payments complete but bookings are never marked paid",
};

if (!existsSync(sourcePath)) {
  console.error("\n  .env.local not found. Copy .env.example to .env.local first.\n");
  process.exit(1);
}

const lines = readFileSync(sourcePath, "utf8").split(/\r?\n/);
const output = [];
const seen = new Map();

for (const line of lines) {
  const match = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)$/);

  if (!match) {
    continue;
  }

  const [, key, rawValue] = match;

  if (LOCAL_ONLY.has(key)) {
    continue;
  }

  if (host === "render" && RENDER_GENERATES.has(key)) {
    seen.set(key, "generated-by-render");
    continue;
  }

  const value = key in PRODUCTION_OVERRIDES ? PRODUCTION_OVERRIDES[key] : rawValue.trim();
  seen.set(key, value.replace(/^["']|["']$/g, ""));
  output.push(`${key}=${value}`);
}

const body = `${output.join("\n")}\n`;

console.log("\n─────────── copy from here ───────────\n");
console.log(body.trimEnd());
console.log("\n─────────── copy to here ───────────\n");

const blanks = Object.keys(REQUIRED).filter((key) => !seen.get(key));

if (blanks.length > 0) {
  console.log("  These are blank. Fill them in .env.local, then run this again:\n");
  for (const key of blanks) console.log(`    ${key.padEnd(24)} ${REQUIRED[key]}`);
  console.log("");
}

const sandbox = seen.get("WIPAY_ENVIRONMENT");
if (sandbox && sandbox !== "live") {
  console.log(`  WIPAY_ENVIRONMENT is "${sandbox}" — no real payments will be taken.\n`);
}

console.log(`  ${output.length} variables. Overridden for production:`);
for (const [key, value] of Object.entries(PRODUCTION_OVERRIDES)) console.log(`    ${key}=${value}`);

if (host === "render") {
  console.log(`\n  Render → the tourconnectt service → Environment → Add from .env → paste.`);
  console.log("  Omits the five secrets render.yaml generates; leave those as Render made them.");
  console.log("  Saving triggers a redeploy on its own.\n");
} else {
  console.log("\n  Vercel → Settings → Environment Variables → Import .env → Production.");
  console.log("  Redeploy afterwards; env changes do not reach an existing deployment.\n");
}

if (write) {
  const target = join(projectRoot, `.env.${host}.txt`);
  writeFileSync(target, body);
  console.log(`  Also written to .env.${host}.txt (git-ignored). Delete it once pasted.\n`);
}
