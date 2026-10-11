(async () => {
  if ('serviceWorker' in navigator) {
    for (const registration of await navigator.serviceWorker.getRegistrations()) {
      if (registration.active?.scriptURL === location.origin + '/sw.js') await registration.unregister();
    }
  }
  if ('caches' in window) {
    for (const name of await caches.keys()) if (name.startsWith('planificador-')) await caches.delete(name);
  }
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('planificador-') && !['planificador-tema', 'planificador-v2-carrera', 'planificador-banner-oculto', 'planificador-cal-plegado'].includes(key)) localStorage.removeItem(key);
  }
})().catch(() => {});
