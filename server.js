// EGO Cepte — Bun sunucusu
// 1) public/ altındaki statik dosyaları sunar
// 2) EGO API'lerine CORS başlıklı proxy yapar
//
// Proxy yolları:
//   /api/hibrit/<endpoint>?<params>  -> https://egocptsrvand.ego.gov.tr/hibrit/<endpoint>
//   /api/next/config                 -> https://egocptngapi.ego.gov.tr/api/config
//   /api/next/config/ssl-pins        -> https://egocptngapi.ego.gov.tr/api/config/ssl-pins
//   /api/next/geocode                -> https://egocptngapi.ego.gov.tr/api/geocode
//   /api/next/route/compute          -> https://egocptngapi.ego.gov.tr/v1/route/compute

const PUBLIC_DIR = `${import.meta.dir}/public`;

const EGO_HIBRIT_BASE = "https://egocptsrvand.ego.gov.tr/hibrit/";
const EGO_NG_BASE = "https://egocptngapi.ego.gov.tr";

// Yeni nesil API yönlendirme tablosu
const NG_ROUTES = new Map([
  ["/api/next/config", "/api/config"],
  ["/api/next/config/ssl-pins", "/api/config/ssl-pins"],
  ["/api/next/geocode", "/api/geocode"],
  ["/api/next/route/compute", "/v1/route/compute"],
]);

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "*",
  "access-control-max-age": "86400",
};

/**
 * Hedef adrese istek atıp yanıtı tarayıcıya CORS başlıklarıyla döndürür.
 * EGO uçları text/html content-type döndürse de gövde JSON'dur; olduğu gibi aktarılır.
 */
async function proxyRequest(targetUrl, req) {
  const upstream = await fetch(targetUrl, {
    method: "GET",
    redirect: "follow",
    headers: {
      "user-agent": "EgoCepte/1.0",
      accept: "application/json, text/plain, */*",
      "accept-language": "tr-TR,tr;q=0.9",
    },
  });

  // Upstream gövdesini olduğu gibi al
  const body = await upstream.arrayBuffer();

  const headers = new Headers(CORS_HEADERS);
  headers.set(
    "content-type",
    upstream.headers.get("content-type") || "application/json; charset=utf-8",
  );
  headers.set("cache-control", "no-store");

  return new Response(body, {
    status: upstream.status,
    headers,
  });
}

const server = Bun.serve({
  port: Number(process.env.PORT) || 3000,
  hostname: "0.0.0.0",

  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ---- Yeni nesil API proxy ----
    if (NG_ROUTES.has(path)) {
      const target = EGO_NG_BASE + NG_ROUTES.get(path) + url.search;
      try {
        return await proxyRequest(target, req);
      } catch (err) {
        return Response.json(
          { error: `Yeni API'ye ulaşılamadı: ${err.message}` },
          { status: 502, headers: CORS_HEADERS },
        );
      }
    }

    // ---- Hibrit ASP proxy ----
    if (path.startsWith("/api/hibrit/")) {
      const rest = path.slice("/api/hibrit/".length);
      const target = EGO_HIBRIT_BASE + rest + url.search;
      try {
        return await proxyRequest(target, req);
      } catch (err) {
        return Response.json(
          { error: `EGO servisine ulaşılamadı: ${err.message}` },
          { status: 502, headers: CORS_HEADERS },
        );
      }
    }

    // ---- Statik dosyalar ----
    let filePath = path === "/" ? "/index.html" : path;

    // Dizin dışına çıkmayı engelle
    if (filePath.includes("..")) {
      return new Response("Bad request", { status: 400 });
    }

    const file = Bun.file(PUBLIC_DIR + filePath);
    if (await file.exists()) {
      return new Response(file, {
        headers: { "cache-control": "no-cache" },
      });
    }

    // SPA fallback: bilinmeyen yollar index.html'e düşsün
    const index = Bun.file(`${PUBLIC_DIR}/index.html`);
    if (await index.exists()) {
      return new Response(index, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`\n🚌  EGO Cepte çalışıyor: http://localhost:${server.port}\n`);
