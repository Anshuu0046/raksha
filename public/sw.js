/* Raksha service worker: offline fallback, app-shell caching, and push alerts.
 * Sensitive data is never cached here: API responses and /emergency/* pages always go to the
 * network. Only the signed-in app shell (/app, /app/helplines) and static assets are cached so
 * SOS can be pressed and queued with no connection.
 */
const VERSION = "raksha-v2";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/icons/badge-96.png", "/icon.svg"];
const CACHEABLE_PAGES = ["/app", "/app/helplines"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  // Sent on sign-out / account deletion: drop cached pages that contain account data.
  if (event.data === "raksha:clear-cache") {
    event.waitUntil(caches.delete(PAGE_CACHE));
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/emergency/") || url.pathname.startsWith("/alerts/")) return;

  // Immutable build assets: cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/icon.svg") {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Page navigations: network-first; fall back to the cached shell, then the offline page.
  if (req.mode === "navigate") {
    const cacheable = CACHEABLE_PAGES.includes(url.pathname);
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (cacheable && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(url.pathname, { cacheName: PAGE_CACHE })) || (await caches.match("/offline.html")) || Response.error()),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Raksha", body: event.data ? event.data.text() : "" };
  }
  const urgent = Boolean(data.urgent);
  event.waitUntil(
    self.registration.showNotification(data.title || "Raksha", {
      body: data.body || "",
      tag: data.tag || "raksha",
      renotify: true,
      requireInteraction: urgent,
      vibrate: urgent ? [500, 200, 500, 200, 500] : [200],
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url === target && "focus" in w) return w.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
