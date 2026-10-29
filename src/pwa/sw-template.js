// DicomLens service worker (written into the build by vite.config.ts).
// Precaches the whole app so it opens and reads files without a network;
// the app never sends files anywhere, so nothing but its own code is cached.
const VERSION = __VERSION__
const FILES = __FILES__
const CACHE = `dicomlens-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('dicomlens-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  // Pages (and files opened by the OS through the file handler) get the app shell.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('./', { cacheName: CACHE, ignoreVary: true })))
    return
  }
  event.respondWith(caches.match(request, { cacheName: CACHE, ignoreSearch: true, ignoreVary: true }).then((cached) => cached ?? fetch(request)))
})
