/* =========================================================
   MOS-MUSIC｜落地路由探针（线上专用）
   ---------------------------------------------------------
   目的：验证「无 hash 首次访问线上根 URL」落在音乐首页，
   而不是后台门训首页（#/today）。
   两轮验证：
     第一轮：全新 profile 首次访问（SW 首装）
     第二轮：reload（SW 已激活，控制页面后）
   ========================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const BASE = process.env.MOS_ONLINE_BASE || 'https://mos-music.app.workbuddy.host/';
const PORT_CDP = 9344;

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map(); }
  static connect(url) {
    return new Promise((res, rej) => {
      const ws = new WebSocket(url);
      ws.onopen = () => res(new CDP(ws));
      ws.onerror = (e) => rej(new Error('ws error'));
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
}

async function waitLoad(cdp, timeoutMs = 30000) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => { clearTimeout(t); rej(new Error('load timeout')); }, timeoutMs);
    const mh = (ev) => {
      const d = JSON.parse(ev.data);
      if (d.method === 'Page.loadEventFired') {
        clearTimeout(t);
        cdp.ws.removeEventListener('message', mh);
        res();
      }
    };
    cdp.ws.addEventListener('message', mh);
  });
}

async function evalJS(cdp, sessionId, expression) {
  const r = await cdp.send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true,
  }, sessionId);
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}

const PROBE = `(async () => {
  const t0 = Date.now();
  let h2 = '';
  /* 轮询等待 boot 完成（正在启动… 消失）或超时 90s */
  while (Date.now() - t0 < 90000) {
    const v = document.getElementById('view');
    h2 = v ? v.innerHTML : '';
    if (!h2.includes('正在启动') && h2.length > 200) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return {
    hash: location.hash || '(empty)',
    waitMs: Date.now() - t0,
    viewLen: h2.length,
    isMusicHome: h2.includes('让经典，今天继续被唱'),
    isBackendToday: h2.includes('门训首页') || h2.includes('该回来唱了'),
    navLabels: Array.from(document.querySelectorAll('#nav .nav-btn')).map((b) => b.textContent.trim()),
    swController: navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : null,
    hasDebug: !!window.__MOS_MUSIC__,
    viewExcerpt: (() => {
      const d = document.createElement('div');
      d.innerHTML = h2;
      return (d.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    })(),
    mainTitle: (document.getElementById('mainTitle') || {}).textContent || null,
    hashLog: (window.__HASH_LOG || []).slice(0, 20),
    routeLogs: (performance.getEntriesByType('resource') || [])
      .filter((e) => e.name.includes('router.js'))
      .map((e) => ({ url: e.name.split('/').pop(), size: e.transferSize })),
    liveRouter: await (async () => {
      try {
        const t = await (await fetch('/app/router.js?inpage=' + Date.now(), { cache: 'no-store' })).text();
        const m = t.match(/DEFAULT_ROUTE = '([a-z]+)'/);
        return m ? m[1] : '(not found)';
      } catch (e) { return 'fetch-fail: ' + e.message; }
    })(),
  };
})()`;

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mosmusic-landing-'));
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', `--remote-debugging-port=${PORT_CDP}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-proxy-server',
    'about:blank',
  ], { stdio: 'ignore' });

  let list = null;
  for (let i = 0; i < 50; i++) {
    try { list = await (await fetch(`http://127.0.0.1:${PORT_CDP}/json/list`)).json(); break; }
    catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  if (!list) { console.error('CDP 端口未就绪'); process.exit(2); }
  const page = list.find((t) => t.type === 'page');
  const cdp = await CDP.connect(page.webSocketDebuggerUrl);
  cdp.ws.addEventListener('message', (ev) => {
    const d = JSON.parse(ev.data);
    if (d.id && cdp.pending.has(d.id)) {
      const p = cdp.pending.get(d.id);
      cdp.pending.delete(d.id);
      if (d.error) p.rej(new Error(JSON.stringify(d.error).slice(0, 300) + ' <- method context: ' + JSON.stringify(Array.from(cdp.pending.keys()))));
      else p.res(d.result);
    }
  });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');

  const bodies = new Map(); // url -> {status, body}
  cdp.ws.addEventListener('message', (ev) => {
    let d;
    try { d = JSON.parse(ev.data); } catch { return; }
    if (d.method === 'Network.responseReceived'
        && /router\.js/.test(d.params.response.url)
        && !d.params.response.url.includes('?')) {
      const reqId = d.params.requestId;
      const status = d.params.response.status;
      const fromDisk = d.params.response.fromDiskCache;
      cdp.send('Network.getResponseBody', { requestId: reqId })
        .then((r) => bodies.set('router.js', { status, fromDisk, size: (r.body || '').length, head: (r.body || '').slice(0, 0) + ((r.body || '').match(/DEFAULT_ROUTE = '([a-z]+)'/) || ['?', '?'])[1] }))
        .catch(() => bodies.set('router.js', { status, fromDisk, bodyErr: true }));
    }
  });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.MOS_ROUTE_DEBUG = true;
    window.__HASH_LOG = [];
    const rec = (tag) => window.__HASH_LOG.push(tag + ' ' + (location.hash || '(empty)') + ' @' + Math.round(performance.now()) + 'ms');
    rec('doc-start');
    window.addEventListener('hashchange', () => rec('hashchange'));
    document.addEventListener('DOMContentLoaded', () => rec('domcontentloaded'));
    window.addEventListener('load', () => rec('load'));
  ` });

  const consoleErrors = [];
  const jsErrors = [];
  cdp.ws.addEventListener('message', (ev) => {
    let d;
    try { d = JSON.parse(ev.data); } catch { return; }
    if (d.method === 'Runtime.consoleAPICalled'
        && (d.params.type === 'error' || d.params.type === 'warning')) {
      consoleErrors.push(d.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
    }
    if (d.method === 'Runtime.exceptionThrown') {
      const e = d.params.exceptionDetails;
      jsErrors.push((e.text || '') + ' ' + (e.exception && e.exception.description ? e.exception.description.slice(0, 200) : ''));
    }
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') {
      consoleErrors.push('[log] ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
    }
  });

  const results = [];
  const target = BASE.endsWith('index.html') || BASE.endsWith('/') ? BASE : BASE + '/index.html';
  for (let round = 1; round <= 2; round++) {
    const label = round === 1 ? '第一轮：全新 profile 首次访问' : '第二轮：reload（SW 已激活）';
    await cdp.send('Page.navigate', { url: target });
    try { await waitLoad(cdp, 45000); } catch { /* 线上慢源站，容忍 */ }
    const r = await evalJS(cdp, null, PROBE);
    results.push(r);
    console.log(`\n${label}`);
    console.log(JSON.stringify(r, null, 2));
    console.log('executed router.js:', JSON.stringify(bodies.get('router.js') || null));
    if (consoleErrors.length) console.log('console errors:\n  ' + consoleErrors.slice(0, 15).join('\n  '));
    if (jsErrors.length) console.log('js exceptions:\n  ' + jsErrors.slice(0, 15).join('\n  '));
    if (round === 1) await new Promise((res) => setTimeout(res, 4000));
  }

  const allOk = results.every((r) =>
    (r.hash === '' || r.hash === '(empty)' || r.hash === '#/home')
    && r.isMusicHome === true
    && r.isBackendToday === false);

  console.log('\n========== 结论 ==========');
  if (allOk) console.log('PASS：无 hash 落地即音乐首页（两轮一致，无后台门训首页）');
  else console.log('FAIL：落地行为仍异常，见上方明细');
  try { chrome.kill(); } catch {}
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
