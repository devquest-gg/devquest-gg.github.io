/* DevQuest service worker — minimal, privacy-safe. It exists so the site is installable to the
 * home screen and launches fast. No tracking, no analytics here. Strategy: NETWORK-FIRST for the
 * app shell (online visitors always get the freshest index.html, so deploys show immediately), with
 * a cached copy as an offline fallback only. The live data files (jobs.js / jobs.json / trends.json /
 * seen.json) and any API calls are never intercepted, so jobs are always fresh. Bump CACHE to flush. */
const CACHE = "devquest-shell-v1";
const SHELL = ["/", "/index.html", "/favicon.svg", "/icon-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = req.url;
  // Never touch live data or cross-origin/API requests — let the network handle them (always fresh).
  if (!url.startsWith(self.location.origin)) return;
  if (/\.(json|js)(\?|$)/i.test(url) || url.includes("/cdn-cgi/")) return;
  // Network-first for everything else (HTML, icons, css-in-html): fresh when online, cache when offline.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/")))
  );
});
