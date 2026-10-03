/* App shell only. Frozen HTML copies live in IndexedDB and are NEVER refreshed here. */
const VERSION = 'pocket-shell-v2.0.0';
const ROOT = new URL('./', self.location.href).href;
const CACHE = VERSION + ':' + ROOT;
const SHELL = ['index.html','config.js','features.js','snapshot.js','features.css','manifest.webmanifest','icon.svg'];
const URLS = SHELL.map(p => new URL(p, ROOT).href);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Fail installation if any essential file is missing; don't claim offline readiness.
    await cache.addAll(URLS.map(u => new Request(u, {cache:'reload'})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('pocket-shell-') && key.endsWith(':'+ROOT) && key!==CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET') return;
  // Handle only our own known shell URLs, never public HTMLs, API responses or other apps.
  const main = request.mode==='navigate' && (url.href.split(/[?#]/)[0]===ROOT || url.href.split(/[?#]/)[0]===ROOT+'index.html');
  const shell = URLS.includes(url.href.split(/[?#]/)[0]);
  if (!main && !shell) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = main ? ROOT+'index.html' : url.href.split(/[?#]/)[0];
    try {
      const response = await fetch(new Request(key,{cache:'no-cache',signal:AbortSignal.timeout(3500)}));
      if (!response.ok) throw new Error('App resource unavailable');
      await cache.put(key,response.clone());
      return response;
    } catch (_) {
      const stored=await cache.match(key);
      return stored || new Response('Offline setup incomplete. Open this site online once.',{status:503,headers:{'Content-Type':'text/plain'}});
    }
  })());
});
self.addEventListener('message', event => {
  if(event.data?.type==='CHECK_SHELL') event.waitUntil((async()=>{
    const cache=await caches.open(CACHE),ready=(await Promise.all(URLS.map(u=>cache.match(u)))).every(Boolean);
    event.ports[0]?.postMessage({ready});
  })());
});
