/* =========================================================
   MOS-MUSIC｜Front Song Page（歌曲页 · 一页解决 · V3.0）
   ---------------------------------------------------------
   标准：
     docs/standards/MOS-SONG-TEACHING-METHOD-V1.0.md
     docs/standards/MOS-SONG-PRODUCTION-TEMPLATE-V1.0.md

   V3.0 的排序原则（与用户要求一致）：
     · **乐谱最明显**：简谱紧跟 Hero，是全页第二段、整幅呈现，不是附属 PDF；
     · **进度光标跟随**：有时间标记时按小节 / 音符跟随；没有就如实说明，不猜；
     · **淡化周次绑定**：内容理解与生命实践来自歌曲单元自身，不写「第几周 / 第几课」；
     · **只要钢琴伴奏**：伴奏轨只有钢琴；没有就显示「尚未提供」；
     · **含内容与步骤**：十步教学法 + 三模式（学唱 / 视唱 / 教唱）+ 四级学习状态。

   段落（固定顺序）：
     01 Hero｜02 简谱（最显眼）｜03 播放区｜04 陪我唱（三模式）
     05 歌词｜06 唱（速度 / 循环 / 单句循环 / 节拍器）
     07 懂 · 活｜08 制作到什么程度（18 段 / 等级 / 缺口）
     09 我的学习状态（四级 + 间隔复习）｜10 教 · 传 · 链接

   铁律：无资源一律「尚未提供」；不显示工程术语与分数；不假装播放；
   「唱过」打点只发生在真实播放动作上。
========================================================= */

import {
  esc, NOT_PROVIDED, loadSongContext, layerLabel, lyricsFromSlots, loadThemes,
  loadUnitVocab, loadUnit, unitSources, levelFrontLabel, levelNote,
  requirementLabel, presenceText, taxonomyFor, loadSongContent, loadSongContentVocab,
} from './util.js';
import { getIndex } from '../content-source.js';
import { createPlayer, sourcesFromSlots, mergeSources, SPEEDS, speedLabel, trackHtml, bindTrack, formatTime } from './player.js';
import { scoreReady, renderScoreHtml, renderScoreAbsentHtml, locate, paintCursor, supportedLevels } from './score.js';
import { createMetronome, TEMPO_PRESETS, DEFAULT_BPM, BPM_MIN, BPM_MAX, clampBpm, beatsPerBar } from './pulse.js';
import { STAGE_ORDER, stageOf, dueState } from './review.js';
import * as songUnit from '../song-unit.js';
import * as pcards from '../phrase-cards.js';
import { mountPhraseCards } from './phrase-card.js';
import { coverFor, langIndexOf } from './covers.js';
import * as mySongs from './my-songs.js';

const LEVEL_CLASS = { NONE: '', L1: 'lv1', L2: 'lv2', L3: 'lv3', L4: 'lv4' };

function toast(root, text, ok) {
  const old = root.querySelector('.toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'toast ' + (ok === false ? 'err' : 'ok');
  t.setAttribute('role', 'status');
  t.textContent = text;
  root.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/** 单元歌词（PROVIDED 且结构化）→ 可渲染的分节；否则 null。 */
function unitLyrics(unit) {
  const ly = unit && unit.lyrics;
  if (!ly || ly.status !== 'PROVIDED' || !Array.isArray(ly.sections) || !ly.sections.length) return null;
  return { language: ly.language || null, sections: ly.sections };
}

/** 单元歌词 → 与播放器无关的纯文本行（供舞台大字使用）。 */
function unitLines(unit) {
  const ly = unitLyrics(unit);
  if (!ly) return [];
  const out = [];
  for (const sec of ly.sections) for (const line of sec.lines || []) out.push({ line_id: line.line_id, text: line.text });
  return out;
}

function chineseLyricLines(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const text = typeof row === 'string' ? row : row && row.text;
    if (!text) return false;
    return (String(text).match(/[\u3400-\u9fff]/g) || []).length >= 2;
  });
}

export async function renderSongPage(root, songId, query) {
  const ctx = await loadSongContext(songId);
  if (!ctx.row && !ctx.reg && !ctx.detail) {
    root.innerHTML = `<div class="state-error"><span class="glyph">🎵</span><div>没有找到歌曲 ${esc(songId)}。</div>
      <a class="btn secondary" href="#/songs">← 返回诗歌本</a></div>`;
    return;
  }
  const [my, themes, vocab, unit, resourcesIdx, phraseDoc] = await Promise.all([
    mySongs.get(ctx.songId),
    loadThemes(),
    loadUnitVocab(),
    loadUnit(ctx.songId),
    getIndex('song_resources').catch(() => null),
    pcards.loadTeachingPack(ctx.songId).catch(() => null),
  ]);
  const pCards = pcards.cardsOf(phraseDoc);

  const row = ctx.row || {};
  const zh = row.zh || (ctx.detail && ctx.detail.title) || ctx.songId;
  const en = row.en || null;
  const heroLang = langIndexOf(row.theme, themes);
  const summary = unit ? songUnit.unitSummary(unit) : null;
  const frontLevel = summary ? levelFrontLabel(vocab, summary.level) : '资源待制作';
  const flagged = unit ? songUnit.unitFlags(unit) : null;

  /* 播放源：单元层（男 / 女 / 钢琴）优先，槽位作为向后兼容。 */
  const slots = ctx.slots;
  const unitSrc = unitSources(unit, resourcesIdx);
  const sources = mergeSources(sourcesFromSlots(slots), unitSrc);
  const trackKinds = [
    ['male', '🎧 男声示唱'],
    ['female', '🎧 女声示唱'],
    ['piano', '🎹 钢琴伴奏'],
    ['demo', '🎧 示范'],
    ['accomp', '🎹 陪唱'],
  ].filter(([k]) => sources[k]);

  const scoreOk = unit ? scoreReady(unit.score) : false;
  /* 原谱导入简谱（SOURCE_IMPORTED）：单元层已 PROVIDED 可预览，但人工听校 PENDING —— 徽章如实显示，不计入完成等级。
     判定只能来自单元记录的 note（schema 冻结，additionalProperties=false），格式由 tools/song-units.js 保证。 */
  const importPending = Boolean(unit && unit.score && unit.score.note
    && unit.score.note.includes('SOURCE_IMPORTED') && unit.score.note.includes('PENDING'));
  /* 工作包级草稿 / 原谱导入（单元层还未 PROVIDED 时的预览通道） */
  const draftScore = (unit && unit.package && unit.package.score) ? unit.package.score : null;
  const tlLevels = unit ? supportedLevels(unit.timeline) : [];
  const phrases = (unit && unit.timeline && Array.isArray(unit.timeline.phrases)) ? unit.timeline.phrases : [];
  const lines = unit ? unitLines(unit) : [];
  const slotLyrics = lyricsFromSlots(slots);
  const rawLyrics = lines.length ? lines.map((l) => l.text) : (slotLyrics ? slotLyrics.sections.flat() : []);
  const showLyrics = chineseLyricLines(rawLyrics);
  const shareUrl = `${location.origin}${location.pathname}#/song/${encodeURIComponent(ctx.songId)}`;

  const player = createPlayer();
  player.setSource(sources);
  const metro = createMetronome();
  const bpb = beatsPerBar(unit && unit.score && unit.score.time_signature);

  /* -------- 07 懂 / 活（歌曲自身内容层，不绑定周次） -------- */
  const cu = (unit && unit.content_understanding) || {};
  const txt = (t) => (t && t.text ? esc(t.text) : null);
  const bibleRows = (cu.bible_basis || []).filter((b) => b && b.reference);
  const life = (unit && unit.life_practice) || {};
  const lifeItems = (life.items || []).filter((i) => i && i.text);

  /* -------- V3.x 四维分类（帮人找到这首歌，不是它的身份） -------- */
  const tax = await taxonomyFor(ctx.songId).catch(() => null);
  const taxDims = (tax && tax.dims) || [];

  /* -------- V3.x 歌曲内容层（歌曲自己的六项；不绑定周次 / 课程） -------- */
  const scVocab = await loadSongContentVocab().catch(() => null);
  const songContent = await loadSongContent(ctx.songId).catch(() => null);
  const SC_KEYS = (scVocab && scVocab.field_keys) || [];
  const SC_LABELS = (scVocab && scVocab.field_labels) || {};
  const scValue = (key) => {
    const f = songContent && songContent[key];
    if (!f) return null;
    if (Array.isArray(f.items) && f.items.length) return f.items.map((i) => i.text).join('；');
    if (key === 'scripture' && f.reference) return f.reference;
    return f.text || null;
  };
  const scRows = SC_KEYS.map((key) => ({
    key,
    label: SC_LABELS[key] || key,
    value: scValue(key),
    note: (songContent && songContent[key] && songContent[key].note) || null,
    status: (songContent && songContent[key] && songContent[key].status) || 'NOT_AVAILABLE',
  }));

  /* -------- V3.x 示唱：真人（男/女）+ AI（必须标注非真人） -------- */
  const demos = (unit && unit.demos) || {};
  const demoRows = [
    { key: 'male', label: '男声示唱', kind: 'human', track: demos.male },
    { key: 'female', label: '女声示唱', kind: 'human', track: demos.female },
    { key: 'ai_male', label: 'AI 示唱 · 男声（非真人）', kind: 'ai', track: demos.ai_male },
    { key: 'ai_female', label: 'AI 示唱 · 女声（非真人）', kind: 'ai', track: demos.ai_female },
  ];
  const SRC_LABELS = {
    EXTERNAL_HUMAN_MALE: '外部真人版本（原站播放，不转存）',
    EXTERNAL_HUMAN_FEMALE: '外部真人版本（原站播放，不转存）',
    MOS_HUMAN_MALE: 'MOS 真人录制',
    MOS_HUMAN_FEMALE: 'MOS 真人录制',
  };

  /* -------- 08 制作进度（18 段 / 等级 / 缺口） -------- */
  const sectionRows = ((vocab && vocab.sections) || []).map((s) => {
    const f = flagged || {};
    const map = {
      lyrics: f.lyrics, score: f.score, demo_male: f.demo_male, demo_female: f.demo_female,
      piano: f.piano, timeline: f.timeline, cursor: f.cursor, teach_learn: f.teach_learn,
      teach_score: f.teach_score, teach_lyrics: f.teach_lyrics, teach_vocal: f.teach_vocal,
      teach_live: f.teach_live,
    };
    const ok = Object.prototype.hasOwnProperty.call(map, s.key) ? Boolean(map[s.key]) : null;
    return { ...s, ok };
  });
  const missingRows = summary ? summary.missing_all : [];

  /* -------- 09 我的学习状态 -------- */
  const myStage = stageOf(await mySongs.reviewRecord(ctx.songId));
  const stageText = {};
  for (const s of (vocab && vocab.learner_stages) || []) stageText[s.key] = s.label;
  const cycle = (vocab && vocab.review_cycle) || [];
  const due = dueState(await mySongs.reviewRecord(ctx.songId), null, cycle);

  root.innerHTML = `
    <div class="songpage">
      <div class="sp-main">
        <a class="btn ghost backline" href="#/songs">← 生命诗歌本</a>

        <!-- 01 Hero -->
        <section class="card sp-hero sp-sec">
          <div class="eyebrow">诗歌本</div>
          <div class="hero-id" style="margin-top:var(--sp-3)">
            <span class="cover cover-hero float">${coverFor({ song_id: ctx.songId, lang: heroLang })}</span>
            <div class="hero-id-info">
              <h1 class="hero-title" style="font-size:var(--fs-display)">${esc(zh)}</h1>
              ${en ? `<div class="hero-en">${esc(en)}</div>` : ''}
              <div class="sp-badges">
                <span class="chip lv ${LEVEL_CLASS[summary ? summary.level : 'NONE']}">${esc(frontLevel)}</span>
                ${row.theme ? `<span class="chip gold">${esc(row.theme)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="hero-actions">
            <button class="btn primary big play-fab-btn" id="heroPlay" aria-label="现在就唱${esc(zh)}">▶ 现在就唱</button>
            <button class="btn ghost big" id="likeBtn" aria-pressed="${my.liked ? 'true' : 'false'}">${my.liked ? '❤️ 已收藏' : '♡ 收藏'}</button>
            <button class="btn ghost big" id="shareTop" aria-label="分享这首歌">↗ 分享</button>
          </div>
          ${query && query.share ? '<div class="notice" style="margin-top:var(--sp-3)">朋友分享给你这首歌 —— 点「现在就唱」直接开始。</div>' : ''}
        </section>

        <!-- 02 简谱（乐谱最明显） -->
        <section class="card sp-sec sp-score-card" id="secScore">
          <div class="sp-score-head">
            <h2><span class="sp-num">02</span>简谱</h2>
            <div class="sp-score-tools">
              <span class="chip">${scoreOk ? (importPending ? '原谱简谱 · 待人工听校' : '统一简谱') : draftScore ? '原谱简谱 · 待人工听校' : NOT_PROVIDED}</span>
              ${scoreOk && tlLevels.length ? `<button class="pill" id="cursorBtn" aria-pressed="true">◎ 光标跟随开</button>` : ''}
            </div>
          </div>
          <div class="score-wrap" id="scoreWrap">
            ${scoreOk
              ? renderScoreHtml(unit.score, { lyrics: unitLyrics(unit) })
              : draftScore
                ? renderScoreHtml(draftScore, { lyrics: unitLyrics(unit) })
                : renderScoreAbsentHtml(unit && unit.score && unit.score.note)}
          </div>
          ${(importPending || (draftScore && !scoreOk)) ? `<div class="notice">以下是<strong>原谱导入简谱</strong>（忠实转自原谱，人工听校尚未通过）—— 它不计入完成等级；听校通过后成为定稿简谱。简谱必须明显，所以这里整幅显示，但绝不冒充定稿。</div>` : ''}
          ${(unit && unit.rights && unit.rights.copyright_status === 'unknown') ? '<div class="notice">这首歌的<strong>版权状态还在人工确认中</strong>：确认完成并取得授权之前，歌词 / 简谱 / 音频都暂不提供 —— 平台不靠猜。</div>' : ''}
          ${scoreOk && tlLevels.length ? `
          <div class="cursor-bar" id="cursorBar" aria-live="polite">
            <span class="cursor-pos" id="cursorPos">等待播放</span>
            <span class="cursor-note">光标只按真实时间标记移动；没有标记的层级不会显示。</span>
          </div>` : ''}
          ${scoreOk && phrases.length ? `
          <div class="phrase-loop" id="phraseLoop">
            <span class="phrase-loop-label">单句循环：</span>
            ${phrases.map((p, i) => `<button class="pill" data-phrase-window="${i}">第 ${i + 1} 句</button>`).join('')}
            <button class="pill" id="clearWindow">取消</button>
          </div>` : ''}
          ${!scoreOk && !draftScore ? `<div class="notice">简谱是主界面。统一记谱完成后，这里会整幅显示数字谱，并在播放时按小节与歌词跟随移动 —— 现在不画占位谱冒充它。</div>` : ''}
        </section>

        <!-- 03 播放区 -->
        <section class="card sp-sec" id="secSing">
          <h2><span class="sp-num">03</span>播放区</h2>
          <div class="player">
            <div class="player-row">
              <button class="play-fab" id="btnToggle" aria-label="播放或暂停" ${trackKinds.length ? '' : 'disabled'}>▶</button>
              <div class="player-main">
                <span class="player-state" id="playState">未播放</span>
                <span class="wave" id="playWave" aria-hidden="true"><i></i><i></i><i></i></span>
                <span class="player-time" id="playTime">0:00 / 0:00</span>
              </div>
            </div>
            ${trackHtml()}
            <div class="player-row">
              ${trackKinds.map(([k, label]) => `<button class="pill kind${k === 'piano' || k === 'accomp' ? ' piano' : ''}" data-kind="${k}">${esc(label)}</button>`).join('')}
              <button class="pill" id="btnLoop" aria-pressed="false">🔁 循环关</button>
              ${SPEEDS.map((s) => `<button class="pill spd${s === 1.0 ? ' on' : ''}" data-speed="${s}">${speedLabel(s)}</button>`).join('')}
            </div>
          </div>
          <div class="track-note" style="display:grid;gap:8px;margin-top:var(--sp-2)">
            <div class="resource-slot ${unitSrc.male ? 'available' : ''}"><span>♪ 男声示唱</span><span>${presenceText(unitSrc.male ? 'PROVIDED' : 'NOT_PROVIDED')}</span></div>
            <div class="resource-slot ${unitSrc.female ? 'available' : ''}"><span>♪ 女声示唱</span><span>${presenceText(unitSrc.female ? 'PROVIDED' : 'NOT_PROVIDED')}</span></div>
            <div class="resource-slot ${unitSrc.piano ? 'available' : ''}"><span>♪ 钢琴伴奏</span><span>${presenceText(unitSrc.piano ? 'PROVIDED' : 'NOT_PROVIDED')}</span></div>
          </div>
          ${!trackKinds.length ? `<div class="notice">音频${NOT_PROVIDED}。第一阶段伴奏统一只做钢琴。资源导入后这里可以直接播放、变速、循环 —— 现在不假装播放。</div>` : ''}
          <p class="plain muted small" style="margin-bottom:0">伴奏只提供钢琴 —— 这是自主歌唱的主要支持轨，不做多种器乐编曲。</p>
        </section>

        <!-- 04 学 / 看谱唱 / 教别人：歌曲内部动作 -->
        <section class="card sp-sec song-actions-panel">
          <div class="song-action-row">
            <a class="song-action primary" href="#/learn/${esc(ctx.songId)}"><span>🎤</span><strong>学唱</strong><small>一句一句学</small></a>
            <a class="song-action" href="#/learn/${esc(ctx.songId)}?mode=sight"><span>🎼</span><strong>看谱唱</strong><small>先看谱，再唱</small></a>
            <a class="song-action" href="#/teach/${esc(ctx.songId)}"><span>↗</span><strong>教别人</strong><small>带人唱这首歌</small></a>
          </div>
        </section>

                <!-- 乐句教学卡（有卡才显示；复用现有播放器与单句循环） -->
        ${pCards.length ? `
        <section class="card sp-sec" id="secPhrases">
          <div class="section-head"><h2>乐句教学卡</h2><span class="chip">${pCards.length} 句</span></div>
          <p class="plain muted">一句一句来：听 → 跟唱 → 自己唱。点一句，把它变成当前乐句。</p>
          <div id="phraseCardBox"></div>
        </section>` : ''}

        <!-- 05 歌词 -->
        <section class="card sp-sec" id="secLyrics">
          <h2><span class="sp-num">05</span>歌词</h2>
          ${showLyrics.length ? `
          <div class="lyrics lyrics-focus" id="lyricsBox">
            ${showLyrics.map((l, i) => `<p class="lyric-line" data-line="${i}" tabindex="0">${esc(l)}</p>`).join('')}
          </div>
          <p class="plain muted small">点击任何一句，把它设为当前句；逐句音频随资源导入逐步可用。</p>
          ${(unit && unit.lyrics && unit.lyrics.status === 'PROVIDED' && String(unit.lyrics.language || '').toLowerCase().startsWith('en')) ? '<div class="notice">当前托管的是<strong>英文公版原文</strong>；中文译本尚未提供（常见译本各有版权方，本仓不托管）。需要中文时由人工提供已获授权文本。</div>' : ''}` : `
          <div class="state-empty"><span class="glyph">✍️</span><div>简体中文歌词待提供</div><div class="small">英文原文不作为前台主歌词显示；核定的简体中文歌词进入后，这里会直接显示大字歌词。</div></div>`}
        </section>

        <!-- 06 唱 -->
        <section class="card sp-sec">
          <h2><span class="sp-num">06</span>唱</h2>
          <p class="plain muted">现在就唱这一段 —— 开循环、放慢速度，唱到顺为止。</p>
          <div class="btn-row">
            <button class="pill" id="singLoop" aria-pressed="false">🔁 循环</button>
            ${SPEEDS.map((s) => `<button class="pill spd2${s === 1.0 ? ' on' : ''}" data-speed2="${s}">${speedLabel(s)}</button>`).join('')}
          </div>

          <div class="metro" id="metroBox">
            <div class="metro-head">
              <span class="metro-title">节拍器</span>
              <span class="metro-note">身体先认识节拍：拍手 · 点拍 · 口读节奏 · 轻声数拍。</span>
            </div>
            <div class="metro-row">
              <button class="pill" id="metroToggle" aria-pressed="false">▶ 开始打拍</button>
              <input class="metro-range" id="metroBpm" type="range" min="${BPM_MIN}" max="${BPM_MAX}" value="${DEFAULT_BPM}" aria-label="速度（每分钟拍数）" ${metro.state().available ? '' : 'disabled'}>
              <span class="metro-val" id="metroVal">♩＝${DEFAULT_BPM}</span>
              ${TEMPO_PRESETS.map((p) => `<button class="pill" data-bpm="${p.bpm}">${esc(p.label)}</button>`).join('')}
            </div>
            <div class="beat-dots" id="beatDots" aria-hidden="true">${Array.from({ length: bpb }, () => '<i></i>').join('')}</div>
            ${metro.state().available ? '' : '<div class="notice">此环境没有音频输出，节拍器不可用 —— 界面如实说明，不放假声音。</div>'}
          </div>
        </section>
      </div>

      <div class="sp-side">
        <!-- 07 懂 · 活 -->
        <section class="card sp-sec">
          <h2><span class="sp-num">07</span>懂 · 活</h2>
          ${txt(cu.what_it_sings) ? `<p class="plain">${txt(cu.what_it_sings)}</p>`
            : txt(cu.core_truth) ? `<p class="plain">${txt(cu.core_truth)}</p>`
            : row.formation_theme || row.theme ? `<p class="plain">这首歌围绕「${esc(row.formation_theme || row.theme)}」。</p>`
            : `<p class="plain">这首歌的介绍文字尚未撰写。</p>`}
          ${bibleRows.length ? `<div class="bible-row">${bibleRows.map((b) => `<span class="chip gold">${esc(b.reference)}</span>`).join('')}</div>` : ''}
          <p class="plain muted small">这里只说明这首歌唱的是什么 —— <strong>不指定你必须在什么时候唱，也不绑定某一周 / 某一课</strong>。</p>
          ${lifeItems.length ? `<h3 class="sp-h3">今天怎样活</h3>
            <ul class="plain life-list">${lifeItems.map((i) => `<li>${esc(i.text)}</li>`).join('')}</ul>`
            : `<h3 class="sp-h3">今天怎样活</h3>
               <p class="plain muted small">唱完以后，从歌词里挑一句，今天照着做一次。更具体的生命回应会随单元内容提供。</p>`}
        </section>

        <!-- 分类（主题 / 处境 / 场景 / 音乐）：帮人找到歌，不是歌曲身份 -->
        <details class="card sp-sec song-more"><summary>分类</summary>
          
          <div class="cards">
            ${taxDims.map((d) => `
              <div class="entry"><span class="entry-main">
                <span class="entry-kicker">${esc(d.label)}</span>
                <span class="entry-title">${d.keys.length ? d.keys.map((k) => esc(k)).join(' · ') : `<span class="entry-note">${esc(d.empty_text)}</span>`}</span>
                <span class="entry-note">${esc(d.question)}</span>
              </span></div>`).join('')}
          </div>
          <div class="notice">分类只是帮你在需要的时候找到它，不是这首歌的身份；同一首歌可以同时属于多个分类。
          空着的维度是「尚未标注」—— 平台不猜、不补。</div>
        </details>

        <!-- 歌曲内容层（meaning / scripture / background / reflection / practice / prayer） -->
        <details class="card sp-sec song-more"><summary>这首歌的内容</summary>
          
          <div class="cards">
            ${scRows.map((r) => `
              <div class="entry"><span class="entry-main">
                <span class="entry-kicker">${esc(r.label)}</span>
                <span class="entry-title">${r.value ? esc(r.value) : `<span class="entry-note">${NOT_PROVIDED}</span>`}</span>
                ${r.value ? '' : `<span class="entry-note">${esc(r.note || '')}</span>`}
              </span></div>`).join('')}
          </div>
          <div class="notice">这些内容属于歌曲本身，不与任何一周、任何一课绑定 —— 课程可以引用它，它不依赖课程。</div>
        </details>

        <!-- 示唱（真人 / AI）：AI 必须在界面上标注「非真人」 -->
        <details class="card sp-sec song-more"><summary>示唱</summary>
          
          <div class="cards">
            ${demoRows.map((d) => {
              const st = d.track && d.track.status;
              const ok = st === 'PROVIDED' || (Array.isArray(d.track && d.track.slots) && d.track.slots.length > 0);
              const src = d.track && d.track.source_type;
              const slot = ((d.track && d.track.slots) || [])[0] || null;
              const seg = slot && slot.start != null && slot.end != null ? `分句片段 ${slot.start}s–${slot.end}s` : null;
              return `<div class="entry"><span class="entry-main">
                <span class="entry-kicker">${esc(d.label)}</span>
                <span class="entry-title">${ok ? (SRC_LABELS[src] ? esc(SRC_LABELS[src]) : '已提供') : NOT_PROVIDED}</span>
                <span class="entry-note">${ok
                  ? (seg || (src && String(src).startsWith('EXTERNAL_') ? '到原站播放（不下载转存）' : '可播放'))
                  : (d.kind === 'ai'
                    ? 'AI 示唱类型已就位，但本轮没有接入任何歌声引擎，因此不存在成品 —— 不是遗漏，也不拿合成声音冒充真人。'
                    : '真人示唱尚未录制。来源可以是外部优秀真人版本（原站播放 / 分段定位），不下载转存。')}</span>
              </span></div>`;
            }).join('')}
          </div>
          <div class="notice">真人版本优先复用现成的：外部版本以原站播放或时间段定位提供，不重新上传；AI 轨永远单独标注为「非真人」，且不计入完成等级。</div>
        </details>

        <!-- 08 制作到什么程度 -->
        <details class="card sp-sec song-more"><summary>歌曲准备度</summary>
          <div class="section-head">
            <span class="chip lv ${LEVEL_CLASS[summary ? summary.level : 'NONE']}">${esc(frontLevel)}</span></div>
          ${summary ? `<p class="plain muted small">${esc(levelNote(vocab, summary.level) || '')}</p>` : ''}
          <div class="sec-status">
            ${sectionRows.map((s) => `<span class="sec-item ${s.ok === null ? 'na' : s.ok ? 'ok' : 'no'}">
              <b>${esc(s.no)}</b>${esc(s.label)}${s.ok === null ? '' : `<i>${s.ok ? '✓' : '·'}</i>`}</span>`).join('')}
          </div>
          ${missingRows.length ? `<p class="plain muted small">还缺：${esc(missingRows.map((k) => requirementLabel(vocab, k)).join('、'))}。</p>`
            : `<p class="plain muted small">结构层面已齐备。</p>`}
          <p class="plain muted small">等级由实际资源推导，不是写上去的；缺什么就显示缺什么，绝不补满结构冒充完成。</p>
        </details>

        <!-- 09 我的学习状态 -->
        <details class="card sp-sec song-more" open><summary>我的学习</summary>
          
          <div class="stages" aria-label="学习路径状态">
            ${STAGE_ORDER.map((k) => `<span class="stage-chip ${myStage === k ? 'on' : ''}">${esc(stageText[k] || k)}</span>`).join('')}
          </div>
          <p class="plain muted small">四级是学习路径状态，不是分数、不是排行榜。系统不判通过 / 不通过，也不给徽章。</p>
          <div class="btn-row">
            ${STAGE_ORDER.map((k) => `<button class="pill" data-stage="${k}">我现在可以「${esc(stageText[k] || k)}」</button>`).join('')}
          </div>
          <div class="due-line">
            ${due.state === 'due' ? `🕘 该回来唱了（${esc(cycle.find((c) => c.key === due.due_key) ? cycle.find((c) => c.key === due.due_key).label : due.due_key)}）`
              : due.state === 'waiting' ? `下次再唱：${esc(String(due.next_due_at).slice(0, 10))}`
              : due.state === 'maintained' ? '已经按节奏唱过三轮 —— 之后随机再遇到就好。'
              : '还没有开始学这首歌。'}
          </div>
        </details>

        <!-- 10 教 · 传 · 链接 -->
        <details class="card sp-sec song-more"><summary>分享与更多</summary>
          
          <div class="sp-life-entry">
            <a class="life-card" href="#/teach/${esc(ctx.songId)}">🧑‍🏫 教别人唱<small>进入教唱模式</small></a>
            <button class="life-card" id="shareBtn" style="all:unset;cursor:pointer">↗ 分享这首歌<small>打开就能听、能学</small></button>
            <a class="life-card" href="#/teach/${esc(ctx.songId)}?who=child">👶 我跟孩子唱<small>亲子轻入口</small></a>
            <a class="life-card" href="#/teach/${esc(ctx.songId)}?who=group">👥 我和团契一起唱<small>群体轻入口</small></a>
          </div>
          ${(unit && unit.transmission && unit.transmission.text) ? `<p class="plain muted small">传唱：${esc(unit.transmission.text)}</p>` : ''}
          <div class="btn-row">
            <button class="btn primary big" id="copyBtn">复制链接</button>
            <a class="btn ghost big" href="#/learn/${esc(ctx.songId)}">📚 学唱模式</a>
            <a class="btn ghost big" href="#/song-detail/${esc(ctx.songId)}">后台研究档案</a>
          </div>
          <div class="notice" id="shareStatus" hidden></div>
        </details>
      </div>
    </div>`;

  /* ---------------- 统一播放器接线（真实） ---------------- */
  const stateEl = root.querySelector('#playState');
  const waveEl = root.querySelector('#playWave');
  const timeEl = root.querySelector('#playTime');
  const toggleBtn = root.querySelector('#btnToggle');
  const loopBtn = root.querySelector('#btnLoop');
  const loopBtn2 = root.querySelector('#singLoop');
  const kindBtns = Array.from(root.querySelectorAll('[data-kind]'));
  let currentKind = trackKinds.length ? trackKinds[0][0] : null;
  let cursorOn = true;
  const scoreWrap = root.querySelector('#scoreWrap');
  const cursorOnBtn = root.querySelector('#cursorBtn');
  const cursorPos = root.querySelector('#cursorPos');

  function paint() {
    const st = player.state();
    const labelOf = { male: '男声示唱', female: '女声示唱', piano: '钢琴伴奏', demo: '示范', accomp: '陪唱' };
    stateEl.textContent = st.playing
      ? `${labelOf[st.kind] || '音频'}播放中`
      : (st.kind ? '已暂停' : '未播放');
    waveEl.classList.toggle('on', st.playing);
    toggleBtn.textContent = st.playing ? '⏸' : '▶';
    toggleBtn.classList.toggle('playing', st.playing);
    timeEl.textContent = `${formatTime(st.time)} / ${formatTime(st.duration)}`;
    const lp = st.loop ? '🔁 循环开' : '🔁 循环关';
    loopBtn.textContent = lp;
    loopBtn.setAttribute('aria-pressed', st.loop ? 'true' : 'false');
    if (loopBtn2) { loopBtn2.textContent = lp; loopBtn2.setAttribute('aria-pressed', st.loop ? 'true' : 'false'); loopBtn2.classList.toggle('on', st.loop); }
    kindBtns.forEach((b) => b.classList.toggle('on', b.dataset.kind === st.kind));
  }

  /** 光标跟随：把当前播放时刻画到简谱上（只在开启且有真实时间标记时）。 */
  function paintCursorAt(t) {
    if (!cursorOn || !unit || !tlLevels.length) return;
    const loc = locate(unit, t);
    paintCursor(scoreWrap, loc);
    if (cursorPos) {
      const bits = [];
      if (loc.phrase_index != null) bits.push(`第 ${loc.phrase_index + 1} 句`);
      if (loc.measure_no != null) bits.push(`第 ${loc.measure_no} 小节`);
      cursorPos.textContent = bits.length ? bits.join(' ｜ ') : (loc.status === 'before' ? '即将开始' : loc.status === 'after' ? '已结束' : '等待播放');
    }
    if (loc.line_id) {
      root.querySelectorAll('.lyric-line').forEach((el, i) => el.classList.toggle('current', String(i) === String(loc.line_id) || el.dataset.line === String(loc.line_id)));
    }
  }

  player.mount(stateEl);
  stateEl.addEventListener('player:change', () => { paint(); const st = player.state(); paintCursorAt(st.time); });
  bindTrack(root, player);
  paint();
  paintCursorAt(0);

  async function playKind(kind) {
    if (!sources[kind]) return;
    currentKind = kind;
    await player.play(kind);
    await mySongs.markSung(ctx.songId).catch(() => {});
  }
  toggleBtn.addEventListener('click', async () => {
    if (!currentKind) return;
    if (player.state().playing) { player.toggle(); return; }
    await playKind(currentKind);
  });
  kindBtns.forEach((b) => b.addEventListener('click', () => playKind(b.dataset.kind)));
  loopBtn.addEventListener('click', () => player.toggleLoop());
  if (loopBtn2) loopBtn2.addEventListener('click', () => player.toggleLoop());
  root.querySelectorAll('[data-speed]').forEach((b) => {
    b.addEventListener('click', () => {
      player.setSpeed(b.dataset.speed);
      root.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b));
    });
  });
  root.querySelectorAll('[data-speed2]').forEach((b) => {
    b.addEventListener('click', () => {
      player.setSpeed(b.dataset.speed2);
      root.querySelectorAll('[data-speed2]').forEach((x) => x.classList.toggle('on', x === b));
      root.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x.dataset.speed === b.dataset.speed2));
    });
  });
  root.querySelector('#heroPlay').addEventListener('click', async () => {
    if (currentKind && sources[currentKind]) await playKind(currentKind);
    else { const sec = root.querySelector('#secSing'); if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });

  /* 光标开关 */
  if (cursorOnBtn) {
    cursorOnBtn.addEventListener('click', () => {
      cursorOn = !cursorOn;
      cursorOnBtn.setAttribute('aria-pressed', cursorOn ? 'true' : 'false');
      cursorOnBtn.textContent = cursorOn ? '◎ 光标跟随开' : '◎ 光标跟随关';
      if (!cursorOn) paintCursor(scoreWrap, null);
      else paintCursorAt(player.state().time);
    });
  }

  /* 单句循环（只在有时间轴时出现） */
  root.querySelectorAll('[data-phrase-window]').forEach((b) => {
    b.addEventListener('click', () => {
      const p = phrases[Number(b.dataset.phraseWindow)];
      if (!p) return;
      player.setWindow({ start: p.start, end: p.end });
      player.seekTo(p.start);
      root.querySelectorAll('[data-phrase-window]').forEach((x) => x.classList.toggle('on', x === b));
      toast(root, `已设为单句循环：第 ${Number(b.dataset.phraseWindow) + 1} 句`, true);
    });
  });
  const clearWin = root.querySelector('#clearWindow');
  if (clearWin) clearWin.addEventListener('click', () => {
    player.setWindow(null);
    root.querySelectorAll('[data-phrase-window]').forEach((x) => x.classList.remove('on'));
  });

  /* ---------------- 乐句教学卡（有卡才接线；复用现有播放器与单句循环） ---------------- */
  const pcBox = root.querySelector('#phraseCardBox');
  if (pcBox && pCards.length) {
    mountPhraseCards(pcBox, {
      cards: pCards,
      pack: phraseDoc,
      mode: 'song',
      songId: ctx.songId,
      /* 现有播放轨道尚未绑定录音版本：loopWindowFor 门禁会如实不放行；
         绑定并核实后此处无需改动，循环自动可用。 */
      activeRecordingId: null,
      onLoop: (card) => {
        const win = pcards.loopWindowFor(card, null);
        if (!win) { toast(root, '这一句的时间轴还没有核实 —— 先到原站对应位置人工跟唱', false); return; }
        player.setWindow(win);
        player.seekTo(win.start);
        toast(root, `已设为单句循环：${card.card_label}`, true);
      },
      onPiano: async () => {
        if (sources.piano) { await playKind('piano'); return; }
        const sec = root.querySelector('#secSing');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        toast(root, '钢琴伴奏尚未提供 —— 可以先看谱读节奏', false);
      },
    });
  }

  /* ---------------- 节拍器（真实发声；不可用则如实说明） ---------------- */
  const metroToggle = root.querySelector('#metroToggle');
  const metroBpm = root.querySelector('#metroBpm');
  const metroVal = root.querySelector('#metroVal');
  const beatDots = root.querySelector('#beatDots');
  function paintBeats(n) {
    if (!beatDots) return;
    const per = beatsPerBar(unit && unit.score && unit.score.time_signature);
    beatDots.querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', i === n % per));
  }
  if (metroToggle) {
    metroToggle.addEventListener('click', () => {
      const st = metro.state();
      if (st.running) { metro.stop(); metroToggle.textContent = '▶ 开始打拍'; metroToggle.setAttribute('aria-pressed', 'false'); paintBeats(-1); }
      else {
        const ok = metro.start();
        if (!ok) { toast(root, '此环境没有音频输出，节拍器不可用', false); return; }
        metroToggle.textContent = '⏸ 停止打拍'; metroToggle.setAttribute('aria-pressed', 'true');
      }
    });
  }
  if (metroBpm) {
    metroBpm.addEventListener('input', () => {
      const v = clampBpm(metroBpm.value);
      metro.setTempo(v);
      if (metroVal) metroVal.textContent = `♩＝${v}`;
    });
  }
  root.querySelectorAll('[data-bpm]').forEach((b) => {
    b.addEventListener('click', () => {
      const v = clampBpm(b.dataset.bpm);
      metro.setTempo(v);
      if (metroBpm) metroBpm.value = String(v);
      if (metroVal) metroVal.textContent = `♩＝${v}`;
    });
  });

  /* ---------------- 歌词当前句（点击选句） ---------------- */
  const firstLine = root.querySelector('.lyric-line');
  if (firstLine) firstLine.classList.add('current');
  root.querySelectorAll('.lyric-line').forEach((el) => {
    const pick = () => {
      root.querySelectorAll('.lyric-line').forEach((x) => x.classList.remove('current'));
      el.classList.add('current');
    };
    el.addEventListener('click', pick);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });

  /* ---------------- 学习状态（真实保存，只增不减） ---------------- */
  root.querySelectorAll('[data-stage]').forEach((b) => {
    b.addEventListener('click', async () => {
      const key = b.dataset.stage;
      await mySongs.setStage(ctx.songId, key).catch(() => {});
      const rec = await mySongs.reviewRecord(ctx.songId);
      const nowStage = stageOf(rec);
      root.querySelectorAll('.stage-chip').forEach((c) => c.classList.toggle('on', c.textContent === (stageText[nowStage] || '')));
      toast(root, `已记下：我现在可以「${stageText[key] || key}」`, true);
    });
  });

  /* ---------------- 收藏 / 分享 ---------------- */
  const likeBtn = root.querySelector('#likeBtn');
  likeBtn.addEventListener('click', async () => {
    const r = await mySongs.toggleLike(ctx.songId);
    likeBtn.textContent = r.liked ? '❤️ 已收藏' : '♡ 收藏';
    likeBtn.setAttribute('aria-pressed', r.liked ? 'true' : 'false');
    likeBtn.classList.remove('heart-pop');
    if (r.liked) { void likeBtn.offsetWidth; likeBtn.classList.add('heart-pop'); }
  });

  const shareStatus = root.querySelector('#shareStatus');
  function showShare(text, ok) {
    shareStatus.hidden = false;
    shareStatus.textContent = text;
    shareStatus.className = 'notice' + (ok ? '' : ' error');
  }
  async function doShare() {
    await mySongs.markShared(ctx.songId).catch(() => {});
    if (navigator.share) {
      try {
        await navigator.share({ title: `${zh}${en ? ' ' + en : ''}`, url: shareUrl });
        showShare('已打开系统分享。', true);
        toast(root, '已打开系统分享', true);
      } catch (e) {
        if (e && e.name !== 'AbortError') showShare('系统分享不可用，请用「复制链接」。', false);
      }
    } else showShare('此浏览器不支持系统分享，请用「复制链接」。', false);
  }
  root.querySelector('#shareBtn').addEventListener('click', doShare);
  root.querySelector('#shareTop').addEventListener('click', doShare);
  root.querySelector('#copyBtn').addEventListener('click', async () => {
    await mySongs.markShared(ctx.songId).catch(() => {});
    try {
      await navigator.clipboard.writeText(shareUrl);
      showShare(`链接已复制：${shareUrl}`, true);
      toast(root, '链接已复制，去分享给一个人吧', true);
    } catch (_) {
      showShare(`复制失败，请手动复制：${shareUrl}`, false);
    }
  });

  /* focus 锚点滚动 */
  if (query && query.focus) {
    const map = { lyrics: 'secLyrics', sing: 'secSing', score: 'secScore' };
    const target = root.querySelector('#' + (map[query.focus] || 'secSing'));
    if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }
}

export default { renderSongPage };
