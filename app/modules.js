/* =========================================================
   MOS-MUSIC｜MODULE 01–12 注册表与骨架视图
   ---------------------------------------------------------
   规格书 §10–§25 定义 11 个模块。V1.0 增加 MODULE 12（讲道音乐生产平台，
   内部生产工具，不进底部导航）。Phase 1 只交付**结构**：
     - 每个模块能打开、能取到索引、能显示自己的空状态与边界说明；
     - 不生成任何课程正文、歌曲、歌词、音频；
     - 空状态必须如实说明"该模块的数据尚未生产"，不得用假内容填充。

   规格书 §28：首页只需要几个核心入口（今日门训 / 音乐库 / 24课音乐册 /
   我的门训 / 家庭 / 小组 / 培训）。§29：手机端底部导航优先。
========================================================= */

import * as store from './store.js';
import { NET } from './net.js';
import { getIndex, getCourse, getTemplate, seedStatus } from './content-source.js';

/* ---------------------------------------------------------------- 工具 */

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

/** 内容一律经 content-source（IndexedDB 优先，fetch 兜底）读取，见 §34。 */
async function tryGet(fn, fallback) {
  try { return await fn(); } catch (e) { return fallback; }
}

const SHELL_TAG = '<span class="chip warn">空壳</span>';

function statusLine(parts) {
  const online = NET.status === 'online';
  const label = NET.status === 'unknown' ? '网络未探测' : online ? '在线' : '离线';
  return `<div class="notice net">状态：${label} ｜ ${parts.join(' ｜ ')}</div>`;
}

function shellNotice(text) {
  return `<div class="notice">${esc(text)}</div>`;
}

/* ---------------------------------------------------------------- 模块定义 */

export const MODULES = [
  /* ---- V2.0 前台三入口（手机底部导航只保留这三个） ---- */
  { num: 'F1', key: 'home',  title: '今天一起唱', nav: ['首页', '⌂'] },
  { num: 'F2', key: 'songs', title: '生命诗歌本', nav: ['歌曲', '♫'] },
  { num: 'F3', key: 'mine',  title: '我的歌',     nav: ['我的', '○'] },
  /* ---- V2.0 前台二级（歌曲页 / 学唱 / 教唱，不进底部导航） ---- */
  { num: 'F4', key: 'song',  title: '歌曲',       nav: null },
  { num: 'F5', key: 'learn', title: '学唱模式',   nav: null },
  { num: 'F6', key: 'teach', title: '教唱模式',   nav: null },
  /* ---- V3.x 独立产品模块：MOS Singing Coach（与门训系统完全独立，不进底部导航；入口在首页与「我的」） ---- */
  { num: 'C1', key: 'coach', title: 'MOS Singing Coach', nav: null },
  /* ---- 后台（普通用户不直接面对；能力一个不删） ---- */
  { num: '01', key: 'today',    title: '门训首页（后台）',  nav: null },
  { num: '02', key: 'library',  title: '曲库管理（后台）',  nav: null },
  { num: '03', key: 'courses',  title: '24 课音乐册',       nav: null },
  { num: '04', key: 'steps',    title: '七步音乐门训',      nav: null },
  { num: '05', key: 'my',       title: '个人门训记录',      nav: null },
  { num: '06', key: 'family',   title: '家庭门训',          nav: null },
  { num: '07', key: 'group',    title: '小组门训',          nav: null },
  { num: '08', key: 'church',   title: '教会实施',          nav: null },
  { num: '09', key: 'training', title: '培训系统',          nav: null },
  { num: '10', key: 'feedback', title: '反馈系统',          nav: null },
  { num: '11', key: 'admin',    title: '系统与内容治理',    nav: null },
  { num: '12', key: 'production', title: '讲道音乐生产平台', nav: null },
  { num: '13', key: 'song-detail', title: '歌曲研究档案（后台）', nav: null },
  { num: '14', key: 'week', title: '周音乐', nav: null },
];

export const NAV_KEYS = MODULES.filter((m) => m.nav).map((m) => m.key);

/** §28 首页核心入口：今日门训 / 音乐库 / 24课音乐册 / 我的门训 / 家庭 / 小组 / 培训 */
export const HOME_ENTRIES = [
  { key: 'today',    label: '今日门训',   note: 'MODULE 01｜今天要唱什么、要做什么' },
  { key: 'library',  label: '音乐库',     note: 'MODULE 02｜搜索与筛选' },
  { key: 'courses',  label: '24 课音乐册', note: 'MODULE 03｜主题骨架' },
  { key: 'my',       label: '我的门训',   note: 'MODULE 05｜进度 · 实践 · 收藏' },
  { key: 'family',   label: '家庭',       note: 'MODULE 06｜家庭 5 分钟' },
  { key: 'group',    label: '小组',       note: 'MODULE 07｜经文→歌曲→讨论→实践→反馈' },
  { key: 'training', label: '培训',       note: 'MODULE 09｜L1 会用 · L2 会带 · L3 会训' },
];

/* ---------------------------------------------------------------- MODULE 01 */

async function m01(root) {
  const idx = await tryGet(() => getIndex('courses'), null);
  const courses = (idx && idx.units) || [];
  const err = idx ? null : new Error('内容索引不可用（既不在本地库，也无法联网获取）');
  const counts = await safeStats();
  const lib = await tryGet(() => getIndex('songs'), null);
  const annual = await tryGet(() => getIndex('annual'), null);

  root.innerHTML = `
    ${statusLine([`24 课单元 ${courses.length}`, `歌曲 ${lib ? lib.count : '—'} 首`, `本地实践记录 ${counts.stores ? counts.stores.user_practice || 0 : 0}`])}
    <div class="card hero">
      <div class="eyebrow">今日门训</div>
      <h1>${err ? '内容索引读取失败' : annual ? `年度样本周 ${annual.weeks.length} 个已建立` : '本周主题：待接入'}</h1>
      <p>${annual
        ? `${esc(String(annual.annual_id))}｜状态：样本验证。本周样本取自 2027 年 52 周正式释经来源，只做引用不复制；打开「24 课音乐册」下方的年度样本，或先看音乐库的 5 首公版样本歌曲。`
        : 'MOS-MUSIC 的第一屏不是数据库，而是一个可以立刻开始的音乐门训。当前 24 课与音乐库均为结构空壳，尚无课程正文与歌曲。'}</p>
      <div class="btn-row">
        <button class="secondary" data-go="courses">先看 24 课结构</button>
        <button class="secondary" data-go="library">看样本歌曲</button>
        <button class="secondary" data-go="admin">查看内容治理状态</button>
      </div>
    </div>
    ${err ? `<div class="notice error">${esc(err.message)}</div>` : ''}
    <section class="card hero">
      <div class="section-head"><h2>七个入口</h2><span class="chip">§28</span></div>
      <div class="cards">
        ${HOME_ENTRIES.map((e) => `
          <button class="entry" data-go="${e.key}">
            <span class="entry-main">
              <span class="entry-title">${esc(e.label)}</span>
              <span class="entry-note">${esc(e.note)}</span>
            </span>
            <span class="chip">→</span>
          </button>`).join('')}
      </div>
    </section>
    <section class="card hero">
      <div class="section-head"><h2>今日操练</h2>${SHELL_TAG}</div>
      <div class="notice">规格书 §10 要求首页有「今天我要实践」与「分享给谁」两处留白。这两处属于内容层，Schema 已在 practice.schema.json 中定义（action_text / transmit_to），Phase 1 不预填。</div>
    </section>`;
}

/* ---------------------------------------------------------------- MODULE 02 */

/** 合并曲库视图：详情层 + 登记层（两层不混算，仅用于列表与搜索）。 */
function mergedSongRows(lib, registry) {
  const detail = ((lib && lib.songs) || []).map((s) => ({
    song_id: s.song_id, layer: 'detail', tier: s.tier, review_status: s.review_status,
    zh: s.title, en: null,
  }));
  const detailIds = new Set(detail.map((s) => s.song_id));
  const intake = (((registry && registry.records) || []))
    .filter((r) => !detailIds.has(r.song_id))
    .map((r) => ({
      song_id: r.song_id, layer: 'intake', tier: null, review_status: r.work_status || 'registry_only',
      zh: r.title_zh || r.song_id, en: r.title_en || null,
    }));
  return detail.concat(intake);
}

function songEntryHtml(row) {
  return `
    <button class="entry" data-song="${esc(row.song_id)}">
      <span class="entry-main">
        <span class="entry-title">${esc(row.zh)}${row.en ? `（${esc(row.en)}）` : ''}</span>
        <span class="entry-note">${esc(row.song_id)} ｜ ${row.layer === 'detail'
          ? `详情层 ｜ tier ${esc(row.tier || '—')} ｜ ${esc(row.review_status || '—')}`
          : '登记层（未升详情层，CI-0018）'}</span>
      </span>
      <span class="chip">→</span>
    </button>`;
}

async function m02(root) {
  const lib = await tryGet(() => getIndex('songs'), null);
  const registry = await tryGet(() => getIndex('registry'), null);
  const themes = await tryGet(() => getIndex('themes'), { themes: [] });
  const err = lib ? null : new Error('音乐库索引不可用');
  const rows = mergedSongRows(lib, registry);
  const detailN = rows.filter((r) => r.layer === 'detail').length;
  const intakeN = rows.filter((r) => r.layer === 'intake').length;

  root.innerHTML = `
    ${statusLine([`音乐库 ${rows.length} 首（详情层 ${detailN} + 登记层 ${intakeN}）`, 'V1.1-A 搜索已启用'])}
    <section class="card hero">
      <div class="section-head"><h2>音乐库</h2><span class="chip">MODULE 02</span></div>
      <div class="search-row">
        <input type="search" id="libSearch" placeholder="搜索：Song ID / 中文歌名 / 英文歌名" aria-label="搜索歌曲">
        <button class="secondary" id="libSearchClear" type="button">清除</button>
      </div>
      <div class="notice">搜索覆盖合并曲库（ID / 中文名 / 英文名）。点击歌曲进入<strong>歌曲详情页</strong>：
      基本资料 → 锚点 → 主题映射 → 辨识 → 人工审查 → 使用历史 → 资源 → 版权。</div>
      ${err ? `<div class="notice error">${esc(err.message)}</div>` : ''}
    </section>
    <section class="card hero">
      <div class="section-head"><h2>歌曲列表</h2><span class="chip" id="libCount">${rows.length} 首</span></div>
      <div class="cards" id="songList">
        ${rows.map(songEntryHtml).join('')}
      </div>
      <div class="notice">详情层 = 有完整歌曲记录（可辨识、可审）；登记层 = 只有入库登记（CI-0018 待升层）。
      两层都不代表资源可用：歌谱 / 歌词 / 音频一律 NOT_IMPORTED，不擅自托管未授权内容。</div>
    </section>
    <section class="card hero">
      <div class="section-head"><h2>周音乐</h2><span class="chip">W01–W04</span></div>
      <div class="cards">
        ${['W01', 'W02', 'W03', 'W04'].map((w) => `
          <a class="entry" href="#/week/${w}"><span class="entry-main">
            <span class="entry-kicker">${w}</span><span class="entry-title">查看周音乐安排</span></span>
            <span class="chip">→</span></a>`).join('')}
      </div>
    </section>
    <section class="card hero">
      <div class="section-head"><h2>可筛选的主题</h2><span class="chip">${themes.themes.length} 个</span></div>
      <div class="facets">
        ${themes.themes.map((t) => `<button class="facet" data-go="courses">${esc(t.name)}</button>`).join('')}
      </div>
      <div class="notice">主题来自 24 课骨架（TH-01…TH-24），每首歌曲的 main_theme 将指向其中之一。</div>
    </section>
    <section class="card hero">
      <div class="section-head"><h2>资源等级与审核状态</h2><span class="chip">两个独立字段</span></div>
      <div class="cards">
        <div class="entry"><span class="entry-main">
          <span class="entry-title">资源等级 tier</span>
          <span class="entry-note">A 核心库 ｜ B 推荐库 ｜ C 研究资源</span></span></div>
        <div class="entry"><span class="entry-main">
          <span class="entry-title">内容生命周期 review_status</span>
          <span class="entry-note">draft · under_review · approved · core · recommended · research · archived</span></span></div>
      </div>
      <div class="notice">两者互不推导：等级反映"适合谁用"，审核状态反映"走到哪一步"。详见 docs/ADR.md ADR-0005。</div>
    </section>`;

  /* 搜索：Song ID / 中文歌名 / 英文歌名（客户端过滤，不引入任何推荐逻辑） */
  const input = root.querySelector('#libSearch');
  const list = root.querySelector('#songList');
  const count = root.querySelector('#libCount');
  if (input && list) {
    const apply = () => {
      const q = String(input.value || '').trim().toLowerCase();
      const hits = rows.filter((r) => !q
        || r.song_id.toLowerCase().includes(q)
        || String(r.zh || '').toLowerCase().includes(q)
        || String(r.en || '').toLowerCase().includes(q));
      list.innerHTML = hits.length ? hits.map(songEntryHtml).join('')
        : '<div class="notice">没有匹配的歌曲。搜索只查找 ID 与名称，不做语义推荐。</div>';
      if (count) count.textContent = `${hits.length} 首`;
    };
    input.addEventListener('input', apply);
    const clear = root.querySelector('#libSearchClear');
    if (clear) clear.addEventListener('click', () => { input.value = ''; apply(); });
    apply();
    /* 事件委托：搜索重渲染后按钮监听不丢（导航走 hash 路由） */
    list.addEventListener('click', (e) => {
      const b = e.target && e.target.closest ? e.target.closest('[data-song]') : null;
      if (b) window.location.hash = '#/song/' + b.dataset.song;
    });
  }
}

/* ---------------------------------------------------------------- MODULE 03 */

async function m03(root) {
  const idx = await tryGet(() => getIndex('courses'), null);
  const units = (idx && idx.units) || [];
  const err = idx ? null : new Error('内容索引不可用');
  const groups = [...new Set(units.map((u) => u.group))];

  root.innerHTML = `
    ${statusLine([`单元 ${units.length}/24`, '全部为空壳', '点击单元进入七步法骨架'])}
    ${err ? `<div class="notice error">${esc(err.message)}</div>` : ''}
    ${groups.map((g) => `
      <section class="card hero">
        <div class="section-head"><h2>${esc(g)}</h2><span class="chip">${units.filter((u) => u.group === g).length} 课</span></div>
        <div class="cards">
          ${units.filter((u) => u.group === g).map((u) => `
            <button class="entry" data-course="${esc(u.course_id)}">
              <span class="entry-main">
                <span class="entry-kicker">MUS-C-${String(u.unit_no).padStart(2, '0')} ｜ ${esc(u.core_passage)}</span>
                <span class="entry-title">${String(u.unit_no).padStart(2, '0')}　${esc(u.title)}</span>
                <span class="entry-note">核心歌曲：未指定 ｜ ${esc(u.map_id)}</span>
              </span>
              <span class="chip">${SHELL_TAG.replace(/<[^>]+>/g, '空壳')}</span>
            </button>`).join('')}
        </div>
      </section>`).join('')}
    <section class="card hero">
      <div class="section-head"><h2>每课页面结构</h2><span class="chip">§16</span></div>
      <div class="notice">主题 → 核心经文 → 核心真理 → 神学重点 → 核心歌曲（1 首）→ 辅助歌曲（0–2 首）→ 一起唱 → 想一想 → 活出来 → 传给别人。以上顺序即 course.schema.json 的字段顺序，不可调整。</div>
    </section>`;
}

/* ---------------------------------------------------------------- MODULE 04 */

const SEVEN_LABELS = [
  ['S1_read', '读', '阅读经文。'],
  ['S2_understand', '明', '理解真理。'],
  ['S3_sing', '唱', '进入歌曲。'],
  ['S4_remember', '记', '记住核心歌词／经文。'],
  ['S5_feel', '感', '思想这真理对我的意义。'],
  ['S6_act', '行', '完成实际行动。'],
  ['S7_transmit', '传', '分享给一个人。'],
];

async function m04(root, params) {
  const cid = params && params.course ? params.course : null;
  let course = null, err = null;
  if (cid) {
    try { course = await getCourse(cid); } catch (e) { err = e; }
  }
  const active = params && params.step ? Number(params.step) : 1;
  const step = SEVEN_LABELS[Math.max(0, Math.min(6, active - 1))];

  root.innerHTML = `
    ${statusLine([cid ? `单元 ${esc(cid)}` : '未选择单元', `第 ${active}/7 步`])}
    ${err ? `<div class="notice error">${esc(err.message)}</div>` : ''}
    <section class="card hero">
      <div class="section-head">
        <h2>${course ? esc(course.title) : '七步音乐门训'}</h2>
        <span class="chip">MODULE 04</span>
      </div>
      <div class="stepbar" role="progressbar" aria-valuemin="1" aria-valuemax="7" aria-valuenow="${active}">
        ${SEVEN_LABELS.map(([k], i) => `<span class="${i + 1 === active ? 'active' : i + 1 < active ? 'done' : ''}"></span>`).join('')}
      </div>
      <div class="entry-kicker">${active} / 7 · ${esc(step[1])}</div>
      <h1>${esc(step[1])}</h1>
      <p>${esc(step[2])}</p>
      <div class="notice">该步内容为空壳。规格书 §17 要求系统记录「当前完成到哪一步」—— 对应的 user_progress store 与 outbox 队列已就绪，Phase 1 不写入假进度。</div>
      <div class="step-nav">
        <button class="secondary" ${active <= 1 ? 'disabled' : ''} data-step="${active - 1}">上一步</button>
        <button class="primary" ${active >= 7 ? 'disabled' : ''} data-step="${active + 1}">下一步</button>
      </div>
      <div class="btn-row"><button class="link" data-go="courses">← 返回 24 课</button></div>
    </section>
    ${course ? `
    <section class="card hero">
      <div class="section-head"><h2>单元字段</h2><span class="chip">course.schema.json</span></div>
      <div class="cards">
        <div class="entry"><span class="entry-main"><span class="entry-kicker">核心经文</span><span class="entry-title">${esc(course.core_passage)}</span></span></div>
        <div class="entry"><span class="entry-main"><span class="entry-kicker">核心真理</span><span class="entry-title">${course.core_truth ? esc(course.core_truth) : '（空壳，待从已定案经文中心接入）'}</span></span></div>
        <div class="entry"><span class="entry-main"><span class="entry-kicker">神学重点</span><span class="entry-title">${course.theology ? esc(course.theology) : '（空壳）'}</span></span></div>
        <div class="entry"><span class="entry-main"><span class="entry-kicker">核心歌曲</span><span class="entry-title">${course.core_song ? esc(course.core_song) : '未指定（1 首）'}</span></span></div>
        <div class="entry"><span class="entry-main"><span class="entry-kicker">辅助歌曲</span><span class="entry-title">${(course.support_songs || []).length ? esc(course.support_songs.join('、')) : '未指定（0–2 首）'}</span></span></div>
      </div>
    </section>` : ''}`;
}

/* ---------------------------------------------------------------- MODULE 05 */

async function safeStats() {
  try { return await store.stats(); }
  catch (e) { return { stores: {} }; }
}
async function outboxCount() {
  try { return await store.outboxCount(); } catch (e) { return 0; }
}

async function m05(root) {
  const st = await safeStats();
  const pending = await outboxCount();
  const seed = await tryGet(() => seedStatus(), null);
  const rows = [
    ['当前课程', '未开始'],
    ['已完成课程', `${st.stores.user_progress || 0} 条进度记录`],
    ['收藏歌曲', '0'],
    ['最近歌曲', '0'],
    ['我的实践', `${st.stores.user_practice || 0} 条`],
    ['我的分享', '0'],
    ['我的反馈', `${st.stores.user_feedback || 0} 条`],
    ['待同步操作', `${pending} 条`],
    ['内容落库', seed && seed.seeded ? `已写入（${seed.version || ''}）` : '未写入'],
  ];
  root.innerHTML = `
    ${statusLine([`outbox ${pending}`, `库 ${store.DB_NAME} v${store.DB_VERSION}`])}
    <section class="card hero">
      <div class="section-head"><h2>我的音乐门训</h2><span class="chip">MODULE 05</span></div>
      ${rows.map(([k, v]) => `
        <div class="entry" style="border:0;border-bottom:1px solid var(--line);border-radius:0;">
          <span class="entry-main"><span class="entry-main entry-note">${esc(k)}</span></span>
          <span class="entry-note">${esc(v)}</span>
        </div>`).join('')}
      <div class="notice">当前所有计数为 0 —— 尚未产生任何用户记录。规格书 §28 明确禁止把记录做成属灵分数或排名，因此此处只显示数量与状态。</div>
    </section>
    <section class="card hero">
      <div class="section-head"><h2>本地数据库</h2><span class="chip">§7</span></div>
      <div class="notice mono">库名 ${esc(store.DB_NAME)} ｜ 版本 ${store.DB_VERSION} ｜ store ${store.STORES.length} 个</div>
      <div class="cards">
        ${store.STORES.map((s) => `
          <div class="entry"><span class="entry-main"><span class="entry-title">${esc(s)}</span></span>
          <span class="chip">${st.stores[s] ?? 0}</span></div>`).join('')}
      </div>
    </section>`;
}

/* ---------------------------------------------------------------- MODULE 06 */

async function m06(root) {
  const t = await tryGet(() => getTemplate('MUS-TPL-FAM-5MIN'), null);
  root.innerHTML = `
    ${statusLine(['MODULE 06', '固定 5 分钟'])}
    <section class="card hero">
      <div class="section-head"><h2>${esc(t ? t.title : '家庭 5 分钟')}</h2><span class="chip">MODULE 06</span></div>
      <p>${esc(t ? t.purpose : '')}</p>
      <div class="cards">
        ${(t ? t.flow : []).map((f) => `
          <div class="entry"><span class="entry-main">
            <span class="entry-kicker">${f.minute} 分钟 ｜ ${esc(f.step_ref)}</span>
            <span class="entry-title">${esc(f.label)}</span>
          </span><span class="chip">七步法</span></div>`).join('')}
      </div>
      <div class="notice">总时长 ${t ? t.total_minutes : 5} 分钟。重点是让信仰进入家庭的每日记忆，而不是把课程复杂化。家庭流程从七步法取 4 步（读／唱／感／行），不新增流程。</div>
    </section>`;
}

/* ---------------------------------------------------------------- MODULE 07 */

async function m07(root) {
  const t = await tryGet(() => getTemplate('MOS-TPL-GRP-FLOW'), null);
  root.innerHTML = `
    ${statusLine(['MODULE 07', '小组长流程'])}
    <section class="card hero">
      <div class="section-head"><h2>${esc(t ? t.title : '小组使用流程')}</h2><span class="chip">MODULE 07</span></div>
      <div class="cards">
        ${(t ? t.flow : []).map((f) => `
          <div class="entry"><span class="entry-main">
            <span class="entry-kicker">第 ${f.order} 步 ｜ ${esc(f.step_ref)}</span>
            <span class="entry-title">${esc(f.label)}</span>
          </span></div>`).join('')}
      </div>
      <div class="notice">小组流程 = 经文 → 歌曲 → 讨论 → 实践 → 下周反馈，五段全部映射到七步法，不构成第二套核心流程。与 MOS-DIS 的五步日流程保持独立（见 docs/ADR.md ADR-0006）。</div>
    </section>
    <section class="card hero">
      <div class="section-head"><h2>小组长能做的事</h2><span class="chip">§20</span></div>
      <div class="facets">${(t ? t.leader_capabilities : []).map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>
    </section>`;
}

/* ---------------------------------------------------------------- MODULE 08 */

async function m08(root) {
  const t = await tryGet(() => getTemplate('MOS-TPL-CHU-SEASON'), null);
  const ctx = await tryGet(() => getIndex('contexts'), { count: 0, contexts: [] });
  root.innerHTML = `
    ${statusLine(['MODULE 08', `处境 ${ctx.count || 0} 个`])}
    <section class="card hero">
      <div class="section-head"><h2>${esc(t ? t.title : '教会季度实施')}</h2><span class="chip">MODULE 08</span></div>
      <p>${esc(t ? t.purpose : '')}</p>
      <div class="cards">
        ${(t ? t.slots : []).map((s) => `
          <div class="entry"><span class="entry-main">
            <span class="entry-kicker">${esc(s.key)}</span>
            <span class="entry-title">${esc(s.label)}</span>
            <span class="entry-note">${s.value ? esc(s.value) : '（空壳）'}</span>
          </span></div>`).join('')}
      </div>
      <div class="notice">教会侧只形成共同的音乐门训节奏，不接管人员与治理。人员／小组／教会身份如需对接，只读引用 MOS-GOV 的不透明 ID，不在本系统复制人员事实（见 docs/ADR.md ADR-0009）。</div>
    </section>`;
}

/* ---------------------------------------------------------------- MODULE 09 */

async function m09(root) {
  const idx = await tryGet(() => getIndex('training'), { levels: [], forms: [] });
  root.innerHTML = `
    ${statusLine(['MODULE 09', `层级 ${idx.levels.length} ｜ 表单 ${idx.forms.length}`])}
    <section class="card hero">
      <div class="section-head"><h2>三级培训</h2><span class="chip">学 → 看 → 做 → 反馈 → 再做 → 教别人</span></div>
      <div class="cards">
        ${idx.levels.map((l) => `
          <button class="entry" data-training="${esc(l.training_id)}">
            <span class="entry-main">
              <span class="entry-kicker">${esc(l.training_id)}</span>
              <span class="entry-title">L${l.level}｜${esc(l.title)}</span>
            </span><span class="chip">${SHELL_TAG.replace(/<[^>]+>/g, '空壳')}</span>
          </button>`).join('')}
      </div>
      <div class="notice">培训方法固定为六步，顺序不得更改。三级培训的 outcome 与课时在 Phase 4 生产。</div>
    </section>
    <section class="card hero">
      <div class="section-head"><h2>六张培训表</h2><span class="chip">§23</span></div>
      <div class="cards">
        ${idx.forms.map((f) => `
          <div class="entry"><span class="entry-main">
            <span class="entry-kicker">${esc(f.code)} ｜ ${esc(f.form_id)}</span>
            <span class="entry-title">${esc(f.title)}</span>
            <span class="entry-note">字段：0 个（空壳）｜ 可在线填写 / 导出 / 打印</span>
          </span></div>`).join('')}
      </div>
    </section>`;
}

/* ---------------------------------------------------------------- MODULE 10 */

const OBS = [
  ['understood', '是否理解'],
  ['participated', '是否参与'],
  ['remembered', '是否记住'],
  ['right_affection', '是否产生正确情感'],
  ['entered_practice', '是否进入实践'],
  ['fit_for_group', '是否适合群体'],
  ['able_to_transmit', '是否能够传递'],
];

async function m10(root) {
  const st = await safeStats();
  root.innerHTML = `
    ${statusLine(['MODULE 10', `反馈记录 ${st.stores.user_feedback || 0} 条`])}
    <section class="card hero">
      <div class="section-head"><h2>反馈循环</h2><span class="chip">§24</span></div>
      <div class="facets">${['选择', '使用', '观察', '反馈', '调整'].map((s) => `<span class="chip gold">${s}</span>`).join('')}</div>
      <div class="notice error">反馈不能只是「喜欢 / 不喜欢」。因此 feedback.schema.json 中**没有**整体好感度、星级或排名字段 —— 这不是遗漏，是刻意的设计约束。</div>
    </section>
    <section class="card hero">
      <div class="section-head"><h2>七项观察维度</h2><span class="chip">1–5 刻度 + 说明</span></div>
      <div class="cards">
        ${OBS.map(([k, label]) => `
          <div class="entry"><span class="entry-main">
            <span class="entry-kicker">${esc(k)}</span>
            <span class="entry-title">${esc(label)}</span>
          </span><span class="chip">未观察</span></div>`).join('')}
      </div>
      <div class="notice">刻度衡量的是「现象是否发生」，不是「好不好」。需要 MOS 人工复核的反馈可标记 needs_review。</div>
    </section>`;
}

/* ---------------------------------------------------------------- MODULE 11 */

const LIFECYCLE = ['draft', 'under_review', 'approved', 'core', 'recommended', 'research', 'archived'];

async function m11(root) {
  const lib = await tryGet(() => getIndex('songs'), { count: 0, facets: { tier: {}, review_status: {} } });
  const courses = await tryGet(() => getIndex('courses'), { count: 0 });
  root.innerHTML = `
    ${statusLine(['MODULE 11', `歌曲 ${lib.count} 首`, `单元 ${courses.count} 个`])}
    <section class="card hero">
      <div class="section-head"><h2>内容治理</h2><span class="chip">§25 / §26</span></div>
      <div class="notice">普通用户不能直接修改核心 MOS 内容；管理员侧 V1.0 只需基础 CMS 能力。Phase 1 只呈现治理结构，不提供写入界面。</div>
      <div class="cards two-col">
        <div class="entry"><span class="entry-main">
          <span class="entry-kicker">字段一</span><span class="entry-title">资源等级 tier</span>
          <span class="entry-note">A 核心库 ｜ B 推荐库 ｜ C 研究资源</span></span></div>
        <div class="entry"><span class="entry-main">
          <span class="entry-kicker">字段二</span><span class="entry-title">内容生命周期 review_status</span>
          <span class="entry-note">七态</span></span></div>
      </div>
    </section>
    <section class="card hero">
      <div class="section-head"><h2>七态</h2><span class="chip">避免 AI 内容直接进核心库</span></div>
      <div class="facets">${LIFECYCLE.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>
      <div class="notice">规格书 §35：AI 只能作为后台辅助工具（标签、搜索、整理、初步分类、数据迁移），最终审核始终由 MOS 人工完成。Phase 1 未引入任何 AI 推荐或自动评分。</div>
    </section>
    <section class="card hero">
      <div class="section-head"><h2>版权闸门</h2><span class="chip">§27</span></div>
      <div class="cards">
        <div class="entry"><span class="entry-main"><span class="entry-title">copyright_status</span>
          <span class="entry-note">unknown ｜ public_domain ｜ copyrighted ｜ licensed ｜ permission_granted</span></span></div>
        <div class="entry"><span class="entry-main"><span class="entry-title">audio_availability</span>
          <span class="entry-note">none ｜ external_link ｜ hosted_authorized</span></span></div>
        <div class="entry"><span class="entry-main"><span class="entry-title">lyrics_availability</span>
          <span class="entry-note">none ｜ excerpt ｜ external_link ｜ hosted_authorized</span></span></div>
      </div>
      <div class="notice">当前库中 0 首，无任何音频与歌词 —— 符合"不擅自托管未授权内容"的要求。</div>
    </section>
    <section class="card hero">
      <div class="section-head"><h2>讲道音乐生产平台</h2><span class="chip">MODULE 12</span></div>
      <div class="notice">内容治理的下游工具：歌曲辨识 → 周次匹配 → 单元生产 → 人工审核 → 验收 → 生产记录。默认门为人工审核；平台只读内容，不写任何 content/**。</div>
      <div class="cards">
        <a class="entry" href="#/production?view=dashboard"><span class="entry-main">
          <span class="entry-kicker">Production Dashboard</span><span class="entry-title">生产总览</span>
          <span class="entry-note">年度 / 音乐库 / 技能与校准三组统计</span></span></a>
        <a class="entry" href="#/production?view=discern"><span class="entry-main">
          <span class="entry-kicker">Song Discernment</span><span class="entry-title">歌曲辨识</span>
          <span class="entry-note">八维辨识 · Song_Relation · S6 / S7 · 决策轨迹</span></span></a>
        <a class="entry" href="#/production?view=producer"><span class="entry-main">
          <span class="entry-kicker">Producer</span><span class="entry-title">生产计划</span>
          <span class="entry-note">单周 / 连续 / 全年；曲库容量告警</span></span></a>
        <a class="entry" href="#/production?view=calibration"><span class="entry-main">
          <span class="entry-kicker">Calibration</span><span class="entry-title">校准与版本</span>
          <span class="entry-note">问题累积与 Frozen/Observed/Proposed/Released</span></span></a>
      </div>
    </section>`;
}

/* ---------------------------------------------------------------- MODULE 12 */

/**
 * 讲道音乐生产平台（生产内部工具，不进底部导航）。
 * 视图实现独立放在 app/production-console.js —— 那里只读内容，不写任何 content/**。
 */
async function m12(root, params) {
  const { renderProduction } = await import('./production-console.js');
  await renderProduction(root, params || {});
}

/** 歌曲研究档案（V1.1-A 八段档案，V2.0 起归入后台）：#/song-detail/MUS-S-NNNN */
async function m13(root, params) {
  const { renderSongDetail } = await import('./song-detail.js');
  await renderSongDetail(root, params && params.songId);
}

/** 周音乐（V1.1-A，MODULE 14）：#/week/W04 */
async function m14(root, params) {
  const { renderWeekMusic } = await import('./week-music.js');
  await renderWeekMusic(root, params && params.weekId);
}

/* ---------------------------------------------------------------- V2.0 前台 */

/** 首页（今天一起唱） */
async function f1(root) {
  const { renderHome } = await import('./front/home.js');
  await renderHome(root);
}

/** 生命诗歌本（100 首 + 曲库层级） */
async function f2(root) {
  const { renderSongbook } = await import('./front/songbook.js');
  await renderSongbook(root);
}

/** 我的歌 */
async function f3(root) {
  const { renderMine } = await import('./front/mine.js');
  await renderMine(root);
}

/** 歌曲页（一页解决：唱/懂/活/教/传） */
async function f4(root, params) {
  const { renderSongPage } = await import('./front/song-page.js');
  await renderSongPage(root, params && params.songId, params || {});
}

/** 学唱模式（V3.0：?mode=learn|sight） */
async function f5(root, params) {
  const { renderLearn } = await import('./front/learn.js');
  await renderLearn(root, params && params.songId, params || {});
}

/** 教唱模式（V3.0：?who=child|group） */
async function f6(root, params) {
  const { renderTeach } = await import('./front/teach.js');
  await renderTeach(root, params && params.songId, params || {});
}

/** MOS Singing Coach（V3.x 独立模块 · 基础层） */
async function f7(root) {
  const { renderCoach } = await import('./front/coach.js');
  await renderCoach(root);
}

/* ---------------------------------------------------------------- 路由表 */

export const RENDERERS = {
  /* 前台 */
  home: f1, songs: f2, mine: f3, song: f4, learn: f5, teach: f6,
  /* V3.x 独立模块：歌唱教练（不读门训数据） */
  coach: f7,
  /* 后台（能力保留，普通用户不直接面对） */
  today: m01, library: m02, courses: m03, steps: m04, my: m05,
  family: m06, group: m07, church: m08, training: m09, feedback: m10, admin: m11,
  production: m12, 'song-detail': m13, week: m14,
};

export async function renderModule(key, root, params) {
  const fn = RENDERERS[key];
  if (!fn) {
    root.innerHTML = `<div class="notice error">未知模块：${esc(key)}</div>`;
    return;
  }
  try {
    await fn(root, params || {});
  } catch (err) {
    root.innerHTML = `<div class="notice error">模块 ${esc(key)} 渲染失败：${esc(err.message)}</div>`;
  }
}
