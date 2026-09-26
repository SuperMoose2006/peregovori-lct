// sw.js — minimal offline-shell service worker for «Диалог».
//
// The build injects its hashed JS/CSS paths below. A first visit must cache
// these too: the initial entry loaded before this worker gained control.
// The cache namespace remains stable across releases so an already-open tab
// can still load its old hashed chunks. Evicting obsolete build assets is a
// separate maintenance policy; do not delete caches owned by other apps.
// Navigations refresh the shell online and fall back to its cached copy offline.
//
// The API/WebSocket turn-protocol is NEVER cached — the negotiation must always hit
// the live backend (or the in-page mock), never a stale reply.
const CACHE_VERSION = "dialog-v1";
const BUILD_ASSETS = [];
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((c) => c.addAll([...SHELL, ...BUILD_ASSETS])),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("dialog-") && k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave cross-origin alone
  // Never touch the live turn-protocol (REST + WebSocket) — always the network.
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/ws")) return;
  // Dev-server internals (Vite HMR, raw source modules) must never be cached, or a
  // reload would serve stale JS. Harmless in prod (these paths don't exist there).
  if (
    url.pathname.startsWith("/@") ||
    url.pathname.startsWith("/src/") ||
    url.pathname.startsWith("/node_modules/") ||
    url.pathname.startsWith("/.vite/")
  ) {
    return;
  }

  // Navigations → network-first, cached-shell fallback offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put("/index.html", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/index.html").then((r) => r || caches.match("/"))),
    );
    return;
  }

  // Static assets → cache-first, populate on first fetch.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }),
    ),
  );
});
