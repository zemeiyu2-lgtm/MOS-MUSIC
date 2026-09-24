/* =========================================================
   MOS-MUSIC｜Score（数字简谱渲染 + 光标跟谱 · V3.0）
   ---------------------------------------------------------
   标准：docs/standards/MOS-SONG-TEACHING-METHOD-V1.0.md
     十三、光标跟随标准：音频时间轴 → 小节 → 音符 → 歌词。

   两个部分：
     A. 渲染（纯字符串生成）：把内容层的简谱结构化数据画成数字谱 ——
        调号 / 拍号 / 小节线 / 时值 / 高低音点 / 附点 / 延音 / 休止 /
        升降号 / 歌词对齐。简谱是主界面，不是附属 PDF。
     B. locate()（纯函数）：给出某个播放时刻的「当前句 / 当前小节 /
        当前音符 / 当前歌词」。它**只读取真实存在的时间标记**，
        没有标记就不返回该层级 —— 不插值、不猜测、不假装精确。

   铁律：乐谱尚未提供时，本模块不生成任何占位谱面（不得用示例谱冒充这首歌的谱）。
========================================================= */

import { esc, NOT_PROVIDED } from './util.js';

/* ---------------------------------------------------------------- A. 渲染 */

/** 乐谱是否可用（只有 PROVIDED 且有小节才渲染）。 */
export function scoreReady(score) {
  return Boolean(score && score.status === 'PROVIDED' && Array.isArray(score.sections) && score.sections.length > 0);
}

const OCTAVE_MAX = 2;

/** 单个音符的记号（数字 + 高低音点 + 时值 + 附点 + 升降号 + 休止）。 */
export function noteGlyph(beat) {
  const b = beat || {};
  if (b.rest) return { digit: '0', octave: 0, duration: b.duration || 'quarter', dot: Boolean(b.dot), accidental: null, tie: Boolean(b.tie) };
  return {
    digit: b.note == null ? '0' : String(b.note),
    octave: Number.isInteger(b.octave) ? Math.max(-OCTAVE_MAX, Math.min(OCTAVE_MAX, b.octave)) : 0,
    duration: b.duration || 'quarter',
    dot: Boolean(b.dot),
    accidental: b.accidental || null,
    tie: Boolean(b.tie),
  };
}

/** 时值 → 下划线层数（八分 1 条、十六分 2 条）。 */
export function underlineCount(duration) {
  if (duration === 'eighth') return 1;
  if (duration === 'sixteenth') return 2;
  return 0;
}

/** 时值 → 延音横线个数（二分 1 条、全音符 2 条）。 */
export function dashCount(duration) {
  if (duration === 'half') return 1;
  if (duration === 'whole') return 2;
  return 0;
}

const ACC = { sharp: '♯', flat: '♭', natural: '♮', null: '', undefined: '' };

function noteHtml(beat, attrs) {
  const g = noteGlyph(beat);
  const under = underlineCount(g.duration);
  const dash = dashCount(g.duration);
  const dots = g.octave === 0 ? '' : Array.from({ length: Math.abs(g.octave) }, () =>
    `<i class="oct-dot"></i>`).join('');
  const dotsHtml = g.octave === 0 ? ''
    : (g.octave > 0 ? `<span class="oct up" aria-hidden="true">${dots}</span>` : `<span class="oct down" aria-hidden="true">${dots}</span>`);
  const underHtml = under ? `<span class="under u${under}" aria-hidden="true"></span>` : '';
  return `<span class="note${g.rest ? ' rest' : ''}${under ? ' u' + under : ''}" ${attrs}>
    ${dotsHtml}<span class="digit">${esc(ACC[g.accidental] + g.digit)}</span>${g.dot ? '<span class="dot" aria-hidden="true">·</span>' : ''}${g.tie ? '<span class="tie" aria-hidden="true">⌒</span>' : ''}${underHtml}
  </span>${dash ? Array.from({ length: dash }, () => '<span class="dash" aria-hidden="true">—</span>').join('') : ''}`;
}

function beatsOf(section, measureNo) {
  for (const sec of (section.sections || [])) {
    for (const m of (sec.measures || [])) if (m.measure_no === measureNo) return m.beats || [];
  }
  return [];
}

/** 歌词索引：line_id → 字符数组（用于把小节里的音符与歌词逐字对齐）。 */
export function lyricCharIndex(lyrics) {
  const map = new Map();
  if (!lyrics || !Array.isArray(lyrics.sections)) return map;
  for (const sec of lyrics.sections) {
    for (const line of (sec.lines || [])) {
      map.set(line.line_id, Array.from(String(line.text || '')));
    }
  }
  return map;
}

/**
 * 渲染整段简谱。
 * @param {object} score 单元记录里的 score 段（须为 PROVIDED）
 * @param {object} opts  { locate?: object, lyrics?: object, interactive?: boolean }
 */
export function renderScoreHtml(score, opts = {}) {
  const loc = opts.locate || null;
  const chars = lyricCharIndex(opts.lyrics);
  const head = [
    score.key ? `<span class="sc-key">${esc(score.key)}</span>` : '',
    score.time_signature ? `<span class="sc-ts">${esc(score.time_signature)}</span>` : '',
    Number.isInteger(score.tempo_bpm) ? `<span class="sc-tempo">♩＝${esc(String(score.tempo_bpm))}</span>` : '',
  ].filter(Boolean).join('');
  const special = (score.special_marks || []).length
    ? `<div class="sc-marks">${score.special_marks.map((m) => `<span class="chip">${esc(m)}</span>`).join('')}</div>` : '';

  const body = (score.sections || []).map((sec) => `
    <div class="sc-section" data-section="${esc(sec.section_id)}">
      ${sec.label ? `<div class="sc-section-label">${esc(sec.label)}</div>` : ''}
      <div class="sc-measures">
        ${(sec.measures || []).map((m) => {
          const beats = m.beats || [];
          const isBar = Boolean(loc && loc.measure_basis && loc.measure_no === m.measure_no);
          const notes = beats.map((b, i) => {
            const isNow = isBar && loc.note_index === i;
            return noteHtml(b, `data-note="${i}"${isNow ? ' data-now="1"' : isBar ? ' data-bar="1"' : ''}`);
          }).join('');
          const hasLyric = beats.some((b) => b.lyric_line_id != null && b.lyric_char_index != null);
          const lyricRow = hasLyric
            ? `<div class="sc-lyric">${beats.map((b) => {
              const arr = b.lyric_line_id != null ? chars.get(b.lyric_line_id) : null;
              const ch = arr && b.lyric_char_index != null ? (arr[b.lyric_char_index] || '') : '';
              return `<span class="sc-lyric-cell">${esc(ch)}</span>`;
            }).join('')}</div>` : '';
          return `<span class="measure${isBar ? ' now' : ''}"
            data-measure="${m.measure_no}">
            <span class="beats">${notes}</span>${lyricRow}
            ${m.repeat ? `<span class="rep">${esc(m.repeat)}</span>` : ''}
          </span>`;
        }).join('')}
      </div>
    </div>`).join('');

  return `<div class="score" role="group" aria-label="简谱">
    ${head ? `<div class="sc-head">${head}</div>` : ''}
    ${body}
    ${special}
  </div>`;
}

/** 乐谱未提供时的如实说明（不画占位谱）。 */
export function renderScoreAbsentHtml(reason) {
  return `<div class="state-empty score-absent"><span class="glyph">🎼</span>
    <div>简谱${NOT_PROVIDED}</div>
    <div class="small">${esc(reason || '统一简谱制作完成后，这里会显示数字谱，并在播放时按小节与歌词跟随移动。')}</div>
  </div>`;
}

/* ---------------------------------------------------------------- B. 光标定位 */

/**
 * 时间标记（marks）→ 真实可用的跟随层级。
 * 只有真实存在的时间标记才会被列为可用层级。
 * @returns {string[]} 形如 ['phrase','measure','note']
 */
export function supportedLevels(timeline) {
  const levels = [];
  if (!timeline || timeline.status !== 'PROVIDED' || !(timeline.phrases || []).length) return levels;
  levels.push('phrase');
  const marks = [];
  for (const p of timeline.phrases) for (const m of (p.marks || [])) if (m && m.kind) marks.push(m.kind);
  for (const [kind, level] of [['measure', 'measure'], ['beat', 'beat'], ['note', 'note']]) {
    if (marks.includes(kind) && !levels.includes(level)) levels.push(level);
  }
  return levels;
}

function pickMark(phrase, kind, t) {
  const hits = (phrase.marks || []).filter((m) => m && m.kind === kind
    && typeof m.start === 'number' && typeof m.end === 'number');
  for (const m of hits) if (t >= m.start && t < m.end) return m;
  return null;
}

/**
 * 纯函数：某播放时刻的跟谱位置。
 * @param {{timeline:object, cursor:object}} unit
 * @param {number} t 播放秒数
 * @returns {{
 *   status:'no_timeline'|'before'|'playing'|'after',
 *   supported:string[], phrase_index:number|null, phrase_id:string|null,
 *   line_id:string|null, measure_no:number|null, measure_basis:null|'mark'|'phrase_range',
 *   note_index:number|null, progress:number
 * }}
 */
export function locate(unit, t) {
  const timeline = (unit && unit.timeline) || null;
  const levels = supportedLevels(timeline);
  const base = {
    status: 'no_timeline', supported: levels, phrase_index: null, phrase_id: null,
    line_id: null, measure_no: null, measure_basis: null, note_index: null, progress: 0,
  };
  if (!levels.length) return base;

  const phrases = timeline.phrases;
  const time = Number(t) || 0;
  let idx = phrases.findIndex((p) => time >= p.start && time < p.end);
  let status = 'playing';
  if (idx < 0) {
    if (time < phrases[0].start) { idx = 0; status = 'before'; } else { idx = phrases.length - 1; status = 'after'; }
  }
  const p = phrases[idx];
  const span = Math.max(0.001, p.end - p.start);
  const progress = Math.max(0, Math.min(1, (time - p.start) / span));
  const out = {
    ...base,
    status,
    phrase_index: idx,
    phrase_id: p.phrase_id || null,
    line_id: p.line_id || null,
    progress,
  };

  /* 当前小节：优先取真实的 measure 标记；没有标记时退回该句的小节范围（不插值到具体小节）。 */
  const mMark = pickMark(p, 'measure', time);
  if (mMark && mMark.no != null) {
    out.measure_no = mMark.no;
    out.measure_basis = 'mark';
  } else if (p.measure_start != null && p.measure_end != null) {
    out.measure_basis = 'phrase_range';
  }

  /* 当前音符：只有真实音符时间标记才给出，绝不按比例猜。 */
  const nMark = pickMark(p, 'note', time);
  if (nMark && nMark.index != null) out.note_index = nMark.index;

  return out;
}

/** 把跟谱结果转成渲染层的标记（供 renderScoreHtml 使用）。 */
export function locateMarks(located) {
  if (!located || !located.measure_no || located.measure_basis !== 'mark') {
    return { measure_no: null, measure_basis: null, note_index: null };
  }
  return { measure_no: located.measure_no, measure_basis: located.measure_basis, note_index: located.note_index };
}

/** 当前应高亮的歌词行（用于歌词区联动；无时间轴时为 null）。 */
export function currentLine(located) {
  return located && located.line_id ? located.line_id : null;
}

/**
 * 把跟谱结果画到已渲染的简谱上（只动 class / 属性，不重排 DOM）。
 * 只有 measure_basis === 'mark'（真实小节时间标记）才高亮小节 —— 不猜。
 * @param {HTMLElement} container 承载 renderScoreHtml 结果的元素
 * @param {object} located locate() 的返回值
 */
export function paintCursor(container, located) {
  if (!container) return;
  container.querySelectorAll('.measure.now').forEach((m) => m.classList.remove('now'));
  container.querySelectorAll('[data-now]').forEach((n) => n.removeAttribute('data-now'));
  container.querySelectorAll('[data-bar]').forEach((n) => n.removeAttribute('data-bar'));
  if (!located || located.measure_basis !== 'mark' || located.measure_no == null) return;
  const m = container.querySelector(`.measure[data-measure="${located.measure_no}"]`);
  if (!m) return;
  m.classList.add('now');
  m.querySelectorAll('.note').forEach((n) => n.setAttribute('data-bar', '1'));
  if (located.note_index != null) {
    const n = m.querySelector(`.note[data-note="${located.note_index}"]`);
    if (n) { n.removeAttribute('data-bar'); n.setAttribute('data-now', '1'); }
  }
}

/**
 * 单调性检查（工具与校验器共用）：一句之内的时间标记必须递增且落在句子范围内。
 * @returns {Array<{phrase_id:string, problem:string}>}
 */
export function timelineProblems(timeline) {
  const out = [];
  if (!timeline || !Array.isArray(timeline.phrases)) return out;
  let lastEnd = -1;
  for (const p of timeline.phrases) {
    if (typeof p.start !== 'number' || typeof p.end !== 'number') {
      out.push({ phrase_id: p.phrase_id || '?', problem: '缺少 start / end' });
      continue;
    }
    if (p.end <= p.start) out.push({ phrase_id: p.phrase_id || '?', problem: 'end 不大于 start' });
    if (p.start < lastEnd) out.push({ phrase_id: p.phrase_id || '?', problem: '与上一句时间重叠或倒序' });
    lastEnd = Math.max(lastEnd, p.end);
    let prev = -1;
    for (const m of (p.marks || [])) {
      if (typeof m.start !== 'number' || typeof m.end !== 'number') {
        out.push({ phrase_id: p.phrase_id || '?', problem: '标记缺少 start / end' });
        continue;
      }
      if (m.start < p.start - 0.001 || m.end > p.end + 0.001) {
        out.push({ phrase_id: p.phrase_id || '?', problem: '标记超出所在句的时间范围' });
      }
      if (m.start < prev) out.push({ phrase_id: p.phrase_id || '?', problem: '标记时间倒序' });
      prev = Math.max(prev, m.end);
    }
  }
  return out;
}

export default {
  scoreReady, noteGlyph, underlineCount, dashCount, renderScoreHtml, renderScoreAbsentHtml,
  lyricCharIndex, supportedLevels, locate, locateMarks, currentLine, paintCursor, timelineProblems, beatsOf,
};
