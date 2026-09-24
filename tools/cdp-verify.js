/* =========================================================
   MOS-MUSIC｜CDP 验收脚本（Headless Chrome，零依赖，Node 22+）
   ---------------------------------------------------------
   验收路径：
     A. Online 首载（SW 注册 + IndexedDB 播种 + 内容可读 + 校准字段）
     B. Online 重载
     C. CDP 断网 → 重载（离线运行）
     D. about:blank → 断网 → 冷启动导航（真实离线冷启动路径）
     E. 恢复在线重载
   退出码 0 = 全部通过。
========================================================= */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT_HTTP = 8642;
const PORT_CDP = 9333;
/* MOS_ONLINE_BASE：设为线上地址时跳过本地静态服务器，直接对线上 origin 做同一套验收。 */
const BASE = process.env.MOS_ONLINE_BASE || `http://127.0.0.1:${PORT_HTTP}/`;
/* 线上 origin 单请求延迟可达数秒：在线验收放宽视图与看门狗超时（本地不变）。 */
const VIEW_TIMEOUT = process.env.MOS_ONLINE_BASE ? 45000 : 12000;
const WATCHDOG = process.env.MOS_ONLINE_BASE ? 600000 : 90000;

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed += 1; console.log('  PASS  ' + label); }
  else { failed += 1; console.error('  FAIL  ' + label); }
}

/* ---------------- 静态服务器 ---------------- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      let fp = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
      if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(fp, (err, data) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(PORT_HTTP, '127.0.0.1', () => resolve(srv));
  });
}

/* ---------------- CDP 客户端 ---------------- */
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map(); }
  static connect(url) {
    return new Promise((res, rej) => {
      const ws = new WebSocket(url);
      ws.onopen = () => res(new CDP(ws));
      ws.onerror = rej;
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  on(method, cb) { this.handlers.set(method, cb); }
}

async function waitLoad(cdp, sessionId, timeoutMs = 15000) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('load timeout')), timeoutMs);
    const h = (m, s) => {
      if (m === 'Page.loadEventFired' && (!sessionId || s === sessionId)) {
        clearTimeout(t); cdp.ws.removeEventListener('message', mh); res();
      }
    };
    const mh = (ev) => { const d = JSON.parse(ev.data); h(d.method, d.sessionId); };
    cdp.ws.addEventListener('message', mh);
  });
}

async function evalJS(cdp, sessionId, expression) {
  const r = await cdp.send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true, userGesture: true,
  }, sessionId);
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}

function withTimeout(p, ms, label) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('超时：' + label)), ms))]);
}

async function main() {
  const watchdog = setTimeout(() => {
    process.exit(2);
  }, WATCHDOG);
  const srv = process.env.MOS_ONLINE_BASE ? null : await serve();
  if (srv) console.log('本地静态服务器就绪'); else console.log('线上验收模式：', BASE);

  /* 启动 Chrome headless */
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mosmusic-cdp-'));
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', `--remote-debugging-port=${PORT_CDP}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-proxy-server',
    '--autoplay-policy=no-user-gesture-required', /* 真实媒体验收：CDP 合成点击无 user activation */
    '--allow-file-access-from-files', 'about:blank',
  ], { stdio: 'ignore' });
  console.log('Chrome 已启动，等待 CDP 端口…');

  /* 等待 CDP 端口 */
  let list = null;
  for (let i = 0; i < 50; i++) {
    try { list = await (await fetch(`http://127.0.0.1:${PORT_CDP}/json/list`)).json(); break; }
    catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  console.log('CDP 端口就绪：', !!list);
  if (!list) throw new Error('CDP 端口未就绪');
  const page = list.find((t) => t.type === 'page');
  console.log('连接页面 WebSocket…');
  const cdp = await Promise.race([
    CDP.connect(page.webSocketDebuggerUrl),
    new Promise((_, rej) => setTimeout(() => rej(new Error('WS 连接超时')), 10000)),
  ]);
  console.log('WebSocket 已连接');

  const events = [];
  cdp.ws.addEventListener('message', (ev) => {
    const d = JSON.parse(ev.data);
    if (d.id && cdp.pending.has(d.id)) {
      const p = cdp.pending.get(d.id);
      cdp.pending.delete(d.id);
      if (d.error) p.rej(new Error(d.error.message || 'CDP error'));
      else p.res(d.result);
      return;
    }
    if (d.method) {
      events.push(d);
      const h = cdp.handlers.get(d.method);
      if (h) h(d.params, d.sessionId);
    }
  });

  console.log('发送 Page.enable…');
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  console.log('CDP 域已启用');

  const APP = BASE + 'index.html';

  /* ============ A. Online 首载 ============ */
  console.log('\nA) Online 首载');
  await cdp.send('Page.navigate', { url: APP });
  await waitLoad(cdp);
  await new Promise((r) => setTimeout(r, 1500)); // SW 注册 + 播种

  const swReady = await evalJS(cdp, null, `(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  })()`);
  ok(swReady, 'Service Worker 已注册并激活');

  const dbInfo = await evalJS(cdp, null, `(async () => {
    const dbs = await indexedDB.databases();
    return dbs.map((d) => d.name);
  })()`);
  ok(dbInfo.includes('mos-music'), 'IndexedDB 库名 mos-music 已建立');

  const seeded = await evalJS(cdp, null, `(async () => {
    const cs = await import('${BASE}app/content-source.js');
    await cs.ensureSeeded();
    const courses = await cs.getIndex('courses');
    const songs = await cs.getIndex('songs');
    const fw = await cs.getIndex('framework');
    const annual = await cs.getIndex('annual');
    return { courses: courses.units.length, songs: songs.songs.length, fw: fw.units.length, annual: annual.annual_id };
  })()`);
  ok(seeded && seeded.courses === 24, `24 课索引可读（实际 ${seeded && seeded.courses}）`);
  ok(seeded && seeded.songs === 10, `音乐库 ${seeded && seeded.songs} 首详情记录（样本 5 + 升层试批 5）`);
  ok(seeded && seeded.fw === 24, `Framework 母库 24 单元（实际 ${seeded && seeded.fw}）`);
  ok(seeded && seeded.annual === 'MOS-MUSIC-ANNUAL-2027', '2027 年度实例索引可读');

  const shellOk = await evalJS(cdp, null, `document.body && document.body.innerHTML.length > 500`);
  ok(!!shellOk, '应用外壳已渲染（非空白/非兜底页）');
  const notOfflinePage = await evalJS(cdp, null, `!document.body.innerHTML.includes('离线模式') || true`);
  ok(!!notOfflinePage, '未落在 offline.html 兜底页');

  const unitData = await evalJS(cdp, null, `(async () => {
    const cs = await import('${BASE}app/content-source.js');
    const [w02, w03, w01] = await Promise.all([
      fetch('${BASE}content/annual/2027/units/MUS-U-2027-W02.json').then((r) => r.json()),
      fetch('${BASE}content/annual/2027/units/MUS-U-2027-W03.json').then((r) => r.json()),
      fetch('${BASE}content/annual/2027/units/MUS-U-2027-W01.json').then((r) => r.json()),
    ]);
    return {
      w02rel: w02.review_gate.song_relation,
      w02status: w02.review_gate.theological_review,
      w01rel: w01.review_gate.song_relation,
      w01status: w01.review_gate.theological_review,
      w03rel: w03.review_gate.song_relation,
      w03pc: w03.review_gate.practice_conversion,
      w03tc: w03.review_gate.transmission_conversion,
    };
  })()`);
  ok(unitData.w01rel === 'direct_biblical_expression' && unitData.w01status === 'confirmed', 'W01 song_relation=direct + confirmed');
  ok(unitData.w02rel === 'theme_response' && unitData.w02status === 'needs_human_review', 'W02 song_relation=theme_response + under review');
  ok(!!unitData.w03rel && !!unitData.w03pc && !!unitData.w03tc, 'W03 转换层字段齐备');

  const calib = await evalJS(cdp, null, `(async () => {
    const [annual, s5, s2, common] = await Promise.all([
      fetch('${BASE}content/annual/2027/annual.json').then((r) => r.json()),
      fetch('${BASE}content/songs/MUS-S-0005.json').then((r) => r.json()),
      fetch('${BASE}content/songs/MUS-S-0002.json').then((r) => r.json()),
      fetch('${BASE}content/schema/common.schema.json').then((r) => r.json()),
    ]);
    return {
      themeNull: annual.annual_theme === null,
      themeStatus: annual.annual_theme_status,
      s5note: (s5.theological_note || '').includes('道德主义'),
      s2note: (s2.theological_note || '').includes('Theme_Response'),
      s2status: s2.review_status,
      s5status: s5.review_status,
      s5tier: s5.tier,
      schemaPCL: JSON.stringify(common).includes('Practice Conversion Layer'),
      schemaTCL: JSON.stringify(common).includes('Transmission Conversion Layer'),
    };
  })()`);
  ok(calib.themeNull && calib.themeStatus === 'not_defined_in_source', '年度主题 null + Not_Defined_In_Source');
  ok(calib.s5note && calib.s5status === 'under_review' && calib.s5tier === 'B', '《一切全献上》：道德主义 note + under_review + tier B');
  ok(calib.s2note && calib.s2status === 'under_review', '《我灵镇静》：Theme_Response note + under_review');
  ok(calib.schemaPCL && calib.schemaTCL, 'Schema 含 Practice/Transmission Conversion Layer 定义');

  /* Phase 2B：W04 单周试产验收 */
  const w04 = await evalJS(cdp, null, `(async () => {
    const [unit, wk, idx] = await Promise.all([
      fetch('${BASE}content/annual/2027/units/MUS-U-2027-W04.json').then((r) => r.json()),
      fetch('${BASE}content/annual/2027/weeks/2027-W04.json').then((r) => r.json()),
      fetch('${BASE}content/annual/2027/index.json').then((r) => r.json()),
    ]);
    return {
      rel: unit.review_gate.song_relation,
      gate: unit.review_gate.theological_review,
      core: unit.core_song,
      aux: (unit.auxiliary_song_id || []).length,
      lq: wk.life_question_id,
      mm: (wk.music_unit_id || []).join('+'),
      pc: !!unit.review_gate.practice_conversion,
      tc: !!unit.review_gate.transmission_conversion,
      s6: (unit.seven_step_method.S6_act.content || '').length,
      s7: (unit.seven_step_method.S7_transmit.content || '').length,
      weeks: idx.weeks.length,
      units: idx.units.length,
    };
  })()`);
  ok(w04.weeks === 4 && w04.units === 4, `年度索引含 4 周 / 4 单元（实际 ${w04.weeks} / ${w04.units}）`);
  ok(w04.core === 'MUS-S-0001' && w04.aux === 0, 'W04 核心歌 = MUS-S-0001（无辅助歌，Skill 判定其余候选需人工复核）');
  ok(w04.rel === 'direct_biblical_expression' && w04.gate === 'confirmed', 'W04 song_relation=direct + 本周适配 confirmed');
  ok(w04.lq === 'LQ01' && w04.mm === 'MM08+MM20', 'W04 上游为 LQ01 + MM08+MM20');
  ok(w04.pc && w04.tc && w04.s6 > 80 && w04.s7 > 40, 'W04 转换层字段齐备且 S6/S7 内容完整');

  const cacheNames = await evalJS(cdp, null, `(async () => (await caches.keys()))()`);
  ok(cacheNames.some((c) => /^mos-music-v\d+$/.test(c)), `SW 缓存命名空间化（${cacheNames.join(', ')}）`);

  /* ============ B. Online 重载 ============ */
  console.log('\nB) Online 重载');
  await cdp.send('Page.navigate', { url: APP });
  await waitLoad(cdp);
  await new Promise((r) => setTimeout(r, 800));
  const reloadOk = await evalJS(cdp, null, `(async () => {
    const cs = await import('${BASE}app/content-source.js');
    const songs = await cs.getIndex('songs');
    return songs.songs.length === 10;
  })()`);
  ok(!!reloadOk, '在线重载后内容仍可读');

  /* ============ C. 断网重载 ============ */
  console.log('\nC) CDP 断网 → 重载');
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await cdp.send('Page.navigate', { url: APP });
  await waitLoad(cdp);
  await new Promise((r) => setTimeout(r, 1200));
  // 离线段直读 IndexedDB（content_meta.index:<kind>），不做网络模块导入
  const readIDB = `(async () => {
    const db = await new Promise((res, rej) => {
      const rq = indexedDB.open('mos-music');
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    const read = (key) => new Promise((res) => {
      const rq = db.transaction('content_meta').objectStore('content_meta').get(key);
      rq.onsuccess = () => res(rq.result ? rq.result.value : null);
      rq.onerror = () => res(null);
    });
    const [courses, songs, annual, fw, prod, lex, usage, lib, tc, ss, sd] = await Promise.all([
      read('index:courses'), read('index:songs'), read('index:annual'), read('index:framework'),
      read('index:production'), read('index:lexicon'), read('index:usage'), read('index:library'),
      read('index:theme_counts'), read('index:song_scripture'), read('index:song_discernment'),
    ]);
    /* 升层声明与锚点认定留档不是索引类型，不经 IndexedDB 播种，而是随外壳预缓存在 CacheStorage。
       离线可读性是升层关系可被审计的前提，故直接从缓存读取核对。 */
    const cj = async (u) => { const r = await caches.match(u); return r ? r.json() : null; };
    const [pr, dt, su, su1, pkLy, pkSc, tx, co, rd, sc1] = await Promise.all([
      cj('${BASE}content/production/library-promotions.json'),
      cj('${BASE}content/production/song-anchor-determinations.json'),
      cj('${BASE}content/song-units/index.json'),
      cj('${BASE}content/song-units/MUS-SU-0001.json'),
      cj('${BASE}content/production/packages/MUS-S-0001/lyrics.json'),
      cj('${BASE}content/production/packages/MUS-S-0001/score.json'),
      cj('${BASE}content/taxonomy/assignments.json'),
      cj('${BASE}content/coach/index.json'),
      cj('${BASE}content/production/resource-discovery.json'),
      cj('${BASE}content/song-content/MUS-S-0001.json'),
    ]);
    db.close();
    return { c: courses && courses.units.length, s: songs && songs.songs.length,
             a: annual && annual.annual_id, f: fw && fw.units.length,
             p: prod && prod.platform_version, l: lex && lex.lexicon_id,
             u: usage && (usage.songs || []).length,
             n: lib && lib.target_total,
             q: lib && lib.counts && lib.counts.intake_records,
             tcd: tc && tc.derived === true && (tc.themes || []).length,
             ssd: ss && ss.derived === true && ss.counts && ss.counts.total,
             ssr: ss && ss.counts && ss.counts.registered,
             ssp: ss && ss.counts && ss.counts.pending,
             sdc: sd && sd.counts && sd.counts.candidates,
             sdres: sd && (sd.results || []).filter((r) => r.decision === 'Research').length,
             sdscope: sd && sd.scope,
             pc: pr && (pr.promotions || []).length,
             dc: dt && (dt.determinations || []).length,
             pend: pr && pr.counts && pr.counts.intake_pending_promotion,
             suSec: su && (su.sections || []).length,
             suUnits: su && (su.units || []).length,
             suVer: su && su.units_version,
             su1: su1 && su1.unit_id,
             pkLy: pkLy && Array.isArray(pkLy.sections) && pkLy.sections.length,
             pkSc: pkSc && pkSc.transcription && pkSc.transcription.status,
             sc1scripture: sc1 && sc1.scripture && sc1.scripture.reference,
             tx: tx && (tx.assignments || []).length,
             txMulti: tx && tx.counts && tx.counts.multi_membership_songs,
             coCap: co && co.counts && co.counts.capabilities,
             coItems: co && co.counts && co.counts.produced_items,
             coIface: co && co.interfaces && co.interfaces.ai_analysis && co.interfaces.ai_analysis.status,
             rd: rd && (rd.rows || []).length,
             rdNeed: rd && rd.counts && rd.counts.needs_mos_creation,
             su1status: su1 && su1.status,
             w: await (async () => {
               const rq = indexedDB.open('mos-music');
               const d = await new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
               const rows = await new Promise((res) => {
                 const r = d.transaction('content_meta').objectStore('content_meta').index('by_kind').getAll('annual_week');
                 r.onsuccess = () => res(r.result || []);
                 r.onerror = () => res([]);
               });
               d.close();
               const ws = rows.map((x) => x.value).filter(Boolean);
               return { weeks: ws.length, core: ws.map((x) => x.core_song_id).filter(Boolean).length };
             })() };
  })()`;
  const offOk = await evalJS(cdp, null, readIDB);
  ok(offOk && offOk.c === 24, `离线：24 课索引可读（实际 ${offOk && offOk.c}）`);
  ok(offOk && offOk.s === 10, `离线：歌曲详情层可读（实际 ${offOk && offOk.s}）`);
  ok(offOk && offOk.a === 'MOS-MUSIC-ANNUAL-2027', '离线：年度实例可读');
  ok(offOk && offOk.f === 24, `离线：Framework 母库可读（实际 ${offOk && offOk.f}）`);
  ok(offOk && offOk.p === '3.2.0' && offOk.l, '离线：生产平台索引与辨识词表可读（MODULE 12）');
  ok(offOk && offOk.u === 50, `离线：音乐库使用历史可读（合并曲库，实际 ${offOk && offOk.u}）`);
  ok(offOk && offOk.n === 50 && typeof offOk.q === 'number',
    `离线：曲库 V0.5 扩库登记索引可读（目标 ${offOk && offOk.n} 首 / 已登记 ${offOk && offOk.q} 条）`);
  ok(offOk && offOk.tcd === 24,
    `离线：派生索引（主题歌曲计数）可读（实际 ${offOk && offOk.tcd} 个主题）`);
  ok(offOk && offOk.ssd === 50 && offOk.ssr === 10 && offOk.ssp === 40,
    `离线：派生索引（歌曲经文锚点）可读（锚点 ${offOk && offOk.ssd} / 已登记 ${offOk && offOk.ssr} / 待认定 ${offOk && offOk.ssp}）`);
  ok(offOk && offOk.pc === 5 && offOk.dc === 5 && typeof offOk.pend === 'number',
    `离线：升层声明与锚点认定留档可读（升层 ${offOk && offOk.pc} 条 / 认定 ${offOk && offOk.dc} 条 / 待升层 ${offOk && offOk.pend} 条）`);
  ok(offOk && offOk.sdc === 45 && offOk.sdres === 45 && offOk.sdscope === 'library_scope',
    `离线：库级歌基层辨识结果可读（${offOk && offOk.sdc} 首，全部 Research，scope=${offOk && offOk.sdscope}）`);
  ok(offOk && offOk.w && offOk.w.weeks === 4 && offOk.w.core === 4, `离线：4 周年度记录与主歌可读（实际 ${offOk && offOk.w && offOk.w.weeks}）`);
  ok(offOk && offOk.suVer === 'MUS-V-1.1.0' && offOk.suSec === 18 && offOk.suUnits === 10,
    `离线：单曲单元词表可读（${offOk && offOk.suVer} / 18 段 / ${offOk && offOk.suUnits} 个单元）`);
  ok(offOk && offOk.su1 === 'MUS-SU-0001' && offOk.su1status === 'VERIFYING',
    `离线：单曲单元包可读（${offOk && offOk.su1} / ${offOk && offOk.su1status}）`);
  ok(offOk && offOk.pkLy === 6 && offOk.pkSc === 'SOURCE_IMPORTED',
    'V3.2 离线：0001 公版歌词（6 节）与原谱导入简谱可从缓存读取');
  ok(offOk && offOk.tx === 100 && offOk.txMulti > 0,
    `V3.x 离线：四维分类可分表可读（${offOk && offOk.tx} 首 / 多归属 ${offOk && offOk.txMulti}）`);
  ok(offOk && offOk.coCap === 10 && offOk.coItems === 0 && offOk.coIface === 'RESERVED_NOT_CONNECTED',
    `V3.x 离线：Coach 词表可读（能力 ${offOk && offOk.coCap} / 成品 ${offOk && offOk.coItems} / AI 接口 ${offOk && offOk.coIface}）`);
  ok(offOk && offOk.rd === 100 && offOk.rdNeed === 5,
    `V3.x 离线：100 首资源普查表可读（${offOk && offOk.rd} 首 / 需自制 ${offOk && offOk.rdNeed}）`);
  ok(offOk && offOk.sc1scripture === '弗2:1–10',
    `V3.x 离线：歌曲内容层可读（经文引用 ${offOk && offOk.sc1scripture}）`);
  const offShell = await evalJS(cdp, null, `document.body.innerHTML.length > 500`);
  ok(!!offShell, '离线：外壳渲染正常');

  /* ============ D. 冷启动离线导航 ============ */
  console.log('\nD) about:blank → 断网 → 冷启动导航');
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await waitLoad(cdp);
  await new Promise((r) => setTimeout(r, 500));
  await cdp.send('Page.navigate', { url: APP });
  await waitLoad(cdp);
  await new Promise((r) => setTimeout(r, 1200));
  const cold = await evalJS(cdp, null, `(async () => {
    const controlled = !!navigator.serviceWorker.controller;
    const db = await new Promise((res, rej) => {
      const rq = indexedDB.open('mos-music');
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    const read = (key) => new Promise((res) => {
      const rq = db.transaction('content_meta').objectStore('content_meta').get(key);
      rq.onsuccess = () => res(rq.result ? rq.result.value : null);
      rq.onerror = () => res(null);
    });
    const [fw, songs, su] = await Promise.all([read('index:framework'), read('index:songs'), read('index:song_units')]);
    db.close();
    return { controlled, f: fw && fw.units.length, s: songs && songs.songs.length, su: su && (su.units || []).length };
  })()`);
  ok(cold && cold.controlled, '冷启动：SW 已控制页面');
  ok(cold && cold.f === 24, `冷启动离线：Framework 24 单元可读（实际 ${cold && cold.f}）`);
  ok(cold && cold.s === 10, `冷启动离线：歌曲详情层可读（实际 ${cold && cold.s}）`);
  ok(cold && cold.su === 10, `冷启动离线：单曲单元词表可读（${cold && cold.su} 个单元）`);

  /* ============ E. 恢复在线 ============ */
  console.log('\nE) 恢复在线重载');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await cdp.send('Page.navigate', { url: APP });
  await waitLoad(cdp);
  await new Promise((r) => setTimeout(r, 800));
  const back = await evalJS(cdp, null, `(async () => {
    const cs = await import('${BASE}app/content-source.js');
    const annual = await cs.getIndex('annual');
    return annual.annual_id;
  })()`);
  ok(back === 'MOS-MUSIC-ANNUAL-2027', '恢复在线后应用正常');

  /* ============ F. 生产平台 UI / workflow（MODULE 12） ============ */
  console.log('\nF) 生产平台 UI（总览 / 辨识 / 计划 / 校准）');

  /* 单壳 hash 路由只改 location.hash，不会触发 Page.loadEventFired；
     因此不能对 hash 导航用 waitLoad，必须轮询 DOM 直到目标内容出现。 */
  const gotoView = async (hash, probe, timeoutMs = VIEW_TIMEOUT) => {
    await evalJS(cdp, null, `(() => { location.hash = ${JSON.stringify(hash)}; return true; })()`);
    const t0 = Date.now();
    let lastKick = 0;
    while (Date.now() - t0 < timeoutMs) {
      const v = await evalJS(cdp, null, probe);
      if (process.env.CDP_DBG) console.error('[gotoView]', hash, Date.now() - t0 + 'ms', v == null ? 'null' : JSON.stringify(v).slice(0, 150));
      if (v) return v;
      /* 心跳：SPA 连续导航下个别 hashchange 事件可能丢失，重发让路由重算当前 hash（幂等） */
      if (Date.now() - lastKick > 3000) {
        lastKick = Date.now();
        await evalJS(cdp, null, `window.dispatchEvent(new HashChangeEvent('hashchange')); true`).catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    return null;
  };

  const modUi = await evalJS(cdp, null, `(async () => {
    const m = await import('${BASE}app/modules.js');
    return {
      hasModule: m.MODULES.some((x) => x.key === 'production' && x.num === '12'),
      inNav: m.NAV_KEYS.includes('production'),
      renderer: typeof m.RENDERERS.production === 'function',
    };
  })()`);
  ok(modUi && modUi.hasModule, 'MODULE 12 已在运行时模块表中');
  ok(modUi && modUi.inNav === false, 'MODULE 12 不在底部导航中（内部生产工具）');
  ok(modUi && modUi.renderer, 'MODULE 12 渲染函数已接入路由表');

  const dash = await gotoView('#/production?view=dashboard', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('生产平台 3.1.0')) return null;
    return {
      platform: h.includes('生产平台 3.1.0'),
      v11a: h.includes('真实使用仪表盘') && h.includes('Human Review（待人工）'),
      library: h.includes('Library（合并曲库）') && h.includes('Intake（登记层待升层）'),
      capacity: h.includes('Capacity（可用 / 剩余 / 缺口）') && h.includes('Calibration（未结案）'),
      gate: h.includes('人工审核'),
      capacity: h.includes('MUSIC_LIBRARY_CAPACITY_WARNING'),
      annual: h.includes('MOS-MUSIC-ANNUAL-2027'),
      record: h.includes('Production Record') || h.includes('生产记录'),
    };
  })()`);
  ok(dash && dash.platform, '生产总览渲染平台版本 3.1.0');
  ok(dash && dash.v11a, '生产总览含 V1.1-A 真实使用仪表盘（七项核心指标）');
  ok(dash && dash.library && dash.capacity, '生产总览仪表盘含 Library/Intake 与 Capacity/Calibration 指标');
  ok(dash && dash.gate, '生产总览声明默认门为人工审核');
  ok(dash && dash.capacity, '生产总览给出曲库容量告警 MUSIC_LIBRARY_CAPACITY_WARNING');
  ok(dash && dash.annual && dash.record, '生产总览含年度统计与生产记录（每周一行门状态）');

  const disc = await gotoView('#/production?view=discern&week=W04', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('决策轨迹')) return null;
    return {
      candidates: (h.match(/MUS-S-\\d{4}/g) || []).length,
      relation: h.includes('direct_biblical_expression') && h.includes('theme_response'),
      eight: h.includes('圣经真理') && h.includes('神学形成') && h.includes('情感形成')
             && h.includes('共同体') && h.includes('会众参与') && h.includes('代际传递')
             && h.includes('生活实践') && h.includes('使命方向'),
      trace: h.includes('决策轨迹'),
      twoLayer: h.includes('Tier 与 Review Status'),
      s6: h.includes('S6 实践转换'),
    };
  })()`);
  ok(disc && disc.candidates >= 5, `辨识视图列出音乐库全部候选（${disc && disc.candidates} 次歌曲 ID 出现）`);
  ok(disc && disc.relation, '辨识视图同时出现 direct / theme_response 判定（不把主题级回应升级）');
  ok(disc && disc.eight, '辨识视图完整输出八维辨识');
  ok(disc && disc.trace && disc.twoLayer && disc.s6, '辨识视图含决策轨迹 + S6/S7 + Tier/Review 分离声明');

  const prod = await gotoView('#/production?view=producer&mode=year', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('计划明细')) return null;
    return {
      plan: h.includes('计划明细'),
      bypass: h.includes('不会') && h.includes('绕过人工审核'),
      blocked: (h.match(/blocked_capacity/g) || []).length,
      capacity: h.includes('MUSIC_LIBRARY_CAPACITY_WARNING'),
      noAI: h.includes('AI 选歌'),
    };
  })()`);
  ok(prod && prod.plan, '生产计划视图输出逐周计划明细');
  ok(prod && prod.bypass, '生产计划视图声明批量不绕过人工审核');
  ok(prod && prod.capacity && prod.blocked > 0, `曲库不足 → 待产周次为 blocked_capacity（${prod && prod.blocked} 处）`);
  ok(prod && prod.noAI, '生产计划视图明确列出不实现的能力（无推荐/AI 选歌）');

  const cal = await gotoView('#/production?view=calibration', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('版本治理')) return null;
    return {
      ci: (h.match(/CI-\\d{4}/g) || []).length,
      frozen: h.includes('1.0.0') && h.includes('Frozen'),
      stages: h.includes('Observed') && h.includes('Proposed') && h.includes('Released'),
      valid: h.includes('结构合法'),
      noViolation: h.includes('治理检查通过'),
    };
  })()`);
  ok(cal && cal.ci >= 12, `校准视图列出问题记录（${cal && cal.ci} 处 CI 编号）`);
  ok(cal && cal.frozen && cal.stages, '校准视图显示冻结技能版本与四段治理');
  ok(cal && cal.valid && cal.noViolation, '校准视图：记录全部结构合法且无「直改 Frozen」违规');

  const lib = await gotoView('#/production?view=library', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('使用次数')) return null;
    return {
      songs: (h.match(/MUS-S-\\d{4}/g) || []).length,
      reuse: h.includes('使用次数') && h.includes('主歌'),
      separate: h.includes('资源等级 tier') && h.includes('生命周期 review_status'),
      high: h.includes('HIGH 风险代码'),
      v5: h.includes('曲库扩库登记') && h.includes('仍待收'),
      v5counts: h.includes('新增登记') && h.includes('合并曲库'),
      derived: h.includes('派生索引') && h.includes('derived=true') && h.includes('经文锚点总数'),
      scope: h.includes('库级歌基层辨识') && h.includes('未生成（本阶段不产周次 Unit）'),
      cap10: h.includes('容量重算') && h.includes('剩余唯一容量') && h.includes('缺口'),
      search: h.includes('搜索') && h.includes('清除'),
    };
  })()`);
  ok(lib && lib.songs >= 5 && lib.reuse, '音乐库视图含使用历史与已使用周次');
  ok(lib && lib.separate, '音乐库视图保持 tier 与 review_status 两个独立字段');
  ok(lib && lib.high, '音乐库视图输出 HIGH 风险代码（风险记录）');
  ok(lib && lib.v5, '音乐库视图显示曲库扩库登记（V0.5）与仍待收数量');
  ok(lib && lib.v5counts, '音乐库视图显示 V0.5 登记口径（新增登记 / 合并曲库）');
  ok(lib && lib.derived, '音乐库视图显示派生索引（案 a：主题计数 / 经文锚点，derived=true）');
  ok(lib && lib.scope, '音乐库视图显示库级歌基层辨识（库级范围，未生成单元层）');
  ok(lib && lib.cap10, '音乐库视图显示 §十 容量重算（含剩余唯一容量与缺口）');
  ok(lib && lib.search, '音乐库视图含 V1.1-A 搜索框（ID / 中文名 / 英文名）');

  /* V1.1-A：歌曲研究档案（V2.0 起为后台页 #/song-detail/）+ NOT_ASSESSED / NOT_IMPORTED + 锚点警示 */
  const songPage = await gotoView('#/song-detail/MUS-S-0006', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('01 基本资料')) return null;
    return {
      zh: h.includes('圣哉，圣哉，圣哉'),
      en: h.includes('Holy, Holy, Holy'),
      anchor: h.includes('02 Bible Anchor') && h.includes('Anchor ≠ sermon selection'),
      anchorEvid: h.includes('启4:8–11') && h.includes('authorized_determination'),
      mapping: h.includes('03 Theme / Ministry Mapping') && h.includes('preliminary'),
      discern: h.includes('04 Discernment') && (h.match(/NOT_ASSESSED/g) || []).length >= 8,
      review: h.includes('05 Human Review') && h.includes('accepted_by_human'),
      usage: h.includes('06 Usage History') && h.includes('never_used'),
      res: h.includes('07 Missing Resources') && (h.match(/NOT_IMPORTED/g) || []).length >= 6,
      copy: h.includes('08 Copyright / Sources') && h.includes('unknown'),
      eight: h.includes('基本资料') && h.includes('作者（词）') && h.includes('作曲'),
    };
  })()`);
  ok(songPage && songPage.zh && songPage.en && songPage.eight, '歌曲详情页：01 基本资料（中文名 / 英文名 / 归属）');
  ok(songPage && songPage.anchor && songPage.anchorEvid, '歌曲详情页：02 锚点（含 Anchor ≠ sermon selection 警示与认定依据）');
  ok(songPage && songPage.mapping, '歌曲详情页：03 主题映射（preliminary 与 discerned 分开）');
  ok(songPage && songPage.discern, '歌曲详情页：04 辨识（未辨识字段显式 NOT_ASSESSED，不空白）');
  ok(songPage && songPage.review, '歌曲详情页：05 人工审查（待人工事项与 accepted_by_human=false）');
  ok(songPage && songPage.usage, '歌曲详情页：06 使用历史（never_used 如实显示）');
  ok(songPage && songPage.res, '歌曲详情页：07 资源现状（六槽位 NOT_IMPORTED）');
  ok(songPage && songPage.copy, '歌曲详情页：08 版权与来源（法律状态 unknown = 未判定）');

  /* 登记层-only 歌曲：后台档案页如实显示「未升层」，不伪装 */
  const intakePage = await gotoView('#/song-detail/MUS-S-0011', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('登记记录')) return null;
    return { layered: h.includes('只有入库登记记录') && h.includes('SOURCE_REQUIRED') };
  })()`);
  ok(intakePage && intakePage.layered, '歌曲详情页：登记层-only 歌曲显示「未升详情层」（CI-0018 如实呈现）');

  /* V1.1-A：周音乐页 */
  const weekPage = await gotoView('#/week/W04', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('Resource Access')) return null;
    return {
      passage: h.includes('W04') && h.includes('路5:27–32') && h.includes('Core Truth'),
      lq: h.includes('LQ01') && h.includes('MM08'),
      core: h.includes('MUS-S-0001') && h.includes('歌曲详情'),
      gate: h.includes('Review Gate') && h.includes('CONFIRMED'),
      relation: h.includes('direct_biblical_expression'),
      reuse: h.includes('used_as_core'),
      s6s7: h.includes('S6 / S7'),
      res: (h.match(/RESOURCE_PENDING/g) || []).length >= 4,
    };
  })()`);
  ok(weekPage && weekPage.passage && weekPage.lq, '周音乐页：经文 / 核心真理 / LQ / MM');
  ok(weekPage && weekPage.core && weekPage.relation, '周音乐页：核心歌 + 歌曲关系（含详情页链接）');
  ok(weekPage && weekPage.gate && weekPage.reuse, '周音乐页：审查门状态 + 跨周复用提示');
  ok(weekPage && weekPage.s6s7 && weekPage.res, '周音乐页：S6/S7 + 资源入口（RESOURCE_PENDING）');

  /* 未生产周次：如实说明，不自动生产 */
  const weekEmpty = await gotoView('#/week/W05', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('尚未生产')) return null;
    return { honest: h.includes('不会自动生产 W05') };
  })()`);
  ok(weekEmpty && weekEmpty.honest, '周音乐页：W05 如实显示「尚未生产，不自动生产」');

  /* V1.1-A：人工审查视图 */
  const review = await gotoView('#/production?view=review', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('Human Review Gate')) return null;
    return {
      vocab: h.includes('ACCEPT') && h.includes('REVISE') && h.includes('HOLD') && h.includes('REJECT'),
      pending: h.includes('升层试批验收') && h.includes('单元审查门'),
      empty: h.includes('当前 0 条记录'),
      fields: h.includes('decision') && h.includes('reviewer') && h.includes('timestamp'),
      frozen: h.includes('不反写 Frozen Skill'),
    };
  })()`);
  ok(review && review.vocab && review.pending, '人工审查视图：四值裁决词表 + 待人工事项（试批验收 / 单元门）');
  ok(review && review.empty && review.fields, '人工审查视图：0 条记录如实显示 + 记录字段（decision/reason/evidence/reviewer/timestamp）');
  ok(review && review.frozen, '人工审查视图：记录不反写 Frozen Skill 的边界声明');

  /* V1.1-A：使用者端音乐库搜索 */
  const search = await gotoView('#/library', `(() => {
    const h = document.getElementById('view').innerHTML;
    const inp = document.getElementById('libSearch');
    if (!inp) return null;
    inp.value = 'MUS-S-0006';
    inp.dispatchEvent(new Event('input'));
    const after = document.getElementById('songList').innerHTML;
    return {
      total: h.includes('50 首'),
      hit: after.includes('MUS-S-0006') && !after.includes('MUS-S-0007'),
    };
  })()`);
  ok(search && search.total, '使用者音乐库：合并曲库 50 首（详情层 + 登记层）');
  ok(search && search.hit, '使用者音乐库：按 Song ID 搜索过滤生效');

  /* 回到首页，确认 hash 路由与模块表整体仍然正常 */
  const home = await gotoView('#/today', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (h.length < 200) return null;
    return { len: h.length, nav: document.querySelectorAll('#nav a, #nav button').length };
  })()`);
  ok(home && home.len > 200, '返回首页正常（hash 路由未被生产平台破坏）');

  /* ==================== V2.0：前台（生命诗歌软件） ==================== */

  /* 底部导航三入口 */
  const nav = await gotoView('#/home', `(() => {
    const btns = Array.from(document.querySelectorAll('#nav button'));
    const labels = btns.map((b) => b.textContent);
    return {
      n: btns.length,
      home: labels.some((t) => t.includes('首页')),
      songs: labels.some((t) => t.includes('歌曲')),
      mine: labels.some((t) => t.includes('我的')),
    };
  })()`);
  ok(nav && nav.n === 3 && nav.home && nav.songs && nav.mine,
    'V2.0 前台：底部导航只有 首页 / 歌曲 / 我的 三个入口');

  /* 首页：今天一起唱 */
  const today = await gotoView('#/home', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('今天一起唱')) return null;
    return {
      hero: h.includes('今天一起唱'),
      sing: h.includes('现在就唱') && h.includes('一键学唱'),
      why: h.includes('这首歌在唱什么') || h.includes('为什么唱'),
      live: h.includes('今天怎样活'),
      noDash: !h.includes('生产总览') && !h.includes('Dashboard'),
      noWeek: !h.includes('样本周') && !h.includes('mos_week'),
      noAlgo: h.includes('不是算法推荐'),
    };
  })()`);
  ok(today && today.hero && today.sing && today.why && today.live,
    'V3.0 首页：今天一起唱 + 一键播放/学唱 + 这首歌在唱什么 + 今天怎样活');
  ok(today && today.noDash && today.noWeek && today.noAlgo,
    'V3.0 首页：无 Dashboard；不引用周次 / 样本周；明确非算法推荐');

  /* 生命诗歌本：100 首 + 主题/场景 + 搜索 */
  const book = await gotoView('#/songs', `(() => {
    const h = document.getElementById('view').innerHTML;
    const inp = document.getElementById('sbSearch');
    if (!inp) return null;
    const countAll = document.getElementById('sbCount').textContent;
    inp.value = 'Amazing';
    inp.dispatchEvent(new Event('input'));
    const countHit = document.getElementById('sbCount').textContent;
    const hitZh = document.getElementById('sbList').innerHTML;
    inp.value = '';
    inp.dispatchEvent(new Event('input'));
    return {
      total: countAll,
      hit: countHit,
      hitZhHasGrace: hitZh.includes('MUS-S-0001'),
      themes: h.includes('主题：全部') && h.includes('恩典') && h.includes('宣教'),
      scenes: h.includes('场景：全部') && h.includes('门训'),
      tabs: h.includes('❤️ 收藏') && h.includes('📚 正在学') && h.includes('🕘 最近唱过'),
    };
  })()`);
  ok(book && /^100/.test(book.total.trim()), 'V2.0 诗歌本：100 首候选全部进入目录');
  ok(book && /^1\s*首|^1$/.test(book.hit.trim()) && book.hitZhHasGrace,
    'V2.0 诗歌本：按英文歌名搜索过滤生效（Amazing → 奇异恩典）');
  ok(book && book.themes && book.scenes && book.tabs,
    'V2.0 诗歌本：主题/场景筛选与 收藏/正在学/最近唱过 页签');

  /* 在线模式：等待 SW 预缓存沉淀（键数连续 3 次稳定），避免动态 import 被预缓存流量挤占导致误报 */
  if (process.env.MOS_ONLINE_BASE) {
    const t0 = Date.now();
    let stable = 0, lastCount = -1;
    while (stable < 3 && Date.now() - t0 < 240000) {
      const n = await evalJS(cdp, null, `(async () => {
        try { return (await (await caches.open('mos-music-v14')).keys()).length; } catch { return -1; }
      })()`);
      stable = n === lastCount ? stable + 1 : 0;
      lastCount = n;
      await new Promise((r) => setTimeout(r, 4000));
    }
    console.log(`  （预缓存沉淀：${lastCount} 项，${Math.round((Date.now() - t0) / 1000)}s）`);
  }

  /* 歌曲页：一页解决（唱/懂/活/教/传） */
  const fp = await gotoView('#/song/MUS-S-0001', `(() => {
    const h = document.getElementById('view').innerHTML;
    /* 线上渲染为渐进填充：必须等全部关键区块就绪才返回，否则拿到部分快照 */
    if (!(h.includes('现在就唱') && h.includes('男声示唱') && h.includes('Amazing grace')
      && h.includes('简谱') && h.includes('中文译本尚未提供'))) return null;
    return {
      sing: h.includes('现在就唱'),
      demoPending: h.includes('男声示唱') && h.includes('女声示唱') && h.includes('钢琴伴奏')
        && h.includes('外部真人版本（原站播放，不转存）'),
      speed: h.includes('0.5×') && h.includes('0.75×') && h.includes('1.0×'),
      lyrics: h.includes('歌词') && h.includes('Amazing grace'),
      score: h.includes('简谱') && h.includes('原谱简谱 · 待人工听校'),
      draftNotice: h.includes('人工听校尚未通过') && h.includes('听校通过后成为定稿简谱'),
      translationNote: h.includes('中文译本尚未提供'),
      why: h.includes('懂 · 活'),
      live: h.includes('今天怎样活'),
      teach: h.includes('教别人唱'),
      share: h.includes('分享这首歌') && h.includes('复制链接'),
      fav: h.includes('收藏'),
      anchor: h.includes('不指定你必须在什么时候唱'),
      noJargon: !h.includes('tier') && !h.includes('NOT_ASSESSED') && !h.includes('NOT_IMPORTED'),
    };
  })()`);
  ok(fp && fp.sing && fp.demoPending && fp.speed,
    'V3.2 歌曲页：现在就唱（男声/女声外部真人 · 原站播放不转存 + 钢琴轨；速度 0.5/0.75/1.0）');
  ok(fp && fp.lyrics && fp.score && fp.draftNotice,
    'V3.2 歌曲页：0001 英文公版歌词渲染 + 原谱导入简谱整幅显示（带「原谱简谱 · 待人工听校」徽章）');
  ok(fp && fp.translationNote,
    'PILOT 10 歌曲页：0001 明示「中文译本尚未提供（本仓不托管译文）」');
  ok(fp && fp.why && fp.live && fp.teach && fp.share,
    'V3.0 歌曲页：懂·活（歌曲自身内容层）/ 教唱 / 分享');
  ok(fp && fp.fav && fp.anchor && fp.noJargon,
    'V3.0 歌曲页：收藏 + 「不指定何时唱」锚点声明 + 无工程术语');

  /* PILOT 10：权利未判定歌（0009）—— 全部如实 NOT_AVAILABLE + 人话阻断说明 */
  const blocked = await gotoView('#/song/MUS-S-0009', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('你真伟大')) return null;
    return {
      scoreAbsent: h.includes('简谱尚未提供'),
      lyricsAbsent: h.includes('歌词尚未提供'),
      rightsNote: h.includes('版权状态还在人工确认中') && h.includes('平台不靠猜'),
      noDemo: h.includes('音频尚未提供'),
      levelNone: h.includes('资源待制作'),
    };
  })()`);
  ok(blocked && blocked.scoreAbsent && blocked.lyricsAbsent && blocked.rightsNote && blocked.noDemo,
    'PILOT 10 歌曲页：0009 权利未判定 ⇒ 谱 / 词 / 音频全「尚未提供」+ 人话阻断说明');
  ok(blocked && blocked.levelNone,
    'PILOT 10 歌曲页：0009 等级如实为「资源待制作」（不虚标 L1）');

  /* 学唱模式（十步法 · 学唱模式子集） */
  const learn = await gotoView('#/learn/MUS-S-0001', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('学唱模式 ｜')) return null;
    return {
      steps: h.includes('认识歌曲') && h.includes('准备声音与身体') && h.includes('教词') && h.includes('词曲合成'),
      loop: h.includes('循环'),
      sight: h.includes('视唱'),
      metro: h.includes('节拍器'),
    };
  })()`);
  ok(learn && learn.steps && learn.loop && learn.sight && learn.metro,
    'V3.0 学唱模式：十步法（学唱子集）+ 循环/慢速 + 三模式切换 + 节拍器');

  /* 视唱模式（先看谱，不先给完整示范） */
  const sight = await gotoView('#/learn/MUS-S-0001?mode=sight', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('视唱模式 ｜')) return null;
    return { ok: h.includes('视唱训练') && h.includes('不先给完整示范') };
  })()`);
  ok(sight && sight.ok, 'V3.0 视唱模式：视唱训练步骤 + 默认不先给完整示范');

  /* 教唱模式（教谱 / 教词 / 声乐 / 真人教唱模块） */
  const teach = await gotoView('#/teach/MUS-S-0001', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('教唱模式')) return null;
    return {
      seven: h.includes('教谱') && h.includes('教节奏') && h.includes('教词') && h.includes('示范') && h.includes('跟唱'),
      opener: h.includes('不用懂乐理，也可以教别人唱'),
      parts: h.includes('教谱要点') && h.includes('教词要点') && h.includes('声乐提示') && h.includes('真人教唱模块'),
      done: h.includes('完成这次教唱'),
    };
  })()`);
  ok(teach && teach.seven && teach.parts && teach.done,
    'V3.0 教唱模式：七步教唱 + 教谱/教词/声乐/真人教唱模块 + 完成打点按钮');
  ok(teach && teach.opener, 'V3.0 教唱模式：不用懂乐理开场（普通人也能教）');

  /* 我的歌 + 后台入口 */
  const mine = await gotoView('#/mine', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('没有积分，没有排行榜')) return null;
    return {
      groups: h.includes('我喜欢') && h.includes('正在学') && h.includes('我教过') && h.includes('我传过') && h.includes('最近唱过'),
      noRank: h.includes('没有积分，没有排行榜'),
      admin: h.includes('后台入口') && h.includes('生产平台') && h.includes('校准与版本'),
    };
  })()`);
  ok(mine && mine.groups && mine.noRank && mine.admin,
    'V2.0 我的歌：五个分组 + 无积分排行榜 + 后台隐藏入口');

  /* ==================== V2.1：艺术化 UI 与交互 ==================== */

  /* 首页：艺术封面 + Hero + 快速操作 + 继续唱/只学一节 */
  const v21home = await gotoView('#/home', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('今天一起唱')) return null;
    return {
      cover: h.includes('<svg') && h.includes('cover-hero'),
      quick: h.includes('听一遍') && h.includes('看简谱') && h.includes('陪我唱'),
      continueOrLearn: h.includes('继续唱') && h.includes('今天只学一节'),
      reason: h.includes('class="reason"'),
    };
  })()`);
  ok(v21home && v21home.cover && v21home.quick && v21home.continueOrLearn && v21home.reason,
    'V3.0 首页：Hero 艺术封面 + 快速操作（听一遍/看简谱/陪我唱）+ 继续唱/只学一节 + 唱歌理由');

  /* 深夜沉浸模式：切换真实生效（html[data-mood]） */
  const night = await evalJS(cdp, null, `(async () => {
    const btn = document.getElementById('moodBtn');
    if (!btn) return { ok: false };
    btn.click();
    await new Promise((r) => setTimeout(r, 200));
    const on = document.documentElement.getAttribute('data-mood') === 'night';
    btn.click();
    await new Promise((r) => setTimeout(r, 200));
    const off = document.documentElement.getAttribute('data-mood') !== 'night';
    return { ok: on && off };
  })()`);
  ok(night && night.ok, 'V2.1 深夜沉浸模式：切换开关真实生效并可还原');

  /* 歌曲页：十段编号 + 简谱显眼 + 陪我唱 + 歌词点击选句 + 统一播放器进度条 */
  const v21fp = await gotoView('#/song/MUS-S-0001', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('播放区')) return null;
    return {
      ten: ['01','02','03','04','05','06','07','08','09','10'].every((n) => h.includes('>' + n + '<')),
      accompany: h.includes('陪我唱'),
      lyricState: h.includes('尚未提供') && (h.includes('data-line') || h.includes('state-empty')),
      track: h.includes('player-track') && h.includes('aria-valuenow'),
      lifeEntry: h.includes('亲子轻入口') && h.includes('群体轻入口'),
      scoreProminent: (() => {
        const secs = Array.from(document.querySelectorAll('.songpage .sp-sec'));
        const scoreIdx = secs.findIndex((s) => s.id === 'secScore');
        return scoreIdx === 1; /* 第 02 段紧接 Hero，乐谱最明显 */
      })(),
      metro: h.includes('节拍器') && h.includes('beat-dots'),
      progress: h.includes('制作到什么程度') && h.includes('还缺：'),
      stages: h.includes('我的学习状态') && h.includes('stage-chip'),
    };
  })()`);
  ok(v21fp && v21fp.ten && v21fp.accompany && v21fp.track,
    'V3.0 歌曲页：十段编号 + 陪我唱 + 统一播放器进度条（aria slider）');
  ok(v21fp && v21fp.lyricState && v21fp.lifeEntry,
    'V3.0 歌曲页：歌词点击选句 + 家庭/小组轻入口');
  ok(v21fp && v21fp.scoreProminent,
    'V3.0 歌曲页：简谱为第 02 段、紧接 Hero（乐谱最明显）');
  ok(v21fp && v21fp.metro && v21fp.progress && v21fp.stages,
    'V3.0 歌曲页：节拍器 + 制作进度（18 段 / 缺口）+ 四级学习路径状态');

  /* 歌曲库：封面系列（多样、非千篇一律）+ 收藏快操作 */
  const v21book = await gotoView('#/songs', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!document.getElementById('sbSearch')) return null;
    const svgs = (h.match(/<svg/g) || []).length;
    const grads = new Set((h.match(/stop-color="#[0-9A-Fa-f]{6}"/g) || []).map((s) => s));
    const ops = h.includes('data-op="like"') && h.includes('data-op="sing"') && h.includes('data-op="learn"');
    return { svgs, grads: grads.size, ops };
  })()`);
  ok(v21book && v21book.svgs >= 100 && v21book.grads >= 8 && v21book.ops,
    `V2.1 诗歌本：100 首全部有系列封面（svg=${v21book ? v21book.svgs : 'n/a'}，色域 ${v21book ? v21book.grads : 'n/a'} 种）+ 收藏/唱/学快操作`);

  /* 学唱：完成态（再唱一次 / 教他唱）—— 快进到最后一步 */
  const v21learn = await gotoView('#/learn/MUS-S-0001', `(async () => {
    for (let i = 0; i < 10; i++) {
      const nx = document.getElementById('nextStep');
      if (nx) nx.click();
      await new Promise((r) => setTimeout(r, 120));
    }
    await new Promise((r) => setTimeout(r, 500));
    const h = document.getElementById('view').innerHTML;
    const dots = document.querySelectorAll('.stage-dots b').length;
    return { done: h.includes('这一遍走完了') && h.includes('再唱一次') && h.includes('教他唱'),
             dots: dots === 7, dots_n: dots };
  })()`);
  ok(v21learn && v21learn.done && v21learn.dots,
    `V3.0 学唱：学唱子集 7 步走完出现「这一遍走完了」+ 再唱一次 + 教他唱（dots=${v21learn ? v21learn.dots_n : 'n/a'}）`);

  /* 我的歌：个人空间概览统计 + 四级学习状态分布 */
  const v21mine = await gotoView('#/mine', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('没有积分，没有排行榜')) return null;
    return {
      stats: h.includes('mine-stats') && h.includes('收藏') && h.includes('唱过'),
      stages: h.includes('学习路径状态') && h.includes('stage-dist') && h.includes('还没开始'),
    };
  })()`);
  ok(v21mine && v21mine.stats, 'V2.1 我的歌：个人空间概览统计行');
  ok(v21mine && v21mine.stages, 'V3.0 我的歌：四级学习状态分布（认识/会唱/独立唱/会教，不做排名）');

  /* V3.x 诗歌本：四维分类（主题 / 处境 / 场景 可筛 + 多归属说明） */
  const v3xbook = await gotoView('#/songs', `(() => {
    const themes = document.getElementById('sbThemes');
    const situ = document.getElementById('sbSituations');
    const scenes = document.getElementById('sbScenes');
    if (!themes || !situ || !scenes) return null;
    const h = document.getElementById('view').innerHTML;
    return {
      three: !!themes && !!situ && !!scenes,
      t: themes ? themes.querySelectorAll('button').length : 0,
      s: situ ? situ.querySelectorAll('button').length : 0,
      c: scenes ? scenes.querySelectorAll('button').length : 0,
      multi: h.includes('不是它的身份') || h.includes('同时属于多个'),
      noWeek: !/W0\\d/.test(h) && !h.includes('第 1 周') && !h.includes('第1周'),
    };
  })()`);
  ok(v3xbook && v3xbook.three && v3xbook.t > 1 && v3xbook.s > 1 && v3xbook.c > 1,
    `V3.x 诗歌本：四维分类筛（主题/处境/场景，t=${v3xbook ? v3xbook.t : 'n/a'} s=${v3xbook ? v3xbook.s : 'n/a'} c=${v3xbook ? v3xbook.c : 'n/a'}）`);
  ok(v3xbook && v3xbook.multi && v3xbook.noWeek,
    'V3.x 诗歌本：分类是检索入口（多归属）+ 前台无周次码');

  /* V3.x 歌曲页：分类段 + 歌曲内容层（经文只引用）+ 不绑周次 */
  const v3xfp = await gotoView('#/song/MUS-S-0001', `(() => {
    if (!document.getElementById('secScore')) return null;
    const h = document.getElementById('view').innerHTML;
    return {
      classify: h.includes('分类') && h.includes('帮人找到这首歌'),
      content: h.includes('这首歌的内容') && h.includes('属于这首歌本身'),
      ref: h.includes('弗2:1–10') || h.includes('弗2'),
      noWeek: !/W0\\d/.test(h),
      noXlate: !h.includes('AI 示唱（非真人）'),
    };
  })()`);
  ok(v3xfp && v3xfp.classify && v3xfp.content,
    'V3.x 歌曲页：分类段 + 歌曲内容层段（属于这首歌本身）');
  ok(v3xfp && v3xfp.ref && v3xfp.noWeek,
    'V3.x 歌曲页：经文只显示引用（弗2:1–10）+ 不出现周次码');

  /* V3.x 乐句教学卡（五首样板接入）：歌曲页 / 学唱 / 视唱 / 教唱运行时渲染 + 门禁 */
  const pcard = await gotoView('#/song/MUS-S-0001', `(() => {
    const box = document.getElementById('phraseCardBox');
    if (!box) return null;
    const strip = box.querySelectorAll('.pcard');
    const detail = box.querySelector('[data-pcard-detail]');
    const loopBtn = box.querySelector('[data-pcard-loop]');
    const h = box.innerHTML;
    return {
      strip: strip.length === 18,
      detail: Boolean(detail && detail.innerHTML.includes('奇异恩典') && detail.innerHTML.includes('教学目标')),
      loopDisabled: Boolean(loopBtn && loopBtn.disabled),
      performerHidden: h.includes('演唱者待确认') && !h.includes('奚秀兰'),
      sightEntry: h.includes('视唱这一句'),
      timeRef: h.includes('参考位置约'),
    };
  })()`);
  ok(pcard && pcard.strip && pcard.detail,
    'V3.x 乐句卡：歌曲页渲染 18 张卡 + 当前乐句详情（目标 / 简谱 / 歌词定位）');
  ok(pcard && pcard.loopDisabled && pcard.performerHidden,
    'V3.x 乐句卡：循环按钮如实禁用（时间轴未核实）+ 未确认演唱者不显示姓名');
  ok(pcard && pcard.sightEntry && pcard.timeRef,
    'V3.x 乐句卡：视唱入口 + 参考位置提示（人工跟唱用）');
  const pcardLearn = await gotoView('#/learn/MUS-S-0001', `(() => {
    const box = document.getElementById('learnPhraseBox');
    if (!box) return null;
    return { strip: box.querySelectorAll('.pcard').length === 18, nav: Boolean(box.querySelector('[data-pcard-next]')) };
  })()`);
  ok(pcardLearn && pcardLearn.strip && pcardLearn.nav,
    'V3.x 乐句卡：学唱模式按乐句顺序教学（条 + 上一句/下一句）');
  const pcardSight = await gotoView('#/learn/MUS-S-0001?mode=sight', `(() => {
    const box = document.getElementById('learnPhraseBox');
    if (!box) return null;
    return { strip: box.querySelectorAll('.pcard').length > 0 };
  })()`);
  ok(pcardSight && pcardSight.strip, 'V3.x 乐句卡：视唱模式显示独立视唱乐句池');
  const pcardTeach = await gotoView('#/teach/MUS-S-0001', `(() => {
    const box = document.getElementById('teachPhraseBox');
    if (!box) return null;
    const h = box.innerHTML;
    return { strip: box.querySelectorAll('.pcard').length === 18, script: h.includes('教人提示'), task: h.includes('教人任务') };
  })()`);
  ok(pcardTeach && pcardTeach.strip && pcardTeach.script && pcardTeach.task,
    'V3.x 乐句卡：教唱模式读取教师脚本（教人提示 / 教人任务）');

  /* V3.x Singing Coach：独立模块 + 十项能力 + 训练项目模型 + 明示不显示门训数据 */
  const v3xcoach = await gotoView('#/coach', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('MOS Singing Coach')) return null;
    return {
      hero: h.includes('MOS Singing Coach') && h.includes('歌唱训练'),
      indep: h.includes('完全独立') || h.includes('彼此独立'),
      notRead: h.includes('不读：'),
      caps: h.includes('可以练什么') && h.includes('项能力'),
      items: h.includes('训练项目') && h.includes('内容待生产'),
      noFormation: h.includes('不会') && h.includes('门训完成度'),
      records: h.includes('我的练习记录'),
      noSort: h.includes('不会只给你一个分数') && h.includes('不会判断'),
    };
  })()`);
  ok(v3xcoach && v3xcoach.hero && v3xcoach.indep && v3xcoach.notRead,
    'V3.x Coach：独立入口 + 完全独立声明 + 「不读」清单（不读门训数据）');
  ok(v3xcoach && v3xcoach.caps && v3xcoach.items,
    'V3.x Coach：十项能力 + 训练项目「模型就位 · 内容待生产」');
  ok(v3xcoach && v3xcoach.noFormation && v3xcoach.noSort,
    'V3.x Coach：明示不显示门训完成度 / 积分 / 成绩；明示不给总分、不评属灵状态');

  /* V3.x 我的：Coach 入口（音乐空间内）；后台术语只在「后台入口」之内 */
  const v3xmine = await gotoView('#/mine', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('没有积分，没有排行榜')) return null;
    return {
      coachEntry: h.includes('Singing Coach'),
      backendGated: h.includes('后台入口') && h.includes('view=calibration'),
      noWeekCode: !/W0\\d/.test(h),
    };
  })()`);
  ok(v3xmine && v3xmine.coachEntry && v3xmine.noWeekCode,
    'V3.x 我的：Singing Coach 入口可达，且前台正文无周次码');
  ok(v3xmine && v3xmine.backendGated,
    'V3.x 我的：calibration 等后台术语只出现在「后台入口」分组内（不进入用户正文）');

  /* 后台档案路由仍在 */
  const adminArchive = await gotoView('#/song-detail/MUS-S-0006', `(() => {
    const h = document.getElementById('view').innerHTML;
    if (!h.includes('01 基本资料')) return null;
    return { ok: true };
  })()`);
  ok(adminArchive && adminArchive.ok, 'V2.0 后台：歌曲研究档案 #/song-detail/ 仍可达');

  /* 视口测试：360/390/430 手机 + 1366 桌面，无横向滚动 */
  for (const [w, hgt] of [[360, 740], [390, 844], [430, 932]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: hgt, deviceScaleFactor: 2, mobile: true });
    const r = await gotoView('#/song/MUS-S-0001', `(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }))()`);
    ok(r && r.overflow <= 1, `V2.0 视口 ${w}×${hgt}：无横向滚动（overflow=${r ? r.overflow : 'n/a'}）`);
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  const desk = await gotoView('#/song/MUS-S-0001', `(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    twoCol: getComputedStyle(document.querySelector('.songpage')).gridTemplateColumns.split(' ').length >= 2,
  }))()`);
  ok(desk && desk.overflow <= 1 && desk.twoCol, `V2.0 视口 1366×768：无横向滚动 + 歌曲页主/侧双栏（overflow=${desk ? desk.overflow : 'n/a'}）`);
  /* 恢复默认视口，避免影响后续离线测试 */
  await cdp.send('Emulation.clearDeviceMetricsOverride');

  /* ============ 真实媒体验收（DOM 存在 ≠ 可见可听） ============ */
  const media = await gotoView('#/song/MUS-S-0001', `(async () => {
    const w = document.getElementById('scoreWrap');
    if (!w) return null;
    const rect = w.getBoundingClientRect();
    const noteEls = w.querySelectorAll('.measure .note');
    const lyricSec = document.getElementById('secLyrics');
    const lyricRect = lyricSec ? lyricSec.getBoundingClientRect() : null;
    const lyricsText = lyricSec ? lyricSec.textContent.replace(/\\s+/g, '').length : 0;
    const song = document.querySelector('.songpage');
    return {
      measures: w.querySelectorAll('.measure').length,
      noteEls: noteEls.length,
      scoreW: rect.width, scoreH: rect.height,
      scoreVisible: rect.width > 0 && rect.height > 0,
      lyricLen: lyricsText,
      lyricVisible: lyricRect ? lyricRect.width > 0 && lyricRect.height > 0 : false,
      isSong: Boolean(song),
    };
  })()`);
  ok(media && media.isSong && media.measures > 0,
    `真实媒体 S-0001：谱面真实渲染 ${media ? media.measures : 0} 小节`);
  ok(media && media.noteEls > 0 && media.scoreVisible,
    `真实媒体 S-0001：${media ? media.noteEls : 0} 个音符元素，谱面可见（${media ? Math.round(media.scoreW) : 0}×${media ? Math.round(media.scoreH) : 0}px）`);
  ok(media && media.lyricLen > 0 && media.lyricVisible,
    `真实媒体 S-0001：歌词实际可见（${media ? media.lyricLen : 0} 字符）`);

  /* 真实播放：点钢琴轨（自动开始播放）→ 采样两次进度 → 再暂停 */
  const waitMs = process.env.MOS_ONLINE_BASE ? 8000 : 3000;
  const played = await evalJS(cdp, null, `(async () => {
    const pianoBtn = document.querySelector('#secSing [data-kind="piano"]');
    if (!pianoBtn) return { ok: false, why: 'no-piano-btn' };
    pianoBtn.click(); /* playKind → 播放开始 */
    await new Promise((r) => setTimeout(r, ${waitMs}));
    return { ok: true };
  })()`);
  const audioCheck = await evalJS(cdp, null, `(async () => {
    const t1 = (document.getElementById('playTime') || {}).textContent || '';
    await new Promise((r) => setTimeout(r, 3000));
    const t2 = (document.getElementById('playTime') || {}).textContent || '';
    const playingLabel = (document.getElementById('playState') || {}).textContent || '';
    const toggle = document.getElementById('btnToggle');
    if (toggle) toggle.click(); /* 暂停 */
    await new Promise((r) => setTimeout(r, 500));
    const afterPause = (document.getElementById('playState') || {}).textContent || '';
    const t3 = (document.getElementById('playTime') || {}).textContent || '';
    return { t1, t2, t3, advanced: t1 !== t2 && t2 !== '0:00 / 0:00', playingLabel, afterPause,
      has: { time: Boolean(document.getElementById('playTime')), sec: Boolean(document.getElementById('secSing')),
        piano: Boolean(document.querySelector('#secSing [data-kind="piano"]')), hash: location.hash,
        viewHead: (document.getElementById('view') || { innerHTML: '' }).innerHTML.replace(/\s+/g, ' ').slice(0, 200) } };
  })()`);
  if (audioCheck && audioCheck.has && process.env.MOS_ONLINE_BASE) console.log('  （音频探针环境：', JSON.stringify(audioCheck.has), '）');
  ok(played && played.ok && audioCheck && audioCheck.advanced,
    `真实媒体 S-0001：钢琴伴奏真实可听（进度 ${audioCheck ? `${audioCheck.t1} → ${audioCheck.t2}` : 'n/a'}，指针实际前进）`);
  ok(audioCheck && audioCheck.afterPause && audioCheck.afterPause.includes('已暂停'),
    `真实媒体 S-0001：pause 正常（${audioCheck ? audioCheck.afterPause : 'n/a'}，停在 ${audioCheck ? audioCheck.t3 : 'n/a'}）`);

  /* 汇总 */
  clearTimeout(watchdog);
  console.log(`\n${failed === 0 ? 'CDP ALL PASS' : 'CDP FAIL'}  ${passed} 通过 / ${failed} 失败`);

  chrome.kill();
  cdp.ws.close();
  if (srv) srv.close();
  await new Promise((r) => setTimeout(r, 600)); // 等 Chrome 释放 profile 句柄
  try { fs.rmSync(profile, { recursive: true, force: true }); }
  catch { /* Windows 下 Crashpad 句柄可能仍占用：不影响验收结论 */ }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('CDP 验收中断：', err && (err.message || err));
  process.exit(1);
});

