#!/usr/bin/env bun
// Proje temizliği: derleme çıktılarını siler.
// Kaynak dosyalara ve imza anahtarlarına dokunmaz.
//
// Kullanım:
//   bun run clean          # dist/ + android/build/
//   bun run clean --all    # ek olarak node_modules

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
    ? `\n✅  Temizlik tamam (${removed} öğe silindi).\n`
    : "\n✅  Silinecek bir şey yok, proje zaten temiz.\n",
);
