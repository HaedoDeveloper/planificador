/* Retire previously installed offline versions. Do not cache portal responses. */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('planificador-')) await caches.delete(name);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({type: 'window'})) client.postMessage({type: 'offline-retired'});
  })());
});
