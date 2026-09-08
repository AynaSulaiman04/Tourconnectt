/**
 * Applies the SQL files in supabase/migrations to the database, in filename
 * order, exactly once each.
 *
 * Which migrations have run is recorded in public.schema_migrations, so this is
 * safe to run on every deploy: already-applied files are skipped. Each file is
 * applied inside a transaction together with its ledger row, so a failure
 * leaves the database untouched rather than half-migrated.
 *
 *   node scripts/db-migrate.mjs status     what is applied, what is pending
 *   node scripts/db-migrate.mjs up         apply everything pending
 *   node scripts/db-migrate.mjs baseline   record all files as applied, run none
 *
 * `baseline` exists for a database that predates this script and is already up
 * to date. Several early migrations INSERT seed rows, so replaying them would
 * duplicate data -- `up` therefore refuses to run against a populated database
 * with an empty ledger, and tells you to baseline first.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config as loadEnv } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, "..");
const migrationsDir = join(projectRoot, "supabase", "migrations");

// .env.local wins, matching how Next.js resolves them locally. In CI the real
// environment is already populated and these files simply will not exist.
loadEnv({ path: join(projectRoot, ".env.local"), quiet: true });
loadEnv({ path: join(projectRoot, ".env"), quiet: true });

const LEDGER = `
  create table if not exists public.schema_migrations (
    version     text primary key,
    checksum    text not null,
    applied_at  timestamptz not null default timezone('utc', now())
  );
`;

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

/** Prefer the direct (non-pooled) connection: DDL should not go through a pooler. */
function connectionString() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

  if (!url) {
    fail("Set DIRECT_URL or DATABASE_URL (Supabase → Project Settings → Database).");
  }

  return url;
}

function readMigrations() {
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  return files.map((name) => {
    const sql = readFileSync(join(migrationsDir, name), "utf8");
    return {
      version: name,
      sql,
      checksum: createHash("sha256").update(sql).digest("hex").slice(0, 16),
    };
  });
}

async function loadLedger(client) {
  await client.query(LEDGER);
  const { rows } = await client.query(
    "select version, checksum from public.schema_migrations",
  );
  return new Map(rows.map((row) => [row.version, row.checksum]));
}

/**
 * True when the database already has application tables. Used to decide whether
 * an empty ledger means "brand new database" or "existing database that has
 * never been baselined".
 */
async function hasExistingSchema(client) {
  const { rows } = await client.query(
    `select 1
       from information_schema.tables
      where table_schema = 'public'
        and table_name <> 'schema_migrations'
      limit 1`,
  );
  return rows.length > 0;
}

function reportDrift(migrations, applied) {
  const changed = migrations.filter(
    (m) => applied.has(m.version) && applied.get(m.version) !== m.checksum,
  );

  for (const m of changed) {
    console.warn(`  ! ${m.version} was edited after it was applied`);
  }

  if (changed.length > 0) {
    console.warn(
      "    Editing an applied migration does not re-run it. Add a new migration instead.\n",
    );
  }
}

async function status(client) {
  const migrations = readMigrations();
  const applied = await loadLedger(client);
  const pending = migrations.filter((m) => !applied.has(m.version));

  console.log(`\n  ${migrations.length} migration files, ${applied.size} applied\n`);
  reportDrift(migrations, applied);

  if (pending.length === 0) {
    console.log("  Up to date.\n");
    return;
  }

  console.log(`  ${pending.length} pending:`);
  for (const m of pending) console.log(`    - ${m.version}`);
  console.log();
}

async function up(client) {
  const migrations = readMigrations();
  const applied = await loadLedger(client);
  reportDrift(migrations, applied);

  if (applied.size === 0 && (await hasExistingSchema(client))) {
    fail(
      "This database already has tables but no migration ledger.\n" +
        "  Several early migrations insert seed rows, so replaying them would duplicate data.\n" +
        "  If the schema is already current, run:  npm run db:baseline",
    );
  }

  const pending = migrations.filter((m) => !applied.has(m.version));

  if (pending.length === 0) {
    console.log("\n  Up to date, nothing to apply.\n");
    return;
  }

  console.log(`\n  Applying ${pending.length} migration(s)\n`);

  for (const m of pending) {
    process.stdout.write(`  ${m.version} ... `);
    try {
      // The migration and its ledger row commit together, so the ledger can
      // never claim a migration that did not fully apply.
      await client.query("begin");
      await client.query(m.sql);
      await client.query(
        "insert into public.schema_migrations (version, checksum) values ($1, $2)",
        [m.version, m.checksum],
      );
      await client.query("commit");
      console.log("ok");
    } catch (error) {
      await client.query("rollback").catch(() => {});
      console.log("FAILED");
      fail(`${m.version} failed and was rolled back:\n  ${error.message}`);
    }
  }

  console.log("\n  Done.\n");
}

async function baseline(client) {
  const migrations = readMigrations();
  const applied = await loadLedger(client);
  const missing = migrations.filter((m) => !applied.has(m.version));

  if (missing.length === 0) {
    console.log("\n  Every migration is already recorded.\n");
    return;
  }

  for (const m of missing) {
    await client.query(
      "insert into public.schema_migrations (version, checksum) values ($1, $2) on conflict (version) do nothing",
      [m.version, m.checksum],
    );
  }

  console.log(`\n  Recorded ${missing.length} migration(s) as applied without running them.`);
  console.log("  Future runs of `npm run db:migrate` will only apply new files.\n");
}

const commands = { status, up, baseline };
const command = process.argv[2] ?? "status";

if (!commands[command]) {
  fail(`Unknown command "${command}". Use: status | up | baseline`);
}

const client = new pg.Client({
  connectionString: connectionString(),
  // Supabase terminates TLS with its own CA; the connection is still encrypted.
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await commands[command](client);
} finally {
  await client.end();
}
