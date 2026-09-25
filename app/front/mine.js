/* =========================================================
   MOS-MUSIC｜Front Mine（我的 · 我的歌 · V2.1 个人音乐空间）
   ---------------------------------------------------------
   真正的个人空间：温暖的开场 + 概览数字 + 五个分组（封面缩略）。
   爱唱机制（不变，无积分、无排行榜、无徽章竞争）：
     ❤️ 我喜欢 ｜ 📚 正在学 ｜ 🎤 我教过 ｜ ↗️ 我传过 ｜ 🕘 最近唱过
   数据来自本地 IndexedDB（mos-music.my_songs），逐条真实保存。
   页面底部提供后台隐藏入口（生产 / 审核 / 曲库 / 校准 / 系统）——
   普通用户不需要看到，但后台能力一个都不删。
========================================================= */

import { esc, loadCatalog, loadThemes, loadUnitVocab } from './util.js';
import { coverFor, langIndexOf } from './covers.js';
import { STAGE_ORDER, dueRecords } from './review.js';
import * as mySongs from './my-songs.js';

const GROUPS = [
  ['liked', '❤️ 我喜欢'],
  ['learning', '📚 正在学'],
  ['taught', '🎤 我教过'],
  ['shared', '↗️ 我传过'],
  ['recent', '🕘 最近唱过'],
];

export async function renderMine(root) {
  const [groups, catalog, themes, vocab, counts, allMy, coachCount] = await Promise.all([
    mySongs.groups(), loadCatalog(), loadThemes(), loadUnitVocab(),
    mySongs.stageCounts().catch(() => null), mySongs.all().catch(() => []),
    import('../coach.js').then((m) => m.sessionCount()).catch(() => 0),
  ]);
  const langOf = (t) => langIndexOf(t, themes);
  const infoOf = (sid) => catalog.find((x) => x.song_id === sid) || { zh: sid, theme: null };
  const nameOf = (sid) => {
    const r = infoOf(sid);
    return `${r.zh}${r.en ? ' ' + r.en : ''}`;
  };
  const stageLabel = {};
  for (const s of (vocab && vocab.learner_stages) || []) stageLabel[s.key] = s.label;
  const cycle = (vocab && vocab.review_cycle) || [];
  const due = dueRecords(allMy, null, cycle);

  const section = (key, label, rows, extra) => `
    <section class="card sp-sec">
      <div class="section-head"><h2>${label}</h2><span class="chip">${rows.length}</span></div>
      ${rows.length ? rows.map((r) => {
        const info = infoOf(r.song_id);
        return `<a class="homerow" style="margin-bottom:8px" href="#/song/${esc(r.song_id)}">
          <span class="cover cover-md">${coverFor({ song_id: r.song_id, lang: langOf(info.theme) })}</span>
          <span class="homerow-main">
            <span class="homerow-title">${esc(nameOf(r.song_id))}</span><br>
            <span class="homerow-note">${esc(r.song_id)}${extra ? ' ｜ ' + esc(extra(r)) : ''}</span>
          </span>
          <span class="chip">→</span>
        </a>`;
      }).join('')
      : '<div class="state-empty"><span class="glyph">🎶</span><div>还没有记录</div><div class="small">打开一首歌，点「收藏」「我想学」，或完成一次播放 / 教唱 / 分享后，这里会出现。</div></div>'}
    </section>`;

  const count = (k) => (groups[k] || []).length;

  root.innerHTML = `
    <section class="card mine-hero">
      <div class="eyebrow">我的</div>
      <h1 style="font-size:var(--fs-display);color:var(--green);margin:6px 0">我的歌</h1>
      <p class="plain muted" style="max-width:26em;margin:0 auto">慢慢积累出你自己的生命诗歌本。没有积分，没有排行榜 —— 只有真正属于你的歌。</p>
      <div class="mine-stats" aria-label="概览">
        <span class="mine-stat"><b>${count('liked')}</b><span>收藏</span></span>
        <span class="mine-stat"><b>${count('learning')}</b><span>正在学</span></span>
        <span class="mine-stat"><b>${count('taught')}</b><span>教过</span></span>
        <span class="mine-stat"><b>${count('recent')}</b><span>唱过</span></span>
      </div>
    </section>

    <section class="card sp-sec">
      <h2>学习路径状态</h2>
      <p class="plain muted small">这是你的学习路径状态，不是分数、不是排行榜。系统不判通过 / 不通过，也不给徽章。</p>
      <div class="stage-dist">
        ${STAGE_ORDER.map((k) => `<span class="stage-dist-item"><b>${counts ? counts[k] : 0}</b><span>${esc(stageLabel[k] || k)}</span></span>`).join('')}
        <span class="stage-dist-item none"><b>${counts ? counts.none : 0}</b><span>还没开始</span></span>
      </div>
      <div class="due-line">${due.length ? `🕘 有 ${due.length} 首要回来唱了 —— 隔几天再唱一次，比一次练到熟更有用。` : '暂时没有到期的歌。'}</div>
    </section>
    ${GROUPS.map(([key, label]) => {
      const rows = groups[key] || [];
      const extra = key === 'taught' ? ((r) => `教过 ${r.taught_count} 次`)
        : key === 'shared' ? ((r) => `传过 ${r.shared_count} 次`)
        : key === 'learning' ? ((r) => `学唱进度 ${r.learn_step || 1}${r.learn_total ? '/' + r.learn_total : ''}`)
        : key === 'recent' ? ((r) => `最近：${String(r.last_sung_at || '').slice(0, 10)}`)
        : null;
      return section(key, label, rows, extra);
    }).join('')}
    <section class="card sp-sec mine-coach">
      <a class="homerow" href="#/coach">
        <span class="homerow-main">
          <span class="homerow-title">唱得更准</span><br>
          <span class="homerow-note">音准、节奏、视唱与表达练习</span>
        </span>
        <span class="chip">→</span>
      </a>
    </section>

    <details class="card sp-sec song-more mine-more"><summary>更多</summary>
      <div class="notice">生产、审核、曲库管理、校准与系统治理都在后台 —— 普通使用者不需要打开。</div>
      <div class="cards">
        <a class="entry" href="#/production?view=dashboard"><span class="entry-main">
          <span class="entry-title">生产平台</span><span class="entry-note">MODULE 12｜生产总览 / 辨识 / 计划</span></span><span class="chip">→</span></a>
        <a class="entry" href="#/production?view=review"><span class="entry-main">
          <span class="entry-title">人工审核</span><span class="entry-note">审查门与裁决记录</span></span><span class="chip">→</span></a>
        <a class="entry" href="#/library"><span class="entry-main">
          <span class="entry-title">曲库管理</span><span class="entry-note">音乐库搜索（后台视图）</span></span><span class="chip">→</span></a>
        <a class="entry" href="#/production?view=calibration"><span class="entry-main">
          <span class="entry-title">校准与版本</span><span class="entry-note">Calibration Issues / 治理</span></span><span class="chip">→</span></a>
        <a class="entry" href="#/admin"><span class="entry-main">
          <span class="entry-title">系统与内容治理</span><span class="entry-note">后台目录 / 治理结构</span></span><span class="chip">→</span></a>
      </div>
    </details>`;

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-song]');
    if (b) window.location.hash = '#/song/' + b.dataset.song;
  });
}

export default { renderMine };
