/**
 * Removes leftover QA and test accounts, and the junk listings and enquiries
 * attached to them, so the admin user list and public storefront are clean for
 * a client demo.
 *
 * Dry run by default — it prints what it would do and changes nothing:
 *
 *   npm run cleanup:test-accounts
 *
 * Apply for real:
 *
 *   CLEANUP_APPLY=1 npm run cleanup:test-accounts
 *
 * What it never touches:
 *   - The three demo accounts from `npm run seed:demo`.
 *   - Anything created by `npm run seed:demo-data` (matched on its marker).
 *   - Any address not matched by TEST_ACCOUNT_PATTERNS below. Real-looking
 *     addresses are reported and left alone; add them to EXTRA_TEST_EMAILS
 *     explicitly if you do want them gone.
 */
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const APPLY = process.env.CLEANUP_APPLY === "1";
const DEMO_MARKER = "tt-connect-demo-dataset";

const PROTECTED_EMAILS = new Set(
  [
    process.env.DEMO_TRAVELER_EMAIL ?? "traveler.demo@tourconnectt.test",
    process.env.DEMO_OPERATOR_EMAIL ?? "operator.demo@tourconnectt.test",
    process.env.DEMO_ADMIN_EMAIL ?? "admin.demo@tourconnectt.test",
  ].map((email) => email.toLowerCase()),
);

/** Addresses that are unambiguously throwaway QA artefacts. */
const TEST_ACCOUNT_PATTERNS = [
  /@example\.com$/i,
  /\.test$/i,
  /^playwright\./i,
  /^codex\./i,
  /^ayna@test\.com$/i,
  /^aynasulaiman04@gmil\.com$/i, // typo domain
  /^aynasulaiman04@masti\.com$/i,
  /^operator@gmail\.com$/i,
  /^ttconnect\.test\./i,
];

/** Add addresses here to delete accounts the patterns above deliberately skip. */
const EXTRA_TEST_EMAILS = new Set(
  (process.env.CLEANUP_EXTRA_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

/** Listings that are QA junk regardless of who owns them. */
const JUNK_LISTING_TITLES = ["mall", "QA Moonlight Dunes Retreat"];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;

if (!supabaseUrl || !serviceRoleKey || !connectionString) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or DATABASE_URL.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const db = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await db.connect();

function isTestAccount(email) {
  const normalized = (email ?? "").toLowerCase();

  if (!normalized || PROTECTED_EMAILS.has(normalized)) {
    return false;
  }

  return EXTRA_TEST_EMAILS.has(normalized) || TEST_ACCOUNT_PATTERNS.some((pattern) => pattern.test(normalized));
}

const { data: userList, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });

if (listError) {
  throw listError;
}

const doomed = userList.users.filter((user) => isTestAccount(user.email));
const kept = userList.users.filter((user) => !isTestAccount(user.email));

console.log(`${APPLY ? "APPLYING" : "DRY RUN — nothing will change"}\n`);

console.log(`Accounts to delete (${doomed.length}):`);
doomed.forEach((user) => console.log(`  - ${user.email}`));

console.log(`\nAccounts kept (${kept.length}):`);
for (const user of kept) {
  const why = PROTECTED_EMAILS.has((user.email ?? "").toLowerCase())
    ? "demo account"
    : "not matched as a test address — review manually";
  console.log(`  - ${(user.email ?? "(no email)").padEnd(45)} ${why}`);
}

const doomedIds = doomed.map((user) => user.id);

/* ------------------------------------------------------------ junk listings */

const junkListings = await db.query(
  `select id, title, status from tour_listings where title = any($1::text[])`,
  [JUNK_LISTING_TITLES],
);

console.log(`\nJunk listings to delete (${junkListings.rows.length}):`);
junkListings.rows.forEach((row) => console.log(`  - "${row.title}" (${row.status})`));

/* ------------------------------------------------ enquiries from test users */

const junkInquiries = doomedIds.length
  ? await db.query(
      `select id, traveler_email, destination from inquiries
       where (user_id = any($1::uuid[]) or lower(traveler_email) = any($2::text[]))
         and (submission_fingerprint is null or submission_fingerprint not like $3)`,
      [doomedIds, doomed.map((user) => (user.email ?? "").toLowerCase()), `${DEMO_MARKER}%`],
    )
  : { rows: [] };

console.log(`\nEnquiries from test accounts to delete (${junkInquiries.rows.length}):`);
junkInquiries.rows.forEach((row) => console.log(`  - ${row.traveler_email} → ${row.destination}`));

/* ------------------------------------------------------- orphaned records */

// Listings with no owner cannot be edited or moderated by anybody, and the
// seeded originals point at destinations outside Trinidad and Tobago.
const orphanListings = await db.query(
  `select id, title, location, status from tour_listings
   where operator_id is null and (summary is null or summary not like $1)`,
  [`%${DEMO_MARKER}%`],
);

console.log(`\nOwnerless listings to delete (${orphanListings.rows.length}):`);
orphanListings.rows.forEach((row) => console.log(`  - "${row.title}" — ${row.location} (${row.status})`));

// Enquiries with neither a traveller nor an operator are unreachable from every
// portal, so nobody can action or close them.
const orphanInquiries = await db.query(
  `select id, traveler_email, destination from inquiries
   where user_id is null and operator_id is null
     and (submission_fingerprint is null or submission_fingerprint not like $1)`,
  [`${DEMO_MARKER}%`],
);

console.log(`\nUnreachable enquiries to delete (${orphanInquiries.rows.length}):`);
orphanInquiries.rows.forEach((row) => console.log(`  - ${row.traveler_email} → ${row.destination}`));

const orphanChats = await db.query(
  `select count(*)::int as n from concierge_conversations
   where user_id is not null and user_id not in (select id from profiles)`,
);

console.log(`\nOrphaned concierge conversations already present: ${orphanChats.rows[0].n}`);

if (!APPLY) {
  console.log("\nRe-run with CLEANUP_APPLY=1 to apply.");
  await db.end();
  process.exit(0);
}

/* ------------------------------------------------------------------- apply */

if (junkListings.rows.length) {
  const ids = junkListings.rows.map((row) => row.id);
  // Enquiries reference listings; clear the pointer before removing the row.
  await db.query(`update inquiries set listing_id = null where listing_id = any($1::uuid[])`, [ids]);
  const { rowCount } = await db.query(`delete from tour_listings where id = any($1::uuid[])`, [ids]);
  console.log(`\ndeleted ${rowCount} junk listing(s)`);
}

if (junkInquiries.rows.length) {
  const ids = junkInquiries.rows.map((row) => row.id);
  await db.query(`delete from wipay_payments where inquiry_id = any($1::uuid[])`, [ids]);
  await db.query(`delete from traveler_operator_conversations where inquiry_id = any($1::uuid[])`, [ids]);
  const { rowCount } = await db.query(`delete from inquiries where id = any($1::uuid[])`, [ids]);
  console.log(`deleted ${rowCount} junk enquiry/enquiries`);
}

let deletedUsers = 0;

for (const user of doomed) {
  // concierge_conversations has no foreign key to profiles, so its rows would
  // survive the auth delete as orphans.
  const chats = await db.query(`select id from concierge_conversations where user_id = $1`, [user.id]);

  if (chats.rows.length) {
    const chatIds = chats.rows.map((row) => row.id);
    await db.query(`delete from concierge_messages where conversation_id = any($1::uuid[])`, [chatIds]);
    await db.query(`delete from concierge_conversations where id = any($1::uuid[])`, [chatIds]);
  }

  // Same for inquiries.user_id.
  await db.query(`update inquiries set user_id = null where user_id = $1`, [user.id]);

  const { error } = await admin.auth.admin.deleteUser(user.id);

  if (error) {
    console.error(`  failed to delete ${user.email}: ${error.message}`);
    continue;
  }

  deletedUsers += 1;
}

console.log(`deleted ${deletedUsers} auth account(s)`);

// Orphans are swept after the account deletions, because those deletions null
// out operator_id and user_id via ON DELETE SET NULL and so create more.
const sweptInquiries = await db.query(
  `delete from inquiries
   where user_id is null and operator_id is null
     and (submission_fingerprint is null or submission_fingerprint not like $1)`,
  [`${DEMO_MARKER}%`],
);
console.log(`deleted ${sweptInquiries.rowCount} unreachable enquiry/enquiries`);

const ownerlessListings = await db.query(
  `select id from tour_listings
   where operator_id is null and (summary is null or summary not like $1)`,
  [`%${DEMO_MARKER}%`],
);

if (ownerlessListings.rows.length) {
  const ids = ownerlessListings.rows.map((row) => row.id);
  await db.query(`update inquiries set listing_id = null where listing_id = any($1::uuid[])`, [ids]);
  await db.query(`delete from reviews where listing_id = any($1::uuid[])`, [ids]);
  const { rowCount } = await db.query(`delete from tour_listings where id = any($1::uuid[])`, [ids]);
  console.log(`deleted ${rowCount} ownerless listing(s)`);
}

// Sweep any concierge rows orphaned by earlier manual deletions.
const sweptChats = await db.query(
  `delete from concierge_messages where conversation_id in (
     select id from concierge_conversations
     where user_id is not null and user_id not in (select id from profiles)
   )`,
);
const sweptConvs = await db.query(
  `delete from concierge_conversations
   where user_id is not null and user_id not in (select id from profiles)`,
);
console.log(`swept ${sweptConvs.rowCount} orphaned concierge conversation(s), ${sweptChats.rowCount} message(s)`);

const remaining = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
console.log(`\nRemaining accounts: ${remaining.data.users.length}`);
remaining.data.users.forEach((user) => console.log(`  - ${user.email}`));

await db.end();
