// sw.js — minimal offline cache for articles (PWA P2-12, zero-budget, no build step)
// Cache-first for article HTML, network-first for homepage. Keeps pipeline untouched.
const CACHE = "jachaidesk-v1";
const OFFLINE_URL = "/";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (e.request.method !== "GET") return;

  // Article pages: cache-first, fallback to network
  if (url.pathname.startsWith("/article/")) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const fetchPromise = fetch(e.request).then((resp) => {
          if (resp.ok) caches.open(CACHE).then((c) => c.put(e.request, resp.clone()));
          return resp;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Everything else: network-first, fallback to cache
  e.respondWith(
    fetch(e.request).then((resp) => {
      if (resp.ok && url.pathname.startsWith("/")) caches.open(CACHE).then((c) => c.put(e.request, resp.clone()));
      return resp;
    }).catch(() => caches.match(e.request))
  );
});
