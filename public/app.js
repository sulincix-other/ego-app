/* ============================================================
   EGO Cepte — istemci uygulaması
   Tüm veriler Bun sunucusundaki proxy üzerinden gelir (CORS yok).
   ============================================================ */

// ---------------- Yardımcılar ----------------

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** HTML kaçışı — API metinlerini güvenle basmak için. */
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

/** Kalıcı cihaz kimliği (EGO UID parametresi). */
const UID =
  localStorage.getItem("ego.uid") ||
  (() => {
    const id = "4C19FF69-CF38-4765-A621-63D671359ED3-" +
      String(Math.floor(Math.random() * 9_999_999_999));
    localStorage.setItem("ego.uid", id);
    return id;
  })();

// ---------------- API adresleri ----------------
// Web'de (bun server.js) istekler CORS başlıklı yerel proxy üzerinden gider.
// Android kabuğunda (Capacitor) ise doğrudan EGO uçlarına gider; CapacitorHttp
// isteği yerel katmanda yaptığı için tarayıcı CORS kuralı uygulanmaz.

const isNativeApp =
  typeof window !== "undefined" &&
  window.Capacitor?.isNativePlatform?.() === true;

const EGO_HIBRIT_BASE = "https://egocptsrvand.ego.gov.tr/hibrit/";
const EGO_NG_BASE = "https://egocptngapi.ego.gov.tr";

// /api/next/<yol> -> yeni nesil API yolu
const NG_PATHS = {
  "config": "/api/config",
  "config/ssl-pins": "/api/config/ssl-pins",
  "geocode": "/api/geocode",
  "route/compute": "/v1/route/compute",
};

/** Proxy ya da doğrudan EGO adresi üretir. */
function apiUrl(kind, path, query = new URLSearchParams()) {
  const suffix = query.toString() ? `?${query}` : "";

  if (kind === "hibrit") {
    return isNativeApp
      ? `${EGO_HIBRIT_BASE}${path}${suffix}`
      : `/api/hibrit/${path}${suffix}`;
  }

  const target = NG_PATHS[path];
  if (!target) throw new Error(`Bilinmeyen API yolu: ${path}`);

  return isNativeApp
    ? `${EGO_NG_BASE}${target}${suffix}`
    : `/api/next/${path}${suffix}`;
}

// Ayarlar ekranındaki kaynak etiketlerini ortama göre güncelle
const sourceLabel = isNativeApp ? "doğrudan EGO API" : null;
if (sourceLabel) {
  const configSource = $("#config-source");
  const pinsSource = $("#pins-source");
  if (configSource) configSource.textContent = sourceLabel;
  if (pinsSource) pinsSource.textContent = sourceLabel;
}

/** Hibrit ASP uçlarına istek. */
async function hibrit(endpoint, params = {}) {
  const query = new URLSearchParams({
    ...params,
    UID,
    LAN: "tr",
    ACSMode: "0",
  });
  return request(apiUrl("hibrit", endpoint, query));
}

/** Yeni nesil API'ye istek. */
async function nextApi(path, params = {}) {
  return request(apiUrl("next", path, new URLSearchParams(params)));
}

/** Ortak istek: yanıt her zaman JSON'a çevrilir. */
async function request(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();

  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("Sunucudan geçersiz yanıt alındı.");
  }

  if (!res.ok) {
    throw new Error(data?.error || `Sunucu hatası (${res.status})`);
  }
  return data;
}

// ---------------- Toast ----------------

const toastRoot = $("#toast-root");

function toast(message, type = "info", timeout = 3200) {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  toastRoot.appendChild(el);

  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 220);
  }, timeout);
}

// ---------------- Görünüm yönetimi ----------------

const views = $$(".view");
const tabButtons = $$(".tabbar [data-nav]");

function showView(name) {
  if (name !== "stop-detail") stopLiveRefresh();
  views.forEach((v) => v.classList.toggle("active", v.dataset.view === name));
  tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.nav === name));
  window.scrollTo({ top: 0, behavior: "instant" });

  if (name === "lines") loadLines();
  if (name === "news") loadNews();
  if (name === "settings") loadSettings();
  if (name === "home") loadHomeStatus();
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    stopLiveRefresh();
    showView(btn.dataset.nav);
  });
});

$$("[data-nav]").forEach((el) => {
  if (el.closest(".tabbar")) return;
  el.addEventListener("click", () => showView(el.dataset.nav));
});

// ---------------- Durum ----------------

const state = {
  lines: null,          // tüm hatlar (cache)
  lineQuery: "",
  homeNearbyLoaded: false,
  currentStop: null,    // { kod, ad }
  currentLine: null,    // { kod, ad }
  stopLines: [],        // durağın hatları
  liveTimer: null,
  liveTarget: null,     // { stop, line|null }
  newsLoaded: false,
  settingsLoaded: false,
};

// ---------------- Ana sayfa ----------------

async function loadHomeNews() {
  const box = $("#home-news");
  try {
    const data = await hibrit("action.asp", { FNC: "Duyurular" });
    const rows = (data?.table || []).slice(0, 3);
    if (!rows.length) {
      box.innerHTML = `<p class="muted small">Şu an duyuru yok.</p>`;
      return;
    }
    box.innerHTML = rows.map(newsItem).join("");
  } catch (err) {
    box.innerHTML = `<p class="muted small">Duyurular yüklenemedi: ${esc(err.message)}</p>`;
  }
}

async function loadHomeStatus() {
  const box = $("#home-status");
  try {
    const config = await nextApi("config");
    const flags = config?.featureFlags || config || {};
    const pins = await nextApi("config/ssl-pins").catch(() => null);

    const items = [
      { label: "API bağlantısı", ok: true },
      { label: `Min. sürüm ${esc(config?.minAppVersion ?? "?")}`, ok: true },
      { label: flags.isForceUpdateEnabled ? "Zorunlu güncelleme açık" : "Zorunlu güncelleme kapalı", ok: !flags.isForceUpdateEnabled, warn: !!flags.isForceUpdateEnabled },
      { label: pins?.current?.spki_hash ? "SSL pin tanımlı" : "SSL pin yok", ok: !!pins?.current?.spki_hash, warn: !pins?.current?.spki_hash },
    ];

    box.innerHTML = items
      .map(
        (i) =>
          `<div class="status-card"><span class="dot ${i.ok ? "ok" : i.warn ? "warn" : "bad"}"></span>${i.label}</div>`,
      )
      .join("");
  } catch (err) {
    box.innerHTML = `<div class="status-card"><span class="dot bad"></span>API'ye ulaşılamadı</div>`;
  }
}

// Yakın duraklar
$("#nearby-btn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const box = $("#home-nearby");

  if (!("geolocation" in navigator)) {
    toast("Bu tarayıcı konum desteği sunmuyor.", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Konum alınıyor…";
  box.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const data = await hibrit("action.asp", {
          FNC: "YakinDuraklar",
          LAT: pos.coords.latitude,
          LNG: pos.coords.longitude,
          MSF: 500,
        });
        const rows = data?.table || [];
        if (!rows.length) {
          box.innerHTML = emptyState("🚏", "500 m içinde durak bulunamadı.");
          return;
        }
        box.innerHTML = `
          <div class="section-head"><h3>En yakın duraklar</h3><span class="badge">${rows.length} sonuç</span></div>
          ${rows.map(nearbyItem).join("")}
        `;
      } catch (err) {
        box.innerHTML = emptyState("⚠️", `Duraklar yüklenemedi: ${esc(err.message)}`);
      } finally {
        resetNearbyBtn();
      }
    },
    (err) => {
      const msg =
        err.code === err.PERMISSION_DENIED
          ? "Konum izni verilmedi. Tarayıcı ayarlarından izin verin."
          : "Konum alınamadı. Tekrar deneyin.";
      box.innerHTML = emptyState("📍", msg);
      toast(msg, "error");
      resetNearbyBtn();
    },
    { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
  );

  function resetNearbyBtn() {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg> Konumumu kullan`;
  }
});

function nearbyItem(stop) {
  const lines = String(stop.hatlar || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);

  return `
    <button class="list-item" data-action="stop" data-kod="${esc(stop.kod)}" data-ad="${esc(stop.ad)}">
      <span class="li-icon">🚏</span>
      <span class="li-main">
        <span class="li-title">${esc(stop.ad)}</span>
        <span class="li-sub">
          <span>${esc(stop.kod)}</span>
          ${stop.detay ? `<span>· ${esc(stop.detay)}</span>` : ""}
        </span>
        ${lines.length ? `<span class="li-sub" style="margin-top:6px">${lines.map((l) => `<span class="tag">${esc(l)}</span>`).join("")}</span>` : ""}
      </span>
      <span class="li-right">›</span>
    </button>
  `;
}

// ---------------- Durak arama ----------------

const stopInput = $("#stop-input");
const stopResults = $("#stop-results");

async function searchStops() {
  const q = stopInput.value.trim();
  if (!q) {
    stopInput.focus();
    return;
  }

  stopResults.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;

  try {
    const data = await hibrit("action.asp", { FNC: "Duraklar", QUERY: q });
    const rows = data?.table || [];

    if (!rows.length) {
      stopResults.innerHTML = emptyState("🔍", `"${esc(q)}" için durak bulunamadı.`);
      return;
    }

    stopResults.innerHTML = `
      <div class="section-head"><h3>Sonuçlar</h3><span class="badge">${rows.length}</span></div>
      ${rows.map(stopItem).join("")}
    `;
  } catch (err) {
    stopResults.innerHTML = emptyState("⚠️", esc(err.message));
    toast(err.message, "error");
  }
}

function stopItem(stop) {
  return `
    <button class="list-item" data-action="stop" data-kod="${esc(stop.kod)}" data-ad="${esc(stop.ad)}">
      <span class="code-pill">${esc(stop.kod)}</span>
      <span class="li-main">
        <span class="li-title">${esc(stop.ad)}</span>
        <span class="li-sub">${esc(stop.konum || "")}</span>
      </span>
      <span class="li-right">›</span>
    </button>
  `;
}

$("#stop-search-btn").addEventListener("click", searchStops);
stopInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchStops();
});

// ---------------- Hatlar ----------------

const lineInput = $("#line-input");
const lineResults = $("#line-results");

async function loadLines() {
  if (state.lines) {
    renderLines();
    return;
  }

  try {
    const data = await hibrit("act.asp", { FNC: "Hatlar" });
    state.lines = data?.table || [];
    renderLines();
  } catch (err) {
    lineResults.innerHTML = emptyState("⚠️", `Hatlar yüklenemedi: ${esc(err.message)}`);
    toast(err.message, "error");
  }
}

function renderLines() {
  const all = state.lines || [];
  const q = state.lineQuery.toLocaleLowerCase("tr");

  const filtered = !q
    ? all
    : all.filter((l) =>
        String(l.kod).toLocaleLowerCase("tr").includes(q) ||
        String(l.ad).toLocaleLowerCase("tr").includes(q),
      );

  if (!filtered.length) {
    lineResults.innerHTML = emptyState("🚌", "Eşleşen hat bulunamadı.");
    return;
  }

  lineResults.innerHTML = `
    <div class="section-head"><h3>${q ? "Arama sonuçları" : "Tüm hatlar"}</h3><span class="badge">${filtered.length}</span></div>
    ${filtered.slice(0, 300).map(lineItem).join("")}
    ${filtered.length > 300 ? `<p class="muted small">İlk 300 sonuç gösteriliyor. Aramayı daraltın.</p>` : ""}
  `;
}

function lineItem(line) {
  return `
    <button class="list-item" data-action="line" data-kod="${esc(line.kod)}" data-ad="${esc(line.ad)}">
      <span class="code-pill">${esc(line.kod)}</span>
      <span class="li-main">
        <span class="li-title">${esc(line.ad)}</span>
        <span class="li-sub">
          ${line.sure ? `<span>⏱ ${esc(line.sure)} dk</span>` : ""}
          ${line.mesafe ? `<span>📏 ${esc(line.mesafe)} km</span>` : ""}
          ${line.tur ? `<span class="tag">${esc(line.tur)}</span>` : ""}
        </span>
      </span>
      <span class="li-right">›</span>
    </button>
  `;
}

lineInput.addEventListener("input", () => {
  state.lineQuery = lineInput.value.trim();
  renderLines();
});

// ---------------- Duyurular ----------------

const newsList = $("#news-list");

function newsItem(row) {
  return `
    <div class="news-item">
      <span class="n-date">${esc(row.tarih || "DUYURU")}</span>
      <div class="n-title">${esc(row.baslik || "")}</div>
    </div>
  `;
}

async function loadNews(force = false) {
  if (state.newsLoaded && !force) return;
  newsList.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;

  try {
    const data = await hibrit("action.asp", { FNC: "Duyurular" });
    const rows = data?.table || [];
    state.newsLoaded = true;

    if (!rows.length) {
      newsList.innerHTML = emptyState("📣", "Aktif duyuru bulunmuyor.");
      return;
    }
    newsList.innerHTML = rows.map(newsItem).join("");
  } catch (err) {
    newsList.innerHTML = emptyState("⚠️", `Duyurular yüklenemedi: ${esc(err.message)}`);
    toast(err.message, "error");
  }
}

$("#news-refresh").addEventListener("click", () => loadNews(true));

// ---------------- Ayarlar ----------------

async function loadSettings() {
  if (state.settingsLoaded) return;
  state.settingsLoaded = true;

  loadConfig();
  loadPins();
}

async function loadConfig() {
  const box = $("#config-card");
  try {
    const c = await nextApi("config");
    const f = c?.featureFlags || c || {};
    const rows = [
      ["Minimum sürüm", esc(c?.minAppVersion ?? "—")],
      ["Minimum build", esc(c?.minBuildNumber ?? "—")],
      ["Giriş", pill(f.isLoginEnabled)],
      ["Sertifika pinning", pill(f.isCertificatePinningEnabled)],
      ["Zorunlu güncelleme", pill(f.isForceUpdateEnabled)],
      ["Sanal kart", pill(f.isSanalKartEnabled)],
      ["Canlı trafik", pill(f.isBusTrafficEnabled)],
      ["Erişilebilirlik modu", pill(f.isAccessibleModeEnabled)],
    ];
    box.innerHTML = rows.map(([k, v]) => kvRow(k, v)).join("");
  } catch (err) {
    box.innerHTML = `<p class="muted small">Yapılandırma alınamadı: ${esc(err.message)}</p>`;
  }
}

async function loadPins() {
  const box = $("#pins-card");
  try {
    const p = await nextApi("config/ssl-pins");
    const cur = p?.current;
    if (!cur) {
      box.innerHTML = `<p class="muted small">Tanımlı pin bulunmuyor.</p>`;
      return;
    }
    box.innerHTML = [
      kvRow("SPKI (SHA-256)", esc(cur.spki_hash)),
      kvRow("Geçerlilik başlangıcı", esc(fmtDate(cur.valid_from))),
      kvRow("Geçerlilik bitişi", esc(fmtDate(cur.valid_until))),
      kvRow("Yeni pine geçiş", pill(p?.change_to_new)),
    ].join("");
  } catch (err) {
    box.innerHTML = `<p class="muted small">Pin bilgisi alınamadı: ${esc(err.message)}</p>`;
  }
}

function pill(value) {
  return value
    ? `<span class="pill-ok">Açık</span>`
    : `<span class="pill-off">Kapalı</span>`;
}

function kvRow(key, valueHtml) {
  return `<div class="kv"><span class="k">${esc(key)}</span><span class="v">${valueHtml}</span></div>`;
}

function fmtDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

// Geocoding
const geoInput = $("#geo-input");
const geoResults = $("#geo-results");

async function runGeocode() {
  const q = geoInput.value.trim();
  if (!q) {
    geoInput.focus();
    return;
  }

  geoResults.innerHTML = `<div class="skeleton" style="height:48px"></div>`;

  try {
    const data = await nextApi("geocode", { q, limit: 8, lang: "default" });
    const features = data?.features || [];

    if (!features.length) {
      geoResults.innerHTML = `<p class="muted small">Sonuç bulunamadı.</p>`;
      return;
    }

    geoResults.innerHTML = features
      .map((f) => {
        const p = f.properties || {};
        const [lng, lat] = f.geometry?.coordinates || [];
        const title = p.name || p.street || p.city || "Adsız";
        const parts = [p.city, p.state, p.country].filter(Boolean);
        return `
          <div class="geo-res">
            <div class="g-main">
              <div class="g-title">${esc(title)}</div>
              <div class="g-sub">${esc(parts.join(", "))}${p.postcode ? ` · ${esc(p.postcode)}` : ""}</div>
            </div>
            <div class="g-coord">${lat != null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : ""}</div>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    geoResults.innerHTML = `<p class="muted small">Geocoding hatası: ${esc(err.message)}</p>`;
  }
}

$("#geo-btn").addEventListener("click", runGeocode);
geoInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runGeocode();
});

// Prewarm
$("#prewarm-btn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const out = $("#prewarm-result");
  btn.disabled = true;
  out.textContent = "Çalıştırılıyor…";

  try {
    const res = await fetch(apiUrl("next", "route/compute"));
    out.textContent = `Yanıt: ${res.status} ${res.statusText}`;
    toast("Rota servisi ısıtıldı.", "ok");
  } catch (err) {
    out.textContent = `Hata: ${err.message}`;
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
  }
});

// ---------------- Durak detay ----------------

const stopDetailBody = $("#stop-detail-body");

async function openStopDetail(kod, ad) {
  stopLiveRefresh();
  state.currentStop = { kod, ad };
  showView("stop-detail");

  stopDetailBody.innerHTML = `
    <div class="detail-head">
      <div>
        <h2>${esc(ad || "Durak")}</h2>
        <div class="sub">Durak kodu: ${esc(kod)}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Canlı araçlar</h3><span class="badge" id="sd-live-time">—</span></div>
      <div id="sd-live"><div class="skeleton"></div><div class="skeleton"></div></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Geçen hatlar</h3></div>
      <div id="sd-lines"><div class="skeleton"></div></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Geçiş saatleri</h3></div>
      <div class="chip-row" id="sd-days">
        <button class="chip active" data-day="HAFTA İÇİ">Hafta içi</button>
        <button class="chip" data-day="CUMARTESİ">Cumartesi</button>
        <button class="chip" data-day="PAZAR">Pazar</button>
      </div>
      <div id="sd-line-chips" class="chip-row"></div>
      <div id="sd-times" class="muted small">Bir hat seçin.</div>
    </div>
  `;

  // Geçen hatlar + canlı araçlar paralel
  loadStopLines(kod);
  loadStopLive(kod);
}

async function loadStopLines(kod) {
  const box = $("#sd-lines");
  try {
    const data = await hibrit("action.asp", { FNC: "DuraktanGecenHatlar", KOD: kod });
    const rows = data?.table || [];
    state.stopLines = rows;

    if (!rows.length) {
      box.innerHTML = `<p class="muted small">Bu duraktan geçen hat bilgisi yok.</p>`;
      return;
    }

    box.innerHTML = rows
      .map(
        (l) => `
          <button class="list-item" data-action="line" data-kod="${esc(l.kod)}" data-ad="${esc(l.ad)}">
            <span class="code-pill">${esc(l.kod)}</span>
            <span class="li-main">
              <span class="li-title">${esc(l.ad)}</span>
              <span class="li-sub">${esc(l.detay || l.tur || "")}</span>
            </span>
            <span class="li-right">›</span>
          </button>
        `,
      )
      .join("");

    // Geçiş saatleri için hat çipleri
    $("#sd-line-chips").innerHTML = rows
      .map(
        (l, i) =>
          `<button class="chip ${i === 0 ? "active" : ""}" data-line="${esc(l.kod)}">${esc(l.kod)}</button>`,
      )
      .join("");

    if (rows[0]) loadStopTimes(rows[0].kod, "HAFTA İÇİ");
  } catch (err) {
    box.innerHTML = `<p class="muted small">Hatlar yüklenemedi: ${esc(err.message)}</p>`;
  }
}

async function loadStopTimes(hat, tur) {
  const box = $("#sd-times");
  if (!state.currentStop) return;
  box.innerHTML = `<div class="skeleton" style="height:40px"></div>`;

  try {
    const data = await hibrit("action.asp", {
      FNC: "DuraktanGecisSaatleri",
      HAT: hat,
      TUR: tur,
      DURAK: state.currentStop.kod,
    });
    const rows = data?.table || [];

    if (!rows.length) {
      box.innerHTML = `<p class="muted small">Bu hat ve gün için saat bilgisi yok.</p>`;
      return;
    }

    box.innerHTML = `
      <div class="muted small" style="margin-bottom:2px">Hat ${esc(hat)} · ${esc(tur)}</div>
      <div class="times">
        ${rows
          .map((r) => `<span class="time-chip">${esc(r.saat)}:${esc(String(r.dakika).padStart(2, "0"))}</span>`)
          .join("")}
      </div>
    `;
  } catch (err) {
    box.innerHTML = `<p class="muted small">Saatler yüklenemedi: ${esc(err.message)}</p>`;
  }
}

// Durak detayındaki çip tıklamaları
stopDetailBody.addEventListener("click", (e) => {
  const day = e.target.closest("[data-day]");
  if (day) {
    $("#sd-days").querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === day));
    const active = $("#sd-line-chips .chip.active");
    if (active) loadStopTimes(active.dataset.line, day.dataset.day);
    return;
  }

  const line = e.target.closest("#sd-line-chips [data-line]");
  if (line) {
    $("#sd-line-chips").querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === line));
    const activeDay = $("#sd-days .chip.active");
    loadStopTimes(line.dataset.line, activeDay?.dataset.day || "HAFTA İÇİ");
  }
});

// ---------------- Canlı araçlar ----------------

async function loadStopLive(kod) {
  const box = $("#sd-live");
  try {
    const data = await hibrit("srv.asp", { FNC: "Otobusler", DURAK: kod });
    renderVehicles(box, data?.table || []);
    state.liveTarget = { stop: kod, line: null };
    startLiveRefresh();
    const t = $("#sd-live-time");
    if (t) t.textContent = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  } catch (err) {
    box.innerHTML = `<p class="muted small">Canlı veri alınamadı: ${esc(err.message)}</p>`;
  }
}

/** Hat detayında yalnızca o hattın araçlarını getirir (FNC=Otobus). */
async function loadLineLive(hat, durak, badge) {
  const box = $("#ld-live");
  try {
    const data = await hibrit("srv.asp", { FNC: "Otobus", DURAK: durak, HAT: hat });
    renderVehicles(box, data?.table || []);
    if (badge) badge.textContent = `${durak} durağına göre`;
  } catch (err) {
    box.innerHTML = `<p class="muted small">Canlı veri alınamadı: ${esc(err.message)}</p>`;
  }
}

function renderVehicles(box, table) {
  if (!table.length) {
    box.innerHTML = `<p class="muted small">Şu an bu durak için canlı araç verisi yok.</p>`;
    return;
  }

  // "Sonraki hareket" satırları (arac_no === "-") program bilgisidir; canlı
  // araçların altında gösterilir. Canlı araçlar ise varış süresine göre
  // sıralanır, böylece en yakın otobüs en üstte olur.
  const nextRows = table.filter((r) => r.arac_no === "-");
  const vehicles = table
    .filter((r) => r.arac_no !== "-")
    .sort((a, b) => vehicleEta(a) - vehicleEta(b));

  let html = "";

  if (!vehicles.length && !nextRows.length) {
    box.innerHTML = `<p class="muted small">Araç bulunamadı.</p>`;
    return;
  }

  html += vehicles.map(vehicleCard).join("");

  html += nextRows
    .map(
      (next) => `
      <div class="vehicle next">
        <div class="v-main">
          <div class="v-title">${esc(next.hat_no || next.hat_kod || "Hat")}</div>
          <div class="v-sub">${esc(String(next.sure || "").replace(/\n/g, " · "))}</div>
          ${next.hat_ad ? `<div class="v-sub" style="color:#fcd34d">🚌 ${esc(next.hat_ad)}</div>` : ""}
        </div>
        <div class="v-eta"><span class="eta">Program</span></div>
      </div>
    `,
    )
    .join("");

  box.innerHTML = html;
}

/** Varış süresini saniye cinsinden döndürür; bilinmeyenler sona gider. */
function vehicleEta(v) {
  const sure = String(v.sure || "").toLowerCase();

  // Durum metni sayısal değerden daha güvenilir
  if (sure.includes("geçti")) return Number.MAX_SAFE_INTEGER;
  if (sure.includes("geldi")) return -1;

  const seconds = Number(v.saniye);
  if (Number.isFinite(seconds) && seconds >= 0 && seconds < 999999) {
    return seconds;
  }

  return Number.MAX_SAFE_INTEGER - 1;
}

function vehicleCard(v) {
  const sure = String(v.sure || "").trim();
  const cls = sure === "Geldi" ? "ok" : sure === "Geçti" ? "bad" : "";
  const statusPill = sure ? `<span class="eta">${esc(sure)}</span>` : `<span class="eta">—</span>`;

  const lineNo = v.hat_no || v.hat_kod || "Hat";

  const meta = [];
  if (v.arac_no && v.arac_no !== v.plaka_no) meta.push(`🚍 ${esc(v.arac_no)}`);
  if (v.plaka_no) meta.push(`🚗 ${esc(v.plaka_no)}`);
  if (v.hiz) meta.push(`⚡ ${esc(v.hiz)}`);
  if (v.trafik?.label) meta.push(`🚦 ${esc(v.trafik.label)}`);
  if (v.detay) meta.push(esc(v.detay));

  return `
    <div class="vehicle ${cls}">
      <div class="v-main">
        <div class="v-title">${esc(lineNo)}</div>
        ${v.hat_ad ? `<div class="v-sub" style="color:#93c5fd">🚌 ${esc(v.hat_ad)}</div>` : ""}
        <div class="v-sub">${meta.join(" · ")}</div>
      </div>
      <div class="v-eta">
        ${statusPill}
        ${v.saniye && v.saniye !== "999999" ? `<div class="eta-sub">${esc(v.saniye)} sn</div>` : ""}
      </div>
    </div>
  `;
}

function startLiveRefresh() {
  stopLiveRefresh();
  state.liveTimer = setInterval(() => {
    if (!$('[data-view="stop-detail"]').classList.contains("active")) return;
    if (state.liveTarget?.stop) loadStopLive(state.liveTarget.stop);
  }, 30_000);
}

function stopLiveRefresh() {
  if (state.liveTimer) {
    clearInterval(state.liveTimer);
    state.liveTimer = null;
  }
}

// ---------------- Hat detay ----------------

const lineDetailBody = $("#line-detail-body");

async function openLineDetail(kod, ad) {
  stopLiveRefresh();
  state.currentLine = { kod, ad };
  showView("line-detail");

  lineDetailBody.innerHTML = `
    <div class="detail-head">
      <div>
        <h2>${esc(ad || "Hat")}</h2>
        <div class="sub">Hat kodu: ${esc(kod)}</div>
      </div>
      <span class="badge" id="ld-badge">Yükleniyor…</span>
    </div>

    <div class="card">
      <div class="card-head"><h3>Canlı araçlar</h3><span class="badge" id="ld-live-badge">hat</span></div>
      <div id="ld-live"><div class="skeleton"></div></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Duraklar</h3><span class="badge" id="ld-count">—</span></div>
      <div id="ld-stops"><div class="skeleton"></div><div class="skeleton"></div></div>
    </div>
  `;

  try {
    const data = await hibrit("act.asp", { FNC: "HatBilgileri", KOD: kod, YOL: "TRUE" });
    const info = data?.table?.[0];
    const stops = data?.table_durak || [];

    if (info) {
      $("#ld-badge").textContent = [info.sure ? `${info.sure} dk` : null, info.mesafe ? `${info.mesafe} km` : null]
        .filter(Boolean)
        .join(" · ") || "Hat";
    }

    $("#ld-count").textContent = `${stops.length} durak`;

    // Canlı araçlar: hattın ilk durağına göre varışlar
    if (stops[0]) {
      loadLineLive(kod, stops[0].kod, $("#ld-live-badge"));
    } else {
      $("#ld-live").innerHTML = `<p class="muted small">Canlı veri için durak bulunamadı.</p>`;
    }

    if (!stops.length) {
      $("#ld-stops").innerHTML = `<p class="muted small">Durak listesi boş.</p>`;
      return;
    }

    $("#ld-stops").innerHTML = `
      <ul class="timeline">
        ${stops
          .map(
            (s, i) => `
          <li class="${i === 0 ? "first" : ""}">
            <button class="tl-item" data-action="stop" data-kod="${esc(s.kod)}" data-ad="${esc(s.ad)}">
              <span class="tl-seq">${esc(s.sira || i + 1)}</span>
              <span class="tl-body">
                <span class="tl-title">${esc(s.ad)}</span>
                <span class="tl-sub">${esc(s.kod)}${s.konum ? ` · ${esc(s.konum)}` : ""}</span>
              </span>
              <span class="li-right">›</span>
            </button>
          </li>`,
          )
          .join("")}
      </ul>
    `;
  } catch (err) {
    $("#ld-stops").innerHTML = `<p class="muted small">Hat bilgisi yüklenemedi: ${esc(err.message)}</p>`;
    toast(err.message, "error");
  }
}

// ---------------- Genel tıklama delegasyonu ----------------

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;

  const { action, kod, ad } = el.dataset;
  if (!kod) return;

  if (action === "stop") openStopDetail(kod, ad);
  if (action === "line") openLineDetail(kod, ad);
});

// ---------------- Geri butonları ----------------

$("#stop-back").addEventListener("click", () => {
  stopLiveRefresh();
  showView("home");
});

$("#line-back").addEventListener("click", () => {
  showView("lines");
});

// ---------------- Yenile ----------------

$("#refresh-btn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.classList.add("spinning");

  const active = $(".view.active")?.dataset.view;

  try {
    if (active === "home") {
      state.newsLoaded = false;
      await Promise.all([loadHomeNews(), loadHomeStatus()]);
      toast("Ana sayfa güncellendi.", "ok", 1800);
    } else if (active === "news") {
      await loadNews(true);
      toast("Duyurular güncellendi.", "ok", 1800);
    } else if (active === "lines") {
      state.lines = null;
      await loadLines();
      toast("Hatlar güncellendi.", "ok", 1800);
    } else if (active === "settings") {
      state.settingsLoaded = false;
      await loadSettings();
      toast("Ayarlar güncellendi.", "ok", 1800);
    } else if (active === "stop-detail" && state.currentStop) {
      await Promise.all([loadStopLines(state.currentStop.kod), loadStopLive(state.currentStop.kod)]);
      toast("Durak güncellendi.", "ok", 1800);
    } else if (active === "line-detail" && state.currentLine) {
      await openLineDetail(state.currentLine.kod, state.currentLine.ad);
      toast("Hat güncellendi.", "ok", 1800);
    }
  } catch (err) {
    toast(err.message, "error");
  } finally {
    setTimeout(() => btn.classList.remove("spinning"), 400);
  }
});

// ---------------- Boş durum yardımcısı ----------------

function emptyState(icon, text) {
  return `<div class="empty"><div class="empty-ico">${icon}</div><p>${text}</p></div>`;
}

// ---------------- İlk yükleme ----------------

loadHomeNews();
loadHomeStatus();

// Çevrimdışı/çevrimiçi bilgisi
window.addEventListener("offline", () => toast("Bağlantı kesildi.", "error"));
window.addEventListener("online", () => toast("Bağlantı geri geldi.", "ok", 1800));
