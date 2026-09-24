/* =========================================================
   MOS-MUSIC｜Sync Engine（骨架）
   ---------------------------------------------------------
   规格书 §8：V1.0 不追求复杂实时协作。采用 Local First + Background Sync。
   基本流程：
     用户操作 → Local DB → 标记待同步 → 恢复网络 → 检测网络
             → 上传本地变化 → 获取服务器更新 → 完成同步

   冲突规则（§8 的简化规则，必须严格遵守）：
     1) 内容数据        —— 服务器版本为主。
     2) 用户个人记录    —— 原则上保留用户本地记录（服务器不回写覆盖本地）。
     3) 管理员内容更新  —— 可覆盖旧内容，但必须记录版本、保留更新时间，
                            尽量避免直接破坏用户数据。

   V1.0 明确不做：CRDT、OT、WebSocket 实时协同、多人并发编辑。

   现状（Phase 1 必须如实说明）：
     - 尚无后端。REMOTE 的四个端点全部是占位实现，调用会抛出明确的
       "未配置后端" 错误，不会静默假成功。
     - 因此当前 sync() 只能完成"本地 outbox 计数 + 网络状态"两部分，
       无法真正上传或拉取。见 docs/PHASE1-REPORT.md「当前无法实现的部分」。
========================================================= */

import * as store from './store.js';
import { NET, probe, onNetChange, isOffline } from './net.js';

/** 后端端点。Phase 1 全部未配置。 */
export const REMOTE = {
  configured: false,
  baseUrl: null,
  endpoints: {
    pull: '/api/v1/content/changes',
    push: '/api/v1/sync/push',
    manifest: '/api/v1/content/manifest',
    health: '/api/v1/health',
  },
};

export class SyncNotConfiguredError extends Error {
  constructor(what) {
    super(`[mos-music/sync] 后端未配置，无法执行：${what}。Phase 1 只交付本地队列与同步骨架。`);
    this.name = 'SyncNotConfiguredError';
  }
}

function requireRemote(what) {
  if (!REMOTE.configured || !REMOTE.baseUrl) throw new SyncNotConfiguredError(what);
}

export function configureRemote({ baseUrl }) {
  REMOTE.baseUrl = baseUrl || null;
  REMOTE.configured = Boolean(baseUrl);
  return REMOTE;
}

/* ---------------------------------------------------------------- 结果对象 */

function emptyResult() {
  return {
    startedAt: null, finishedAt: null,
    network: NET.status,
    pushed: 0, pulled: 0, failed: 0, skipped: 0,
    conflicts: [],
    errors: [],
    deferred: false,
  };
}

/* ---------------------------------------------------------------- 上传（本地 → 服务器） */

/**
 * 按 ts 顺序上传 outbox。单条失败不阻断其余，记录 attempts 与 last_error。
 * 目的地在 Phase 1 不存在，故这里只做本地演练（dryRun 默认 true）。
 */
export async function push({ dryRun = true } = {}) {
  const items = await store.outboxAll();
  const result = { attempted: items.length, pushed: 0, failed: 0, conflicts: [], errors: [], dryRun };

  if (items.length === 0) return result;

  if (dryRun) {
    // 演练：不改动 outbox，只报告内容，供 UI 与测试观察队列行为。
    result.pushed = 0;
    result.skipped = items.length;
    return result;
  }

  requireRemote('push outbox');

  for (const item of items) {
    try {
      const res = await fetch(REMOTE.baseUrl + REMOTE.endpoints.push, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (res.status === 409) {
        // 冲突：用户记录按 §8 保留本地，仅记录冲突供人工查看，不覆盖本地。
        result.conflicts.push({ id: item.id, store: item.store, key: item.key });
        await store.fail(item.id, 'conflict 409');
        continue;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await store.ack(item.id);
      result.pushed += 1;
    } catch (err) {
      result.failed += 1;
      result.errors.push({ id: item.id, message: String(err && err.message ? err.message : err) });
      await store.fail(item.id, err && err.message ? err.message : err);
    }
  }
  return result;
}

/* ---------------------------------------------------------------- 拉取（服务器 → 本地） */

/**
 * 拉取内容更新。内容按 §8「服务器版本为主」写入；
 * 用户记录不受拉取影响（服务器不回写覆盖本地用户数据）。
 */
export async function pull({ since = null } = {}) {
  requireRemote('pull content changes');
  const url = new URL(REMOTE.baseUrl + REMOTE.endpoints.pull);
  if (since) url.searchParams.set('since', since);
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const body = await res.json();

  const summary = { inserted: 0, updated: 0, skipped: 0, cursor: body.cursor || null };
  const plan = [
    ['songs', 'content_songs'],
    ['courses', 'content_courses'],
    ['training', 'content_training'],
    ['templates', 'content_templates'],
    ['contexts', 'content_contexts'],
  ];
  for (const [key, target] of plan) {
    for (const record of body[key] || []) {
      const r = await store.putContentIfNewer(target, record);
      summary[r] += 1;
    }
  }
  return summary;
}

/* ---------------------------------------------------------------- 内容清单比对 */

/** 下载状态与在线版本比对（供 §6「下载状态」与 Phase 3 使用）。 */
export async function diffManifest() {
  requireRemote('diff content manifest');
  const res = await fetch(REMOTE.baseUrl + REMOTE.endpoints.manifest, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const manifest = await res.json();
  const localMeta = await store.getAll('content_meta');
  const localByKey = new Map(localMeta.map((m) => [m.key, m]));

  const missing = [];
  const stale = [];
  for (const entry of manifest.entries || []) {
    const local = localByKey.get(entry.key);
    if (!local) missing.push(entry.key);
    else if (local.version !== entry.version) stale.push(entry.key);
  }
  return { missing, stale, upToDate: (manifest.entries || []).length - missing.length - stale.length };
}

/* ---------------------------------------------------------------- 主同步循环 */

let syncing = false;
let backgroundTimer = null;

export async function sync({ dryRun = true } = {}) {
  if (syncing) return { ...emptyResult(), deferred: true, reason: 'already-running' };
  syncing = true;
  const result = emptyResult();
  result.startedAt = new Date().toISOString();
  result.dryRun = dryRun;

  try {
    // 1) 检测网络。探针失败一律按离线处理，绝不在不确定时假定在线。
    const online = await probe();
    result.network = NET.status;
    if (!online) {
      result.deferred = true;
      result.reason = 'offline';
      return result;
    }

    // 2) 上传本地变化（顺序：先推后拉，避免把服务器的旧内容盖到刚写入的本地记录上）
    try {
      const p = await push({ dryRun });
      result.pushed = p.pushed;
      result.failed = p.failed;
      result.conflicts.push(...(p.conflicts || []));
      result.errors.push(...(p.errors || []));
    } catch (err) {
      result.errors.push({ phase: 'push', message: String(err.message || err) });
    }

    // 3) 获取服务器更新
    try {
      const lastPulledAt = await store.stateGet('last_pulled_at', null);
      const p = await pull({ since: lastPulledAt });
      result.pulled = (p.inserted || 0) + (p.updated || 0);
      result.skipped = p.skipped || 0;
      if (p.cursor) await store.stateSet('last_pulled_at', p.cursor);
    } catch (err) {
      result.errors.push({ phase: 'pull', message: String(err.message || err) });
    }

    // 4) 收口
    await store.stateSet('last_sync_at', new Date().toISOString());
    return result;
  } finally {
    result.finishedAt = new Date().toISOString();
    syncing = false;
  }
}

/** 网络恢复时自动触发一次；离线时不做任何事。 */
export function initBackgroundSync({ onChange, dryRun = true } = {}) {
  onNetChange(async ({ status }) => {
    if (onChange) onChange({ status, outbox: await store.outboxCount() });
    if (status === 'online' && !isOffline()) {
      try { await sync({ dryRun }); } catch (_) { /* 后台同步失败不打扰用户 */ }
    }
  });

  // 兜底：部分浏览器不一定派发 online 事件，定时轻量轮询（低频率、省电）
  if (backgroundTimer) clearInterval(backgroundTimer);
  backgroundTimer = setInterval(async () => {
    const n = await store.outboxCount();
    if (n > 0) {
      try { await sync({ dryRun }); } catch (_) { /* 同上 */ }
    }
  }, 5 * 60 * 1000);

  return () => { if (backgroundTimer) clearInterval(backgroundTimer); };
}

export default {
  REMOTE, SyncNotConfiguredError, configureRemote,
  push, pull, diffManifest, sync, initBackgroundSync,
};
