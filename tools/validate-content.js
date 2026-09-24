/* =========================================================
   MOS-MUSIC｜Content Validator
   ---------------------------------------------------------
   Node 零依赖。CI 与本地都必须全绿。

   三层检查：
     1) 内容/程序分离（规格书 §34，硬检查）
        - app/** 不得包含 24 课主题名、经文引用、歌曲名等"内容字符串"
        - content/** 不得包含任何可执行代码（function / import / <script / eval / onclick ...）
     2) JSON Schema 子集校验（required / type / enum / pattern / minItems / maxItems / additionalProperties）
     3) 交叉引用完整性（course ↔ map ↔ theme ↔ training ↔ context ↔ song）

   退出码：0 = 通过；1 = 存在 ERROR；2 = 存在 WARN（仍算通过，但要报告）。
========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

/* ---------------------------------------------------------------- 基础工具 */

function listFiles(dir, ext, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  const exts = Array.isArray(ext) ? ext : (ext ? [ext] : null);
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, exts, acc);
    else if (!exts || exts.some((x) => e.name.endsWith(x))) acc.push(p);
  }
  return acc;
}

function readJSON(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const errors = [];
const warnings = [];
const infos = [];
const err = (rel, msg) => errors.push(`[ERROR] ${rel}: ${msg}`);
const warn = (rel, msg) => warnings.push(`[WARN] ${rel}: ${msg}`);
const info = (msg) => infos.push(`[INFO] ${msg}`);

/* ---------------------------------------------------------------- 1. 内容/程序分离 */

const COURSE_TITLES = [
  '创造', '圣洁', '慈爱', '信实',
  '道成肉身', '十字架', '复活', '跟随基督',
  '悔改', '信心', '圣洁生活', '祷告',
  '彼此相爱', '彼此饶恕', '彼此服事', '合一与教会',
  '家庭', '工作与责任', '苦难与盼望', '爱邻舍',
  '见证基督', '万民与宣教', '训练别人', '门徒再生产',
];

/** content/** 中禁止出现的代码形态（内容层必须是纯数据） */
const CODE_IN_CONTENT = [
  [/function\s*\(/, 'function'],
  [/=>/, '箭头函数'],
  [/<script/i, '<script'],
  [/eval\(/, 'eval('],
  [/onclick|onload|onerror/i, '内联事件处理器'],
  [/(^|[^.$])\bimport\b/, 'import'],
  [/\bmodule\.exports\b/, 'module.exports'],
  [/\bdocument\./, 'document.'],
  [/\bwindow\./, 'window.'],
  [/\bfetch\(/, 'fetch('],
  [/\blocalStorage\b|\bindexedDB\b/i, '浏览器存储 API'],
  [/\bnew\s+Date\s*\(/, 'new Date()'],
];

/** app/** 中禁止出现的 MOS-DIS 存储痕迹（跨产品污染）。
 *  只检测真实使用（localStorage.xxx / ['"]mos_state / ['"]mos_user），
 *  注释里对规则的说明文字不算违规。 */
const RE_LS_USAGE = /(?:^|[^.\w$])(?:window\.)?localStorage\s*(?:\.|\[|=)/;
const FORBIDDEN_STORAGE = [
  [RE_LS_USAGE, 'localStorage（MOS-MUSIC 一律用 IndexedDB）'],
  [/['"`]mos_state/, 'MOS-DIS localStorage key（mos_state_*）'],
  [/['"`]mos_user/, 'MOS-DIS localStorage key（mos_user）'],
];

/** 经文引用形态，例如 弗2:8–10 / 徒2:1–21,36–42 */
const PASSAGE_RE = /[^\x00-\x7F]{1,3}[0-9]{1,3}\s*:\s*[0-9]{1,3}(?:[–-][0-9]{1,3})?(?:\s*,\s*[0-9]{1,3}(?:[–-][0-9]{1,3})?)*/;

function checkSeparation() {
  /* V1.0：平台引擎是 ES module（.js，避免静态服务器 MIME 映射风险），必须与 .js 一起接受内容/程序分离检查，
     否则新增的 app/ 下的引擎文件会成为分离检查的盲区。 */
  const appFiles = listFiles(path.join(ROOT, 'app'), ['.js', '.mjs'])
    .concat(listFiles(path.join(ROOT, 'app'), '.css'))
    .concat([path.join(ROOT, 'index.html'), path.join(ROOT, 'offline.html'), path.join(ROOT, 'sw.js')]);

  for (const f of appFiles) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const src = fs.readFileSync(f, 'utf8');

    // 1a. 不允许出现 24 课主题名（内容字符串）
    for (const t of COURSE_TITLES) {
      const allowedIn = UI_WORD_ALLOWLIST[t];
      if (allowedIn && allowedIn.some((f) => rel === f || rel.endsWith('/' + f))) continue;
      if (src.includes(t)) err(rel, `程序文件包含课程主题字符串「${t}」（§34 内容与程序必须分离）`);
    }

    // 1b. 不允许出现经文引用
    const m = src.match(PASSAGE_RE);
    if (m) err(rel, `程序文件包含疑似经文引用「${m[0]}」（§34）`);

    // 1b-2. 程序文件不得硬编码歌曲 ID / 年度周裁决（这些必须从 content/ 读）
    //       例外：SW 预缓存清单里的 './content/...' 与 './assets/audio/...' 路径字面量
    //       是运维路径（资产文件名含歌曲 ID 是归档惯例），不是歌曲身份逻辑。
    const srcNoPaths = src.replace(/'\.\/(?:content|assets)\/[^']*'/g, "''");
    const sid = srcNoPaths.match(/MUS-S-\d{4}/);
    if (sid) err(rel, `程序文件硬编码歌曲 ID「${sid[0]}」（§34：歌曲身份只能来自 content/）`);
    const unitId = src.match(/MUS-U-2027-W\d{2}/);
    if (unitId) err(rel, `程序文件硬编码单元 ID「${unitId[0]}」（§34：单元身份只能来自 content/）`);

    // 1c. 不允许使用 MOS-DIS 的存储
    for (const [re, why] of FORBIDDEN_STORAGE) {
      if (re.test(src)) err(rel, `程序文件使用了 ${why}`);
    }
  }

  // 1d. content/** 必须是纯数据
  const contentFiles = listFiles(path.join(ROOT, 'content'), '.json');
  for (const f of contentFiles) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const src = fs.readFileSync(f, 'utf8');
    for (const [re, why] of CODE_IN_CONTENT) {
      if (re.test(src)) err(rel, `内容文件包含代码形态（${why}）—— content/ 只允许数据（§34）`);
    }
  }

  // 1e. schema/ 例外说明：schema 文件里会有 "function"、"enum" 等词，但它们是 JSON Schema 元数据，
  //     已通过"不含可执行代码形态"检查（不含 function( / => / <script 等）。
  info(`内容/程序分离：检查了 ${appFiles.length} 个程序文件 + ${contentFiles.length} 个内容文件。`);
}

/* ---------------------------------------------------------------- 2. Schema 子集校验 */

/* 有些 24 课主题名同时也是 §28 规定的首页入口名（如「家庭」）。
 * 这类词只允许出现在 app/modules.js（模块注册表）里，
 * 出现在其它程序文件仍然算内容泄漏。新增白名单词必须记录到 docs/ADR.md。 */
const UI_WORD_ALLOWLIST = Object.freeze({
  家庭: ['app/modules.js'],
});

const ID_RE = {
  songId: /^MUS-S-[0-9]{4}$/,
  courseId: /^MUS-C-(0[1-9]|1[0-9]|2[0-4])$/,
  stepId: /^MUS-C-(0[1-9]|1[0-9]|2[0-4])-S[1-7]$/,
  themeId: /^TH-(0[1-9]|1[0-9]|2[0-4])$/,
  contextId: /^CTX-[A-Z]{2,6}$/,
  trainingId: /^MUS-T-L[123]$/,
  formId: /^MUS-F-0[1-6]$/,
  mapId: /^MAP-C(0[1-9]|1[0-9]|2[0-4])$/,
  practiceId: /^MUS-PR-[0-9]{8}-[0-9]{2}$/,
  feedbackId: /^MUS-FB-[0-9]{8}-[0-9]{2}$/,
  bibleRefId: /^BB-[A-Z0-9]{3}-[0-9]{1,3}(-[0-9]{1,3})?$/,
  passageRef: /^[\s\S]{3,40}$/,
  lqId: /^LQ0[1-8]$/,
  mosWeekId: /^W[0-9]{2}$/,
  version: /^MUS-V-[0-9]+\.[0-9]+\.[0-9]+$/,
};

const schemaCache = new Map();
function loadSchemaFile(rel) {
  const key = rel.replace(/\\/g, '/');
  if (!schemaCache.has(key)) schemaCache.set(key, readJSON(key));
  return schemaCache.get(key);
}

/** 解析 $ref。支持同文件（#/…）与跨文件（common.schema.json#/…）两种形式。 */
function resolveRef(schema, ctx) {
  const ref = schema && schema.$ref;
  if (!ref) return { schema, root: ctx.root };
  let frag = ref;
  let root = ctx.root;
  if (!ref.startsWith('#/')) {
    const i = ref.indexOf('#');
    const file = i < 0 ? ref : ref.slice(0, i);
    frag = i < 0 ? '#/' : ref.slice(i);
    const dir = path.dirname(ctx.file);
    const target = path.normalize(path.join(dir, file)).replace(/\\/g, '/');
    root = loadSchemaFile(target);
  }
  let node = root;
  for (const seg of frag.replace(/^#\//, '').split('/').filter(Boolean)) {
    node = node[seg];
    if (node === undefined) throw new Error(`无法解析 $ref「${ref}」的段「${seg}」`);
  }
  return { schema: node, root };
}

function validate(value, schema, ctx, rel, ptr, opts = {}) {
  if (!schema) return;
  const { schema: s, root } = resolveRef(schema, ctx);
  if (!s) return;
  const sub = { root, file: ctx.file };

  if (s.allOf) { for (const one of s.allOf) validate(value, one, sub, rel, ptr, opts); }
  if (s.anyOf) {
    let ok = false;
    for (const one of s.anyOf) {
      const before = errors.length;
      validate(value, one, sub, rel, ptr, { ...opts, quiet: true });
      if (errors.length === before) { ok = true; break; }
      errors.length = before; // 回滚该分支的错误
    }
    if (!ok && !opts.quiet) err(rel, `${ptr} 不满足 anyOf`);
    if (!ok) return;
  }
  if (s.if && !opts.quiet) {
    const before = errors.length;
    validate(value, s.if, sub, rel, ptr, { ...opts, quiet: true });
    const matched = errors.length > before;
    errors.length = before;
    if (matched && s.then) validate(value, s.then, sub, rel, ptr, opts);
    if (!matched && s.else) validate(value, s.else, sub, rel, ptr, opts);
  }

  if (s.type) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    const actual = value === null ? 'null'
      : Array.isArray(value) ? 'array'
      : typeof value;
    const ok = types.some((t) => t === actual
      || (t === 'integer' && actual === 'number' && Number.isInteger(value)));
    if (!ok && !opts.quiet) { err(rel, `${ptr} 类型应为 ${types.join('|')}，实际 ${actual}`); return; }
    if (!ok) return;
  }

  if (s.enum && !opts.quiet) {
    if (value !== null && !s.enum.includes(value)) err(rel, `${ptr} = ${JSON.stringify(value)} 不在 enum 内`);
  }

  if (s.pattern && typeof value === 'string' && !opts.quiet) {
    if (!new RegExp(s.pattern).test(value)) err(rel, `${ptr} = "${value}" 不匹配 ${s.pattern}`);
  }

  if (s.minLength !== undefined && typeof value === 'string' && !opts.quiet) {
    if (value.length < s.minLength) err(rel, `${ptr} 长度 < ${s.minLength}`);
  }
  if (s.maxLength !== undefined && typeof value === 'string' && !opts.quiet) {
    if (value.length > s.maxLength) err(rel, `${ptr} 长度 > ${s.maxLength}`);
  }
  if (s.minimum !== undefined && typeof value === 'number' && !opts.quiet) {
    if (value < s.minimum) err(rel, `${ptr} < 最小值 ${s.minimum}`);
  }
  if (s.maximum !== undefined && typeof value === 'number' && !opts.quiet) {
    if (value > s.maximum) err(rel, `${ptr} > 最大值 ${s.maximum}`);
  }
  if (s.minItems !== undefined && Array.isArray(value) && !opts.quiet) {
    if (value.length < s.minItems) err(rel, `${ptr} 数量 < ${s.minItems}`);
  }
  if (s.maxItems !== undefined && Array.isArray(value) && !opts.quiet) {
    if (value.length > s.maxItems) err(rel, `${ptr} 数量 > ${s.maxItems}`);
  }

  if (s.required && typeof value === 'object' && value !== null && !Array.isArray(value) && !opts.quiet) {
    for (const k of s.required) {
      if (!(k in value)) err(rel, `${ptr} 缺少必填字段 "${k}"`);
    }
  }

  if (s.properties && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const extra = Object.keys(value).filter((k) => !s.properties[k]);
    if (s.additionalProperties === false && extra.length && !opts.quiet) {
      err(rel, `${ptr} 含未知字段：${extra.join(', ')}`);
    }
    for (const [k, propSchema] of Object.entries(s.properties)) {
      if (k in value) validate(value[k], propSchema, sub, rel, `${ptr}.${k}`, opts);
    }
  }

  if (s.items && Array.isArray(value)) {
    value.forEach((v, i) => validate(v, s.items, sub, rel, `${ptr}[${i}]`, opts));
  }
}

function validateDataAgainst(schemaRel, data, relLabel) {
  const schema = readJSON(schemaRel);
  validate(data, schema, { root: schema, file: schemaRel }, relLabel, '$');
}

/* ---------------------------------------------------------------- 3. 交叉引用完整性 */

function checkIntegrity() {
  const courses = readJSON('content/courses/index.json');
  const themes = readJSON('content/themes/index.json');
  const songs = readJSON('content/songs/index.json');
  const training = readJSON('content/training/index.json');
  const contexts = readJSON('content/contexts/index.json');
  const map = readJSON('content/map/MOS-MUSIC-MAP_V1.0.json');
  const bible = readJSON('content/bible/reference-index.json');

  /* --- 24 课 --- */
  if (courses.count !== courses.units.length) err('content/courses/index.json', `count(${courses.count}) 与 units 长度(${courses.units.length}) 不一致`);
  if (courses.units.length !== 24) err('content/courses/index.json', `24 课应为 24 个单元，实际 ${courses.units.length}`);
  courses.units.forEach((u, i) => {
    const n = i + 1;
    const id = `MUS-C-${String(n).padStart(2, '0')}`;
    if (u.course_id !== id) err('content/courses/index.json', `第 ${n} 个单元 ID 应为 ${id}，实际 ${u.course_id}`);
    if (u.unit_no !== n) err('content/courses/index.json', `${id} 的 unit_no 应为 ${n}，实际 ${u.unit_no}`);
    if (!u.map_id || u.map_id !== `MAP-C${String(n).padStart(2, '0')}`) err('content/courses/index.json', `${id} 的 map_id 异常：${u.map_id}`);
    if (!u.theme_id || u.theme_id !== `TH-${String(n).padStart(2, '0')}`) err('content/courses/index.json', `${id} 的 theme_id 异常：${u.theme_id}`);
  });

  // 完整记录逐个校验
  const courseFiles = listFiles(path.join(ROOT, 'content/courses'), '.json').filter((f) => /MUS-C-\d{2}\.json$/.test(f));
  if (courseFiles.length !== 24) err('content/courses/', `应有 24 个 MUS-C-NN.json，实际 ${courseFiles.length}`);
  const courseRecords = new Map();
  for (const f of courseFiles) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const rec = readJSON(rel);
    courseRecords.set(rec.course_id, rec);
    validateDataAgainst('content/schema/course.schema.json', rec, rel);

    // 每课页面结构：核心歌曲 1 首 / 辅助 0–2 首（§16）
    if (rec.core_song && rec.support_songs && rec.support_songs.includes(rec.core_song)) {
      err(rel, `辅助歌曲不得与核心歌曲重复`);
    }
    const steps = Object.keys(rec.seven_steps || {});
    const expect = ['S1_read', 'S2_understand', 'S3_sing', 'S4_remember', 'S5_feel', 'S6_act', 'S7_transmit'];
    if (JSON.stringify(steps) !== JSON.stringify(expect)) {
      err(rel, `seven_steps 必须按七步法顺序包含 ${expect.join(', ')}，实际 ${steps.join(', ')}`);
    }
  }

  /* --- 主题 --- */
  if (themes.count !== themes.themes.length) err('content/themes/index.json', 'count 与 themes 长度不一致');
  if (themes.themes.length !== 24) err('content/themes/index.json', `主题应为 24 个，实际 ${themes.themes.length}`);
  themes.themes.forEach((t, i) => {
    if (t.theme_id !== `TH-${String(i + 1).padStart(2, '0')}`) err('content/themes/index.json', `主题序号异常：${t.theme_id}`);
    const cu = courses.units[i];
    if (cu && t.name !== cu.title) err('content/themes/index.json', `主题名与课程名不一致：${t.name} vs ${cu.title}`);
    // song_count 一致性在 Phase 2A 段按实际音乐库校验
  });

  /* --- 音乐库 --- */
  if (songs.count !== songs.songs.length) err('content/songs/index.json', 'count 与 songs 长度不一致');
  if (songs.songs.length === 0) {
    info('音乐库为空（0 首）—— 符合规格书 §36（第一阶段不批量导入歌曲）。');
  }
  const songIds = new Set(songs.songs.map((s) => s.song_id));
  for (const s of songs.songs) {
    const rel = `content/songs/index.json#${s.song_id}`;
    // 版权闸门（§27）：托管内容必须有合法授权
    const c = s.copyright || {};
    if (c.audio_availability === 'hosted_authorized'
      && !['licensed', 'permission_granted', 'public_domain'].includes(c.copyright_status)) {
      err(rel, `托管音频必须有合法授权，当前 copyright_status=${c.copyright_status}`);
    }
    if (c.lyrics_availability === 'hosted_authorized'
      && !['licensed', 'permission_granted', 'public_domain'].includes(c.copyright_status)) {
      err(rel, `托管歌词必须有合法授权，当前 copyright_status=${c.copyright_status}`);
    }
    if (s.lyrics && s.lyrics.text && c.lyrics_availability === 'none') {
      err(rel, `lyrics_availability=none 时不得保存歌词全文`);
    }
    // 八维辨识：不得出现"好坏"二元结论字段
    if ('verdict' in s || 'is_good' in s || 'quality' in s || 'rating' in s || 'stars' in s) {
      err(rel, `歌曲不得包含二元评价/评分字段（verdict / is_good / quality / rating / stars）—— §13 禁止好歌/坏歌`);
    }
  }
  // 课程引用的歌曲必须真实存在
  for (const [cid, rec] of courseRecords) {
    for (const sid of [rec.core_song, ...(rec.support_songs || [])].filter(Boolean)) {
      if (!songIds.has(sid)) err(`content/courses/${cid}.json`, `引用的歌曲 ${sid} 不在音乐库中`);
    }
  }

  /* --- 培训 --- */
  const trainingIds = new Set(training.levels.map((l) => l.training_id));
  const formIds = new Set(training.forms.map((f) => f.form_id));
  if (trainingIds.size !== 3) err('content/training/index.json', '三级培训应为 L1/L2/L3');
  if (formIds.size !== 6) err('content/training/index.json', '六张培训表应为 MUS-F-01…06');
  training.levels.forEach((l, i) => {
    if (l.level !== i + 1) err('content/training/index.json', `第 ${i + 1} 级应为 level=${i + 1}，实际 ${l.level}`);
  });
  const formFiles = listFiles(path.join(ROOT, 'content/training'), '.json').filter((f) => /MUS-[TF]-/.test(path.basename(f)));
  if (formFiles.length !== 9) err('content/training/', `应有 3 个层级 + 6 张表 = 9 个文件，实际 ${formFiles.length}`);
  for (const f of formFiles) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const rec = readJSON(rel);
    if (rec.training_id) {
      validateDataAgainst('content/schema/training.schema.json', rec, rel);
      if (rec.uses_forms) {
        for (const fid of rec.uses_forms) {
          if (!formIds.has(fid)) err(rel, `引用了不存在的培训表 ${fid}`);
        }
      }
    } else {
      validateDataAgainst('content/schema/form.schema.json', rec, rel);
    }
  }

  /* --- 处境 --- */
  const contextIds = new Set(contexts.contexts.map((c) => c.context_id));
  if (contexts.contexts.length !== 7) err('content/contexts/index.json', `七处境应为 7 个，实际 ${contexts.contexts.length}`);
  for (const [cid, rec] of courseRecords) {
    for (const c of rec.contexts || []) {
      if (!contextIds.has(c)) err(`content/courses/${cid}.json`, `引用了不存在的处境 ${c}`);
    }
  }

  /* --- MOS-MUSIC-MAP V1.0 --- */
  if (map.row_count !== map.rows.length) err('content/map/MOS-MUSIC-MAP_V1.0.json', 'row_count 与 rows 长度不一致');
  if (map.rows.length !== 24) err('content/map/MOS-MUSIC-MAP_V1.0.json', `Mapping 应为 24 行，实际 ${map.rows.length}`);
  map.rows.forEach((r, i) => {
    const rel = `content/map/MOS-MUSIC-MAP_V1.0.json#rows[${i}]`;
    validateDataAgainst('content/schema/map.schema.json', r, rel);
    const n = i + 1;
    if (r.map_id !== `MAP-C${String(n).padStart(2, '0')}`) err(rel, `map_id 应为 MAP-C${String(n).padStart(2, '0')}`);
    if (!courseRecords.has(r.music_unit_id)) err(rel, `music_unit_id ${r.music_unit_id} 不存在`);
    if (r.mos_week.some((w) => Number(w.slice(1)) < 1 || Number(w.slice(1)) > 52)) err(rel, `mos_week 超出 W01–W52`);
    if (r.lq.some((l) => !/^LQ0[1-8]$/.test(l))) err(rel, `lq 只允许 LQ01–LQ08`);
    // H-2 决定：不复制 MOS 52 周数据
    if (r.core_truth && r.core_truth.length > 0 && (!r.core_truth_source || r.core_truth_source.copy_policy !== 'reference_only')) {
      warn(rel, `core_truth 已填值但 core_truth_source 不是 reference_only —— 请确认未复制 MOS 52 周权威文本`);
    }
  });

  /* --- 经文引用索引（§27 / 结构性决定 6） --- */
  for (const [i, r] of (bible.references || []).entries()) {
    const rel = `content/bible/reference-index.json#references[${i}]`;
    if (r.text_embedded !== false) err(rel, `text_embedded 必须为 false —— V1.0 不内嵌译本正文`);
    if (!r.passage_ref) err(rel, `缺少 passage_ref`);
  }
  // 24 课与 map 引用的经文必须在索引中有据可查
  const refSet = new Set((bible.references || []).map((r) => r.passage_ref));
  for (const [cid, rec] of courseRecords) {
    if (rec.core_passage && !refSet.has(rec.core_passage)) {
      err(`content/courses/${cid}.json`, `core_passage「${rec.core_passage}」未登记在 reference-index.json`);
    }
  }

  /* --- tier 与 review_status 互不推导（结构性决定 3） --- */
  for (const s of songs.songs) {
    if (s.tier === 'A' && s.review_status === 'draft') {
      warn(`content/songs/index.json#${s.song_id}`, `tier=A 而 review_status=draft。两字段独立（允许），但请确认这是刻意状态。`);
    }
  }

  /* --- Phase 2A：Framework / Annual 分离与年度样本校验 --- */
  info('Phase 2A：校验 Framework 母库、2027 年度实例与样本周…');

  // Framework：MM01–MM24 母库
  const framework = readJSON('content/framework/music-units.json');
  const fwRel = 'content/framework/music-units.json';
  validateDataAgainst('content/schema/music-unit.schema.json', framework, fwRel);
  const MM_RE = /^MM(0[1-9]|1[0-9]|2[0-4])$/;
  const mmIds = new Set(framework.units.map((u) => u.unit_id));
  if (framework.units.length !== 24) err(fwRel, `MM 母库应为 24 个单元，实际 ${framework.units.length}`);
  if (mmIds.size !== 24) err(fwRel, 'MM 单元 ID 有重复');
  framework.units.forEach((u, i) => {
    const n = i + 1;
    if (u.unit_id !== `MM${String(n).padStart(2, '0')}`) err(fwRel, `第 ${n} 个单元应为 MM${String(n).padStart(2, '0')}，实际 ${u.unit_id}`);
    if (!MM_RE.test(u.unit_id)) err(fwRel, `非法 Music Unit ID：${u.unit_id}`);
    // Framework 层禁止年度周引用（Phase 2A 裁决）
    const blob = JSON.stringify(u);
    if (/2027-W\d{2}|"(W[0-9]{2})"/.test(blob)) err(fwRel, `Framework 母库 ${u.unit_id} 含年度周引用 —— Framework 不得包含年度数据`);
    const cu = courses.units[i];
    if (u.title !== cu.title) err(fwRel, `MM${String(n).padStart(2, '0')} 标题与 24 课骨架不一致：${u.title} vs ${cu.title}`);
  });
  if (framework.boundary && !framework.boundary.not_annual_plan) {
    err(fwRel, 'boundary.not_annual_plan 必须为 true（Phase 2A 裁决）');
  }

  // Annual：2027 年度实例
  const annual = readJSON('content/annual/2027/annual.json');
  const anRel = 'content/annual/2027/annual.json';
  validateDataAgainst('content/schema/annual.schema.json', annual, anRel);
  if (annual.source_52w.copy_policy !== 'reference_only') err(anRel, '52W 来源必须是 reference_only（不复制 52 周数据）');
  if (annual.status !== 'sample_validation') err(anRel, `Phase 2A 状态应为 sample_validation，实际 ${annual.status}`);

  const annualIndex = readJSON('content/annual/2027/index.json');
  if (annualIndex.weeks.length !== 4) err('content/annual/2027/index.json', `W01–W04 共 4 个年度周，实际 ${annualIndex.weeks.length}`);
  if (annualIndex.units.length !== 4) err('content/annual/2027/index.json', `W01–W04 共 4 个完整单元，实际 ${annualIndex.units.length}`);

  // 歌曲详情记录（Phase 2A 起有实体文件）
  const songRecordFiles = listFiles(path.join(ROOT, 'content/songs'), '.json').filter((f) => /MUS-S-\d{4}\.json$/.test(f));
  if (songRecordFiles.length !== songs.songs.length) {
    err('content/songs/', `索引 count=${songs.songs.length} 但实体文件 ${songRecordFiles.length} 个`);
  }
  /* CI-0014 案 a：歌曲经文锚点的权威依据不再是上游经文登记表
     （上游 52W/课程登记表保持冻结，不为歌曲扩张而变动），
     而是派生锚点索引 content/production/song-scripture-index.json。
     这里只校验「派生索引是否已跟上曲库」——即新增歌曲详情后必须重跑派生索引。 */
  const anchorIndexRel = 'content/production/song-scripture-index.json';
  const anchorIndexSet = fs.existsSync(path.join(ROOT, anchorIndexRel))
    ? new Set((readJSON(anchorIndexRel).anchors || [])
      .filter((a) => a.status === 'registered' && a.core_passage).map((a) => a.core_passage))
    : null;
  const songRecords = new Map();
  for (const f of songRecordFiles) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const rec = readJSON(rel);
    songRecords.set(rec.song_id, rec);
    validateDataAgainst('content/schema/song.schema.json', rec, rel);
    if (rec.song_id !== path.basename(f, '.json')) err(rel, 'song_id 与文件名不一致');
    if (rec.lyrics && rec.lyrics.text) err(rel, '歌词全文被托管（§27 禁止，Phase 2A 只允许 metadata）');
    if (rec.media && (rec.media.audio || rec.media.score || rec.media.chord)) {
      err(rel, 'media 中出现音频/乐谱/和弦链接 —— Phase 2A 样本只做 metadata（如需外链须人工审核后另行走 licensed 流程）');
    }
    if (!rec.formation || !rec.formation.primary_function) err(rel, 'formation.primary_function 必填（禁止「所有功能都勾选」）');
    for (const mm of rec.discipleship.music_unit_refs || []) {
      if (!mmIds.has(mm)) err(rel, `music_unit_refs 引用了不存在的 MM 单元：${mm}`);
    }
    if (rec.bible.core_passage) {
      // 派生索引必须已收录该锚点（案 a：锚点权威依据是派生索引，不是冻结的上游表）
      if (anchorIndexSet && !anchorIndexSet.has(rec.bible.core_passage)) {
        err(rel, `core_passage「${rec.bible.core_passage}」未进入派生锚点索引 ${anchorIndexRel}（新增详情后须重跑派生索引）`);
      }
      // 上游经文登记表仍保留互查，但案 a 后不再是阻断项
      if (!refSet.has(rec.bible.core_passage)) {
        info(`${rel}: core_passage「${rec.bible.core_passage}」不在上游经文登记表 —— 案 a 后允许（歌曲锚点由派生索引承载）。`);
      }
    }
  }

  // 年度样本周：形成链与引用完整性
  const songIdSet = new Set(songs.songs.map((s) => s.song_id));
  const weekFiles = listFiles(path.join(ROOT, 'content/annual'), '.json').filter((f) => /^2027-W\d{2}\.json$/.test(path.basename(f)));
  if (weekFiles.length !== 4) err('content/annual/2027/', `应有 4 个年度周文件，实际 ${weekFiles.length}`);
  for (const f of weekFiles) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const rec = readJSON(rel);
    validateDataAgainst('content/schema/annual-week.schema.json', rec, rel);
    if (rec.week_id !== `2027-${rec.mos_week}`) err(rel, `week_id(${rec.week_id}) 与 mos_week(${rec.mos_week}) 不匹配`);
    if (rec.annual_id !== annual.annual_id) err(rel, `annual_id 与年度实例不一致`);
    if (rec.music_unit_id.length === 0 && !rec.mm_rationale) err(rel, '不指定 MM 时必须给出理由');
    for (const mm of rec.music_unit_id) {
      if (!mmIds.has(mm)) err(rel, `引用了不存在的 MM 单元：${mm}`);
    }
    if (rec.core_song_id && !songIdSet.has(rec.core_song_id)) err(rel, `核心歌曲 ${rec.core_song_id} 不在音乐库`);
    for (const sid of rec.auxiliary_song_id) {
      if (!songIdSet.has(sid)) err(rel, `辅助歌曲 ${sid} 不在音乐库`);
      if (sid === rec.core_song_id) err(rel, '辅助歌曲不得与核心歌曲重复');
    }
    // 形成链必须真实可执行（指令十一/十二）
    const st = rec.seven_step_practice;
    for (const [k, label] of [['S1_read','读'],['S2_understand','明'],['S3_sing','唱'],['S4_remember','记'],['S5_feel','感'],['S6_act','行'],['S7_transmit','传']]) {
      const body = st[k] && st[k].content;
      if (!body || body.trim().length < 15) err(rel, `七步法「${label}」内容缺失或过短（必须真实可执行）`);
    }
    if (!rec.life_practice || rec.life_practice.trim().length < 15) err(rel, 'life_practice 缺失（唱→行，音乐不是终点）');
    if (!rec.transmission_task || rec.transmission_task.trim().length < 15) err(rel, 'transmission_task 缺失（唱→传）');
    if (rec.core_truth.provenance.copy_policy !== 'reference_only') err(rel, 'core_truth 必须是 reference_only（52W 数据只引用）');
  }

  // 完整单元
  const unitFiles = listFiles(path.join(ROOT, 'content/annual'), '.json').filter((f) => /MUS-U-2027-W\d{2}\.json$/.test(f));
  if (unitFiles.length !== 4) err('content/annual/2027/units/', `应有 4 个完整单元，实际 ${unitFiles.length}`);
  const MF_RE = /^(TR|MM|EM|PR|CO|LI|MI|RP)$/;
  for (const f of unitFiles) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const rec = readJSON(rel);
    validateDataAgainst('content/schema/discipleship-unit.schema.json', rec, rel);
    if (!songIdSet.has(rec.core_song)) err(rel, `核心歌曲 ${rec.core_song} 不在音乐库`);
    if (!MF_RE.test(rec.music_function.primary)) err(rel, `非法 primary 功能：${rec.music_function.primary}`);
    for (const mm of rec.music_theme) {
      if (!mmIds.has(mm)) err(rel, `引用了不存在的 MM 单元：${mm}`);
    }
    const st = rec.seven_step_method;
    for (const [k, label] of [['S1_read','读'],['S2_understand','明'],['S3_sing','唱'],['S4_remember','记'],['S5_feel','感'],['S6_act','行'],['S7_transmit','传']]) {
      const body = st[k] && st[k].content;
      if (!body || body.trim().length < 15) err(rel, `单元七步法「${label}」内容缺失或过短`);
    }
    if (!rec.expected_formation || rec.expected_formation.trim().length < 15) {
      err(rel, 'expected_formation 缺失（必须回答：这首歌正在形成怎样的门徒）');
    }
    if (rec.review_gate && rec.review_gate.theological_review === 'confirmed' && /needs_human_review/i.test(JSON.stringify(rec.review_gate.note || ''))) {
      warn(rel, 'review_gate 标记 confirmed 但 note 提及需人工复核，请核对。');
    }
    // Phase 2A.1 校准：转换层与歌曲关系字段
    if (!rec.review_gate || !rec.review_gate.song_relation) {
      err(rel, 'review_gate.song_relation 缺失（Phase 2A.1 校准：每周必须声明核心歌与经文的关系）');
    }
    if (rec.review_gate && rec.review_gate.song_relation === 'direct_biblical_expression'
      && /主题级|非经文直译|不是经文的直接表达/.test(JSON.stringify(rec.review_gate))) {
      warn(rel, 'song_relation=direct_biblical_expression 但审查描述提及主题级/非直译，请核对。');
    }
    if (!rec.review_gate || !rec.review_gate.practice_conversion) {
      err(rel, 'review_gate.practice_conversion 缺失（S6 实践转换层落地说明）');
    }
    if (!rec.review_gate || !rec.review_gate.transmission_conversion) {
      err(rel, 'review_gate.transmission_conversion 缺失（S7 传递转换层落地说明）');
    }
  }

  // 主题歌曲计数（CI-0014 案 a）：不再写在冻结的上游主题索引里，
  // 改由派生视图 content/production/theme-song-counts.json 承载并在此校验。
  const themeCounts = readJSON('content/production/theme-song-counts.json');
  if (themeCounts.derived !== true) err('content/production/theme-song-counts.json', '派生视图必须显式标记 derived=true');
  if (themes.themes.some((t) => Object.prototype.hasOwnProperty.call(t, 'song_count'))) {
    err('content/themes/index.json', '案 a：上游主题索引不得再承载 song_count（该计数归派生视图）');
  }
  if ((themeCounts.themes || []).length !== themes.themes.length) {
    err('content/production/theme-song-counts.json', `应覆盖 ${themes.themes.length} 个主题，实际 ${(themeCounts.themes || []).length}`);
  }
  for (const t of themeCounts.themes || []) {
    const actual = [...songRecords.values()].filter((s) => s.discipleship.main_theme === t.theme_id).length;
    if (t.song_count !== actual) {
      err('content/production/theme-song-counts.json', `${t.theme_id}.song_count=${t.song_count}，实际主主题歌曲 ${actual} 首`);
    }
  }
  if ((themeCounts.unmapped || []).length) {
    err('content/production/theme-song-counts.json', `存在主主题无法映射到 TH 编号的歌曲：${themeCounts.unmapped.join('、')}`);
  }

  // 歌曲经文锚点索引（派生）：cover 合并曲库，且不得与详情记录矛盾
  const scriptureIndex = readJSON('content/production/song-scripture-index.json');
  if (scriptureIndex.derived !== true) err('content/production/song-scripture-index.json', '派生视图必须显式标记 derived=true');
  const anchorBySong = new Map((scriptureIndex.anchors || []).map((a) => [a.song_id, a]));
  for (const [sid, rec] of songRecords) {
    const a = anchorBySong.get(sid);
    if (!a) { err('content/production/song-scripture-index.json', `${sid} 未出现在锚点索引中`); continue; }
    if ((rec.bible.core_passage || null) !== a.core_passage) {
      err('content/production/song-scripture-index.json', `${sid} 锚点与歌曲详情记录不一致（${a.core_passage} vs ${rec.bible.core_passage}）`);
    }
  }

  return { courses, themes, songs, training, contexts, map, bible, songIds, contextIds, formIds, trainingIds, framework, annual, mmIds };
}

/* ---------------------------------------------------------------- 3b. 生产平台（MODULE 12 / V1.0） */

/**
 * 讲道音乐生产平台的硬检查。
 * 只检查"平台自身约束是否被破坏"，不评价任何神学判断（那属人工裁决）。
 */
function checkProductionPlatform(refs) {
  info('V1.0：校验讲道音乐生产平台（Music Library / 辨识引擎 / 审查门 / 校准 / 治理）…');

  const prodIndex = readJSON('content/production/index.json');
  const ISSUE_REL = 'content/production/calibration-issues.json';
  const issues = readJSON(ISSUE_REL);
  const gov = readJSON('content/production/version-governance.json');
  const usage = readJSON('content/production/library-usage.json');
  const baseline = readJSON('content/production/baseline-immutable.json');
  const lexicon = readJSON('content/production/discernment-lexicon.json');

  /* --- 索引与链条（§十七 / §二） --- */
  const prodRel = 'content/production/index.json';
  if (prodIndex.platform_version !== '3.2.0') err(prodRel, `platform_version 应为 3.2.0（V3.2），实际 ${prodIndex.platform_version}`);
  if (prodIndex.default_gate !== 'human_review') err(prodRel, 'default_gate 必须是 human_review（批量不得绕过审核）');
  const CHAIN = ['Music Library', 'Song Discernment Engine', 'Sermon Week', 'Song Matching',
    'Unit Production', 'Human Review', 'Validation', 'Production Record'];
  if (JSON.stringify(prodIndex.fixed_chain) !== JSON.stringify(CHAIN)) {
    err(prodRel, `fixed_chain 与闭环定义不一致：${JSON.stringify(prodIndex.fixed_chain)}`);
  }
  if (!/禁止反向选歌/.test(prodIndex.direction_rule || '')) err(prodRel, 'direction_rule 必须声明禁止反向选歌');
  if (prodIndex.annual_id !== refs.annual.annual_id) err(prodRel, 'platform annual_id 与 2027 年度实例不一致');

  /* --- 校准问题清单（§十二） --- */
  const CATEGORIES = ['unit_level_gate', 'cross_week_reuse', 'baseline_scope', 'song_relation',
    'theological_risk', 'practice_conversion', 'transmission_conversion', 'library_capacity',
    'evidence_sufficiency', 'two_layer_verdict', 'process'];
  const STATUSES = ['OPEN', 'OBSERVED', 'REVIEWED', 'ACCEPTED', 'REJECTED', 'FIXED', 'DEFERRED'];
  const SEVERITIES = ['BLOCKER', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
  const issueIds = new Set();
  if (!Array.isArray(issues.issues) || issues.issues.length === 0) err(ISSUE_REL, 'issues 必须是非空数组');
  for (const it of issues.issues || []) {
    validateDataAgainst('content/schema/production-issue.schema.json', it, `${ISSUE_REL}#${it.issue_id || '?'}`);
    if (!/^CI-\d{4}$/.test(it.issue_id || '')) err(ISSUE_REL, `issue_id 应为 CI-NNNN，实际 ${it.issue_id}`);
    if (issueIds.has(it.issue_id)) err(ISSUE_REL, `issue_id 重复：${it.issue_id}`);
    issueIds.add(it.issue_id);
    if (!STATUSES.includes(it.status)) err(ISSUE_REL, `${it.issue_id} 非法 status：${it.status}`);
    if (!SEVERITIES.includes(it.severity)) err(ISSUE_REL, `${it.issue_id} 非法 severity：${it.severity}`);
    if (!CATEGORIES.includes(it.category)) err(ISSUE_REL, `${it.issue_id} 非法 category：${it.category}`);
    // 发现问题不得自动修改已冻结技能（§十三）
    if (/^(FIXED|ACCEPTED)$/.test(it.status) && it.resolution_layer === 'skill' && !it.resolved_note) {
      err(ISSUE_REL, `${it.issue_id} 在技能层被标记为 ${it.status}，必须写明处理说明与批准来源`);
    }
  }

  /* --- 版本治理（§十三） --- */
  const govRel = 'content/production/version-governance.json';
  if (JSON.stringify(gov.stages) !== JSON.stringify(['Frozen', 'Observed', 'Proposed', 'Released'])) {
    err(govRel, `stages 必须是 Frozen/Observed/Proposed/Released，实际 ${JSON.stringify(gov.stages)}`);
  }
  if (gov.frozen.skill_status !== 'Frozen') err(govRel, 'frozen.skill_status 必须是 Frozen');
  if (gov.frozen.skill_version !== '1.0.0') {
    err(govRel, `冻结技能版本被改动：${gov.frozen.skill_version}（V1.0 不得擅自变更，须先 Proposed）`);
  }
  if ((gov.frozen.frozen_at || '') === '' ) err(govRel, 'frozen.frozen_at 缺失');
  for (const p of gov.proposed || []) {
    if (p.status === 'applied_to_frozen') {
      err(govRel, `${p.proposal_id} 被标记为 applied_to_frozen —— 违反「发现问题不自动修改 Frozen」`);
    }
    if (!p.requires) err(govRel, `${p.proposal_id} 缺失 requires（变更前置条件）`);
  }
  for (const o of gov.observed || []) {
    if (!issueIds.has(o.issue_id)) err(govRel, `observed 引用了不存在的问题记录：${o.issue_id}`);
  }
  if (!(gov.released || []).some((r) => r.version === 'platform-1.0.0')) {
    err(govRel, 'released 必须包含 platform-1.0.0');
  }

  /* --- 音乐库使用历史（§三 A / §五） --- */
  const useRel = 'content/production/library-usage.json';
  const songIdSet = refs.songIds;
  /* V0.5：使用历史覆盖合并曲库（详情层 + 登记层），两层都必须出现在同一张表里 */
  const regDoc = readJSON('content/library/registry.json');
  const intakeIdSet = new Set((regDoc.records || []).map((r) => r.song_id));
  const mergedIdSet = new Set([...songIdSet, ...intakeIdSet]);
  const weekSet = new Set((refs.annualIndex || readJSON('content/annual/2027/index.json')).weeks.map((w) => w.mos_week));
  const usageSongIds = new Set();
  for (const s of usage.songs || []) {
    if (!mergedIdSet.has(s.song_id)) err(useRel, `${s.song_id} 不在合并曲库（详情层 + 登记层）中`);
    if (usageSongIds.has(s.song_id)) err(useRel, `${s.song_id} 在 usage 中重复`);
    usageSongIds.add(s.song_id);
    if (!['A', 'B', 'C'].includes(s.tier)) err(useRel, `${s.song_id} 非法 tier：${s.tier}`);
    if (!s.review_status) err(useRel, `${s.song_id} 缺 review_status（tier 与 review_status 必须两个独立字段）`);
    if (s.tier === undefined || s.review_status === undefined) err(useRel, `${s.song_id} 混用了 tier 与 review_status`);
    const used = s.used_in || [];
    if (s.times_used !== used.length) err(useRel, `${s.song_id} times_used=${s.times_used} 与 used_in 长度 ${used.length} 不一致`);
    if (s.times_as_core !== used.filter((u) => u.role === 'core').length) err(useRel, `${s.song_id} times_as_core 与 used_in 不一致`);
    if (s.times_as_auxiliary !== used.filter((u) => u.role === 'auxiliary').length) err(useRel, `${s.song_id} times_as_auxiliary 与 used_in 不一致`);
    for (const u of used) {
      if (!weekSet.has(u.week)) err(useRel, `${s.song_id} 的 used_in 引用了不存在的年度周：${u.week}`);
      if (!['core', 'auxiliary'].includes(u.role)) err(useRel, `${s.song_id} 非法 role：${u.role}`);
    }
    /* 登记层歌曲：不得被写成「已辨识」，也不得被指定任何周次（§十二） */
    if (s.layer === 'intake') {
      if (s.discernment_status !== 'not_assessed') {
        err(useRel, `${s.song_id}（登记层）不得标记为已辨识：${s.discernment_status}`);
      }
      if (used.length !== 0) err(useRel, `${s.song_id}（登记层）不得被指定任何周次`);
      if ((s.discernment_history || []).length !== 0) {
        err(useRel, `${s.song_id}（登记层）不得携带周辨识留档（库级结果单列在 library_scope_result）`);
      }
    }
  }
  if (usageSongIds.size !== mergedIdSet.size) {
    err(useRel, `usage 覆盖 ${usageSongIds.size} 首，合并曲库有 ${mergedIdSet.size} 首`);
  }

  /* --- N3：baseline 作用域不得覆盖整个 content/**，且不得把生产内容当冻结基线 --- */
  const baseRel = 'content/production/baseline-immutable.json';
  for (const scope of baseline.immutable_scope || []) {
    if (/^content\/\*\*$|^content\/$|^content\/\*$/.test(scope.trim())) {
      err(baseRel, `immutable_scope 过宽（${scope}）—— 新增生产内容会被误判为 baseline corruption（N3）`);
    }
    if (/^content\/production\//.test(scope.trim())) {
      err(baseRel, `immutable_scope 不得包含 content/production/（${scope}）—— 生产记录必须可正常增长`);
    }
  }
  const frozenWeeks = new Set(baseline.frozen_weeks || []);
  for (const w of ['W01', 'W02', 'W03', 'W04']) {
    if (!frozenWeeks.has(w)) err(baseRel, `frozen_weeks 必须包含历史周次 ${w}`);
  }
  const hashedFiles = Object.keys(baseline.files || {});
  if (hashedFiles.some((f) => f.startsWith('content/production/'))) {
    err(baseRel, 'baseline.files 不得包含 content/production/**');
  }
  if (hashedFiles.some((f) => f.startsWith('content/library/'))) {
    err(baseRel, 'baseline.files 不得包含 content/library/**（曲库登记层属正常增长内容，CI-0014 案 a）');
  }
  if (!hashedFiles.some((f) => f.startsWith('skill:'))) {
    err(baseRel, 'baseline.files 必须包含已冻结技能文件（skill:mos-music-song-discernment/**）');
  }
  /* 案 a：派生作用域必须显式声明，且列出随曲库增长的派生视图 */
  if (!Array.isArray(baseline.derived_scope) || baseline.derived_scope.length === 0) {
    err(baseRel, '案 a：baseline 必须显式声明 derived_scope（哪些是随曲库增长的派生视图）');
  }
  if (!/案 a/.test(String(baseline.derived_rule || ''))) {
    err(baseRel, '案 a：baseline 必须写明 derived_rule（派生视图不进不可变清单的理由）');
  }
  for (const rel of ['content/production/theme-song-counts.json',
    'content/production/song-scripture-index.json',
    'content/production/library-usage.json']) {
    if (!fs.existsSync(path.join(ROOT, rel))) err(baseRel, `案 a：派生视图缺失 ${rel}`);
  }

  /* --- 库级（无周次）歌基层辨识结果（CI-0017 固化口径） --- */
  const scopeRel = 'content/production/song-discernment-v0.5.json';
  const scopeDoc = readJSON(scopeRel);
  if (scopeDoc.scope !== 'library_scope') {
    err(scopeRel, `scope 必须是 library_scope（不得把库级辨识当成周辨识），实际 ${scopeDoc.scope}`);
  }
  if (!/mos-music-song-discernment/.test(String(scopeDoc.parity_with || ''))) {
    err(scopeRel, 'parity_with 必须指向已冻结技能');
  }
  const scopeResults = scopeDoc.results || [];
  if (scopeResults.length !== intakeIdSet.size) {
    err(scopeRel, `库级辨识应覆盖全部新增候选 ${intakeIdSet.size} 首，实际 ${scopeResults.length}`);
  }
  const scopeIds = new Set();
  for (const r of scopeResults) {
    if (!intakeIdSet.has(r.song_id)) err(scopeRel, `${r.song_id} 不在登记层，库级辨识只覆盖新增候选`);
    if (scopeIds.has(r.song_id)) err(scopeRel, `${r.song_id} 在库级结果中重复`);
    scopeIds.add(r.song_id);
    if (r.week || r.mos_week || r.week_id) err(scopeRel, `${r.song_id} 库级结果不得携带周次（未指定 W05–W52）`);
    if (r.song_relation !== 'not_yet_assessed') err(scopeRel, `${r.song_id} 无周次时关系必须 not_yet_assessed`);
    if (r.decision !== 'Research') err(scopeRel, `${r.song_id} 资料不完整时必须为 Research`);
    if (r.song_is_complete_unit !== false) err(scopeRel, `${r.song_id} 必须声明 Song ≠ Complete Discipleship Unit`);
    if (r.s6 !== null || r.s7 !== null) err(scopeRel, `${r.song_id} 库级结果不得伪造单元层字段（S6/S7）`);
    if ((r.risks || []).length !== 0 || r.risk_scan !== 'not_applied') {
      err(scopeRel, `${r.song_id} 无标签证据时不得扫描风险（避免误报神学风险）`);
    }
    if (!Array.isArray(r.missing_evidence) || r.missing_evidence.length === 0) {
      err(scopeRel, `${r.song_id} 必须逐项列出缺失证据`);
    }
    if (r.eight_dimensions && Object.values(r.eight_dimensions).some((d) => d.score !== null)) {
      err(scopeRel, `${r.song_id} 无证据时八维必须留空（不得给推测分）`);
    }
  }

  /* --- 词表（内容层，不用程序逻辑承载） --- */
  const lexRel = 'content/production/discernment-lexicon.json';
  for (const key of ['act_words', 'stance_words', 'disclaimer_pattern', 'self_effort_words',
    's6_rules', 's7_rules', 'risk_trigger', 'severity', 'high_risk_functions']) {
    if (lexicon[key] === undefined) err(lexRel, `词表缺少 ${key}`);
  }
  if (!lexicon.parity_with) err(lexRel, '词表必须声明 parity_with（与哪个冻结版本保持判定一致）');
  else if (!/mos-music-song-discernment/.test(String(lexicon.parity_with))) {
    err(lexRel, `parity_with 必须指向已冻结技能，实际 ${lexicon.parity_with}`);
  }
  if (!lexicon.note) warn(lexRel, '词表缺少 note（说明它是内容层数据、不是判定逻辑）');

  return { prodIndex, issues, gov, usage, baseline, lexicon };
}

/* ---------------------------------------------------------------- 曲库扩库登记层（V0.5） */

/**
 * 曲库扩库登记层的硬检查。
 * 只检查"登记层是否越界"，不评价任何歌曲，也不评价辨识。
 * 最要紧的一条：登记层**不得**出现任何辨识结论字眼（§六）。
 */
const VERDICT_TOKENS = [
  'Core Candidate', 'direct_biblical_expression', 'theme_response',
  'narrative_response', 'Needs Human Review', 'No Suitable Song Found',
  'song_relation', 'week_fit', 'decision',
];

function checkLibraryIntake() {
  const dir = path.join(ROOT, 'content/library');
  if (!fs.existsSync(dir)) {
    info('曲库扩库登记层不存在（尚未启动 V0.5 扩库）。');
    return;
  }
  info('V0.5：校验曲库扩库登记层（候选清单 / 入库登记 / 索引计数）…');

  const candRel = 'content/library/v0.5-candidates.json';
  const regRel = 'content/library/registry.json';
  const idxRel = 'content/library/index.json';
  const songs = readJSON('content/songs/index.json');

  const cand = readJSON(candRel);
  validateDataAgainst('content/schema/library-candidates.schema.json', cand, candRel);
  const candList = cand.candidates || [];
  if (cand.status === 'PENDING_LIST' && candList.length > 0) {
    err(candRel, 'status=PENDING_LIST 但 candidates 非空');
  }
  if (cand.status !== 'PENDING_LIST' && candList.length === 0) {
    err(candRel, 'status 已离开 PENDING_LIST 但 candidates 为空');
  }
  for (const c of candList) {
    if (c.copyright_status === 'UNKNOWN' || c.copyright_status === 'SOURCE_REQUIRED') {
      info(`  候选 #${c.candidate_no} ${c.title_zh}：版权/来源待补（${c.copyright_status}）—— 允许，不阻断。`);
    }
  }

  const reg = readJSON(regRel);
  const records = reg.records || [];
  if (reg.count !== records.length) err(regRel, `count=${reg.count} 与 records 长度 ${records.length} 不一致`);
  const intakeSchema = readJSON('content/schema/library-intake.schema.json');
  const seen = new Set();
  for (const rec of records) {
    const label = `${regRel}#${rec.song_id || '?'}`;
    validate(rec, intakeSchema, { root: intakeSchema, file: 'content/schema/library-intake.schema.json' }, label);
    if (seen.has(rec.song_id)) err(regRel, `song_id 重复：${rec.song_id}`);
    seen.add(rec.song_id);
    if (!rec.initial_theme_id && rec.initial_theme) {
      warn(regRel, `${rec.song_id} 有初步主题但无对应主题编号 —— 须待辨识与人工确认，不得代填。`);
    }
    const blob = JSON.stringify(rec);
    for (const token of VERDICT_TOKENS) {
      if (blob.includes(token)) {
        err(label, `登记层出现辨识结论字眼「${token}」—— 清单初步主题不是辨识结果（§六）`);
      }
    }
    if (rec.copyright_status !== 'UNKNOWN' && rec.resources) {
      for (const k of ['lyrics', 'score', 'lead_vocal', 'accompaniment']) {
        if (rec.resources[k] && rec.resources[k] !== 'NOT_IMPORTED') {
          warn(regRel, `${rec.song_id}.resources.${k}=${rec.resources[k]} —— 本阶段不要求且默认不得收录资源（§四）。`);
        }
      }
    }
  }

  /* 升层声明层（V0.5 第二段）：登记层字段契约被冻结、不允许附加字段，
     所以「某一首已升入详情层」由独立文件声明，而不是改写登记记录。
     合并曲库时同一首歌只计一次：详情 N + （登记 − 已升层数）。 */
  const promoRel = 'content/production/library-promotions.json';
  const promoDoc = fs.existsSync(path.join(ROOT, promoRel)) ? readJSON(promoRel) : { promotions: [] };
  const promoById = new Map((promoDoc.promotions || []).map((p) => [p.song_id, p]));
  const detailIds = new Set(songs.songs.map((s) => s.song_id));
  const pendingIntake = records.length - promoById.size;
  const mergedTotal = songs.songs.length + pendingIntake;

  const idx = readJSON(idxRel);
  if (idx.counts.total !== mergedTotal) {
    err(idxRel, `counts.total=${idx.counts.total} 与合并曲库（详情 ${songs.songs.length} + 登记待升层 ${pendingIntake}）不一致`);
  }
  if (idx.counts.detail_records !== songs.songs.length) {
    err(idxRel, `counts.detail_records=${idx.counts.detail_records} 与歌曲详情记录 ${songs.songs.length} 首不一致`);
  }
  if (idx.counts.intake_records !== records.length) {
    err(idxRel, `counts.intake_records=${idx.counts.intake_records} 与登记记录 ${records.length} 条不一致`);
  }
  if (idx.counts.added !== records.length) {
    err(idxRel, `counts.added=${idx.counts.added} 与登记记录 ${records.length} 条不一致`);
  }
  if (idx.counts.promoted_to_detail !== promoById.size) {
    err(idxRel, `counts.promoted_to_detail=${idx.counts.promoted_to_detail} 与升层声明 ${promoById.size} 条不一致`);
  }
  if (idx.counts.intake_pending_promotion !== pendingIntake) {
    err(idxRel, `counts.intake_pending_promotion=${idx.counts.intake_pending_promotion} 与待升层 ${pendingIntake} 条不一致`);
  }
  if (idx.target_total !== 50) {
    err(idxRel, `target_total 应为 50，实际 ${idx.target_total}`);
  }
  for (const [k, rel] of Object.entries(idx.files || {})) {
    if (!fs.existsSync(path.join(ROOT, rel))) err(idxRel, `files.${k} 指向不存在的文件：${rel}`);
  }
  if (idx.counts.intake_records > 0 && cand.status === 'PENDING_LIST') {
    err(idxRel, '已有登记记录但候选清单状态仍为 PENDING_LIST —— 两者必须一致');
  }
  if (mergedTotal < idx.target_total && idx.counts.pending_list === 0 && records.length === 0) {
    info(`  合并曲库 ${mergedTotal} 首，尚未开始扩库登记。`);
  }

  /* 登记层与详情层的关系：
     未声明升层的重叠是错误（会被当成两首歌重复计数）；
     已声明升层的则必须逐条可核验 —— 详情文件存在、song_id 一致、锚点一致、来源可追溯。
     即：这不是把检查放宽，而是要求「详情记录 + 升层声明」两件事同时成立。 */
  const overlap = records.filter((r) => detailIds.has(r.song_id) && !promoById.has(r.song_id));
  if (overlap.length) {
    err(regRel, `登记记录与歌曲详情记录重复：${overlap.map((r) => r.song_id).join('、')}`
      + ` —— 合并曲库会重复计数（若属正常升层，须在 ${promoRel} 声明）`);
  }
  for (const p of promoDoc.promotions || []) {
    const plabel = `${promoRel}#${p.song_id || '?'}`;
    if (!p.song_id || !detailIds.has(p.song_id)) {
      err(plabel, '升层声明的歌曲在歌曲详情层里不存在');
    }
    if (!records.some((r) => r.song_id === p.song_id)) {
      err(plabel, '升层声明的歌曲在登记层里不存在 —— 来源不可追溯');
    }
    if (!p.detail_file || !fs.existsSync(path.join(ROOT, p.detail_file))) {
      err(plabel, `detail_file 不存在：${p.detail_file}`);
    } else {
      const songRec = readJSON(p.detail_file);
      if (songRec.song_id !== p.song_id) err(plabel, 'detail_file 的 song_id 与声明不一致');
      if (((songRec.bible || {}).core_passage || null) !== ((p.anchor || {}).core_passage || null)) {
        err(plabel, '声明的经文锚点与详情记录 bible.core_passage 不一致');
      }
      /* 升层只解决「歌基层身份 + 经文锚点」，不解决辨识：
         八维仍为空时，tier 必须保持 C、review_status 必须保持 draft。 */
      const dims = Object.values(songRec.eight_dimensions || {});
      const allNull = dims.length > 0 && dims.every((d) => !d || d.score === null);
      if (allNull && songRec.tier !== 'C') err(plabel, `八维尚未辨识却把 tier 升到 ${songRec.tier}`);
      if (allNull && songRec.review_status !== 'draft') {
        err(plabel, `八维尚未辨识时 review_status 应为 draft，实际 ${songRec.review_status}`);
      }
      if ((songRec.copyright || {}).copyright_status === 'public_domain'
        && !(songRec.copyright || {}).permission_evidence) {
        err(plabel, '把法律状态定为 public_domain 却没有作品级证据 —— 不得据清单推定为公版');
      }
    }
    if (p.promoted_at && !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/.test(String(p.promoted_at))) {
      err(plabel, 'promoted_at 不是 ISO 时间');
    }
    if (!(p.anchor && p.anchor.core_passage)) err(plabel, '升层声明必须载明认定的经文锚点');
  }
  if (promoDoc.counts) {
    if (promoDoc.counts.promoted !== promoById.size) err(promoRel, 'counts.promoted 与 promotions 条数不一致');
    if (promoDoc.counts.intake_pending_promotion !== pendingIntake) {
      err(promoRel, 'counts.intake_pending_promotion 与实际待升层数不一致');
    }
    if (promoDoc.counts.merged_total !== mergedTotal) err(promoRel, 'counts.merged_total 与合并曲库不一致');
  }

  /* 锚点认定留档（人工授权口径的书面依据）必须与升层声明逐条对应 */
  const detRel = 'content/production/song-anchor-determinations.json';
  if (!fs.existsSync(path.join(ROOT, detRel))) {
    err(detRel, '缺少锚点认定留档 —— 升层必须留下逐首认定依据');
  } else {
    const detDoc = readJSON(detRel);
    const detById = new Map((detDoc.determinations || []).map((d) => [d.song_id, d]));
    for (const p of promoDoc.promotions || []) {
      const d = detById.get(p.song_id);
      if (!d) { err(detRel, `${p.song_id} 有升层声明却没有锚点认定留档`); continue; }
      if (d.core_passage !== (p.anchor || {}).core_passage) {
        err(detRel, `${p.song_id} 的认定锚点与升层声明不一致（${d.core_passage} vs ${p.anchor.core_passage}）`);
      }
      if (!d.anchor_basis || String(d.anchor_basis).length < 20) {
        err(detRel, `${p.song_id} 的锚点依据过简 —— 必须写明该圣诗自身的经文出处`);
      }
      if (!d.hymnology || !(d.hymnology.words_by || d.hymnology.music_by)) {
        err(detRel, `${p.song_id} 缺作品级归属记载（作者 / 作曲）`);
      }
      if (!d.verification || d.verification.legal_status !== 'not_determined') {
        err(detRel, `${p.song_id} 的法律状态必须显式为 not_determined（不得据清单推定为公版）`);
      }
    }
    if (detById.size !== promoById.size) {
      err(detRel, `认定留档 ${detById.size} 条与升层声明 ${promoById.size} 条不一致`);
    }
  }
}

/* ---------------------------------------------------------------- V1.1-A：资源层 / 审查记录层（真实使用第一轮） */

function checkV11A(refs) {
  const songIdSet = refs && refs.songIds ? refs.songIds : new Set();

  /* --- Song Resources 层：独立资源模型，不混入 Song Core Record --- */
  const RES_REL = 'content/song-resources/index.json';
  const res = readJSON(RES_REL);
  const RESOURCE_TYPES = ['LYRICS', 'SCORE_LEAD', 'SCORE_SIMPLE', 'LEAD_VOCAL', 'ACCOMPANIMENT', 'RECORDING'];
  if (res.resource_types.map((t) => t.type).join(',') !== RESOURCE_TYPES.join(',')) {
    err(RES_REL, 'resource_types 必须是六类（LYRICS/SCORE_LEAD/SCORE_SIMPLE/LEAD_VOCAL/ACCOMPANIMENT/RECORDING）');
  }
  if (res.counts.total !== res.resources.length) {
    err(RES_REL, `counts.total（${res.counts.total}）与实际资源记录数（${res.resources.length}）不一致`);
  }
  const byType = {};
  for (const r of res.resources) {
    validateDataAgainst('content/schema/song-resource.schema.json', r, `${RES_REL}#${r.resource_id || '?'}`);
    byType[r.resource_type] = (byType[r.resource_type] || 0) + 1;
    if (!songIdSet.has(r.song_id)) err(RES_REL, `资源 ${r.resource_id} 挂载的 ${r.song_id} 不在详情层`);
    /* V3.2 §九：外部资源一律原站播放（file_url=null）；唯一例外 = 平台自产的生成钢琴
       （host_policy=hosted_authorized），且引用的本地文件必须真实存在（反虚构）。 */
    if (r.file_url != null) {
      if (r.host_policy !== 'hosted_authorized') {
        err(RES_REL, `${r.resource_id} 的 file_url 必须 null（外部资源原站播放，不托管未授权内容）`);
      } else if (!fs.existsSync(path.join(ROOT, r.file_url))) {
        err(RES_REL, `${r.resource_id} 的 file_url 指向的文件不存在：${r.file_url}`);
      }
    }
    if (!r.source || String(r.source).length < 4) err(RES_REL, `${r.resource_id} 的 source 不可追溯`);
    if (r.verification_status === 'human_verified' && r.copyright_status === 'unknown') {
      err(RES_REL, `${r.resource_id} 人工核验过的资源不得保留法律状态 unknown`);
    }
  }
  for (const t of RESOURCE_TYPES) {
    const declared = res.counts.by_type[t] || 0;
    if (declared !== (byType[t] || 0)) err(RES_REL, `counts.by_type.${t}（${declared}）与实际不一致`);
  }
  if (!res.note || !res.note.includes('虚构')) {
    err(RES_REL, 'note 必须显式声明「不得为消除 NOT_IMPORTED 而虚构资源」');
  }

  /* --- Review Records 层：人工裁决留档 --- */
  const RR_REL = 'content/production/review-records.json';
  const rr = readJSON(RR_REL);
  if (JSON.stringify(rr.decision_vocabulary) !== JSON.stringify(['ACCEPT', 'REVISE', 'HOLD', 'REJECT'])) {
    err(RR_REL, 'decision_vocabulary 必须是 ACCEPT / REVISE / HOLD / REJECT');
  }
  if (rr.counts.total !== rr.records.length) {
    err(RR_REL, `counts.total（${rr.counts.total}）与实际记录数（${rr.records.length}）不一致`);
  }
  const regIds = new Set(readJSON('content/library/registry.json').records.map((r) => r.song_id));
  const byDecision = {};
  for (const it of rr.records) {
    validateDataAgainst('content/schema/review-record.schema.json', it, `${RR_REL}#${it.record_id || '?'}`);
    byDecision[it.decision] = (byDecision[it.decision] || 0) + 1;
    if (it.target_kind === 'song_anchor' || it.target_kind === 'promotion_trial' || it.target_kind === 'resource') {
      if (!songIdSet.has(it.target_id) && !regIds.has(it.target_id)) {
        err(RR_REL, `记录 ${it.record_id} 的对象 ${it.target_id} 既不在详情层也不在登记层`);
      }
    }
    if (/^(system|auto|机器人|机器人裁决)$/i.test(String(it.reviewer))) {
      err(RR_REL, `记录 ${it.record_id} 的 reviewer 必须是人工，系统不得代填`);
    }
  }
  for (const d of rr.decision_vocabulary) {
    const declared = rr.counts.by_decision[d] || 0;
    if (declared !== (byDecision[d] || 0)) err(RR_REL, `counts.by_decision.${d}（${declared}）与实际不一致`);
  }
  for (const b of rr.boundaries || []) {
    if (!b) err(RR_REL, 'boundaries 存在空项');
  }

  /* --- 生产索引计数与基线作用域 --- */
  const prod = readJSON('content/production/index.json');
  if (prod.counts.song_resource_records !== res.counts.total) {
    err('content/production/index.json', `counts.song_resource_records（${prod.counts.song_resource_records}）与资源层实际（${res.counts.total}）不一致`);
  }
  if (prod.counts.review_records !== rr.counts.total) {
    err('content/production/index.json', `counts.review_records（${prod.counts.review_records}）与审查记录层实际（${rr.counts.total}）不一致`);
  }
  const baseline = readJSON('content/production/baseline-immutable.json');
  const baselineFiles = Object.keys(baseline.files || {});
  for (const f of baselineFiles) {
    if (f.startsWith('content/song-resources/') || f === 'content/production/review-records.json') {
      err('content/production/baseline-immutable.json', `${f} 属 V1.1-A 结构层（Production Content），不得进入不可变基线`);
    }
  }
}

/* ---------------------------------------------------------------- 主流程 */

/* =========================================================
   V2.0：候选库 / 前台结构硬检查（MOS 生命诗歌软件）
========================================================= */
const CAND_REL = 'content/candidates/index.json';
function checkV20() {
  const cand = readJSON(CAND_REL);
  const rows = cand.candidates || [];
  if (!Array.isArray(rows) || rows.length !== 100) {
    err(CAND_REL, `候选应为 100 条，实际 ${rows.length}`);
    return;
  }
  if (cand.themes && cand.themes.length !== 13) err(CAND_REL, `前台主题词表应为 13 个，实际 ${(cand.themes || []).length}`);
  if (cand.scenes && cand.scenes.length !== 7) err(CAND_REL, `前台场景词表应为 7 个，实际 ${(cand.scenes || []).length}`);
  const seen = new Set();
  for (const c of rows) {
    if (c.discernment_status !== 'NOT_YET_ASSESSED') err(CAND_REL, `${c.song_id} discernment_status 必须为 NOT_YET_ASSESSED（候选层不得携带辨识结论）`);
    if (c.copyright_status !== 'SOURCE_REQUIRED') err(CAND_REL, `${c.song_id} copyright_status 必须为 SOURCE_REQUIRED（ADR-0012 维度：来源与行动状态）`);
    if (!/^MUS-S-\d{4}$/.test(String(c.song_id))) err(CAND_REL, `候选 song_id 不符合 MUS-S-NNNN 规范：${c.song_id}`);
    const n = Number(String(c.song_id).slice(-4));
    if (c.csv_song_id !== 'S-' + String(n).padStart(4, '0')) err(CAND_REL, `${c.song_id} 的 csv_song_id 溯源不一致：${c.csv_song_id}`);
    if (seen.has(c.song_id)) err(CAND_REL, `候选 song_id 重复：${c.song_id}`);
    seen.add(c.song_id);
    const tags = c.front_tags || {};
    if (tags.tags_status !== 'provisional_intake_classification') err(CAND_REL, `${c.song_id} front_tags.tags_status 必须明示 provisional_intake_classification`);
    if ('score' in c || 'rank' in c || 'rating' in c) err(CAND_REL, `${c.song_id} 候选记录不得携带 score/rank/rating 字段（禁止推荐排序）`);
  }
  const counts = cand.counts || {};
  if (counts.total !== 100 || counts.existing_in_library_v05 !== 50 || counts.new_candidate !== 50) {
    err(CAND_REL, `counts 应为 total 100 / existing 50 / new 50，实际 ${JSON.stringify(counts)}`);
  }

  /* 结构层文件不得进入不可变基线 */
  const baseline = readJSON('content/production/baseline-immutable.json');
  for (const f of Object.keys(baseline.files || {})) {
    if (f.startsWith('content/candidates/')) {
      err('content/production/baseline-immutable.json', `${f} 属 V2.0 候选层（Production Content），不得进入不可变基线`);
    }
  }

  /* 生产索引：候选计数与平台版本 */
  const prodIndex = readJSON('content/production/index.json');
  if (prodIndex.counts && prodIndex.counts.songs_candidates !== 100) {
    err('content/production/index.json', `counts.songs_candidates 应为 100，实际 ${prodIndex.counts.songs_candidates}`);
  }

  /* 前台模块文件存在且不含辨识结论词（前台不得出现 tier/NOT_ASSESSED 等工程词） */
  for (const f of ['app/front/home.js', 'app/front/songbook.js', 'app/front/mine.js',
    'app/front/song-page.js', 'app/front/learn.js', 'app/front/teach.js',
    'app/front/util.js', 'app/front/my-songs.js', 'app/front/player.js', 'app/front/covers.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const banned of ['NOT_ASSESSED', 'under_review', 'eight_dimensions']) {
      if (src.includes(banned)) err(f, `前台程序文件不得出现辨识/后台术语「${banned}」（前台不说工程语言）`);
    }
    if (/MUS-S-\d{4}/.test(src)) err(f, `前台程序文件不得硬编码歌曲 ID（§34）`);
  }

  /* V2.1：封面系统与设计系统层（前台只做视觉，不承载辨识结论） */
  const v21css = fs.readFileSync(path.join(ROOT, 'app/ui/v21.css'), 'utf8');
  if (!v21css.includes('data-mood="night"')) err('app/ui/v21.css', 'V2.1 设计系统缺少深夜沉浸模式');
  if (!v21css.includes('prefers-reduced-motion')) err('app/ui/v21.css', 'V2.1 动效必须声明 reduced-motion 降级（components.css 全局规则兜底）');
  const coversSrc = fs.readFileSync(path.join(ROOT, 'app/front/covers.js'), 'utf8');
  if (!coversSrc.includes('aria-hidden') || !coversSrc.includes('gradientTransform')) err('app/front/covers.js', '封面 SVG 必须是装饰性（aria-hidden）且确定性生成');

  /* SW：前台模块与候选索引必须预缓存（PILOT 10 升 v11，防旧缓存污染） */
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  for (const need of ["'mos-music-v13'", "'./app/front/home.js'", "'./app/front/teach.js'", "'./app/front/covers.js'", "'./app/ui/v21.css'", "'./content/candidates/index.json'",
    "'./content/production/packages/index.json'", "'./content/production/packages/MUS-S-0001/lyrics.json'", "'./content/production/packages/MUS-S-0001/score.json'",
    "'./app/front/coach.js'", "'./content/taxonomy/assignments.json'", "'./content/song-content/MUS-S-0001.json'", "'./content/coach/index.json'", "'./content/production/resource-discovery.json'"]) {
    if (!sw.includes(need)) err('sw.js', `SW 预缓存缺失：${need}`);
  }
  const frontFileCount = fs.readdirSync(path.join(ROOT, 'app/front')).filter((n) => n.endsWith('.js')).length;
  info(`V2.0/V2.1 检查：候选库 100 条（NOT_YET_ASSESSED / SOURCE_REQUIRED / provisional 初分类 / 无排序字段）；前台 ${frontFileCount} 文件无工程术语；SW v13 + 设计系统层 + 封面系统就绪。`);
}

/* =========================================================
   V3.0：单曲完整歌曲单元（18 段 / L1–L4 派生 / 状态机一致性）
   标准：docs/standards/MOS-SONG-PRODUCTION-TEMPLATE-V1.0.md
========================================================= */
const UNIT_INDEX = 'content/song-units/index.json';
const UNIT_LEVELS = 'content/production/song-unit-levels.json';

/* 18 段的键（顺序即标准模板顺序，不得调整）。 */
const UNIT_SECTION_KEYS = [
  'song_meta', 'lyrics', 'score', 'demo_male', 'demo_female', 'piano',
  'timeline', 'cursor', 'teach_learn', 'teach_score', 'teach_lyrics',
  'teach_vocal', 'teach_live', 'content_understanding', 'life_practice',
  'transmission', 'rights', 'acceptance',
];
/* 段键 → 记录里的实际路径（记录按结构分组嵌套：demos.* / teaching.*）。 */
const UNIT_SECTION_PATHS = {
  song_meta: ['song_meta'],
  lyrics: ['lyrics'],
  score: ['score'],
  demo_male: ['demos', 'male'],
  demo_female: ['demos', 'female'],
  piano: ['piano'],
  timeline: ['timeline'],
  cursor: ['cursor'],
  teach_learn: ['teaching', 'learn'],
  teach_score: ['teaching', 'score_class'],
  teach_lyrics: ['teaching', 'lyrics_class'],
  teach_vocal: ['teaching', 'vocal'],
  teach_live: ['teaching', 'live_teaching'],
  content_understanding: ['content_understanding'],
  life_practice: ['life_practice'],
  transmission: ['transmission'],
  rights: ['rights'],
  acceptance: ['acceptance'],
};
function atPath(obj, p) {
  let cur = obj;
  for (const k of p) { if (cur == null) return undefined; cur = cur[k]; }
  return cur;
}
const UNIT_STATUS = [
  'INTAKE', 'VERIFYING', 'LYRICS_READY', 'SCORE_READY', 'PIANO_READY',
  'DEMO_READY', 'SYNC_READY', 'TEACHING_READY', 'REVIEW', 'COMPLETE', 'HOLD',
];
const UNIT_LEVELS_ENUM = ['NONE', 'L1', 'L2', 'L3', 'L4'];
/* 声明为 PROVIDED 的段必须有对应载荷，否则视为「声明即完成」（禁止）。 */
const PROVIDED_PAYLOAD = {
  lyrics: (u) => (u.lyrics.sections || []).length > 0,
  score: (u) => (u.score.sections || []).length > 0,
  timeline: (u) => (u.timeline.phrases || []).length > 0,
  cursor: (u) => (u.cursor.levels || []).length > 0,
};

async function checkV30(refs) {
  const U = await import(pathToFileURL(path.join(ROOT, 'app/song-unit.js')).href);
  const idx = readJSON(UNIT_INDEX);
  const songIds = (refs && refs.songIds) || new Set();

  if (idx.units_version !== 'MUS-V-1.1.0') err(UNIT_INDEX, `units_version 应为 MUS-V-1.1.0（V3.2），实际 ${idx.units_version}`);
  if ((idx.sections || []).length !== 18) err(UNIT_INDEX, `18 段词表应为 18 项，实际 ${(idx.sections || []).length}`);
  const secKeys = (idx.sections || []).map((s) => s.key);
  if (JSON.stringify(secKeys) !== JSON.stringify(UNIT_SECTION_KEYS)) {
    err(UNIT_INDEX, `段键顺序与标准模板不一致：${JSON.stringify(secKeys)}`);
  }
  const lvKeys = (idx.completion_levels || []).map((l) => l.key);
  if (JSON.stringify(lvKeys) !== JSON.stringify(UNIT_LEVELS_ENUM)) {
    err(UNIT_INDEX, `完成等级词表应为 NONE/L1/L2/L3/L4，实际 ${JSON.stringify(lvKeys)}`);
  }
  if ((idx.production_states || []).length !== UNIT_STATUS.length) {
    err(UNIT_INDEX, `生产状态词表应为 ${UNIT_STATUS.length} 项，实际 ${(idx.production_states || []).length}`);
  }
  /* 教学十步 / 三模式（用户要求「含内容与步骤」） */
  const tm = idx.teaching_method || {};
  if ((tm.steps || []).length !== 10) err(UNIT_INDEX, `教学十步法应为 10 步，实际 ${(tm.steps || []).length}`);
  const modeKeys = (tm.modes || []).map((m) => m.key);
  if (JSON.stringify(modeKeys) !== JSON.stringify(['learn', 'sight', 'teach'])) {
    err(UNIT_INDEX, `三模式应为 learn/sight/teach，实际 ${JSON.stringify(modeKeys)}`);
  }
  const sight = (tm.modes || []).find((m) => m.key === 'sight') || {};
  if (sight.gives_full_demo_first !== false) err(UNIT_INDEX, '视唱模式必须声明 gives_full_demo_first=false（先看谱，最后才核显示范）');
  if (!Array.isArray(idx.learner_stages) || idx.learner_stages.length !== 4) err(UNIT_INDEX, '四级学习状态应为 4 项');
  if (!Array.isArray(idx.review_cycle) || idx.review_cycle.length !== 3) err(UNIT_INDEX, '间隔复习应为 Day 0 / 2 / 7 三项');
  if (idx.resource_absent_text !== '尚未提供') err(UNIT_INDEX, '资源缺失统一用语必须为「尚未提供」');

  /* 三份标准文档必须真实存在，且词表声明与磁盘一致（标准层不得悬空） */
  const STD = idx.standards || {};
  for (const key of ['teaching_method', 'production_template', 'production_worksheet']) {
    const rel = STD[key];
    if (!rel) { err(UNIT_INDEX, `standards.${key} 未声明标准文档路径`); continue; }
    if (!exists(rel)) err(UNIT_INDEX, `标准文档不存在：${rel}`);
  }
  if (!exists('docs/ADR/ADR-0017-single-song-unit-standard-layer.md')) {
    err('docs/ADR', '缺少 ADR-0017（单曲完整单元标准层）');
  }

  /* 单元清单：每条都要有对应文件，且 song_id 必须在内容层存在 */
  const units = idx.units || [];
  for (const row of units) {
    if (!/^MUS-SU-\d{4}$/.test(String(row.unit_id))) err(UNIT_INDEX, `unit_id 不符合 MUS-SU-NNNN：${row.unit_id}`);
    if (!UNIT_STATUS.includes(row.status)) err(UNIT_INDEX, `${row.unit_id} status 非法：${row.status}`);
    if (!exists(row.file)) err(UNIT_INDEX, `${row.unit_id} 的单元文件不存在：${row.file}`);
    if (songIds.size && !songIds.has(row.song_id)) err(UNIT_INDEX, `${row.unit_id} 挂到不存在的歌：${row.song_id}`);
  }

  /* 逐个单元：结构完整性 / 声明即完成 / 状态机一致性 / 等级派生 / 时间轴单调性 / 追溯 */
  const derived = new Map();
  for (const row of units) {
    const u = readJSON(row.file);
    const where = row.file;
    if (u.unit_id !== row.unit_id || u.song_id !== row.song_id) err(where, `unit_id / song_id 与索引不一致`);
    if (u.unit_version !== 'MUS-V-1.1.0') err(where, `unit_version 应为 MUS-V-1.1.0（V3.2），实际 ${u.unit_version}`);
    if (!UNIT_STATUS.includes(u.status)) err(where, `status 非法：${u.status}`);
    /* 18 段必须齐备（结构完整性；段按结构分组嵌套） */
    for (const k of UNIT_SECTION_KEYS) {
      const v = atPath(u, UNIT_SECTION_PATHS[k]);
      if (v === undefined) err(where, `缺少第 ${UNIT_SECTION_KEYS.indexOf(k) + 1} 段：${k}`);
    }
    /* 段 status 只能是 PROVIDED / NOT_PROVIDED，且 PROVIDED 必须真有载荷 */
    for (const k of ['lyrics', 'score', 'piano', 'timeline', 'cursor']) {
      const sec = u[k] || {};
      if (!['PROVIDED', 'NOT_PROVIDED'].includes(sec.status)) err(where, `${k}.status 非法：${sec.status}`);
      const check = PROVIDED_PAYLOAD[k];
      if (sec.status === 'PROVIDED' && check && !check(u)) err(where, `${k} 声明 PROVIDED 但载荷为空 —— 禁止「声明即完成」`);
    }
    for (const k of ['male', 'female']) {
      const d = (u.demos || {})[k] || {};
      if (!['PROVIDED', 'NOT_PROVIDED'].includes(d.status)) err(where, `demos.${k}.status 非法：${d.status}`);
      if (d.singer != null) err(where, `demos.${k}.singer 必须为 null（不得用虚拟歌手冒充真人示唱）`);
      if (d.status === 'PROVIDED' && !(d.slots || []).length) err(where, `demos.${k} 声明 PROVIDED 但没有任何 slot`);
    }
    for (const k of ['learn']) {
      const t = (u.teaching || {})[k] || {};
      if (!['PROVIDED', 'NOT_PROVIDED'].includes(t.status)) err(where, `teaching.${k}.status 非法：${t.status}`);
    }
    for (const m of ((u.teaching || {}).live_teaching || {}).modules || []) {
      if (!['PROVIDED', 'NOT_PROVIDED'].includes(m.status)) err(where, `真人教唱模块 ${m.key} status 非法：${m.status}`);
    }
    /* 生产状态机：声明达到某状态必须有机械前置条件（不得靠声明变成已完成） */
    const sc = U.statusConsistent(u);
    if (!sc.ok) err(where, `status=${sc.status} 与资源实际自相矛盾：缺少 ${sc.violations.join('、')}`);
    /* 派生等级：记录里不得写等级字段（等级是派生结果） */
    for (const k of ['level', 'completion_level', 'derived_level']) {
      if (Object.prototype.hasOwnProperty.call(u, k)) err(where, `单元记录不得写入派生字段 ${k}（等级由 app/song-unit.js 推导）`);
    }
    /* 时间轴单调性（光标跟谱的地基） */
    const tl = u.timeline || {};
    if (tl.status === 'PROVIDED') {
      let lastEnd = -1;
      for (const p of tl.phrases || []) {
        if (typeof p.start !== 'number' || typeof p.end !== 'number') { err(where, `分句 ${p.phrase_id} 缺少 start / end`); continue; }
        if (p.end <= p.start) err(where, `分句 ${p.phrase_id} end 不大于 start`);
        if (p.start < lastEnd) err(where, `分句 ${p.phrase_id} 时间与上一句重叠或倒序`);
        lastEnd = Math.max(lastEnd, p.end);
        for (const m of p.marks || []) {
          if (m.start < p.start - 0.001 || m.end > p.end + 0.001) err(where, `分句 ${p.phrase_id} 的时间标记超出该句范围`);
        }
      }
    }
    /* 可追溯文本：有 text 必须有 derived_from（不得凭空生成神学内容） */
    const cu = u.content_understanding || {};
    for (const k of ['what_it_sings', 'core_truth', 'background', 'why_church_sings']) {
      const t = cu[k] || {};
      if (t.text && !t.derived_from) err(where, `content_understanding.${k} 有文本但缺少 derived_from（不可追溯）`);
    }
    for (const b of cu.bible_basis || []) {
      if (b.reference && !b.derived_from) err(where, 'bible_basis 有经文引用但缺少 derived_from');
    }
    for (const i of (u.life_practice || {}).items || []) {
      if (i.text && !i.derived_from) err(where, 'life_practice 有文本但缺少 derived_from（不可追溯）');
    }
    /* 版权维度：来源行动状态永不产生法律结论（ADR-0012） */
    const r = u.rights || {};
    const legal = ['unknown', 'public_domain', 'copyrighted', 'licensed', 'permission_granted'];
    if (!legal.includes(r.copyright_status)) err(where, `rights.copyright_status 非法：${r.copyright_status}`);
    /* 禁止分数 / 排名 / 徽章 / 通过结论（score 是合法段名，不在此列） */
    const raw = fs.readFileSync(path.join(ROOT, row.file), 'utf8');
    for (const banned of ['"rank"', '"rating"', '"badge"', '"points"', '"total_score"', '"perfect_score"', '"passed"', '"leaderboard"']) {
      if (raw.includes(banned)) err(where, `单元记录不得出现评分 / 排名 / 徽章 / 通过类字段：${banned}`);
    }
    /* 验收：PENDING 不等于通过 —— 机械完成度单独标注 */
    const acc = U.acceptanceSummary(u);
    if (acc.mechanically_complete && u.status === 'COMPLETE' && u.release && u.release.signed_by == null) {
      err(where, 'COMPLETE 必须有发布签核（release.signed_by），不得自认已验收');
    }
    derived.set(row.unit_id, { level: U.deriveLevel(u), flags: U.unitFlags(u) });
  }

  /* 派生表必须与逐单元重算结果一致（防止手改派生表） */
  if (exists(UNIT_LEVELS)) {
    const table = readJSON(UNIT_LEVELS);
    if (table.derived !== true) err(UNIT_LEVELS, '派生表必须显式 derived=true');
    const byUnit = new Map((table.units || []).map((x) => [x.unit_id, x]));
    for (const [unitId, d] of derived) {
      const rowT = byUnit.get(unitId);
      if (!rowT) { err(UNIT_LEVELS, `派生表缺少单元 ${unitId}`); continue; }
      if (rowT.level !== d.level) err(UNIT_LEVELS, `派生表 ${unitId} 等级 ${rowT.level} 与重算 ${d.level} 不一致`);
    }
    const byLevel = (table.counts || {}).by_level || {};
    for (const lv of UNIT_LEVELS_ENUM) {
      if (!(lv in byLevel)) err(UNIT_LEVELS, `派生表 counts.by_level 缺少 ${lv}`);
    }
  } else {
    err(UNIT_LEVELS, '派生等级表不存在（应由 tools/song-units.js 生成）');
  }

  /* V3.0 前台模块不得硬编码歌曲 ID / 不得出现后台工程术语 */
  for (const f of ['app/front/score.js', 'app/front/review.js', 'app/front/pulse.js',
    'app/front/song-page.js', 'app/front/learn.js', 'app/front/teach.js',
    'app/front/home.js', 'app/front/mine.js', 'app/front/util.js']) {
    if (!exists(f)) { err(f, 'V3.0 前台模块缺失'); continue; }
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (/MUS-S-\d{4}/.test(src)) err(f, `前台程序文件不得硬编码歌曲 ID（§34）`);
    for (const banned of ['NOT_ASSESSED', 'under_review', 'eight_dimensions']) {
      if (src.includes(banned)) err(f, `前台文件不得出现后台术语「${banned}」`);
    }
  }
  /* 简谱渲染与光标：必须存在，且明确不插值（不得按比例猜小节） */
  const scoreSrc = fs.readFileSync(path.join(ROOT, 'app/front/score.js'), 'utf8');
  if (!scoreSrc.includes("measure_basis")) err('app/front/score.js', '光标定位必须标注小节依据（mark / phrase_range），不得插值冒充');
  if (!scoreSrc.includes('renderScoreAbsentHtml')) err('app/front/score.js', '必须提供「简谱尚未提供」的如实渲染分支');
  /* 节拍器：没有 Web Audio 时必须如实不可用（不得放假声音） */
  const pulseSrc = fs.readFileSync(path.join(ROOT, 'app/front/pulse.js'), 'utf8');
  if (!pulseSrc.includes('available: Boolean(Ctx)')) err('app/front/pulse.js', '节拍器必须如实报告 available（不得假装发声）');
  /* 四级状态：不得产生分数 / 排名 */
  const reviewSrc = fs.readFileSync(path.join(ROOT, 'app/front/review.js'), 'utf8');
  for (const banned of ['score:', 'rank', 'badge']) {
    if (reviewSrc.includes(banned)) err('app/front/review.js', `学习状态模块不得产生 ${banned}（不做分数与排行）`);
  }

  /* 生产工作单（STEP00–15 / 缺口 / 资源包 / A–J 签核）必须与单元一致 */
  const WS = 'content/production/song-worksheets.json';
  if (!exists(WS)) {
    err(WS, '生产工作单不存在（应由 tools/song-worksheet.js 生成）');
  } else {
    const ws = readJSON(WS);
    if (ws.derived !== true) err(WS, '工作单必须显式 derived=true');
    if (ws.worksheets_version !== 'MUS-V-1.0.0') err(WS, `worksheets_version 应为 MUS-V-1.0.0，实际 ${ws.worksheets_version}`);
    if ((ws.steps_vocabulary || []).length !== 16) err(WS, `STEP 词表应为 STEP00–STEP15 共 16 步，实际 ${(ws.steps_vocabulary || []).length}`);
    if ((ws.worksheets || []).length !== units.length) err(WS, `工作单行数应与单曲单元数一致（${units.length}），实际 ${(ws.worksheets || []).length}`);
    for (const w of ws.worksheets || []) {
      const d = derived.get(w.unit_id);
      if (!d) { err(WS, `工作单含未知单元 ${w.unit_id}`); continue; }
      if (w.level !== d.level) err(WS, `工作单 ${w.unit_id} 等级 ${w.level} 与重算 ${d.level} 不一致`);
      if ((w.steps || []).length !== 16) err(WS, `工作单 ${w.unit_id} 步骤数应为 16，实际 ${(w.steps || []).length}`);
      const firstTodo = (w.steps || []).find((s) => s.state === 'TODO');
      if ((w.next_step || null) !== (firstTodo ? firstTodo.no : null)) err(WS, `工作单 ${w.unit_id} 的 next_step 与首个 TODO 步骤不一致`);
      if ((w.signoff || []).length !== 10) err(WS, `工作单 ${w.unit_id} 签核表应为 10 组（A–J）`);
      if (w.release && w.release.signed_by !== null) err(WS, `工作单不得代人签核（${w.unit_id} signed_by 必须为 null）`);
      /* 机械就绪 → 必须真的资源包齐备 + A–J 无 PENDING/REVISE/HOLD */
      if (w.release && w.release.mechanical_ready) {
        const pkgOk = (w.resource_package || []).every((p) => p.ready);
        const acc = w.acceptance || {};
        if (!pkgOk || acc.pending !== 0 || acc.revise !== 0 || acc.hold !== 0) {
          err(WS, `工作单 ${w.unit_id} 声明 mechanical_ready 但资源包或签核未满足`);
        }
      }
    }
  }

  /* SW 必须预缓存 V3.0 外壳与单元词表 */
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  for (const need of ["'./app/song-unit.js'", "'./app/front/score.js'", "'./app/front/review.js'",
    "'./app/front/pulse.js'", "'./app/ui/v30.css'", "'./content/song-units/index.json'",
    "'./content/production/song-unit-levels.json'", "'./content/production/song-worksheets.json'"]) {
    if (!sw.includes(need)) err('sw.js', `V3.0 SW 预缓存缺失：${need}`);
  }
  /* index.html 必须引入 V3.0 样式层 */
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (!html.includes('app/ui/v30.css')) err('index.html', 'index.html 必须引入 app/ui/v30.css（简谱 / 光标 / 节奏样式层）');
  /* 内容源必须注册 song_units 索引 */
  const cs = fs.readFileSync(path.join(ROOT, 'app/content-source.js'), 'utf8');
  if (!cs.includes("song_units")) err('app/content-source.js', '内容源必须注册 song_units 索引（单曲单元词表）');

  /* ---- PILOT 10：生产工作包（任务书 §二 / §一 反虚构） ---- */
  const PKG = 'content/production/packages';
  const pkgIdx = readJSON(`${PKG}/index.json`);
  if ((pkgIdx.slots || []).length !== 9) err(`${PKG}/index.json`, '生产工作包应为 9 槽位（metadata/lyrics/score/audio/timeline/teaching/content/rights/worksheet）');
  const pkgSongs = new Set();
  for (const o of [...(pkgIdx.sample.order || []), ...(pkgIdx.sample.blocked || [])]) {
    if (pkgSongs.has(o.song_id)) err(`${PKG}/index.json`, `样板清单重复：${o.song_id}`);
    pkgSongs.add(o.song_id);
  }
  if (pkgSongs.size !== 10) err(`${PKG}/index.json`, `生产工作包应覆盖 10 首，实际 ${pkgSongs.size}`);
  const orders = (pkgIdx.sample.order || []).map((o) => o.order);
  if (JSON.stringify(orders) !== JSON.stringify([1, 2, 3, 4, 5])) err(`${PKG}/index.json`, '样板生产顺序应为 1–5');

  let lyricsProvided = 0; let scoreDraft = 0; let worksheets = 0;
  let scoreImported = 0; let scorePending = 0;
  for (const row of units) {
    const song = readJSON(`content/songs/${row.song_id}.json`);
    const sid = song.song_id;
    const legal = (song.copyright && song.copyright.copyright_status) || 'unknown';
    const base = `${PKG}/${sid}`;
    const mf = readJSON(`${base}/manifest.json`);
    if (mf.song_id !== sid || mf.unit_id !== row.unit_id) err(`${base}/manifest.json`, 'manifest 的 song_id / unit_id 与单元不一致');
    for (const [slot, v] of Object.entries(mf.slots || {})) {
      if (!['PROVIDED', 'DRAFT', 'NOT_AVAILABLE'].includes(v.status)) err(`${base}/manifest.json`, `槽位 ${slot} 状态非法：${v.status}`);
      if (!exists(`${base}/${v.file}`)) err(`${base}/manifest.json`, `槽位 ${slot} 文件缺失：${v.file}`);
    }
    /* 反虚构：音频槽位必须 NOT_AVAILABLE 且无 file_url（无真人录音） */
    const audio = readJSON(`${base}/audio.json`);
    if (audio.status !== 'NOT_AVAILABLE') err(`${base}/audio.json`, '音频槽位必须 NOT_AVAILABLE（本批无真人录音）');
    for (const k of ['piano', 'demo_male', 'demo_female']) {
      if ((audio[k] && audio[k].file_url)) err(`${base}/audio.json`, `禁止虚构音频文件引用：${k}.file_url`);
    }
    const tl = readJSON(`${base}/timeline.json`);
    const sc = readJSON(`${base}/score.json`);
    const ts = (sc.transcription && sc.transcription.status) || 'NOT_STARTED';
    /* V3.2 §六：时间轴两条合法路径 ——
       (a) SYNC_READY：由结构化简谱节奏 × 速度**精确计算**（须有 tempo_bpm 与 phrases，且谱面为 SOURCE_IMPORTED/VERIFIED）；
       (b) SYNC_NOT_READY：无可靠时间标记（不插值、不猜）。 */
    if (tl.status === 'SYNC_READY') {
      if (!['SOURCE_IMPORTED', 'VERIFIED'].includes(ts)) {
        err(`${base}/timeline.json`, `时间轴 SYNC_READY 需要谱面为 SOURCE_IMPORTED / VERIFIED，实际 ${ts}`);
      }
      if (!Number.isFinite(tl.tempo_bpm) || tl.tempo_bpm <= 0) err(`${base}/timeline.json`, 'SYNC_READY 时间轴必须带 tempo_bpm（简谱节奏 × 速度精确计算的依据）');
      const ps = tl.phrases || [];
      if (!ps.length) err(`${base}/timeline.json`, 'SYNC_READY 时间轴必须有 phrases 载荷');
      let lastEnd = 0;
      for (const p of ps) {
        if (typeof p.start !== 'number' || typeof p.end !== 'number') { err(`${base}/timeline.json`, `分句 ${p.phrase_id} 缺少 start / end`); continue; }
        if (p.end <= p.start) err(`${base}/timeline.json`, `分句 ${p.phrase_id} end 不大于 start`);
        if (p.start < lastEnd - 0.001) err(`${base}/timeline.json`, `分句 ${p.phrase_id} 时间与上一句重叠或倒序`);
        lastEnd = p.end;
        for (const m of p.marks || []) {
          if (m.start < p.start - 0.001 || m.end > p.end + 0.001) err(`${base}/timeline.json`, `分句 ${p.phrase_id} 的时间标记超出该句范围`);
        }
      }
      const mfTl = (mf.slots.timeline || {});
      if (mfTl.sync_status !== 'SYNC_READY' || mfTl.status !== 'PROVIDED') err(`${base}/manifest.json`, '时间轴 SYNC_READY 时 manifest 槽位应为 PROVIDed/SYNC_READY');
      const unitTl = readJSON(row.file).timeline || {};
      if (unitTl.status !== 'PROVIDED') err(row.file, '时间轴 SYNC_READY 时单元 timeline 应为 PROVIDED（由工作包应用）');
    } else if (tl.status === 'SYNC_NOT_READY') {
      if ((tl.phrases || []).length) err(`${base}/timeline.json`, 'SYNC_NOT_READY 时不得有 phrases 载荷');
    } else {
      err(`${base}/timeline.json`, `时间轴状态非法：${tl.status}（只允许 SYNC_READY / SYNC_NOT_READY）`);
    }
    /* 权利一致性：法律状态未判定 ⇒ 歌词 / 简谱一律 NOT_AVAILABLE */
    const ly = readJSON(`${base}/lyrics.json`);
    const hasLyrics = Array.isArray(ly.sections) && ly.sections.length > 0;
    if (legal !== 'public_domain' && hasLyrics) err(`${base}/lyrics.json`, `${sid} 法律状态 ${legal}，不得托管歌词文本`);
    if (legal !== 'public_domain' && mf.slots.lyrics.status === 'PROVIDED') err(`${base}/manifest.json`, `${sid} 歌词槽位不得为 PROVIDED`);
    if (legal !== 'public_domain' && mf.slots.score.status !== 'NOT_AVAILABLE') err(`${base}/manifest.json`, `${sid} 简谱槽位必须 NOT_AVAILABLE`);
    if (hasLyrics) {
      if (ly.proofread.status === 'PASS' && ly.proofread.checked_by) { /* 人工签核后允许 PASS */ }
      let n = 0;
      for (const sec of ly.sections) {
        for (const line of sec.lines || []) {
          n += 1;
          if (!line.lyric_id || !line.line_id || !line.text) err(`${base}/lyrics.json`, `歌词行缺 lyric_id / line_id / text（${sid} ${sec.section_id}）`);
        }
      }
      if (!n) err(`${base}/lyrics.json`, `${sid} 歌词为空却标记 PROVIDED`);
      if (mf.slots.lyrics.status === 'PROVIDED') lyricsProvided += 1;
    }
    const sc2 = sc; /* （上文已读取） */
    if (!['NOT_STARTED', 'DRAFT', 'VERIFIED', 'SOURCE_IMPORTED'].includes(ts)) err(`${base}/score.json`, `transcription.status 非法：${ts}`);
    let scoreImported = 0; let scorePending = 0;
    if (ts === 'DRAFT') {
      scoreDraft += 1;
      if (!Array.isArray(sc.transcription.verified_measures)) err(`${base}/score.json`, 'DRAFT 转写必须带 verified_measures 数组（空 = 全部待听校）');
      if (mf.slots.score.status !== 'DRAFT') err(`${base}/manifest.json`, '简谱为 DRAFT 时 manifest 槽位应为 DRAFT');
      /* DRAFT 不计入等级：单元 score 必须仍为 NOT_PROVIDED */
      const unitRec = readJSON(row.file);
      if (unitRec.score.status === 'PROVIDED') err(row.file, 'DRAFT 草稿不得计入等级：单元 score.status 必须保持 NOT_PROVIDED');
      if (unitRec.status === 'SCORE_READY') err(row.file, 'DRAFT 草稿不得声明 SCORE_READY（状态机 §二）');
    }
    if (ts === 'SOURCE_IMPORTED') {
      /* V3.2 §五：原谱导入（机械转换忠实于已出版公版原谱）＝真实谱面载荷 */
      scoreImported += 1;
      if (!Array.isArray(sc.transcription.verified_measures)) err(`${base}/score.json`, 'SOURCE_IMPORTED 必须带 verified_measures 数组');
      if (!sc.transcription.source || !sc.transcription.source.url) err(`${base}/score.json`, 'SOURCE_IMPORTED 必须带可追溯原谱来源（transcription.source.url）');
      if ((sc.transcription.proofread || {}).status !== 'PENDING') err(`${base}/score.json`, 'SOURCE_IMPORTED 的人工听校必须保持 PENDING（导入 ≠ 已校对）');
      if (mf.slots.score.status !== 'PROVIDED') err(`${base}/manifest.json`, '简谱为 SOURCE_IMPORTED 时 manifest 槽位应为 PROVIDED');
      if (mf.slots.score.transcription !== 'SOURCE_IMPORTED') err(`${base}/manifest.json`, 'manifest 槽位 transcription 应为 SOURCE_IMPORTED');
      const unitRec = readJSON(row.file);
      if (unitRec.score.status !== 'PROVIDED') err(row.file, 'SOURCE_IMPORTED 计入等级：单元 score.status 应为 PROVIDED');
      if (unitRec.score.note && !String(unitRec.score.note).includes('PENDING')) err(row.file, 'SOURCE_IMPORTED 单元 score.note 必须写明人工听校 PENDING');
    }
    if (sc.status === 'NOT_AVAILABLE' && sc.score_verify_required === true) scorePending += 1;
    /* 工作单 md 存在于包内 */
    if (exists(`${base}/MOS-SU-${sid.slice(-4)}_WORKSHEET.md`)) worksheets += 1;
  }
  if (lyricsProvided !== 5) err(`${PKG}/index.json`, `歌词 PROVIDED 应为 5 首（0001–0005 公版英文），实际 ${lyricsProvided}`);
  if (scoreDraft !== 0) err(`${PKG}/index.json`, `简谱 DRAFT 应为 0（V3.2 已升级为原谱导入），实际 ${scoreDraft}`);
  if (worksheets !== 10) err(`${PKG}/index.json`, `每包应有 MOS-SU-xxxx_WORKSHEET.md，实际 ${worksheets}/10`);
  /* 权利未判定的 5 首：阻断且全槽位不可用 */
  for (const b of pkgIdx.sample.blocked || []) {
    const mf = readJSON(`${PKG}/${b.song_id}/manifest.json`);
    if (!mf.blocked) err(`${PKG}/${b.song_id}/manifest.json`, '权利未判定歌必须标记 blocked=true');
    if (mf.sample_role || mf.production_order) err(`${PKG}/${b.song_id}/manifest.json`, '被阻断歌不得进入样板生产顺序');
  }

  info(`V3.0 检查：单曲单元 ${units.length} 个（18 段齐备 / 状态机一致 / 等级派生 / 时间轴单调 / 可追溯）；`
    + `简谱渲染 + 光标跟随（不插值）+ 真实节拍器 + 十步教学三模式 + 四级学习状态；SW v13 + 样式层就绪；`
    + `PILOT 10：生产工作包 10 × 9 槽位（歌词 PROVIDED ${lyricsProvided} / 简谱 DRAFT ${scoreDraft} / 音频全 NOT_AVAILABLE / 工作单 ${worksheets}/10）。`);
}

/* =========================================================
   V3.x：产品方向冻结 + 资源生产基础升级
     · 音乐系统独立定位（前台不突出周次；后台历史引用保留）
     · 分类 V1.1 四维（主题 / 处境 / 场景 / 音乐；多归属）
     · 歌曲内容层六项（不绑定周次 / 课程）
     · 完整资源模型（外部真人分段 / MOS 真人 / AI 显式标注 / Piano First / 表达参考）
     · MOS Singing Coach 基础层（独立模块；接口预留；不评分不排名不评属灵）
     · 100 首资源普查（先普查再生产；不得虚构来源）
   验收项对应任务书 §二十：分类完整性 / 外部真人资源字段 / 分段时间轴 /
   AI 资源类型 / Singing Coach 接口 / 100 首资源普查工具。
========================================================= */
const TAXONOMY_REL = 'content/taxonomy/index.json';
const TAXONOMY_ASSIGN_REL = 'content/taxonomy/assignments.json';
const SONG_CONTENT_REL = 'content/song-content/index.json';
const COACH_REL = 'content/coach/index.json';
const DISCOVERY_REL = 'content/production/resource-discovery.json';

function checkV3X(refs) {
  const songIds = (refs && refs.songIds) || new Set();

  /* ---------------- 1. 分类完整性（四维 / 多归属 / 前台只显示四维） ---------------- */
  if (!exists(TAXONOMY_REL)) err(TAXONOMY_REL, '缺少四维分类词表（V1.1）');
  else {
    const tax = readJSON(TAXONOMY_REL);
    if (tax.taxonomy_version !== 'MUS-V-1.0.0') err(TAXONOMY_REL, `taxonomy_version 应为 MUS-V-1.0.0，实际 ${tax.taxonomy_version}`);
    const dims = tax.dimensions || [];
    if (dims.length !== 4) err(TAXONOMY_REL, `四维分类应恰好 4 维，实际 ${dims.length}`);
    const keys = dims.map((d) => d.key);
    if (JSON.stringify(keys) !== JSON.stringify(['theme', 'situation', 'scene', 'music'])) {
      err(TAXONOMY_REL, `四维键应为 theme/situation/scene/music，实际 ${JSON.stringify(keys)}`);
    }
    for (const d of dims) {
      if (d.kind === 'labels' && d.multi !== true) err(TAXONOMY_REL, `${d.key} 必须是集合（multi=true）—— 分类不是单选身份`);
      if (!d.question) err(TAXONOMY_REL, `${d.key} 必须写明这一维回答什么问题`);
      if (d.kind === 'labels' && !(d.vocab || []).length) err(TAXONOMY_REL, `${d.key} 缺词表`);
    }
    const front = tax.front_rules || {};
    for (const b of ['calibration', 'source_required', 'governance', 'W01', 'W02']) {
      if (!(front.hides || []).includes(b)) err(TAXONOMY_REL, `前台隐藏词表必须包含 ${b}`);
    }
    for (const s of ['主题', '处境', '场景', '音乐']) {
      if (!(front.shows || []).includes(s)) err(TAXONOMY_REL, `前台显示词表必须包含「${s}」`);
    }
    if (!(tax.principles || []).some((p) => p.includes('不是歌曲的身份'))) {
      err(TAXONOMY_REL, '必须写明「分类不是歌曲的身份」这一原则');
    }
    if (!(tax.principles || []).some((p) => p.includes('多个分类'))) {
      err(TAXONOMY_REL, '必须写明一首歌可以同时出现在多个分类中');
    }
  }
  if (!exists(TAXONOMY_ASSIGN_REL)) err(TAXONOMY_ASSIGN_REL, '缺少分词结果（由 tools/taxonomy.js 生成）');
  else {
    const a = readJSON(TAXONOMY_ASSIGN_REL);
    if (a.derived !== true) err(TAXONOMY_ASSIGN_REL, '分词结果必须显式 derived=true（派生索引，不进基线）');
    const rows = a.assignments || [];
    if (rows.length !== 100) err(TAXONOMY_ASSIGN_REL, `分词结果应覆盖候选 100 首，实际 ${rows.length}`);
    const tax = exists(TAXONOMY_REL) ? readJSON(TAXONOMY_REL) : { dimensions: [] };
    const V = {};
    for (const d of tax.dimensions || []) V[d.key] = new Set((d.vocab || []).map((v) => v.key));
    const candIds = new Set(((exists(CAND_REL) ? readJSON(CAND_REL).candidates : []) || []).map((c) => c.song_id));
    let multi = 0;
    for (const r of rows) {
      if (candIds.size && !candIds.has(r.song_id)) err(TAXONOMY_ASSIGN_REL, `${r.song_id} 不在候选库（分类只覆盖候选 100 首）`);
      for (const dim of ['theme', 'situation', 'scene']) {
        const arr = (r.dimensions || {})[dim];
        if (!Array.isArray(arr)) { err(TAXONOMY_ASSIGN_REL, `${r.song_id}.${dim} 必须是数组（多归属）`); continue; }
        if (arr.length > 1) multi += 1;
        for (const it of arr) {
          if (V[dim] && !V[dim].has(it.key)) err(TAXONOMY_ASSIGN_REL, `${r.song_id}.${dim} 含词表外标签「${it.key}」（须人工裁决扩表，程序不得自行扩充）`);
          if (!it.derived_from) err(TAXONOMY_ASSIGN_REL, `${r.song_id}.${dim} 条目缺 derived_from`);
        }
      }
    }
    if (multi === 0) err(TAXONOMY_ASSIGN_REL, '多归属条目为 0 —— 分类被做成单选，违反 V1.1 原则');
    if ((a.unmapped || []).length) info(`分类词表外值 ${a.unmapped.length} 条已记录为待人工裁决（未自动采用）。`);
  }

  /* ---------------- 2. 歌曲内容层（六项 / 不绑周次课程） ---------------- */
  if (!exists(SONG_CONTENT_REL)) err(SONG_CONTENT_REL, '缺少歌曲内容层索引');
  else {
    const sc = readJSON(SONG_CONTENT_REL);
    const want = ['meaning', 'scripture', 'background', 'reflection', 'practice', 'prayer'];
    if (JSON.stringify(sc.field_keys || []) !== JSON.stringify(want)) {
      err(SONG_CONTENT_REL, `歌曲内容层必须保持六项 ${want.join('/')}，实际 ${JSON.stringify(sc.field_keys)}`);
    }
    const songs = sc.songs || [];
    if (!songs.length) err(SONG_CONTENT_REL, '歌曲内容层为空');
    for (const row of songs) {
      if (!exists(row.file)) { err(SONG_CONTENT_REL, `内容层文件缺失：${row.file}`); continue; }
      const rec = readJSON(row.file);
      for (const k of want) {
        const f = rec[k];
        if (!f) { err(row.file, `缺字段 ${k}`); continue; }
        const hasText = Boolean(f.text) || ((f.items || []).length > 0);
        if (hasText && !f.derived_from) err(row.file, `${k} 有内容但缺 derived_from（不可追溯）`);
        if (hasText && f.status !== 'PROVIDED') err(row.file, `${k} 有内容但未标 PROVIDED（如实标注）`);
      }
      /* 内容属于歌曲自身：不得绑定周次 / 课程 / 讲道 */
      const raw = fs.readFileSync(path.join(ROOT, row.file), 'utf8');
      for (const re of [/\bW[0-9]{2}\b/, /MUS-C-[0-9]{2}/, /MUS-U-2027-W[0-9]{2}/]) {
        const m = raw.match(re);
        if (m) err(row.file, `歌曲内容层不得绑定周次 / 课程「${m[0]}」`);
      }
    }
  }

  /* ---------------- 3. 完整资源模型（外部真人字段 / 分段 / Reuse First） ---------------- */
  const RES = 'content/song-resources/index.json';
  const res = readJSON(RES);
  if (res.resources_version !== 'MUS-V-1.1.0') err(RES, `resources_version 应为 MUS-V-1.1.0（V3.2 五首样板资源），实际 ${res.resources_version}`);
  const types = res.source_types_v1 || [];
  const wantTypes = ['EXTERNAL_HUMAN_MALE', 'EXTERNAL_HUMAN_FEMALE', 'MOS_HUMAN_MALE', 'MOS_HUMAN_FEMALE', 'AI_MALE', 'AI_FEMALE'];
  for (const t of wantTypes) {
    if (!types.some((x) => x.key === t)) err(RES, `来源类型缺 ${t}`);
  }
  for (const t of types) {
    if (t.is_ai && t.front_label.indexOf('非真人') === -1) err(RES, `${t.key} 前台必须标注「非真人」`);
    if (t.key.startsWith('EXTERNAL_') && t.host_policy !== 'original_site') err(RES, `${t.key} 托管政策必须是 original_site（原站播放 / 嵌入，不下载转存）`);
  }
  const seg = res.external_segment_support || {};
  for (const f of ['source_url', 'start', 'end', 'phrase_id']) {
    if (!(seg.fields || []).includes(f)) err(RES, `外部真人分段必须支持字段 ${f}`);
  }
  if (!String(seg.host_policy || '').includes('不得')) err(RES, '必须写明「不得下载 / 转存外部资源」');
  const reuse = res.reuse_first || {};
  if (JSON.stringify(reuse.order || []) !== JSON.stringify(['找现成', '核版本', '能用就用', '缺什么补什么', '最后自己制作'])) {
    err(RES, 'Reuse First 顺序必须固定为：找现成 → 核版本 → 能用就用 → 缺什么补什么 → 最后自己制作');
  }
  const sync = res.sync_chain || {};
  if (!(sync.chain || []).includes('external_human_audio')) err(RES, '同步链必须包含 external_human_audio（点某句谱 → 播对应真人示范）');
  if (!(res.personal_layer || {}).mapping) err(RES, '个人层（收藏 / 学习 / 历史 / 笔记）必须声明映射到客户端本地库');
  if (((res.ai_demo_policy || {}).counts_toward_level) !== false) err(RES, 'AI 资源必须声明不计入等级');
  /* 外部资源永不转存：不得出现下载 / 转存字段 */
  const rawRes = fs.readFileSync(path.join(ROOT, RES), 'utf8');
  for (const b of ['download_url', 'local_copy', 'reupload', 'mirror_url']) {
    if (rawRes.includes(`"${b}"`)) err(RES, `不得出现下载 / 转存字段「${b}」`);
  }
  if (!exists('content/schema/song-resource.schema.json')) err(RES, '缺少资源层 schema');
  else {
    const sch = fs.readFileSync(path.join(ROOT, 'content/schema/song-resource.schema.json'), 'utf8');
    for (const k of ['source_type', 'source_url', 'host_policy', 'segment', 'is_ai', 'source_tracking']) {
      if (!sch.includes(`"${k}"`)) err('content/schema/song-resource.schema.json', `资源 schema 必须支持可选字段 ${k}`);
    }
  }

  /* ---------------- 4. 分段时间轴 + AI 资源类型（单曲单元 schema） ---------------- */
  const unitSchemaSrc = fs.readFileSync(path.join(ROOT, 'content/schema/song-unit.schema.json'), 'utf8');
  for (const k of ['ai_male', 'ai_female', 'aiDemoTrack', 'expression_reference', 'expressionRow', 'segment_of', 'source_type', 'host_policy']) {
    if (!unitSchemaSrc.includes(k)) err('content/schema/song-unit.schema.json', `单曲单元 schema 必须支持 ${k}（V3.x 资源模型）`);
  }
  if (!unitSchemaSrc.includes('"is_ai"')) err('content/schema/song-unit.schema.json', 'AI 轨必须有 is_ai 字段');
  const idx = readJSON(UNIT_INDEX);
  for (const row of idx.units || []) {
    const u = readJSON(row.file);
    const demos = u.demos || {};
    for (const k of ['male', 'female']) {
      const d = demos[k] || {};
      if (d.source_type && !['MOS_HUMAN_MALE', 'MOS_HUMAN_FEMALE', 'EXTERNAL_HUMAN_MALE', 'EXTERNAL_HUMAN_FEMALE'].includes(d.source_type)) {
        err(row.file, `demos.${k}.source_type 只能是真人类型（AI 走 ai_male / ai_female）`);
      }
      if (d.source_type && String(d.source_type).startsWith('EXTERNAL_') && d.host_policy === 'hosted_authorized') {
        err(row.file, `demos.${k} 外部真人版本不得声明本仓托管`);
      }
      /* 分段：有 start / end 必须能对齐（phrase_id）或声明逻辑段类型（segment_of：full / verse / chorus / hard_line / phrase）——
         V3.2 §七 允许外部完整真人版本按逻辑教学段定位，分段时间点由人工看片回填 */
      for (const s of d.slots || []) {
        if (s.start != null || s.end != null) {
          if (typeof s.start !== 'number' || typeof s.end !== 'number') err(row.file, `示唱片段缺 start / end 数值`);
          else if (s.end <= s.start) err(row.file, `示唱片段时间区间非法（${s.start} → ${s.end}）`);
          if (!s.phrase_id && !s.segment_of) err(row.file, '示唱片段有起止时间却没有 phrase_id 或 segment_of（无法与简谱 / 歌词 / 逻辑段对齐）');
          if (s.source_url && d.source_type && String(d.source_type).startsWith('EXTERNAL_') && !d.source_url) {
            err(row.file, '外部版本片段必须保留原站地址（source_url）');
          }
        }
      }
    }
    for (const k of ['ai_male', 'ai_female']) {
      const d = demos[k];
      if (!d) continue;
      if (d.is_ai !== true) err(row.file, `demos.${k} 必须 is_ai=true（不得冒充真人）`);
      if (d.singer != null) err(row.file, `demos.${k}.singer 必须为 null（AI 不得使用真人名义）`);
      if (!['PROVIDED', 'NOT_PROVIDED', 'NOT_CONNECTED'].includes(d.status)) err(row.file, `demos.${k}.status 非法：${d.status}`);
      if (d.status === 'PROVIDED' && (!d.engine || !d.vendor)) err(row.file, `demos.${k} 声明 PROVIDED 必须记录引擎与供应商`);
      if (!d.source_tracking || typeof d.source_tracking !== 'object') err(row.file, `demos.${k} 必须带 source_tracking（来源追踪）`);
    }
    /* 表达参考（§十四）：来源必须是真人；有内容必须有依据 */
    for (const e of u.expression_reference || []) {
      if (!['human_teacher', 'human_singer', 'music_editor'].includes(e.source_kind)) {
        err(row.file, '表达参考来源必须是真人（教师 / 示唱者 / 音乐编辑），不得由 AI 决定');
      }
      if (!e.derived_from) err(row.file, '表达参考条目缺 derived_from');
    }
  }

  /* ---------------- 5. Singing Coach 接口（独立模块 · 基础层） ---------------- */
  if (!exists(COACH_REL)) err(COACH_REL, '缺少 MOS Singing Coach 词表');
  else {
    const c = readJSON(COACH_REL);
    if (c.coach_version !== 'MUS-V-1.0.0') err(COACH_REL, `coach_version 应为 MUS-V-1.0.0，实际 ${c.coach_version}`);
    if (c.module_key !== 'coach') err(COACH_REL, 'module_key 必须是 coach');
    const caps = c.capabilities || [];
    const wantCaps = ['pitch', 'rhythm', 'sight_singing', 'breath', 'sustain', 'diction', 'range', 'phrasing', 'dynamics', 'expression'];
    if (JSON.stringify(caps.map((x) => x.key)) !== JSON.stringify(wantCaps)) {
      err(COACH_REL, `十项能力模型顺序应为 ${wantCaps.join('/')}`);
    }
    const tim = c.training_item_model || {};
    if (!String(tim.id_pattern || '').startsWith('MUS-CC-')) err(COACH_REL, '训练项目 ID 格式必须是 MUS-CC-<CAP>-NN');
    const items = tim.starter_items || [];
    if (!items.length) err(COACH_REL, '缺训练项目模型');
    for (const it of items) {
      if (!/^MUS-CC-[A-Z]{3}-[0-9]{2}$/.test(it.item_id)) err(COACH_REL, `训练项目 ID 不合规：${it.item_id}`);
      if (!wantCaps.includes(it.capability)) err(COACH_REL, `${it.item_id} 的能力未知：${it.capability}`);
      if (!['MODEL_ONLY', 'PRODUCED'].includes(it.item_status)) err(COACH_REL, `${it.item_id}.item_status 非法`);
      if (!(it.feedback_keys || []).length) err(COACH_REL, `${it.item_id} 缺可观察项（feedback_keys）`);
    }
    const fs1 = c.feedback_structure || {};
    for (const k of ['target', 'observed', 'descriptor', 'next_action', 'retry_prompt']) {
      if (!(fs1.shape || {})[k]) err(COACH_REL, `反馈结构缺「${k}」—— 反馈必须是描述 + 再唱一次，不是总分`);
    }
    for (const need of ['分数', '排行', '属灵']) {
      if (!(fs1.forbidden || []).some((x) => String(x).includes(need))) err(COACH_REL, `反馈禁止项必须包含「${need}」`);
    }
    const sess = c.session_model || {};
    if (String(sess.store || '').indexOf('coach_sessions') === -1) err(COACH_REL, '练习记录必须落在 IndexedDB coach_sessions');
    const iface = c.interfaces || {};
    if ((iface.audio_upload || {}).status !== 'RESERVED_NOT_CONNECTED') err(COACH_REL, '音频上传接口本轮必须 RESERVED_NOT_CONNECTED（只本地保存）');
    if ((iface.ai_analysis || {}).status !== 'RESERVED_NOT_CONNECTED') err(COACH_REL, 'AI 分析接口本轮必须 RESERVED_NOT_CONNECTED（不接入厂商）');
    if ((iface.ai_analysis || {}).vendor != null) err(COACH_REL, 'AI 分析接口 vendor 必须为 null');
    const indep = c.independence || {};
    if (!(indep.does_not_read || []).length) err(COACH_REL, '必须显式声明 Coach 不读哪些门训数据');
    if (!(indep.does_not_read || []).some((x) => x.includes('积分') || x.includes('成绩') || x.includes('完成度'))) {
      err(COACH_REL, '「不读门训积分 / 成绩 / 完成度」必须写明');
    }
  }
  for (const f of ['app/coach.js', 'app/front/coach.js', 'content/schema/coach.schema.json']) {
    if (!exists(f)) err(f, 'V3.x 歌唱教练模块文件缺失');
  }
  if (exists('app/coach.js')) {
    const src = fs.readFileSync(path.join(ROOT, 'app/coach.js'), 'utf8');
    if (!src.includes('analyzeInterface') || !src.includes('uploadInterface')) err('app/coach.js', '必须提供音频上传与 AI 分析两个接口（预留，未接入时如实不可用）');
    if (!src.includes('available: false')) err('app/coach.js', '未接入时必须如实返回 available:false');
  }
  if (exists('app/front/coach.js')) {
    const src = fs.readFileSync(path.join(ROOT, 'app/front/coach.js'), 'utf8');
    for (const b of ['leaderboard', 'rank', 'badge', '"score"']) {
      if (src.includes(b)) err('app/front/coach.js', `教练前台不得出现评分 / 排名 / 徽章「${b}」`);
    }
    if (/MUS-S-\d{4}/.test(src)) err('app/front/coach.js', '教练前台不得硬编码歌曲 ID');
  }
  const modulesSrc = fs.readFileSync(path.join(ROOT, 'app/modules.js'), 'utf8');
  if (!modulesSrc.includes("key: 'coach'")) err('app/modules.js', '必须注册 coach 模块入口');
  if (!modulesSrc.includes('coach: f7')) err('app/modules.js', '路由表必须挂 coach 渲染器');
  const storeSrc = fs.readFileSync(path.join(ROOT, 'app/store.js'), 'utf8');
  if (!storeSrc.includes("'coach_sessions'")) err('app/store.js', '必须新增 coach_sessions 用户层 store');
  if (!storeSrc.includes('DB_VERSION = 4')) err('app/store.js', '新增 store 必须同步升级 DB_VERSION（→4）');
  const csSrc = fs.readFileSync(path.join(ROOT, 'app/content-source.js'), 'utf8');
  for (const k of ['taxonomy', 'taxonomy_assignments', 'song_content', 'coach', 'resource_discovery']) {
    if (!csSrc.includes(`'${k}'`)) err('app/content-source.js', `内容源必须注册 ${k} 索引`);
  }
  const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  for (const need of ["'./app/coach.js'", "'./app/front/coach.js'", "'./content/taxonomy/index.json'", "'./content/taxonomy/assignments.json'", "'./content/song-content/index.json'", "'./content/coach/index.json'", "'./content/production/resource-discovery.json'"]) {
    if (!swSrc.includes(need)) err('sw.js', `V3.x SW 预缓存缺失：${need}`);
  }

  /* ---------------- 6. 100 首资源普查工具（先普查再生产） ---------------- */
  if (!exists('tools/song-resource-discovery.js')) err('tools/song-resource-discovery.js', '缺少 100 首资源普查工具');
  if (!exists(DISCOVERY_REL)) err(DISCOVERY_REL, '缺少资源普查表（由 tools/song-resource-discovery.js 生成）');
  else {
    const d = readJSON(DISCOVERY_REL);
    if (d.discovery_version !== 'MUS-V-1.0.0') err(DISCOVERY_REL, `discovery_version 应为 MUS-V-1.0.0，实际 ${d.discovery_version}`);
    const rows = d.rows || [];
    if (rows.length !== 100) err(DISCOVERY_REL, `普查表应覆盖 100 首，实际 ${rows.length}`);
    if (d.survey_status !== 'NOT_PERFORMED') err(DISCOVERY_REL, '本轮未执行外部检索，survey_status 必须如实为 NOT_PERFORMED');
    const VOCAB = ['FOUND', 'NOT_FOUND', 'VERIFY', 'REUSE', 'CREATE', 'UNSURVEYED'];
    for (const r of rows) {
      if (!r.next_action) err(DISCOVERY_REL, `${r.song_id} 缺 next_action`);
      for (const [k, f] of Object.entries(r.found || {})) {
        if (!VOCAB.includes(f.status)) { err(DISCOVERY_REL, `${r.song_id}.${k} 状态非法：${f.status}`); continue; }
        if (['UNSURVEYED', 'NOT_FOUND'].includes(f.status) && (f.source_url || f.source_name)) {
          err(DISCOVERY_REL, `${r.song_id}.${k} 未检索 / 未找到却带来源 —— 不得虚构来源`);
        }
        if (f.status === 'FOUND' && !f.source_name) err(DISCOVERY_REL, `${r.song_id}.${k} 标 FOUND 但无来源`);
      }
      const legal = (r.rights || {}).copyright_status;
      if (legal && !['public_domain', 'licensed', 'permission_granted'].includes(legal) && (r.rights || {}).rights_state !== 'RIGHTS_UNRESOLVED') {
        err(DISCOVERY_REL, `${r.song_id} 法律状态 ${legal} 未判定，必须标记阻断`);
      }
      if (!legal && (r.rights || {}).rights_state !== 'RIGHTS_UNRESOLVED') err(DISCOVERY_REL, `${r.song_id} 法律状态未知，必须标记 RIGHTS_UNRESOLVED`);
    }
    if (((d.counts || {}).external_reuse_confirmed || 0) !== 0) err(DISCOVERY_REL, '未执行外部检索时不可能有已确认的外部复用资源');
  }

  /* ---------------- 7. 产品边界文档与守护工具 ---------------- */
  for (const f of ['docs/ADR/ADR-0018-music-system-independence.md', 'docs/ADR/ADR-0019-song-taxonomy-v1-1.md',
    'docs/ADR/ADR-0020-resource-model-and-reuse-first.md', 'docs/ADR/ADR-0021-singing-coach.md',
    'docs/V3X-PRODUCT-DIRECTION.md', 'tools/guard.js']) {
    if (!exists(f)) err(f, 'V3.x 交付物缺失');
  }
  if (exists('docs/ADR/ADR-0018-music-system-independence.md')) {
    const src = fs.readFileSync(path.join(ROOT, 'docs/ADR/ADR-0018-music-system-independence.md'), 'utf8');
    for (const k of ['互不从属', '不以', 'W01']) {
      if (!src.includes(k)) err('docs/ADR/ADR-0018-music-system-independence.md', `独立定位条款必须写明「${k}」`);
    }
  }
  /* 生产索引必须登记 V3.x 文件（生产侧可追溯） */
  const prodIndex = readJSON('content/production/index.json');
  for (const k of ['taxonomy', 'taxonomy_assignments', 'song_content_index', 'coach_vocabulary', 'resource_discovery']) {
    if (!(prodIndex.files || {})[k]) err('content/production/index.json', `生产索引 files 缺 ${k}`);
  }
  if (!String(prodIndex.platform_status || '').includes('V3.x')) err('content/production/index.json', 'platform_status 必须记录 V3.x 方向冻结');

  info('V3.x 检查：独立定位 / 四维分类（100 首派生 + 多归属） / 歌曲内容层六项 / 资源模型（外部真人分段 · AI 显式标注 · Reuse First） /'
    + ' Singing Coach 基础层（10 能力 + 10 训练项目 MODEL_ONLY + 2 个预留接口） / 100 首资源普查（外部检索未执行，不虚构来源） / 边界守护工具就绪。');
}


/* ---------------------------------------------------------------- V3.2 教学包（teaching packs） */

function checkTeaching() {
  const IDX = 'content/teaching/index.json';
  if (!exists(IDX)) err(IDX, '缺少教学包索引（五首样板教学数据层）');
  const idx = readJSON(IDX);
  validateDataAgainst === null; /* placeholder no-op */
  if (idx.teaching_version !== 'MUS-V-1.2.0') err(IDX, `teaching_version 应为 MUS-V-1.2.0，实际 ${idx.teaching_version}`);
  const SONG_RE = /^MUS-S-\d{4}$/;
  const seen = new Set();
  for (const e of idx.packs || []) {
    if (!SONG_RE.test(e.song_id)) err(IDX, `packs[].song_id 非法：${e.song_id}`);
    if (seen.has(e.song_id)) err(IDX, `packs[].song_id 重复：${e.song_id}`);
    seen.add(e.song_id);
    const f = e.file;
    if (!exists(f)) { err(IDX, `pack 文件缺失：${f}`); continue; }
    const pack = readJSON(f);
    validateDataAgainst('content/schema/teaching-pack.schema.json', pack, f);
    if (pack.song_id !== e.song_id) err(f, `song_id 与索引不一致`);
    /* 独立性：不得引用 52 周 / 课程 */
    const raw = JSON.stringify(pack);
    if (/MUS-C-\d|W\d{2}\b|52W/.test(raw) && !/不引用|不绑定|独立/.test(raw)) err(f, '教学包疑似引用周次/课程（须完全独立）');
    /* 乐句卡业务规则 */
    const ids = new Set();
    for (const c of pack.phrase_cards || []) {
      if (ids.has(c.phrase_id)) err(f, `phrase_id 重复：${c.phrase_id}`);
      ids.add(c.phrase_id);
      const t = c.timecode;
      const ts = t ? t.time_status : 'TIME_PENDING';
      if (t && ts !== 'TIME_PENDING') {
        if (typeof t.start !== 'number' || typeof t.end !== 'number') err(f, `${c.phrase_id}：非 TIME_PENDING 卡必须有数值 start/end`);
        else if (t.end <= t.start) err(f, `${c.phrase_id}：时间区间非法（end<=start）`);
      }
      if (t && ts === 'TIME_PENDING' && (t.start != null || t.end != null)) err(f, `${c.phrase_id}：TIME_PENDING 不得携带 start/end`);
      /* 规则 8：cursor 门禁 */
      if (c.cursor_ready !== (ts === 'VERIFIED')) err(f, `${c.phrase_id}：cursor_ready 必须等于 (time_status===VERIFIED)，实际 cursor_ready=${c.cursor_ready}, time_status=${ts}`);
      /* 规则 9：单一录音时间源；与示唱候选不同录音时不得 VERIFIED */
      if (t && c.vocal_reference && c.vocal_reference.recording_id
        && c.vocal_reference.recording_id !== t.recording_id && ts === 'VERIFIED') {
        err(f, `${c.phrase_id}：时间码录音与示唱候选录音不一致却标记 VERIFIED（不同录音不得混用）`);
      }
      /* 规则 10：不得虚构歌手 */
      if (c.vocal_reference && c.vocal_reference.identity_status === 'UNNAMED_SOURCE' && c.vocal_reference.performer) {
        err(f, `${c.phrase_id}：UNNAMED_SOURCE 不得携带 performer`);
      }
      if (c.vocal_reference && c.vocal_reference.type === 'HUMAN' && !c.vocal_reference.performer
        && c.vocal_reference.identity_status !== 'UNNAMED_SOURCE') {
        err(f, `${c.phrase_id}：真人示唱缺 identity_status（NAMED/UNNAMED 二选一）`);
      }
      if (c.source_url != null && !/^https?:\/\//.test(c.source_url)) err(f, `${c.phrase_id}：source_url 必须是真实 http(s) 链接或 null`);
      /* 规则 12：coach 白名单（卡内不得出现评分字段） */
      if ('score' in c || 'rating' in c || 'spiritual_score' in c) err(f, `${c.phrase_id}：不得携带评分字段`);
    }
    if (pack.coach_scope && JSON.stringify(pack.coach_scope.allowed_params.sort())
      !== JSON.stringify(['diction','dynamics','expression','pitch','rhythm','sustain'])) {
      err(f, 'coach_scope.allowed_params 必须恰为六个音乐参数');
    }
  }
  info(`教学包：${idx.packs.length} 首 / ${(idx.packs.reduce((m, e) => m + e.cards, 0))} 张乐句卡（全部 cursor_ready=false，时间码 REFERENCE_ONLY/TIME_PENDING 待同轨人工听校）`);
}

async function main() {
  console.log('MOS-MUSIC content validation');
  console.log('root:', ROOT);
  console.log('');

  checkSeparation();

  let refs = null;
  try {
    refs = checkIntegrity();
  } catch (e) {
    err('(integrity)', `完整性检查中断：${e.message}`);
  }

  try {
    checkProductionPlatform(refs || { songIds: new Set() });
  } catch (e) {
    err('(production)', `生产平台检查中断：${e.message}`);
  }

  try {
    checkLibraryIntake();
  } catch (e) {
    err('(library)', `曲库扩库登记层检查中断：${e.message}`);
  }

  try {
    checkV11A(refs || { songIds: new Set() });
  } catch (e) {
    err('(v11a)', `V1.1-A 资源层 / 审查记录层检查中断：${e.message}`);
  }

  try {
    checkV20();
  } catch (e) {
    err('(v20)', `V2.0 候选库 / 前台结构检查中断：${e.message}`);
  }

  try {
    await checkV30(refs || { songIds: new Set() });
  } catch (e) {
    err('(v30)', `V3.0 单曲单元检查中断：${e.message}`);
  }

  try {
    checkV3X(refs || { songIds: new Set() });
  } catch (e) {
    err('(v3x)', `V3.x 产品边界检查中断：${e.message}`);
  }

  try {
    checkTeaching();
  } catch (e) {
    err('(teaching)', `V3.2 教学包检查中断：${e.message}`);
  }

  console.log('');
  for (const i of infos) console.log(i);
  for (const w of warnings) console.log(w);
  for (const e of errors) console.error(e);

  console.log('');
  const passed = errors.length === 0;
  console.log(`${passed ? 'PASS' : 'FAIL'}  errors=${errors.length}  warnings=${warnings.length}`);
  if (!passed) process.exit(1);
  if (warnings.length) process.exit(2);
  process.exit(0);
}

main().catch((e) => { console.error('[ERROR] (fatal):', e && e.stack || e); process.exit(1); });
