// Makes .next/standalone runnable.
//
// next.config.ts sets output: "standalone", so `next build` emits a minimal
// server at .next/standalone/server.js — but deliberately leaves out public/
// and .next/static, because on Vercel a CDN serves those. Self-hosted there is
// no CDN, so the standalone server has to find them beside itself or every
// image, font and script 404s.
//
// public/ is ~192MB, so this links rather than copies where the filesystem
// allows it (Linux, i.e. Render) and falls back to copying where it does not
// (Windows without developer mode).

import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const standalone = join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error(
    'No .next/standalone. Run "next build" first, with output: "standalone" set in next.config.ts.',
  );
  process.exit(1);
}

/** @type {[string, string][]} source -> destination inside .next/standalone */
const assets = [
  [join(root, "public"), join(standalone, "public")],
  [join(root, ".next", "static"), join(standalone, ".next", "static")],
];

for (const [source, destination] of assets) {
  if (!existsSync(source)) {
    console.error(`Missing ${relative(root, source)} — nothing to link.`);
    process.exit(1);
  }

  rmSync(destination, { recursive: true, force: true });
  mkdirSync(dirname(destination), { recursive: true });

  try {
    symlinkSync(relative(dirname(destination), source), destination, "junction");
    console.log(`linked  ${relative(root, destination)}`);
  } catch {
    cpSync(source, destination, { recursive: true });
    console.log(`copied  ${relative(root, destination)}`);
  }
}
