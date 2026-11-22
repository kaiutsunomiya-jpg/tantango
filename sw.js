/* v10: GitHub Actionsが生成するindex.jsonにより同梱CSVを動的にキャッシュします。 */
const CACHE = 'tantango-pwa-v10';
const CORE = [
  './', './index.html', './app.js?v=10', './styles.css?v=10',
  './manifest.webmanifest', './icons/icon-192.png',
  './icons/icon-512.png', './icons/apple-touch-icon.png',
  './VocabularySets/index.json'
];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    // オフライン初回起動でも全セットを使えるよう、CSVを事前にキャッシュ。
    try {
      const index = await (await cache.match('./VocabularySets/index.json')).json();
      const paths = (index.files || []).map(item => item && typeof item === 'object' ? item.path : '')
        .filter(path => typeof path === 'string' && /^(Flash|Vocabulary)\/[^/\\]+\.csv$/i.test(path));
      await Promise.allSettled(paths.map(path =>
        cache.add(`./VocabularySets/${path.split('/').map(encodeURIComponent).join('/')}`)));
    } catch (error) {
      console.warn('CSV pre-cache failed:', error);
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key =>
      (key.startsWith('tantango-pwa-') || key.startsWith('kotobadeck-pwa-')) && key !== CACHE
    ).map(key => caches.delete(key)))),
    self.clients.claim(),
  ]));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone()).catch(() => {});
      return response;
    } catch (error) {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});
