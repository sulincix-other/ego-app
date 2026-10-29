# EGO Cepte

Ankara EGO otobüs takip uygulaması. `openapi.json` içindeki servisleri kullanan,
**Bun** ile çalışan, web ve mobil uyumlu tek sayfalık bir uygulama.

## Neden Bun?

EGO servisleri tarayıcıdan doğrudan çağrıldığında **CORS** nedeniyle engellenir.
Bu projede Bun'un kendi HTTP sunucusu (`server.js`) hem uygulamayı sunar hem de
EGO API'lerine CORS başlıklı bir **proxy** yapar. Vite ya da başka bir araç
gerekmez.

Android sürümünde ise **CapacitorHttp** kullanıldığı için istekler cihazın yerel
katmanında yapılır; CORS devreye girmez ve ayrı bir proxy sunucusuna gerek kalmaz.

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
- **Android APK** — Capacitor tabanlı, proxy gerektirmeyen yerel uygulama

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
├── android/                   # Capacitor Android projesi (Gradle)
├── assets/
│   ├── icon.png               # APK ikonu (1024×1024)
│   └── splash.png             # Açılış ekranı (2732×2732)
├── scripts/build-apk.js       # APK derleme betiği
├── capacitor.config.json      # Capacitor ayarları
├── .github/workflows/android.yml
├── openapi.json               # API tanımı
└── package.json
```

## Android APK

Proje **Capacitor 7** ile Android kabuğuna sarılmıştır. APK, `public/` içeriğini
WebView'da çalıştırır. API çağrıları `CapacitorHttp` ile yerel katmanda yapıldığı
için tarayıcı CORS kuralı uygulanmaz; uygulama **kendi başına** çalışır, ayrı bir
proxy sunucusu gerekmez. Web sürümü (`bun start`) ise eskisi gibi `server.js`
proxy'sini kullanır.

### Gereksinimler

- [Bun](https://bun.sh) 1.x
- **JDK 21**
- **Android SDK** (Android Studio ile veya komut satırı araçlarıyla)
  - Platform 35 ve Build-Tools 35.0.0
  - `ANDROID_HOME` ortam değişkeni tanımlı olmalı

### APK üretme

```bash
bun install
bun run apk          # debug APK -> dist/ego-cepte-<sürüm>-debug.apk
```

Cihaza kurmak için:

```bash
adb install -r dist/ego-cepte-1.0.0-debug.apk
```

Android Studio ile açmak / çalıştırmak için:

```bash
bun run android:open
```

### İmzalı release APK

Öncelikle imza anahtarını oluşturun:

```bash
keytool -genkeypair -v -keystore ego-cepte.jks -alias ego \
  -keyalg RSA -keysize 2048 -validity 10000
```

Sonra ortam değişkenlerini ayarlayıp imzalayın:

```bash
export EGO_ANDROID_KEYSTORE="$PWD/ego-cepte.jks"
export EGO_ANDROID_KEY_ALIAS="ego"
export EGO_ANDROID_KEY_PASSWORD="parola"
export EGO_ANDROID_STORE_PASSWORD="parola"

bun run sign-apk
```

> `*.jks` ve `*.keystore` dosyaları `.gitignore` içindedir. Anahtar dosyasını ve
> parolaları asla depoya eklemeyin.

### Sürüm ve ikon

- Uygulama sürümü `package.json` içindeki `version` alanından okunur. Play
  Store'a her yüklemede `versionCode` değerini `android/app/build.gradle`
  içinde artırın.
- İkon ve açılış ekranı `assets/icon.png` (1024×1024) ile
  `assets/splash.png` (2732×2732) dosyalarından üretilir:

```bash
bun run android:icons
```

### Temizlik

Derleme çıktılarını ve `cap sync` tarafından üretilen Android dosyalarını silmek için:

```bash
bun run clean        # dist/ + Android build çıktıları
bun run clean --all  # ek olarak node_modules
```

Komut kaynak dosyalara, ikonlara ve imza anahtarlarına dokunmaz.

### GitHub Actions

`.github/workflows/android.yml` her push/PR'da debug APK derler ve
**ego-cepte-apk** adıyla artifact olarak yükler. Böylece yerel Android SDK
kurulumu olmadan da APK indirilebilir.

### Nasıl çalışır?

| Ortam | API çağrısı | CORS |
|---|---|---|
| Web (`bun start`) | `/api/...` → `server.js` proxy | Sunucu CORS başlığı ekler |
| Android (Capacitor) | Doğrudan `egocptsrvand` / `egocptngapi` | `CapacitorHttp` yerel istek yaptığı için yok |

`public/app.js` içindeki `isNativeApp` ve `apiUrl()` bu seçimi yapar.

## Yasal not

Bu uygulama resmî değildir. EGO Genel Müdürlüğü'nün herkese açık servislerini
bilgilendirme amacıyla kullanır. Verilerin doğruluğu garanti edilmez.
