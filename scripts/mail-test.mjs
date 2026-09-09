/**
 * Sends one real test email using the configured SMTP settings.
 *
 *   npm run mail:test                  # uses .env.production.local, else .env.local
 *   npm run mail:test -- you@example.com
 *
 * Run this before deploying. It proves the Gmail App Password works and that
 * mail actually leaves the account, which is much easier to diagnose here than
 * from a failed signup on the live site.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import nodemailer from "nodemailer";
import { config as loadEnv } from "dotenv";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// Prefer the production file, so this tests exactly what Vercel will use.
const envFile = [".env.production.local", ".env.local", ".env"]
  .map((name) => join(projectRoot, name))
  .find((path) => existsSync(path));

if (envFile) {
  loadEnv({ path: envFile, quiet: true });
  console.log(`Using ${envFile.replace(projectRoot, ".")}\n`);
}

const host = process.env.SMTP_HOST?.trim();
const port = Number(process.env.SMTP_PORT ?? 465);
const secure = String(process.env.SMTP_SECURE ?? "true").toLowerCase() !== "false";
const user = process.env.SMTP_USER?.trim();
const pass = (process.env.SMTP_PASS || process.env.SMTP_APP_PASSWORD || "").trim();
const from = process.env.SMTP_FROM?.trim() || user;
const to = process.argv[2]?.trim() || user;

function fail(message, hint) {
  console.error(`\n  ${message}`);
  if (hint) console.error(`  ${hint}`);
  console.error("");
  process.exit(1);
}

if (!host || !user || !pass) {
  fail(
    "SMTP is not fully configured.",
    `Missing: ${[!host && "SMTP_HOST", !user && "SMTP_USER", !pass && "SMTP_PASS"].filter(Boolean).join(", ")}`,
  );
}

if (pass.includes("PASTE_")) {
  fail(
    "SMTP_PASS is still the placeholder.",
    "Generate an App Password at myaccount.google.com/apppasswords and paste it in.",
  );
}

// Gmail App Passwords are 16 characters; they are often copied with spaces.
if (host.includes("gmail") && pass.replace(/\s/g, "").length !== 16) {
  console.warn(
    `  Warning: SMTP_PASS is ${pass.length} characters. A Gmail App Password is 16.\n` +
      "  Your normal Gmail login password will not work here.\n",
  );
}

console.log(`  host   ${host}:${port} (secure: ${secure})`);
console.log(`  auth   ${user}`);
console.log(`  from   ${from}`);
console.log(`  to     ${to}\n`);

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  // Gmail rejects spaces in the App Password.
  auth: { user, pass: pass.replace(/\s/g, "") },
});

try {
  await transporter.verify();
  console.log("  Connection and credentials accepted.");
} catch (error) {
  const message = String(error?.message ?? error);
  let hint = "";

  if (/invalid login|username and password not accepted|535/i.test(message)) {
    hint =
      "Gmail rejected the credentials. Use a 16-character App Password, not the\n" +
      "  account password, and make sure 2-Step Verification is on for this account.";
  } else if (/timeout|ETIMEDOUT|ECONNREFUSED/i.test(message)) {
    hint = "Could not reach the server. Check SMTP_HOST/SMTP_PORT, or a firewall.";
  }

  fail(`Could not connect: ${message}`, hint);
}

try {
  const info = await transporter.sendMail({
    from,
    to,
    subject: "Tour ConnecTT — SMTP test",
    text:
      "This is a test from the Tour ConnecTT mail configuration.\n\n" +
      `Sent as: ${from}\nServer: ${host}:${port}\n\n` +
      "If you are reading this, outbound email works.",
  });

  console.log(`  Sent. Message id: ${info.messageId}`);
  console.log(`\n  Check the inbox for ${to} (look in spam too).\n`);
} catch (error) {
  fail(`Sent failed: ${String(error?.message ?? error)}`);
}
