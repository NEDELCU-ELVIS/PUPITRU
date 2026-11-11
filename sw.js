const CACHE = 'pupitru-v3';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Pagina principală: întâi rețeaua (ca actualizările să apară), cache doar ca rezervă offline
  if (req.mode === 'navigate' || req.url.endsWith('/index.html')) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }
  // Restul (iconițe, manifest): întâi cache, apoi rețea
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});


/* ---------- Notificări push ---------- */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'PUPITRU', body: e.data ? e.data.text() : '' }; }
  const opts = {
    body: d.body || '',
    tag: d.tag || 'pupitru',
    renotify: true,
    data: { url: d.url || './index.html' },
    icon: './icon-192.png',
    badge: './icon-192.png'
  };
  e.waitUntil((async () => {
    await self.registration.showNotification(d.title || 'PUPITRU', opts);
    if (typeof d.badge === 'number' && self.navigator && self.navigator.setAppBadge) {
      try { d.badge > 0 ? await self.navigator.setAppBadge(d.badge) : await self.navigator.clearAppBadge(); } catch (err) {}
    }
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './index.html';
  e.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if (c.url.includes('index.html') || c.url.endsWith('/')) { await c.focus(); return; } }
    await clients.openWindow(target);
  })());
});
