/* =========================================================
   MOS-MUSIC｜Application Shell
   ---------------------------------------------------------
   职责：注册 Service Worker、装配路由与导航、事件委托、安装提示、
        离线提示、字号偏好（存 IndexedDB，不用 localStorage）。
   规格书 §29 Mobile First：单手可操作、按钮足够大、断网后不突然失效。
========================================================= */

import { createRouter, buildHash, DEFAULT_ROUTE } from './router.js';
import { MODULES, NAV_KEYS, RENDERERS, renderModule } from './modules.js';
import { NET, initNet, onNetChange } from './net.js';
import { initBackgroundSync, sync, REMOTE } from './sync.js';
import { ensureSeeded, seedStatus } from './content-source.js';
import * as store from './store.js';

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

let router = null;
let swReg = null;

/* ---------------------------------------------------------------- 导航 */

function renderNav(activeKey) {
  const nav = $('#nav');
  if (!nav) return;
  nav.innerHTML = NAV_KEYS.map((k) => {
    const m = MODULES.find((x) => x.key === k);
    const on = k === activeKey ? ' active' : '';
    return `<button class="nav-btn${on}" data-go="${k}" aria-current="${k === activeKey ? 'page' : 'false'}">
      <span aria-hidden="true">${m.nav[1]}</span>${m.nav[0]}
    </button>`;
  }).join('');
}

/* ---------------------------------------------------------------- 状态条 */

function setNetBadge() {
  const el = $('#netBadge');
  if (!el) return;
  if (NET.status === 'online') { el.className = 'chip good'; el.textContent = '在线'; }
  else if (NET.status === 'offline') { el.className = 'chip warn'; el.textContent = '离线'; }
  else { el.className = 'chip'; el.textContent = '网络未探测'; }
}

async function refreshOutboxBadge() {
  const el = $('#outboxBadge');
  if (!el) return;
  let n = 0;
  try { n = await store.outboxCount(); } catch (_) { n = 0; }
  el.textContent = n > 0 ? `待同步 ${n}` : '已同步';
  el.className = n > 0 ? 'chip warn' : 'chip good';
}

/* ---------------------------------------------------------------- 偏好 */

async function applyTextPref() {
  try {
    const row = await store.get('user_prefs', 'text_size');
    const v = (row && row.value) || 'normal';
    document.documentElement.setAttribute('data-text', v);
    return v;
  } catch (_) { return 'normal'; }
}

async function toggleTextPref() {
  const cur = document.documentElement.getAttribute('data-text') || 'normal';
  const next = cur === 'large' ? 'normal' : 'large';
  document.documentElement.setAttribute('data-text', next);
  try {
    await store.putUserRecord('user_prefs', { key: 'text_size', kind: 'ui', value: next });
    await refreshOutboxBadge();
  } catch (err) { console.warn('[mos-music] 保存字号偏好失败', err); }
  return next;
}

/* 深夜沉浸模式（V2.1）：偏好存 IndexedDB user_prefs（不使用 localStorage） */
async function applyMoodPref() {
  try {
    const row = await store.get('user_prefs', 'mood');
    if (row && row.value === 'night') document.documentElement.setAttribute('data-mood', 'night');
    return (row && row.value) || 'day';
  } catch (_) { return 'day'; }
}

async function toggleMoodPref() {
  const cur = document.documentElement.getAttribute('data-mood') === 'night';
  const next = cur ? 'day' : 'night';
  if (next === 'night') document.documentElement.setAttribute('data-mood', 'night');
  else document.documentElement.removeAttribute('data-mood');
  const btn = document.getElementById('moodBtn');
  if (btn) {
    btn.setAttribute('aria-pressed', next === 'night' ? 'true' : 'false');
    btn.textContent = next === 'night' ? '☀' : '☾';
  }
  try {
    await store.putUserRecord('user_prefs', { key: 'mood', kind: 'ui', value: next });
  } catch (err) { console.warn('[mos-music] 保存深夜模式偏好失败', err); }
  return next;
}

/* ---------------------------------------------------------------- 路由 */

async function onRoute(route) {
  const root = $('#view');
  if (!root) return;
  renderNav(route.key);

  // 已选单元在七步法与 24 课之间跨模块保留
  const params = { ...route.query };
  if (route.param) params.course = route.param;
  if (route.key === 'steps' && !params.course) {
    params.course = sessionStorageCourse() || null;
  }
  if (['song', 'learn', 'teach', 'song-detail'].includes(route.key)) params.songId = route.param;
  if (route.key === 'week') params.weekId = route.param;
  await renderModule(route.key, root, params);
  wireInternalLinks(root, route);
  window.scrollTo(0, 0);
  $('#mainTitle').textContent = (MODULES.find((m) => m.key === route.key) || {}).title || 'MOS-MUSIC';
}

function sessionStorageCourse() {
  try { return sessionStorage.getItem('mos_music_course'); } catch (_) { return null; }
}
function rememberCourse(cid) {
  try { sessionStorage.setItem('mos_music_course', cid); } catch (_) { /* 隐私模式下忽略 */ }
}

function wireInternalLinks(root, route) {
  $$('[data-go]', root).forEach((el) => {
    el.addEventListener('click', () => router.go(el.dataset.go));
  });
  $$('[data-course]', root).forEach((el) => {
    el.addEventListener('click', () => {
      const cid = el.dataset.course;
      rememberCourse(cid);
      router.go('steps', null, { course: cid, step: 1 });
    });
  });
  $$('[data-step]', root).forEach((el) => {
    el.addEventListener('click', () => {
      router.go('steps', null, { course: route.query.course || sessionStorageCourse(), step: el.dataset.step });
    });
  });
  $$('[data-training]', root).forEach((el) => {
    el.addEventListener('click', () => {
      // Phase 1 只显示空壳说明，不跳转到不存在的页面
      el.setAttribute('aria-disabled', 'true');
      const note = document.createElement('div');
      note.className = 'notice';
      note.textContent = `${el.dataset.training} 的课时与 outcome 属 Phase 4 范围，当前为空壳。`;
      el.parentElement.appendChild(note);
    });
  });
}

/* ---------------------------------------------------------------- Service Worker */

async function registerSW() {
  if (!('serviceWorker' in navigator)) {
    console.warn('[mos-music] 浏览器不支持 Service Worker，离线能力不可用。');
    return;
  }
  if (location.protocol === 'file:') {
    console.warn('[mos-music] file:// 下不注册 Service Worker。请用本地静态服务器访问。');
    return;
  }
  try {
    swReg = await navigator.serviceWorker.register('sw.js', { scope: './' });
    swReg.addEventListener('updatefound', () => {
      const nw = swReg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBar();
      });
    });
  } catch (err) {
    console.warn('[mos-music] Service Worker 注册失败：', err);
  }
}

function showUpdateBar() {
  const bar = $('#updateBar');
  if (!bar) return;
  bar.hidden = false;
  $('#updateApply').addEventListener('click', () => {
    if (swReg && swReg.waiting) swReg.waiting.postMessage('SKIP_WAITING');
    setTimeout(() => location.reload(), 200);
  });
}

/* ---------------------------------------------------------------- 安装提示 */

function wireInstall() {
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    const btn = $('#installBtn');
    if (btn) btn.hidden = false;
  });
  const btn = $('#installBtn');
  if (btn) {
    btn.addEventListener('click', async () => {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      btn.hidden = true;
    });
  }
  window.addEventListener('appinstalled', () => {
    const b = $('#installBtn');
    if (b) b.hidden = true;
  });
}

/* ---------------------------------------------------------------- 顶栏按钮 */

async function doSync() {
  const el = $('#syncBtn');
  if (el) el.disabled = true;
  try {
    const r = await sync({ dryRun: !REMOTE.configured });
    const msg = REMOTE.configured
      ? `同步完成：上传 ${r.pushed} ｜ 拉取 ${r.pulled} ｜ 失败 ${r.failed}`
      : `后端未配置：已核对本地队列（${await store.outboxCount()} 条待同步）。真正的上传/拉取需 Phase 2 之后接入后端。`;
    const box = $('#syncResult');
    if (box) { box.hidden = false; box.className = 'notice'; box.textContent = msg; }
  } catch (err) {
    const box = $('#syncResult');
    if (box) { box.hidden = false; box.className = 'notice error'; box.textContent = err.message; }
  } finally {
    if (el) el.disabled = false;
    await refreshOutboxBadge();
  }
}

/* ---------------------------------------------------------------- 启动 */

export async function boot() {
  // 1) 内容落库（§7）：首次启动把打包内容写入 IndexedDB，之后一律本地优先。
  //    失败不阻塞启动 —— 模块会用 fetch 兜底并如实报错。
  try {
    const r = await ensureSeeded();
    console.info('[mos-music] content seed:', r.seeded ? 'written' : 'already present', r.version || '');
  } catch (err) {
    console.warn('[mos-music] 内容落库失败（模块将走网络兜底）：', err && err.message);
  }

  // 2) 偏好（不阻塞渲染）
  applyTextPref();

  // 2) 离线基建
  initNet();
  onNetChange(() => { setNetBadge(); refreshOutboxBadge(); });
  setNetBadge();
  await refreshOutboxBadge();

  // 3) 后台同步骨架
  initBackgroundSync({
    dryRun: !REMOTE.configured,
    onChange: () => { setNetBadge(); refreshOutboxBadge(); },
  });

  // 4) Service Worker
  registerSW();

  // 5) 路由
  router = createRouter({
    onRoute,
    allowedKeys: MODULES.map((m) => m.key),
  });

  // 6) 顶栏交互
  wireInstall();
  const st = $('#textBtn'); if (st) st.addEventListener('click', toggleTextPref);
  applyMoodPref().then((v) => {
    const mb = $('#moodBtn');
    if (mb) {
      mb.setAttribute('aria-pressed', v === 'night' ? 'true' : 'false');
      mb.textContent = v === 'night' ? '☀' : '☾';
      mb.addEventListener('click', toggleMoodPref);
    }
  }).catch(() => {});
  const sb = $('#syncBtn'); if (sb) sb.addEventListener('click', doSync);
  const rb = $('#reloadBtn');
  if (rb) rb.addEventListener('click', () => router.handle());

  // 7) 首次渲染
  await router.handle();

  // 8) 网络恢复时把"离线"提示收起
  window.addEventListener('online', () => setNetBadge());
  window.addEventListener('offline', () => setNetBadge());

  window.__MOS_MUSIC__ = { router, store, NET, REMOTE, sync };
  document.documentElement.setAttribute('data-app-ready', '1');
}

export default { boot, buildHash, DEFAULT_ROUTE };
