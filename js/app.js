/*
 * アプリ本体(画面遷移とロジック)
 * ----------------------------------------------------------------------------
 * 依存: content.js / srs.js / storage.js / charts.js (この順に読み込む)
 * ----------------------------------------------------------------------------
 */
(function () {
  const { SUBJECTS, CROSS_TOPICS } = window.SHARO;
  const DAY = window.SRS.DAY;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // 組み込みテーマ + インポートしたカスタムテーマ
  function topics() {
    return CROSS_TOPICS.concat(window.Store.getCustomTopics());
  }

  // ---- 全カードを平坦化したインデックス -----------------------------------
  function allCards() {
    const out = [];
    topics().forEach((topic) => {
      topic.cards.forEach((card, idx) => {
        out.push({ topic, idx, card, key: window.Store.cardKey(topic.id, idx) });
      });
    });
    return out;
  }

  function withState(list, now) {
    return list.map((c) => ({
      ...c,
      state: window.Store.getCardState(c.topic.id, c.idx),
    }));
  }

  // ---- 統計 ----------------------------------------------------------------
  function computeStats(now) {
    const cards = withState(allCards(), now);
    const studied = cards.filter((c) => c.state.last);
    const due = cards.filter((c) => window.SRS.isDue(c.state, now));
    const avgRet = studied.length
      ? studied.reduce((s, c) => s + window.SRS.retention(c.state, now), 0) / studied.length
      : 0;
    const mature = cards.filter((c) => window.SRS.maturity(c.state) === 'mature').length;
    const weak = cards.filter((c) => window.SRS.isWeak(c.state)).length;
    const importedCards = cards.filter((c) => c.topic.custom);
    const importedReady = importedCards.filter((c) => !c.state.last || window.SRS.isDue(c.state, now)).length;
    return {
      total: cards.length,
      studied: studied.length,
      due: due.length,
      avgRet,
      mature,
      weak,
      imported: importedReady,
      importedTotal: importedCards.length,
      streak: computeStreak(),
    };
  }

  function computeStreak() {
    const log = window.Store.getLog();
    if (!log.length) return 0;
    const dayKeys = new Set(log.map((e) => new Date(e.t).toDateString()));
    let streak = 0;
    const d = new Date();
    // 今日学習していなくても、昨日まで続いていれば途切れ判定は今日基準で
    for (;;) {
      if (dayKeys.has(d.toDateString())) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else if (streak === 0 && d.toDateString() === new Date().toDateString()) {
        // 今日まだなら昨日を見る
        d.setDate(d.getDate() - 1);
        if (!dayKeys.has(d.toDateString())) break;
      } else {
        break;
      }
    }
    return streak;
  }

  // ============================ テーマ(ダーク/ライト) =====================
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('sharo.theme', t); } catch (e) {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#0d1525' : '#284d7f');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
  }

  // ============================ 復習リマインダー ============================
  const Notify = {
    supported() { return 'Notification' in window; },
    enabled() { return !!window.Store.getSettings().remind; },
    async enable() {
      if (!this.supported()) return false;
      let p = Notification.permission;
      if (p === 'default') p = await Notification.requestPermission();
      if (p === 'granted') { window.Store.setSetting('remind', true); return true; }
      return false;
    },
    disable() { window.Store.setSetting('remind', false); },
    // 1日1回だけ、未学習の復習があれば通知
    maybeNotify(dueCount) {
      if (!this.enabled() || dueCount <= 0) return;
      if (!this.supported() || Notification.permission !== 'granted') return;
      const today = new Date().toDateString();
      if (window.Store.getSettings().lastNotified === today) return;
      window.Store.setSetting('lastNotified', today);
      try {
        new Notification('社労士 横断宮殿', {
          body: `今日の復習が${dueCount}枚あります。`,
          icon: './icons/icon.svg',
        });
      } catch (e) {}
    },
  };

  // ============================ ホーム ======================================
  let homeSubj = null;        // ホームの科目フィルタ(null=すべて)
  let scrollToTopic = null;   // テーマ一覧に戻ったとき、その位置までスクロール
  let lastOrigin = 'cross';   // テーマ詳細を開いた元の一覧(home / cross)

  // 一覧描画後、戻り元のテーマが見える位置までスクロールする
  function restoreListScroll(view) {
    if (!scrollToTopic) return;
    const tgt = view.querySelector(`[data-topic="${scrollToTopic}"]`);
    scrollToTopic = null;
    if (tgt) requestAnimationFrame(() => tgt.scrollIntoView({ block: 'center' }));
  }

  function renderHome(now) {
    const s = computeStats(now);
    const view = $('#view');

    // 各テーマの定着率を算出。定着の低い(=身についていない)ものを上に
    let rows = topics().map((t) => {
      const cards = withState(t.cards.map((card, idx) => ({ topic: t, idx, card })), now);
      const total = cards.length;
      const studiedCards = cards.filter((c) => c.state.last);
      const studied = studiedCards.length;
      const due = cards.filter((c) => window.SRS.isDue(c.state, now)).length;
      const avgRet = studied
        ? studiedCards.reduce((a, c) => a + window.SRS.retention(c.state, now), 0) / studied
        : 0;
      const coverage = total ? studied / total : 0;
      return { t, total, studied, due, avgRet, coverage };
    }).sort((a, b) => a.avgRet - b.avgRet || b.due - a.due || b.total - a.total);

    // 科目フィルタ
    if (homeSubj) rows = rows.filter((r) => r.t.subjects.includes(homeSubj));

    // 出現する科目を SUBJECTS の順で
    const present = new Set();
    topics().forEach((t) => t.subjects.forEach((sj) => present.add(sj)));
    const subjList = Object.keys(SUBJECTS).filter((sj) => present.has(sj));

    const retColor = (avgRet) =>
      avgRet >= 0.7 ? '#22c55e' : avgRet >= 0.4 ? '#f59e0b' : '#ef4444';

    const palaceCoverage = s.total ? s.studied / s.total : 0;
    const palacePct = Math.round(palaceCoverage * 100);
    const palaceStage = palaceCoverage < 0.125
      ? { img: 'palace_0.png', name: '更地' }
      : palaceCoverage < 0.375
        ? { img: 'palace_25.png', name: '柱' }
        : palaceCoverage < 0.625
          ? { img: 'palace_50.png', name: '外壁' }
          : palaceCoverage < 0.875
            ? { img: 'palace_75.png', name: '屋根' }
            : { img: 'palace_100.png', name: '完成' };

    const rowHTML = rows.map((r, i) => {
      const ret = Math.round(r.avgRet * 100);
      const coveragePct = Math.round(r.coverage * 100);
      let badge;
      if (r.studied === 0) badge = '<span class="prio-badge new">未学習</span>';
      else if (r.due > 0) badge = `<span class="prio-badge due">復習 ${r.due}</span>`;
      else badge = `<span class="prio-badge ok">定着 ${ret}%</span>`;
      return `
        <button class="prio-card prio-row" data-topic="${r.t.id}" type="button">
          <span class="prio-rank"><span class="rank-no" style="--rc:${retColor(r.avgRet)}">${i + 1}</span></span>
          <span class="prio-main">
            <span class="prio-title">${r.t.title}</span>
            <span class="prio-faces" aria-hidden="true">
              ${r.t.subjects.map((sj) => `<img src="./icons/chars/${sj}.png" alt="" onerror="this.style.display='none'">`).join('')}
            </span>
            <span class="subj-tags">${r.t.subjects.map(subjTag).join('')}</span>
          </span>
          <span class="prio-stat">
            <span class="prio-coverage">学習率 ${coveragePct}%</span>
            <span class="mini-track"><span class="mini-fill" style="width:${coveragePct}%"></span></span>
            <span class="prio-meta">${badge}<span class="small muted">${r.studied}/${r.total}</span></span>
          </span>
        </button>`;
    }).join('');

    view.innerHTML = `
      <section class="home-palace" aria-label="宮殿建設率">
        <div class="home-palace-copy">
          <div class="home-palace-kicker">知識の宮殿</div>
          <h2>宮殿建設率 ${palacePct}%</h2>
          <p>現段階：<strong>${palaceStage.name}</strong></p>
        </div>
        <div class="home-palace-art">
          <img src="./icons/palace/${palaceStage.img}" alt="宮殿建設率 ${palacePct}% ${palaceStage.name}">
        </div>
      </section>
      <div class="card-box char-gallery">
        <h3 class="char-gallery-title" id="open-chars">法律キャラ図鑑<span class="char-more">ぜんいん見る →</span></h3>
        <div class="char-row">
          ${LAW_CHARACTERS.map((c) =>
            `<div class="char-item"><img src="./icons/chars/${c.id}.png" style="border-color:${SUBJECTS[c.id] ? SUBJECTS[c.id].color : '#cbd5e1'}" alt=""><span class="char-law">${c.law}</span><span class="char-name">${c.name}</span><span class="char-title">${c.title}</span></div>`).join('')}
        </div>
      </div>
      <div class="subj-filter">
        <button class="sfchip${homeSubj === null ? ' on' : ''}" data-subj="">すべて</button>
        ${subjList.map((sj) =>
          `<button class="sfchip${homeSubj === sj ? ' on' : ''}" data-subj="${sj}" style="--c:${SUBJECTS[sj].color}">${SUBJECTS[sj].short}</button>`).join('')}
      </div>
      <div class="card-box prio-box">
        <div class="prio-head">
          <h3>横断テーマ</h3>
          <span class="small muted">定着の低い順</span>
        </div>
        <div class="prio-grid">${rowHTML || '<div class="prio-empty muted small">該当するテーマがありません</div>'}</div>
      </div>
      ${s.weak > 0 ? `<button class="btn-ghost big weak-btn" id="start-weak">
        🔁 間違えた問題だけ復習(${s.weak}枚)
      </button>` : ''}
      ${s.importedTotal > 0 ? `<button class="btn-ghost big imp-btn" id="start-imported">
        📖 過去問だけ復習(${s.imported}枚)
      </button>` : ''}`;

    const openChars = $('#open-chars');
    if (openChars) openChars.addEventListener('click', () => go('chars'));
    $$('.sfchip', view).forEach((b) =>
      b.addEventListener('click', () => { homeSubj = b.dataset.subj || null; renderHome(Date.now()); }));
    $$('.prio-row', view).forEach((el) =>
      el.addEventListener('click', () => { lastOrigin = 'home'; go('cross', { topic: el.dataset.topic }); }));
    restoreListScroll(view);
    const weakBtn = $('#start-weak');
    if (weakBtn) weakBtn.addEventListener('click', () => go('review', { weak: true }));
    const impBtn = $('#start-imported');
    if (impBtn) impBtn.addEventListener('click', () => go('review', { imported: true }));

    // 1日1回の復習リマインド(通知ON時のみ)
    Notify.maybeNotify(s.due);
  }

  // ============================ 横断学習 ====================================
  function renderCross(now, params) {
    const view = $('#view');
    const topicId = params && params.topic;
    if (!topicId) {
      view.innerHTML = `
        <button class="btn-ghost big palace-btn" id="open-palace">🏰 記憶の宮殿(場所で覚える)</button>
        <div class="topic-list">
          ${topics().map((t) => topicCardHTML(t, now)).join('')}
        </div>`;
      $('#open-palace').addEventListener('click', () => go('palace'));
      $$('.topic-card', view).forEach((el) =>
        el.addEventListener('click', () => { lastOrigin = 'cross'; go('cross', { topic: el.dataset.topic }); }));
      restoreListScroll(view);
      return;
    }

    const topic = topics().find((t) => t.id === topicId);
    // 答え列が2つ以上ある表は、列ごとに色を分けて区別しやすくする
    const multiCol = !!(topic.table && topic.table.headers && topic.table.headers.length >= 3);
    const colAccent = (i) => COL_ACCENTS[(i - 1) % COL_ACCENTS.length];
    view.innerHTML = `
      <button class="link-back" id="back">← テーマ一覧</button>
      <section class="hero compact">
        <h2>${topic.title}</h2>
        <div class="subj-tags">${topic.subjects.map(subjTag).join('')}</div>
      </section>
      <div class="card-box">
        ${topic.table ? `
        <div class="sheet-bar">
          <button class="chip2" id="sheet-toggle">🟥 赤シート ON</button>
          <span class="sheet-hint small muted">タップで答え表示</span>
        </div>
        <div class="table-wrap sheet" id="cmp-wrap">
          <table class="cmp">
            <thead><tr>${topic.table.headers.map((h, i) => {
                const cid = lawCharId(h);
                const face = cid ? `<img class="colface" src="./icons/chars/${cid}.png" style="border-color:${rowLawColor(h) || '#cbd5e1'}" onerror="this.style.display='none'" alt="">` : '';
                const cls = (multiCol && i > 0) ? ' class="colh"' : '';
                const style = (multiCol && i > 0) ? ` style="--colc:${colAccent(i)}"` : '';
                return `<th${cls}${style}>${face}${h}</th>`;
              }).join('')}</tr></thead>
            <tbody>${topic.table.rows.map((r, ri) => {
                const lc = rowLawColor(r[0]) ||
                  (topic.subjects && topic.subjects.length === 1 && SUBJECTS[topic.subjects[0]]
                    ? SUBJECTS[topic.subjects[0]].color : null);
                const trA = lc ? ` class="lawrow" style="--rowc:${lc}"` : '';
                return `<tr${trA}>${r.map((c, i) => {
                  if (i === 0) return `<td class="rowhdr">${c}</td>`;
                  if (!c) return '<td></td>';
                  // セル内に **太字** があれば「語句単位の赤シート」、なければセル全体マスク
                  const hasCloze = c.indexOf('**') >= 0;
                  const cls = 'ans' + (multiCol ? ' colc' : '') + (hasCloze ? ' wordcloze' : '');
                  const style = multiCol ? ` style="--colc:${colAccent(i)}"` : '';
                  const inner = hasCloze
                    ? c.replace(/\*\*(.+?)\*\*/g, '<span class="cloze">$1</span>')
                    : `<span class="mask">${c}</span>`;
                  return `<td class="${cls}"${style}>${inner}</td>`;
                }).join('')}</tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>` : '<p class="muted small">このテーマは一問一答のみです。</p>'}
        ${topic.note ? `<p class="note">💡 ${topic.note}</p>` : ''}
        ${topic.palace ? `
        <div class="palace-tip">
          <div class="pt-head">🏰 記憶の宮殿で覚える(一例)</div>
          ${topic.palace.intro ? `<p class="pt-intro">${topic.palace.intro}</p>` : ''}
          <ol class="pt-steps">
            ${topic.palace.steps.map((s) =>
              `<li><span class="pt-spot">${s.spot}</span><span class="pt-story">${s.story}</span></li>`).join('')}
          </ol>
        </div>` : ''}
        ${topic.voices && topic.voices.length ? `
        <div class="voices">
          <div class="vc-head">🗣️ 制度のホンネ(差分)</div>
          ${topic.voices.map((v) => {
            const c = (v.subj && SUBJECTS[v.subj]) ? SUBJECTS[v.subj].color : '#64748b';
            const cid = v.char || (v.subj && SUBJECTS[v.subj] ? v.subj : null);
            const face = cid ? `<img class="vc-face" src="./icons/chars/${cid}.png" style="border-color:${c}" onerror="this.style.display='none'" alt="">` : '';
            return `<div class="vc-row" style="--vc:${c}">
              <span class="vc-who">${face}<span class="vc-name">${v.name}</span></span>
              <span class="vc-line">${v.line}</span>
            </div>`;
          }).join('')}
        </div>` : ''}
      </div>
      <button class="btn-primary big" id="study-topic">一問一答で復習(${topic.cards.length}枚)</button>`;

    $('#back').addEventListener('click', () => { scrollToTopic = topic.id; go(lastOrigin); });
    $('#study-topic').addEventListener('click', () => go('review', { topic: topic.id }));

    // 赤シート(答えを隠す/タップで表示)
    if (topic.table) {
      const wrap = $('#cmp-wrap');
      const masks = $$('.mask, .cloze', wrap);
      let sheetOn = true;
      const applySheet = () => {
        wrap.classList.toggle('sheet', sheetOn);
        $('#sheet-toggle').textContent = sheetOn ? '🟥 赤シート ON' : '⬜️ 赤シート OFF';
        $('.sheet-hint').style.visibility = sheetOn ? 'visible' : 'hidden';
      };
      $('#sheet-toggle').addEventListener('click', () => { sheetOn = !sheetOn; applySheet(); });
      masks.forEach((m) => m.addEventListener('click', () => {
        if (sheetOn) m.classList.toggle('revealed');
      }));
    }
  }

  function topicCardHTML(t, now) {
    const cards = withState(t.cards.map((card, idx) => ({ topic: t, idx, card })), now);
    const studied = cards.filter((c) => c.state.last).length;
    const ret = studied
      ? Math.round(cards.filter((c) => c.state.last)
          .reduce((a, c) => a + window.SRS.retention(c.state, now), 0) / studied * 100)
      : 0;
    return `
      <div class="topic-card" data-topic="${t.id}">
        <div class="topic-head"><h3>${t.title}</h3><span class="pill">${t.cards.length}枚</span></div>
        <div class="subj-tags">${t.subjects.map(subjTag).join('')}</div>
        <div class="topic-prog">
          <div class="mini-track"><div class="mini-fill" style="width:${cards.length ? studied / cards.length * 100 : 0}%"></div></div>
          <span class="small muted">${studied}/${cards.length} 学習 ・ 定着${ret}%</span>
        </div>
      </div>`;
  }

  function subjTag(id) {
    const s = SUBJECTS[id];
    if (!s) return '';
    return `<span class="subj" style="--c:${s.color}">${s.short}</span>`;
  }

  // 行の1列目の文言から「法律」を判定して色を割り当てる(順序が重要)
  const LAW_COLORS = [
    [/国民健康保険|後期高齢|介護保険|船員/, '#0ea5e9'],         // 社一系(国保・後期・介護・船員)
    [/労働基準|労基/, SUBJECTS.kijun.color],
    [/安全衛生|安衛/, SUBJECTS.anei.color],
    [/労災/, SUBJECTS.rosai.color],
    [/雇用/, SUBJECTS.koyo.color],
    [/徴収|労働保険料/, SUBJECTS.choshu.color],
    [/厚生年金|厚年/, SUBJECTS.konen.color],
    [/国民年金|国年/, SUBJECTS.kokunen.color],
    [/健康保険|健保/, SUBJECTS.kenpo.color],
  ];
  function rowLawColor(text) {
    const t = String(text || '');
    for (const [re, c] of LAW_COLORS) if (re.test(t)) return c;
    return null;
  }

  // 法律→キャラ(顔アイコン)の対応。表の列ヘッダや記憶の宮殿で使う
  const LAW_CHARS = [
    [/船員/, 'shain'],            // サブ制度キャラ(男性。図鑑には載せない)
    [/日雇/, 'hiyatoi'],
    [/国家公務員/, 'kokka'],
    [/地方公務員/, 'chiho'],
    [/私学共済|私学/, 'shigaku'],
    [/労働基準|労基/, 'kijun'],
    [/安全衛生|安衛/, 'anei'],
    [/労災/, 'rosai'],
    [/雇用/, 'koyo'],
    [/徴収|労働保険料/, 'choshu'],
    [/厚生年金|厚年/, 'konen'],
    [/国民年金|国年/, 'kokunen'],
    [/健康保険|健保/, 'kenpo'],
  ];
  function lawCharId(text) {
    const t = String(text || '');
    for (const [re, id] of LAW_CHARS) if (re.test(t)) return id;
    return null;
  }
  // 法律キャラ名簿(トップページの図鑑用)
  const LAW_CHARACTERS = [
    { id: 'kijun', name: '基島規子', title: '労基の姫', law: '労基' },
    { id: 'anei', name: '守谷衛', title: '安全の守護者', law: '安衛' },
    { id: 'rosai', name: '災堂咲', title: '労災の戦乙女', law: '労災' },
    { id: 'koyo', name: '職田めぐみ', title: '雇用の女伯爵', law: '雇用' },
    { id: 'choshu', name: '収沢徴子', title: '徴収の会計姫', law: '徴収' },
    { id: 'kenpo', name: '保科碧', title: '健保の聖騎士', law: '健保' },
    { id: 'konen', name: '厚見年実', title: '厚年の賢者', law: '厚年' },
    { id: 'kokunen', name: '国原みのり', title: '国年の巫女', law: '国年' },
    { id: 'roippan', name: '労井美樹', title: '労一の学者', law: '労一' },
    { id: 'shaippan', name: '市役あい', title: '社一の案内人', law: '社一' },
  ];

  // 表の「答え列」を左から順に色分けする(例: 5年=青 / 2年=橙 / 時効にかからない=灰)
  const COL_ACCENTS = ['#2563eb', '#d97706', '#0891b2', '#16a34a'];

  // ============================ 復習(アクティブリコール) ==================
  let session = null;

  // 出題順のランダム化(Fisher-Yates)。新規カードを毎回違う順で出す。
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildQueue(now, opts) {
    const topicId = opts && opts.topic;
    let cards = withState(allCards(), now);
    if (topicId) cards = cards.filter((c) => c.topic.id === topicId);
    // 過去問モード: インポートしたカードだけに絞る
    if (opts && opts.imported) cards = cards.filter((c) => c.topic.custom);

    // 苦手モード: 期限を問わず「間違えた問題」を苦手な順(忘れた回数→低保持率)に
    if (opts && opts.weak) {
      return cards
        .filter((c) => window.SRS.isWeak(c.state))
        .sort((a, b) =>
          (b.state.lapses || 0) - (a.state.lapses || 0) ||
          window.SRS.retention(a.state, now) - window.SRS.retention(b.state, now))
        .slice(0, 30);
    }

    const due = cards.filter((c) => c.state.last && window.SRS.isDue(c.state, now));
    const fresh = shuffle(cards.filter((c) => !c.state.last));
    // 期限切れがひどい順 → 新規(順番はランダム) の順に。1セッション最大20枚
    due.sort((a, b) => a.state.due - b.state.due);
    return [...due, ...fresh].slice(0, 20);
  }

  function renderReview(now, params) {
    const weak = !!(params && params.weak);
    const imported = !!(params && params.imported);
    const queue = buildQueue(now, { topic: params && params.topic, weak, imported });
    session = {
      queue, pos: 0, revealed: false, answered: null, done: 0, again: 0,
      topicId: params && params.topic, weak, imported,
    };
    drawReview();
  }

  function drawReview() {
    const view = $('#view');
    const now = Date.now();
    if (session.pos >= session.queue.length) {
      const empty = session.done === 0;
      view.innerHTML = `
        <section class="done">
          <div class="done-emoji">${empty ? '✅' : '🎉'}</div>
          <h2>${empty ? '対象がありません' : (session.weak ? '苦手復習 完了!' : 'セッション完了!')}</h2>
          <p class="muted">${empty
            ? (session.weak ? 'いまは間違えた問題がありません。' : '復習できるカードがありません。')
            : `${session.done}枚を復習 ・ うち「忘れた」${session.again}枚`}</p>
          <div class="done-actions">
            ${empty ? '' : `<button class="btn-primary" id="more">続けて復習</button>`}
            <button class="btn-ghost" id="to-home">ホームへ</button>
            <button class="btn-ghost" id="to-memory">覚え方を見る</button>
          </div>
        </section>`;
      const more = $('#more');
      if (more) more.addEventListener('click', () =>
        renderReview(Date.now(), { topic: session.topicId, weak: session.weak, imported: session.imported }));
      $('#to-home').addEventListener('click', () => go('home'));
      $('#to-memory').addEventListener('click', () => go('memory'));
      return;
    }

    const item = session.queue[session.pos];
    const total = session.queue.length;
    const card = item.card;
    const ret = item.state.last ? Math.round(window.SRS.retention(item.state, now) * 100) : null;
    const ox = oxAnswer(card);          // '○' | '×' | null
    const ans = session.answered;       // {choice, correct} | null
    const showAnswer = session.revealed || !!ans;

    view.innerHTML = `
      ${ans ? `<div class="answer-flash ${ans.correct ? 'ok' : 'ng'}">${ans.correct ? '○' : '×'}</div>` : ''}
      <div class="rv-top">
        <button class="link-back" id="rv-exit">← もどる</button>
        <div class="rv-progress"><div class="rv-fill" style="width:${session.pos / total * 100}%"></div></div>
        <span class="small muted">${session.pos + 1} / ${total}</span>
        <button class="link-back rv-skip" id="rv-skip">スキップ →</button>
      </div>
      <div class="recall">
        <div class="recall-meta">
          ${session.weak ? '<span class="mode-badge">🔁 苦手</span>' : ''}
          ${session.imported ? '<span class="mode-badge imp">📖 過去問</span>' : ''}
          <span class="subj-line">${item.topic.subjects.map(subjTag).join('')}</span>
          <span class="topic-name">${item.topic.title}</span>
          ${card.source ? `<span class="src-badge">${card.source}</span>` : ''}
          ${ret !== null ? `<span class="ret-badge">記憶 ${ret}%</span>` : '<span class="ret-badge new">NEW</span>'}
        </div>
        <div class="q">${card.q}</div>
        ${card.hint ? `<div class="hint" id="hint">ヒントを見る</div>` : ''}
        <div class="a ${showAnswer ? 'show' : ''}" id="answer">${card.a}</div>
      </div>
      <div class="rv-actions">
        ${ans
          ? `<button class="btn-primary big" id="next">次へ</button>`
          : ox
            ? `<div class="ox-buttons">
                 <button class="ox-btn" data-ox="○" style="--c:#22c55e">○ 正しい</button>
                 <button class="ox-btn" data-ox="×" style="--c:#ef4444">× 誤り</button>
               </div>`
            : session.revealed
              ? Object.entries(window.SRS.GRADES).map(([id, g]) =>
                  `<button class="grade" data-grade="${id}" style="--c:${g.color}">
                     <span class="g-label">${g.label}</span></button>`).join('')
              : `<button class="btn-primary big" id="reveal">答えを見る</button>`}
      </div>`;

    // 画面遷移ボタン(常時): もどる=この復習をやめて戻る / スキップ=採点せず次へ
    $('#rv-exit').addEventListener('click', () =>
      go(session.topicId ? 'cross' : 'home', session.topicId ? { topic: session.topicId } : null));
    $('#rv-skip').addEventListener('click', skipCard);

    if (card.hint) {
      const h = $('#hint');
      if (h) h.addEventListener('click', () => { h.textContent = '💡 ' + card.hint; h.classList.add('open'); });
    }
    document.onkeydown = null;
    if (ans) {
      $('#next').addEventListener('click', nextCard);
      document.onkeydown = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); nextCard(); } };
    } else if (ox) {
      $$('.ox-btn', view).forEach((b) => b.addEventListener('click', () => answerOX(b.dataset.ox)));
      document.onkeydown = (e) => {
        if (e.key === 'o' || e.key === 'O' || e.key === '1') answerOX('○');
        else if (e.key === 'x' || e.key === 'X' || e.key === '2') answerOX('×');
      };
    } else if (session.revealed) {
      $$('.grade', view).forEach((b) => b.addEventListener('click', () => gradeCard(b.dataset.grade)));
      document.onkeydown = (e) => {
        const map = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' };
        if (map[e.key]) gradeCard(map[e.key]);
      };
    } else {
      $('#reveal').addEventListener('click', () => { session.revealed = true; drawReview(); });
      document.onkeydown = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); session.revealed = true; drawReview(); } };
    }
  }

  // ○×カードの正解(answerの先頭文字)。○×でなければ null
  function oxAnswer(card) {
    const a = (card.a || '').trim();
    if (!a) return null;
    const c = a[0];
    // ○ の異体字: ○(U+25CB) 〇(U+3007) ◯(U+25EF) ⭕(emoji)
    if ('○〇◯⭕'.indexOf(c) >= 0) return '○';
    // × の異体字: ×(U+00D7) ✕(U+2715) ✗(U+2717) ╳(U+2573)
    if ('×✕✗╳'.indexOf(c) >= 0) return '×';
    // 日本語/英語の語頭表記(正しい/正解・誤り/誤った/不正解・true/false)、単独「正」「誤」も可
    if (a === '正' || /^(正しい|正解|まる|true)/i.test(a)) return '○';
    if (a === '誤' || /^(誤り|誤った|不正解|ばつ|ばってん|false)/i.test(a)) return '×';
    return null;
  }

  // ○/×を押したとき: 正誤判定 → SRS反映 → フィードバック表示
  function answerOX(choice) {
    if (session.answered) return;
    document.onkeydown = null;
    const now = Date.now();
    const item = session.queue[session.pos];
    const correct = (choice === oxAnswer(item.card));
    const gradeId = correct ? 'good' : 'again';
    const newState = window.SRS.review(item.state, gradeId, now);
    window.Store.setCardState(item.topic.id, item.idx, newState);
    window.Store.logReview({
      t: now, topic: item.topic.id, idx: item.idx,
      grade: gradeId, stability: newState.stability,
      retention: item.state.last ? window.SRS.retention(item.state, now) : 0,
    });
    session.done++;
    if (!correct) { session.again++; session.queue.push({ ...item, state: newState }); }
    session.answered = { choice, correct };
    drawReview();
  }

  function nextCard() {
    document.onkeydown = null;
    session.pos++;
    session.revealed = false;
    session.answered = null;
    drawReview();
  }

  // 採点せずに次のカードへ進む(記憶状態は変えない)
  function skipCard() {
    document.onkeydown = null;
    session.pos++;
    session.revealed = false;
    session.answered = null;
    drawReview();
  }

  function gradeCard(gradeId) {
    document.onkeydown = null;
    const now = Date.now();
    const item = session.queue[session.pos];
    const newState = window.SRS.review(item.state, gradeId, now);
    window.Store.setCardState(item.topic.id, item.idx, newState);
    window.Store.logReview({
      t: now, topic: item.topic.id, idx: item.idx,
      grade: gradeId, stability: newState.stability,
      retention: item.state.last ? window.SRS.retention(item.state, now) : 0,
    });
    session.done++;
    if (gradeId === 'again') {
      session.again++;
      // 「忘れた」カードはセッション末尾に積み直す
      session.queue.push({ ...item, state: newState });
    }
    session.pos++;
    session.revealed = false;
    session.answered = null;
    drawReview();
  }

  // ============================ 成長度 ======================================
  function renderGrowth(now) {
    const view = $('#view');
    const s = computeStats(now);
    view.innerHTML = `
      <section class="hero compact"><h2>成長と忘却の可視化</h2>
        <p class="muted">学習の積み上げと、これからの忘れ方</p></section>

      <div class="stat-grid tight">
        <div class="stat"><div class="stat-num">${s.studied}</div><div class="stat-lbl">学習済</div></div>
        <div class="stat"><div class="stat-num">${s.mature}</div><div class="stat-lbl">定着(長期)</div></div>
        <div class="stat"><div class="stat-num">${Math.round(s.avgRet * 100)}<small>%</small></div><div class="stat-lbl">平均保持率</div></div>
      </div>

      <div class="card-box">
        <h3>学習量の推移</h3>
        <p class="muted small">日別の復習回数(直近30日)</p>
        <canvas id="growth-line" class="chart"></canvas>
      </div>

      <div class="card-box">
        <h3>忘却曲線(代表カード)</h3>
        <p class="muted small">よく復習したカードほど右肩でゆるやかに(忘れにくく)なる</p>
        <canvas id="growth-curve" class="chart tall"></canvas>
      </div>

      <div class="card-box">
        <h3>科目別 習得度</h3>
        <div id="mastery" class="bars"></div>
      </div>

      <div class="card-box">
        <h3>設定</h3>
        <div class="setting-row">
          <span class="sr-label">復習リマインド
            <span class="sr-sub">${Notify.supported()
              ? 'アプリを開いた時に、未消化の復習を1日1回通知します'
              : 'お使いのブラウザは通知に対応していません'}</span>
          </span>
          <label class="switch">
            <input type="checkbox" id="remind-toggle" ${Notify.enabled() ? 'checked' : ''} ${Notify.supported() ? '' : 'disabled'} />
            <span class="slider"></span>
          </label>
        </div>
      </div>

      <div class="card-box">
        <h3>問題のインポート</h3>
        <p class="muted small">CSV / JSON で自作問題や過去問をまとめて追加できます${
          customCount() ? `(現在 <b>${customCount()}</b> 件のインポート済みテーマ)` : ''}</p>
        <div class="data-actions">
          <button class="btn-primary" id="import-open">問題をインポート</button>
          ${customCount() ? '<button class="btn-ghost danger" id="custom-clear">インポート分を削除</button>' : ''}
        </div>
      </div>

      <div class="card-box">
        <h3>データ管理</h3>
        <div class="data-actions">
          <button class="btn-ghost" id="export">バックアップを書き出す</button>
          <button class="btn-ghost danger" id="reset">学習記録をリセット</button>
        </div>
      </div>`;

    // 学習量の推移
    window.Charts.growthLine($('#growth-line'), dailySeries(30));

    // 忘却曲線: 学習済カードのうち stability 上位3枚を代表に
    const studied = withState(allCards(), now).filter((c) => c.state.last);
    studied.sort((a, b) => b.state.stability - a.state.stability);
    const palette = ['#3b82f6', '#22c55e', '#f59e0b'];
    const curves = studied.slice(0, 3).map((c, i) => ({
      stability: c.state.stability, last: c.state.last, color: palette[i],
    }));
    if (!curves.length) curves.push({ stability: 1, last: now, color: '#cbd5e1', dim: true });
    const horizon = Math.max(14, ...curves.map((c) => c.stability)) * 1.5;
    window.Charts.forgettingCurve($('#growth-curve'), curves, now, horizon);

    // 科目別習得度
    window.Charts.masteryBars($('#mastery'), subjectMastery(now));

    const remind = $('#remind-toggle');
    if (remind) {
      remind.addEventListener('change', async () => {
        if (remind.checked) {
          const ok = await Notify.enable();
          if (!ok) { remind.checked = false; alert('通知が許可されませんでした。ブラウザの設定をご確認ください。'); }
        } else {
          Notify.disable();
        }
      });
    }

    $('#import-open').addEventListener('click', openImport);
    const clearBtn = $('#custom-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      if (confirm('インポートした問題をすべて削除します。よろしいですか?(組み込みの問題は残ります)')) {
        window.Store.setCustomTopics([]);
        renderGrowth(Date.now());
      }
    });

    $('#export').addEventListener('click', exportData);
    $('#reset').addEventListener('click', () => {
      if (confirm('すべての学習記録を消します。よろしいですか?')) {
        window.Store.reset();
        renderGrowth(Date.now());
      }
    });
  }

  function customCount() {
    return window.Store.getCustomTopics().length;
  }

  // ============================ インポート画面 ==============================
  const CSV_SAMPLE =
`topic,subjects,question,answer,hint,source
労働時間,労基|安衛,法定労働時間は1日何時間?,8時間,原則,R5択一
労働時間,労基,法定労働時間は1週何時間?,40時間,,
時効,健保|厚年,保険料を徴収する権利の時効は?,2年,,R4`;

  // 既存IDと衝突しないよう採番してからカスタムテーマへ反映
  function mergeCustom(newTopics, mode) {
    const existing = mode === 'replace' ? [] : window.Store.getCustomTopics();
    const ids = new Set(CROSS_TOPICS.map((t) => t.id).concat(existing.map((t) => t.id)));
    newTopics.forEach((t) => {
      let id = t.id, n = 1;
      while (ids.has(id)) id = `${t.id}-${n++}`;
      t.id = id; ids.add(id);
    });
    window.Store.setCustomTopics(existing.concat(newTopics));
  }

  function openImport() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-label="問題のインポート">
        <div class="modal-head">
          <h3>問題のインポート</h3>
          <button class="icon-btn" id="im-close" aria-label="閉じる">✕</button>
        </div>
        <p class="muted small">CSV または JSON を貼り付けるか、ファイルを選んでください(形式は自動判定)。</p>
        <details class="im-help">
          <summary>CSVの書式</summary>
          <p class="muted small">1行目はヘッダー。<code>question</code> と <code>answer</code> は必須。<code>topic</code> が同じ行は1テーマにまとまります。<code>subjects</code> は <code>|</code> 区切り(例: 労基|健保)。</p>
          <pre class="im-pre">${CSV_SAMPLE.replace(/</g, '&lt;')}</pre>
          <button class="btn-ghost" id="im-sample">この例を入力欄に入れる</button>
        </details>
        <textarea id="im-text" class="im-text" placeholder="ここに CSV または JSON を貼り付け"></textarea>
        <div class="im-row">
          <input type="file" id="im-file" accept=".csv,.json,.txt,text/csv,application/json" />
        </div>
        <div class="im-row im-modes">
          <label><input type="radio" name="im-mode" value="append" checked /> 追加</label>
          <label><input type="radio" name="im-mode" value="replace" /> 置き換え</label>
        </div>
        <div id="im-msg" class="im-msg"></div>
        <div class="modal-actions">
          <button class="btn-ghost" id="im-cancel">キャンセル</button>
          <button class="btn-primary" id="im-run">取り込む</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    const msg = $('#im-msg', overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    $('#im-close', overlay).addEventListener('click', close);
    $('#im-cancel', overlay).addEventListener('click', close);
    $('#im-sample', overlay).addEventListener('click', () => { $('#im-text', overlay).value = CSV_SAMPLE; });
    $('#im-file', overlay).addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { $('#im-text', overlay).value = r.result; };
      r.readAsText(f);
    });

    $('#im-run', overlay).addEventListener('click', () => {
      const text = $('#im-text', overlay).value;
      let result;
      try {
        result = window.Importer.parse(text);
      } catch (err) {
        msg.className = 'im-msg error';
        msg.textContent = '読み込みエラー: ' + err.message;
        return;
      }
      if (!result.topics.length) {
        msg.className = 'im-msg error';
        msg.textContent = '取り込めるテーマがありませんでした。' + (result.errors[0] || '');
        return;
      }
      const mode = (overlay.querySelector('input[name="im-mode"]:checked') || {}).value || 'append';
      mergeCustom(result.topics, mode);
      const cardTotal = result.topics.reduce((a, t) => a + t.cards.length, 0);
      let info = `${result.topics.length}テーマ / ${cardTotal}枚を取り込みました。`;
      if (result.errors.length) info += `(スキップ ${result.errors.length}件)`;
      alert(info);
      close();
      renderGrowth(Date.now());
    });
  }

  function dailySeries(nDays) {
    const log = window.Store.getLog();
    const counts = {};
    log.forEach((e) => {
      const k = new Date(e.t);
      const key = `${k.getMonth() + 1}/${k.getDate()}`;
      counts[key] = (counts[key] || 0) + 1;
    });
    const out = [];
    const d = new Date();
    d.setDate(d.getDate() - (nDays - 1));
    for (let i = 0; i < nDays; i++) {
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      out.push({ date: key, value: counts[key] || 0 });
      d.setDate(d.getDate() + 1);
    }
    // 末尾の連続ゼロを削って見やすく(ただし最低1点は残す)
    let end = out.length;
    while (end > 1 && out[end - 1].value === 0) end--;
    let start = 0;
    while (start < end - 1 && out[start].value === 0) start++;
    return out.slice(start, end);
  }

  function subjectMastery(now) {
    // 各カードは複数科目に紐づく。科目ごとに保持率を平均する。
    const acc = {};
    withState(allCards(), now).forEach((c) => {
      const ret = c.state.last ? window.SRS.retention(c.state, now) : 0;
      c.topic.subjects.forEach((sid) => {
        acc[sid] = acc[sid] || { sum: 0, n: 0, studied: 0 };
        acc[sid].sum += ret;
        acc[sid].n += 1;
        if (c.state.last) acc[sid].studied += 1;
      });
    });
    return Object.entries(acc)
      .map(([sid, v]) => ({
        label: SUBJECTS[sid].name,
        color: SUBJECTS[sid].color,
        value: v.n ? v.sum / v.n : 0,
        count: v.studied,
      }))
      .sort((a, b) => b.value - a.value);
  }

  function exportData() {
    const blob = new Blob([window.Store.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sharo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ============================ 記憶の宮殿 ==================================
  function renderPalace() {
    const view = $('#view');
    const byId = {};
    topics().forEach((t) => { byId[t.id] = t; });
    const rooms = (window.SHARO.PALACE || []).filter((r) => byId[r.topic]);
    view.innerHTML = `
      <button class="link-back" id="back">← テーマ一覧</button>
      <section class="hero compact">
        <h2>🏰 記憶の宮殿</h2>
        <p class="muted">家の中を順に歩きながら、各「場所」に紐づく単元を思い出そう。場所→中身の順序が想起の手がかりになります。</p>
      </section>
      <div class="palace">
        ${rooms.map((r, i) => `
          <button class="palace-room" data-topic="${r.topic}">
            <span class="palace-num">${i + 1}</span>
            <span class="palace-body">
              <span class="palace-place">${r.place}</span>
              <span class="palace-hook">${r.hook}</span>
              <span class="palace-topic">→ ${byId[r.topic].title}</span>
            </span>
          </button>`).join('')}
      </div>`;
    $('#back').addEventListener('click', () => go('cross'));
    $$('.palace-room', view).forEach((el) =>
      el.addEventListener('click', () => go('cross', { topic: el.dataset.topic })));
  }

  // ============================ 全員のキャラ紹介 ===========================
  // サブ制度のキャラ(男性。トップ図鑑には出さないが紹介ページには載せる)
  const SUB_CHARACTERS = [
    { id: 'shain',   label: '船員保険' },
    { id: 'hiyatoi', label: '日雇労働者(雇用保険の特例)' },
    { id: 'kokka',   label: '国家公務員共済' },
    { id: 'chiho',   label: '地方公務員共済' },
    { id: 'shigaku', label: '私学共済' },
  ];
  function renderCharIntro() {
    const view = $('#view');
    const card = (id, name, title, law, color) =>
      `<div class="ci-card">
        <img src="./icons/chars/${id}.png" style="border-color:${color || '#cbd5e1'}" onerror="this.style.display='none'" alt="">
        <div class="ci-body"><div class="ci-name">${name}<span>${title ? ` ${title}` : ''}</span></div><div class="ci-law">${law}</div></div>
      </div>`;
    view.innerHTML = `
      <button class="link-back" id="back">← ホーム</button>
      <section class="hero compact">
        <h2>📚 法律キャラ図鑑</h2>
        <p class="muted">各科目を擬人化したキャラクター。比較表の列ヘッダーや記憶の宮殿にも登場します。</p>
      </section>
      <div class="char-intro-grid">
        ${LAW_CHARACTERS.map((c) => card(c.id, c.name, c.title, SUBJECTS[c.id] ? SUBJECTS[c.id].name : c.law, SUBJECTS[c.id] && SUBJECTS[c.id].color)).join('')}
      </div>
      <div class="ci-sub-head">サブ制度のキャラ</div>
      <div class="char-intro-grid">
        ${SUB_CHARACTERS.map((c) => card(c.id, c.label, '', 'サブ制度', '#94a3b8')).join('')}
      </div>`;
    $('#back').addEventListener('click', () => go('home'));
  }

  // ============================ ルーティング ================================
  // ============================ 覚え方(記憶の宮殿) =========================
  function renderMemoryGuide() {
    const view = $('#view');
    view.innerHTML = `
      <section class="hero compact">
        <h2>🏰 記憶の宮殿で覚える</h2>
        <p class="muted">場所と"ありえない絵"で、社労士の暗記を定着させる方法</p>
      </section>

      <div class="card-box">
        <h3>記憶の宮殿とは</h3>
        <p class="mg-text">古代から使われる記憶術(場所法／メソッド・オブ・ロサイ)。よく知っている場所(自宅など)を決まった順路で歩き、覚えたいことを各場所に"絵"として置きます。あとで頭の中で同じ順路を歩けば、絵が手がかりになって思い出せます。脳は「場所」の記憶が得意なので、その力に暗記を相乗りさせる仕組みです(研究でも長期の記憶向上が確認されています)。</p>
      </div>

      <div class="card-box">
        <h3>作り方(4ステップ)</h3>
        <ol class="mg-steps">
          <li><b>場所を選ぶ</b> … 自宅・通学路など、目をつぶって歩ける場所。</li>
          <li><b>順路を固定</b> … 玄関→廊下→居間…と、いつも同じ順に進む。</li>
          <li><b>絵を置く</b> … 各場所に、覚える内容を"ありえない絵"にして置く。</li>
          <li><b>歩いて復習</b> … 順路を何度か歩く。間隔をあけて見直すと長期記憶に。</li>
        </ol>
      </div>

      <div class="card-box">
        <h3>効果を上げるコツ</h3>
        <ul class="mg-list">
          <li>🔍 <b>誇張</b> … 巨大化・大量化など、ありえない大きさに。</li>
          <li>🎬 <b>動き</b> … 止まった絵より、動いている絵のほうが残る。</li>
          <li>😂 <b>感情・ユーモア</b> … 笑える・驚く・気持ち悪いほど忘れない。</li>
          <li>👂 <b>五感</b> … 音・におい・手ざわりも一緒に想像する。</li>
          <li>🧵 <b>物語でつなぐ</b> … 場所から場所へ、流れのある一本のストーリーに。</li>
          <li>🚪 <b>1部屋1テーマ</b> … 詰め込みすぎず、場所どうしは少し離す。</li>
        </ul>
      </div>

      <div class="card-box mg-apply">
        <h3>社労士試験への応用</h3>
        <ul class="mg-list">
          <li><b>横断の比較表を"家"に配置</b> … 「適用事業所」なら、玄関の表札＝法人(無条件で強制)、廊下の行列＝17業種、居間の5脚の椅子＝5人以上…のように各部屋へ。各テーマの 💡要点 にある<b>「🏰記憶の宮殿で覚える(一例)」</b>がその見本です。</li>
          <li><b>数字を場所＋語呂で</b> … 人数・日数・率(700人/3,000人、14日以内、4分の3 等)は、置き場所と語呂をセットにすると混同しにくい。</li>
          <li><b>登場人物で覚える</b> … 「公務員・船員」は<b>合コン</b>(国家公務員くん・船員くんを労基さん・労災さんが品定め)に見立てると、誰にどの法律がアリ/ナシか思い出せます。</li>
          <li><b>赤シート＋アクティブリコール</b> … まず宮殿で全体像を作り、横断表の赤シートと「問題」タブの○×で思い出す練習を繰り返す。</li>
          <li><b>忘却曲線で復習</b> … このアプリの出題間隔(間隔反復)に合わせて宮殿を歩き直すと、本試験まで保持できます。</li>
        </ul>
      </div>

      <button class="btn-primary big" id="mg-cross">🔀 横断テーマで宮殿の一例を見る</button>`;
    $('#mg-cross').addEventListener('click', () => go('cross'));
  }

  const ROUTES = {
    home: renderHome,
    cross: renderCross,
    review: renderReview,
    memory: renderMemoryGuide,
    palace: renderPalace,
    chars: renderCharIntro,
  };

  function go(route, params) {
    document.onkeydown = null;
    $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.route === route));
    window.scrollTo(0, 0);
    ROUTES[route](Date.now(), params);
  }

  function init() {
    // テーマ切替(初期アイコン反映 + クリックで反転)
    applyTheme(currentTheme());
    const tt = document.getElementById('theme-toggle');
    if (tt) tt.addEventListener('click', () =>
      applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'));

    $$('.nav-item').forEach((n) =>
      n.addEventListener('click', () => go(n.dataset.route)));
    go('home');

    // Service Worker(PWA)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
