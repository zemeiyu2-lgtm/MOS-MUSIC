/* =========================================================
   MOS-MUSIC｜Front Learn Mode（学唱 / 视唱 · V3.0）
   ---------------------------------------------------------
   标准：docs/standards/MOS-SONG-TEACHING-METHOD-V1.0.md
     三、教学十步法；四、三种模式（学唱 / 视唱 / 教唱）。

   本页承担 **学唱（learn）** 与 **视唱（sight）** 两种模式
   （教唱模式在 teach 页）。页面结构：
     · 简谱整幅置于顶部（乐谱必须明显），有时间轴时按小节跟随光标；
     · 步骤来自内容层词表（不是硬编码），逐步推进、只有下一步一个动作；
     · 底部统一播放器（男声 / 女声 / 钢琴）+ 速度 + 循环 + 单句循环；
     · 节拍器（真实发声；不可用则如实说明）；
     · 结束时记入四级学习状态（认识 / 会唱 / 独立唱 / 会教）。

   视唱模式默认**不先给完整示范**（内容层 gives_full_demo_first=false），
   先给起音、节拍与钢琴参考，最后才播放示唱核对 —— 程序照此执行，不越权。
========================================================= */

import {
  esc, NOT_PROVIDED, loadSongContext, lyricsFromSlots,
  loadUnitVocab, loadUnit, unitSources, presenceText,
} from './util.js';
import { getIndex } from '../content-source.js';
import { createPlayer, sourcesFromSlots, mergeSources, SPEEDS, speedLabel, trackHtml, bindTrack, formatTime } from './player.js';
import { scoreReady, renderScoreHtml, renderScoreAbsentHtml, locate, paintCursor, supportedLevels } from './score.js';
import { createMetronome, TEMPO_PRESETS, DEFAULT_BPM, BPM_MIN, BPM_MAX, clampBpm, beatsPerBar } from './pulse.js';
import { STAGE_ORDER, stageOf } from './review.js';
import * as songUnit from '../song-unit.js';
import * as pcards from '../phrase-cards.js';
import { mountPhraseCards } from './phrase-card.js';
import * as mySongs from './my-songs.js';

const MODE_META = {
  learn: { label: '学唱', emoji: '🎤' },
  sight: { label: '视唱', emoji: '🎼' },
};

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

function unitLines(unit) {
  const ly = unit && unit.lyrics;
  if (!ly || ly.status !== 'PROVIDED' || !Array.isArray(ly.sections)) return [];
  const out = [];
  for (const sec of ly.sections) for (const line of sec.lines || []) out.push({ line_id: line.line_id, text: line.text });
  return out;
}

export async function renderLearn(root, songId, query) {
  const ctx = await loadSongContext(songId);
  const row = ctx.row || {};
  const zh = row.zh || ctx.songId;
  const modeKey = query && MODE_META[query.mode] ? query.mode : 'learn';
  const modeMeta = MODE_META[modeKey];

  const [vocab, unit, resourcesIdx, my, phraseDoc] = await Promise.all([
    loadUnitVocab(), loadUnit(ctx.songId),
    getIndex('song_resources').catch(() => null), mySongs.get(ctx.songId),
    pcards.loadTeachingPack(ctx.songId).catch(() => null),
  ]);
  /* 乐句卡：学唱用全部卡片（按 phrase_order 顺序）；视唱只取 sight_singing 的独立视唱池。 */
  const allCards = pcards.cardsOf(phraseDoc);
  const pCards = modeKey === 'sight' ? allCards.filter((c) => c.sight_singing === true) : allCards;

  const method = (vocab && vocab.teaching_method) || {};
  const allSteps = method.steps || [];
  const steps = allSteps.filter((s) => (s.modes || []).includes(modeKey));
  const modeDef = (method.modes || []).find((m) => m.key === modeKey) || {};
  const sequence = modeDef.sequence || [];
  const givesFullDemoFirst = modeDef.gives_full_demo_first !== false;

  const lines = unitLines(unit);
  const slotLyrics = lyricsFromSlots(ctx.slots);
  const plainLyrics = lines.length ? lines.map((l) => l.text) : (slotLyrics ? slotLyrics.sections.flat() : []);
  const unitSrc = unitSources(unit, resourcesIdx);
  const sources = mergeSources(sourcesFromSlots(ctx.slots), unitSrc);
  const kinds = [
    ['male', '🎧 男声示唱'], ['female', '🎧 女声示唱'], ['piano', '🎹 钢琴伴奏'],
    ['demo', '🎧 示范'], ['accomp', '🎹 陪唱'],
  ].filter(([k]) => sources[k]);

  const scoreOk = unit ? scoreReady(unit.score) : false;
  const draftScore = (unit && unit.package && unit.package.score) ? unit.package.score : null;
  const tlLevels = unit ? supportedLevels(unit.timeline) : [];
  const phrases = (unit && unit.timeline && unit.timeline.phrases) || [];
  const stageText = {};
  for (const s of (vocab && vocab.learner_stages) || []) stageText[s.key] = s.label;
  const myStage = stageOf({ first_learned_at: my.first_learned_at, stages: my.stages, reviews: my.reviews });

  const total = Math.max(1, steps.length);
  let step = Math.min(Math.max(1, (my.learn_mode === modeKey ? my.learn_step : 1) || 1), total);
  let phrase = 0;
  let cursorOn = true;

  const player = createPlayer();
  player.setSource(sources);
  const metro = createMetronome();

  root.innerHTML = `
  <a class="btn ghost backline" href="#/song/${esc(ctx.songId)}">← 返回歌曲</a>
  <section class="card" style="padding:var(--sp-4)">
    <div class="eyebrow">${esc(modeMeta.emoji)} ${esc(modeMeta.label)}模式 ｜ ${esc(zh)}${row.en ? ` · ${esc(row.en)}` : ''}</div>
    <div class="mode-tabs">
      <a class="pill ${modeKey === 'learn' ? 'on' : ''}" href="#/learn/${esc(ctx.songId)}">🎤 学唱</a>
      <a class="pill ${modeKey === 'sight' ? 'on' : ''}" href="#/learn/${esc(ctx.songId)}?mode=sight">🎼 视唱</a>
      <a class="pill" href="#/teach/${esc(ctx.songId)}">🧑‍🏫 教唱</a>
    </div>
    <p class="plain muted" style="margin:4px 0 0">${esc(modeDef.note || '')}</p>
  </section>

  <div class="learn-shell" style="margin-top:var(--sp-2)">
    <div>
      <!-- 简谱（顶部，整幅） -->
      <section class="card sp-sec sp-score-card">
        <div class="sp-score-head">
          <h2>简谱</h2>
          <div class="sp-score-tools">
            <span class="chip">${scoreOk ? '统一简谱' : draftScore ? '简谱草稿 · 待人工听校' : NOT_PROVIDED}</span>
            ${scoreOk && tlLevels.length ? `<button class="pill" id="cursorBtn" aria-pressed="true">◎ 光标跟随开</button>` : ''}
          </div>
        </div>
        <div class="score-wrap" id="scoreWrap">
          ${scoreOk ? renderScoreHtml(unit.score, { lyrics: unit.lyrics })
            : draftScore ? renderScoreHtml(draftScore, { lyrics: unit.lyrics })
            : renderScoreAbsentHtml(unit && unit.score && unit.score.note)}
        </div>
        ${draftScore && !scoreOk ? `<div class="notice">以下是简谱草稿（待人工听校），不计入等级；校对通过后成为正式统一简谱。</div>` : ''}
        ${scoreOk && tlLevels.length ? `<div class="cursor-bar" aria-live="polite"><span class="cursor-pos" id="cursorPos">等待播放</span></div>` : ''}
        ${scoreOk && phrases.length ? `<div class="phrase-loop" id="phraseLoop">
          <span class="phrase-loop-label">单句循环：</span>
          ${phrases.map((p, i) => `<button class="pill" data-phrase-window="${i}">第 ${i + 1} 句</button>`).join('')}
          <button class="pill" id="clearWindow">取消</button></div>` : ''}
      </section>

      <!-- 步骤舞台 -->
      <section class="card learn-stage" aria-live="polite" style="margin-top:var(--sp-2)">
        <div class="stage-dots" id="lDots" aria-label="学习进度">
          ${steps.map((_, i) => `<b class="${i + 1 === step ? 'now' : i + 1 < step ? 'done' : ''}">${i + 1}</b>`).join('')}
        </div>
        <div class="stage-steps">${steps.map((s, i) => `<span class="${i + 1 === step ? 'on' : ''}">${esc(s.label)}</span>`).join('')}</div>
        <div class="stage-step" id="lKicker">${step} / ${total}</div>
        <div class="stage-word" id="lWord">${esc((steps[step - 1] || {}).label || '')}</div>
        <div class="stage-phrase" id="lPhrase">${plainLyrics.length ? esc(plainLyrics[phrase]) : '歌词尚未提供 —— 可以先跟着旋律哼唱。'}</div>
        <div class="stage-hint" id="lHint">${esc((steps[step - 1] || {}).goal || (sequence[Math.min(step - 1, sequence.length - 1)] || {}).hint || '')}</div>
        <div class="stage-actions">
          <button class="btn ghost" id="prevStep">← 上一步</button>
          ${plainLyrics.length ? '<button class="btn ghost" id="pPrev">上一句</button><button class="btn ghost" id="pNext">下一句</button>' : ''}
          <button class="btn primary" id="nextStep">下一步 →</button>
        </div>
        ${pCards.length ? `<div id="learnPhraseBox" style="margin-top:var(--sp-2)"></div>` : ''}
      </section>

      <!-- 统一播放器 -->
      <section class="card" style="margin-top:var(--sp-2)">
        <div class="player">
          <div class="player-row">
            <button class="play-fab" id="lToggle" aria-label="播放或暂停" ${kinds.length ? '' : 'disabled'}>▶</button>
            <div class="player-main">
              <span class="player-state" id="lState">未播放</span>
              <span class="wave" id="lWave" aria-hidden="true"><i></i><i></i><i></i></span>
              <span class="player-time" id="lTime">0:00 / 0:00</span>
            </div>
          </div>
          ${trackHtml()}
          <div class="player-row">
            ${kinds.map(([k, label]) => `<button class="pill kind" data-kind="${k}">${esc(label)}</button>`).join('')}
            <button class="pill" id="lLoop" aria-pressed="false">🔁 循环关</button>
            ${SPEEDS.map((s) => `<button class="pill spd${s === 0.75 ? ' on' : ''}" data-speed="${s}">${speedLabel(s)}</button>`).join('')}
          </div>
        </div>
        ${givesFullDemoFirst ? '' : '<p class="plain muted small">视唱模式默认不先给完整示范 —— 先看谱唱，最后再播放示范核对。</p>'}
        ${!kinds.length ? `<p class="plain muted small">音频${NOT_PROVIDED}；可以先看谱、打拍、读词。资源导入后这里可直接播放、变速、循环。</p>` : ''}
      </section>

      <!-- 节拍器 -->
      <section class="card" style="margin-top:var(--sp-2)">
        <div class="metro-head">
          <span class="metro-title">节拍器</span>
          <span class="metro-note">拍手 · 点拍 · 口读节奏 · 轻声数拍。</span>
        </div>
        <div class="metro-row">
          <button class="pill" id="metroToggle" aria-pressed="false">▶ 开始打拍</button>
          <input class="metro-range" id="metroBpm" type="range" min="${BPM_MIN}" max="${BPM_MAX}" value="${DEFAULT_BPM}" aria-label="速度" ${metro.state().available ? '' : 'disabled'}>
          <span class="metro-val" id="metroVal">♩＝${DEFAULT_BPM}</span>
          ${TEMPO_PRESETS.map((p) => `<button class="pill" data-bpm="${p.bpm}">${esc(p.label)}</button>`).join('')}
        </div>
        <div class="beat-dots" id="beatDots" aria-hidden="true">${Array.from({ length: beatsPerBar(unit && unit.score && unit.score.time_signature) }, () => '<i></i>').join('')}</div>
      </section>
    </div>

    <div>
      ${plainLyrics.length ? `
      <section class="card sp-sec">
        <h2>歌词（对照用）</h2>
        <div class="lyrics" id="lPhrases">
          ${plainLyrics.map((p, i) => `<p class="lyric-line" data-phrase="${i}" tabindex="0">${esc(p)}</p>`).join('')}
        </div>
      </section>` : `
      <section class="card sp-sec">
        <h2>歌词</h2>
        <div class="state-empty"><span class="glyph">✍️</span><div>歌词${NOT_PROVIDED}</div><div class="small">分句高亮将在歌词资源导入后可用。</div></div>
      </section>`}

      <section class="card sp-sec">
        <h2>学习路径状态</h2>
        <div class="stages" aria-label="学习路径状态">
          ${STAGE_ORDER.map((k) => `<span class="stage-chip ${myStage === k ? 'on' : ''}">${esc(stageText[k] || k)}</span>`).join('')}
        </div>
        <p class="plain muted small">这些是学习路径状态，不是分数。系统不判通过 / 不通过。</p>
        <div class="btn-row">
          ${STAGE_ORDER.map((k) => `<button class="pill" data-stage="${k}">我可以「${esc(stageText[k] || k)}」</button>`).join('')}
        </div>
      </section>

      <section class="card sp-sec learn-done-card" id="lDoneCard" ${step === total ? '' : 'hidden'}>
        <div class="stage-word">这一遍走完了</div>
        <p class="plain muted">走完不等于结束 —— 再唱一次，或把它教给一个人。</p>
        <div class="btn-row" style="justify-content:center">
          <button class="btn primary big" id="lAgain">🔁 再唱一次</button>
          <a class="btn secondary big" href="#/teach/${esc(ctx.songId)}">🧑‍🏫 教他唱</a>
        </div>
        <div class="btn-row" style="justify-content:center">
          <a class="btn ghost" href="#/song/${esc(ctx.songId)}?focus=score">回到简谱继续看</a>
        </div>
      </section>
    </div>
  </div>`;

  /* ---------------- 播放器 ---------------- */
  const stateEl = root.querySelector('#lState');
  const waveEl = root.querySelector('#lWave');
  const timeEl = root.querySelector('#lTime');
  const toggleBtn = root.querySelector('#lToggle');
  const loopBtn = root.querySelector('#lLoop');
  const kindBtns = Array.from(root.querySelectorAll('[data-kind]'));
  const scoreWrap = root.querySelector('#scoreWrap');
  const cursorPos = root.querySelector('#cursorPos');
  let currentKind = kinds.length ? kinds[0][0] : null;

  function paintCursorAt(t) {
    if (!cursorOn || !unit || !tlLevels.length) return;
    const loc = locate(unit, t);
    paintCursor(scoreWrap, loc);
    if (cursorPos) {
      const bits = [];
      if (loc.phrase_index != null) bits.push(`第 ${loc.phrase_index + 1} 句`);
      if (loc.measure_no != null) bits.push(`第 ${loc.measure_no} 小节`);
      cursorPos.textContent = bits.length ? bits.join(' ｜ ') : '等待播放';
    }
  }
  function paint() {
    const st = player.state();
    const labelOf = { male: '男声示唱', female: '女声示唱', piano: '钢琴伴奏', demo: '示范', accomp: '陪唱' };
    stateEl.textContent = st.playing ? `${labelOf[st.kind] || '音频'}播放中` : (st.kind ? '已暂停' : '未播放');
    waveEl.classList.toggle('on', st.playing);
    toggleBtn.textContent = st.playing ? '⏸' : '▶';
    toggleBtn.classList.toggle('playing', st.playing);
    timeEl.textContent = `${formatTime(st.time)} / ${formatTime(st.duration)}`;
    loopBtn.textContent = st.loop ? '🔁 循环开' : '🔁 循环关';
    loopBtn.setAttribute('aria-pressed', st.loop ? 'true' : 'false');
    kindBtns.forEach((b) => b.classList.toggle('on', b.dataset.kind === st.kind));
  }
  player.mount(stateEl);
  stateEl.addEventListener('player:change', () => { paint(); paintCursorAt(player.state().time); });
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
  root.querySelectorAll('[data-speed]').forEach((b) => {
    b.addEventListener('click', () => {
      player.setSpeed(b.dataset.speed);
      root.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b));
    });
  });

  const cursorOnBtn = root.querySelector('#cursorBtn');
  if (cursorOnBtn) cursorOnBtn.addEventListener('click', () => {
    cursorOn = !cursorOn;
    cursorOnBtn.setAttribute('aria-pressed', cursorOn ? 'true' : 'false');
    cursorOnBtn.textContent = cursorOn ? '◎ 光标跟随开' : '◎ 光标跟随关';
    if (!cursorOn) paintCursor(scoreWrap, null); else paintCursorAt(player.state().time);
  });
  root.querySelectorAll('[data-phrase-window]').forEach((b) => {
    b.addEventListener('click', () => {
      const p = phrases[Number(b.dataset.phraseWindow)];
      if (!p) return;
      player.setWindow({ start: p.start, end: p.end });
      player.seekTo(p.start);
      root.querySelectorAll('[data-phrase-window]').forEach((x) => x.classList.toggle('on', x === b));
    });
  });
  const clearWin = root.querySelector('#clearWindow');
  if (clearWin) clearWin.addEventListener('click', () => {
    player.setWindow(null);
    root.querySelectorAll('[data-phrase-window]').forEach((x) => x.classList.remove('on'));
  });

  /* ---------------- 乐句教学卡（按 phrase 顺序教学；复用现有播放器） ---------------- */
  const learnPcBox = root.querySelector('#learnPhraseBox');
  if (learnPcBox && pCards.length) {
    const initialIdx = Math.min(Math.max(0, Number(query && query.card) || 0), pCards.length - 1);
    mountPhraseCards(learnPcBox, {
      cards: pCards,
      pack: phraseDoc,
      mode: modeKey,
      songId: ctx.songId,
      /* 播放轨道尚未绑定录音版本：门禁不放行单句循环，界面如实说明。 */
      activeRecordingId: null,
      initialIndex: initialIdx,
      onLoop: (card) => {
        const win = pcards.loopWindowFor(card, null);
        if (!win) { toast(root, '这一句的时间轴还没有核实 —— 先到原站对应位置人工跟唱', false); return; }
        player.setWindow(win);
        player.seekTo(win.start);
        toast(root, `已设为单句循环：${card.card_label}`, true);
      },
      onPiano: async () => {
        if (sources.piano) { await playKind('piano'); return; }
        toast(root, '钢琴伴奏尚未提供 —— 可以先看谱读节奏', false);
      },
    });
  }

  /* ---------------- 节拍器 ---------------- */
  const metroToggle = root.querySelector('#metroToggle');
  const metroBpm = root.querySelector('#metroBpm');
  const metroVal = root.querySelector('#metroVal');
  const beatDots = root.querySelector('#beatDots');
  const perBar = beatsPerBar(unit && unit.score && unit.score.time_signature);
  function paintBeats(n) { if (beatDots) beatDots.querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', n >= 0 && i === n % perBar)); }
  if (metroToggle) {
    metroToggle.addEventListener('click', () => {
      if (metro.state().running) { metro.stop(); metroToggle.textContent = '▶ 开始打拍'; metroToggle.setAttribute('aria-pressed', 'false'); paintBeats(-1); }
      else if (!metro.start()) toast(root, '此环境没有音频输出，节拍器不可用', false);
      else { metroToggle.textContent = '⏸ 停止打拍'; metroToggle.setAttribute('aria-pressed', 'true'); }
    });
  }
  if (metroBpm) metroBpm.addEventListener('input', () => {
    const v = clampBpm(metroBpm.value); metro.setTempo(v); if (metroVal) metroVal.textContent = `♩＝${v}`;
  });
  root.querySelectorAll('[data-bpm]').forEach((b) => b.addEventListener('click', () => {
    const v = clampBpm(b.dataset.bpm); metro.setTempo(v);
    if (metroBpm) metroBpm.value = String(v); if (metroVal) metroVal.textContent = `♩＝${v}`;
  }));

  /* ---------------- 歌词句 ---------------- */
  function paintPhrase() {
    root.querySelectorAll('[data-phrase]').forEach((el) => el.classList.toggle('current', Number(el.dataset.phrase) === phrase));
    const p = root.querySelector('#lPhrase');
    if (p && plainLyrics.length) p.textContent = plainLyrics[phrase];
  }
  paintPhrase();
  root.querySelectorAll('[data-phrase]').forEach((el) => el.addEventListener('click', () => { phrase = Number(el.dataset.phrase); paintPhrase(); }));
  const pPrev = root.querySelector('#pPrev');
  const pNext = root.querySelector('#pNext');
  if (pPrev) pPrev.addEventListener('click', () => { phrase = Math.max(0, phrase - 1); paintPhrase(); });
  if (pNext) pNext.addEventListener('click', () => { phrase = Math.min(plainLyrics.length - 1, phrase + 1); paintPhrase(); });

  /* ---------------- 步骤推进 ---------------- */
  async function saveStep() {
    await mySongs.setLearnStep(ctx.songId, step, total, modeKey).catch(() => {});
    if (step === total) {
      await mySongs.markSung(ctx.songId).catch(() => {});
      const done = root.querySelector('#lDoneCard');
      if (done) done.hidden = false;
      toast(root, '这一遍走完了 —— 再唱一次，或教给一个人', true);
    }
  }
  function syncStep() {
    root.querySelector('#lDots').innerHTML =
      steps.map((_, i) => `<b class="${i + 1 === step ? 'now' : i + 1 < step ? 'done' : ''}">${i + 1}</b>`).join('');
    root.querySelector('.stage-steps').innerHTML =
      steps.map((s, i) => `<span class="${i + 1 === step ? 'on' : ''}">${esc(s.label)}</span>`).join('');
    root.querySelector('#lKicker').textContent = `${step} / ${total}`;
    root.querySelector('#lWord').textContent = (steps[step - 1] || {}).label || '';
    root.querySelector('#lHint').textContent = (steps[step - 1] || {}).goal || (sequence[Math.min(step - 1, sequence.length - 1)] || {}).hint || '';
    saveStep();
  }
  root.querySelector('#prevStep').addEventListener('click', () => { if (step > 1) { step -= 1; syncStep(); } });
  root.querySelector('#nextStep').addEventListener('click', () => { if (step < total) { step += 1; syncStep(); } });
  const againBtn = root.querySelector('#lAgain');
  if (againBtn) againBtn.addEventListener('click', () => { step = 1; syncStep(); player.toggleLoop(); toast(root, '好 —— 从头再来一次', true); });

  /* ---------------- 四级状态 ---------------- */
  root.querySelectorAll('[data-stage]').forEach((b) => {
    b.addEventListener('click', async () => {
      const key = b.dataset.stage;
      await mySongs.setStage(ctx.songId, key).catch(() => {});
      const rec = await mySongs.reviewRecord(ctx.songId);
      const nowStage = stageOf(rec);
      root.querySelectorAll('.stage-chip').forEach((c) => c.classList.toggle('on', c.textContent === (stageText[nowStage] || '')));
      toast(root, `已记下：我可以「${stageText[key] || key}」`, true);
    });
  });
}

export default { renderLearn };
