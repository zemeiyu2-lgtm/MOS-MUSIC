/* 定位 360 视口下横向溢出的元素（GitHub Pages 专用诊断） */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const BASE = process.env.MOS_ONLINE_BASE || 'https://zemeiyu2-lgtm.github.io/MOS-MUSIC/';
const PORT_CDP = 9346;

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static connect(url) {
    return new Promise((res, rej) => {
      const ws = new WebSocket(url);
      ws.onopen = () => res(new CDP(ws));
      ws.onerror = () => rej(new Error('ws error'));
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

const FIND_OVERFLOW = `(async () => {
  const vw = document.documentElement.clientWidth;
  const sidebar = document.getElementById('sidebar');
  const mq = [];
  for (const q of ['(max-width: 900px)', '(max-width: 760px)', '(max-width: 640px)']) {
    mq.push(q + ' => ' + window.matchMedia(q).matches);
  }
  const sheets = Array.from(document.styleSheets).map((s) => {
    try { return { href: (s.href || 'inline').split('/').pop(), rules: s.cssRules.length }; }
    catch (e) { return { href: (s.href || 'inline').split('/').pop(), err: String(e).slice(0, 40) }; }
  });
  return {
    vw, scrollW: document.documentElement.scrollWidth,
    hash: location.hash,
    mq,
    sidebarW: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : null,
    sidebarClass: sidebar ? sidebar.className : null,
    sidebarInline: sidebar ? sidebar.getAttribute('style') : null,
    sidebarComputed: sidebar ? (({ position, width, left, right, top, bottom }) => ({ position, width, left, right, top, bottom }))(getComputedStyle(sidebar)) : null,
    htmlInline: document.documentElement.getAttribute('style'),
    bodyInline: document.body.getAttribute('style'),
    bodyClass: document.body.className,
    sheets,
    bootDone: !!document.querySelector('.songpage, .music-home'),
  };
})()`;

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mosmusic-ovf-'));
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
  const page = list.find((t) => t.type === 'page');
  const cdp = await CDP.connect(page.webSocketDebuggerUrl);
  cdp.ws.addEventListener('message', (ev) => {
    const d = JSON.parse(ev.data);
    if (d.id && cdp.pending.has(d.id)) {
      const p = cdp.pending.get(d.id);
      cdp.pending.delete(d.id);
      if (d.error) p.rej(new Error(d.error.message)); else p.res(d.result);
    }
  });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Page.navigate', { url: BASE });
  await new Promise((r) => setTimeout(r, 45000));
  await cdp.send('Runtime.evaluate', { expression: `location.hash = '#/song/MUS-S-0001'` });
  await new Promise((r) => setTimeout(r, 12000));
  const r = await cdp.send('Runtime.evaluate', { expression: FIND_OVERFLOW, returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(r.result.value, null, 2));
  try { chrome.kill(); } catch {}
}
main().catch((e) => { console.error(e); process.exit(2); });
