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

  // テーマのカテゴリー(ホームの分類と同じ): 単科＝その科目id ／ 2科目以上＝'横断'
  function themeCategory(t) {
    return (t.subjects && t.subjects.length === 1) ? t.subjects[0] : '横断';
  }
  // 同じカテゴリー内で次のテーマのidを返す(末尾は先頭へ循環)
  function nextTopicId(curId) {
    const list = topics();
    const cur = list.find((t) => t.id === curId);
    if (!cur) return null;
    const cat = themeCategory(cur);
    const sameCat = list.filter((t) => themeCategory(t) === cat);
    const i = sameCat.findIndex((t) => t.id === curId);
    if (i < 0) return null;
    return sameCat[(i + 1) % sameCat.length].id;
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
        new Notification('社労士試験横断アプリ', {
          body: `今日の復習が${dueCount}問あります。`,
          icon: './icons/icon.svg',
        });
      } catch (e) {}
    },
  };

  // ============================ ホーム ======================================
  let homeSubj = null;        // ホームの科目フィルタ(null=すべて)
  let homeQuery = '';         // テーマ検索(タイトル・要約・問題文を横断検索)
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

    // タブ: 横断(複数科目)=homeSubj null ／ 単科目=その科目のみ(横断は重複させない)
    // 検索中はタブを越えて全テーマから探す(タイトル・要約・問題文)
    let rows;
    if (homeQuery) {
      const q = homeQuery;
      rows = topics().filter((t) =>
        t.title.includes(q) || (t.tagline || '').includes(q) ||
        t.cards.some((c) => c.q.includes(q) || (c.p || '').includes(q))
      ).map((t) => ({ t }));
    } else if (homeSubj) {
      rows = topics().filter((t) => t.subjects.length === 1 && t.subjects[0] === homeSubj).map((t) => ({ t }));
    } else {
      rows = topics().filter((t) => t.subjects.length >= 2).map((t) => ({ t }));
    }

    // 単科目テーマを持つ科目だけをタブに出す(SUBJECTS の順)
    const singlePresent = new Set();
    topics().forEach((t) => { if (t.subjects.length === 1) singlePresent.add(t.subjects[0]); });
    const subjList = Object.keys(SUBJECTS).filter((sj) => singlePresent.has(sj));

    const rowHTML = rows.map((r, i) => `
        <tr class="prio-row" data-topic="${r.t.id}">
          <td class="prio-rank"><span class="rank-no">${i + 1}</span></td>
          <td class="prio-main">
            <div class="prio-title">${r.t.title}</div>
            <div class="subj-tags">${r.t.subjects.map(subjTag).join('')}</div>
          </td>
          <td class="prio-stat"><span class="pill">${r.t.cards.length}問</span></td>
        </tr>`).join('');

    view.innerHTML = `
      <input type="search" id="theme-search" class="theme-search" placeholder="🔍 テーマ・キーワードを検索（例: 時効、4分の3）" value="${homeQuery.replace(/"/g, '&quot;')}" autocomplete="off">
      <div class="subj-filter${homeQuery ? ' dim' : ''}">
        <button class="sfchip${homeSubj === null && !homeQuery ? ' on' : ''}" data-subj="">横断</button>
        ${subjList.map((sj) =>
          `<button class="sfchip${homeSubj === sj && !homeQuery ? ' on' : ''}" data-subj="${sj}" style="--c:${SUBJECTS[sj].color}">${SUBJECTS[sj].short}</button>`).join('')}
      </div>
      <div class="card-box prio-box">
        <div class="prio-head">
          <h3>${homeQuery ? `「${homeQuery}」の検索結果` : (homeSubj ? SUBJECTS[homeSubj].name : '横断テーマ')}</h3>
          <span class="small muted">${homeQuery ? rows.length + '件' : 'タップして練習'}</span>
        </div>
        <table class="prio-table"><tbody>${rowHTML || '<tr><td class="prio-empty muted small">該当するテーマがありません</td></tr>'}</tbody></table>
      </div>
      ${s.importedTotal > 0 ? `<button class="btn-ghost big imp-btn" id="start-imported">
        📖 過去問だけ解く(${s.importedTotal}問)
      </button>` : ''}
      <p class="law-basis">令和7年度法令基準 ／ 全問を現行法令・過去問原文と照合して作成</p>`;

    const searchInp = $('#theme-search');
    searchInp.addEventListener('input', () => {
      homeQuery = searchInp.value.trim();
      renderHome(Date.now());
      // 再描画で失うフォーカスとカーソル位置を復元
      requestAnimationFrame(() => {
        const i = $('#theme-search');
        if (i) { i.focus(); const len = i.value.length; i.setSelectionRange(len, len); }
      });
    });
    $$('.sfchip', view).forEach((b) =>
      b.addEventListener('click', () => { homeQuery = ''; homeSubj = b.dataset.subj || null; renderHome(Date.now()); }));
    $$('.prio-row', view).forEach((el) =>
      el.addEventListener('click', () => { lastOrigin = 'home'; go('cross', { topic: el.dataset.topic }); }));
    restoreListScroll(view);
    const impBtn = $('#start-imported');
    if (impBtn) impBtn.addEventListener('click', () => go('review', { imported: true }));
  }

  // ============================ 横断学習 ====================================
  function renderCross(now, params) {
    const view = $('#view');
    const topicId = params && params.topic;
    if (!topicId) {
      view.innerHTML = `
        <div class="topic-list">
          ${topics().map((t) => topicCardHTML(t, now)).join('')}
        </div>`;
      $$('.topic-card', view).forEach((el) =>
        el.addEventListener('click', () => { lastOrigin = 'cross'; go('cross', { topic: el.dataset.topic }); }));
      restoreListScroll(view);
      return;
    }

    const topic = topics().find((t) => t.id === topicId);
    // 答え列が2つ以上ある表は、列ごとに色を分けて区別しやすくする
    const multiCol = !!(topic.table && topic.table.headers && topic.table.headers.length >= 3);
    const noMask = (topic.table && Array.isArray(topic.table.noMaskCols)) ? topic.table.noMaskCols : [];
    const emCols = (topic.table && Array.isArray(topic.table.emCols)) ? topic.table.emCols : [];
    const shCols = shortColSet(topic.table);
    const colAccent = (i) => COL_ACCENTS[(i - 1) % COL_ACCENTS.length];
    const merge = !!(topic.table && topic.table.mergeFirstCol);
    const span = [];
    if (merge) {
      const rows = topic.table.rows;
      for (let ri = 0; ri < rows.length; ) {
        let n = 1;
        while (ri + n < rows.length && rows[ri + n][0] === rows[ri][0]) n++;
        span[ri] = n;
        for (let k = 1; k < n; k++) span[ri + k] = 0;
        ri += n;
      }
    }
    view.innerHTML = `
      <button class="link-back" id="back">← テーマ一覧</button>
      <section class="hero compact">
        <h2>${topic.title}</h2>
        <div class="subj-tags">${topic.subjects.map(subjTag).join('')}</div>
      </section>
      <div class="card-box">
        ${topic.table ? `
        <div class="sheet-bar">
          <button class="chip2" id="sheet-toggle">⬜️ 赤シート OFF</button>
          <span class="sheet-hint small muted" style="visibility:hidden">タップで答え表示</span>
        </div>
        <div class="table-wrap" id="cmp-wrap">
          <table class="cmp${multiCol ? ' wide' : ''}">
            <thead><tr>${topic.table.headers.map((h, i) => {
                const cid = lawCharId(h);
                const face = cid ? `<img class="colface" src="./icons/chars/${cid}.png" style="border-color:${rowLawColor(h) || '#cbd5e1'}" onerror="this.style.display='none'" alt="">` : '';
                const cls = (multiCol && i > 0) ? ' class="colh"' : '';
                const style = (multiCol && i > 0) ? ` style="--colc:${colAccent(i)}"` : '';
                return `<th${cls}${style}>${face}${h}</th>`;
              }).join('')}</tr></thead>
            <tbody>${topic.table.rows.map((r, ri) => {
                const rowColors = topic.table.rowColors;
                const lc = (rowColors && rowColors[ri]) || rowLawColor(r[0]) ||
                  (topic.subjects && topic.subjects.length === 1 && SUBJECTS[topic.subjects[0]]
                    ? SUBJECTS[topic.subjects[0]].color : null);
                const trA = lc ? ` class="lawrow" style="--rowc:${lc}"` : '';
                const useColC = multiCol && !rowColors;  // 行色を使うときは列の背景色を抑える(二重着色防止)
                return `<tr${trA}>${r.map((c, i) => {
                  if (i === 0) {
                    if (!merge) return `<td class="rowhdr">${c}</td>`;
                    if (span[ri] === 0) return '';
                    if (span[ri] > 1) return `<td class="rowhdr merged" rowspan="${span[ri]}">${c}</td>`;
                    return `<td class="rowhdr">${c}</td>`;
                  }
                  if (!c) return '<td></td>';
                  const sh = shCols.has(i) ? ' short' : '';
                  const em = emCols.includes(i) ? ' em' : '';
                  if (noMask.includes(i)) {
                    const style = useColC ? ` style="--colc:${colAccent(i)}"` : '';
                    return `<td class="ans nomask${useColC ? ' colc' : ''}${sh}${em}"${style}>${c}</td>`;
                  }
                  // セル内に **太字** があれば「語句単位の赤シート」、なければセル全体マスク
                  const hasCloze = c.indexOf('**') >= 0;
                  const cls = 'ans' + (useColC ? ' colc' : '') + (hasCloze ? ' wordcloze' : '') + sh + em;
                  const style = useColC ? ` style="--colc:${colAccent(i)}"` : '';
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
        ${topic.voices && topic.voices.length ? `
        <div class="voices">
          <div class="vc-head">🗣️ 制度のホンネ(ここがポイント)</div>
          ${topic.voices.map((v) => {
            const c = (v.subj && SUBJECTS[v.subj]) ? SUBJECTS[v.subj].color : '#64748b';
            const cid = v.char || (v.subj && SUBJECTS[v.subj] ? v.subj : null);
            const face = cid ? `<img class="vc-face" src="./icons/chars/${cid}.png" style="border-color:${c}" onerror="this.style.display='none'" alt="">` : '';
            return `<div class="vc-row" style="--vc:${c}">
              <span class="vc-who">${face}<span class="vc-name">${v.subj && SUBJECTS[v.subj] ? SUBJECTS[v.subj].short : v.name}</span></span>
              <span class="vc-line">${v.line}</span>
            </div>`;
          }).join('')}
        </div>` : ''}
      </div>
      <button class="btn-primary big" id="study-topic">一問一答を解く(${topic.cards.length}問)</button>`;

    $('#back').addEventListener('click', () => { scrollToTopic = topic.id; go(lastOrigin); });
    $('#study-topic').addEventListener('click', () => go('review', { topic: topic.id }));

    // 赤シート(答えを隠す/タップで表示)
    if (topic.table) {
      const wrap = $('#cmp-wrap');
      const masks = $$('.mask, .cloze', wrap);
      let sheetOn = false;  // 最初は赤シートOFF(答えが見えている状態)
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
    return `
      <div class="topic-card" data-topic="${t.id}">
        <div class="topic-head"><h3>${t.title}</h3><span class="pill">${t.cards.length}問</span></div>
        <div class="subj-tags">${t.subjects.map(subjTag).join('')}</div>
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
  // 短い答え(数字・割合・キーワード)は大きく太字で見せる
  function isShortCell(c) {
    if (!c) return false;
    if (c.indexOf('<br>') >= 0) return false;
    const t = String(c).replace(/\*\*/g, '').replace(/<[^>]+>/g, '').trim();
    return t.length > 0 && t.length <= 8;
  }
  // 列単位の強調可否: 答え列(i>=1)のうち、非空セルが「全て短い」列だけ.short対象にする。
  // 同じ列に短い/長いが混在すると太字大文字と普通字の落差で見栄えが悪いため、混在列は強調しない。
  function shortColSet(table) {
    const cols = new Set();
    if (!table || !table.headers) return cols;
    const rows = table.rows || [];
    for (let i = 1; i < table.headers.length; i++) {
      let any = false, allShort = true;
      for (const r of rows) {
        const c = r[i];
        if (c === undefined || c === null || String(c).trim() === '') continue;
        any = true;
        if (!isShortCell(c)) { allShort = false; break; }
      }
      if (any && allShort) cols.add(i);
    }
    // 答え列が複数あって「一部の列だけ」短い場合は、意味のない太字に見えるため強調しない。
    // (答え列が1つの横断表、または全答え列が短い均一な表のときだけ強調する)
    const answerCols = table.headers.length - 1;
    if (answerCols > 1 && cols.size > 0 && cols.size < answerCols) return new Set();
    return cols;
  }
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
    { id: 'kijun', name: '基島規子', law: '労基' },
    { id: 'anei', name: '守谷衛', law: '安衛' },
    { id: 'rosai', name: '災堂咲', law: '労災' },
    { id: 'koyo', name: '職田めぐみ', law: '雇用' },
    { id: 'choshu', name: '収沢徴子', law: '徴収' },
    { id: 'kenpo', name: '保科碧', law: '健保' },
    { id: 'konen', name: '厚見年実', law: '厚年' },
    { id: 'kokunen', name: '国原みのり', law: '国年' },
    { id: 'roippan', name: '労井美樹', law: '労一' },
    { id: 'shaippan', name: '市役あい', law: '社一' },
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

    // 全カードを毎回ランダムな順で出題(復習スケジュール・上限なし)
    return shuffle(cards);
  }

  function renderReview(now, params) {
    const weak = !!(params && params.weak);
    const imported = !!(params && params.imported);
    const queue = buildQueue(now, { topic: params && params.topic, weak, imported });
    session = {
      queue, pos: 0, revealed: false, answered: null, graded: false, done: 0, again: 0,
      topicId: params && params.topic, weak, imported,
    };
    drawReview();
  }

  // カードの問題文・解説の法令名から、その1問の科目を判定(横断テーマ用)
  function detectCardSubject(card, topic) {
    const rules = [
      ['anei',    /労働安全衛生法/],
      ['rosai',   /労働者災害補償保険法|労災保険法/],
      ['koyo',    /雇用保険法/],
      ['kenpo',   /健康保険法/],
      ['konen',   /厚生年金保険法/],
      ['kokunen', /国民年金法/],
      ['choshu',  /労働保険の保険料の徴収|労働保険徴収法|徴収法|労働保険の保険関係/],
      ['kijun',   /労働基準法/],
    ];
    // ① q冒頭の【法令名】を最優先で判定(本文中の他法令への言及で誤判定しないように)
    const head = (card.q || '').match(/^【([^】]*)】/);
    if (head) {
      for (const [id, re] of rules) if (re.test(head[1])) return id;
    }
    // ② フォールバック: 全文スキャン
    const text = (card.q || '') + ' ' + (card.a || '');
    for (const [id, re] of rules) if (re.test(text)) return id;
    return (topic.subjects && topic.subjects[0]) || null;
  }

  // 科目id→キャラ名(顔は icons/chars/<科目id>.png)
  const CHAR_NAMES = { kijun: '基島規子', anei: '守谷衛', rosai: '災堂咲', koyo: '職田めぐみ', choshu: '収沢徴子', kenpo: '保科碧', konen: '厚見年実', kokunen: '国原みのり', roippan: '労井美樹', shaippan: '市役あい' };
  // 解説中の [[...]] を赤太字に
  function hlMark(t) { return String(t == null ? '' : t).replace(/\[\[(.+?)\]\]/g, '<b class="hot">$1</b>'); }
  // 解説冒頭の自己紹介(「○ 労基の基島よ。」など)を除去。短い一文・キャラ名や「私」を含む・[[ ]]を含まないものだけを安全に削る
  function stripIntro(a) {
    return String(a == null ? '' : a).replace(
      /^([○×])\s*(?:いい？)?\s*[^。！\[\]]{0,12}(?:基島|労井|守谷|災堂|職田|収沢|保科|年実|みのり|市役あい|の私)[^。！\[\]]{0,12}[。！]\s*/,
      '$1 '
    );
  }

  // 復習中に開く「横断表オーバーレイ」のHTML(renderCrossの表描画を踏襲)
  function reviewTableHTML(topic) {
    if (!topic || !topic.table) return '';
    const t = topic.table;
    const multiCol = !!(t.headers && t.headers.length >= 3);
    const noMask = Array.isArray(t.noMaskCols) ? t.noMaskCols : [];
    const emCols = Array.isArray(t.emCols) ? t.emCols : [];
    const shCols = shortColSet(t);
    const colAccent = (i) => COL_ACCENTS[(i - 1) % COL_ACCENTS.length];
    const merge = !!t.mergeFirstCol;
    const span = [];
    if (merge) {
      const rows = t.rows;
      for (let ri = 0; ri < rows.length; ) {
        let n = 1;
        while (ri + n < rows.length && rows[ri + n][0] === rows[ri][0]) n++;
        span[ri] = n;
        for (let k = 1; k < n; k++) span[ri + k] = 0;
        ri += n;
      }
    }
    const thead = `<thead><tr>${t.headers.map((h, i) => {
      const cid = lawCharId(h);
      const face = cid ? `<img class="colface" src="./icons/chars/${cid}.png" style="border-color:${rowLawColor(h) || '#cbd5e1'}" onerror="this.style.display='none'" alt="">` : '';
      const cls = (multiCol && i > 0) ? ' class="colh"' : '';
      const style = (multiCol && i > 0) ? ` style="--colc:${colAccent(i)}"` : '';
      return `<th${cls}${style}>${face}${h}</th>`;
    }).join('')}</tr></thead>`;
    const tbody = `<tbody>${t.rows.map((r, ri) => {
      const rowColors = t.rowColors;
      const lc = (rowColors && rowColors[ri]) || rowLawColor(r[0]) || (topic.subjects && topic.subjects.length === 1 && SUBJECTS[topic.subjects[0]] ? SUBJECTS[topic.subjects[0]].color : null);
      const trA = lc ? ` class="lawrow" style="--rowc:${lc}"` : '';
      const useColC = multiCol && !rowColors;
      return `<tr${trA}>${r.map((c, i) => {
        if (i === 0) {
          if (!merge) return `<td class="rowhdr">${c}</td>`;
          if (span[ri] === 0) return '';
          if (span[ri] > 1) return `<td class="rowhdr merged" rowspan="${span[ri]}">${c}</td>`;
          return `<td class="rowhdr">${c}</td>`;
        }
        if (!c) return '<td></td>';
        const sh = shCols.has(i) ? ' short' : '';
        const em = emCols.includes(i) ? ' em' : '';
        if (noMask.includes(i)) {
          const style = useColC ? ` style="--colc:${colAccent(i)}"` : '';
          return `<td class="ans nomask${useColC ? ' colc' : ''}${sh}${em}"${style}>${c}</td>`;
        }
        const hasCloze = c.indexOf('**') >= 0;
        const cls = 'ans' + (useColC ? ' colc' : '') + (hasCloze ? ' wordcloze' : '') + sh + em;
        const style = useColC ? ` style="--colc:${colAccent(i)}"` : '';
        const inner = hasCloze ? c.replace(/\*\*(.+?)\*\*/g, '<span class="cloze">$1</span>') : `<span class="mask">${c}</span>`;
        return `<td class="${cls}"${style}>${inner}</td>`;
      }).join('')}</tr>`;
    }).join('')}</tbody>`;
    return `<div class="tbl-ov" id="tbl-ov" hidden>
      <div class="tbl-ov-card">
        <div class="tbl-ov-bar"><span class="tbl-ov-title">📊 ${topic.title}</span><button class="tbl-ov-close" id="tbl-ov-close">✕ 閉じる</button></div>
        <div class="sheet-bar"><button class="chip2" id="ov-sheet-toggle">⬜️ 赤シート OFF</button><span class="sheet-hint small muted" id="ov-sheet-hint" style="visibility:hidden">タップで答え表示</span></div>
        <div class="table-wrap" id="ov-cmp-wrap"><table class="cmp${multiCol ? ' wide' : ''}">${thead}${tbody}</table></div>
      </div>
    </div>`;
  }

  // 表オーバーレイの開閉＋赤シートを配線
  function wireReviewTable() {
    const ov = document.getElementById('tbl-ov');
    const openBtn = document.getElementById('tbl-open');
    if (!ov || !openBtn) return;
    openBtn.addEventListener('click', () => { ov.hidden = false; });
    const closeBtn = document.getElementById('tbl-ov-close');
    if (closeBtn) closeBtn.addEventListener('click', () => { ov.hidden = true; });
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.hidden = true; });
    const wrap = document.getElementById('ov-cmp-wrap');
    const toggle = document.getElementById('ov-sheet-toggle');
    if (wrap && toggle) {
      let sheetOn = false;  // 表ボタンで開いた直後は赤シートOFF(答えが見えている)
      toggle.addEventListener('click', () => {
        sheetOn = !sheetOn;
        wrap.classList.toggle('sheet', sheetOn);
        toggle.textContent = sheetOn ? '🟥 赤シート ON' : '⬜️ 赤シート OFF';
        const hint = document.getElementById('ov-sheet-hint'); if (hint) hint.style.visibility = sheetOn ? 'visible' : 'hidden';
      });
      $$('.mask, .cloze', wrap).forEach((m) => m.addEventListener('click', () => { if (sheetOn) m.classList.toggle('revealed'); }));
    }
  }

  function drawReview() {
    const view = $('#view');
    const now = Date.now();
    if (session.pos >= session.queue.length) {
      const empty = session.done === 0;
      view.innerHTML = `
        <section class="done">
          <div class="done-emoji">${empty ? '✅' : '🎉'}</div>
          <h2>${empty ? '対象がありません' : 'セッション完了!'}</h2>
          <p class="muted">${empty
            ? '出題できるカードがありません。'
            : `${session.done}問を解きました`}</p>
          <div class="done-actions">
            ${session.topicId ? `<button class="btn-primary" id="next-topic">次のテーマへ →</button>` : ''}
            <button class="btn-ghost" id="to-home">ホームへ</button>
          </div>
        </section>`;
      const nextBtn = $('#next-topic');
      if (nextBtn) nextBtn.addEventListener('click', () => {
        const nid = nextTopicId(session.topicId);
        if (nid) go('cross', { topic: nid }); else go('home');
      });
      $('#to-home').addEventListener('click', () => go('home'));
      return;
    }

    const item = session.queue[session.pos];
    const total = session.queue.length;
    const card = item.card;
    const ox = oxAnswer(card);          // '○' | '×' | null
    const subj = detectCardSubject(card, item.topic);
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
          ${session.imported ? '<span class="mode-badge imp">📖 過去問</span>' : ''}
          <span class="subj-line">${item.topic.subjects.map(subjTag).join('')}</span>
          <span class="topic-name">${item.topic.title}</span>
          ${card.source ? `<span class="src-badge">${card.source}</span>` : ''}
        </div>
        <div class="q">${subj && SUBJECTS[subj] ? `<span class="q-subj" style="--c:${SUBJECTS[subj].color}">${SUBJECTS[subj].short}</span>` : ''}${card.q.replace(/^【[^】]*】\s*/, '')}</div>
        ${card.hint ? `<div class="hint" id="hint">ヒントを見る</div>` : ''}
        <div class="a ${showAnswer ? 'show' : ''}" id="answer">${card.p ? `<div class="kai-point"><span class="kai-plbl">📌 ポイント</span>${card.p}</div>` : ''}${subj && SUBJECTS[subj] ? `<div class="kai-spk"><img class="kai-face" src="./icons/chars/${subj}.png" style="border-color:${SUBJECTS[subj].color}" onerror="this.style.display='none'" alt=""><span class="kai-name" style="color:${SUBJECTS[subj].color}">${CHAR_NAMES[subj] || SUBJECTS[subj].short}（${SUBJECTS[subj].short}）</span></div>` : ''}<div class="kai-text">${hlMark(stripIntro(card.a))}</div></div>
      </div>
      <div class="rv-actions">
        ${ans
          ? `<button class="btn-primary big" id="next">次へ</button>`
          : ox
            ? `<div class="ox-buttons">
                 <button class="ox-btn" data-ox="○" style="--c:#dc2626">○ 正しい</button>
                 <button class="ox-btn" data-ox="×" style="--c:#2563eb">× 誤り</button>
               </div>`
            : session.revealed
              ? `<button class="btn-primary big" id="next">次へ</button>`
              : `<button class="btn-primary big" id="reveal">答えを見る</button>`}
      </div>
      ${item.topic.table ? `<button class="tbl-fab" id="tbl-open">📊 表</button>` : ''}
      ${reviewTableHTML(item.topic)}`;

    // 画面遷移ボタン(常時): もどる=この復習をやめて戻る / スキップ=採点せず次へ
    $('#rv-exit').addEventListener('click', () =>
      go(session.topicId ? 'cross' : 'home', session.topicId ? { topic: session.topicId } : null));
    $('#rv-skip').addEventListener('click', skipCard);
    wireReviewTable();

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
      $('#next').addEventListener('click', nextCard);
      document.onkeydown = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); nextCard(); } };
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
    const item = session.queue[session.pos];
    const correct = (choice === oxAnswer(item.card));
    if (!session.graded) {  // 練習カウントのみ(SRS採点・復習スケジュールは廃止)
      session.done++;
      if (!correct) session.again++;
      session.graded = true;
    }
    session.answered = { choice, correct };
    drawReview();
  }

  function nextCard() {
    document.onkeydown = null;
    session.pos++;
    session.revealed = false;
    session.answered = null;
    session.graded = false;
    drawReview();
  }

  // 採点せずに次のカードへ進む(記憶状態は変えない)
  function skipCard() {
    document.onkeydown = null;
    session.pos++;
    session.revealed = false;
    session.answered = null;
    session.graded = false;
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

  // 成長度ページ(renderGrowth)は廃止・削除。ナビからも撤去済み。

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
      let info = `${result.topics.length}テーマ / ${cardTotal}問を取り込みました。`;
      if (result.errors.length) info += `(スキップ ${result.errors.length}件)`;
      alert(info);
      close();
      go('home');
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
    const card = (id, name, law, color) =>
      `<div class="ci-card">
        <img src="./icons/chars/${id}.png" style="border-color:${color || '#cbd5e1'}" onerror="this.style.display='none'" alt="">
        <div class="ci-body"><div class="ci-name">${name}</div><div class="ci-law">${law}</div></div>
      </div>`;
    view.innerHTML = `
      <button class="link-back" id="back">← ホーム</button>
      <section class="hero compact">
        <h2>📚 法律キャラ図鑑</h2>
        <p class="muted">各科目を擬人化したキャラクター。比較表の列ヘッダーや記憶の宮殿にも登場します。</p>
      </section>
      <div class="char-intro-grid">
        ${LAW_CHARACTERS.map((c) => card(c.id, c.name, SUBJECTS[c.id] ? SUBJECTS[c.id].name : c.law, SUBJECTS[c.id] && SUBJECTS[c.id].color)).join('')}
      </div>
      <div class="ci-sub-head">サブ制度のキャラ</div>
      <div class="char-intro-grid">
        ${SUB_CHARACTERS.map((c) => card(c.id, c.label, 'サブ制度', '#94a3b8')).join('')}
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

      <div class="card-box char-gallery">
        <h3 class="char-gallery-title" id="open-chars">法律キャラ図鑑<span class="char-more">ぜんいん見る →</span></h3>
        <div class="char-row">
          ${LAW_CHARACTERS.map((c) =>
            `<div class="char-item"><img src="./icons/chars/${c.id}.png" style="border-color:${SUBJECTS[c.id] ? SUBJECTS[c.id].color : '#cbd5e1'}" alt=""><span class="char-law">${c.law}</span><span class="char-name">${c.name}</span></div>`).join('')}
        </div>
      </div>

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

      <div class="card-box">
        <h3>🟥 赤シートを伏せる理由（アクティブリコール）</h3>
        <p class="mg-text">このアプリで答えを赤シートで隠すのは、<b>アクティブリコール（積極的想起）</b>を使うためです。答えをただ眺めて覚えるより、<b>「思い出そうと一生懸命がんばること」そのもの</b>が記憶を強く定着させます。これは多くの研究でも確認されている、暗記のいちばんの近道です。</p>
        <ul class="mg-list">
          <li>⏳ <b>すぐ答えを見ない</b> … まず数秒、自力で思い出そうと粘る。その「思い出す負荷」が効きます。</li>
          <li>✍️ <b>間違えてOK</b> … 思い出そうとした努力があれば、外しても次はより強く残ります。</li>
          <li>🔁 <b>思い出す→確認をくり返す</b> … 赤シートと○×で「思い出す練習」を反復するのが定着の王道です。</li>
        </ul>
      </div>

      <div class="card-box mg-apply">
        <h3>社労士試験への応用</h3>
        <ul class="mg-list">
          <li><b>横断の比較表を"家"に配置</b> … 「適用事業所」なら、玄関の表札＝法人(無条件で強制)、廊下の行列＝17業種、居間の5脚の椅子＝5人以上…のように各部屋へ。各テーマの 💡要点 にある<b>「🏰記憶の宮殿で覚える(一例)」</b>がその見本です。</li>
          <li><b>数字を場所＋語呂で</b> … 人数・日数・率(700人/3,000人、14日以内、4分の3 等)は、置き場所と語呂をセットにすると混同しにくい。</li>
          <li><b>数字はシンボル(形)に変える</b> … 覚えにくい数字は、形の似たモノに置き換えて"絵"にします(例: 1=ろうそく🕯 / 2=白鳥🦢 / 3=耳👂 / 4=ヨット⛵ / 5=フック / 8=雪だるま⛄ / 0=ボール⚽)。「常時5人以上」なら壁にフックが5本、「14日以内」ならカレンダーに石(14=いし)…のように、数字をモノの絵にして場所に置くと、人数・日数・率が混同しにくくなります。</li>
          <li><b>赤シート＋アクティブリコール</b> … まず宮殿で全体像を作り、横断表の赤シートと「問題」タブの○×で思い出す練習を繰り返す。</li>
          <li><b>忘却曲線で復習</b> … このアプリの出題間隔(間隔反復)に合わせて宮殿を歩き直すと、本試験まで保持できます。</li>
        </ul>
      </div>

      <button class="btn-primary big" id="mg-cross">🔀 横断テーマで宮殿の一例を見る</button>`;
    const openChars = $('#open-chars');
    if (openChars) openChars.addEventListener('click', () => go('chars'));
    $('#mg-cross').addEventListener('click', () => go('cross'));
  }

  // 使い方・お問い合わせ・プライバシーポリシー(アプリストア提出に必要な情報を含む)
  const SUPPORT_EMAIL = 'info@houday.jp';
  const OPERATOR_NAME = '池田誠';
  function renderInfo() {
    const view = $('#view');
    const contact = SUPPORT_EMAIL
      ? `<a class="info-link" href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>`
      : '<span class="muted">（お問い合わせ先メールアドレスは準備中です）</span>';
    view.innerHTML = `
      <section class="info-page">
        <h2 class="info-h">使い方とアクティブリコール</h2>

        <div class="card-box info-card">
          <h3>🧠 アクティブリコールとは</h3>
          <p>答えを「見て覚える」のではなく、問いに対して<b>自分で思い出す（検索する）</b>ことで記憶が定着する学習法です（テスト効果）。本アプリは、紛らわしい制度を<b>同じ軸で比べる横断表</b>と<b>○×の一問一答</b>で、思い出す力を鍛えます。</p>
        </div>

        <div class="card-box info-card">
          <h3>📖 進め方</h3>
          <ol class="info-steps">
            <li><b>テーマを選ぶ</b> … まず比較表で全体像と差分をつかむ</li>
            <li><b>一問一答を解く</b> … ○か×か、<b>まず自分で思い出して</b>答える</li>
            <li><b>答え合わせ</b> … 解説とポイントで確認する</li>
            <li><b>次へ／次のテーマへ</b> … 同じカテゴリーを連続で進める</li>
          </ol>
          <p class="muted info-small">コツ：間違えてOK。思い出そうとする過程が記憶を強くします。スキマ時間に繰り返しましょう。</p>
        </div>

        <div class="card-box info-card">
          <h3>✉️ お問い合わせ</h3>
          <p>不具合・ご要望・内容の誤りのご指摘は、こちらまでお願いします。</p>
          <p>${contact}</p>
        </div>

        <div class="card-box info-card">
          <h3>🔒 プライバシーポリシー</h3>
          <ul class="info-list">
            <li>本アプリは、学習データ（解答状況・設定）を<b>お使いの端末内（ブラウザのローカルストレージ）にのみ保存</b>します。</li>
            <li>氏名・メールアドレス等の<b>個人情報は収集・送信しません</b>。アカウント登録も不要です。</li>
            <li>通信は<b>アプリ本体（静的ファイル）の取得・更新のみ</b>で、入力内容を外部へ送信することはありません。</li>
            <li><b>広告・アクセス解析（トラッキング）は使用していません。</b>第三者への情報提供もありません。</li>
            <li>保存データを消したい場合は、ブラウザの当サイトのサイトデータを削除してください。</li>
          </ul>
        </div>

        <div class="card-box info-card">
          <h3>⚠️ ご利用上の注意（免責）</h3>
          <ul class="info-list">
            <li>本アプリは社会保険労務士試験の学習補助を目的としています。</li>
            <li>出題は作成時点の現行法令に基づきますが、<b>法令は改正されます</b>。最終的な内容は最新の条文・通達等で必ずご確認ください。</li>
            <li>本アプリの利用により生じた結果について、運営者は責任を負いかねます。</li>
          </ul>
        </div>

        <div class="card-box info-card">
          <h3>運営者</h3>
          <p>${OPERATOR_NAME}</p>
        </div>

        <p class="law-basis">令和7年度法令基準 ／ 全問を現行法令・過去問原文と照合して作成</p>
      </section>`;
  }

  const ROUTES = {
    home: renderHome,
    cross: renderCross,
    review: renderReview,
    info: renderInfo,
  };

  function go(route, params) {
    document.onkeydown = null;
    $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.route === route));
    window.scrollTo(0, 0);
    ROUTES[route](Date.now(), params);
  }

  function init() {
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
