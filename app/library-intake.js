/* =========================================================
   MOS-MUSIC｜Music Library Intake（曲库入库 · 平台层）
   ---------------------------------------------------------
   V0.5 扩库（5 → 50）的入库逻辑。分两段，两段之间的界线是本模块的核心：

     第一段 · 入库登记（buildIntakeRecord）
       把人工提供的候选清单逐首转为「入库登记记录」：
       身份 / 来源 / 资源现状 / 清单给出的初步主题与建议用途方向 / 版权状态。
       这一段**不产生任何辨识结论**，也**不写歌曲详情记录**。

     第二段 · 歌曲详情（preflightSongRecord 只做前置检查）
       歌曲详情记录的必填字段包含「经文锚点」，而 V0.5 清单不提供经文锚点 ——
       该锚点只能由已冻结技能的 S1→S7 流程产生。因此锚点确定之前，本模块
       **拒绝**生成歌曲详情，以免「为填满必填字段而虚构经文」。

   方向铁律不变：经文 → 核心真理 → LQ → MM 主题 → 音乐功能 → 候选歌曲
   → 辨识 → 使用决定。清单里的「初步主题」只是候选线索（library_metadata），
   不是辨识结果，绝不能升级为 Core Candidate / direct / theme_response /
   PASS / BLOCK / REVIEW。

   本模块为**纯逻辑**：不读写存储、不发网络请求、不依赖 DOM，
   因此浏览器（app/）与命令行工具（tools/）共用同一份实现。
========================================================= */

export const V05 = Object.freeze({
  id: 'mos-music-library-intake',
  version: '0.5.0',
  library_version: 'MUS-V-0.5.0',
  candidates_file: 'content/library/v0.5-candidates.json',
  registry_file: 'content/library/registry.json',
  index_file: 'content/library/index.json',
  promotions_file: 'content/production/library-promotions.json',
  determinations_file: 'content/production/song-anchor-determinations.json',
  intake_schema: 'content/schema/library-intake.schema.json',
  candidates_schema: 'content/schema/library-candidates.schema.json',
  baseline_total: 5,
  target_total: 50,
  expected_new: 45,
  promotion_trial_batch: 5,
});

/** §三 导入前处理要求的字段清单（登记记录必须逐首具备）。 */
export const INTAKE_FIELDS = Object.freeze([
  'song_id', 'title_zh', 'title_en', 'alternate_titles',
  'author', 'composer', 'translator', 'source',
  'initial_theme', 'suggested_function',
  'work_status', 'copyright_status', 'lyric_status', 'score_status', 'audio_status',
  'created_at', 'library_version',
]);

/**
 * 登记层词表 = 「来源与行动状态」——这份资料从哪来、我还要做什么（V0.5 口径，与清单一致，不改写）。
 */
export const COPYRIGHT_STATUS = Object.freeze([
  'PUBLIC_DOMAIN', 'LICENSED', 'USER_PROVIDED', 'SOURCE_REQUIRED', 'UNKNOWN',
]);

/**
 * CI-0015 案 a（2026-09-21 人工裁决）：两侧词表**维度不同，禁止互相映射**。
 *
 *   登记层词表（COPYRIGHT_STATUS）= 来源与行动状态。
 *   详情层词表（LEGAL_STATUS）    = 法律状态：受不受版权保护、是否已获授权。
 *
 * `SOURCE_REQUIRED` 是**行动**（必须去取得来源），`USER_PROVIDED` 是**来源**（用户自备）；
 * 两者都不是法律状态，因此在详情层**没有也不应有**对应值。
 * 旧实现把 `USER_PROVIDED → permission_granted`、`SOURCE_REQUIRED → unknown` 当作映射，
 * 那一步本身就制造了错误等价（用户自备 ≠ 已获授权），已由本案废止。
 *
 * 因此详情层字段 `copyright_status_mapped` 的语义是**独立的法律状态判定槽**，不是映射结果：
 * 只有法律状态可直接判定时才给值，否则一律留在 `unknown`（＝未判定）。
 * 注意：该字段**名称**仍是历史遗留的 `_mapped`，与本案的「禁止映射」语义不符，
 * 因改动它须触碰冻结的 library-intake.schema.json，已另行登记为校准问题（见 CI-0021）。
 */
export const LEGAL_STATUS = Object.freeze([
  'unknown', 'public_domain', 'copyrighted', 'licensed', 'permission_granted',
]);

/** 登记层取值中**可直接判定法律状态**的两项（且仍须作品级证据支持，不得凭清单推定）。 */
export const LEGAL_STATUS_DETERMINATION = Object.freeze({
  PUBLIC_DOMAIN: 'public_domain',
  LICENSED: 'licensed',
});

/** 登记层取值中**明确不属于法律状态**的两项：永不产生详情层结论（案 a 硬约束）。 */
export const NON_LEGAL_INTAKE_STATUS = Object.freeze(['USER_PROVIDED', 'SOURCE_REQUIRED']);

/** 供测试与校验器断言「禁止映射」这条裁决没有被悄悄改回映射。 */
export const COPYRIGHT_MAP_PROHIBITED = true;

/** 资源四槽：本阶段一律不收录（§四）。 */
export const RESOURCE_SLOTS = Object.freeze(['lyrics', 'score', 'lead_vocal', 'accompaniment']);
export const RESOURCE_STATUS = 'NOT_IMPORTED';

/**
 * 资源槽与 §三 资源状态字段的对应关系。
 * §三 列 lyric_status / score_status / audio_status，§四 列 lyrics / score /
 * lead_vocal / accompaniment；本模块以 §四 的四槽为准，并记录对应关系，
 * 以免两处口径各自漂移。
 */
export const RESOURCE_SLOT_SOURCE = Object.freeze({
  lyrics: 'lyric_status',
  score: 'score_status',
  lead_vocal: 'audio_status',
  accompaniment: 'audio_status',
});

export const WORK_STATUS = Object.freeze([
  'metadata_only', 'resource_pending', 'resource_ready', 'retired',
]);
export const DEFAULT_WORK_STATUS = 'metadata_only';

/**
 * 版权边界（§六）：原始英文作品 / 中文译词 / 中文编曲 / 五线谱版本 /
 * 简谱版本 / 示唱 / 录音 / 伴奏，是**八类彼此独立**的权利对象，
 * 必须分别核验；任何一类都不允许由「作品整体公版」推定。
 */
export const RIGHTS_OBJECTS = Object.freeze([
  'original_work', 'chinese_translation', 'chinese_arrangement',
  'score_staff', 'score_numbered', 'demo_vocal', 'recording', 'accompaniment',
]);

/** 新入库歌曲的初始生命周期：尚未辨识 → 研究级 + 草稿态。 */
export const INTAKE_INITIAL_TIER = 'C';
export const INTAKE_INITIAL_REVIEW_STATUS = 'draft';

const SONG_ID_RE = /^MUS-S-\d{4}$/;
const CANDIDATE_ID_RE = /^S-\d{4}$/;
const THEME_ID_RE = /^(TH-[0-9]{2})?$/;

/* ---------------------------------------------------------------- 规范化 */

function str(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function arr(v) {
  if (!v) return [];
  const list = Array.isArray(v) ? v : [v];
  return list.map(str).filter(Boolean);
}

/** 中文歌名的比较键：去掉中英文括号内的补充说明，去空白。 */
export function titleKey(title) {
  return String(title || '').replace(/[（(].*?[）)]/g, '').replace(/\s+/g, '').trim();
}

/** 把清单里的一行规范化为候选对象（只做形状整理，不改内容、不补内容）。 */
export function normalizeCandidate(raw, index) {
  const r = raw || {};
  return {
    candidate_no: Number.isInteger(r.candidate_no) ? r.candidate_no : index + 1,
    candidate_song_id: str(r.candidate_song_id) || str(r.song_id) || null,
    title_zh: str(r.title_zh) || str(r['中文歌名']) || null,
    title_en: str(r.title_en) || str(r['English Title']) || null,
    alternate_titles: arr(r.alternate_titles),
    author: str(r.author),
    composer: str(r.composer),
    translator: str(r.translator),
    source: str(r.source),
    initial_theme: str(r.initial_theme) || str(r['初步主题']) || null,
    suggested_function: str(r.suggested_function) || str(r['建议用途方向']) || null,
    copyright_status: str(r.copyright_status) || 'SOURCE_REQUIRED',
    candidate_note: str(r.candidate_note) || str(r.notes) || null,
  };
}

/** 单条候选的结构检查。缺什么就报什么，绝不代填。 */
export function validateCandidate(c, ctx = {}) {
  const errors = [];
  const warnings = [];
  if (!c.title_zh) errors.push('缺少中文歌名');
  if (!c.title_en) warnings.push('缺少 English Title（允许为空，不代填）');
  if (!COPYRIGHT_STATUS.includes(c.copyright_status)) {
    errors.push(`版权状态「${c.copyright_status}」不在 V0.5 词表内`);
  }
  if (c.candidate_song_id && !CANDIDATE_ID_RE.test(String(c.candidate_song_id))) {
    errors.push(`候选清单 ID「${c.candidate_song_id}」不符合 S-NNNN 形态`);
  }
  if (!c.source) warnings.push('缺少来源栏位 → 记为 SOURCE_REQUIRED 并登记待补');
  if (!c.initial_theme) warnings.push('清单未给初步主题（允许为空，不得代填）');
  if (ctx.seenTitles && c.title_zh) {
    const key = titleKey(c.title_zh);
    if (ctx.seenTitles.has(key)) errors.push(`中文歌名重复：${key}`);
    ctx.seenTitles.add(key);
  }
  if (ctx.existingTitles && c.title_zh && ctx.existingTitles.has(titleKey(c.title_zh))) {
    errors.push(`与既有曲库重名（既有库不得改写，须人工裁定是否为同一首）：${c.title_zh}`);
  }
  if (ctx.seenEnTitles && c.title_en) {
    const key = String(c.title_en).replace(/[（(].*?[）)]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (ctx.seenEnTitles.has(key)) errors.push(`English Title 重复：${c.title_en}`);
    ctx.seenEnTitles.add(key);
  }
  if (ctx.seenIds && c.candidate_song_id) {
    if (ctx.seenIds.has(c.candidate_song_id)) errors.push(`清单 ID 重复：${c.candidate_song_id}`);
    ctx.seenIds.add(c.candidate_song_id);
  }
  return { ok: errors.length === 0, errors, warnings };
}

/** 清单文件整体检查（含「清单尚未提供」这一合法状态）。 */
export function validateCandidatesFile(doc) {
  const errors = [];
  const warnings = [];
  const d = doc || {};
  if (d.status === 'PENDING_LIST') {
    if ((d.candidates || []).length > 0) {
      errors.push('status=PENDING_LIST 但 candidates 非空 —— 两者必须一致');
    }
    warnings.push('清单尚未提供：candidates 为空，入库第一段无法启动。');
    return { ok: errors.length === 0, errors, warnings, count: 0, pending: true };
  }
  const list = d.candidates || [];
  if (!list.length) errors.push('status 已为收到/已入库，但 candidates 为空');
  if (Number.isInteger(d.expected_new) && d.expected_new !== list.length) {
    errors.push(`expected_new=${d.expected_new} 与 candidates 实际 ${list.length} 条不一致`);
  }
  const seenTitles = new Set();
  const seenEnTitles = new Set();
  const seenNo = new Set();
  const seenIds = new Set();
  list.forEach((raw, i) => {
    const c = normalizeCandidate(raw, i);
    const v = validateCandidate(c, { seenTitles, seenEnTitles, seenIds });
    v.errors.forEach((e) => errors.push(`#${i + 1} ${c.title_zh || '(无名)'}：${e}`));
    v.warnings.forEach((w) => warnings.push(`#${i + 1} ${c.title_zh || '(无名)'}：${w}`));
    if (seenNo.has(c.candidate_no)) errors.push(`candidate_no 重复：${c.candidate_no}`);
    seenNo.add(c.candidate_no);
  });
  const expectedTotal = (Number.isInteger(d.existing_total) ? d.existing_total : V05.baseline_total) + list.length;
  if (Number.isInteger(d.target_total) && d.target_total !== expectedTotal) {
    warnings.push(`target_total=${d.target_total} 与「既有 + 新增 = ${expectedTotal}」不一致`);
  }
  return { ok: errors.length === 0, errors, warnings, count: list.length, pending: false };
}

/* ---------------------------------------------------------------- CSV 解析 */

/**
 * 解析人工提供的候选清单 CSV（RFC4180 形态：支持引号包裹、字段内逗号与换行）。
 * 只解析，不改写、不补全、不联网。
 * 返回 { columns, rows }；rows 为「列名 → 原值」的对象数组。
 */
export function parseCandidatesCsv(text) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let cell = '';
  let row = [];
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; } else { quoted = false; }
      } else { cell += ch; }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell); cell = '';
    } else if (ch === '\n') {
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((x) => String(x).trim().length));
  if (!nonEmpty.length) return { columns: [], rows: [] };
  const columns = nonEmpty[0].map((c) => String(c).trim());
  const out = nonEmpty.slice(1).map((r) => {
    const obj = {};
    columns.forEach((name, idx) => { obj[name] = r[idx] === undefined ? null : String(r[idx]).trim(); });
    return obj;
  });
  return { columns, rows: out };
}

/**
 * CSV 行 → 候选对象。**只做字段位移**：CSV 没给的字段一律 null。
 * 特别注意：CSV 没有 author / composer / translator / 初步主题 / 建议用途方向，
 * 这里一律不补 —— 补了就是虚构。
 */
export function candidateFromCsvRow(row, index) {
  const r = row || {};
  return {
    candidate_no: index + 1,
    candidate_song_id: str(r.song_id) || null,
    title_zh: str(r.title_zh) || null,
    title_en: str(r.title_en) || null,
    alternate_titles: [],
    author: str(r.author) || null,
    composer: str(r.composer) || null,
    translator: str(r.translator) || null,
    source: str(r.source) || null,
    initial_theme: str(r.initial_theme) || str(r['初步主题']) || null,
    suggested_function: str(r.suggested_function) || str(r['建议用途方向']) || null,
    copyright_status: str(r.copyright_status) || 'SOURCE_REQUIRED',
    candidate_note: str(r.notes) || str(r.candidate_note) || null,
  };
}

/* ---------------------------------------------------------------- ID 分配 */

/** 依既有歌曲 ID 顺序分配新 ID（只追加，不复用、不打乱既有编号）。 */
export function nextSongId(existingIds, offset = 0) {
  let max = 0;
  for (const id of existingIds || []) {
    if (!SONG_ID_RE.test(String(id))) continue;
    max = Math.max(max, Number(String(id).slice(-4)));
  }
  return `MUS-S-${String(max + 1 + offset).padStart(4, '0')}`;
}

/**
 * 交叉核对：清单里的候选 ID 与工具分配的 song_id 末四位必须一致。
 * 不一致说明清单与既有库存在编号冲突，必须人工裁定，不得自动错位。
 */
export function checkIdAlignment(candidateSongId, songId) {
  if (!candidateSongId) return { ok: true, note: '清单未给候选 ID，跳过交叉核对。' };
  const a = String(candidateSongId).slice(-4);
  const b = String(songId).slice(-4);
  return a === b
    ? { ok: true, note: `清单 ID ${candidateSongId} 与分配 ${songId} 对齐。` }
    : { ok: false, note: `清单 ID ${candidateSongId} 与分配 ${songId} 不对齐（末四位 ${a} ≠ ${b}）—— 必须人工裁定。` };
}

/* ---------------------------------------------------------------- 第一段 */

/** 初步主题 → TH 编号的**暂定**映射（只有能明确对应时才给编号，否则留空）。 */
export function guessThemeId(initialTheme, themeIds) {
  const t = str(initialTheme);
  if (!t) return null;
  const m = t.match(/TH-[0-9]{2}/i);
  if (m && (!themeIds || themeIds.includes(m[0].toUpperCase()))) return m[0].toUpperCase();
  return null;
}

/**
 * 法律状态判定槽（CI-0015 案 a：**这不是映射**）。
 *
 * `SOURCE_REQUIRED` / `USER_PROVIDED` 一律返回 `'unknown'` —— 含义是**未判定**，
 * 既不表示「已查明来源」，更不表示「已获授权」。需要行动时看登记层的 `copyright_status`。
 * 只有 `PUBLIC_DOMAIN` / `LICENSED` 可给出判定值，且仍须作品级证据（案 a 与 §六 一致）。
 */
export function legalStatusOf(intakeStatus) {
  if (NON_LEGAL_INTAKE_STATUS.includes(intakeStatus)) return 'unknown';
  return LEGAL_STATUS_DETERMINATION[intakeStatus] || 'unknown';
}

/** 生成一条入库登记记录（第一段的唯一产物）。 */
export function buildIntakeRecord(candidate, ctx = {}) {
  const c = normalizeCandidate(candidate, ctx.index || 0);
  const themeIds = ctx.themeIds || null;
  const res = RESOURCE_SLOTS.reduce((acc, k) => { acc[k] = RESOURCE_STATUS; return acc; }, {});
  return {
    song_id: ctx.songId,
    candidate_no: c.candidate_no,
    candidate_song_id: c.candidate_song_id,
    title_zh: c.title_zh,
    title_en: c.title_en,
    alternate_titles: c.alternate_titles,
    author: c.author,
    composer: c.composer,
    translator: c.translator,
    source: c.source,
    initial_theme: c.initial_theme,
    initial_theme_id: guessThemeId(c.initial_theme, themeIds),
    suggested_function: c.suggested_function,
    work_status: ctx.workStatus || DEFAULT_WORK_STATUS,
    copyright_status: c.copyright_status,
    copyright_status_mapped: legalStatusOf(c.copyright_status),
    resources: res,
    /* §三 的资源状态三字段：与 §四 四槽同源，避免两处口径各自漂移。 */
    lyric_status: res.lyrics,
    score_status: res.score,
    audio_status: res.lead_vocal,
    candidate_note: c.candidate_note,
    library_version: ctx.libraryVersion || V05.library_version,
    created_at: ctx.createdAt || null,
    metadata_only_note: '本记录只承载 library_metadata（身份/来源/资源现状/初步主题/建议用途方向）。'
      + '其中初步主题与建议用途方向是候选线索，不是辨识结论；歌曲关系与使用决定由已冻结技能重新产生。',
  };
}

/* ---------------------------------------------------------------- 第二段 */

/**
 * 歌曲详情记录的前置检查（第二段）。
 * 检查的是「写得出且不用虚构」这件事本身，不评价歌曲。
 * 必填字段分三类：
 *   · 可由清单提供 → 检查清单是否给了；
 *   · 必须由技能 S1→S7 产生 → 未产出即不通过（经文锚点）；
 *   · 需要登记表配合 → 经文锚点必须已在经文登记表中登记。
 *
 * CI-0014 案 a 后：经文登记表不再位于不可变基线内（歌曲锚点由
 * content/production/song-scripture-index.json 承载）。因此这里的
 * 第二个阻断项改为「锚点未进入派生锚点索引」。
 */
export function preflightSongRecord(intake, ctx = {}) {
  const missing = [];
  const blocked = [];
  const r = intake || {};
  if (!r.song_id || !SONG_ID_RE.test(String(r.song_id))) missing.push('song_id');
  if (!r.title_zh) missing.push('title');
  if (!r.author && !r.composer) missing.push('author/composer（清单未给，须逐首核验作品级归属）');

  const themeId = r.initial_theme_id;
  if (!themeId || !THEME_ID_RE.test(String(themeId))) {
    missing.push('主题编号（清单未给初步主题时，须等辨识与人工确认）');
  }
  if (!ctx.anchorPassage) {
    blocked.push('经文锚点：歌曲详情的 bible.core_passage 为必填，而 V0.5 清单不提供；只能由已冻结技能的 S1→S7 产生，禁止代填。');
  } else if (ctx.anchorIndexSet && !ctx.anchorIndexSet.has(ctx.anchorPassage)) {
    blocked.push(`经文锚点索引：锚点「${ctx.anchorPassage}」尚未进入派生锚点索引 content/production/song-scripture-index.json。`);
  }
  if (!ctx.primaryFunction) {
    missing.push('formation.primary_function（须由辨识与人工审核确定，不由清单代填）');
  }
  return {
    song_id: r.song_id || null,
    ready: missing.length === 0 && blocked.length === 0,
    missing,
    blocked,
    note: '前置检查未通过时不得写出歌曲详情记录；宁缺勿造。',
  };
}

/* ---------------------------------------------------------------- 合并视图 */

/**
 * 50 首的合并曲库视图（§三 与原有 5 首合并）。
 *
 * 两个层不是同一个东西，合并时必须保留层标记：
 *   detail  —— content/songs/** 有歌曲详情记录（身份 + 神学 + 八维 + tier + 生命周期）
 *   intake  —— 只有 content/library/** 登记记录（身份 + 来源 + 资源现状 + 版权状态）
 *
 * 合并只做「并列」，不做「补齐」：登记层缺的字段就是 null，
 * 绝不用辨识层或常识把它填满。
 */
export function mergeLibrary({ songsIndex, registry, promotions, songFacts } = {}) {
  const detailRows = (songsIndex && songsIndex.songs) || [];
  const intakeRows = (registry && registry.records) || [];
  const detailIds = new Set(detailRows.map((s) => s.song_id));
  const intakeById = new Map(intakeRows.map((r) => [r.song_id, r]));
  const promotedIds = new Set(((promotions && promotions.promotions) || []).map((p) => p.song_id));
  const facts = songFacts || {};
  const entries = [
    ...detailRows.map((s) => ({
      song_id: s.song_id,
      title: s.title,
      layer: 'detail',
      tier: s.tier || null,
      review_status: s.review_status || null,
      file: s.file || null,
      registered: false,
      /* 升层关系：由 content/production/library-promotions.json 单独声明。
         登记层字段契约被冻结、不得附加字段，所以升层不改写登记记录，
         而是「详情层有记录 + 升层表有声明」两件事同时成立。 */
      promoted: promotedIds.has(s.song_id),
      intake_record: intakeById.get(s.song_id) || null,
      resolved: facts[s.song_id] || null,
    })),
    ...intakeRows.filter((r) => !detailIds.has(r.song_id)).map((r) => ({
      song_id: r.song_id,
      title: r.title_zh,
      title_en: r.title_en,
      layer: 'intake',
      tier: INTAKE_INITIAL_TIER,
      review_status: INTAKE_INITIAL_REVIEW_STATUS,
      file: null,
      registered: true,
      promoted: false,
      intake_record: r,
      resolved: null,
    })),
  ];
  return {
    total: entries.length,
    detail_count: detailRows.length,
    intake_count: entries.length - detailRows.length,
    promoted_count: entries.filter((e) => e.promoted).length,
    entries,
    scopes: {
      merged: entries.map((e) => e.song_id),
      detail: detailRows.map((s) => s.song_id),
      intake: intakeRows.map((r) => r.song_id),
      intake_pending: entries.filter((e) => e.layer === 'intake').map((e) => e.song_id),
    },
  };
}

/* ---------------------------------------------------------------- 升层事实投影 */

/**
 * 从歌曲详情记录投影出「库级辨识所需的最小事实集」。
 * 只投影已认定的字段，不补齐、不推断：缺什么就留 null。
 */
export function songFactsFrom(record) {
  if (!record) return null;
  return {
    author: record.author || null,
    composer: record.composer || null,
    main_theme: (record.discipleship && record.discipleship.main_theme) || null,
    core_passage: (record.bible && record.bible.core_passage) || null,
  };
}

/* ---------------------------------------------------------------- §十四 报告 */

const tally = (list, key) => list.reduce((acc, x) => {
  const k = x[key] || 'UNKNOWN';
  acc[k] = (acc[k] || 0) + 1;
  return acc;
}, {});

/**
 * Music Library V0.5 入库报告（§十四）。
 * 所有数字由实际数据统计，不做估计；缺数据即报 0 并标注待办。
 */
export function intakeReport({ songsIndex, registry, candidates, usage, capacity, promotions }) {
  const library = ((songsIndex && songsIndex.songs) || []);
  const detailCount = library.length;
  const records = (registry && registry.records) || [];
  const merged = mergeLibrary({ songsIndex, registry, promotions });
  const usageRows = (usage && usage.songs) || [];
  const candList = (candidates && candidates.candidates) || [];

  const assessed = usageRows.filter((s) => s.discernment_status === 'assessed');
  const history = usageRows.flatMap((s) => s.discernment_history || []);
  const decisions = history.map((h) => h.decision);
  const relations = history.map((h) => h.song_relation);
  const riskRecords = usageRows.flatMap((s) => s.risk_records || []);
  const severities = riskRecords.map((r) => r.severity);

  const resources = { lyrics: 0, score: 0, lead_vocal: 0, accompaniment: 0 };
  for (const r of records) {
    for (const k of RESOURCE_SLOTS) {
      if (r.resources && r.resources[k] && r.resources[k] !== RESOURCE_STATUS) resources[k] += 1;
    }
  }

  return {
    title: 'Music Library V0.5 Intake Report',
    library_version: V05.library_version,
    counts: {
      existing: V05.baseline_total,
      added: records.length,
      total: merged.total,
      detail_records: merged.detail_count,
      intake_records: records.length,
      intake_pending_promotion: merged.intake_count,
      promoted_to_detail: merged.promoted_count,
      target_total: V05.target_total,
      expected_new: V05.expected_new,
      candidates_received: candList.length,
      still_pending: Math.max(0, V05.expected_new - records.length),
    },
    discernment: {
      assessed: assessed.length,
      not_yet_assessed: usageRows.length - assessed.length,
      core_candidate_runs: decisions.filter((d) => d === 'Core Candidate').length,
      theme_response_runs: relations.filter((r) => r === 'theme_response').length,
      direct_runs: relations.filter((r) => r === 'direct_biblical_expression').length,
      review_runs: decisions.filter((d) => d === 'Needs Human Review').length,
      research_runs: decisions.filter((d) => d === 'Research').length,
      /* 库级辨识（无周次）单独计数，不与周辨识留档混算 */
      library_scope_research_runs: usageRows.filter((s) => s.library_scope_result
        && s.library_scope_result.decision === 'Research').length,
      block_songs: usageRows.filter((s) => (s.high_risk_codes || []).length > 0).length,
      /* 证据不足 = 周辨识留档为 Research / not_yet_assessed，或库级判定为 Research。
         两项都要计入：只算周辨识会把 45 首新增候选漏掉。 */
      evidence_insufficient: usageRows.filter((s) => (s.discernment_history || [])
        .some((h) => h.decision === 'Research' || h.song_relation === 'not_yet_assessed')
        || (s.library_scope_result && s.library_scope_result.decision === 'Research')).length,
    },
    risk: {
      HIGH: severities.filter((x) => x === 'HIGH').length,
      MEDIUM: severities.filter((x) => x === 'MEDIUM').length,
      LOW: severities.filter((x) => x === 'LOW').length,
      NOTE: severities.filter((x) => x === 'NOTE').length,
      NONE: usageRows.filter((s) => (s.risk_records || []).length === 0).length,
    },
    resources: {
      lyrics_imported: resources.lyrics,
      score_imported: resources.score,
      lead_vocal_imported: resources.lead_vocal,
      accompaniment_imported: resources.accompaniment,
      not_imported_slots: records.length * RESOURCE_SLOTS.length,
      source_required: records.filter((r) => r.copyright_status === 'SOURCE_REQUIRED').length,
      unknown_copyright: records.filter((r) => r.copyright_status === 'UNKNOWN').length,
    },
    usage: {
      used: usageRows.filter((s) => (s.used_in || []).length > 0).length,
      unused: usageRows.filter((s) => (s.used_in || []).length === 0).length,
      reused: usageRows.filter((s) => (s.used_in || []).length > 1).length,
    },
    lifecycle: tally(usageRows, 'review_status'),
    capacity: capacity || null,
  };
}

/* ---------------------------------------------------------------- §九 使用历史表 */

/** §九 的 Song Usage History 视图（表格行）。 */
export function usageHistoryRows(usage) {
  return ((usage && usage.songs) || []).map((s) => ({
    song_id: s.song_id,
    song: s.title,
    layer: s.layer || (s.discernment_status === 'assessed' ? 'detail' : 'intake'),
    used_weeks: (s.used_in || []).map((u) => u.week).join(', ') || '—',
    core_uses: s.times_as_core || 0,
    secondary_uses: s.times_as_auxiliary || 0,
    reuse_status: s.reuse_status || 'never_used',
  }));
}

export function renderUsageHistoryTable(rows) {
  const L = [];
  L.push('| Song | Layer | Used Weeks | Core Uses | Secondary Uses | Reuse Status |');
  L.push('| ---- | ----- | ---------- | --------- | -------------- | ------------ |');
  for (const r of rows) {
    L.push(`| ${r.song_id} ${r.song} | ${r.layer} | ${r.used_weeks} | ${r.core_uses} | ${r.secondary_uses} | ${r.reuse_status} |`);
  }
  return L.join('\n');
}

export default {
  V05, INTAKE_FIELDS, COPYRIGHT_STATUS, LEGAL_STATUS, LEGAL_STATUS_DETERMINATION,
  NON_LEGAL_INTAKE_STATUS, COPYRIGHT_MAP_PROHIBITED,
  RESOURCE_SLOTS, RESOURCE_STATUS, RESOURCE_SLOT_SOURCE, RIGHTS_OBJECTS,
  WORK_STATUS, DEFAULT_WORK_STATUS, INTAKE_INITIAL_TIER, INTAKE_INITIAL_REVIEW_STATUS,
  normalizeCandidate, validateCandidate, validateCandidatesFile,
  parseCandidatesCsv, candidateFromCsvRow,
  nextSongId, checkIdAlignment, guessThemeId, legalStatusOf, buildIntakeRecord,
  preflightSongRecord, mergeLibrary, songFactsFrom, intakeReport, usageHistoryRows, renderUsageHistoryTable,
  titleKey,
};
