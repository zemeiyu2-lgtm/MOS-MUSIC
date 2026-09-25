/* MOS-MUSIC｜Front Songbook V1.0：以歌曲为中心 */ 

import { esc, loadCatalog } from './util.js';
import { getIndex } from '../content-source.js';
import { coverHtml } from './covers.js';
import * as mySongs from './my-songs.js';

const FALLBACK = [];

function cardHtml(r, fav) {
  return `
    <article class="music-song-card">
      <button type="button" class="music-song-open" data-song="${esc(r.song_id)}" aria-label="打开${esc(r.zh)}">
        <span class="cover cover-lg">${coverHtml({ ...r, lang: 0 }, 'lg', {})}</span>
        <span class="music-song-copy">
          <strong>${esc(r.zh || '未命名歌曲')}</strong>
          ${r.theme ? `<small>${esc(r.theme)}</small>` : ''}
        </span>
      </button>
      <div class="music-song-actions">
        <button type="button" class="icon-op${fav.liked ? ' on' : ''}" data-op="like" data-song="${esc(r.song_id)}" aria-label="${fav.liked ? '取消收藏' : '收藏'}">${fav.liked ? '♥' : '♡'}</button>
        <button type="button" class="icon-op" data-op="play" data-song="${esc(r.song_id)}" aria-label="播放">▶</button>
      </div>
    </article>`;
}

export async function renderSongbook(root, params = {}) {
  const [catalog, tax, groups] = await Promise.all([
    loadCatalog(),
    getIndex('taxonomy').catch(() => null),
    mySongs.groups(),
  ]);

  const dimVocab = (key) => {
    const d = ((tax && tax.dimensions) || []).find((x) => x.key === key) || null;
    return ((d && d.vocab) || []).map((v) => v.key);
  };
  const themes = dimVocab('theme').length ? dimVocab('theme') : FALLBACK;
  const situations = dimVocab('situation').length ? dimVocab('situation') : FALLBACK;
  const scenes = dimVocab('scene').length ? dimVocab('scene') : FALLBACK;

  let initialTab = 'all';
  try {
    const q = new URLSearchParams(String(window.location.hash).split('?')[1] || '');
    if (['all', 'liked', 'learning', 'recent'].includes(q.get('tab'))) initialTab = q.get('tab');
  } catch (_) {}

  const state = { tab: initialTab, theme: '', situation: '', scene: '', q: '' };
  const recentIds = new Set((groups.recent || []).slice(0, 30).map((x) => x.song_id));

  root.innerHTML = `
    <div class="music-page-head">
      <div>
        <div class="eyebrow">诗歌本</div>
        <h1>想唱哪一首？</h1>
      </div>
      <span class="music-count" id="sbCount">${catalog.length} 首</span>
    </div>

    <div class="music-search">
      <span aria-hidden="true">⌕</span>
      <input type="search" id="sbSearch" placeholder="搜索中文歌名" aria-label="搜索歌曲" autocomplete="off">
      <button class="clear" id="sbClear" type="button" aria-label="清除搜索">×</button>
    </div>

    <div class="music-tabs" id="sbTabs" aria-label="歌曲筛选">
      <button class="music-tab" data-tab="all">全部</button>
      <button class="music-tab" data-tab="liked">收藏</button>
      <button class="music-tab" data-tab="learning">学习中</button>
      <button class="music-tab" data-tab="recent">最近唱过</button>
    </div>

    <details class="music-filters">
      <summary>筛选歌</summary>
      <div class="music-filter-group">
        <span>主题</span>
        <div class="music-filter-row">
          <button class="music-filter active" data-theme="">全部</button>
          ${themes.map((t) => `<button class="music-filter" data-theme="${esc(t)}">${esc(t)}</button>`).join('')}
        </div>
      </div>
      <div class="music-filter-group">
        <span>处境</span>
        <div class="music-filter-row">
          <button class="music-filter active" data-situation="">全部</button>
          ${situations.map((t) => `<button class="music-filter" data-situation="${esc(t)}">${esc(t)}</button>`).join('')}
        </div>
      </div>
      <div class="music-filter-group">
        <span>场景</span>
        <div class="music-filter-row">
          <button class="music-filter active" data-scene="">全部</button>
          ${scenes.map((t) => `<button class="music-filter" data-scene="${esc(t)}">${esc(t)}</button>`).join('')}
        </div>
      </div>
    </details>

    <section class="music-song-grid" id="sbList"></section>`;

  const list = root.querySelector('#sbList');
  const count = root.querySelector('#sbCount');

  const favOf = (sid) => ({
    liked: (groups.liked || []).some((x) => x.song_id === sid),
    learning: (groups.learning || []).some((x) => x.song_id === sid),
  });

  function apply() {
    let rows = catalog;
    if (state.tab === 'liked') rows = rows.filter((r) => favOf(r.song_id).liked);
    if (state.tab === 'learning') rows = rows.filter((r) => favOf(r.song_id).learning);
    if (state.tab === 'recent') rows = rows.filter((r) => recentIds.has(r.song_id));
    if (state.theme) rows = rows.filter((r) => (r.themes || []).includes(state.theme) || r.theme === state.theme);
    if (state.situation) rows = rows.filter((r) => (r.situations || []).includes(state.situation));
    if (state.scene) rows = rows.filter((r) => (r.scenes || []).includes(state.scene) || r.scene === state.scene);

    const q = state.q.trim().toLowerCase();
    if (q) rows = rows.filter((r) =>
      String(r.zh || '').toLowerCase().includes(q) ||
      String(r.song_id || '').toLowerCase().includes(q));

    list.innerHTML = rows.length
      ? rows.map((r) => cardHtml(r, favOf(r.song_id))).join('')
      : `<div class="music-empty">没有找到这首歌。<a href="#/songs">换个搜索</a></div>`;

    count.textContent = `${rows.length} 首`;
    root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  }

  const input = root.querySelector('#sbSearch');
  input.addEventListener('input', () => { state.q = input.value; apply(); });
  root.querySelector('#sbClear').addEventListener('click', () => { input.value = ''; state.q = ''; apply(); input.focus(); });

  root.querySelector('#sbTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    state.tab = b.dataset.tab;
    apply();
  });

  for (const [selector, key] of [['[data-theme]','theme'],['[data-situation]','situation'],['[data-scene]','scene']]) {
    const box = root.querySelector('.music-filters');
    box.addEventListener('click', (e) => {
      const b = e.target.closest(selector);
      if (!b) return;
      box.querySelectorAll(`[data-${key}]`).forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      state[key] = b.dataset[key];
      apply();
    });
  }

  list.addEventListener('click', async (e) => {
    const op = e.target.closest('[data-op]');
    if (op) {
      e.stopPropagation();
      const sid = op.dataset.song;
      if (op.dataset.op === 'like') {
        const res = await mySongs.toggleLike(sid).catch(() => null);
        if (res) apply();
      } else if (op.dataset.op === 'play') {
        window.location.hash = '#/song/' + sid + '?focus=sing';
      }
      return;
    }
    const open = e.target.closest('[data-song]');
    if (open) window.location.hash = '#/song/' + open.dataset.song;
  });

  apply();
}

export default { renderSongbook };
