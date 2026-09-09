/**
 * Rebuilds the subset Material Symbols font from the icons the code actually uses.
 *
 *   npm run icons:build          # rebuild
 *   npm run icons:build -- --check   # fail if out of date, do not write
 *
 * The full Material Symbols face is ~728KB for roughly 3,500 icons. This app
 * uses about 60, so the subset is ~16KB -- the single largest saving available
 * on the site, and most visitors are on a phone.
 *
 * Run this after adding or removing an icon. `--check` is suitable for CI: it
 * exits non-zero when a newly used icon is missing from the subset, which would
 * otherwise show up as a blank space in the UI.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fontPath = join(projectRoot, "public", "fonts", "material-symbols-subset.woff2");
const manifestPath = join(projectRoot, "public", "fonts", "material-symbols-icons.txt");
const checkOnly = process.argv.includes("--check");

/** Every .ts/.tsx file outside build output and dependencies. */
function sourceFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name.startsWith(".")) {
      continue;
    }

    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

/**
 * Icons reach the DOM four ways, and all four must be collected -- an icon the
 * subset lacks renders as blank space, silently.
 *
 *   1. literal text of a `.material-symbols-outlined` element
 *   2. the two branches of a ternary inside one
 *   3. `icon: "name"` in the navigation and taxonomy config
 *   4. a lookup map keyed by something else, e.g.
 *        const toneIcons = { error: "error", success: "check_circle" }
 *      Missing case 4 was not hypothetical: it dropped check_circle, warning
 *      and progress_activity -- the icons on every status banner.
 */
function collectIcons() {
  const icons = new Set();
  const literal = /material-symbols-outlined[^>]*>\s*([a-z_]{2,32})\s*</g;
  const iconKey = /\bicon:\s*"([a-z_]{2,32})"/g;
  const ternary = /material-symbols-outlined[^>]*>\s*\{[^}]*\?\s*"([a-z_]{2,32})"\s*:\s*"([a-z_]{2,32})"[^}]*\}\s*</g;
  // Any `const somethingIcons = { ... }` / `ICON_MAP = { ... }` block.
  const iconMap = /(?:const|let)\s+\w*(?:[Ii]cons?|ICONS?)\w*\s*(?::[^=]+)?=\s*\{([^}]*)\}/g;
  const mapValue = /:\s*"([a-z_]{2,32})"/g;

  for (const file of sourceFiles(projectRoot)) {
    const source = readFileSync(file, "utf8");
    let match;

    for (const pattern of [literal, iconKey]) {
      pattern.lastIndex = 0;
      while ((match = pattern.exec(source))) icons.add(match[1]);
    }

    ternary.lastIndex = 0;
    while ((match = ternary.exec(source))) {
      icons.add(match[1]);
      icons.add(match[2]);
    }

    iconMap.lastIndex = 0;
    while ((match = iconMap.exec(source))) {
      mapValue.lastIndex = 0;
      let value;
      while ((value = mapValue.exec(match[1]))) icons.add(value[1]);
    }
  }

  for (const notAnIcon of ["true", "false"]) icons.delete(notAnIcon);
  return [...icons].sort();
}

const icons = collectIcons();

if (icons.length === 0) {
  console.error("\n  Found no icons. Refusing to build an empty font.\n");
  process.exit(1);
}

const previous = existsSync(manifestPath)
  ? readFileSync(manifestPath, "utf8").split("\n").map((line) => line.trim()).filter(Boolean)
  : [];

const added = icons.filter((icon) => !previous.includes(icon));
const removed = previous.filter((icon) => !icons.includes(icon));

console.log(`\n  ${icons.length} icons in use`);
if (added.length) console.log(`  + ${added.join(", ")}`);
if (removed.length) console.log(`  - ${removed.join(", ")}`);

if (checkOnly) {
  if (added.length === 0) {
    console.log("  Subset is up to date.\n");
    process.exit(0);
  }

  console.error(
    `\n  Subset is missing ${added.length} icon(s), which would render as blank space.` +
      "\n  Run: npm run icons:build\n",
  );
  process.exit(1);
}

if (added.length === 0 && removed.length === 0 && existsSync(fontPath)) {
  console.log("  Already up to date; nothing to download.\n");
  process.exit(0);
}

// Google serves a subset containing exactly the requested icons.
const url =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,100..700,0,0" +
  `&icon_names=${icons.join(",")}`;

// The woff2 source is only offered to a browser-like client.
const browserUA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const cssResponse = await fetch(url, { headers: { "User-Agent": browserUA } });

if (!cssResponse.ok) {
  console.error(`\n  Google Fonts returned ${cssResponse.status}. Font left unchanged.\n`);
  process.exit(1);
}

const css = await cssResponse.text();
const fontUrl = css.match(/url\((https:\/\/[^)]+)\)/)?.[1];

if (!fontUrl) {
  console.error("\n  Could not find a font URL in the stylesheet. Font left unchanged.\n");
  process.exit(1);
}

const fontResponse = await fetch(fontUrl, { headers: { "User-Agent": browserUA } });

if (!fontResponse.ok) {
  console.error(`\n  Font download returned ${fontResponse.status}. Font left unchanged.\n`);
  process.exit(1);
}

const bytes = Buffer.from(await fontResponse.arrayBuffer());

// woff2 files start with the signature "wOF2". Guard against saving an error page.
if (bytes.length < 1000 || bytes.subarray(0, 4).toString("latin1") !== "wOF2") {
  console.error("\n  Downloaded file is not a woff2 font. Font left unchanged.\n");
  process.exit(1);
}

const before = existsSync(fontPath) ? statSync(fontPath).size : 0;
writeFileSync(fontPath, bytes);
writeFileSync(manifestPath, `${icons.join("\n")}\n`);

console.log(`  Wrote ${(bytes.length / 1024).toFixed(1)}KB${before ? ` (was ${(before / 1024).toFixed(1)}KB)` : ""}`);
console.log("  public/fonts/material-symbols-subset.woff2\n");
