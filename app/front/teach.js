/* =========================================================
   MOS-MUSIC｜Front Teach Mode（教唱模式 · V3.0）
   ---------------------------------------------------------
   标准：docs/standards/MOS-SONG-TEACHING-METHOD-V1.0.md
     四、教唱模式（modes.teach）：教谱 → 教节奏 → 教词 → 示范 →
        跟唱 → 钢琴陪唱 → 全曲。

   目标用户：父母 / 小组长 / 主日学老师 / 敬拜同工 / 普通信徒。
   第一句话直接说：不用懂乐理，也可以教别人唱。
   本页把「教」拆成可执行的动作，并显示这首歌真正的：
     · 教谱要点（调 / 拍号 / 起音 / 音域 / 主要节奏 / 结构 / 易错处）
     · 教词要点（易读错 / 易唱错 / 词义 / 换气 / 长音 / 重音）
     · 声乐提示（呼吸 / 起音 / 高音 / 长音 / 咬字 …）
     · 真人教唱短片模块（未录制一律「尚未提供」，不假装有视频）
   全部内容来自歌曲单元自身，未提供就如实显示 —— 不硬写乐理课。
========================================================= */

import {
  esc, NOT_PROVIDED, loadSongContext, lyricsFromSlots,
  loadUnitVocab, loadUnit, unitSources, presenceText,
} from './util.js';
import { getIndex } from '../content-source.js';
import { createPlayer, sourcesFromSlots, mergeSources, SPEEDS, speedLabel, trackHtml, bindTrack, formatTime } from './player.js';
import { scoreReady, renderScoreHtml, renderScoreAbsentHtml } from './score.js';
import { createMetronome, TEMPO_PRESETS, DEFAULT_BPM, BPM_MIN, BPM_MAX, clampBpm, beatsPerBar } from './pulse.js';
import * as mySongs from './my-songs.js';
import * as pcards from '../phrase-cards.js';
import { mountPhraseCards } from './phrase-card.js';

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
  for (const sec of ly.sections) for (const line of sec.lines || []) out.push(line.text);
  return out;
}

export async function renderTeach(root, songId, query) {
  const ctx = await loadSongContext(songId);
  const row = ctx.row || {};
  const zh = row.zh || ctx.songId;

  const [vocab, unit, resourcesIdx, phraseDoc] = await Promise.all([
    loadUnitVocab(), loadUnit(ctx.songId), getIndex('song_resources').catch(() => null),
    pcards.loadTeachingPack(ctx.songId).catch(() => null),
  ]);
  const pCards = pcards.cardsOf(phraseDoc);

  const method = (vocab && vocab.teaching_method) || {};
  const modeDef = (method.modes || []).find((m) => m.key === 'teach') || {};
  const steps = modeDef.sequence || [];

  const lines = unitLines(unit);
  const slotLyrics = lyricsFromSlots(ctx.slots);
  const plainLyrics = lines.length ? lines : (slotLyrics ? slotLyrics.sections.flat() : []);
  const unitSrc = unitSources(unit, resourcesIdx);
  const sources = mergeSources(sourcesFromSlots(ctx.slots), unitSrc);
  const kinds = [
    ['piano', '🎹 钢琴陪唱'], ['male', '🎧 男声示唱'], ['female', '🎧 女声示唱'],
    ['demo', '🎧 示范'], ['accomp', '🎹 陪唱'],
  ].filter(([k]) => sources[k]);

  const scoreOk = unit ? scoreReady(unit.score) : false;
  const teach = (unit && unit.teaching) || {};
  const scoreItems = ((teach.score_class || {}).items || []).filter((i) => i && (i.value || i.note));
  const lyricItems = ((teach.lyrics_class || {}).items || []).filter((i) => i && (i.text || i.note));
  const vocalItems = (teach.vocal || []).filter((v) => v && v.tip);
  const liveModules = ((teach.live_teaching || {}).modules || []);
  const liveProvided = liveModules.some((m) => m.status === 'PROVIDED');

  const scoreClassKeys = (vocab && vocab.score_class_keys) || {};
  const lyricsClassKeys = (vocab && vocab.lyrics_class_keys) || {};
  const vocalKeys = (vocab && vocab.vocal_keys) || {};
  const liveLabels = {};
  for (const m of (vocab && vocab.live_teaching_modules) || []) liveLabels[m.key] = m.label;
  const whoNote = query && query.who === 'child' ? '和孩子一起：节奏放慢，多用鼓励。'
    : query && query.who === 'group' ? '小组一起：分句轮流唱，每人一句。' : null;

  const player = createPlayer();
  player.setSource(sources);
  const metro = createMetronome();
  const perBar = beatsPerBar(unit && unit.score && unit.score.time_signature);
  let step = 1;

  root.innerHTML = `
  <a class="btn ghost backline" href="#/song/${esc(ctx.songId)}">← 返回歌曲</a>
  <section class="card" style="padding:var(--sp-4)">
    <div class="eyebrow">🧑‍🏫 教唱模式 ｜ ${esc(zh)}${row.en ? ` · ${esc(row.en)}` : ''}</div>
    <div class="teach-open" style="margin-top:var(--sp-2)">不用懂乐理，也可以教别人唱。<br><span style="font-size:var(--fs-6)">教唱不是讲乐理 —— 把这首歌交给另一个人就够了。</span></div>
    ${whoNote ? `<div class="notice" style="margin-top:var(--sp-2)">${esc(whoNote)}</div>` : ''}
    <div class="mode-tabs" style="margin-top:var(--sp-2)">
      <a class="pill" href="#/learn/${esc(ctx.songId)}">🎤 学唱</a>
      <a class="pill" href="#/learn/${esc(ctx.songId)}?mode=sight">🎼 视唱</a>
      <a class="pill on" href="#/teach/${esc(ctx.songId)}">🧑‍🏫 教唱</a>
    </div>
  </section>

  <div class="learn-shell" style="margin-top:var(--sp-2)">
    <div>
      <!-- 简谱（教谱的基础） -->
      <section class="card sp-sec sp-score-card">
        <div class="sp-score-head">
          <h2>简谱</h2>
          <div class="sp-score-tools"><span class="chip">${scoreOk ? '统一简谱' : NOT_PROVIDED}</span></div>
        </div>
        <div class="score-wrap" id="scoreWrap">
          ${scoreOk ? renderScoreHtml(unit.score, { lyrics: unit.lyrics }) : renderScoreAbsentHtml(unit && unit.score && unit.score.note)}
        </div>
      </section>

      <!-- 教唱序列舞台 -->
      <section class="card learn-stage" aria-live="polite" style="margin-top:var(--sp-2)">
        <div class="stage-dots" id="tDots" aria-label="教唱进度">
          ${steps.map((_, i) => `<b class="${i === 0 ? 'now' : ''}">${i + 1}</b>`).join('')}
        </div>
        <div class="stage-steps">${steps.map((s, i) => `<span class="${i === 0 ? 'on' : ''}">${esc(s.label)}</span>`).join('')}</div>
        <div class="stage-step" id="tKicker">1 / ${steps.length || 1}</div>
        <div class="stage-word" id="tWord">${esc((steps[0] || {}).label || '')}</div>
        <div class="stage-phrase" id="tPhrase">${plainLyrics.length ? esc(plainLyrics[0]) : '歌词尚未提供 —— 可以先哼旋律给对方听。'}</div>
        <div class="stage-hint" id="tHint">${esc((steps[0] || {}).hint || '')}</div>
        <div class="stage-actions">
          <button class="btn ghost" id="tPrev">← 上一步</button>
          <button class="btn primary" id="tNext">下一步 →</button>
        </div>
      </section>

      <!-- 播放器 -->
      <section class="card" style="margin-top:var(--sp-2)">
        <div class="player">
          <div class="player-row">
            <button class="play-fab" id="tToggle" aria-label="播放或暂停" ${kinds.length ? '' : 'disabled'}>▶</button>
            <div class="player-main">
              <span class="player-state" id="tState">未播放</span>
              <span class="wave" id="tWave" aria-hidden="true"><i></i><i></i><i></i></span>
              <span class="player-time" id="tTime">0:00 / 0:00</span>
            </div>
          </div>
          ${trackHtml()}
          <div class="player-row">
            ${kinds.map(([k, label]) => `<button class="pill kind" data-kind="${k}">${esc(label)}</button>`).join('')}
            <button class="pill" id="tLoop" aria-pressed="false">🔁 循环关</button>
            ${SPEEDS.map((s) => `<button class="pill spd${s === 0.75 ? ' on' : ''}" data-speed="${s}">${speedLabel(s)}</button>`).join('')}
          </div>
        </div>
        <p class="plain muted small" style="margin-bottom:0">难句重唱：循环开 + 慢速即可完成，不需要懂乐理。伴奏只提供钢琴。</p>
      </section>

      <!-- 节拍器（教节奏用） -->
      <section class="card" style="margin-top:var(--sp-2)">
        <div class="metro-head">
          <span class="metro-title">节拍器 · 教节奏</span>
          <span class="metro-note">一起拍手打拍，先把节拍走顺。</span>
        </div>
        <div class="metro-row">
          <button class="pill" id="metroToggle" aria-pressed="false">▶ 开始打拍</button>
          <input class="metro-range" id="metroBpm" type="range" min="${BPM_MIN}" max="${BPM_MAX}" value="${DEFAULT_BPM}" aria-label="速度" ${metro.state().available ? '' : 'disabled'}>
          <span class="metro-val" id="metroVal">♩＝${DEFAULT_BPM}</span>
          ${TEMPO_PRESETS.map((p) => `<button class="pill" data-bpm="${p.bpm}">${esc(p.label)}</button>`).join('')}
        </div>
        <div class="beat-dots" id="beatDots" aria-hidden="true">${Array.from({ length: perBar }, () => '<i></i>').join('')}</div>
      </section>
    </div>

    <div>
      <!-- 乐句教学卡 · 教人提示（教师脚本逐字来自制作包；有卡才显示） -->
      ${pCards.length ? `
      <section class="card sp-sec" id="teachPhrases">
        <div class="section-head"><h2>乐句教学卡</h2><span class="chip">${pCards.length} 句</span></div>
        <p class="plain muted">一句一句教：先让对方听，只给起音，不连续代唱；指出一个音乐问题，再让对方唱一次。</p>
        <div id="teachPhraseBox"></div>
      </section>` : ''}

      <!-- 教谱要点 -->
      <section class="card sp-sec">
        <h2>教谱要点</h2>
        ${scoreItems.length ? `<ul class="teach-list">${scoreItems.map((i) => `<li><b>${esc(scoreClassKeys[i.key] || i.key)}</b>：${esc(i.value || '')}${i.note ? ` <span class="muted">（${esc(i.note)}）</span>` : ''}</li>`).join('')}</ul>`
          : `<div class="state-empty"><span class="glyph">🎼</span><div>教谱说明${NOT_PROVIDED}</div><div class="small">这些说明随统一简谱制作一起产生 —— 不得脱离乐谱先写结论。</div></div>`}
      </section>

      <!-- 教词要点 -->
      <section class="card sp-sec">
        <h2>教词要点</h2>
        ${lyricItems.length ? `<ul class="teach-list">${lyricItems.map((i) => `<li><b>${esc(lyricsClassKeys[i.key] || i.key)}</b>：${esc(i.text || '')}${i.note ? ` <span class="muted">（${esc(i.note)}）</span>` : ''}</li>`).join('')}</ul>`
          : `<div class="state-empty"><span class="glyph">✍️</span><div>教词说明${NOT_PROVIDED}</div><div class="small">教词说明随歌词整理产生（易读错 / 易唱错 / 词义 / 换气 / 长音 / 重音）。</div></div>`}
      </section>

      <!-- 声乐提示 -->
      <section class="card sp-sec">
        <h2>声乐提示</h2>
        ${vocalItems.length ? `<ul class="teach-list">${vocalItems.map((v) => `<li><b>${esc(vocalKeys[v.key] || v.key)}</b>：${esc(v.tip)}</li>`).join('')}</ul>`
          : `<div class="state-empty"><span class="glyph">🫁</span><div>声乐提示${NOT_PROVIDED}</div><div class="small">只记录这首歌真正需要的技术提示，一项一句话 —— 不做专业声乐训练课。</div></div>`}
      </section>

      <!-- 真人教唱模块 -->
      <section class="card sp-sec">
        <h2>真人教唱模块</h2>
        ${liveModules.length ? `<div class="live-grid">
          ${liveModules.map((m) => `<div class="live-mod ${m.status === 'PROVIDED' ? 'ok' : ''}">
            <span class="live-name">${esc(liveLabels[m.key] || m.label || m.key)}</span>
            <span class="live-state">${presenceText(m.status)}</span>
          </div>`).join('')}</div>
          <p class="plain muted small">${liveProvided ? '已录制模块可直接播放（资源导入后）。' : '真人教唱优先做成短、碎、可重复利用的模块，不要求每首歌拍长视频。当前尚未录制 —— 不假装有视频。'}</p>`
          : `<div class="state-empty"><span class="glyph">🎬</span><div>真人教唱${NOT_PROVIDED}</div></div>`}
      </section>

      <!-- 歌词对照 -->
      <section class="card sp-sec">
        <h2>歌词（对照用）</h2>
        ${plainLyrics.length ? `<div class="lyrics" id="tLyrics">${plainLyrics.map((l, i) => `<p class="lyric-line" data-line="${i}" tabindex="0">${esc(l)}</p>`).join('')}</div>`
          : `<div class="state-empty"><span class="glyph">✍️</span><div>歌词${NOT_PROVIDED}</div><div class="small">可以先教旋律，歌词资源导入后这里会显示对照文本。</div></div>`}
      </section>

      <!-- 完成 -->
      <section class="card sp-sec">
        <h2>完成这次教唱</h2>
        <p class="plain muted">最后一步唱完，点下面的按钮记下这一次（保存在「我的歌 · 我教过」）。</p>
        <div class="btn-row"><button class="btn primary big" id="tDone">🧑‍🏫 完成这次教唱</button></div>
        <div class="notice" id="tDoneStatus" hidden></div>
        <div class="btn-row"><a class="btn secondary big" href="#/song/${esc(ctx.songId)}?share=1">↗ 把这首歌分享给一个人</a></div>
      </section>
    </div>
  </div>`;

  /* ---------------- 播放器 ---------------- */
  const stateEl = root.querySelector('#tState');
  const waveEl = root.querySelector('#tWave');
  const timeEl = root.querySelector('#tTime');
  const toggleBtn = root.querySelector('#tToggle');
  const loopBtn = root.querySelector('#tLoop');
  const kindBtns = Array.from(root.querySelectorAll('[data-kind]'));
  let currentKind = kinds.length ? kinds[0][0] : null;
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
  stateEl.addEventListener('player:change', paint);
  bindTrack(root, player);
  paint();

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

  /* ---------------- 乐句教学卡 · 教人提示（复用现有播放器） ---------------- */
  const teachPcBox = root.querySelector('#teachPhraseBox');
  if (teachPcBox && pCards.length) {
    mountPhraseCards(teachPcBox, {
      cards: pCards,
      pack: phraseDoc,
      mode: 'teach',
      songId: ctx.songId,
      /* 播放轨道尚未绑定录音版本：门禁不放行单句循环，界面如实说明。 */
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
        toast(root, '钢琴伴奏尚未提供 —— 可以先哼旋律给对方听', false);
      },
    });
  }

  root.querySelectorAll('[data-speed]').forEach((b) => {
    b.addEventListener('click', () => {
      player.setSpeed(b.dataset.speed);
      root.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b));
    });
  });

  /* ---------------- 节拍器 ---------------- */
  const metroToggle = root.querySelector('#metroToggle');
  const metroBpm = root.querySelector('#metroBpm');
  const metroVal = root.querySelector('#metroVal');
  const beatDots = root.querySelector('#beatDots');
  function paintBeats(n) { if (beatDots) beatDots.querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', n >= 0 && i === n % perBar)); }
  if (metroToggle) {
    metroToggle.addEventListener('click', () => {
      if (metro.state().running) { metro.stop(); metroToggle.textContent = '▶ 开始打拍'; metroToggle.setAttribute('aria-pressed', 'false'); paintBeats(-1); }
      else if (!metro.start()) toast(root, '此环境没有音频输出，节拍器不可用', false);
      else { metroToggle.textContent = '⏸ 停止打拍'; metroToggle.setAttribute('aria-pressed', 'true'); }
    });
  }
  if (metroBpm) metroBpm.addEventListener('input', () => { const v = clampBpm(metroBpm.value); metro.setTempo(v); if (metroVal) metroVal.textContent = `♩＝${v}`; });
  root.querySelectorAll('[data-bpm]').forEach((b) => b.addEventListener('click', () => {
    const v = clampBpm(b.dataset.bpm); metro.setTempo(v);
    if (metroBpm) metroBpm.value = String(v); if (metroVal) metroVal.textContent = `♩＝${v}`;
  }));

  /* ---------------- 步骤 + 歌词跟随 ---------------- */
  function syncStep() {
    root.querySelector('#tDots').innerHTML = steps.map((_, i) => `<b class="${i + 1 === step ? 'now' : i + 1 < step ? 'done' : ''}">${i + 1}</b>`).join('');
    root.querySelector('.stage-steps').innerHTML = steps.map((s, i) => `<span class="${i + 1 === step ? 'on' : ''}">${esc(s.label)}</span>`).join('');
    root.querySelector('#tKicker').textContent = `${step} / ${steps.length || 1}`;
    root.querySelector('#tWord').textContent = (steps[step - 1] || {}).label || '';
    root.querySelector('#tHint').textContent = (steps[step - 1] || {}).hint || '';
  }
  root.querySelector('#tPrev').addEventListener('click', () => { if (step > 1) { step -= 1; syncStep(); } });
  root.querySelector('#tNext').addEventListener('click', () => { if (step < steps.length) { step += 1; syncStep(); } });

  const linesEls = root.querySelectorAll('#tLyrics [data-line]');
  linesEls.forEach((el, i) => {
    const pick = () => {
      linesEls.forEach((x) => x.classList.remove('current'));
      el.classList.add('current');
      const p = root.querySelector('#tPhrase');
      if (p && plainLyrics[i]) p.textContent = plainLyrics[i];
    };
    el.addEventListener('click', pick);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
  if (linesEls[0]) linesEls[0].classList.add('current');

  root.querySelector('#tDone').addEventListener('click', async () => {
    const r = await mySongs.markTaught(ctx.songId);
    await mySongs.setStage(ctx.songId, 'can_teach').catch(() => {});
    const box = root.querySelector('#tDoneStatus');
    box.hidden = false;
    box.textContent = `已记录：这是你第 ${r.taught_count} 次教这首歌。`;
  });
}

export default { renderTeach };
