const CACHE_NAME = 'encore-solo-pwa-v1.0.0';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icons/encore-192.png',
  './icons/encore-512.png'
];
self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>{ if(k!==CACHE_NAME) return caches.delete(k); }))))
});
self.addEventListener('fetch', e=>{
  const req=e.request; e.respondWith(
    caches.match(req).then(res=> res || fetch(req).then(net=>{ 
      if(req.method==='GET' && new URL(req.url).origin===location.origin){
        const copy=net.clone(); caches.open(CACHE_NAME).then(c=>c.put(req, copy));
      } return net; }))
  );
});
