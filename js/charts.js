/*
 * 依存ゼロの Canvas 描画ヘルパー
 *   - 忘却曲線(保持率の時間減衰)
 *   - 成長度の推移(日別の累積記憶強度)
 *   - 科目別の習得度バー
 * ----------------------------------------------------------------------------
 */
(function () {
  // Retina 対応で canvas を実寸に合わせる
  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 320;
    const h = rect.height || 180;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  const FONT = "12px -apple-system, 'Hiragino Kaku Gothic ProN', sans-serif";
  const AXIS = '#cbd5e1';
  const TEXT = '#64748b';

  /*
   * 忘却曲線: いま学習中のカード群について、今後 N 日間の平均保持率がどう
   * 減衰するか + 復習でどう回復するかを示す。
   * curves = [{ stability, last, color, dim }] の配列(代表カード)。
   */
  function forgettingCurve(canvas, curves, now, days) {
    const { ctx, w, h } = setup(canvas);
    const padL = 36, padR = 12, padT = 12, padB = 26;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const DAY = 24 * 60 * 60 * 1000;

    // グリッド + Y軸(保持率 0〜100%)
    ctx.font = FONT;
    ctx.strokeStyle = '#eef2f7';
    ctx.fillStyle = TEXT;
    ctx.lineWidth = 1;
    [0, 0.25, 0.5, 0.75, 1].forEach((r) => {
      const y = padT + plotH * (1 - r);
      ctx.beginPath();
      ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(r * 100) + '%', padL - 6, y);
    });
    // 目標保持率 90% ライン
    const y90 = padT + plotH * (1 - 0.9);
    ctx.strokeStyle = '#22c55e';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(padL, y90); ctx.lineTo(w - padR, y90); ctx.stroke();
    ctx.setLineDash([]);

    // X軸ラベル(日)
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [0, days / 2, days].forEach((d) => {
      const x = padL + plotW * (d / days);
      ctx.fillStyle = TEXT;
      ctx.fillText(d === 0 ? '今日' : `${Math.round(d)}日後`, x, h - padB + 6);
    });

    // 各曲線
    curves.forEach((c) => {
      if (!c.stability || !c.last) return;
      ctx.strokeStyle = c.color || '#3b82f6';
      ctx.globalAlpha = c.dim ? 0.25 : 0.9;
      ctx.lineWidth = c.dim ? 1.5 : 2.5;
      ctx.beginPath();
      for (let px = 0; px <= plotW; px++) {
        const d = (px / plotW) * days;
        const future = now + d * DAY;
        const t = Math.max(0, (future - c.last) / DAY);
        const r = Math.pow(0.9, t / c.stability);
        const x = padL + px;
        const y = padT + plotH * (1 - r);
        if (px === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  /*
   * 成長度の推移: 日別の累積採点数を折れ線で。
   * series = [{date:'M/D', value:Number}]
   */
  function growthLine(canvas, series) {
    const { ctx, w, h } = setup(canvas);
    const padL = 30, padR = 12, padT = 12, padB = 24;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    ctx.font = FONT;

    if (!series.length) {
      ctx.fillStyle = TEXT; ctx.textAlign = 'center';
      ctx.fillText('まだ学習記録がありません', w / 2, h / 2);
      return;
    }
    const max = Math.max(1, ...series.map((s) => s.value));

    // 軸
    ctx.strokeStyle = AXIS; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, h - padB); ctx.lineTo(w - padR, h - padB);
    ctx.stroke();
    ctx.fillStyle = TEXT; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(String(max), padL - 4, padT);
    ctx.fillText('0', padL - 4, h - padB);

    // 塗り + 線
    const xAt = (i) => padL + (series.length === 1 ? plotW / 2 : plotW * (i / (series.length - 1)));
    const yAt = (v) => padT + plotH * (1 - v / max);

    ctx.beginPath();
    ctx.moveTo(xAt(0), h - padB);
    series.forEach((s, i) => ctx.lineTo(xAt(i), yAt(s.value)));
    ctx.lineTo(xAt(series.length - 1), h - padB);
    ctx.closePath();
    ctx.fillStyle = 'rgba(59,130,246,0.12)';
    ctx.fill();

    ctx.beginPath();
    series.forEach((s, i) => {
      const x = xAt(i), y = yAt(s.value);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2.5; ctx.stroke();

    series.forEach((s, i) => {
      ctx.beginPath();
      ctx.arc(xAt(i), yAt(s.value), 3, 0, Math.PI * 2);
      ctx.fillStyle = '#3b82f6'; ctx.fill();
    });

    // X ラベル(端と中央)
    ctx.fillStyle = TEXT; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const idxs = series.length <= 3 ? series.map((_, i) => i) : [0, Math.floor(series.length / 2), series.length - 1];
    idxs.forEach((i) => ctx.fillText(series[i].date, xAt(i), h - padB + 6));
  }

  /*
   * 科目別の習得度バー
   * items = [{label, value(0..1), count, color}]
   */
  function masteryBars(container, items) {
    container.innerHTML = '';
    items.forEach((it) => {
      const row = document.createElement('div');
      row.className = 'bar-row';
      const pct = Math.round(it.value * 100);
      row.innerHTML = `
        <div class="bar-label">${it.label}<span class="bar-count">${it.count}枚</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${it.color}"></div></div>
        <div class="bar-val">${pct}%</div>`;
      container.appendChild(row);
    });
    if (!items.length) {
      container.innerHTML = '<p class="muted">データがありません</p>';
    }
  }

  window.Charts = { forgettingCurve, growthLine, masteryBars };
})();
