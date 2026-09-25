/* MOS-MUSIC｜Front Home V1.0：找歌 / 现在唱 / 继续学 */ 

import { esc, loadCatalog } from './util.js';
import { coverFor } from './covers.js';
import * as mySongs from './my-songs.js';

export async function renderHome(root) {
  const [catalog, groups] = await Promise.all([
    loadCatalog(),
    mySongs.groups().catch(() => ({})),
  ]);

  const detail = catalog.filter((r) => r.layer === 'detail');
  const pick = detail[0] || catalog[0] || null;
  const sid = pick ? pick.song_id : null;
  const heroMy = sid ? await mySongs.get(sid).catch(() => ({})) : {};
  const continueRows = (groups.learning || []).slice(0, 3);
  const recentRows = (groups.recent || []).slice(0, 4);
  const findName = (id) => {
    const r = catalog.find((x) => x.song_id === id);
    return r ? r.zh : id;
  };

  root.innerHTML = `
    <div class="music-home">
      <section class="music-home-hero">
        <div class="music-home-copy">
          <div class="eyebrow">今天想唱什么？</div>
          <h1>让经典，今天继续被唱。</h1>
          <p>听一首歌，看一页谱，学会一句，再把整首唱起来。</p>
          <a class="btn primary big" href="#/songs">进入诗歌本</a>
        </div>
        <div class="music-home-cover" aria-hidden="true">
          ${pick ? coverFor({ song_id: pick.song_id, lang: 0 }) : coverFor({ song_id: 'mos-heart', lang: 0 })}
        </div>
      </section>

      ${sid ? `
      <section class="music-home-section">
        <div class="music-section-head">
          <div>
            <div class="eyebrow">现在唱</div>
            <h2>${esc(pick.zh)}</h2>
          </div>
          <button class="icon-op hero-like${heroMy.liked ? ' on' : ''}" id="heroLike" aria-label="${heroMy.liked ? '取消收藏' : '收藏'}" aria-pressed="${heroMy.liked ? 'true' : 'false'}">${heroMy.liked ? '♥' : '♡'}</button>
        </div>
        <div class="music-home-actions">
          <a class="btn primary big" href="#/song/${esc(sid)}?focus=sing">▶ 播放</a>
          <a class="btn ghost big" href="#/song/${esc(sid)}?focus=score">看谱</a>
          <a class="btn ghost big" href="#/learn/${esc(sid)}">学这首</a>
        </div>
      </section>` : ''}

      ${continueRows.length ? `
      <section class="music-home-section">
        <div class="music-section-head"><div><div class="eyebrow">继续学</div><h2>正在学的歌</h2></div></div>
        <div class="music-home-list">
          ${continueRows.map((r) => `
            <a class="music-list-row" href="#/learn/${esc(r.song_id)}">
              <span class="cover cover-sm">${coverFor({ song_id: r.song_id, lang: 0 })}</span>
              <span class="music-list-main"><strong>${esc(findName(r.song_id))}</strong><small>继续学</small></span>
              <span class="music-list-arrow">→</span>
            </a>`).join('')}
        </div>
      </section>` : ''}

      ${recentRows.length ? `
      <section class="music-home-section">
        <div class="music-section-head"><div><div class="eyebrow">最近</div><h2>最近唱过</h2></div></div>
        <div class="music-home-list">
          ${recentRows.map((r) => `
            <a class="music-list-row" href="#/song/${esc(r.song_id)}">
              <span class="cover cover-sm">${coverFor({ song_id: r.song_id, lang: 0 })}</span>
              <span class="music-list-main"><strong>${esc(findName(r.song_id))}</strong><small>再唱一次</small></span>
              <span class="music-list-arrow">→</span>
            </a>`).join('')}
        </div>
      </section>` : ''}

      <section class="music-home-minimal">
        <a href="#/songs">浏览全部诗歌本</a>
      </section>
    </div>`;

  const likeBtn = root.querySelector('#heroLike');
  if (likeBtn && sid) {
    likeBtn.addEventListener('click', async () => {
      const res = await mySongs.toggleLike(sid).catch(() => null);
      if (!res) return;
      likeBtn.textContent = res.liked ? '♥' : '♡';
      likeBtn.classList.toggle('on', !!res.liked);
      likeBtn.setAttribute('aria-pressed', res.liked ? 'true' : 'false');
    });
  }
}

export default { renderHome };
