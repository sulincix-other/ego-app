# 🚌 EGO Otobüs Takip

Ankara Büyükşehir Belediyesi EGO (Elektrik Gaz Otobüs) Genel Müdürlüğü için tam özellikli otobüs takip web uygulaması.

## ✨ Özellikler

### 🚌 Hat İşlemleri
- **Hat Listesi**: 667+ EGO otobüs hattını görüntüleme
- **Hat Arama**: Hat adı veya koduyla hızlı arama
- **Hat Detayları**: Her hattın tüm duraklarını listeleyen modal pencere
- **Sınırlı Cache**: Hat listesi cache'de tutularak hızlı arama

### 🛑 Durak İşlemleri
- **Durak Arama**: Durak kodu veya adıyla arama
- **Duraktan Geçen Hatlar**: Belirli bir duraktan geçen tüm hatları görüntüleme
- **Geçiş Süreleri**: Hatların duraktan geçen tahmini süreleri (durağa gelme süresine göre gruplandırılmış)
- **Yakın Duraklar**: Konuma göre yakın durakları bulma

### 🚌 Canlı Takip
- **Tüm Hatlar**: Bir duraktan geçen tüm hatların canlı durumu
- **Tek Hat**: Belirli bir hattı sadece takip etme
- **Gruplandırma**: Yaklaşma süresine göre otomatik gruplandırma
- **Acil Durum Göstergesi**: 5 dakika ve altındaki otobüsler vurgulanır
- **Otomatik Yenileme**: 30 saniyede bir otomatik güncelleme

### 📢 Bilgi ve Duyurular
- **EGO Duyuruları**: Güncel EGO duyurularını görüntüleme
- **Konum Bazlı Arama**: Adres veya nokta ile durak bulma

## 🚀 Kurulum

### Gereksinimler
- Go 1.22+ (harici bağımlılık yoktur)
- Modern web tarayıcısı (Chrome, Firefox, Edge)

### Hızlı Başlatma

```bash
# Sunucuyu başlat
go run server.go
```

Sunucu `http://localhost:5000` adresinde başlar.

### Derlenmiş İkili

```bash
# İkili dosyayı oluştur
go build -o ego-bus-tracker .

# Çalıştır
./ego-bus-tracker
```

### Sunucu Seçenekleri

```bash
# Farklı port ve statik dosya dizini
go run server.go -addr :8080 -dir ./public
```

## 📖 Kullanım Kılavuzu

### 1. Hatlar Sekmesi

Hatları görüntüleme ve arama:

```
[🔍 Hat aramaya başla...] [Ara]
```

**Örnekler:**
- Tüm hatları görmek için arama kutusuna hiçbir şey yazmayın
- "BEYTEPE" yazarak Beytepe ile ilgili hatları bulun
- "174" yazarak 174 numaralı hattı bulun

**Hat Detay Modal:**
Bir hat kartına tıkladığınızda modal açılır ve:
- Hat numarası
- Hat adı
- Tüm duraklar (sıralı)
- Her durak için kod ve ad
- Canlı takip butonu

### 2. Duraklar Sekmesi

Durakları görüntüleme ve arama:

```
[🔍 Durak kodu veya adını ara...] [Ara]
```

**Örnekler:**
- "10560" (durak kodu)
- "Anıtkabir" (durak adı)
- "Kızılay" (durak adı)

### 3. Canlı Takip Sekmesi

Durakta yaklaşıyor otobüsleri görüntüleme:

```
📍 Durak Kodu: [___]
🛤️ Hat Kodu (Opsiyonel): [___]
[Yaklaşan Otobüsleri Görüntüle]
```

**Kullanım:**
1. Durak kodunu girin (örn: 10560)
2. İsteğe bağlı hat kodunu girin (sadece belirli bir hattı takip etmek için)
3. "Yaklaşan Otobüsleri Görüntüle" butonuna tıklayın

**Canlı Listesi:**
- Otobüs numarası ve plakası
- Yaklaşma süresi (dakika cinsinden)
- Durak kodu ve adı
- Trafik durumu (normal/yok)
- Gecikme bilgisi

### 4. Durak Modal

Bir durak kodunu seçtiğinizde modal açılır:

```
🚦 Bu duraktan geçen hatlar:
- Hat Adı (Kod: XXX) - X dakika içinde
```

**Butonlar:**
- Yaklaşan Otobüsleri Görüntüle
- Otobüs Canlı Takip

### 5. Konum Arama

Geographic konum bazlı durak arama:

```
[🔍 Konum aramaya başla...] [Ara]
```

**Örnekler:**
- "Anıtkabir"
- "Kızılay Metro"
- "Ataköy"

## 🔌 API Proxy

Uygulama, EGO API'sine proxy olarak çalışır.

### Proxy Güvenliği ve Cache
- `/proxy` yalnızca `act.asp`, `action.asp` ve `srv.asp` uçlarındaki belgelenmiş `FNC` değerlerine izin verir.
- Hat, durak, duyuru ve sefer gibi sabit veriler sunucuda 5 dakika cache'lenir; canlı otobüs verisi cache'lenmez.
- `/api/geocode` sonuçları Ankara sınırlarına (bbox) göre filtrelenir.

### EGO API Bilgisi
- **Host**: `https://egocptsrvand.ego.gov.tr`
- **Proxy Endpoint**: `/proxy?path=API_PATH`

### Örnek API Çağrıları

#### Tüm Hatları Getirme
```bash
curl "http://localhost:5000/proxy?path=%2Fhibrit%2Fact.asp&FNC=Hatlar&LAN=tr"
```

#### Durak Arama
```bash
curl "http://localhost:5000/proxy?path=%2Fhibrit%2Faction.asp&FNC=Duraklar&QUERY=10560&LAN=tr"
```

#### Duraktan Geçen Hatlar
```bash
curl "http://localhost:5000/proxy?path=%2Fhibrit%2Faction.asp&FNC=DuraktanGecenHatlar&KOD=10560&LAN=tr"
```

#### Duraktan Geçiş Saatleri
```bash
curl "http://localhost:5000/proxy?path=%2Fhibrit%2Faction.asp&FNC=DuraktanGecisSaatleri&HAT=174&TUR=HAFTA%20İÇİ&DURAK=10560&LAN=tr"
```

#### Duyurular
```bash
curl "http://localhost:5000/proxy?path=%2Fhibrit%2Faction.asp&FNC=Duyurular&LAN=tr"
```

#### Yakın Duraklar (Konum Bazlı)
```bash
curl "http://localhost:5000/proxy?path=%2Fhibrit%2Faction.asp&FNC=YakinDuraklar&LAT=39.9334&LNG=32.8597&MSF=500&LAN=tr"
```

#### Hat Bilgileri (Durak Listesiyle)
```bash
curl "http://localhost:5000/proxy?path=%2Fhibrit%2Fact.asp&FNC=HatBilgileri&KOD=174&YOL=TRUE&LAN=tr"
```

#### Canlı Takip (Tüm Hatlar)
```bash
curl "http://localhost:5000/proxy?path=%2Fhibrit%2Fsrv.asp&FNC=Otobusler&LAN=tr"
```

#### Canlı Takip (Tek Hat)
```bash
curl "http://localhost:5000/proxy?path=%2Fhibrit%2Fsrv.asp&FNC=Otobus&HAT=174&DURAK=10560&LAN=tr"
```

## 📊 API Parametreleri

### Ortak Parametreler

| Parametre | Açıklama | Varsayılan |
|-----------|----------|------------|
| `FNC` | İşlem tipi (Hatlar, Duraklar, Otobusler, vb.) | - |
| `LAN` | Dil (tr/en) | `tr` |

### Hat İşlemleri Parametreleri

| Parametre | Açıklama | Varsayılan |
|-----------|----------|------------|
| `FNC` | `Hatlar` veya `HatBilgileri` | - |
| `KOD` | Hat kodu (HatBilgileri için) | - |
| `YOL` | Durak listesini dahil et | `TRUE` |

### Durak İşlemleri Parametreleri

| Parametre | Açıklama |
|-----------|----------|
| `FNC` | `Duraklar`, `DuraktanGecenHatlar`, `DuraktanGecisSaatleri`, `Duyurular`, `YakinDuraklar` |
| `QUERY` | Durak kodu veya adı (Duraklar için) |
| `KOD` | Durak kodu (DuraktanGecenHatlar için) |
| `HAT` | Hat kodu (DuraktanGecisSaatleri için) |
| `TUR` | `HAFTA İÇİ`, `CUMARTESİ`, `PAZAR` (DuraktanGecisSaatleri için) |
| `DURAK` | Durak kodu (DuraktanGecisSaatleri için) |
| `LAT` | Enlem (YakinDuraklar için) |
| `LNG` | Boylam (YakinDuraklar için) |
| `MSF` | Yarıçap metre cinsinden (YakinDuraklar için) |

## 🎨 Özellik Detayları

### Canlı Takip Gösterimi

#### Yakın Otobüsler (5 dakika ve altı)
- 🔥 kırmızı başlık
- Vurgulanmış görünüm
- Hızlı erişim

#### Diğer Otobüsler
- ⏱️ normal başlık
- Yaklaşma süresi gösterimi
- Gruplandırılmış liste

#### Otobüs Kartı
- 🚌 Otobüs numarası
- 🚗 Plaka numarası
- 🛤️ Hat kodu
- 🚦 Trafik durumu
- ⚡ Hız bilgisi
- 🕐 Gecikme bilgisi

### Durak Modal

#### Durak Listesi
- 📍 Durak adı
- Durak kodu
- Konum bilgisi
- Satır numarası (1, 2, 3...)

## 🛠️ Geliştirme

### Proje Yapısı

```
/home/pardus/ego/
├── app.js              # Ana JavaScript dosyası
├── index.html          # Ana HTML dosyası
├── styles.css          # CSS stilleri
├── server.go           # Go HTTP server (proxy + statik dosyalar)
├── go.mod              # Go modül tanımı
├── package.json        # Node.js betikleri (opsiyonel)
└── README.md           # Bu dosya
```

### Tarayıcıda Çalıştırma

```bash
# Sunucuyu başlat
go run server.go

# Tarayıcıda aç
http://localhost:5000
```

### Debug Modu

Tarayıcı konsolunda:
```javascript
// Tüm hatları görüntüle
window.state.lines

// Tüm durakları görüntüle
window.state.stops

// Canlı veri görüntüle
window.state.liveData
```

## ⚡ Performans İyileştirmeleri

- **Cache Sistemi**: Hat listesi ilk yüklemede cache'de tutulur
- **Hızlı Arama**: API isteği atmadan cache'den filtreleme
- **Otomatik Yenileme**: Canlı takip 30 saniyede bir otomatik güncellenir
- **Lazy Loading**: Gerektiğinde veri yüklenir

## 📱 Responsive Tasarım

Uygulama mobil cihazlarda da düzgün çalışır:
- 📱 Mobil uyumlu arayüz
- 🔄 Dokunmatik dostu
- 🎨 Optimized boyutlar

## 🐛 Bilinen Sorunlar

- EGO API'si bazen geçici olarak erişilemez olabilir
- Bazı hatlar canlı veri göndermeyebilir
- Trafi yoğun saatlerde gecikmeler olabilir

## 📝 Lisans

Bu proje eğitim amaçlıdır.

## 🙏 Katkıda Bulunanlar

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Go (net/http)
- API: EGO OpenAPI (ASP-based hibrit servisler)

## 🌐 Online Test

Canlı test için: **`http://localhost:5000`**

## 📞 Destek

Sorularınız için:
- GitHub Issues
- EGO Web Destek: `https://www.egotb.ankarabesiktasi.gov.tr`
