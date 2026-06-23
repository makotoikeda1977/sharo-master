/*
 * 学習進捗の永続化(localStorage)
 * ----------------------------------------------------------------------------
 * サーバーを持たないので、端末のブラウザに保存する。
 *   - card states: カードごとの SRS 状態(キーは topicId::cardIndex)
 *   - review log : 全採点ログ(成長グラフ用の時系列)
 * ----------------------------------------------------------------------------
 */
(function () {
  const KEY = 'sharo.v1';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { cards: {}, log: [], settings: {}, custom: [] };
      const data = JSON.parse(raw);
      return { cards: data.cards || {}, log: data.log || [], settings: data.settings || {}, custom: data.custom || [] };
    } catch (e) {
      console.warn('保存データの読み込みに失敗。初期化します。', e);
      return { cards: {}, log: [], settings: {}, custom: [] };
    }
  }

  let _data = load();

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(_data));
    } catch (e) {
      console.warn('保存に失敗しました。', e);
    }
  }

  function cardKey(topicId, idx) {
    return `${topicId}::${idx}`;
  }

  function getCardState(topicId, idx) {
    const k = cardKey(topicId, idx);
    return _data.cards[k] || window.SRS.freshState();
  }

  function setCardState(topicId, idx, state) {
    _data.cards[cardKey(topicId, idx)] = state;
    persist();
  }

  // 採点を1件記録(成長グラフ用)
  function logReview(entry) {
    _data.log.push(entry);
    // 肥大化を防ぐため直近 5000 件に丸める
    if (_data.log.length > 5000) _data.log = _data.log.slice(-5000);
    persist();
  }

  function getLog() {
    return _data.log;
  }

  function getAllCardStates() {
    return _data.cards;
  }

  function reset() {
    // 学習記録だけ消し、設定とインポート済み問題は残す
    _data = { cards: {}, log: [], settings: _data.settings || {}, custom: _data.custom || [] };
    persist();
  }

  function exportJSON() {
    return JSON.stringify(_data, null, 2);
  }

  function importJSON(text) {
    const parsed = JSON.parse(text);
    _data = {
      cards: parsed.cards || {},
      log: parsed.log || [],
      settings: parsed.settings || {},
      custom: parsed.custom || [],
    };
    persist();
  }

  // ---- 課金(全テーマ解放) ----------------------------------------------
  function isPro() {
    return !!getSettings().pro;
  }
  function setPro(v) {
    setSetting('pro', !!v);
  }

  // ---- 設定(テーマ・リマインダーなど) ----------------------------------
  function getSettings() {
    return _data.settings || (_data.settings = {});
  }

  function setSetting(key, value) {
    getSettings()[key] = value;
    persist();
  }

  // ---- カスタム問題(インポート分) --------------------------------------
  function getCustomTopics() {
    return _data.custom || (_data.custom = []);
  }

  function setCustomTopics(arr) {
    _data.custom = Array.isArray(arr) ? arr : [];
    persist();
  }

  window.Store = {
    cardKey, getCardState, setCardState, logReview, getLog,
    getAllCardStates, reset, exportJSON, importJSON,
    getSettings, setSetting,
    getCustomTopics, setCustomTopics,
    isPro, setPro,
  };
})();
