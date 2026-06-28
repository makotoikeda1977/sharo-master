/* Service Worker — オフラインでも使えるよう静的アセットをキャッシュ */
const CACHE = 'sharo-v780';
const ASSETS = [
  './',
  './index.html',
  './privacy.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './js/content.js',
  './js/srs.js',
  './js/storage.js',
  './js/import.js',
  './js/app.js',
  './js/billing.js',
  // 科目マスコット(runtime参照・初回オフラインでも表示できるようprecache)
  './icons/chars/anei.png',
  './icons/chars/chiho.png',
  './icons/chars/choshu.png',
  './icons/chars/hiyatoi.png',
  './icons/chars/kenpo.png',
  './icons/chars/kijun.png',
  './icons/chars/kokka.png',
  './icons/chars/kokunen.png',
  './icons/chars/konen.png',
  './icons/chars/koyo.png',
  './icons/chars/roippan.png',
  './icons/chars/rosai.png',
  './icons/chars/shain.png',
  './icons/chars/shaippan.png',
  './icons/chars/shigaku.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const req = e.request;

  // HTMLナビゲーションはネットワーク優先(常に最新)。オフライン時はキャッシュへフォールバック
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // 静的アセット(content.js等の版固定資産)はキャッシュ優先＝起動ごとの再取得・再パースを回避。
  // 裏で更新があれば取得してキャッシュ更新(stale-while-revalidate)。配信はCACHE名のバージョンで管理。
  e.respondWith(
    caches.match(req).then((hit) => {
      const fetching = fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || fetching;
    })
  );
});
