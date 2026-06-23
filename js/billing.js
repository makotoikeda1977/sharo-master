/*
 * iOS課金ブリッジ（App Store In-App Purchase）
 * ----------------------------------------------------------------------------
 * Capacitor + cordova-plugin-purchase(v13, グローバル `CdvPurchase`) を前提に、
 * window.SharoBilling (purchase/restore) を提供し、購入/復元の確認で
 * window.sharoUnlock() を呼んで全テーマを解放する。
 *
 * ★Web版(GitHub Pages)では CdvPurchase が存在しないため、このファイルは
 *   何もしない（window.SharoBilling は未定義のまま → app.js 側でストア案内）。
 *   ＝1つのコードベースで Web/ネイティブ両対応。
 * ----------------------------------------------------------------------------
 * 必要な準備（ネイティブ側・STORE_RELEASE.md 参照）:
 *   - App Store Connect で「非消費型」IAPを作成（プロダクトID = 下記 PRODUCT_ID）
 *   - Capacitorプロジェクトで `npm i cordova-plugin-purchase` → `npx cap sync ios`
 */
(function () {
  var PRODUCT_ID = 'pro_all_unlock'; // ← App Store Connectで作るIAPのプロダクトIDと一致させる

  function start() {
    if (!window.CdvPurchase || !window.CdvPurchase.store) return; // Web版 or プラグイン未導入なら無効
    var CdvPurchase = window.CdvPurchase;
    var store = CdvPurchase.store;
    var APPLE = CdvPurchase.Platform.APPLE_APPSTORE;

    store.verbosity = CdvPurchase.LogLevel.WARNING;

    store.register([{
      id: PRODUCT_ID,
      type: CdvPurchase.ProductType.NON_CONSUMABLE,
      platform: APPLE,
    }]);

    // 承認 → 検証 → 確定の流れ。検証済み(=正規購入/復元)で解放。
    store.when().approved(function (t) { t.verify(); });
    store.when().verified(function (receipt) {
      var owned = false;
      try { owned = store.owned({ id: PRODUCT_ID, platform: APPLE }); } catch (e) {}
      if (owned && typeof window.sharoUnlock === 'function') window.sharoUnlock();
      receipt.finish();
    });

    store.initialize([APPLE]);

    // アプリ側(app.js)が呼ぶ橋渡し
    window.SharoBilling = {
      purchase: function () {
        var p = store.get(PRODUCT_ID, APPLE);
        var offer = p && p.getOffer && p.getOffer();
        if (offer) store.order(offer);
        else store.update().then(function () {
          var p2 = store.get(PRODUCT_ID, APPLE);
          var o2 = p2 && p2.getOffer && p2.getOffer();
          if (o2) store.order(o2);
        });
      },
      restore: function () { store.restorePurchases(); },
    };

    // 起動時、すでに所有していれば解放（復元不要で継続利用できるように）
    store.update().then(function () {
      try {
        if (store.owned({ id: PRODUCT_ID, platform: APPLE }) && typeof window.sharoUnlock === 'function') {
          window.sharoUnlock();
        }
      } catch (e) {}
    });
  }

  // Capacitorのdeviceready後に初期化
  if (window.CdvPurchase) {
    document.addEventListener('deviceready', start, { once: true });
    // deviceready が来ない環境向けのフォールバック
    setTimeout(start, 1500);
  }
})();
