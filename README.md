# EGO Cepte

Ankara EGO otobüs takip uygulaması. `openapi.json` içindeki servisleri kullanan,
**Bun** ile çalışan, web ve mobil uyumlu tek sayfalık bir uygulama.

## Neden Bun?

EGO servisleri tarayıcıdan doğrudan çağrıldığında **CORS** nedeniyle engellenir.
Bu projede Bun'un kendi HTTP sunucusu (`server.js`) hem uygulamayı sunar hem de
EGO API'lerine CORS başlıklı bir **proxy** yapar. Vite ya da başka bir araç
gerekmez; ek kütüphane yoktur.

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

## Dosya yapısı

```
.
├── server.js                 # Bun sunucusu + CORS proxy
├── public/
│   ├── index.html            # Arayüz
│   ├── style.css             # Koyu tema, mobil öncelikli stiller
│   ├── app.js                # İstemci mantığı ve API çağrıları
│   ├── manifest.webmanifest  # PWA manifest
│   └── icon.svg              # Uygulama ikonu
├── openapi.json              # API tanımı
└── package.json
```

## Android

Uygulama PWA olarak yayınlanabilir:

- Android Chrome'da sayfayı açıp **"Ana ekrana ekle"** ile kurulabilir.
- Gerekirse bir WebView/Capacitor kabuğu içine `public/` klasörü konularak APK üretilebilir;
  proxy'nin de cihazdan erişilebilir bir adreste çalışması gerekir.

## Yasal not

Bu uygulama resmî değildir. EGO Genel Müdürlüğü'nün herkese açık servislerini
bilgilendirme amacıyla kullanır. Verilerin doğruluğu garanti edilmez.
