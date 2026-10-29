#!/usr/bin/env bun
// Android APK üretir:
//   1) public/ içeriğini android/app/src/main/assets/public altına kopyalar
//   2) Gradle ile debug (varsayılan) veya release APK derler
//   3) APK'yı dist/ altına anlaşılır bir adla kopyalar
//
// Kullanım:
//   bun run apk             # debug APK
//   bun run apk --release   # release APK (imza için README'ye bakın)

import { $ } from "bun";
import { cp, mkdir } from "node:fs/promises";
import pkg from "../package.json" with { type: "json" };

const root = `${import.meta.dir}/..`;
process.chdir(root);

const mode = process.argv.includes("--release") ? "release" : "debug";
const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";

console.log(`\n📦  EGO Cepte Android (${mode}) derleniyor…\n`);

// Web varlıklarını ve eklenti ayarlarını Android projesine aktar
await $`bunx cap sync android`;

// Gradle derlemesi
await $`${gradlew} assemble${mode === "release" ? "Release" : "Debug"}`.cwd(
  `${root}/android`,
);

// Çıktı APK'sını bul (imzasız release dosyası da desteklenir)
const outDir = `${root}/android/app/build/outputs/apk/${mode}`;
const candidates =
  mode === "release"
    ? [`${outDir}/app-release.apk`, `${outDir}/app-release-unsigned.apk`]
    : [`${outDir}/app-debug.apk`];

let source = null;
for (const candidate of candidates) {
  if (await Bun.file(candidate).exists()) {
    source = candidate;
    break;
  }
}

if (!source) {
  console.error(`\n❌  APK bulunamadı: ${outDir}`);
  process.exit(1);
}

const target = `${root}/dist/ego-cepte-${pkg.version}-${mode}${
  source.includes("unsigned") ? "-unsigned" : ""
}.apk`;
await mkdir(`${root}/dist`, { recursive: true });
await cp(source, target);

const size = (await Bun.file(target).size / 1024 / 1024).toFixed(1);
console.log(`\n✅  APK hazır: dist/${target.split("/dist/")[1]} (${size} MB)\n`);

if (source.includes("unsigned")) {
  console.warn(
    "⚠️  Bu release APK imzasız. İmzalamak için README'deki ortam değişkenlerini ayarlayın.\n",
  );
}
