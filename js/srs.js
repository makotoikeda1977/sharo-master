/*
 * 間隔反復(SRS)と忘却曲線の計算
 * ----------------------------------------------------------------------------
 * SM-2 を簡略化したアルゴリズム + エビングハウス型の保持率モデル。
 *
 * 各カードは「安定度 stability(日)」を持つ。これは "保持率が 90% まで下がる
 * までの日数" と定義する。保持率は次式で減衰する:
 *
 *     R(t) = 0.9 ^ (t / stability)      (t = 前回復習からの経過日数)
 *
 * → t = stability のとき R = 0.9。これが「次に復習すべきタイミング」になる。
 * 復習時の自己採点(grade)で stability を伸縮させ、忘却を遅らせていく。
 * ----------------------------------------------------------------------------
 */
(function () {
  const DAY = 24 * 60 * 60 * 1000;
  const TARGET_RETENTION = 0.9;

  // 採点ボタン定義(Anki 風の 4 段階)
  const GRADES = {
    again: { label: '忘れた',   key: 1, factor: 0.0, color: '#ef4444' },
    hard:  { label: 'あいまい', key: 2, factor: 1.2, color: '#f59e0b' },
    good:  { label: '覚えた',   key: 3, factor: 2.2, color: '#22c55e' },
    easy:  { label: '余裕',     key: 4, factor: 3.6, color: '#3b82f6' },
  };

  // 新規カードの初期状態
  function freshState() {
    return {
      stability: 0,      // 日。0 = 未学習
      reps: 0,           // 連続正解回数
      lapses: 0,         // 「忘れた」回数
      last: null,        // 最後に復習した時刻(ms)
      due: 0,            // 次回期限(ms)。0 = すぐ
      history: [],       // [{t, grade, stability}]
    };
  }

  // 経過日数(浮動小数)
  function daysSince(ms, now) {
    if (!ms) return Infinity;
    return (now - ms) / DAY;
  }

  // 現在の保持率(0〜1)。未学習や未来日付は扱いに注意
  function retention(state, now) {
    if (!state || !state.last || state.stability <= 0) return 0;
    const t = Math.max(0, daysSince(state.last, now));
    return Math.pow(0.9, t / state.stability);
  }

  // 採点を反映して新しい状態を返す(純粋関数)
  function review(state, gradeId, now) {
    const g = GRADES[gradeId];
    const s = { ...state, history: [...(state.history || [])] };
    const prev = s.stability || 1;

    if (gradeId === 'again') {
      s.stability = Math.max(0.5, prev * 0.4);
      s.reps = 0;
      s.lapses = (s.lapses || 0) + 1;
    } else {
      // 初回は採点係数をそのまま日数に、以降は伸ばす
      const base = s.reps === 0 ? 1 : prev;
      s.stability = Math.max(0.5, base * g.factor);
      s.reps = (s.reps || 0) + 1;
    }

    s.last = now;
    // 次回期限 = 保持率が目標(90%)まで下がる日数 = stability
    s.due = now + s.stability * DAY;
    s.history.push({ t: now, grade: gradeId, stability: s.stability });
    return s;
  }

  // 復習対象か(期限到来 or 未学習)
  function isDue(state, now) {
    if (!state || !state.last) return true;
    return now >= state.due;
  }

  // 苦手カード判定: 一度でも「忘れた(again)」と採点したことがある
  function isWeak(state) {
    return !!(state && state.last && (state.lapses || 0) > 0);
  }

  // 学習進捗の段階ラベル
  function maturity(state) {
    if (!state || !state.last) return 'new';
    if (state.stability < 7) return 'learning';
    if (state.stability < 30) return 'young';
    return 'mature';
  }

  window.SRS = {
    DAY, TARGET_RETENTION, GRADES,
    freshState, retention, review, isDue, isWeak, maturity, daysSince,
  };
})();
