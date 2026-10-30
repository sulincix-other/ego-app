#!/usr/bin/env bun
// Removes build outputs. Source files and signing keys are never touched.
//
// Usage:
//   bun run clean          # dist/ + android/build/
//   bun run clean --all    # also node_modules

import { rm, stat } from "node:fs/promises";

const root = `${import.meta.dir}/..`;
const all = process.argv.includes("--all");

const targets = ["dist", "android/build"];

if (all) targets.push("node_modules");

let removed = 0;

for (const target of targets) {
  const path = `${root}/${target}`;
  const exists = await stat(path).then(
    () => true,
    () => false,
  );

  if (!exists) continue;

  await rm(path, { recursive: true, force: true });
  console.log(`🧹 ${target}`);
  removed++;
}

console.log(
  removed
    ? `\n✅  Cleanup complete (${removed} item(s) removed).\n`
    : "\n✅  Nothing to remove, the project is already clean.\n",
);
