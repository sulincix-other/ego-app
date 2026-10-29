#!/usr/bin/env bun
// Release APK'yı test anahtarıyla imzalır
// Kullanım: bun run sign-apk

import { $ } from "bun";
import { existsSync } from "node:fs";
import path from "node:path";

const root = `${import.meta.dir}/..`;
process.chdir(root);

const keystoreEnv = process.env.EGO_ANDROID_KEYSTORE;
const keyAliasEnv = process.env.EGO_ANDROID_KEY_ALIAS;
const keyPasswordEnv = process.env.EGO_ANDROID_KEY_PASSWORD;
const storePasswordEnv = process.env.EGO_ANDROID_STORE_PASSWORD;

if (!keystoreEnv || !keyAliasEnv || !keyPasswordEnv || !storePasswordEnv) {
  console.error(
    "❌  APK imzalama için ortam değişkenleri gereklidir:\n" +
      "  EGO_ANDROID_KEYSTORE   - Keystore dosyası yolu\n" +
      "  EGO_ANDROID_KEY_ALIAS  - Anahtar alias'i\n" +
      "  EGO_ANDROID_KEY_PASSWORD - Anahtar şifresi\n" +
      "  EGO_ANDROID_STORE_PASSWORD - Depo şifresi\n",
  );
  process.exit(1);
}

const keystorePath = keystoreEnv;
const keyAlias = keyAliasEnv;
const keyPassword = keyPasswordEnv;
const storePassword = storePasswordEnv;

const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";

console.log("\n🔐  EGO Cepte APK imzalaniyor...\n");

await $`${gradlew assembleRelease} -Pkeystore=${keystorePath} -PkeyAlias=${keyAlias} -PkeyPassword=${keyPassword} -PstorePassword=${storePassword}`
  .cwd(`${root}/android`)
  .nothrow();

const distPath = `${root}/dist/ego-cepte-1.0.0-release.apk`;

if (existsSync(distPath)) {
  const size = (await Bun.file(distPath).size / 1024 / 1024).toFixed(1);
  console.log(`\n✅  İmzalı APK hazır: dist/ego-cepte-1.0.0-release.apk (${size} MB)\n`);
} else {
  console.error("\n❌  İmzalı APK bulunamadı");
  process.exit(1);
}
