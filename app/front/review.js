/* =========================================================
   MOS-MUSIC｜Review（学习路径状态 + 间隔复习 · V3.0）
   ---------------------------------------------------------
   标准：docs/standards/MOS-SONG-TEACHING-METHOD-V1.0.md
     十四、学习循环：首次学习 → 短期再唱 → 间隔复习 → 独立视唱 → 教给别人
     十五、学习完成的判断：认识 / 会唱 / 独立唱 / 会教（四级路径状态）

   本模块是纯函数：
     · stageOf(record)      —— 当前处在四级中的哪一级（取已达成的最高一级）
     · markStage(record,k)  —— 记录「我现在可以……」（**只增不减**，退步不入库）
     · planDates(first,cyc) —— 由首次学习时间推出 Day 0 / 2 / 7 的复习时点
     · dueState(record)     —— 现在是「该回来唱了」还是「还不到时候」

   铁律：四级是**学习路径状态**，不是分数、不是排行榜、不是通过/不通过。
   系统不给徽章、不给奖励、不做完美主义激励；也不因为「唱错」判失败。
========================================================= */

/** 四级顺序（内容层 learner_stages 提供文字，程序只用键）。 */
export const STAGE_ORDER = Object.freeze(['know', 'sing_along', 'sing_alone', 'can_teach']);

/** 复习节奏键（内容层 review_cycle 提供文字与天数）。 */
export const REVIEW_KEYS = Object.freeze(['d0', 'd2', 'd7']);

const EMPTY = () => ({
  first_learned_at: null,
  stages: { know: null, sing_along: null, sing_alone: null, can_teach: null },
  reviews: { d0: null, d2: null, d7: null },
});

function norm(record) {
  const r = record || {};
  return {
    ...EMPTY(),
    ...r,
    stages: { ...EMPTY().stages, ...(r.stages || {}) },
    reviews: { ...EMPTY().reviews, ...(r.reviews || {}) },
  };
}

/** 已达成的最高一级；一级都没有则为 null。 */
export function stageOf(record) {
  const r = norm(record);
  let out = null;
  for (const key of STAGE_ORDER) if (r.stages[key]) out = key;
  return out;
}

/** 四级达成情况（用于「我的」页分布展示，不做排名）。 */
export function stageCounts(records) {
  const out = {};
  for (const key of STAGE_ORDER) out[key] = 0;
  out.none = 0;
  for (const rec of records || []) {
    const s = stageOf(rec);
    if (s) out[s] += 1;
    else out.none += 1;
  }
  return out;
}

/**
 * 记录一次「我现在可以……」。只增不减：重复记录同级只更新时间，
 * 不因为某天唱得不顺就把状态降级（避免把学习变成考核）。
 */
export function markStage(record, key, at) {
  if (!STAGE_ORDER.includes(key)) return norm(record);
  const r = norm(record);
  const stamp = at || new Date().toISOString();
  const stages = { ...r.stages };
  /* 记录本级；并把它前面的级别视为已达成（会教必然先会唱） */
  const upto = STAGE_ORDER.indexOf(key);
  for (let i = 0; i <= upto; i += 1) {
    if (!stages[STAGE_ORDER[i]]) stages[STAGE_ORDER[i]] = stamp;
  }
  const first = r.first_learned_at || stamp;
  return {
    ...r,
    stages,
    first_learned_at: first,
    reviews: { ...r.reviews, d0: r.reviews.d0 || first },
  };
}

const DAY = 86400000;

/** 由首次学习时间推出复习时点（天数取内容层词表，默认 0 / 2 / 7）。 */
export function planDates(firstISO, cycle) {
  const first = firstISO ? new Date(firstISO) : null;
  if (!first || Number.isNaN(first.getTime())) return null;
  const offsets = { d0: 0, d2: 2, d7: 7 };
  for (const row of cycle || []) if (row && row.key && Number.isInteger(row.day_offset)) offsets[row.key] = row.day_offset;
  const out = {};
  for (const key of REVIEW_KEYS) out[key] = new Date(first.getTime() + offsets[key] * DAY).toISOString();
  return out;
}

/**
 * 现在的复习状态。
 * @returns {{state:'not_started'|'waiting'|'due'|'maintained', due_key:string|null, next_due_at:string|null, plan:object|null}}
 *   not_started 还没学过 ｜ waiting 还不到时候 ｜ due 该回来唱了 ｜ maintained 已经唱过三轮
 */
export function dueState(record, now, cycle) {
  const r = norm(record);
  const plan = planDates(r.first_learned_at, cycle);
  if (!plan) return { state: 'not_started', due_key: null, next_due_at: null, plan: null };
  const at = (now ? new Date(now) : new Date()).getTime();
  for (const key of REVIEW_KEYS) {
    if (r.reviews[key]) continue;
    const due = new Date(plan[key]).getTime();
    if (at >= due) return { state: 'due', due_key: key, next_due_at: plan[key], plan };
    return { state: 'waiting', due_key: key, next_due_at: plan[key], plan };
  }
  return { state: 'maintained', due_key: null, next_due_at: null, plan };
}

/** 记录完成一次复习（键取自内容层复习节奏）。 */
export function markReview(record, key, at) {
  if (!REVIEW_KEYS.includes(key)) return norm(record);
  const r = norm(record);
  const stamp = at || new Date().toISOString();
  if (!r.first_learned_at) {
    return { ...r, first_learned_at: stamp, reviews: { ...r.reviews, [key]: stamp } };
  }
  return { ...r, reviews: { ...r.reviews, [key]: stamp } };
}

/** 从记录里挑出「该回来唱了」的歌（首页与我的页使用；不做排序竞争，按最早到期排）。 */
export function dueRecords(records, now, cycle) {
  const rows = [];
  for (const rec of records || []) {
    const st = dueState(rec, now, cycle);
    if (st.state === 'due') rows.push({ song_id: rec.song_id, due_key: st.due_key, next_due_at: st.next_due_at });
  }
  return rows.sort((a, b) => String(a.next_due_at).localeCompare(String(b.next_due_at)));
}

export default {
  STAGE_ORDER, REVIEW_KEYS, stageOf, stageCounts, markStage,
  planDates, dueState, markReview, dueRecords,
};
