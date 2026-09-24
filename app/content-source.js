/* =========================================================
   MOS-MUSIC｜Content Source（内容层 → 本地库 → 应用）
   ---------------------------------------------------------
   规格书 §7 基本逻辑：用户操作 → Local DB → …；§34：内容与程序分离。
   本模块是程序读取内容的唯一入口：
     1) 首次启动把打包内容写入 IndexedDB（ensureSeeded）
     2) 之后一律从本地库读取（离线优先）
     3) 本地库缺失时才 fetch，并回写本地库

   注意：这里"打包内容"= 仓库内的 content/*.json（Phase 1 没有后端）。
   Phase 2+ 接入服务器后，ensureSeeded 将改为"按 content manifest 增量下载"，
   本模块对外接口不变。
========================================================= */

import * as store from './store.js';

const CONTENT_VERSION = 'MUS-V-1.0.0';
const SEED_KEY = 'seeded:content';

/** 索引类内容 → content_meta（key = index:<kind>）。V1.0 增加生产平台索引；V0.5 增加扩库登记索引与派生索引；V1.1-A 增加资源层 / 审查记录层 / 升层与认定留档 / 登记层；V2.0 增加 100 首候选库；V3.0 增加单曲完整单元词表。 */
const INDEX_KINDS = Object.freeze([
  'courses', 'songs', 'themes', 'training', 'contexts', 'map', 'bible', 'framework', 'annual',
  'production', 'lexicon', 'calibration', 'governance', 'usage', 'library',
  'theme_counts', 'song_scripture', 'song_discernment',
  'song_resources', 'review_records', 'promotions', 'determinations', 'registry',
  'candidates', 'song_units', 'song_packages',
  /* V3.x：四维分类 / 歌曲内容层 / 歌唱教练词表 / 100 首资源普查表 */
  'taxonomy', 'taxonomy_assignments', 'song_content', 'coach', 'resource_discovery',
  /* V3.x：五首样板教学包（乐句教学卡 · content/teaching） */
  'teaching',
]);

/** kind → 内容文件（唯一映射，getIndex 与 ensureSeeded 共用）。 */
const INDEX_FILES = Object.freeze({
  courses: 'content/courses/index.json',
  songs: 'content/songs/index.json',
  themes: 'content/themes/index.json',
  training: 'content/training/index.json',
  contexts: 'content/contexts/index.json',
  map: 'content/map/MOS-MUSIC-MAP_V1.0.json',
  bible: 'content/bible/reference-index.json',
  framework: 'content/framework/music-units.json',
  annual: 'content/annual/2027/index.json',
  production: 'content/production/index.json',
  lexicon: 'content/production/discernment-lexicon.json',
  calibration: 'content/production/calibration-issues.json',
  governance: 'content/production/version-governance.json',
  usage: 'content/production/library-usage.json',
  library: 'content/library/index.json',
  /* 派生索引（CI-0014 案 a）：从曲库推导，不是权威源，只读展示 */
  theme_counts: 'content/production/theme-song-counts.json',
  song_scripture: 'content/production/song-scripture-index.json',
  song_discernment: 'content/production/song-discernment-v0.5.json',
  /* V1.1-A：资源层 / 人工审查记录层 / 升层声明与锚点认定留档 / 登记层（详情页读取） */
  song_resources: 'content/song-resources/index.json',
  review_records: 'content/production/review-records.json',
  promotions: 'content/production/library-promotions.json',
  determinations: 'content/production/song-anchor-determinations.json',
  registry: 'content/library/registry.json',
  /* V2.0：100 首目标候选库（候选层，§17） */
  candidates: 'content/candidates/index.json',
  /* V3.0：单曲完整歌曲单元词表 + 单元清单（18 段 / L1–L4 / 十步教学法） */
  song_units: 'content/song-units/index.json',
  /* PILOT 10：生产工作包清单（10 首 × 9 槽位；载荷在各包文件内，按需 fetch） */
  song_packages: 'content/production/packages/index.json',
  /* V3.x：四维分类（主题 / 处境 / 场景 / 音乐）+ 分词结果（派生） */
  taxonomy: 'content/taxonomy/index.json',
  taxonomy_assignments: 'content/taxonomy/assignments.json',
  /* V3.x：歌曲内容层（meaning / scripture / background / reflection / practice / prayer） */
  song_content: 'content/song-content/index.json',
  /* V3.x：MOS Singing Coach 词表与训练项目模型（独立模块） */
  coach: 'content/coach/index.json',
  /* V3.x：100 首资源普查表（外部检索未执行前一律 UNSURVEYED，只填可证事实） */
  resource_discovery: 'content/production/resource-discovery.json',
  /* V3.x：五首样板教学包（乐句教学卡 · content/teaching） */
  teaching: 'content/teaching/index.json',
});

/** 年度周次记录（生产平台的读取对象）在 content_meta 中的 kind 标记。 */
const ANNUAL_WEEK_KIND = 'annual_week';
const ANNUAL_UNIT_KIND = 'annual_unit';

/** 模板文件（app 结构的一部分，文件名固定） */
const TEMPLATE_FILES = Object.freeze([
  'content/templates/family-5min.json',
  'content/templates/group-flow.json',
  'content/templates/church-season.json',
]);

const inFlight = new Map();

function fetchJSON(rel) {
  return fetch(rel, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`读取 ${rel} 失败（HTTP ${r.status}）`);
    return r.json();
  });
}

/* ---------------------------------------------------------------- 种子 */

async function seedIndex(kind, rel) {
  const data = await fetchJSON(rel);
  await store.put('content_meta', { key: `index:${kind}`, kind: 'index', value: data, updated_at: new Date().toISOString() });
  return data;
}

async function seedCourses() {
  const index = await seedIndex('courses', 'content/courses/index.json');
  const units = (index && index.units) || [];
  const records = [];
  for (const u of units) {
    records.push(await fetchJSON(`content/courses/${u.course_id}.json`));
  }
  await store.putMany('content_courses', records);
  return records.length;
}

async function seedTraining() {
  const index = await seedIndex('training', 'content/training/index.json');
  const files = [];
  for (const l of index.levels || []) files.push(`content/training/${l.training_id}.json`);
  for (const f of index.forms || []) files.push(`content/training/${f.form_id}.json`);
  let n = 0;
  for (const rel of files) {
    const rec = await fetchJSON(rel);
    // 层级记录进 content_training（keyPath training_id），表单记录进 content_forms（keyPath form_id）
    if (rec.training_id) await store.put('content_training', rec);
    else if (rec.form_id) await store.put('content_forms', rec);
    n += 1;
  }
  return n;
}

async function seedSongs() {
  const index = await seedIndex('songs', 'content/songs/index.json');
  const rows = (index && index.songs) || [];
  let n = 0;
  for (const row of rows) {
    const rec = await fetchJSON(row.file);
    await store.put('content_songs', rec);
    n += 1;
  }
  return n;
}

async function seedContexts() {
  const index = await seedIndex('contexts', 'content/contexts/index.json');
  const rows = (index && index.contexts) || [];
  await store.putMany('content_contexts', rows);
  return rows.length;
}

async function seedTemplates() {
  for (const rel of TEMPLATE_FILES) {
    const rec = await fetchJSON(rel);
    await store.put('content_templates', rec);
  }
  return TEMPLATE_FILES.length;
}

/**
 * 年度周次与单元记录落库。
 * 生产平台（MODULE 12）需要离线读取 WNN 周记录与完整单元，
 * 因此把它们写入 content_meta（key = week:<id> / unit:<id>），
 * 不改动 IndexedDB 库版本，也不新增 store。
 */
async function seedAnnualRecords() {
  const index = await seedIndex('annual', INDEX_FILES.annual);
  let n = 0;
  for (const w of index.weeks || []) {
    const rec = await fetchJSON(w.file);
    await store.put('content_meta', {
      key: `week:${w.week_id}`, kind: ANNUAL_WEEK_KIND, value: rec, updated_at: new Date().toISOString(),
    });
    n += 1;
  }
  for (const u of index.units || []) {
    const rec = await fetchJSON(u.file);
    await store.put('content_meta', {
      key: `unit:${u.unit_id}`, kind: ANNUAL_UNIT_KIND, value: rec, updated_at: new Date().toISOString(),
    });
    n += 1;
  }
  return n;
}

/**
 * 首次启动种子。幂等：以 content_meta 的 seeded:content 标记判断。
 * 返回 { seeded:boolean, counts:{...} }。
 */
export async function ensureSeeded({ force = false } = {}) {
  const marker = await store.get('content_meta', SEED_KEY);
  if (marker && !force) return { seeded: false, version: marker.value && marker.value.version };

  const counts = {};
  counts.courses = await seedCourses();
  counts.songs = await seedSongs();
  await seedIndex('themes', INDEX_FILES.themes);
  counts.training = await seedTraining();
  counts.contexts = await seedContexts();
  counts.templates = await seedTemplates();
  await seedIndex('map', INDEX_FILES.map);
  await seedIndex('bible', INDEX_FILES.bible);
  await seedIndex('framework', INDEX_FILES.framework);
  await seedIndex('production', INDEX_FILES.production);
  await seedIndex('lexicon', INDEX_FILES.lexicon);
  await seedIndex('calibration', INDEX_FILES.calibration);
  await seedIndex('governance', INDEX_FILES.governance);
  await seedIndex('usage', INDEX_FILES.usage);
  await seedIndex('library', INDEX_FILES.library);
  /* 派生索引（CI-0014 案 a）：与曲库同批落库，保证离线也能读到正确的计数与锚点 */
  await seedIndex('theme_counts', INDEX_FILES.theme_counts);
  await seedIndex('song_scripture', INDEX_FILES.song_scripture);
  await seedIndex('song_discernment', INDEX_FILES.song_discernment);
  /* V1.1-A：资源层 / 审查记录层 / 升层声明 / 锚点认定 / 登记层（歌曲详情与周音乐页需要） */
  await seedIndex('song_resources', INDEX_FILES.song_resources);
  await seedIndex('review_records', INDEX_FILES.review_records);
  await seedIndex('promotions', INDEX_FILES.promotions);
  await seedIndex('determinations', INDEX_FILES.determinations);
  await seedIndex('registry', INDEX_FILES.registry);
  /* V2.0：候选库（100 首目标，离线可搜） */
  await seedIndex('candidates', INDEX_FILES.candidates);
  /* V3.0：单曲完整单元词表（18 段 / 等级 / 十步教学法 / 三模式 / 四级状态） */
  await seedIndex('song_units', INDEX_FILES.song_units);
  /* PILOT 10：生产工作包清单 */
  await seedIndex('song_packages', INDEX_FILES.song_packages);
  /* V3.x：四维分类 / 歌曲内容层 / 歌唱教练 / 资源普查表 */
  await seedIndex('taxonomy', INDEX_FILES.taxonomy);
  await seedIndex('taxonomy_assignments', INDEX_FILES.taxonomy_assignments);
  await seedIndex('song_content', INDEX_FILES.song_content);
  await seedIndex('coach', INDEX_FILES.coach);
  await seedIndex('resource_discovery', INDEX_FILES.resource_discovery);
  counts.annual_records = await seedAnnualRecords();

  await store.put('content_meta', {
    key: SEED_KEY,
    kind: 'bootstrap',
    value: { version: CONTENT_VERSION, at: new Date().toISOString(), counts },
    updated_at: new Date().toISOString(),
  });
  return { seeded: true, version: CONTENT_VERSION, counts };
}

/** 种子状态（供「我的」页与诊断显示）。 */
export async function seedStatus() {
  const marker = await store.get('content_meta', SEED_KEY);
  const outbox = await store.outboxCount().catch(() => 0);
  return {
    seeded: Boolean(marker),
    version: marker ? marker.value && marker.value.version : null,
    counts: marker ? marker.value && marker.value.counts : null,
    outbox,
  };
}

/* ---------------------------------------------------------------- 读取 API */

/** 读索引（content_meta → fetch 回退并回写）。 */
export async function getIndex(kind) {
  if (!INDEX_KINDS.includes(kind)) throw new Error(`未知内容索引：${kind}`);
  const key = `index:${kind}`;
  const local = await store.get('content_meta', key).catch(() => null);
  if (local && local.value) return local.value;
  if (inFlight.has(key)) return inFlight.get(key);
  const p = (async () => {
    const rel = INDEX_FILES[kind];
    const data = await fetchJSON(rel);
    await store.put('content_meta', { key, kind: 'index', value: data, updated_at: new Date().toISOString() }).catch(() => {});
    return data;
  })();
  inFlight.set(key, p);
  try { return await p; } finally { inFlight.delete(key); }
}

/** 读年度周记录（content_meta → fetch 回退）。 */
export async function getWeek(weekId) {
  const key = `week:${weekId}`;
  const local = await store.get('content_meta', key).catch(() => null);
  if (local && local.value) return local.value;
  const data = await fetchJSON(`content/annual/2027/weeks/${weekId}.json`);
  await store.put('content_meta', {
    key, kind: ANNUAL_WEEK_KIND, value: data, updated_at: new Date().toISOString(),
  }).catch(() => {});
  return data;
}

/** 读完整音乐门训单元（content_meta → fetch 回退）。 */
export async function getUnit(unitId) {
  const key = `unit:${unitId}`;
  const local = await store.get('content_meta', key).catch(() => null);
  if (local && local.value) return local.value;
  const data = await fetchJSON(`content/annual/2027/units/${unitId}.json`);
  await store.put('content_meta', {
    key, kind: ANNUAL_UNIT_KIND, value: data, updated_at: new Date().toISOString(),
  }).catch(() => {});
  return data;
}

/** 全部年度周记录（离线可用；供生产控制台与统计使用）。 */
export async function getAllWeeks() {
  const rows = await store.getAllBy('content_meta', 'by_kind', ANNUAL_WEEK_KIND).catch(() => []);
  return rows.map((r) => r.value).filter(Boolean);
}

/** 全部完整单元。 */
export async function getAllUnits() {
  const rows = await store.getAllBy('content_meta', 'by_kind', ANNUAL_UNIT_KIND).catch(() => []);
  return rows.map((r) => r.value).filter(Boolean);
}

/** 读单条课程记录（content_courses → fetch 回退并回写）。 */
export async function getCourse(courseId) {
  const local = await store.get('content_courses', courseId).catch(() => null);
  if (local) return local;
  const rel = `content/courses/${courseId}.json`;
  const data = await fetchJSON(rel);
  await store.put('content_courses', data).catch(() => {});
  return data;
}

/** 读实施模板（content_templates → fetch 回退并回写）。 */
export async function getTemplate(templateId) {
  const local = await store.get('content_templates', templateId).catch(() => null);
  if (local) return local;
  const map = {
    'MUS-TPL-FAM-5MIN': 'content/templates/family-5min.json',
    'MOS-TPL-GRP-FLOW': 'content/templates/group-flow.json',
    'MOS-TPL-CHU-SEASON': 'content/templates/church-season.json',
  };
  const rel = map[templateId];
  if (!rel) throw new Error(`未知模板：${templateId}`);
  const data = await fetchJSON(rel);
  await store.put('content_templates', data).catch(() => {});
  return data;
}

export default {
  ensureSeeded, seedStatus, getIndex, getCourse, getTemplate,
  getWeek, getUnit, getAllWeeks, getAllUnits, CONTENT_VERSION,
};
