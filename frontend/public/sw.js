// sw.js — minimal offline-shell service worker for «Диалог».
//
// Anti-stale design: the cache name carries a VERSION. On activate we delete every
// cache that isn't the current version, so a freshly deployed SW can never serve
// assets from a previous generation. Navigations are network-first (so the shell
// HTML — and the hashed asset URLs it references — stay fresh, falling back to the
// cached shell only when offline). Content-hashed static assets are cache-first (a
// cached hit is always correct because the hash changes when the bytes change).
//
// The API/WebSocket turn-protocol is NEVER cached — the negotiation must always hit
// the live backend (or the in-page mock), never a stale reply.
const CACHE_VERSION = "dialog-dev-shell";
const PRECACHE = /* BUILD_PRECACHE */ [];
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((c) => c.addAll([...new Set([...SHELL, ...PRECACHE])]))
      // An incomplete install never replaces the last working offline version.
      .then(() => self.skipWaiting()),
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
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/ws") || url.pathname.startsWith("/v1/realtime")) return;
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
          if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put("/index.html", copy)).catch(() => {});
          }
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
