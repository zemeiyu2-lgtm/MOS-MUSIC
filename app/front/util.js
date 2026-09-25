/* =========================================================
   MOS-MUSIC｜Front Utilities（V2.0 前台共享工具）
   ---------------------------------------------------------
   前台（首页/歌曲/我的/歌曲页/学唱/教唱）共享的取数与渲染工具。
   只读内容层（IndexedDB 优先），不写任何 content/**。

   边界铁律：
     - 不打分、不排序、不产生任何「推荐 / 最佳歌曲」结论；
     - 前台不显示工程术语（tier / review_status / NOT_IMPORTED 等原始词
       只出现在后台档案页；前台一律翻译成普通语言）；
     - 资源缺失一律显示「尚未提供」，绝不虚构。
========================================================= */

import { getIndex, getUnit } from '../content-source.js';
import { resourceSlots } from '../song-resources.js';

export const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

/** 缺失显示：尚未提供（前台统一用语，对应后台的 NOT_IMPORTED / RESOURCE_PENDING）。 */
export const NOT_PROVIDED = '尚未提供';

/* ------------------------------------------------------- 曲库合并视图 */

/**
 * 前台歌曲目录 = 100 首候选（候选层）∪ 曲库 V0.5（详情层 10 + 登记层 45）。
 * 以候选层为骨架逐条补充层级信息；不做任何排序（保持候选 ID 序）。
 * 返回 [{ song_id, zh, en, theme, scene, layer, review_note }]
 *   layer: 'detail' | 'registry' | 'candidate'
 */
export async function loadCatalog() {
  const [candidates, selectedLibrary, songsIdx, registry, assign] = await Promise.all([
    getIndex('candidates').catch(() => null),
    getIndex('selected_library').catch(() => null),
    getIndex('songs').catch(() => null),
    getIndex('registry').catch(() => null),
    getIndex('taxonomy_assignments').catch(() => null),
  ]);
  const selectedIds = new Set(((selectedLibrary && selectedLibrary.songs) || []).map((s) => s.song_id));
  const detailMap = new Map(((songsIdx && songsIdx.songs) || []).map((s) => [s.song_id, s]));
  const regMap = new Map(((registry && registry.records) || []).map((r) => [r.song_id, r]));
  /* 四维分类（topic / situation / scene）：集合，多归属；用于筛选与展示。 */
  const taxMap = new Map(((assign && assign.assignments) || []).map((r) => [r.song_id, r]));
  const keysOf = (t, dim) => {
    const v = t && t.dimensions ? t.dimensions[dim] : null;
    return Array.isArray(v) ? v.map((x) => x.key) : [];
  };

  const rows = ((candidates && candidates.candidates) || []).map((c) => {
    const d = detailMap.get(c.song_id) || null;
    const r = regMap.get(c.song_id) || null;
    const t = taxMap.get(c.song_id) || null;
    return {
      song_id: c.song_id,
      zh: (d && d.title) || c.title_zh,
      en: (r && r.title_en) || c.title_en || null,
      theme: (c.front_tags && c.front_tags.theme) || null,
      scene: (c.front_tags && c.front_tags.scene) || null,
      formation_theme: c.formation_theme || null,
      /* 四维（数组，多归属） */
      themes: keysOf(t, 'theme'),
      situations: keysOf(t, 'situation'),
      scenes: keysOf(t, 'scene'),
      music: (t && t.dimensions && t.dimensions.music) || null,
      layer: selectedIds.has(c.song_id) ? 'selected'
        : d ? 'detail' : r ? 'registry' : 'candidate',
    };
  });
  /* 详情层若有候选之外的歌（理论无），补在末尾 */
  for (const [sid, d] of detailMap) {
    if (!rows.some((r) => r.song_id === sid)) {
      const t = taxMap.get(sid) || null;
      rows.push({
        song_id: sid, zh: d.title, en: null, theme: null, scene: null, formation_theme: null,
        layer: selectedIds.has(sid) ? 'selected' : 'detail',
        themes: keysOf(t, 'theme'), situations: keysOf(t, 'situation'), scenes: keysOf(t, 'scene'),
        music: (t && t.dimensions && t.dimensions.music) || null,
      });
    }
  }
  return rows;
}

export function catalogRowFor(rows, songId) {
  return (rows || []).find((r) => r.song_id === songId) || null;
}

/** 层级说明（前台语言）：详情层→已收录研究；登记层→曲库在册；候选→目标候选。 */
export function layerLabel(row) {
  if (!row) return '目标候选';
  if (row.layer === 'detail') return '已收录（含研究档案）';
  if (row.layer === 'registry') return '曲库在册';
  return '目标候选';
}

/* ------------------------------------------------------- 单曲上下文 */

/**
 * 歌曲页上下文：身份（候选/登记/详情）+ 资源槽位 + （核心歌时）已确认单元。
 * 一次取齐，供歌曲页 / 学唱 / 教唱共用。
 */
export async function loadSongContext(songId) {
  const [songsIdx, registry, resourcesIdx, annual, catalog] = await Promise.all([
    getIndex('songs').catch(() => null),
    getIndex('registry').catch(() => null),
    getIndex('song_resources').catch(() => null),
    getIndex('annual').catch(() => null),
    loadCatalog(),
  ]);
  let detailRec = null;
  try {
    const idxRow = ((songsIdx && songsIdx.songs) || []).find((s) => s.song_id === songId);
    if (idxRow && idxRow.file) {
      detailRec = await fetch(idxRow.file).then((r) => (r.ok ? r.json() : null));
    }
  } catch (_) { detailRec = null; }

  const row = catalogRowFor(catalog, songId) || { song_id: songId, zh: songId, en: null, layer: 'candidate' };
  const reg = ((registry && registry.records) || []).find((r) => r.song_id === songId) || null;

  /* 已人工确认的单元（theological_review = confirmed）中，
     本歌作为核心歌的周次 —— 用于「为什么唱 / 今天怎样活」。
     只取 confirmed：未裁决的单元不进入前台。 */
  let unit = null;
  for (const w of (annual && annual.units) || []) {
    try {
      const u = await getUnit(w.unit_id);
      if (u && u.core_song === songId && u.review_gate && u.review_gate.theological_review === 'confirmed') {
        unit = u;
        break;
      }
    } catch (_) { /* 忽略单个单元读取失败 */ }
  }

  const slots = resourceSlots(resourcesIdx, songId);
  return { songId, row, reg, detail: detailRec, slots, unit, catalog };
}

/** 前台身份行：ID｜中文名 English */
export function identityLine(ctx) {
  const row = ctx.row || {};
  const parts = [row.zh || ctx.songId];
  if (row.en) parts.push(row.en);
  return `${ctx.songId}｜${esc(parts.join(' '))}`;
}

/** 歌词槽位（LYRICS）里可用的歌词文本：支持 lyrics_text 字段（未来资源导入时）。 */
export function lyricsFromSlots(slots) {
  const ly = (slots || []).find((s) => s.type === 'LYRICS' && s.status === 'AVAILABLE');
  if (!ly || !ly.records.length) return null;
  const rec = ly.records[0];
  const text = rec.lyrics_text || rec.text || null;
  if (!text) return null;
  /* 分节：空行分隔；每节内按行分句 */
  const sections = String(text).split(/\n\s*\n/).map((sec) => sec.split(/\n/).map((l) => l.trim()).filter(Boolean)).filter((s) => s.length);
  return { language: rec.language || null, sections };
}

/** 音频槽位：示范=RECORDING|LEAD_VOCAL，陪唱=ACCOMPANIMENT。 */
export function audioFor(slots, kind) {
  const types = kind === 'demo' ? ['RECORDING', 'LEAD_VOCAL'] : ['ACCOMPANIMENT'];
  for (const t of types) {
    const slot = (slots || []).find((s) => s.type === t && s.status === 'AVAILABLE');
    if (slot) {
      const rec = slot.records.find((r) => r.file_url) || slot.records[0];
      if (rec && rec.file_url) return { type: t, url: rec.file_url, record: rec };
    }
  }
  return null;
}

/** 主题 / 处境 / 场景 / 音乐（四维分类）的取数。分类只帮人找到歌，不是歌曲身份。 */
let taxCache = null;
export async function loadTaxonomy() {
  if (taxCache) return taxCache;
  const [vocab, assign] = await Promise.all([
    getIndex('taxonomy').catch(() => null),
    getIndex('taxonomy_assignments').catch(() => null),
  ]);
  taxCache = { vocab, assign };
  return taxCache;
}

/** 某首歌的四维分类（数组；空维度如实为空）。 */
export async function taxonomyFor(songId) {
  const { vocab, assign } = await loadTaxonomy();
  const row = ((assign && assign.assignments) || []).find((r) => r.song_id === songId) || null;
  const dimViews = ((vocab && vocab.dimensions) || []).map((d) => {
    const val = row && row.dimensions ? row.dimensions[d.key] : null;
    const keys = Array.isArray(val) ? val.map((v) => v.key) : [];
    return { key: d.key, label: d.label, question: d.question, keys, empty_text: '尚未标注' };
  });
  return { row, dims: dimViews, vocab };
}

/** 歌曲内容层（meaning / scripture / background / reflection / practice / prayer）。 */
const contentCache = new Map();
export async function loadSongContent(songId) {
  if (contentCache.has(songId)) return contentCache.get(songId);
  const rec = await fetch(`content/song-content/${songId}.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  contentCache.set(songId, rec);
  return rec;
}

/** 歌曲内容层词表（字段名与中文标签来自内容层）。 */
export async function loadSongContentVocab() {
  return getIndex('song_content').catch(() => null);
}

/* ------------------------------------------------------- 封面语言索引 */

let themesCache = null;
/** 主题词表来自内容层（content/candidates/index.json），程序不硬编码主题词。 */
export async function loadThemes() {
  if (themesCache) return themesCache;
  const cand = await getIndex('candidates').catch(() => null);
  themesCache = (cand && cand.themes) || [];
  return themesCache;
}
/** 主题 → 封面视觉语言索引（内容驱动；词表缺失时由 covers 内部哈希兜底）。 */
export async function themeLangIndex(theme) {
  const { langIndexOf } = await import('./covers.js');
  return langIndexOf(theme, await loadThemes());
}

/* ------------------------------------------------------- 单曲单元（V3.0） */

let unitVocabCache = null;
const unitCache = new Map();

/**
 * 单曲单元词表（content/song-units/index.json）。
 * 含 18 段定义、生产状态、L1–L4 等级、十步教学法、三模式、四级学习状态。
 */
export async function loadUnitVocab() {
  if (unitVocabCache) return unitVocabCache;
  unitVocabCache = await getIndex('song_units').catch(() => null);
  return unitVocabCache;
}

/** 按 song_id 读单曲单元记录（带缓存）。该歌未建立单元时返回 null。 */
export async function loadUnit(songId) {
  if (unitCache.has(songId)) return unitCache.get(songId);
  const vocab = await loadUnitVocab();
  const row = ((vocab && vocab.units) || []).find((u) => u.song_id === songId);
  let rec = null;
  if (row && row.file) {
    rec = await fetch(row.file, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  /* 生产工作包：DRAFT 简谱草稿与 SOURCE_IMPORTED 原谱导入简谱都可预览；
     但前台必须如实显示「待人工听校」状态（等级只认单元记录）。 */
  if (rec) {
    const manifest = await fetch(`content/production/packages/${songId}/manifest.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const pkgScoreStatus = manifest && manifest.slots && manifest.slots.score && manifest.slots.score.status;
    const pkgScoreTrans = manifest && manifest.slots && manifest.slots.score && manifest.slots.score.transcription;
    if (pkgScoreStatus === 'DRAFT' || pkgScoreTrans === 'SOURCE_IMPORTED') {
      const score = await fetch(`content/production/packages/${songId}/score.json`, { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (score) rec.package = { manifest, score };
    }
  }
  unitCache.set(songId, rec);
  return rec;
}

/** 资源层记录 → 可播放 URL。只认真实 file_url；未提供一律 null，绝不虚构。 */
export function resolveResourceUrl(resourcesIndex, resourceId) {
  if (!resourceId) return null;
  const rec = ((resourcesIndex && resourcesIndex.resources) || [])
    .find((r) => r && r.resource_id === resourceId);
  if (!rec || !rec.file_url) return null;
  return { url: rec.file_url, record: rec };
}

/**
 * 单元音频轨 → 播放器源 { male, female, piano }。
 *   男 / 女声示唱按 demos.*.slots[].resource_id 解析；
 *   钢琴按资源层本歌 ACCOMPANIMENT 解析（第一阶段统一只做钢琴）。
 * 只有 status=PROVIDED 且资源层真实存在 file_url 才返回结果 —— 缺一律 null。
 */
export function unitSources(unit, resourcesIndex) {
  const out = { male: null, female: null, piano: null, accompOptions: [] };
  if (!unit) return out;
  const fromSlots = (track) => {
    if (!track || track.status !== 'PROVIDED') return null;
    for (const s of track.slots || []) {
      const hit = resolveResourceUrl(resourcesIndex, s.resource_id);
      if (hit) return hit;
    }
    return null;
  };
  out.male = fromSlots(unit.demos && unit.demos.male);
  out.female = fromSlots(unit.demos && unit.demos.female);
  const acc = ((resourcesIndex && resourcesIndex.resources) || [])
    .filter((r) => r && r.song_id === unit.song_id && r.resource_type === 'ACCOMPANIMENT' && r.file_url)
    .map((rec, i) => {
      const label = rec.label || rec.instrument
        ? `${rec.label || rec.instrument}`
        : (String(rec.notes || rec.source || '').match(/钢琴|吉他|乐队|管弦|风琴|木琴|原声/) || [])[0] || `伴奏 ${i + 1}`;
      return { key: `accomp_${i + 1}`, label: `🎵 ${label.endsWith('伴奏') ? label : label + '伴奏'}`, url: rec.file_url, record: rec };
    });
  out.accompOptions = acc;
  const pianoRec = acc.find((x) => /钢琴/.test(x.label));
  if (pianoRec) out.piano = pianoRec;
  else if (unit.piano && unit.piano.status === 'PROVIDED' && acc[0]) out.piano = acc[0];
  return out;
}

/** 等级条目（NONE / L1 … L4）。 */
export function levelEntry(vocab, key) {
  return ((vocab && vocab.completion_levels) || []).find((l) => l.key === key) || null;
}
/** 等级的前台用词（如「可以读谱唱」）。 */
export function levelFrontLabel(vocab, key) {
  const e = levelEntry(vocab, key);
  return e ? e.front_label : '资源待制作';
}
/** 等级说明。 */
export function levelNote(vocab, key) {
  const e = levelEntry(vocab, key);
  return e ? e.note : null;
}
/** 生产状态说明（INTAKE → 已进入待制作库 …）。 */
export function stateEntry(vocab, key) {
  return ((vocab && vocab.production_states) || []).find((s) => s.key === key) || null;
}
/** 18 段定义（含 no / label / group）。 */
export function sectionEntry(vocab, key) {
  return ((vocab && vocab.sections) || []).find((s) => s.key === key) || null;
}
/** 需求项中文名（lyrics → 歌词）。 */
export function requirementLabel(vocab, key) {
  return ((vocab && vocab.requirement_labels) || {})[key] || key;
}
/** 需求项中文名数组。 */
export function requirementList(vocab, keys) {
  return (keys || []).map((k) => requirementLabel(vocab, k));
}
/** 段状态 → 前台用语。 */
export function presenceText(status) {
  return status === 'PROVIDED' ? '已提供' : NOT_PROVIDED;
}

export default {
  esc, NOT_PROVIDED, loadCatalog, catalogRowFor, layerLabel,
  loadSongContext, identityLine, lyricsFromSlots, audioFor,
  loadThemes, themeLangIndex,
  loadTaxonomy, taxonomyFor, loadSongContent, loadSongContentVocab,
  loadUnitVocab, loadUnit, resolveResourceUrl, unitSources,
  levelEntry, levelFrontLabel, levelNote, stateEntry, sectionEntry,
  requirementLabel, requirementList, presenceText,
};
