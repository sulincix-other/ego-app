#!/usr/bin/env bun
// EGO Cepte — Android APK derleyicisi.
//
// Gradle, Capacitor veya npm paketi kullanmaz. Yalnızca Android SDK'nın
// standart araçlarını (aapt2, d8, zipalign, apksigner) ve JDK'yı çağırır.
//
// Kullanım:
//   bun run apk              # debug APK (otomatik debug anahtarıyla imzalı)
//   bun run apk --release    # release APK (EGO_KEYSTORE_* değişkenleri gerekir)

import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import pkg from "../package.json" with { type: "json" };

const root = path.resolve(import.meta.dir, "..");
const androidDir = path.join(root, "android");
const buildDir = path.join(androidDir, "build");
const distDir = path.join(root, "dist");

const release = process.argv.includes("--release");
const versionName = pkg.version;
const versionCode = Number(process.env.EGO_VERSION_CODE || 1);
const targetSdk = 35;
const minSdk = 23;

function fail(message) {
  console.error(`\n❌  ${message}\n`);
  process.exit(1);
}

function tool(dir, name) {
  for (const candidate of [name, `${name}.exe`, `${name}.bat`]) {
    const full = path.join(dir, candidate);
    if (existsSync(full)) return full;
  }
  fail(`Araç bulunamadı: ${path.join(dir, name)}`);
}

function javaTool(name) {
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  const home = process.env.JAVA_HOME;
  return home ? path.join(home, "bin", executable) : executable;
}

async function run(command, label) {
  if (label) console.log(`\n▶  ${label}`);
  const proc = Bun.spawn(command, {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) fail(`Komut başarısız (${code}): ${command.join(" ")}`);
}

function latestVersion(directory, requiredFile) {
  if (!existsSync(directory)) return null;
  return readdir(directory, { withFileTypes: true })
    .then((entries) =>
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => existsSync(path.join(directory, name, requiredFile)))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .at(-1),
    );
}

function findSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(homedir(), "Android", "Sdk"),
    path.join(homedir(), "Library", "Android", "sdk"),
    "/usr/lib/android-sdk",
    "/opt/android-sdk",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "build-tools"))) return candidate;
  }
  fail(
    "Android SDK bulunamadı. ANDROID_HOME ayarlayın veya SDK'yı ~/Android/Sdk altına kurun.",
  );
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

// ---------------------------------------------------------------------------
// SDK ve araçlar
// ---------------------------------------------------------------------------

const sdk = findSdk();

const buildToolsVersion = await latestVersion(
  path.join(sdk, "build-tools"),
  "aapt2",
);
if (!buildToolsVersion) fail("Android SDK build-tools bulunamadı.");
const buildTools = path.join(sdk, "build-tools", buildToolsVersion);

const platformVersion = await latestVersion(
  path.join(sdk, "platforms"),
  "android.jar",
);
if (!platformVersion) fail("Android SDK platform (android.jar) bulunamadı.");
const androidJar = path.join(sdk, "platforms", platformVersion, "android.jar");

if (Number(platformVersion.replace("android-", "")) < targetSdk) {
  fail(`Android ${targetSdk} platformu gerekli (bulunan: ${platformVersion}).`);
}

const aapt2 = tool(buildTools, "aapt2");
const d8 = tool(buildTools, "d8");
const zipalign = tool(buildTools, "zipalign");
const apksigner = tool(buildTools, "apksigner");

const javac = javaTool("javac");
const keytool = javaTool("keytool");
const jar = javaTool("jar");

// ---------------------------------------------------------------------------
// Derleme
// ---------------------------------------------------------------------------

console.log(
  `\n📦  EGO Cepte Android (${release ? "release" : "debug"}) derleniyor…`,
);
console.log(`    SDK: ${sdk}`);
console.log(`    build-tools: ${buildToolsVersion}  platform: ${platformVersion}\n`);

await rm(buildDir, { recursive: true, force: true });
await mkdir(path.join(buildDir, "assets"), { recursive: true });
await mkdir(path.join(buildDir, "classes"), { recursive: true });
await mkdir(path.join(buildDir, "dex"), { recursive: true });
await mkdir(distDir, { recursive: true });

// Web dosyalarını APK'nın assets/public klasörüne kopyala.
await cp(path.join(root, "public"), path.join(buildDir, "assets", "public"), {
  recursive: true,
});

// 1) Kaynakları derle
const resourcesZip = path.join(buildDir, "resources.zip");
await run(
  [aapt2, "compile", "--dir", path.join(androidDir, "res"), "-o", resourcesZip],
  "Kaynaklar derleniyor (aapt2 compile)",
);

// 2) Manifest + kaynaklar + assets -> imzasız APK
const unsignedApk = path.join(buildDir, "app-unsigned.apk");
await run(
  [
    aapt2,
    "link",
    "-o",
    unsignedApk,
    "-I",
    androidJar,
    "--manifest",
    path.join(androidDir, "AndroidManifest.xml"),
    "-R",
    resourcesZip,
    "-A",
    path.join(buildDir, "assets"),
    "--min-sdk-version",
    String(minSdk),
    "--target-sdk-version",
    String(targetSdk),
    "--version-code",
    String(versionCode),
    "--version-name",
    versionName,
    "--auto-add-overlay",
  ],
  "APK paketleniyor (aapt2 link)",
);

// 3) Java kaynağını derle
const classesDir = path.join(buildDir, "classes");
await run(
  [
    javac,
    "-encoding",
    "UTF-8",
    "-source",
    "8",
    "-target",
    "8",
    "-Xlint:-options",
    "-bootclasspath",
    androidJar,
    "-d",
    classesDir,
    path.join(androidDir, "java", "com", "egocete", "app", "MainActivity.java"),
  ],
  "Java kodu derleniyor (javac)",
);

// 4) Sınıf dosyalarını DEX'e çevir
const dexDir = path.join(buildDir, "dex");
const classFiles = (await walk(classesDir)).filter((file) =>
  file.endsWith(".class"),
);
if (classFiles.length === 0) fail("Derlenecek sınıf bulunamadı.");
await run(
  [d8, "--min-api", String(minSdk), "--lib", androidJar, "--output", dexDir, ...classFiles],
  "DEX üretiliyor (d8)",
);

// 5) classes.dex'i APK'ya ekle (JDK'nın jar aracı yeterli)
await run([
  jar,
  "--update",
  "--file",
  unsignedApk,
  "-C",
  dexDir,
  "classes.dex",
]);

// 6) İmza anahtarını hazırla
let keystore;
let keyAlias;
let storePassword;
let keyPassword;

if (release) {
  keystore = process.env.EGO_KEYSTORE_FILE;
  keyAlias = process.env.EGO_KEY_ALIAS;
  storePassword = process.env.EGO_KEYSTORE_PASSWORD;
  keyPassword = process.env.EGO_KEY_PASSWORD;

  if (!keystore || !keyAlias || !storePassword || !keyPassword) {
    fail(
      "Release imzası için EGO_KEYSTORE_FILE, EGO_KEY_ALIAS, " +
        "EGO_KEYSTORE_PASSWORD ve EGO_KEY_PASSWORD tanımlanmalı.",
    );
  }
  if (!existsSync(keystore)) fail(`Keystore bulunamadı: ${keystore}`);
} else {
  const debugDir = path.join(homedir(), ".android");
  keystore = path.join(debugDir, "debug.keystore");
  keyAlias = "androiddebugkey";
  storePassword = "android";
  keyPassword = "android";

  if (!existsSync(keystore)) {
    await mkdir(debugDir, { recursive: true });
    await run(
      [
        keytool,
        "-genkeypair",
        "-noprompt",
        "-keystore",
        keystore,
        "-storepass",
        storePassword,
        "-alias",
        keyAlias,
        "-keypass",
        keyPassword,
        "-keyalg",
        "RSA",
        "-keysize",
        "2048",
        "-validity",
        "10000",
        "-dname",
        "CN=Android Debug,O=Android,C=US",
      ],
      "Debug imza anahtarı oluşturuluyor (keytool)",
    );
  }
}

// 7) Hizala ve imzala
const alignedApk = path.join(buildDir, "app-aligned.apk");
await run([zipalign, "-f", "4", unsignedApk, alignedApk], "APK hizalanıyor (zipalign)");

const outputName = `ego-cepte-${versionName}-${release ? "release" : "debug"}.apk`;
const outputApk = path.join(distDir, outputName);

await run(
  [
    apksigner,
    "sign",
    "--ks",
    keystore,
    "--ks-key-alias",
    keyAlias,
    "--ks-pass",
    `pass:${storePassword}`,
    "--key-pass",
    `pass:${keyPassword}`,
    "--v4-signing-enabled",
    "false",
    "--out",
    outputApk,
    alignedApk,
  ],
  "APK imzalanıyor (apksigner)",
);

await run([apksigner, "verify", outputApk]);

const size = (await Bun.file(outputApk).size / 1024 / 1024).toFixed(1);
console.log(`\n✅  APK hazır: dist/${outputName} (${size} MB)\n`);
