/**
 * Service Worker de LectorVoz.
 *
 * Estrategias:
 *  - App shell (navegaciones): red primero, caché como respaldo → la app
 *    abre incluso sin conexión después de la primera visita.
 *  - Archivos estáticos de Next (/_next/static) e iconos: caché primero
 *    (son inmutables / tienen hash).
 *  - /api/*: siempre red (no se cachea).
 *
 * Para publicar una nueva versión de la PWA, sube VERSION (p. ej. "v1.0.1");
 * los cachés viejos se limpian solos al activarse.
 */
const VERSION = "v1.0.0";
const STATIC_CACHE = `lectorvoz-static-${VERSION}`;
const RUNTIME_CACHE = `lectorvoz-runtime-${VERSION}`;

/** App shell precargada en la instalación */
const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("lectorvoz-") && !key.endsWith(VERSION))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Solo GET y mismo origen
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // La API nunca se cachea
  if (url.pathname.startsWith("/api/")) return;

  // 1) Navegaciones (HTML): red primero, caché de respaldo (modo offline)
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put("/", response.clone());
          return response;
        } catch (err) {
          const cached =
            (await caches.match(request)) ||
            (await caches.match("/")) ||
            (await caches.match("/", { ignoreSearch: true }));
          if (cached) return cached;
          return new Response(
            "<h1>Sin conexión</h1><p>Abre LectorVoz una vez con internet para habilitar el modo offline.</p>",
            { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        }
      })()
    );
    return;
  }

  // 2) Estáticos inmutables: caché primero
  const isImmutable =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json";

  if (isImmutable) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })()
    );
    return;
  }

  // 3) Resto (RSC, prefetches, worker del PDF, etc.): red primero con respaldo
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw err;
      }
    })()
  );
});
