/* =========================================================
   sw.js - お題ボックス 完全オフライン対応 Service Worker
   すべて相対パスで登録（サブディレクトリ配置 / APK化に対応）
   ========================================================= */
/* アプリを更新したら APP_VERSION を上げること（キャッシュが作り直されます） */
var APP_VERSION = '1.2.2';
var CACHE = 'odai-box-cache-' + APP_VERSION;
var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/themes.css',
  './js/embedded-data.js',
  './js/core/store.js',
  './js/core/timer.js',
  './js/core/app.js',
  './js/core/logos.js',
  './js/core/illust.js',
  './js/pwa.js',
  /* ボードゲーム（ゲームを追加したらここにも追加） */
  './js/games/hodoyoku.js',
  './js/games/awaseyou.js',
  './js/games/wordcchi.js',
  './js/games/pittanko.js',
  './js/games/katakanashi.js',
  /* お題データ */
  './data/hodoyoku/normal.csv',
  './data/hodoyoku/special.csv',
  './data/awaseyou/odai.csv',
  './data/wordcchi/kijun.csv',
  './data/wordcchi/words.csv',
  './data/pittanko/themes.csv',
  './data/katakanashi/odai.csv',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // 1件でも失敗した場合に全体が落ちないよう個別に追加
      return Promise.all(ASSETS.map(function (url) {
        return c.add(new Request(url, { cache: 'reload' })).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return (k === CACHE) ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // 配布ディレクトリ（APK本体・配布情報）はキャッシュせず、そのままネットワークへ
  if (/\.apk$/i.test(url.pathname) || /\/download\//.test(url.pathname)) return;

  // HTML / JS / CSS はネットワーク優先（更新をすぐ反映）＋オフライン時はキャッシュ
  var isCode = (req.mode === 'navigate') ||
               /\.(?:html|js|css)$/i.test(url.pathname) ||
               url.pathname === '/' || url.pathname.slice(-1) === '/';

  if (isCode) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (r) {
          return r || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // 画像 / CSV などはキャッシュ優先（裏で更新）
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (cached) {
      if (cached) {
        fetch(req).then(function (res) {
          if (res && res.ok) caches.open(CACHE).then(function (c) { c.put(req, res.clone()); });
        }).catch(function () {});
        return cached;
      }
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match('./index.html');
      });
    })
  );
});

self.addEventListener('message', function (e) {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
