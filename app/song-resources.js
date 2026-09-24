/* =========================================================
   MOS-MUSIC｜Song Resources（歌曲资源层 · V1.1-A）
   ---------------------------------------------------------
   资源独立模型：歌词 / 领唱歌谱 / 简谱 / 示唱 / 伴奏 / 录音。
   资源不混入 Song Core Record（content/songs/**）。

   本模块为纯逻辑（不依赖 DOM / 存储），供歌曲详情页与周音乐页使用：
     · resourceSlots —— 把某首歌的六个资源槽位算出来；
     · 没有资源的槽位一律 NOT_IMPORTED（如实显示，不得虚构）。

   数据来源：content/song-resources/index.json（当前 0 条资源记录 ——
   V1.1-A 只建立结构，暂不强制导入实际文件）。
========================================================= */

export const NOT_IMPORTED = 'NOT_IMPORTED';
export const AVAILABLE = 'AVAILABLE';

export const RESOURCE_TYPES = Object.freeze([
  { type: 'LYRICS', label: '歌词' },
  { type: 'SCORE_LEAD', label: '领唱歌谱' },
  { type: 'SCORE_SIMPLE', label: '简谱' },
  { type: 'LEAD_VOCAL', label: '示唱' },
  { type: 'ACCOMPANIMENT', label: '伴奏' },
  { type: 'RECORDING', label: '录音' },
]);

export const RESOURCE_TYPE_IDS = Object.freeze(RESOURCE_TYPES.map((r) => r.type));

/* ---------------------------------------------------------------- V3.x 来源类型
   §六：前台只显示「男声示唱 / 女声示唱」，来源类型记在内部；
        AI 一律额外标注「非真人」，且**永不进入真人槽位**。
   本词表为纯逻辑（供单测与前台显示），不得写入内容层。 */
export const SOURCE_TYPES = Object.freeze([
  { key: 'EXTERNAL_HUMAN_MALE', human: true, ai: false, gender: 'male', label: '男声示唱', origin: '外部真人' },
  { key: 'EXTERNAL_HUMAN_FEMALE', human: true, ai: false, gender: 'female', label: '女声示唱', origin: '外部真人' },
  { key: 'MOS_HUMAN_MALE', human: true, ai: false, gender: 'male', label: '男声示唱', origin: 'MOS 真人' },
  { key: 'MOS_HUMAN_FEMALE', human: true, ai: false, gender: 'female', label: '女声示唱', origin: 'MOS 真人' },
  { key: 'AI_MALE', human: false, ai: true, gender: 'male', label: '男声示唱', origin: 'AI（非真人）' },
  { key: 'AI_FEMALE', human: false, ai: true, gender: 'female', label: '女声示唱', origin: 'AI（非真人）' },
]);
export const SOURCE_TYPE_IDS = Object.freeze(SOURCE_TYPES.map((r) => r.key));

export function isAiType(type) {
  const row = SOURCE_TYPES.find((r) => r.key === type);
  return Boolean(row && row.ai);
}

export function isHumanType(type) {
  const row = SOURCE_TYPES.find((r) => r.key === type);
  return Boolean(row && row.human);
}

/**
 * 前台显示文案：真人只写「男声/女声示唱」；AI 追加「（非真人）」。
 * @param {string|null} type SOURCE_TYPE_IDS 之一
 * @returns {{ text: string, ai: boolean }}
 */
export function sourceTypeDisplay(type) {
  const row = SOURCE_TYPES.find((r) => r.key === type);
  if (!row) return { text: '示唱（来源未标注）', ai: false };
  return { text: row.ai ? `${row.label}（非真人）` : row.label, ai: row.ai };
}

/** AI 资源永远不得进入真人槽位（§六 / schema 硬约束）。 */
export function violatesHumanSlot(type) {
  return isAiType(type);
}

export function resourceTypeLabel(type) {
  const row = RESOURCE_TYPES.find((r) => r.type === type);
  return row ? row.label : String(type || '—');
}

/** 某首歌已导入的资源记录（来自资源索引 resources[]）。 */
export function resourcesFor(resourcesIndex, songId) {
  const rows = (resourcesIndex && resourcesIndex.resources) || [];
  return rows.filter((r) => r && r.song_id === songId);
}

/**
 * 某首歌的六个资源槽位。
 * 返回 [{ type, label, status, records }]，status ∈ NOT_IMPORTED | AVAILABLE。
 */
export function resourceSlots(resourcesIndex, songId) {
  const mine = resourcesFor(resourcesIndex, songId);
  return RESOURCE_TYPES.map(({ type, label }) => {
    const records = mine.filter((r) => r.resource_type === type);
    return { type, label, status: records.length ? AVAILABLE : NOT_IMPORTED, records };
  });
}

/** 槽位汇总：{ not_imported, available } 计数。 */
export function slotSummary(slots) {
  return {
    not_imported: slots.filter((s) => s.status === NOT_IMPORTED).length,
    available: slots.filter((s) => s.status === AVAILABLE).length,
  };
}

export default {
  NOT_IMPORTED, AVAILABLE, RESOURCE_TYPES, RESOURCE_TYPE_IDS,
  resourceTypeLabel, resourcesFor, resourceSlots, slotSummary,
  SOURCE_TYPES, SOURCE_TYPE_IDS, isAiType, isHumanType, sourceTypeDisplay, violatesHumanSlot,
};
