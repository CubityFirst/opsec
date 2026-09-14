/**
 * Service worker: the minimum a PWA needs to be installable, and nothing that
 * can serve stale application code.
 *
 * - Navigations are network-first with the last good shell as the offline
 *   fallback, so a deploy is picked up on the next load.
 * - `/assets/*` is content-hashed by Vite, so it is cache-first and immutable;
 *   a new build simply asks for new filenames.
 * - The icons and manifest are cache-first too (they change with VERSION).
 * - Everything else — the API, iCalendar feeds, MCP, Cloudflare's /cdn-cgi
 *   endpoints, map tiles and any other cross-origin request — is passed
 *   straight through and never cached. This app is about live data; the offline
 *   story is deliberately "the shell loads and tells you the network is gone".
 *
 * Bump VERSION to drop every cache on the next activation.
 */
const VERSION = "v1";
const SHELL_CACHE = `opsec-shell-${VERSION}`;
const STATIC_CACHE = `opsec-static-${VERSION}`;
const SHELL_KEY = "/index.html";
const STATIC_PATHS = new Set(["/favicon.svg", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png", "/manifest.webmanifest"]);

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== SHELL_CACHE && key !== STATIC_CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

/** Network, falling back to the cached shell when offline. */
async function shellFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(SHELL_KEY, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(SHELL_KEY);
    if (cached) return cached;
    throw err;
  }
}

/** Cache, falling back to the network (and filling the cache on the way). */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(shellFirst(request));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
  if (STATIC_PATHS.has(url.pathname)) event.respondWith(cacheFirst(request, STATIC_CACHE));
});
