/* =========================================================
   MOS-MUSIC｜网络探测
   ---------------------------------------------------------
   规格书 §6：网络是同步工具，不是系统运行的必要条件。
   规格书 §30：Network Detection。

   注意：navigator.onLine 只表示"有没有链路"，不表示"能不能到达服务器"
   （连上无出口的 Wi-Fi、代理阻断、DNS 失效时它仍为 true）。
   因此本模块用 onLine 做快速判断，用一次轻量探针做可信判断，
   并在探测失败时**默认按离线处理**（fail-closed），
   避免出现"以为在线 → 写不进去 → 用户记录丢失"。
========================================================= */

const PROBE_PATH = 'manifest.json';
const PROBE_TIMEOUT_MS = 4000;
const PROBE_MIN_INTERVAL_MS = 15000;

export const NET = {
  /** 'online' | 'offline' | 'unknown' */
  status: 'unknown',
  lastProbeAt: 0,
  lastProbeOk: null,
  listeners: new Set(),
};

function emit() {
  for (const fn of NET.listeners) {
    try { fn({ status: NET.status, lastProbeOk: NET.lastProbeOk }); } catch (_) { /* 单个订阅者失败不影响其它 */ }
  }
}

export function onNetChange(fn) {
  NET.listeners.add(fn);
  return () => NET.listeners.delete(fn);
}

export function isOffline() {
  return NET.status === 'offline';
}

/** 一次带超时的 HEAD 探针。返回 boolean。 */
export async function probe() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    NET.lastProbeOk = false;
    NET.status = 'offline';
    emit();
    return false;
  }
  const now = Date.now();
  if (now - NET.lastProbeAt < PROBE_MIN_INTERVAL_MS && NET.lastProbeOk !== null) {
    return NET.lastProbeOk;
  }
  NET.lastProbeAt = now;

  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS) : null;
  try {
    const url = new URL(PROBE_PATH, location.href);
    url.searchParams.set('_probe', String(now));
    const res = await fetch(url.toString(), {
      method: 'HEAD',
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined,
    });
    NET.lastProbeOk = res.ok;
  } catch (_) {
    NET.lastProbeOk = false;
  } finally {
    if (timer) clearTimeout(timer);
  }
  NET.status = NET.lastProbeOk ? 'online' : 'offline';
  emit();
  return NET.lastProbeOk;
}

export function initNet() {
  if (typeof window === 'undefined') return;
  const update = () => {
    NET.status = navigator.onLine ? 'unknown' : 'offline';
    if (navigator.onLine) probe();
    else emit();
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

export default { NET, onNetChange, isOffline, probe, initNet };
