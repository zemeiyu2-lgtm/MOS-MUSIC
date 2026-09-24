/* =========================================================
   MOS-MUSIC｜Phrase Card UI（乐句教学卡 · 前台共享组件 · V3.x）
   ---------------------------------------------------------
   数据来自 content/teaching/*.json（经 app/phrase-cards.js 门禁层）。
   只做「已确定数据的展示与连接」，不做第二套播放器 / 第二套教学系统：
     · 乐句条（按包内顺序）+ 当前乐句详情；
     · 「循环这一句」走现有 Player.setWindow（由页面回调执行），
       只有门禁 loopWindowFor() 放行才可用；否则如实显示不可用；
     · 钢琴辅助 / 视唱入口由宿主页面提供（复用现有钢琴轨与视唱模式）；
     · 教人提示只在教唱模式显示，逐字来自包内 teacher_script（缺了就没有）。

   前台语言：用户看到的是 乐句 → 听 → 学 → 唱 → 再唱 → 自己唱；
   时间状态等数据层细节翻译成普通用语（翻译来自 app/phrase-cards.js）。
========================================================= */

import { esc } from './util.js';
import * as pc from '../phrase-cards.js';

/** 秒 → "m:ss"（仅用于参考位置提示；不参与任何自动同步）。 */
function refClock(sec) {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec < 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 乐句条：按顺序的乐句按钮（当前高亮）。 */
export function stripHtml(cards, currentIdx) {
  if (!cards.length) return '';
  return `<div class="pcard-strip" role="tablist" aria-label="乐句教学卡">
    ${cards.map((c, i) => `<button class="pcard${i === currentIdx ? ' on' : ''}" role="tab"
      aria-selected="${i === currentIdx ? 'true' : 'false'}" data-pcard="${i}">
      <b>${esc(c.card_label)}</b><span>${esc(c.goal_note || '')}</span></button>`).join('')}
  </div>`;
}

/** 当前乐句详情（mode: song | learn | sight | teach）。 */
export function detailHtml(card, opts = {}) {
  if (!card) return '';
  const mode = opts.mode || 'song';
  const pack = opts.pack || null;
  const ts = pc.timeStateOf(card);
  const perf = pc.performerDisplay(card);
  const loopWin = pc.loopWindowFor(card, opts.activeRecordingId ?? null);
  const focus = pc.focusRowsOf(card);
  const goals = pc.goalLabels(card);
  const sightLink = `#/learn/${encodeURIComponent(opts.songId || '')}?mode=sight&card=${opts.cardIndex ?? 0}`;
  const refFrom = card.timecode ? refClock(card.timecode.start) : null;
  const refTo = card.timecode ? refClock(card.timecode.end) : null;

  return `<div class="pcard-detail" data-pcard-detail>
    <div class="pcard-head">
      <span class="pcard-label">${esc(card.card_label)}</span>
      <span class="pcard-goal">${esc(card.goal_note || goals.join(' · '))}</span>
      <span class="chip">${esc(ts.label)}</span>
    </div>
    <div class="pcard-rows">
      ${goals.length ? `<div class="pcard-row"><span class="k">教学目标</span><span>${esc(goals.join(' · '))}</span></div>` : ''}
      ${card.score_segment_ref ? `<div class="pcard-row"><span class="k">简谱位置</span><span>${esc(card.score_segment_ref)}</span></div>` : ''}
      ${card.lyric_segment_ref ? `<div class="pcard-row"><span class="k">歌词位置</span><span>${esc(card.lyric_segment_ref)}</span></div>` : ''}
      ${perf.confirmed
        ? `<div class="pcard-row"><span class="k">演唱</span><span>${esc(perf.name)}</span></div>`
        : `<div class="pcard-row"><span class="k">演唱</span><span class="muted">${esc(perf.placeholder)}</span></div>`}
      ${focus.map(([label, text]) => `<div class="pcard-row"><span class="k">${esc(label)}</span><span>${esc(text)}</span></div>`).join('')}
      ${card.piano_mode ? `<div class="pcard-row"><span class="k">钢琴辅助</span><span>${esc(card.piano_mode)}</span></div>` : ''}
    </div>
    <div class="btn-row pcard-actions">
      ${card.source_url ? `<a class="pill" href="${esc(card.source_url)}" target="_blank" rel="noopener">🎧 听一次（原站示范）</a>` : ''}
      <button class="pill" data-pcard-loop ${loopWin ? '' : 'disabled'}
        title="${loopWin ? '用现有播放器循环这一句' : '这一句的时间轴还没有核实，先人工跟唱'}">🔁 循环这一句</button>
      <button class="pill" data-pcard-piano>🎹 钢琴辅助</button>
      ${card.sight_singing ? `<a class="pill" href="${sightLink}">🎼 视唱这一句</a>` : ''}
    </div>
    ${!loopWin && refFrom && refTo
      ? `<p class="plain muted small" style="margin:0">参考位置约 ${esc(refFrom)} – ${esc(refTo)}（人工跟唱用）；单句循环要等这一句的时间轴核实后才可用。</p>`
      : ''}
    ${mode === 'teach' && pack && pack.teacher_script ? `
    <div class="pcard-teacher">
      <div class="pcard-teacher-title">教人提示</div>
      ${pack.teacher_script.core_principle ? `<p class="plain" style="margin:4px 0">${esc(pack.teacher_script.core_principle)}</p>` : ''}
      ${(pack.teacher_script.teacher_guidance || []).map((l) => `<p class="plain" style="margin:4px 0">${esc(l)}</p>`).join('')}
      ${pack.teach_others_task ? `<p class="plain" style="margin:4px 0"><b>教人任务：</b>${esc(pack.teach_others_task)}</p>` : ''}
      <p class="plain muted small" style="margin:4px 0 0">教唱循环：先让对方听 → 只给起音 → 不连续代唱 → 指出一个音乐问题 → 再让对方唱一次。</p>
    </div>` : ''}
    ${mode === 'learn' && pack && pack.practice_path ? `
    <p class="plain muted small" style="margin:0">练习路径：${esc(Object.entries(pack.practice_path).map(([d, t]) => `${d} ${t}`).join('；'))}。</p>` : ''}
    ${pack ? `<p class="plain muted small" style="margin:6px 0 0">教练可练：${pc.coachScopeOf(pack).join(' · ') || '暂无'}。只练音乐，不做音乐之外的评判。</p>` : ''}
  </div>`;
}

/**
 * 渲染 + 接线一个完整的乐句卡区（条 + 详情 + 上一句/下一句）。
 * @param {HTMLElement} container 详情渲染目标（内部会重绘）
 * @param {object} opts {
 *   cards, pack, mode, songId, activeRecordingId,
 *   onLoop(card), onPiano(card), onChanged(idx)
 * }
 * @returns {{get index, set index(i), card}} 控制器
 */
export function mountPhraseCards(container, opts) {
  const cards = opts.cards || [];
  const mode = opts.mode || 'song';
  let index = Math.min(Math.max(0, Number(opts.initialIndex) || 0), Math.max(0, cards.length - 1));

  function paint() {
    const card = cards[index] || null;
    container.innerHTML = `
      ${stripHtml(cards, index)}
      ${cards.length > 1 ? `<div class="btn-row" style="margin:8px 0 4px">
        <button class="pill" data-pcard-prev ${index === 0 ? 'disabled' : ''}>← 上一乐句</button>
        <button class="pill" data-pcard-next ${index === cards.length - 1 ? 'disabled' : ''}>下一乐句 →</button>
      </div>` : ''}
      ${detailHtml(card, { ...opts, cardIndex: index })}`;
    const prev = container.querySelector('[data-pcard-prev]');
    const next = container.querySelector('[data-pcard-next]');
    if (prev) prev.addEventListener('click', () => goto(index - 1));
    if (next) next.addEventListener('click', () => goto(index + 1));
    container.querySelectorAll('[data-pcard]').forEach((b) => {
      b.addEventListener('click', () => goto(Number(b.dataset.pcard)));
    });
    const loopBtn = container.querySelector('[data-pcard-loop]');
    if (loopBtn) loopBtn.addEventListener('click', () => {
      const c = cards[index];
      if (c && typeof opts.onLoop === 'function') opts.onLoop(c);
    });
    const pianoBtn = container.querySelector('[data-pcard-piano]');
    if (pianoBtn) pianoBtn.addEventListener('click', () => {
      const c = cards[index];
      if (c && typeof opts.onPiano === 'function') opts.onPiano(c);
    });
  }

  function goto(i) {
    if (i < 0 || i >= cards.length) return;
    index = i;
    paint();
    if (typeof opts.onChanged === 'function') opts.onChanged(index, cards[index]);
  }

  paint();
  return {
    get index() { return index; },
    set index(i) { goto(i); },
    get card() { return cards[index] || null; },
    repaint: paint,
  };
}

/** 某首歌是否拥有乐句卡（未接入 = 空数组，前台如实不渲染该区）。 */
export function emptyNote() {
  return '<div class="state-empty"><span class="glyph">🎵</span><div>这首歌还没有乐句教学卡。</div></div>';
}

export default { stripHtml, detailHtml, mountPhraseCards, emptyNote };
