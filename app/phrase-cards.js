/* =========================================================
   MOS-MUSIC｜Teaching Packs（乐句教学卡 · 数据访问与门禁 · V3.x）
   ---------------------------------------------------------
   数据：content/teaching/*.json（V3.2 教学样板数据层，schema
   content/schema/teaching-pack.schema.json，由 validate-content 治理）。
   本模块是它的唯一取数与门禁入口；程序不生成、不臆测任何字段。

   契约门禁（前台接入契约 V1.0 ⇔ teaching-pack schema 铁律）：
     1) cursor-follow：cursor_ready === true（schema 保证 cursor_ready ⇔
        timecode.time_status === VERIFIED）且 timecode 存在且绑定录音
        （recording_id 非空）。REFERENCE_ONLY / TIME_PENDING 一律禁止。
     2) 不同录音版本不混用：单句循环窗口只有当卡片的
        timecode.recording_id 与当前播放录音一致时才产生。
     3) 演唱者防误标：vocal_reference.status 为 CANDIDATE（候选）或
        identity_status 为 UNNAMED_SOURCE 时，前台只显示「待确认」，
        绝不把来源页面名称当成歌手身份。
     4) difficulty 保持数据原值（当前全部 null），程序不评分。
     5) coach 只允许 coach_scope.allowed_params 六个音乐参数；
        coach_scope.forbidden（属灵程度评分 / 敬拜真诚度评分 / 排名 /
        总分）不进入前台。

   前台不接触原始枚举：状态 → 普通用语的翻译只在本模块。
========================================================= */

/* 教学目标键 → 前台用语（schema enum 全集）。 */
const GOAL_LABELS = Object.freeze({
  pitch: '音高', rhythm: '节奏', meter: '拍号', phrase: '乐句',
  breath: '气息', diction: '咬字', dynamics: '力度', expression: '表达',
  memory: '记忆', ensemble: '合唱', onset: '起音', range: '音域',
});

/* 卡内 focus 字段 → 标签（逐一渲染，没有就不显示）。 */
const FOCUS_FIELDS = Object.freeze([
  ['pitch_focus', '音高'], ['rhythm_focus', '节奏'], ['breath_focus', '气息'],
  ['diction_focus', '咬字'], ['dynamics_focus', '力度'], ['emotion_focus', '表达'],
]);

/* 时间状态 → 前台普通用语（释义来自 content/teaching/index.json 词表）。 */
const TIME_STATE = Object.freeze({
  VERIFIED: { label: '时间轴已核实', allow_cursor: true, allow_auto_loop: true },
  REFERENCE_ONLY: { label: '参考时间码 · 可人工跟唱', allow_cursor: false, allow_auto_loop: false },
  TIME_PENDING: { label: '时间轴待校', allow_cursor: false, allow_auto_loop: false },
  null: { label: '待核实', allow_cursor: false, allow_auto_loop: false },
});

/* ------------------------------------------------------- 取数 */

const packCache = new Map();

/** 按工程 song_id（MUS-S-000x）读教学包；没有则返回 null（不虚构）。 */
export async function loadTeachingPack(songId) {
  if (packCache.has(songId)) return packCache.get(songId);
  const doc = await fetch(`content/teaching/${songId}.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  packCache.set(songId, doc);
  return doc;
}

export function cardsOf(pack) {
  return (pack && Array.isArray(pack.phrase_cards)) ? pack.phrase_cards : [];
}

export function goalLabel(key) {
  return GOAL_LABELS[key] || key;
}

export function goalLabels(card) {
  return ((card && card.teaching_goal) || []).map(goalLabel);
}

export function focusRowsOf(card) {
  if (!card) return [];
  return FOCUS_FIELDS.filter(([k]) => card[k]).map(([k, label]) => [label, card[k]]);
}

/* ------------------------------------------------------- 门禁（纯函数） */

/** timecode 数值 start/end 是否真实可用。 */
export function numericWindow(timecode) {
  if (!timecode) return null;
  const { start, end } = timecode;
  if (typeof start !== 'number' || typeof end !== 'number') return null;
  if (!(end > start)) return null;
  return { start, end };
}

/**
 * cursor-follow 门禁：cursor_ready（schema 保证 ⇔ time_status=VERIFIED）
 * 且存在绑定录音的 timecode。任何一层不满足 → false。
 */
export function cursorAllowed(card) {
  return Boolean(card
    && card.cursor_ready === true
    && card.timecode
    && card.timecode.time_status === 'VERIFIED'
    && card.timecode.recording_id);
}

/** 时间状态前台视图（任何状态都不虚构「正在同步」）。 */
export function timeStateOf(card) {
  const ts = card && card.timecode ? card.timecode.time_status : null;
  const key = ts != null ? String(ts) : 'null';
  return TIME_STATE[key] || TIME_STATE.null;
}

/**
 * 单句循环窗口绑定：卡片 timecode.recording_id 与当前可播放录音一致、
 * 时间已核实（cursor_ready）且 start/end 为数值时，才把窗口交给现有
 * Player.setWindow。不同录音 / 未核实 / 缺数值 → 一律 null（绝不混用）。
 * @param {object} card
 * @param {string|null} activeRecordingId 当前播放录音的 recording_id
 */
export function loopWindowFor(card, activeRecordingId) {
  if (!card || !card.timecode || card.timecode.recording_id == null) return null;
  if (card.timecode.recording_id !== activeRecordingId) return null;
  if (!cursorAllowed(card)) return null;
  return numericWindow(card.timecode);
}

/**
 * 演唱者是否可显示：候选（CANDIDATE）状态一律不算确认；
 * 只有已选定（SELECTED）且具名（NAMED_SOURCE）且填了姓名才显示。
 */
export function performerConfirmed(card) {
  const v = card && card.vocal_reference;
  return Boolean(v && v.status === 'SELECTED' && v.identity_status === 'NAMED_SOURCE' && v.performer);
}

/** 演唱者前台展示行（任何输入都不抛错、不虚构）。 */
export function performerDisplay(card) {
  if (performerConfirmed(card)) return { name: card.vocal_reference.performer, confirmed: true };
  return { name: null, confirmed: false, placeholder: '演唱者待确认' };
}

/** 教练维度（来自包级 coach_scope.allowed_params，六项音乐参数）。 */
export function coachScopeOf(pack) {
  return ((pack && pack.coach_scope && pack.coach_scope.allowed_params) || []).map(goalLabel);
}

/** 教练禁项（属灵程度评分 / 敬拜真诚度评分 / 排名 / 总分）——内部校验用。 */
export function coachForbiddenOf(pack) {
  return ((pack && pack.coach_scope && pack.coach_scope.forbidden) || []).slice();
}

export default {
  loadTeachingPack, cardsOf, goalLabel, goalLabels, focusRowsOf,
  cursorAllowed, timeStateOf, numericWindow, loopWindowFor,
  performerConfirmed, performerDisplay, coachScopeOf, coachForbiddenOf,
};
