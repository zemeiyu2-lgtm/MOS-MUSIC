/* =========================================================
   MOS-MUSIC｜IndexedDB Wrapper
   ---------------------------------------------------------
   规格书 §7   离线数据架构：Offline Read / Offline Write /
               Local Persistence / Sync Queue / Conflict Handling
   规格书 §30  Local Storage / IndexedDB

   边界（硬约束）：
     - 库名固定 mos-music，不得改动。
     - 本模块**绝不读写** MOS-DIS 的 localStorage key
       （mos_state_v1 / mos_state_v11 / mos_state_v14 / mos_user），
       也绝不使用 localStorage 存业务数据。
     - 内容数据与用户数据分 store 存放，内容更新不得触发用户记录迁移。
========================================================= */

export const DB_NAME = 'mos-music';
export const DB_VERSION = 4;
export const NAMESPACE = 'mos-music';

/** 内容层 store（服务器 → 本地，服务器版本为主） */
export const CONTENT_STORES = Object.freeze([
  'content_songs',
  'content_courses',
  'content_training',
  'content_forms',
  'content_templates',
  'content_contexts',
  'content_meta',
]);

/** 用户层 store（本地优先，冲突时保留本地记录） */
export const USER_STORES = Object.freeze([
  'user_progress',
  'user_practice',
  'user_feedback',
  'user_prefs',
  'my_songs',
  /* V3.x：MOS Singing Coach 个人训练记录（独立模块，不读门训数据） */
  'coach_sessions',
]);

/** 同步层 store */
export const SYNC_STORES = Object.freeze(['outbox', 'sync_state']);

export const STORES = Object.freeze([...CONTENT_STORES, ...USER_STORES, ...SYNC_STORES]);

/** 各 store 的 keyPath 与索引定义。新增 store 必须同时改 DB_VERSION。 */
const SCHEMA = {
  content_songs: {
    keyPath: 'song_id',
    indexes: [
      { name: 'by_tier', keyPath: 'tier' },
      { name: 'by_review_status', keyPath: 'review_status' },
      { name: 'by_main_theme', keyPath: 'discipleship.main_theme' },
    ],
  },
  content_courses: {
    keyPath: 'course_id',
    indexes: [
      { name: 'by_unit_no', keyPath: 'unit_no' },
      { name: 'by_group', keyPath: 'group' },
      { name: 'by_status', keyPath: 'status' },
    ],
  },
  content_training: { keyPath: 'training_id', indexes: [{ name: 'by_status', keyPath: 'status' }] },
  content_forms: { keyPath: 'form_id', indexes: [{ name: 'by_status', keyPath: 'status' }] },
  content_templates: { keyPath: 'template_id', indexes: [{ name: 'by_module', keyPath: 'module' }] },
  content_contexts: { keyPath: 'context_id', indexes: [] },
  content_meta: { keyPath: 'key', indexes: [{ name: 'by_kind', keyPath: 'kind' }] },

  user_progress: {
    keyPath: 'key',
    indexes: [
      { name: 'by_user', keyPath: 'user_ref' },
      { name: 'by_course', keyPath: 'course_id' },
      { name: 'by_dirty', keyPath: 'dirty' },
    ],
  },
  user_practice: {
    keyPath: 'practice_id',
    indexes: [
      { name: 'by_user', keyPath: 'user_ref' },
      { name: 'by_created', keyPath: 'created_at' },
      { name: 'by_dirty', keyPath: 'dirty' },
    ],
  },
  user_feedback: {
    keyPath: 'feedback_id',
    indexes: [
      { name: 'by_user', keyPath: 'user_ref' },
      { name: 'by_created', keyPath: 'created_at' },
      { name: 'by_dirty', keyPath: 'dirty' },
    ],
  },
  user_prefs: { keyPath: 'key', indexes: [{ name: 'by_kind', keyPath: 'kind' }] },
  my_songs: {
    keyPath: 'song_id',
    indexes: [
      { name: 'by_liked', keyPath: 'liked' },
      { name: 'by_learning', keyPath: 'learning' },
      { name: 'by_last_sung', keyPath: 'last_sung_at' },
      { name: 'by_dirty', keyPath: 'dirty' },
    ],
  },
  /* V3.x：歌唱教练练习记录。只记事实（练了什么 / 多久 / 自评），不存分数与名次。 */
  coach_sessions: {
    keyPath: 'session_id',
    indexes: [
      { name: 'by_item', keyPath: 'item_id' },
      { name: 'by_capability', keyPath: 'capability' },
      { name: 'by_song', keyPath: 'song_id' },
      { name: 'by_created', keyPath: 'created_at' },
      { name: 'by_dirty', keyPath: 'dirty' },
    ],
  },

  outbox: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: [
      { name: 'by_ts', keyPath: 'ts' },
      { name: 'by_store', keyPath: 'store' },
    ],
  },
  sync_state: { keyPath: 'key', indexes: [] },
};

/** 禁用本模块之外的 localStorage 访问；给出明确报错而不是静默污染。 */
export function assertNamespace(key) {
  if (typeof key === 'string' && /^mos_(state|user)/.test(key)) {
    throw new Error(
      `[mos-music/store] 拒绝访问 MOS-DIS 的 localStorage key "${key}"。` +
        'MOS-MUSIC 只使用 IndexedDB，库名 ' + DB_NAME + '。'
    );
  }
  return true;
}

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(
        new Error(
          '[mos-music/store] 当前环境没有 IndexedDB。规格书 §7 要求 Offline Read/Write，' +
            '请使用现代浏览器或在 file:// 下改用本地静态服务器访问。'
        )
      );
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;
      for (const [name, spec] of Object.entries(SCHEMA)) {
        let store;
        if (!db.objectStoreNames.contains(name)) {
          store = db.createObjectStore(name, spec.autoIncrement
            ? { keyPath: spec.keyPath, autoIncrement: true }
            : { keyPath: spec.keyPath });
        } else {
          store = req.transaction.objectStore(name);
        }
        for (const idx of spec.indexes || []) {
          if (!store.indexNames.contains(idx.name)) {
            store.createIndex(idx.name, idx.keyPath, { unique: false });
          }
        }
      }
      // 记录库级元信息，便于诊断跨版本问题
      try {
        const meta = req.transaction.objectStore('sync_state');
        meta.put({ key: 'schema', db_version: DB_VERSION, upgraded_from: oldVersion, schema_version: 'MUS-V-0.1.0' });
      } catch (_) { /* 不影响升级 */ }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('[mos-music/store] 打开数据库失败'));
    req.onblocked = () =>
      reject(new Error('[mos-music/store] 数据库升级被其它标签页阻塞，请关闭其它 MOS-MUSIC 页面后重试。'));
  });
  return dbPromise;
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function put(store, value) {
  const db = await openDB();
  return wrap(tx(db, store, 'readwrite').put(value));
}

export async function putMany(store, values) {
  const db = await openDB();
  const t = db.transaction(store, 'readwrite');
  const os = t.objectStore(store);
  values.forEach((v) => os.put(v));
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(values.length);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('事务被中止'));
  });
}

export async function get(store, key) {
  const db = await openDB();
  return wrap(tx(db, store, 'readonly').get(key));
}

export async function getAll(store) {
  const db = await openDB();
  return wrap(tx(db, store, 'readonly').getAll());
}

export async function getAllBy(store, indexName, value) {
  const db = await openDB();
  const os = tx(db, store, 'readonly');
  if (!os.indexNames.contains(indexName)) return [];
  return wrap(os.index(indexName).getAll(value));
}

export async function del(store, key) {
  const db = await openDB();
  return wrap(tx(db, store, 'readwrite').delete(key));
}

export async function count(store) {
  const db = await openDB();
  return wrap(tx(db, store, 'readonly').count());
}

export async function countBy(store, indexName, value) {
  const db = await openDB();
  const os = tx(db, store, 'readonly');
  if (!os.indexNames.contains(indexName)) return 0;
  return wrap(os.index(indexName).count(value));
}

export async function clearStore(store) {
  const db = await openDB();
  return wrap(tx(db, store, 'readwrite').clear());
}

/** 本地概览，供「我的」页与诊断使用。 */
export async function stats() {
  const out = { db: DB_NAME, version: DB_VERSION, stores: {} };
  for (const s of STORES) out.stores[s] = await count(s);
  return out;
}

/* ---------------------- 内容写入（服务器优先语义） ---------------------- */

/**
 * 写入从服务器拉取的内容。
 * 冲突规则（§8）：内容数据以服务器版本为主 —— 只在服务器版本更新时覆盖。
 * @returns {'inserted'|'updated'|'skipped'}
 */
export async function putContentIfNewer(store, record, versionKey = 'version') {
  const keyPath = SCHEMA[store].keyPath;
  const key = record[keyPath];
  const existing = await get(store, key);
  if (!existing) {
    await put(store, record);
    return 'inserted';
  }
  const a = String(record[versionKey] || '');
  const b = String(existing[versionKey] || '');
  if (a && a !== b) {
    await put(store, record);
    return 'updated';
  }
  return 'skipped';
}

/* ---------------------- 用户写入（本地优先语义） ---------------------- */

/**
 * 用户记录写入：先落本地（UI 不等待网络），再进 outbox 标记待同步。
 * §6/§7：离线必须支持记录进度与实践；§8：用户个人记录原则上保留本地。
 */
export async function putUserRecord(store, record) {
  if (!USER_STORES.includes(store)) {
    throw new Error(`[mos-music/store] ${store} 不是用户 store，请用 putContentIfNewer。`);
  }
  const keyPath = SCHEMA[store].keyPath;
  const existing = await get(store, keyPath === 'key' ? record.key : record[keyPath]);
  const merged = {
    ...record,
    dirty: true,
    local_updated_at: new Date().toISOString(),
    remote_revision: existing?.remote_revision ?? null,
  };
  await put(store, merged);
  await enqueue({
    op: existing ? 'update' : 'create',
    store,
    key: merged[keyPath],
    payload: merged,
  });
  return merged;
}

/* ---------------------- Outbox 队列 ---------------------- */

export async function enqueue(item) {
  return put('outbox', {
    ts: Date.now(),
    attempts: 0,
    last_error: null,
    ...item,
  });
}

export async function outboxAll() {
  const rows = await getAll('outbox');
  return rows.sort((a, b) => a.ts - b.ts);
}

export async function outboxCount() {
  return count('outbox');
}

export async function ack(itemId) {
  return del('outbox', itemId);
}

export async function fail(itemId, error) {
  const item = await get('outbox', itemId);
  if (!item) return;
  item.attempts = (item.attempts || 0) + 1;
  item.last_error = String(error || '').slice(0, 300);
  return put('outbox', item);
}

/* ---------------------- sync_state 便捷读写 ---------------------- */

export async function stateGet(key, fallback = null) {
  const row = await get('sync_state', key);
  return row ? row.value : fallback;
}

export async function stateSet(key, value) {
  return put('sync_state', { key, value, updated_at: new Date().toISOString() });
}

export async function resetAll() {
  for (const s of STORES) await clearStore(s);
  return true;
}

export default {
  DB_NAME, DB_VERSION, NAMESPACE, STORES,
  CONTENT_STORES, USER_STORES, SYNC_STORES,
  openDB, assertNamespace,
  put, putMany, get, getAll, getAllBy, del, count, countBy, clearStore, stats,
  putContentIfNewer, putUserRecord,
  enqueue, outboxAll, outboxCount, ack, fail,
  stateGet, stateSet, resetAll,
};
