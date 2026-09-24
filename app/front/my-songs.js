/* =========================================================
   MOS-MUSIC｜My Songs（我的歌 · V2.0 → V3.0）
   ---------------------------------------------------------
   爱唱机制的本地存取：❤️ 喜欢 / 📚 正在学 / 🎤 我教过 / ↗️ 我传过 / 🕘 最近唱过。
   V3.0 增加学习路径状态：四级（认识 / 会唱 / 独立唱 / 会教）与间隔复习
   （Day 0 / 2 / 7）记录 —— 由 review.js 纯函数推导，本模块只负责存取。
   存 IndexedDB（mos-music.my_songs，用户层，本地优先 + outbox 队列）。
   不做积分、不做排行榜、不给徽章（V2.0 规格 §12 / §36；V3.0 标准 §十五）。
========================================================= */

import * as store from '../store.js';
import * as review from './review.js';

const EMPTY = () => ({
  song_id: null,
  liked: false,
  learning: false,
  taught_count: 0,
  taught_at: null,
  shared_count: 0,
  shared_at: null,
  last_sung_at: null,
  learn_step: 0,          /* 学唱（或视唱）完成到第几步（0 = 未开始） */
  learn_total: 0,         /* 该模式的步骤总数（学唱 / 视唱不同，由内容层词表决定） */
  learn_mode: null,       /* 已进入过的模式：learn | sight */
  /* V3.0：学习路径状态（四级）+ 间隔复习（Day 0 / 2 / 7） */
  first_learned_at: null,
  stages: { know: null, sing_along: null, sing_alone: null, can_teach: null },
  reviews: { d0: null, d2: null, d7: null },
  created_at: null,
  updated_at: null,
});

async function raw(songId) {
  try {
    return (await store.get('my_songs', songId)) || null;
  } catch (_) { return null; }
}

/** 补全空记录（含嵌套的 stages / reviews 深合并）。 */
function hydrate(row, songId) {
  const e = EMPTY();
  const r = row || {};
  return {
    ...e, ...r, song_id: r.song_id || songId || null,
    stages: { ...e.stages, ...(r.stages || {}) },
    reviews: { ...e.reviews, ...(r.reviews || {}) },
  };
}

/** 读取（不存在时返回带 song_id 的空记录，不落库）。 */
export async function get(songId) {
  return hydrate(await raw(songId), songId);
}

/** 全部记录（按更新时间倒序）。 */
export async function all() {
  let rows = [];
  try { rows = (await store.getAll('my_songs')) || []; } catch (_) { rows = []; }
  return rows
    .map((r) => hydrate(r, r && r.song_id))
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

/** 写入一行（合并字段 + outbox）。 */
async function save(row) {
  const rec = { ...row, updated_at: new Date().toISOString() };
  if (!rec.created_at) rec.created_at = rec.updated_at;
  try {
    await store.putUserRecord('my_songs', rec);
  } catch (err) {
    /* outbox 不可用时仍保留本地写入语义之外的最小可用性：直接 put */
    await store.put('my_songs', rec);
  }
  return rec;
}

export async function toggleLike(songId) {
  const r = await get(songId);
  return save({ ...r, liked: !r.liked });
}

export async function toggleLearning(songId) {
  const r = await get(songId);
  return save({ ...r, learning: !r.learning });
}

export async function markSung(songId) {
  const r = await get(songId);
  return save({ ...r, last_sung_at: new Date().toISOString() });
}

export async function markTaught(songId) {
  const r = await get(songId);
  return save({ ...r, taught_count: (r.taught_count || 0) + 1, taught_at: new Date().toISOString() });
}

export async function markShared(songId) {
  const r = await get(songId);
  return save({ ...r, shared_count: (r.shared_count || 0) + 1, shared_at: new Date().toISOString() });
}

export async function setLearnStep(songId, step, total, mode) {
  const r = await get(songId);
  return save({
    ...r,
    learn_step: Math.max(0, Math.min(24, Number(step) || 0)),
    learn_total: Math.max(0, Math.min(24, Number(total) || 0)),
    learn_mode: mode || r.learn_mode || 'learn',
    learning: true,
  });
}

/* ------------------------------------------------ V3.0 学习路径状态 */

/** 该歌的复习记录视图（交给 review.js 纯函数处理）。 */
export async function reviewRecord(songId) {
  const r = await get(songId);
  return { song_id: songId, first_learned_at: r.first_learned_at, stages: r.stages, reviews: r.reviews };
}

/**
 * 记录「我现在可以……」（四级：know / sing_along / sing_alone / can_teach）。
 * 只增不减；会教必然先会唱（由 review.markStage 处理）。
 */
export async function setStage(songId, key) {
  const r = await get(songId);
  const next = review.markStage(r, key);
  return save({
    ...r,
    learning: true,
    first_learned_at: next.first_learned_at,
    stages: next.stages,
    reviews: next.reviews,
  });
}

/** 记录完成一次间隔复习（d0 / d2 / d7）。 */
export async function setReview(songId, key) {
  const r = await get(songId);
  const next = review.markReview(r, key);
  return save({
    ...r,
    learning: true,
    first_learned_at: next.first_learned_at,
    stages: next.stages,
    reviews: next.reviews,
  });
}

/** 分类视图（我的页五个分组）。 */
export async function groups() {
  const rows = await all();
  return {
    liked: rows.filter((r) => r.liked),
    learning: rows.filter((r) => r.learning),
    taught: rows.filter((r) => (r.taught_count || 0) > 0),
    shared: rows.filter((r) => (r.shared_count || 0) > 0),
    recent: rows.filter((r) => r.last_sung_at)
      .sort((a, b) => String(b.last_sung_at).localeCompare(String(a.last_sung_at))),
  };
}

/** 四级学习状态分布（我的页展示；不做排名、不比较）。 */
export async function stageCounts() {
  return review.stageCounts(await all());
}

export default {
  get, all, toggleLike, toggleLearning, markSung, markTaught, markShared, setLearnStep, groups,
  reviewRecord, setStage, setReview, stageCounts,
};
