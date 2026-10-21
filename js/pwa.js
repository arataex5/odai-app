/* =========================================================
   pwa.js - Service Worker 登録 / 更新
   http(s) 環境でのみ登録。file:// や Capacitor(APK) では
   ローカルアセットを直接読むためスキップする。
   ========================================================= */
(function () {
  'use strict';
  var proto = location.protocol;
  // Capacitor（APK）で動作している場合は Service Worker を使わない
  var isNative = !!(window.Capacitor && (window.Capacitor.isNativePlatform
    ? window.Capacitor.isNativePlatform() : window.Capacitor.isNative));
  var canSW = !isNative && ('serviceWorker' in navigator) && (proto === 'http:' || proto === 'https:');
  if (!canSW) return;

  window.addEventListener('load', function () {
    // updateViaCache:'none' → sw.js 自体をブラウザキャッシュから読ませない
    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
      .then(function (reg) {
        // 起動のたびに更新チェック
        try { reg.update(); } catch (e) {}
        setInterval(function () { try { reg.update(); } catch (e) {} }, 60 * 60 * 1000);

        reg.addEventListener('updatefound', function () {
          var nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', function () {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              // 新しいバージョンを即時適用
              nw.postMessage('SKIP_WAITING');
            }
          });
        });
      })
      .catch(function () { /* 登録失敗してもアプリは動作する */ });

    var reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    });
  });
})();
