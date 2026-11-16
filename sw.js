// 金禾鍋貼 PWA Service Worker
// 策略：頁面「網路優先、離線退回快取」；其他資源「先用快取、背景更新」。
const VERSION = 'v4';
const CACHE = 'jinhe-' + VERSION;
const SHELL = [
  './',
  './index.html',
  './config.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('jinhe-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;

  // Google Apps Script（菜單／訂單）一律走網路，不快取
  const host = new URL(req.url).hostname;
  if (host === 'script.google.com' || host.endsWith('.googleusercontent.com') || host.endsWith('.google.com')) return;

  // 頁面導覽與設定檔：網路優先
  if (req.mode === 'navigate' || new URL(req.url).pathname.endsWith('/config.js')) {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? './index.html' : req, copy)); return res; })
        .catch(() => caches.match(req.mode === 'navigate' ? './index.html' : req))
    );
    return;
  }

  // 其他資源（圖片、字型、CDN 腳本）：先快取、背景更新
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
