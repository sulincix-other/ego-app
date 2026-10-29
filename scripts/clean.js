#!/usr/bin/env bun
// Proje temizliği: derleme çıktılarını ve `cap sync` tarafından üretilen
// dosyaları siler. Kaynak dosyalara ve imza anahtarlarına dokunmaz.
//
// Kullanım:
//   bun run clean          # derleme çıktıları + üretilen Android dosyaları
//   bun run clean --all    # ek olarak node_modules

import { rm, stat } from "node:fs/promises";

const root = `${import.meta.dir}/..`;
const all = process.argv.includes("--all");

const targets = [
  "dist",
  "android/.gradle",
  "android/build",
  "android/app/build",
  "android/capacitor-cordova-android-plugins",
  "android/app/src/main/assets/public",
  "android/app/src/main/assets/capacitor.config.json",
  "android/app/src/main/assets/capacitor.plugins.json",
  "android/app/src/main/res/xml/config.xml",
];

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
