/* =========================================================
   MOS-MUSIC｜Song Unit（单曲完整歌曲单元 · V3.0）
   ---------------------------------------------------------
   标准：docs/standards/MOS-SONG-PRODUCTION-TEMPLATE-V1.0.md
         docs/standards/MOS-SONG-TEACHING-METHOD-V1.0.md

   本模块只做**机械判定**，不含任何神学判断、不评价歌曲好坏：
     · unitFlags(unit)         —— 哪些资源/教学已就绪（布尔）
     · deriveLevel(unit)       —— 由实际资源推导 L1–L4（派生，不是人工填写）
     · missingFor(unit)        —— 距下一等级还缺什么（如实列出，不代填）
     · nextAction(unit)        —— 生产上的下一步
     · acceptanceSummary(unit) —— 验收 A–J 组状态汇总
     · statusConsistent(unit)  —— 生产状态与资源实际是否自相矛盾

   铁律：
     1) 等级是**派生**结果（CI-0014 案 a：随生产推进而变化的内容不进不可变基线）；
     2) 未就绪的槽位一律如实为 NOT_PROVIDED，绝不为「补满结构」而虚构资源；
     3) 声明为 PROVIDED 的段必须有机械前置条件成立，否则视为自相矛盾；
     4) 本模块不产生分数、排名、通过/不通过结论。
========================================================= */

/** 生产状态机（工作单 §二）。 */
export const UNIT_STATUS = Object.freeze([
  'INTAKE', 'VERIFYING', 'LYRICS_READY', 'SCORE_READY', 'PIANO_READY',
  'DEMO_READY', 'SYNC_READY', 'TEACHING_READY', 'REVIEW', 'COMPLETE', 'HOLD',
]);

/** 完成等级（模板 §二十三）。NONE = 尚未达到 L1（结构就绪但资源为空）。 */
export const LEVELS = Object.freeze(['NONE', 'L1', 'L2', 'L3', 'L4']);

/** 单段状态词表（模板每一节的 status）。 */
export const PROVIDED = 'PROVIDED';
export const NOT_PROVIDED = 'NOT_PROVIDED';

/** 18 段的分段键（顺序即标准模板顺序，不得调整）。 */
export const SECTION_KEYS = Object.freeze([
  'song_meta', 'lyrics', 'score', 'demo_male', 'demo_female', 'piano',
  'timeline', 'cursor', 'teach_learn', 'teach_score', 'teach_lyrics',
  'teach_vocal', 'teach_live', 'content_understanding', 'life_practice',
  'transmission', 'rights', 'acceptance',
]);

/** 验收组（模板 §二十二 / 工作单 §二十：A 数据 … J 版权）。 */
export const ACCEPTANCE_KEYS = Object.freeze([
  'data', 'lyrics', 'score', 'demo', 'piano',
  'teaching', 'sync', 'live_teaching', 'content', 'rights',
]);

/** 验收词表（工作单 §二十三 签核用词）。 */
export const ACCEPT_VOCAB = Object.freeze(['PENDING', 'PASS', 'REVISE', 'HOLD']);

/** 完成等级的最低要求（模板 §二十三 L1–L4）。 */
export const LEVEL_REQUIREMENTS = Object.freeze({
  L1: ['lyrics', 'score'],
  L2: ['lyrics', 'score', 'piano'],
  L3: ['lyrics', 'score', 'piano', 'demo_any', 'timeline'],
  L4: ['lyrics', 'score', 'piano', 'demo_male', 'demo_female', 'timeline', 'cursor',
    'teach_learn', 'teach_score', 'teach_lyrics', 'teach_vocal', 'teach_live'],
});

/** 就绪键（前台与工作单的「缺什么」清单按此顺序）。 */
export const REQUIREMENT_KEYS = Object.freeze([
  'lyrics', 'score', 'piano', 'demo_male', 'demo_female', 'demo_any',
  'timeline', 'cursor', 'teach_learn', 'teach_score', 'teach_lyrics',
  'teach_vocal', 'teach_live',
]);

/* ---------------------------------------------------------------- 就绪判定 */

const arr = (v) => (Array.isArray(v) ? v : []);
const declared = (sec) => Boolean(sec) && sec.status === PROVIDED;

/**
 * 就绪布尔表（按实际数据判定；声明为 PROVIDED 的段还需满足前置条件，
 * 前置条件不成立时仍算未就绪 —— 状态矛盾由 statusConsistent 报出）。
 * @param {object} unit 单曲完整单元记录
 */
export function unitFlags(unit) {
  const u = unit || {};
  const lyrics = u.lyrics || {};
  const score = u.score || {};
  const piano = u.piano || {};
  const demos = u.demos || {};
  const male = demos.male || {};
  const female = demos.female || {};
  const timeline = u.timeline || {};
  const cursor = u.cursor || {};
  const teaching = u.teaching || {};

  const f = {
    lyrics: declared(lyrics) && arr(lyrics.sections).length > 0,
    score: declared(score) && arr(score.sections).length > 0,
    piano: declared(piano),
    demo_male: declared(male),
    demo_female: declared(female),
    timeline: declared(timeline) && arr(timeline.phrases).length > 0,
    cursor: declared(cursor) && arr(cursor.levels).length > 0,
    teach_score: arr((teaching.score_class || {}).items).length > 0,
    teach_lyrics: arr((teaching.lyrics_class || {}).items).length > 0,
    teach_vocal: arr(teaching.vocal).length > 0,
    teach_live: arr((teaching.live_teaching || {}).modules).some((m) => m && m.status === PROVIDED),
  };
  f.demo_any = f.demo_male || f.demo_female;
  /* 学唱教学（模板 §九）：五步要真能跑，必须同时有词、谱、钢琴、至少一个示唱、时间轴 */
  f.teach_learn = f.lyrics && f.score && f.piano && f.demo_any && f.timeline;
  return f;
}

/** 由实际资源推导完成等级（NONE / L1 / L2 / L3 / L4）。 */
export function deriveLevel(unit) {
  const f = unitFlags(unit);
  const has = (k) => (k === 'demo_any' ? f.demo_any : Boolean(f[k]));
  if (LEVEL_REQUIREMENTS.L4.every(has)) return 'L4';
  if (LEVEL_REQUIREMENTS.L3.every(has)) return 'L3';
  if (LEVEL_REQUIREMENTS.L2.every(has)) return 'L2';
  if (LEVEL_REQUIREMENTS.L1.every(has)) return 'L1';
  return 'NONE';
}

/** 已达等级的下一个等级（已到 L4 时为 null）。 */
export function nextLevel(level) {
  const i = LEVELS.indexOf(level);
  if (i < 0 || i >= LEVELS.length - 1) return null;
  return LEVELS[i + 1];
}

/** 距下一等级仍缺的就绪键；已达 L4 时返回空数组。 */
export function missingFor(unit) {
  const target = nextLevel(deriveLevel(unit));
  if (!target) return [];
  const f = unitFlags(unit);
  const has = (k) => (k === 'demo_any' ? f.demo_any : Boolean(f[k]));
  return LEVEL_REQUIREMENTS[target].filter((k) => !has(k));
}

/** 全部未就绪的就绪键（不受等级限制）。 */
export function missingAll(unit) {
  const f = unitFlags(unit);
  return REQUIREMENT_KEYS.filter((k) => (k === 'demo_any' ? !f.demo_any : !f[k]));
}

/** 生产顺序（模板 §二十四）：取第一个缺口作为下一步。 */
const PRODUCTION_ORDER = Object.freeze([
  ['lyrics', 'LYRICS_READY'],
  ['score', 'SCORE_READY'],
  ['piano', 'PIANO_READY'],
  ['demo_any', 'DEMO_READY'],
  ['timeline', 'SYNC_READY'],
  ['cursor', 'SYNC_READY'],
  ['teach_learn', 'TEACHING_READY'],
  ['teach_score', 'TEACHING_READY'],
  ['teach_lyrics', 'TEACHING_READY'],
  ['teach_vocal', 'TEACHING_READY'],
  ['teach_live', 'TEACHING_READY'],
]);

export function nextAction(unit) {
  const f = unitFlags(unit);
  for (const [key, targetStatus] of PRODUCTION_ORDER) {
    const ok = key === 'demo_any' ? f.demo_any : f[key];
    if (!ok) return { key, target_status: targetStatus };
  }
  return { key: null, target_status: 'REVIEW' };
}

/* ---------------------------------------------------------------- 验收汇总 */

/**
 * 验收 A–J 组汇总（模板 §二十二 / 工作单 §二十）。
 * 只汇总人工填写的状态，不代替裁决，也不把 PENDING 当作通过。
 */
export function acceptanceSummary(unit) {
  const acc = ((unit || {}).acceptance) || {};
  const items = ACCEPTANCE_KEYS.map((key) => {
    const row = acc[key];
    const result = row && ACCEPT_VOCAB.includes(row.result) ? row.result : 'PENDING';
    return { key, result, note: (row && row.note) || null };
  });
  const count = (v) => items.filter((i) => i.result === v).length;
  return {
    items,
    total: items.length,
    pass: count('PASS'),
    revise: count('REVISE'),
    hold: count('HOLD'),
    pending: count('PENDING'),
    /* 「机械上可签核」= A–J 全部已有裁决且没有 REVISE / HOLD。
       它不等于可以发布 —— 发布仍需人工签核（工作单 §二十四）。 */
    mechanically_complete: count('PENDING') === 0 && count('REVISE') === 0 && count('HOLD') === 0,
  };
}

/* ---------------------------------------------------------------- 状态一致性 */

/** 生产状态的机械前置要求（声明达到某状态 ⇒ 对应资源必须真的就绪）。 */
const STATUS_PRECONDITION = Object.freeze({
  LYRICS_READY: ['lyrics'],
  SCORE_READY: ['lyrics', 'score'],
  PIANO_READY: ['lyrics', 'score', 'piano'],
  DEMO_READY: ['lyrics', 'score', 'piano', 'demo_any'],
  SYNC_READY: ['lyrics', 'score', 'piano', 'demo_any', 'timeline'],
  TEACHING_READY: ['lyrics', 'score', 'piano', 'demo_any', 'timeline', 'teach_learn'],
  COMPLETE: LEVEL_REQUIREMENTS.L4,
});

/**
 * 生产状态与资源实际是否自相矛盾。
 * 例：status=SCORE_READY 但简谱其实还没有 → 违规（不得靠声明「变成」已完成）。
 * HOLD / INTAKE / VERIFYING / REVIEW 无前置要求。
 */
export function statusConsistent(unit) {
  const status = ((unit || {}).status) || 'INTAKE';
  const need = STATUS_PRECONDITION[status];
  if (!need) return { ok: true, status, violations: [] };
  const f = unitFlags(unit);
  const violations = need.filter((k) => !(k === 'demo_any' ? f.demo_any : f[k]));
  return { ok: violations.length === 0, status, violations };
}

/** 单曲一览（前台与后台共用的一份只读摘要，不含任何评价）。 */
export function unitSummary(unit) {
  const level = deriveLevel(unit);
  const acc = acceptanceSummary(unit);
  return {
    song_id: (unit || {}).song_id || null,
    unit_id: (unit || {}).unit_id || null,
    status: (unit || {}).status || 'INTAKE',
    level,
    next_level: nextLevel(level),
    missing_next: missingFor(unit),
    missing_all: missingAll(unit),
    next_action: nextAction(unit),
    acceptance: { pass: acc.pass, pending: acc.pending, revise: acc.revise, hold: acc.hold },
    flags: unitFlags(unit),
  };
}

export default {
  UNIT_STATUS, LEVELS, PROVIDED, NOT_PROVIDED,
  SECTION_KEYS, ACCEPTANCE_KEYS, ACCEPT_VOCAB, LEVEL_REQUIREMENTS, REQUIREMENT_KEYS,
  unitFlags, deriveLevel, nextLevel, missingFor, missingAll, nextAction,
  acceptanceSummary, statusConsistent, unitSummary,
};
