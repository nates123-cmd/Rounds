/* Rounds service worker. Bump CACHE on every ship (the /ship skill does it). */
const CACHE = 'rounds-v8'
self.addEventListener('install', (e) => { self.skipWaiting() })
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
/* Network first for everything on our origin; fall back to cache when offline.
 * Google and Supabase calls are never cached here. */
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone()
      caches.open(CACHE).then((c) => c.put(e.request, copy))
      return res
    }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('./'))),
  )
})
