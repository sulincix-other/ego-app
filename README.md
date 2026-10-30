# EGO Cepte

Ankara EGO otobüs takip uygulaması. `openapi.json` içindeki servisleri kullanan,
**Bun** ile çalışan, web ve mobil uyumlu tek sayfalık bir uygulama.

## Neden Bun?

EGO servisleri tarayıcıdan doğrudan çağrıldığında **CORS** nedeniyle engellenir.
Bu projede Bun'un kendi HTTP sunucusu (`server.js`) hem uygulamayı sunar hem de
EGO API'lerine CORS başlıklı bir **proxy** yapar. Vite ya da başka bir araç
gerekmez.

Android sürümü ise `public/` içeriğini minimal bir **WebView** içinde çalıştırır.
`file://` kaynağına evrensel erişim açık olduğu için istekler doğrudan EGO
uçlarına gider; CORS devreye girmez ve ayrı bir proxy sunucusuna gerek kalmaz.

## Çalıştırma

```bash
bun run server.js      # veya: bun start
```

Ardından tarayıcıda **http://localhost:3000** adresini açın.

Geliştirme sırasında dosya değişikliklerini izlemek için:

```bash
bun --watch server.js  # veya: bun run dev
```

> Not: Uygulamayı başka bir cihazdan (telefon vb.) açmak için bilgisayarın yerel IP'sini kullanın,
> örn. `http://192.168.1.20:3000`. Sunucu `0.0.0.0` üzerinde dinler.

## Proxy yolları

| Uygulama yolu | Hedef |
|---|---|
| `/api/hibrit/<endpoint>` | `https://egocptsrvand.ego.gov.tr/hibrit/<endpoint>` |
| `/api/next/config` | `https://egocptngapi.ego.gov.tr/api/config` |
| `/api/next/config/ssl-pins` | `https://egocptngapi.ego.gov.tr/api/config/ssl-pins` |
| `/api/next/geocode` | `https://egocptngapi.ego.gov.tr/api/geocode` |
| `/api/next/route/compute` | `https://egocptngapi.ego.gov.tr/v1/route/compute` |

302 yönlendirmeli `hibrit/srv.asp` çağrıları proxy tarafından otomatik izlenir.

## Özellikler

- **Yakın duraklar** — konuma göre 500 m içindeki duraklar ve geçen hatlar
- **Durak arama** — durak kodu veya adıyla arama
- **Hat listesi** — tüm hatlar, kod/ad ile anlık filtre
- **Hat detayı** — süre/mesafe, durak sırası (zaman çizelgesi), canlı araçlar
- **Durak detayı** — geçen hatlar, canlı araç varışları, gün türüne göre geçiş saatleri
- **Canlı araçlar** — `srv.asp` (`Otobusler` / `Otobus`), 30 sn otomatik yenileme
- **Duyurular** — EGO duyuru listesi
- **Ayarlar** — uygulama config'i, SSL pin bilgisi, adres arama (geocoding), rota prewarm
- **PWA** — manifest ve ikon ile telefona "ana ekrana ekle" desteği
- **Android APK** — Gradle'sız, minimal WebView tabanlı yerel uygulama

## Dosya yapısı

```
.
├── server.js                  # Bun sunucusu + CORS proxy (web)
├── public/
│   ├── index.html             # Arayüz
│   ├── style.css              # Koyu tema, mobil öncelikli stiller
│   ├── app.js                 # İstemci mantığı ve API çağrıları
│   ├── manifest.webmanifest   # PWA manifest
│   └── icon.svg               # Uygulama ikonu
├── android/                   # Gradle'sız minimal Android projesi
│   ├── AndroidManifest.xml
│   ├── java/com/egocete/app/MainActivity.java
│   └── res/                   # ikon ve tema
├── assets/
│   └── icon.png               # APK ikonu (1024×1024)
├── scripts/build-apk.js       # Gradle'sız APK derleyici
├── scripts/clean.js           # Derleme çıktılarını temizler
├── .github/workflows/android.yml
├── openapi.json               # API tanımı
└── package.json
```

## Android APK

Android sürümü, `public/` içeriğini **tek bir WebView** içinde çalıştıran
minimal bir uygulamadır. Gradle, Capacitor, AndroidX veya başka bir kütüphane
yoktur; APK yalnızca Android SDK'nın standart araçlarıyla paketlenir.

### Gereksinimler

- [Bun](https://bun.sh) 1.x (derleme betiği için; npm bağımlılığı yok, `bun install` gerekmez)
- **JDK 17+** (`javac`, `keytool`, `jar`)
- **Android SDK**
  - Platform 35 (`platforms/android-35/android.jar`)
  - Build-Tools 35.0.0 (`aapt2`, `d8`, `zipalign`, `apksigner`)
  - `ANDROID_HOME` tanımlı olmalı (veya SDK `~/Android/Sdk` altında olmalı)

### APK üretme

```bash
bun run apk          # debug APK -> dist/ego-cepte-<sürüm>-debug.apk
```

Betik sırasıyla `aapt2`, `javac`, `d8`, `zipalign` ve `apksigner` çağırır.
Debug APK, `~/.android/debug.keystore` yoksa otomatik oluşturulan standart debug
anahtarıyla imzalanır.

Cihaza kurmak için:

```bash
adb install -r dist/ego-cepte-1.0.0-debug.apk
```

### İmzalı release APK

Öncelikle imza anahtarını oluşturun:

```bash
keytool -genkeypair -v -keystore ego-cepte.jks -alias ego \
  -keyalg RSA -keysize 2048 -validity 10000
```

Sonra ortam değişkenlerini ayarlayıp derleyin:

```bash
export EGO_KEYSTORE_FILE="$PWD/ego-cepte.jks"
export EGO_KEY_ALIAS="ego"
export EGO_KEYSTORE_PASSWORD="parola"
export EGO_KEY_PASSWORD="parola"

bun run apk --release
# -> dist/ego-cepte-<sürüm>-release.apk
```

> `*.jks` ve `*.keystore` dosyaları `.gitignore` içindedir. Anahtar dosyasını ve
> parolaları asla depoya eklemeyin.

### Sürüm ve ikon

- Sürüm adı `package.json` içindeki `version` alanından okunur.
- `versionCode` varsayılan olarak `1`'dir; artırmak için
  `EGO_VERSION_CODE=2 bun run apk` kullanın.
- Uygulama ikonu `android/res/drawable/ic_launcher.png` dosyasıdır. Kaynak
  görsel `assets/icon.png` (1024×1024) dosyasından kopyalanmıştır.

### Temizlik

```bash
bun run clean        # dist/ + android/build/
bun run clean --all  # ek olarak node_modules
```

Komut kaynak dosyalara, ikonlara ve imza anahtarlarına dokunmaz.

### GitHub Actions

`.github/workflows/android.yml` her push/PR'da debug APK derler ve artifact
olarak yükler. Gradle adımı yoktur.

### Nasıl çalışır?

| Ortam | API çağrısı | CORS |
|---|---|---|
| Web (`bun start`) | `/api/...` → `server.js` proxy | Sunucu CORS başlığı ekler |
| Android (WebView) | Doğrudan `egocptsrvand` / `egocptngapi` | `file://` kaynağına evrensel erişim açık olduğu için yok |

`public/app.js` içindeki `isNativeApp` ve `apiUrl()` bu seçimi yapar.
`MainActivity`, JS tarafına `EGOBridge.isNative()` köprüsünü ekler.

## Yasal not

Bu uygulama resmî değildir. EGO Genel Müdürlüğü'nün herkese açık servislerini
bilgilendirme amacıyla kullanır. Verilerin doğruluğu garanti edilmez.
