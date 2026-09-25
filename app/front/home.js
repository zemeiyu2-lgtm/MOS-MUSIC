/* =========================================================
   MOS-MUSIC｜Front Home（首页 · 减法版 V3.1）
   ---------------------------------------------------------
   首页只解决三件事：找到歌 · 现在唱 · 继续学。
   不做仪表盘：不放统计 / 资源状态 / 课程 / 周次 / 工程信息。
   打开首页的第一感觉：「这里有歌可以唱。」
========================================================= */

import { esc, loadCatalog, loadThemes } from './util.js';
import { coverFor, langIndexOf } from './covers.js';
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
  const [catalog, themes, groups, allMy] = await Promise.all([
    loadCatalog(), loadThemes(),
    mySongs.groups().catch(() => ({})), mySongs.all().catch(() => []),
  ]);
  const langOf = (t) => langIndexOf(t, themes);

  /* 精选：已收录歌曲按自然日确定性轮换（只是展示顺序，不是算法推荐）。 */
  const pool = catalog.filter((r) => r.layer === 'detail');
  const pick = pool.length ? pool[dayIndex(pool.length)] : (catalog[0] || null);
  const sid = pick ? pick.song_id : null;
  const title = pick ? pick.zh : '生命诗歌';
  const en = pick && pick.en ? pick.en : '';
  const theme = pick && pick.theme ? pick.theme : '';
  const reason = REASONS[dayIndex(REASONS.length)];
  const heroMy = sid ? await mySongs.get(sid).catch(() => ({})) : {};

  const nameOf = (id) => { const r = catalog.find((x) => x.song_id === id); return r ? r.zh : id; };
  const continueRow = (groups.learning || [])[0] || null;

  const heroCover = pick
    ? `<span class="cover cover-hero float">${coverFor({ song_id: pick.song_id, lang: langOf(pick.theme) })}</span>`
    : `<span class="cover cover-hero float">${coverFor({ song_id: 'mos-heart', lang: 0 })}</span>`;

  const rowHtml = (r, note, href) => `
    <a class="homerow" href="${href}">
      <span class="cover cover-md">${coverFor({ song_id: r.song_id, lang: langOf((catalog.find((x) => x.song_id === r.song_id) || {}).theme) })}</span>
      <span class="homerow-main">
        <span class="homerow-title">${esc(nameOf(r.song_id))}</span><br>
        <span class="homerow-note">${esc(note)}</span>
      </span>
      <span class="chip">→</span>
    </a>`;

  const recentRows = (groups.recent || []).slice(0, 3);
  const likedRows = (groups.liked || []).slice(0, 3);

  root.innerHTML = `
  <div class="home-grid">
  <div>
    <section class="card home-hero">
      <div class="eyebrow">今天</div>
      <h1>现在唱</h1>
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
        ${sid ? `<a class="btn secondary big" href="#/learn/${esc(sid)}">🎤 学唱</a>` : ''}
      </div>
      <div class="reason" aria-label="今天的一个小提示">${esc(reason)}</div>
    </section>

    <a class="homerow" href="#/songs" style="margin-top:var(--sp-2)">
      <span class="cover cover-md">${coverFor({ song_id: 'mos-book', lang: 12 })}</span>
      <span class="homerow-main">
        <span class="homerow-title">找一首歌</span><br>
        <span class="homerow-note">打开诗歌本 · 搜索全部歌曲</span>
      </span>
      <span class="chip">→</span>
    </a>
  </div>

  <div class="home-rows">
    <section class="card sp-sec">
      <h2>继续学</h2>
      ${continueRow ? rowHtml(continueRow,
          `正在学 · 进度 ${esc(String(continueRow.learn_step || 1))}${continueRow.learn_total ? '/' + esc(String(continueRow.learn_total)) : ''}`,
          `#/learn/${esc(continueRow.song_id)}`)
        : `<a class="homerow" href="${sid ? `#/learn/${esc(sid)}` : '#/songs'}">
          <span class="cover cover-md">${coverFor({ song_id: 'mos-first', lang: 1 })}</span>
          <span class="homerow-main">
            <span class="homerow-title">今天只学一句</span><br>
            <span class="homerow-note">每天唱一点，不给自己压力</span>
          </span>
          <span class="chip">→</span>
        </a>`}
    </section>

    ${recentRows.length ? `
    <section class="card sp-sec">
      <h2>最近唱过</h2>
      ${recentRows.map((r) => rowHtml(r, esc(String(r.last_sung_at || '').slice(0, 10)), `#/song/${esc(r.song_id)}`)).join('')}
    </section>` : ''}

    ${likedRows.length ? `
    <section class="card sp-sec">
      <h2>我的收藏</h2>
      ${likedRows.map((r) => rowHtml(r, '收藏', `#/song/${esc(r.song_id)}`)).join('')}
    </section>` : ''}
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
