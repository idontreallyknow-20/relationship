/* Service worker for Cami & Joseph.
   Offline shell + static asset caching + web push. */

const VERSION = "cj-v1";
const OFFLINE_URL = "/offline";
const PRECACHE = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/badge-96.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, offline shell as fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((res) => res || Response.error())
      )
    );
    return;
  }

  // Hashed build assets and icons: cache first.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Cami & Joseph", body: "Something new is waiting for you" };
  }
  const title = data.title || "Cami & Joseph";
  const options = {
    body: data.body || "Something new is waiting for you",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: data.tag || undefined,
    // Replacing a same-tag notification should still buzz.
    renotify: Boolean(data.tag),
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Browsers rotate push subscriptions; without this the old endpoint dies
// silently. Re-subscribe here, and the app stores the new endpoint
// server-side the next time it opens.
self.addEventListener("pushsubscriptionchange", (event) => {
  const options =
    (event.oldSubscription && event.oldSubscription.options) || { userVisibleOnly: true };
  event.waitUntil(
    self.registration.pushManager.subscribe(options).catch(() => null)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const client = clients.find((c) => "focus" in c);
        if (client) {
          // Await the whole chain so the worker is not killed mid-navigation.
          return client
            .focus()
            .then((focused) =>
              focused && "navigate" in focused ? focused.navigate(target) : undefined
            )
            .catch(() => self.clients.openWindow(target));
        }
        return self.clients.openWindow(target);
      })
  );
});
