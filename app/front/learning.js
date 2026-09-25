/* =========================================================
   MOS-MUSIC｜Front Learning（侧栏一级入口 · 学习）
   ---------------------------------------------------------
   复用现有 mySongs 数据与 #/learn/:id 引擎，不新建第二套学习系统。
   只展示「正在学」的歌；没有则给简洁空状态，引导到诗歌本。
========================================================= */

import { esc, loadCatalog } from './util.js';
import { coverFor, langIndexOf, coverHtml } from './covers.js';
import * as mySongs from './my-songs.js';
import { loadThemes } from './util.js';

export async function renderLearning(root) {
  const [catalog, themes, groups] = await Promise.all([
    loadCatalog(), loadThemes(), mySongs.groups().catch(() => ({})),
  ]);
  const langOf = (t) => langIndexOf(t, themes);
  const rows = groups.learning || [];

  root.innerHTML = `
    <section class="card" style="padding:var(--sp-4)">
      <h1 style="margin:0;font-size:var(--fs-2);color:var(--green)">学习</h1>
      <p class="plain muted" style="margin:var(--sp-2) 0 0">正在学的歌都会在这里 —— 一句一句来，不着急。</p>
    </section>
    <section class="card" style="padding:var(--sp-3)">
      ${rows.length ? rows.map((r) => {
        const info = catalog.find((x) => x.song_id === r.song_id) || { zh: r.song_id, theme: null, en: '' };
        return `<div class="song-card">
          <a class="song-open" href="#/learn/${esc(r.song_id)}" style="all:unset;display:flex;align-items:center;gap:var(--sp-3);min-width:0;flex:1;cursor:pointer">
            ${coverHtml({ ...info, lang: langOf(info.theme) }, 'md', {})}
            <span class="song-card-main">
              <span class="song-card-title">${esc(info.zh)}</span>
              <span class="song-card-note">正在学 · 进度 ${esc(String(r.learn_step || 1))}${r.learn_total ? '/' + esc(String(r.learn_total)) : ''}</span>
            </span>
          </a>
          <span class="song-card-ops"><a class="icon-op" href="#/song/${esc(r.song_id)}" aria-label="查看${esc(info.zh)}">→</a></span>
        </div>`;
      }).join('') : `
      <div class="state-empty"><span class="glyph">🎤</span>
        <div>还没有正在学的歌。</div>
        <div class="small">去诗歌本挑一首喜欢的，点「学唱」就开始了。</div>
        <a class="btn primary" style="margin-top:var(--sp-3)" href="#/songs">打开诗歌本</a>
      </div>`}
    </section>`;
}

export default { renderLearning };
