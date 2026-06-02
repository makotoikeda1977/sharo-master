/*
 * 問題インポート(CSV / JSON のパース)
 * ----------------------------------------------------------------------------
 * content.js を編集しなくても、画面から自作問題・過去問を取り込めるようにする。
 * パースは純粋関数として切り出し、Node でも単体テストできるようにしている。
 *
 * 受け付ける形式:
 *  - JSON: テーマ配列 [{title, subjects, cards:[{q,a,hint,source}], table?, note?}, ...]
 *          または {"topics":[...]}
 *  - CSV : ヘッダー行 + データ行。列は topic/subjects/question/answer/hint/source
 *          (日本語ヘッダー テーマ/科目/問題/答え/ヒント/出典 も可)
 *          同じ topic 名の行は1テーマにまとめられる。
 * ----------------------------------------------------------------------------
 */
(function () {
  const SUBJECTS = window.SHARO.SUBJECTS;
  const shortToId = {};
  Object.values(SUBJECTS).forEach((s) => { shortToId[s.short] = s.id; });

  // 科目トークン(id か略称)を有効な科目 id に解決。不明なものは捨てる。
  function resolveSubjects(tokens) {
    const out = [];
    (tokens || []).forEach((tk) => {
      const t = String(tk).trim();
      if (!t) return;
      if (SUBJECTS[t]) out.push(t);
      else if (shortToId[t]) out.push(shortToId[t]);
    });
    return [...new Set(out)];
  }

  function slug(s) {
    return String(s).trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'topic';
  }

  function normalizeTopics(rawTopics) {
    const errors = [];
    const topics = [];
    rawTopics.forEach((t, i) => {
      if (!t || !t.title) { errors.push(`#${i + 1}: タイトルがありません`); return; }
      const cards = (Array.isArray(t.cards) ? t.cards : [])
        .filter((c) => c && c.q && c.a)
        .map((c) => ({
          q: String(c.q),
          a: String(c.a),
          hint: c.hint ? String(c.hint) : undefined,
          source: c.source ? String(c.source) : undefined,
        }));
      if (!cards.length) { errors.push(`「${t.title}」: 有効なカード(問題と答え)がありません`); return; }
      const topic = {
        id: 'custom-' + slug(t.id || t.title) + '-' + i,
        title: String(t.title),
        tagline: t.tagline ? String(t.tagline) : 'インポートした問題',
        subjects: resolveSubjects(t.subjects),
        cards,
        custom: true,
      };
      if (t.table && Array.isArray(t.table.headers) && Array.isArray(t.table.rows)) {
        topic.table = { headers: t.table.headers.map(String), rows: t.table.rows };
      }
      if (t.note) topic.note = String(t.note);
      topics.push(topic);
    });
    return { topics, errors };
  }

  function parseJSON(text) {
    const data = JSON.parse(text);
    const arr = Array.isArray(data) ? data
      : (data && Array.isArray(data.topics) ? data.topics : null);
    if (!arr) throw new Error('JSONは配列、または {"topics":[...]} 形式にしてください');
    return normalizeTopics(arr);
  }

  // 1行を CSV としてセル配列に分解(ダブルクォート対応)
  function splitCSVLine(line) {
    const out = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  }

  const COLMAP = {
    topic: 'topic', 'テーマ': 'topic', '分野': 'topic',
    subjects: 'subjects', subject: 'subjects', '科目': 'subjects',
    question: 'question', q: 'question', '問題': 'question', '問': 'question',
    answer: 'answer', a: 'answer', '答え': 'answer', '解答': 'answer', '答': 'answer',
    hint: 'hint', 'ヒント': 'hint',
    source: 'source', '出典': 'source',
  };

  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
    if (!lines.length) throw new Error('CSVが空です');
    const header = splitCSVLine(lines[0]).map((h) => COLMAP[h.toLowerCase()] || COLMAP[h] || h.toLowerCase());
    ['question', 'answer'].forEach((n) => {
      if (!header.includes(n)) {
        throw new Error('CSVのヘッダー行に「question(問題)」と「answer(答え)」が必要です');
      }
    });
    const idx = (name) => header.indexOf(name);
    const get = (cells, name) => (idx(name) >= 0 ? (cells[idx(name)] || '') : '');

    const groups = {};
    const order = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = splitCSVLine(lines[i]);
      const q = get(cells, 'question'), a = get(cells, 'answer');
      if (!q || !a) continue;
      const name = get(cells, 'topic') || 'インポート';
      if (!groups[name]) { groups[name] = { title: name, subjects: new Set(), cards: [] }; order.push(name); }
      const subj = get(cells, 'subjects');
      if (subj) subj.split(/[|｜、\/\s]+/).forEach((s) => s && groups[name].subjects.add(s));
      groups[name].cards.push({
        q, a,
        hint: get(cells, 'hint') || undefined,
        source: get(cells, 'source') || undefined,
      });
    }
    const rawTopics = order.map((name) => ({
      title: name, subjects: [...groups[name].subjects], cards: groups[name].cards,
    }));
    return normalizeTopics(rawTopics);
  }

  // 入力の先頭文字で JSON / CSV を自動判定
  function parse(text) {
    const t = (text || '').trim();
    if (!t) return { topics: [], errors: ['入力が空です'] };
    if (t[0] === '{' || t[0] === '[') return parseJSON(t);
    return parseCSV(t);
  }

  window.Importer = { parse, parseJSON, parseCSV, normalizeTopics };
})();
