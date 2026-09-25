/* =========================================================
   MOS-MUSIC｜Service Worker
   ---------------------------------------------------------
   规格书 §30 要求：Web App Manifest / Service Worker / Cache Strategy /
   Offline Page / Install to Home Screen / Network Detection。

   缓存策略（复用 EBRM 已验证的三段式，不复制 EBRM 的业务逻辑）：
     1) 内容数据 content/**            → 缓存优先 + 后台更新（内容固定，离线必读）
     2) 页面导航 mode === 'navigate'   → 网络优先，失败回退缓存 → offline.html
     3) 其它静态资源                    → 缓存优先 + 后台更新（仅同源 basic 响应）

   命名空间（重要）：
     - 本 SW 只管理 /^mos-music-/ 前缀的缓存。
     - **绝不删除** ebrm-* 或任何其它前缀的缓存 —— CacheStorage 按 origin 共享，
       同 origin 下的 EBRM 部署与 MOS-DIS 缓存不归本 SW 管。
     - 本 SW 不做任何 HTML 内容改写（no runtime patch）。
========================================================= */

const CACHE = 'mos-music-v18';
const PRECACHE_MANIFEST = 'mos-music-precache-v1';

/* 应用外壳：较小且必须离线可用 */
const SHELL = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './app/shell.js',
  './app/router.js',
  './app/store.js',
  './app/midi-synth.js',
  './app/sync.js',
  './app/net.js',
  './app/modules.js',
  './app/content-source.js',
  './app/discernment.js',
  './app/production-rules.js',
  './app/calibration.js',
  './app/production-console.js',
  './app/song-detail.js',
  './app/week-music.js',
  './app/song-resources.js',
  /* V3.0：单曲单元机械判定（等级 / 缺口 / 状态一致性） */
  './app/song-unit.js',
  /* V2.0 前台（生命诗歌软件）：首页 / 诗歌本 / 我的 / 歌曲页 / 学唱 / 教唱 */
  './app/front/util.js',
  './app/front/my-songs.js',
  './app/front/player.js',
  './app/front/home.js',
  './app/front/songbook.js',
  './app/front/mine.js',
  './app/front/song-page.js',
  './app/front/learn.js',
  './app/front/teach.js',
  './app/front/covers.js',
  /* V3.0 前台：简谱渲染 + 光标跟随 / 学习路径状态 + 间隔复习 / 节拍器 */
  './app/front/score.js',
  './app/front/review.js',
  './app/front/pulse.js',
  /* V3.x：MOS Singing Coach（独立模块的数据层与前台页） */
  './app/coach.js',
  './app/front/coach.js',
  './app/ui/tokens.css',
  './app/ui/components.css',
  './app/ui/v21.css',
  './app/ui/v30.css',
  './app/ui/v22.css',
  './assets/icons/icon-192.png',
  './assets/icons/icon-180.png',
];

/* 内容索引：首屏需要，体积小（规格书 §31 只加载索引） */
const INDEXES = [
  './content/courses/index.json',
  './content/themes/index.json',
  './content/songs/index.json',
  './content/training/index.json',
  './content/contexts/index.json',
  './content/map/MOS-MUSIC-MAP_V1.0.json',
  './content/bible/reference-index.json',
  './content/framework/music-units.json',
  './content/annual/2027/annual.json',
  './content/annual/2027/index.json',
  './content/templates/family-5min.json',
  './content/templates/group-flow.json',
  './content/templates/church-season.json',
  /* 讲道音乐生产平台（MODULE 12）离线所需 */
  './content/production/index.json',
  './content/production/discernment-lexicon.json',
  './content/production/calibration-issues.json',
  './content/production/version-governance.json',
  './content/production/library-usage.json',
  /* 曲库 V0.5 扩库登记层（§十三：新增歌曲离线可读）
     歌曲详情记录体积小且属于 content/**，由缓存优先策略按需缓存；
     入库登记与候选清单是索引级数据，随外壳预缓存。 */
  './content/library/index.json',
  './content/library/registry.json',
  './content/library/v0.5-candidates.json',
  /* 派生索引（CI-0014 案 a）：随曲库增长而变化，属 Production Content。
     离线必须可读 —— 主题歌曲计数 / 歌曲经文锚点 / 库级歌基层辨识结果。 */
  './content/production/theme-song-counts.json',
  './content/production/song-scripture-index.json',
  './content/production/song-discernment-v0.5.json',
  './content/production/library-report.json',
  /* V0.5 升层（第二段）：登记层的字段契约被冻结、不允许附加字段，所以
     「哪一首已升入详情层」与「锚点逐首认定依据」由独立文件声明，而不是改写登记记录。
     这两份文件是升层关系的权威陈述，需可离线审计，故随外壳预缓存。 */
  './content/production/library-promotions.json',
  './content/production/song-anchor-determinations.json',
  /* V1.1-A：歌曲资源层 / 人工审查记录层（离线可读；当前 0 条，结构就绪） */
  './content/song-resources/index.json',
  './content/production/review-records.json',
  /* V2.0：100 首目标候选库（生命诗歌本离线可搜） */
  './content/candidates/index.json',
  './content/library/selected-100.json',
  /* V3.0：单曲完整单元词表 + 10 个单元包（离线冷启动需要；
     单元记录按需 fetch，但词表与现有 10 首单元随外壳预缓存以保证离线可用） */
  './content/song-units/index.json',
  './content/song-units/MUS-SU-0001.json',
  './content/song-units/MUS-SU-0002.json',
  './content/song-units/MUS-SU-0003.json',
  './content/song-units/MUS-SU-0004.json',
  './content/song-units/MUS-SU-0005.json',
  './content/song-units/MUS-SU-0006.json',
  './content/song-units/MUS-SU-0007.json',
  './content/song-units/MUS-SU-0008.json',
  './content/song-units/MUS-SU-0009.json',
  './content/song-units/MUS-SU-0010.json',
  /* 派生：全库等级 / 缺口表 + 生产工作单（Production Content，随库变化） */
  './content/production/song-unit-levels.json',
  './content/production/song-worksheets.json',
  /* V3.x：五首样板教学包（乐句教学卡；离线可读） */
  './content/teaching/index.json',
  './content/teaching/MUS-S-0001.json',
  './content/teaching/MUS-S-0002.json',
  './content/teaching/MUS-S-0003.json',
  './content/teaching/MUS-S-0004.json',
  './content/teaching/MUS-S-0005.json',
  './app/phrase-cards.js',
  './app/front/phrase-card.js',
  /* PILOT 10：生产工作包（样板歌的公版歌词与简谱草稿离线可读） */
  './content/production/packages/index.json',
  './content/production/packages/MUS-S-0001/manifest.json',
  './content/production/packages/MUS-S-0001/lyrics.json',
  './content/production/packages/MUS-S-0001/score.json',
  './content/production/packages/MUS-S-0001/timeline.json',
  './content/production/packages/MUS-S-0002/lyrics.json',
  './content/production/packages/MUS-S-0002/manifest.json',
  './content/production/packages/MUS-S-0002/score.json',
  './content/production/packages/MUS-S-0002/timeline.json',
  './content/production/packages/MUS-S-0003/lyrics.json',
  './content/production/packages/MUS-S-0004/lyrics.json',
  './content/production/packages/MUS-S-0004/manifest.json',
  './content/production/packages/MUS-S-0004/score.json',
  './content/production/packages/MUS-S-0004/timeline.json',
  './content/production/packages/MUS-S-0005/lyrics.json',
  /* V3.2 §九：生成钢琴陪唱 MIDI（平台自产，hosted_authorized） */
  './assets/audio/MUS-S-0001-piano.mid',
  './assets/audio/MUS-S-0002-piano.mid',
  './assets/audio/MUS-S-0004-piano.mid',
  /* V3.x：四维分类 / 歌曲内容层 / 歌唱教练词表 / 资源普查表 */
  './content/taxonomy/index.json',
  './content/taxonomy/assignments.json',
  './content/song-content/index.json',
  './content/song-content/MUS-S-0001.json',
  './content/song-content/MUS-S-0002.json',
  './content/song-content/MUS-S-0003.json',
  './content/song-content/MUS-S-0004.json',
  './content/song-content/MUS-S-0005.json',
  './content/song-content/MUS-S-0006.json',
  './content/song-content/MUS-S-0007.json',
  './content/song-content/MUS-S-0008.json',
  './content/song-content/MUS-S-0009.json',
  './content/song-content/MUS-S-0010.json',
  './content/coach/index.json',
  './content/production/resource-discovery.json',
];

const PRECACHE = [...SHELL, ...INDEXES];

const IS_CONTENT = /\/content\//;
const IS_NAVIGATION = (req) => req.mode === 'navigate';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // 逐项添加：单个 404 或网络抖动不影响整体安装
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch((err) => {
            console.warn('[mos-music/sw] 预缓存失败（已跳过）:', url, err && err.message);
            return null;
          })
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => {
          // 只清理自己的旧版本；绝不触碰其它前缀（ebrm-* / 其它产品）
          const isOurs = k === CACHE || k.startsWith('mos-music-');
          if (isOurs && k !== CACHE) return caches.delete(k);
          return null;
        })
      );
      if (self.registration.navigationPreload) {
        try { await self.registration.navigationPreload.disable(); } catch (_) { /* 可选能力 */ }
      }
      await self.clients.claim();
    })()
  );
});

async function cacheFirstWithRefresh(req, { sameOriginOnly = true } = {}) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res && res.ok && (!sameOriginOnly || res.type === 'basic')) {
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    })
    .catch(() => hit);
  return hit || network;
}

async function refreshInBackground(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone()).catch(() => {});
    }
  } catch (_) { /* 离线时静默 */ }
}

/**
 * 导航请求处理。
 * 本应用是单壳 hash 路由（见 app/router.js），index.html 是纯静态外壳，
 * 因此对外壳页（index.html / offline.html）采用**缓存优先 + 后台刷新**；
 * 其它导航仍走网络优先。这样断网（或网络抖动）时应用外壳必然可用，
 * 满足规格书 §6「网络是同步工具，不是系统运行的必要条件」。
 */
async function navigationResponse(req) {
  const cache = await caches.open(CACHE);
  const url = new URL(req.url);
  const isShell = /\/(index|offline)\.html$/.test(url.pathname) || url.pathname === new URL(self.registration.scope).pathname;
  if (isShell) {
    const hit =
      (await cache.match(req)) ||
      (await cache.match(url.pathname)) ||
      (url.pathname.endsWith('/index.html') ? await cache.match('./index.html') : null) ||
      (url.pathname.endsWith('/offline.html') ? await cache.match('./offline.html') : null);
    if (hit) {
      refreshInBackground(req);
      return hit;
    }
  }
  return networkFirstNavigate(req);
}

async function networkFirstNavigate(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (_) {
    const hit = await cache.match(req);
    if (hit) return hit;
    const shell = await cache.match('./index.html');
    if (shell) return shell;
    const off = await cache.match('./offline.html');
    if (off) return off;
    return new Response(
      '<!DOCTYPE html><meta charset="utf-8"><title>离线</title><body style="font-family:sans-serif;padding:24px">当前离线，且应用外壳尚未缓存完成。请联网打开一次 MOS-MUSIC。</body>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // 写操作一律走网络，不缓存

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // 跨域交给网络

  if (IS_NAVIGATION(req)) {
    event.respondWith(navigationResponse(req));
    return;
  }

  if (IS_CONTENT(url)) {
    // 内容数据：缓存优先 + 后台更新
    event.respondWith(cacheFirstWithRefresh(req));
    return;
  }

  // 其它静态资源：缓存优先 + 后台更新
  event.respondWith(cacheFirstWithRefresh(req));
});

self.addEventListener('message', (event) => {
  const data = event.data;
  const type = typeof data === 'string' ? data : data && data.type;
  if (type === 'SKIP_WAITING') { self.skipWaiting(); return; }
  if (type === 'CLEAR_CONTENT_CACHE') {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE);
        const keys = await cache.keys();
        const contentKeys = keys.filter((r) => IS_CONTENT(new URL(r.url)));
        await Promise.all(contentKeys.map((r) => cache.delete(r)));
        if (event.source) event.source.postMessage({ type: 'CONTENT_CACHE_CLEARED', count: contentKeys.length });
      })()
    );
    return;
  }
  if (type === 'PING') {
    if (event.source) {
      event.source.postMessage({
        type: 'PONG', cache: CACHE, manifest: PRECACHE_MANIFEST,
        precache: PRECACHE.length, scope: self.registration.scope,
      });
    }
  }
});
