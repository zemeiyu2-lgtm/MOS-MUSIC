/* =========================================================
   MOS-MUSIC｜Front Songbook（歌曲 · MOS 生命诗歌本 · V2.1 艺术化）
   ---------------------------------------------------------
   大型卡片 + 小型卡片混合布局：前几首为大卡（大封面 + 快操作），
   其余为紧凑卡（小封面），目录顺序仍 = 候选 ID 序（不打分、不排序）。
   搜索框设计成音乐 App 式圆角大输入（中文 / English / Song ID）。

   铁律（不变）：主题/场景为录入期初分类（provisional_intake_classification），
   不是辨识结论；前台不出现工程术语；快操作全部真实（收藏/进入歌曲页/学唱）。
========================================================= */

import { esc, loadCatalog } from './util.js';
import { getIndex } from '../content-source.js';
import { coverHtml, langIndexOf } from './covers.js';
import * as mySongs from './my-songs.js';

/* 主题 / 处境 / 场景 词表来自内容层四维分类（content/taxonomy/index.json，§34：词表属于内容层，
   程序不得硬编码；词表缺失时退化为只显示「全部」）。 */
const FALLBACK_THEMES = [];
const FALLBACK_SCENES = [];
const FALLBACK_SITUATIONS = [];

const BIG_CARDS = 6;   /* 大卡数量：只取目录最前的几首（位置=ID 序，不是推荐位） */

function cardHtml(r, fav, big, langOf) {
  const en = r.en ? `<div class="song-card-note">${esc(r.en)}</div>` : '';
  const note = `<div class="song-card-note">${esc(r.theme || '')}</div>`;
  const cover = coverHtml({ ...r, lang: langOf(r.theme) }, big ? 'lg' : 'md', {});
  const ops = `<span class="song-card-ops">
    <button type="button" class="icon-op${fav.liked ? ' on' : ''}" data-op="like" data-song="${esc(r.song_id)}"
      aria-label="${fav.liked ? '取消收藏' : '收藏'}${esc(r.zh)}" aria-pressed="${fav.liked ? 'true' : 'false'}">${fav.liked ? '❤️' : '♡'}</button>
    <button type="button" class="icon-op" data-op="sing" data-song="${esc(r.song_id)}" aria-label="现在唱${esc(r.zh)}">▶</button>
    <button type="button" class="icon-op" data-op="learn" data-song="${esc(r.song_id)}" aria-label="学唱${esc(r.zh)}">📚</button>
  </span>`;
  return `<div class="song-card${big ? ' big' : ''}" data-card="${esc(r.song_id)}">
    <button type="button" class="song-open" data-song="${esc(r.song_id)}" style="all:unset;display:flex;align-items:center;gap:var(--sp-3);min-width:0;flex:1;cursor:pointer">
      ${cover}
      <span class="song-card-main">
        <span class="song-card-title">${esc(r.zh)}</span>
        ${en}${note}
      </span>
    </button>
    ${ops}
  </div>`;
}

export async function renderSongbook(root) {
  const [catalog, cand, tax, groups] = await Promise.all([
    loadCatalog(), getIndex('candidates').catch(() => null),
    getIndex('taxonomy').catch(() => null), mySongs.groups(),
  ]);
  const dimVocab = (key) => {
    const d = ((tax && tax.dimensions) || []).find((x) => x.key === key) || null;
    return ((d && d.vocab) || []).map((v) => v.key);
  };
  const THEMES = dimVocab('theme').length ? dimVocab('theme') : ((cand && cand.themes) || FALLBACK_THEMES);
  const SITUATIONS = dimVocab('situation').length ? dimVocab('situation') : FALLBACK_SITUATIONS;
  const SCENES = dimVocab('scene').length ? dimVocab('scene') : ((cand && cand.scenes) || FALLBACK_SCENES);

  root.innerHTML = `
    <section class="card" style="padding:var(--sp-4)">
      <div class="section-head"><h1 style="margin:0;font-size:var(--fs-2);color:var(--green)">生命诗歌本</h1><span class="chip" id="sbCount">${catalog.length} 首</span></div>
      <div class="book-search">
        <span class="icon" aria-hidden="true">🔍</span>
        <input type="search" id="sbSearchInput" placeholder="找一首歌：中文歌名 / 英文名" aria-label="搜索歌曲" autocomplete="off">
        <button class="clear" id="sbClear" type="button" aria-label="清除搜索">✕</button>
      </div>
      <div class="facets" id="sbTabs">
        <button class="facet active" data-tab="all">全部</button>
        <button class="facet" data-tab="liked">❤️ 收藏</button>
        <button class="facet" data-tab="learning">📚 正在学</button>
        <button class="facet" data-tab="recent">🕘 最近唱过</button>
      </div>
      <details class="sb-more">
        <summary>按主题 / 处境 / 场景找歌</summary>
<div class="facets" id="sbThemes">
        <button class="facet active" data-theme="">主题：全部</button>
          ${THEMES.map((t) => `<button class="facet" data-theme="${esc(t)}">${esc(t)}</button>`).join('')}
        </div>
        <div class="facets" id="sbSituations">
        <button class="facet active" data-situation="">处境：全部</button>
          ${SITUATIONS.map((t) => `<button class="facet" data-situation="${esc(t)}">${esc(t)}</button>`).join('')}
        </div>
        <div class="facets" id="sbScenes">
        <button class="facet active" data-scene="">场景：全部</button>
          ${SCENES.map((t) => `<button class="facet" data-scene="${esc(t)}">${esc(t)}</button>`).join('')}
        </div>
      </details>
    </section>
    <section class="card" style="padding:var(--sp-3)">
      <div class="book-cards" id="sbList"></div>
    </section>`;

  const state = { tab: 'all', theme: '', situation: '', scene: '', q: '' };
  /* 封面视觉语言由内容层主题词表顺序决定（§34：主题词属于内容层） */
  const langOf = (t) => langIndexOf(t, THEMES);
  const has = (list, v) => (list || []).includes(v);

  function apply() {
    let rows = catalog;
    if (state.tab === 'liked') rows = rows.filter((r) => favOf(r.song_id).liked);
    if (state.tab === 'learning') rows = rows.filter((r) => favOf(r.song_id).learning);
    if (state.tab === 'recent') rows = rows.filter((r) => recentIds.has(r.song_id));
    /* 多归属：命中集合中任一项即算匹配（不是单选字段） */
    if (state.theme) rows = rows.filter((r) => has(r.themes, state.theme) || r.theme === state.theme);
    if (state.situation) rows = rows.filter((r) => has(r.situations, state.situation));
    if (state.scene) rows = rows.filter((r) => has(r.scenes, state.scene) || r.scene === state.scene);
    const q = state.q.trim().toLowerCase();
    if (q) rows = rows.filter((r) =>
      r.song_id.toLowerCase().includes(q)
      || String(r.zh || '').toLowerCase().includes(q)
      || String(r.en || '').toLowerCase().includes(q));
    const list = root.querySelector('#sbList');
    list.innerHTML = rows.length
      ? rows.map((r, i) => cardHtml(r, favOf(r.song_id), i < BIG_CARDS && !q && state.tab === 'all', langOf)).join('')
      : `<div class="state-empty"><span class="glyph">🎵</span><div>没有匹配的歌曲。</div><div class="small">换一个关键词，或清除筛选再试试。</div></div>`;
    root.querySelector('#sbCount').textContent = `${rows.length} 首`;
  }

  function favOf(sid) {
    return {
      liked: groups.liked.some((x) => x.song_id === sid),
      learning: groups.learning.some((x) => x.song_id === sid),
    };
  }
  const recentIds = new Set(groups.recent.slice(0, 20).map((x) => x.song_id));

  const wireFacets = (sel, key) => {
    const box = root.querySelector(sel);
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-' + key + ']');
      if (!b) return;
      box.querySelectorAll('.facet').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      state[key] = b.dataset[key === 'tab' ? 'tab' : key];
      apply();
    });
  };
  wireFacets('#sbTabs', 'tab');
  wireFacets('#sbThemes', 'theme');
  wireFacets('#sbSituations', 'situation');
  wireFacets('#sbScenes', 'scene');

  const input = root.querySelector('#sbSearchInput');
  input.addEventListener('input', () => { state.q = input.value; apply(); });
  root.querySelector('#sbClear').addEventListener('click', () => { input.value = ''; state.q = ''; apply(); input.focus(); });

  /* 卡片点击（进入歌曲页）与快操作（收藏/唱/学）— 事件委托 */
  root.querySelector('#sbList').addEventListener('click', async (e) => {
    const op = e.target.closest('[data-op]');
    if (op) {
      e.stopPropagation();
      const sid = op.dataset.song;
      if (op.dataset.op === 'like') {
        const r = await mySongs.toggleLike(sid).catch(() => null);
        if (r) { groups.liked = groups.liked.filter((x) => x.song_id !== sid); if (r.liked) groups.liked.push({ song_id: sid }); apply(); }
      } else if (op.dataset.op === 'sing') {
        window.location.hash = '#/song/' + sid + '?focus=sing';
      } else {
        window.location.hash = '#/learn/' + sid;
      }
      return;
    }
    const open = e.target.closest('[data-song]');
    if (open && open.tagName === 'BUTTON') window.location.hash = '#/song/' + open.dataset.song;
  });

  apply();
}

export default { renderSongbook };
