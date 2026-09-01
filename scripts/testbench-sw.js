/*
 * Self-destructing service worker.
 *
 * Mainsail ships as a PWA, so a browser that has visited this printer before
 * holds a registered service worker precaching the previous build. After the
 * web root is replaced that worker keeps serving the OLD bundle -- which, for
 * a plugin test bench, means a Mainsail with no custom-panel code at all: the
 * panel is absent and there is no setting to enable it, because that build
 * does not know panels exist. A hard refresh does not reliably bypass it.
 *
 * Browsers re-fetch sw.js on navigation, so replacing it with this file
 * uninstalls the old worker and drops its caches on the client's next visit,
 * with no DevTools work by the user.
 *
 * A test bench has no use for offline precaching, so nothing replaces it.
 */
self.addEventListener('install', () => {
    self.skipWaiting()
})

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys()
            await Promise.all(keys.map((key) => caches.delete(key)))
            await self.registration.unregister()

            // Reload any open tab so it picks up the real bundle immediately
            // instead of showing stale content until the next manual refresh.
            const clients = await self.clients.matchAll({ type: 'window' })
            clients.forEach((client) => client.navigate(client.url))
        })()
    )
})

// Never serve from cache; always go to the network while we wind down.
self.addEventListener('fetch', () => {})
