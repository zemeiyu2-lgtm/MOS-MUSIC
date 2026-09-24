/* =========================================================
   MOS-MUSIC｜Front Home（首页 · 今天一起唱 · V3.0）
   ---------------------------------------------------------
   第一屏是一个音乐产品，不是菜单：
     · 大型 Hero Card：系列艺术封面 + 歌名（中/英）+ ▶现在唱 + ♡收藏 + 学唱；
     · 快速操作：听一遍 / 看简谱 / 陪我唱；
     · 该回来唱了（间隔复习 Day 0 / 2 / 7 到期的歌）；
     · 继续唱（正在学）／ 生命诗歌本入口。

   V3.0 变化（用户要求「淡化与 52 周经文和课程的关联」）：
     精选池改为**曲库已收录歌曲**（详情层，即已有研究档案的歌），
     按自然日确定性轮换 —— 首页不再引用任何周次 / 课程。
     「懂 / 活」来自**歌曲自身单元**（content/song-units/**），
     不是某一周的门训单元。轮换只是展示顺序，不构成算法推荐。
========================================================= */

import { esc, loadCatalog, loadThemes, loadUnitVocab, loadUnit } from './util.js';
import { coverFor, langIndexOf } from './covers.js';
import { dueRecords } from './review.js';
import * as mySongs from './my-songs.js';

const REASONS = [
  '今天不需要唱很多，先把这一句唱进心里。',
  '唱歌，也可以是一种安静的倾诉。',
  '先听一遍，再轻声跟一句，就已经开始了。',
  '一首短歌，也可以撑起一整天的力量。',
  '唱给身边的人听，是最好的分享方式。',
  '今天只学一句，也是真实的进步。',
  '旋律会替你记得，心里也会。',
];

function dayIndex(len) {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const day = Math.floor((now - start) / 86400000);
  return len ? day % len : 0;
}

export async function renderHome(root) {
  const [catalog, groups, themes, vocab, allMy] = await Promise.all([
    loadCatalog(), mySongs.groups().catch(() => ({})), loadThemes(),
    loadUnitVocab(), mySongs.all().catch(() => []),
  ]);
  const langOf = (t) => langIndexOf(t, themes);

  /* 精选池：已收录研究档案的歌（详情层），按 ID 序稳定，按自然日确定性轮换。 */
  const pool = catalog.filter((r) => r.layer === 'detail');
  const pick = pool.length ? pool[dayIndex(pool.length)] : (catalog[0] || null);
  const sid = pick ? pick.song_id : null;
  const title = pick ? pick.zh : '生命诗歌';
  const en = pick && pick.en ? pick.en : '';
  const theme = pick && pick.theme ? pick.theme : '';
  const reason = REASONS[dayIndex(REASONS.length)];
  const heroMy = sid ? await mySongs.get(sid).catch(() => ({})) : {};
  const unit = sid ? await loadUnit(sid).catch(() => null) : null;
  const cu = (unit && unit.content_understanding) || {};
  const txt = (t) => (t && t.text ? t.text : null);
  const bibleRows = (cu.bible_basis || []).filter((b) => b && b.reference);
  const life = (unit && unit.life_practice) || {};
  const lifeItems = (life.items || []).filter((i) => i && i.text);

  /* 该回来唱了（间隔复习到期；只提示，不催迫）。 */
  const cycle = (vocab && vocab.review_cycle) || [];
  const due = dueRecords(allMy, null, cycle).slice(0, 3);
  const nameOf = (id) => { const r = catalog.find((x) => x.song_id === id); return r ? r.zh : id; };

  const continueRow = (groups.learning || [])[0] || null;
  const contName = continueRow ? nameOf(continueRow.song_id) : null;

  const heroCover = pick
    ? `<span class="cover cover-hero float">${coverFor({ song_id: pick.song_id, lang: langOf(pick.theme) })}</span>`
    : `<span class="cover cover-hero float">${coverFor({ song_id: 'mos-heart', lang: 0 })}</span>`;

  root.innerHTML = `
  <div class="home-grid">
  <div>
    <section class="card home-hero">
      <div class="eyebrow">今天</div>
      <h1>今天一起唱</h1>
      <p class="hero-lede">${pick
        ? '从生命诗歌本里按天轮换一首 —— 只是展示顺序，不是算法推荐。'
        : '诗歌本还没有可展示的歌曲。'}</p>
      <div class="hero-id">
        ${heroCover}
        <div class="hero-id-info">
          <h2 class="hero-title">${esc(title)}</h2>
          ${en ? `<div class="hero-en">${esc(en)}</div>` : ''}
          ${theme ? `<div class="chip gold" style="margin-top:8px">${esc(theme)}</div>` : ''}
        </div>
      </div>
      <div class="hero-actions">
        ${sid ? `<a class="btn primary big" href="#/song/${esc(sid)}?focus=sing">▶ 现在就唱</a>` : ''}
        <button class="btn ghost big" id="heroLike" aria-pressed="${heroMy.liked ? 'true' : 'false'}">${heroMy.liked ? '❤️ 已收藏' : '♡ 收藏'}</button>
        ${sid ? `<a class="btn secondary big" href="#/learn/${esc(sid)}">📚 一键学唱</a>` : ''}
      </div>
      ${sid ? `
      <div class="hero-quick" aria-label="快速操作">
        <a class="quick" href="#/song/${esc(sid)}?focus=sing"><span>🎧</span><span>听一遍</span></a>
        <a class="quick" href="#/song/${esc(sid)}?focus=score"><span>🎼</span><span>看简谱</span></a>
        <a class="quick" href="#/learn/${esc(sid)}"><span>🎤</span><span>陪我唱</span></a>
      </div>` : ''}
      <div class="reason" aria-label="今天的一个小提示">${esc(reason)}</div>
    </section>

    <div class="btn-row" style="margin-top:var(--sp-2)">
      <a class="homerow" href="#/songs">
        <span class="cover cover-md">${coverFor({ song_id: 'mos-book', lang: 12 })}</span>
        <span class="homerow-main">
          <span class="homerow-title">生命诗歌本</span><br>
          <span class="homerow-note">打开全部歌曲（100 首）</span>
        </span>
        <span class="chip">→</span>
      </a>
      <a class="homerow" href="#/coach">
        <span class="cover cover-md">${coverFor({ song_id: 'mos-voice', lang: 3 })}</span>
        <span class="homerow-main">
          <span class="homerow-title">MOS Singing Coach</span><br>
          <span class="homerow-note">练音准 · 节奏 · 视唱（独立模块，不显示门训数据）</span>
        </span>
        <span class="chip">→</span>
      </a>
    </div>
  </div>

  <div>
    ${due.length ? `
    <section class="card sp-sec">
      <div class="section-head"><h2><span class="sp-num">唱</span>该回来唱了</h2><span class="chip">${due.length}</span></div>
      <p class="plain muted small">隔几天再唱一次，比一次练到熟更有用。只是提醒，不催不迫。</p>
      ${due.map((d) => `<a class="homerow" style="margin-bottom:8px" href="#/song/${esc(d.song_id)}">
        <span class="cover cover-md">${coverFor({ song_id: d.song_id, lang: langOf((catalog.find((x) => x.song_id === d.song_id) || {}).theme) })}</span>
        <span class="homerow-main">
          <span class="homerow-title">${esc(nameOf(d.song_id))}</span><br>
          <span class="homerow-note">${esc(String(d.next_due_at || '').slice(0, 10))}</span>
        </span>
        <span class="chip">→</span>
      </a>`).join('')}
    </section>` : ''}

    <section class="card sp-sec">
      <h2><span class="sp-num">懂</span>这首歌在唱什么</h2>
      ${pick ? `<p class="plain">${esc(txt(cu.what_it_sings) || txt(cu.core_truth) || `这首歌围绕「${theme || '生命诗歌'}」。`)}</p>
        ${bibleRows.length ? `<div class="bible-row">${bibleRows.map((b) => `<span class="chip gold">${esc(b.reference)}</span>`).join('')}</div>` : ''}
        <p class="plain muted small">来自歌曲自身的内容层 —— 不绑定某一周 / 某一课。</p>`
        : '<p class="plain muted">暂无可展示的歌曲。</p>'}
    </section>

    <section class="card sp-sec">
      <h2><span class="sp-num">活</span>今天怎样活</h2>
      ${lifeItems.length ? `<ul class="plain life-list">${lifeItems.map((i) => `<li>${esc(i.text)}</li>`).join('')}</ul>`
        : `<p class="plain">唱完以后，从歌词里挑一句，今天照着做一次。更具体的生命回应会随单元内容提供。</p>`}
    </section>

    <section class="card sp-sec">
      <h2><span class="sp-num">学</span>继续唱</h2>
      ${contName ? `
      <a class="homerow" href="#/learn/${esc(continueRow.song_id)}">
        <span class="cover cover-md">${coverFor({ song_id: continueRow.song_id, lang: langOf((catalog.find((x) => x.song_id === continueRow.song_id) || {}).theme) })}</span>
        <span class="homerow-main">
          <span class="homerow-title">${esc(contName)}</span><br>
          <span class="homerow-note">正在学 · 进度 ${esc(String(continueRow.learn_step || 1))}${continueRow.learn_total ? '/' + esc(String(continueRow.learn_total)) : ''}</span>
        </span>
        <span class="chip">→</span>
      </a>` : `
      <a class="homerow" href="${sid ? `#/learn/${esc(sid)}` : '#/songs'}">
        <span class="cover cover-md">${coverFor({ song_id: 'mos-first', lang: 1 })}</span>
        <span class="homerow-main">
          <span class="homerow-title">今天只学一节</span><br>
          <span class="homerow-note">每天唱一点，不给自己压力</span>
        </span>
        <span class="chip">→</span>
      </a>`}
    </section>

    <section class="card sp-sec">
      <h2><span class="sp-num">我</span>我的歌</h2>
      ${(groups.recent || []).slice(0, 3).length ? (groups.recent || []).slice(0, 3).map((r) => {
        const info = catalog.find((x) => x.song_id === r.song_id) || { zh: r.song_id, theme: null };
        return `<a class="homerow" style="margin-bottom:8px" href="#/song/${esc(r.song_id)}">
          <span class="cover cover-md">${coverFor({ song_id: r.song_id, lang: langOf(info.theme) })}</span>
          <span class="homerow-main">
            <span class="homerow-title">${esc(info.zh)}</span><br>
            <span class="homerow-note">${esc(String(r.last_sung_at || '').slice(0, 10))}</span>
          </span>
          <span class="chip">→</span>
        </a>`;
      }).join('') : `
      <a class="homerow" href="#/mine">
        <span class="homerow-main">
          <span class="homerow-title">还没有记录</span><br>
          <span class="homerow-note">唱一次、收藏一首，这里就会出现你的歌</span>
        </span>
        <span class="chip">→</span>
      </a>`}
    </section>
  </div>
  </div>`;

  /* Hero 收藏：真实保存（IndexedDB），带心形反馈 */
  const likeBtn = root.querySelector('#heroLike');
  if (likeBtn && sid) {
    likeBtn.addEventListener('click', async () => {
      const r = await mySongs.toggleLike(sid).catch(() => null);
      if (!r) return;
      likeBtn.textContent = r.liked ? '❤️ 已收藏' : '♡ 收藏';
      likeBtn.setAttribute('aria-pressed', r.liked ? 'true' : 'false');
      likeBtn.classList.remove('heart-pop');
      if (r.liked) { void likeBtn.offsetWidth; likeBtn.classList.add('heart-pop'); }
    });
  }
}

export default { renderHome };
