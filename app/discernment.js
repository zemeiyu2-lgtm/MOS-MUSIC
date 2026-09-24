/* =========================================================
   MOS-MUSIC｜Song Discernment Engine（歌曲辨识引擎 · 平台化）
   ---------------------------------------------------------
   定位：把已经过 W01–W03 回测验证的辨识流程，从"单文件脚本"
         正式平台化为**可被应用与工具共同调用**的引擎模块。

   与已冻结技能的关系：
     · 判定规则（词表 / 正则 / 阈值 / 风险 A–F / Decision 顺序）
       与 mos-music-song-discernment@1.0.0 保持一致；
     · 本引擎**不修改**该技能，技能保持 Frozen；
     · 一致性由 tools/regression.js 逐字段比对强制（不一致即失败）。
     · 规则词表不在本文件硬编码，而由 content/production/discernment-lexicon.json
       提供 —— 遵守 §34 内容与程序分离：程序只含逻辑，词表是可审查的数据。

   方向铁律（不得颠倒）：
     经文 → 核心真理 → LQ → MM 主题 → 音乐功能 → 候选歌曲 → 辨识 → 使用决定
   禁止反向：由歌曲倒推经文／改写核心真理／改写 LQ／改写 MM。

   本模块为**纯逻辑**：不读写任何存储、不发起网络请求、不依赖 DOM。
   因此浏览器（app/）与 Node（tools/）可用同一份实现，杜绝双实现漂移。
========================================================= */

export const ENGINE = Object.freeze({
  id: 'mos-music-discernment-engine',
  version: '1.0.0',
  parity_with: 'mos-music-song-discernment@1.0.0',
  lexicon_id: 'MOS-LEXICON-DISCERNMENT',
});

/* ---------------------------------------------------------------- 枚举 */

/** Song_Relation：沿用项目 Schema 既有枚举，不新增枚举值。 */
export const RELATION = Object.freeze({
  DIRECT: 'direct_biblical_expression',
  THEME: 'theme_response',
  NARRATIVE: 'narrative_response',
  UNASSESSED: 'not_yet_assessed',
});

export const RELATION_VALUES = Object.freeze(Object.values(RELATION));

/** Decision：不等于"好歌／不好歌"。 */
export const DECISION = Object.freeze({
  CORE: 'Core Candidate',
  RECOMMENDED: 'Recommended',
  RESEARCH: 'Research',
  REVIEW: 'Needs Human Review',
  NONE: 'No Suitable Song Found',
});

/** 本周适配裁决（单元层 review_gate.theological_review 的取值口径）。 */
export const WEEK_FIT = Object.freeze({
  CONFIRMED: 'confirmed',
  REVIEW: 'needs_human_review',
  NOT_YET: 'not_yet_validated',
});

export const MUSIC_FUNCTIONS = Object.freeze(['TR', 'MM', 'EM', 'PR', 'CO', 'LI', 'MI', 'RP']);

const HIGH = 'HIGH';
const NOTE = 'NOTE';

/* ---------------------------------------------------------------- 词表编译 */

function compileMap(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = new RegExp(obj[k]);
  return out;
}

/** S6 / S7 的要素键名固定，避免词表里的说明字段被误当成判定规则。 */
export const S6_KEYS = Object.freeze(['object', 'content', 'time', 'method']);
export const S7_KEYS = Object.freeze(['target', 'channel', 'verification']);

/**
 * 把 content/production/discernment-lexicon.json 编译为可执行规则。
 * 词表缺失时抛错而不是静默降级 —— 静默降级会让辨识结果悄悄变松。
 */
export function compileLexicon(raw) {
  if (!raw || !raw.act_words || !raw.s6_rules || !raw.s7_rules) {
    throw new Error('辨识词表不完整：缺少 act_words / s6_rules / s7_rules');
  }
  return Object.freeze({
    actWords: raw.act_words.words,
    stanceWords: raw.stance_words.words,
    disclaimerRe: new RegExp(raw.disclaimer_pattern.regex),
    narrativeRe: new RegExp(raw.narrative_pattern.regex),
    selfEffortWords: raw.self_effort_words.words,
    s6Rules: compileMap(raw.s6_rules, S6_KEYS),
    s7Rules: compileMap(raw.s7_rules, S7_KEYS),
    moralismRe: new RegExp(raw.risk_trigger.moralism_note),
    abstractS6Re: new RegExp(raw.risk_trigger.abstract_s6),
    gospelAnchorRe: new RegExp(raw.risk_trigger.gospel_anchor_theology),
    gospelWords: raw.risk_trigger.gospel_words,
    s3SourceRe: new RegExp(raw.risk_trigger.s3_source_marker),
    highRiskFunctions: raw.high_risk_functions.codes,
    high: HIGH,
    note: NOTE,
  });
}

/* ---------------------------------------------------------------- 文本投影 */

/** 歌曲的"标签投影"：只取主题/神学/经文/情感标签与标题 —— 不含自定义说明。 */
export function songBlobTags(song) {
  const t = song.theology || {};
  return [
    ...(t.theology || []), ...(t.christology || []), ...(t.soteriology || []),
    ...(t.ecclesiology || []), ...(t.missiology || []),
    ...((song.bible && song.bible.bible_themes) || []),
    ...((song.formation && song.formation.emotion) || []),
    song.title || '',
  ].join(' ');
}

/** 全量投影：标签 + 人工备注 + 八维 + 来源 —— 用于风险声明类判定。 */
export function songBlobAll(song) {
  return songBlobTags(song) + ' ' + [
    song.theological_note || '',
    JSON.stringify(song.eight_dimensions || {}),
    song.source || '',
  ].join(' ');
}

/** 福音锚点：是否具备基督论／救恩论支点。 */
export function hasGospelAnchor(song, lex) {
  const t = song.theology || {};
  return (t.christology || []).length + (t.soteriology || []).length
    + (t.theology || []).filter((x) => lex.gospelAnchorRe.test(x)).length > 0;
}

/* ---------------------------------------------------------------- 判定器 */

/**
 * Song_Relation 判定。
 * 判据顺序与冻结技能一致：行动词共现 → 非直译声明 → 叙事同构 → 姿态回应 → 证据不足。
 */
export function assessSongRelation({ coreTruth, song }, lex) {
  const truth = String(coreTruth || '');
  const tags = songBlobTags(song);
  const all = songBlobAll(song);
  const overlap = lex.actWords.filter((w) => truth.includes(w) && tags.includes(w));
  const stance = lex.stanceWords.filter((w) => tags.includes(w));
  const disclaimed = lex.disclaimerRe.test(all);
  const narrative = lex.narrativeRe.test(all);

  let relation = RELATION.UNASSESSED;
  let evidence = '';
  if (overlap.length) {
    relation = RELATION.DIRECT;
    evidence = `歌曲标签与本周核心真理的恩典性行动词共现：${overlap.join('、')}——直接表达同一真理。`;
  } else if (disclaimed) {
    relation = RELATION.THEME;
    evidence = '歌曲记录明确声明为间接呼应/主题级/非经文直译，且无恩典性行动词共现。';
  } else if (narrative) {
    relation = RELATION.NARRATIVE;
    evidence = '歌曲叙述与本周经文场景同构，但无恩典性行动词共现。';
  } else if (stance.length) {
    relation = RELATION.THEME;
    evidence = `歌曲仅提供姿态类情感回应（${stance.join('、')}），未承接经文主张。`;
  } else {
    evidence = '证据不足：既无行动词共现，也无姿态词或叙事标记 → 交人工裁决。';
  }
  return { relation, evidence, overlap, stance, disclaimed };
}

/** Primary_Function：必填，取自歌曲记录，不由辨识器臆造。 */
export function assessPrimaryFunction(song) {
  return (song.formation && song.formation.primary_function) || null;
}

/** S6 实践转换层：对象／内容／时间／方式四要素。 */
export function checkS6(text, lex) {
  const t = String(text || '');
  const hit = {};
  for (const [k, re] of Object.entries(lex.s6Rules)) hit[k] = re.test(t);
  const missing = Object.entries(hit).filter(([, v]) => !v).map(([k]) => k);
  return { ok: missing.length === 0, hit, missing };
}

/** S7 传递转换层：对象／渠道／验证三要素（缺验证只记改善提示）。 */
export function checkS7(text, lex) {
  const t = String(text || '');
  const hit = {};
  for (const [k, re] of Object.entries(lex.s7Rules)) hit[k] = re.test(t);
  const missing = Object.entries(hit).filter(([, v]) => !v).map(([k]) => k);
  return { ok: hit.target && hit.channel, hit, missing, verification_present: hit.verification };
}

/**
 * 神学风险扫描（A–F）。
 * A 道德主义 / B 情绪取代真理 / C 歌曲替代释经 / D 个人经验取代福音 /
 * E 实践空洞化 / F 对齐风险（theme_response 未承接本周功能导向）。
 */
export function scanRisks({ week, song, unit, relation, s6, s7 }, lex) {
  const risks = [];
  const push = (code, message, severity = NOTE) => risks.push({ code, severity, message });
  const all = songBlobAll(song);
  const note = song.theological_note || '';

  if (lex.moralismRe.test(note)) {
    push('A', '歌曲记录已声明道德主义风险：跟随若被简化为意志奉献/个人道德努力，福音结构即被倒置。', HIGH);
  } else {
    const selfEffort = lex.selfEffortWords.filter((w) => all.includes(w));
    if (selfEffort.length && !hasGospelAnchor(song, lex)) {
      push('A', `出现自我努力语汇（${selfEffort.join('、')}）且缺乏基督论/救恩论锚点 → 道德主义风险。`, HIGH);
    }
  }

  const bt = song.eight_dimensions && song.eight_dimensions.biblical_truth
    ? song.eight_dimensions.biblical_truth.score : null;
  if (song.formation && song.formation.primary_function === 'EM' && bt !== null && bt <= 3) {
    push('B', '情感功能为主而圣经真理维度偏低 → 须防「唱得感动即已改变」的推论。');
  }

  if (unit) {
    const s3 = (unit.seven_step_method && unit.seven_step_method.S3_sing
      ? unit.seven_step_method.S3_sing.content : '') || '';
    if (s3 && !lex.s3SourceRe.test(s3)) {
      push('C', 'S3「唱」未标明歌词来源/授权出处 → 防止把歌曲当作经文本身解释。');
    }
  }

  if (!lex.gospelWords.some((w) => songBlobTags(song).includes(w))) {
    push('D', '歌曲标签缺少以神/基督/福音为中心的词汇 → 检查是否以个人经验为中心。');
  }

  if (!s6.ok) {
    push('E', `S6 缺要素（${s6.missing.join('、')}）→ S6_Insufficient：行动将退化为抽象属灵愿望。`, HIGH);
  }
  const s6txt = unit ? ((unit.seven_step_method && unit.seven_step_method.S6_act
    ? unit.seven_step_method.S6_act.content : '') || '') : '';
  if (lex.abstractS6Re.test(s6txt)) {
    push('E', 'S6 出现「更加…」式抽象表述 → S6_Insufficient。', HIGH);
  }

  const fn = (week && week.music_function) || [];
  if (relation.relation === RELATION.THEME && fn.some((f) => lex.highRiskFunctions.includes(f))) {
    push('F', `本周功能含 ${fn.filter((f) => lex.highRiskFunctions.includes(f)).join('/')}（真理/共同体/使命导向），而歌曲仅为主题级回应 → 可能以安静/情感取代经文主张，须人工复核。`, HIGH);
  }

  return risks;
}

/** 歌唱层（Song Level）使用决定。 */
export function decideSong({ song, relation, s6, s7, risks }) {
  if (!song) return DECISION.NONE;
  const ed = song.eight_dimensions || {};
  const dims = Object.values(ed);
  const incomplete = dims.length === 0 || dims.some((d) => !d || d.score === null || d.score === undefined);
  const high = risks.filter((r) => r.severity === HIGH);
  const bt = ed.biblical_truth ? ed.biblical_truth.score : null;

  if (incomplete) return DECISION.RESEARCH;
  if (high.length) return DECISION.REVIEW;
  if (relation.relation === RELATION.DIRECT && bt !== null && bt >= 4 && s6.ok && s7.ok) return DECISION.CORE;
  if ((relation.relation === RELATION.DIRECT || relation.relation === RELATION.THEME) && s6.ok && s7.ok) return DECISION.RECOMMENDED;
  return DECISION.REVIEW;
}

/** 本周适配裁决（与歌曲生命周期严格分层，不得合并输出）。 */
export function weekFitVerdict(decision, risks) {
  const high = risks.filter((r) => r.severity === HIGH);
  if (decision === DECISION.REVIEW || decision === DECISION.NONE || high.length) {
    return { code: WEEK_FIT.REVIEW, label: 'Needs Human Review' };
  }
  if (decision === DECISION.CORE || decision === DECISION.RECOMMENDED) {
    return { code: WEEK_FIT.CONFIRMED, label: 'Confirmed' };
  }
  return { code: WEEK_FIT.REVIEW, label: 'Needs Human Review' };
}

/* ---------------------------------------------------------------- 决策轨迹 */

export function buildTrace({ week, song, relation, primaryFunction, s6, s7, risks, decision }) {
  return [
    `1) 选此歌：因 ${relation.evidence}`,
    `2) 关系判定：${relation.relation}${relation.relation === RELATION.DIRECT
      ? '（与核心真理恩典性行动词共现 → 直接表达同一真理）'
      : `（${relation.disclaimed ? '记录中含非直译声明' : relation.stance.length ? '仅姿态类回应' : '无行动词共现'}）`}。`,
    `3) 主功能：${primaryFunction}（取自歌曲 formation.primary_function；周功能为 ${((week && week.music_function) || []).join('/')}）。`,
    `4) S6：${s6.ok ? '四要素齐备（Object/Content/Time/Method）' : `缺 ${s6.missing.join('、')} → S6_Insufficient`}。`,
    `5) S7：${s7.ok ? `成立${s7.verification_present ? '（含可验证机制）' : '（提示：缺互报/验证机制）'}` : `不成立（缺 ${s7.missing.join('、')}）`}。`,
    `6) 神学风险：${risks.length ? risks.map((r) => `${r.code}[${r.severity}]`).join('、') : '未发现'}。`,
    `7) Tier：${song.tier}（来自歌曲记录 tier，独立字段）。`,
    `8) Review Status：${song.review_status}（歌曲生命周期，与 Tier 独立；本周适配裁决为 ${decision}）。`,
  ];
}

/* ---------------------------------------------------------------- 主辨识流程 */

/**
 * 对单首候选歌曲执行完整辨识。
 * @param {object} input
 * @param {object} input.week     周记录（经文 / 核心真理 / LQ / MM / 功能）
 * @param {object} input.song     歌曲记录（必须来自 Music Library，不得制造）
 * @param {object} [input.unit]   单元记录（有则用于 S6/S7 与风险 C）
 * @param {Array}  [input.mm]     命中的 Framework 单元定义
 * @param {object} input.lex      已编译词表（compileLexicon 的产物）
 * @param {string} [opt.proposedS6] / [opt.proposedS7] 单元尚未落盘时的草案
 */
export function discernSong({ week, song, unit, mm, lex }, opt = {}) {
  if (!week) throw new Error('缺少周记录：辨识必须由经文/核心真理/LQ/MM 出发，不得由歌曲出发');
  if (!song) throw new Error('候选歌曲不在 Music Library —— 禁止自行制造歌曲资料');
  if (!lex) throw new Error('缺少已编译的辨识词表');

  const relation = assessSongRelation({ coreTruth: week.core_truth && week.core_truth.text, song }, lex);
  const primaryFunction = assessPrimaryFunction(song);
  const s6Text = unit
    ? (unit.seven_step_method.S6_act || {}).content
    : opt.proposedS6;
  const s7Text = unit
    ? (unit.seven_step_method.S7_transmit || {}).content
    : opt.proposedS7;
  const s6 = checkS6(s6Text, lex);
  const s7 = checkS7(s7Text, lex);
  const risks = scanRisks({ week, song, unit, relation, s6, s7 }, lex);
  const decision = decideSong({ song, relation, s6, s7, risks });
  const verdict = weekFitVerdict(decision, risks);
  const ed = song.eight_dimensions || {};
  const dimLine = (k) => (ed[k] ? `${ed[k].score}/5 — ${ed[k].note || ''}` : '未辨识');

  return {
    engine: `${ENGINE.id}@${ENGINE.version}`,
    week: week.week_id || null,
    mos_week: week.mos_week || null,
    bible_passage: week.bible_passage_id || null,
    core_truth: (week.core_truth && week.core_truth.text) || null,
    lq: week.life_question_id || null,
    mm_theme: (mm && mm.length
      ? mm.map((m) => `${m.unit_id} ${m.title}`)
      : (week.music_unit_id || [])).join(' + '),
    music_function: week.music_function || [],
    candidate_song: `${song.song_id} ${song.title}`,
    song_id: song.song_id,

    /* --- 歌曲层（Song Level）：这首歌本身是否适合 --- */
    song_relation: relation.relation,
    song_relation_evidence: relation.evidence,
    primary_function: primaryFunction,
    eight_dimensions: {
      biblical_truth: dimLine('biblical_truth'),
      theology: dimLine('theological_formation'),
      emotional_formation: dimLine('emotional_formation'),
      community: dimLine('community'),
      congregational_participation: dimLine('congregational_participation'),
      intergenerational: dimLine('generational_transmission'),
      life_practice: dimLine('life_practice'),
      mission: dimLine('mission_orientation'),
    },
    s6: {
      object: s6.hit.object ? '✓' : '✗',
      content: s6.hit.content ? '✓' : '✗',
      time: s6.hit.time ? '✓' : '✗',
      method: s6.hit.method ? '✓' : '✗',
      ok: s6.ok,
      missing: s6.missing,
      text: s6Text || null,
    },
    s7: {
      target: s7.hit.target ? '✓' : '✗',
      channel: s7.hit.channel ? '✓' : '✗',
      verification: s7.hit.verification ? '✓' : '（缺：仅记改善提示）',
      ok: s7.ok,
      text: s7Text || null,
    },
    risks,
    gospel_structure: hasGospelAnchor(song, lex)
      ? `有福音锚点（${((song.theology && song.theology.christology) || []).concat((song.theology && song.theology.soteriology) || []).join('、') || '神学标签'}）`
      : '⚠ 无基督论/救恩论锚点',
    tier: song.tier,
    review_status: song.review_status,
    song_is_complete_unit: false,
    decision,
    week_fit_verdict: verdict.label,
    week_fit_verdict_code: verdict.code,
    not_yet_validated: '真实会众使用后的反馈（只能在会众使用中验证）',
    human_review_required: decision === DECISION.REVIEW
      || risks.some((r) => r.severity === HIGH),
    trace: buildTrace({ week, song, relation, primaryFunction, s6, s7, risks, decision }),
  };
}

/** 对整库候选逐一辨识（候选范围=音乐库全量，不得缩小为"先想好的一首"）。 */
export function discernCandidates({ week, songs, unit, framework, lex }, opt = {}) {
  const mmById = new Map(((framework && framework.units) || []).map((u) => [u.unit_id, u]));
  const mm = (week.music_unit_id || []).map((id) => mmById.get(id)).filter(Boolean);
  return (songs || []).map((song) =>
    discernSong({ week, song, unit, mm, lex }, opt));
}

/** 从候选辨识结果中挑选可用歌曲（不硬选、不凑数）。 */
export function selectFromDiscernment(results) {
  const rank = { [DECISION.CORE]: 0, [DECISION.RECOMMENDED]: 1 };
  const usable = (results || []).filter((r) => rank[r.decision] !== undefined);
  usable.sort((a, b) => rank[a.decision] - rank[b.decision]
    || (a.risks.length - b.risks.length));
  return {
    core: usable[0] || null,
    auxiliary: usable.slice(1),
    no_suitable_song: usable.length === 0,
    rejected: (results || []).filter((r) => rank[r.decision] === undefined),
  };
}

/* ---------------------------------------------------------------- 库级范围 */

/**
 * 辨识范围（Scope）。这是「歌曲层 ≠ 单元层」之外的第二条分层铁律：
 *
 *   week_scope    周辨识：有周次上下文（经文/核心真理/LQ/MM/功能）→ 冻结技能的完整 S1→S7
 *   library_scope 库辨识：**无周次**，只对「不依赖周次」的歌基层字段作判定
 *
 * 库级范围为什么大部分字段不可判定（冻结技能 §三 写明「缺失输入一律：停止 →
 * 报 Needs Human Review（资料不足），不得臆测」）：
 *   · song_relation 是**周相对**字段（相对本周核心真理的恩典性行动词），无周次即无判据；
 *   · S6 / S7 属于**单元层**（必须有一周的具体行动设计），无单元即不存在；
 *   · 八维评分与风险 A–D 依赖歌曲的文本与神学标签证据，清单只给歌名时无证据可依。
 * 因此库级范围的正确输出是「证据不足 + 逐项列出缺什么」，而不是把缺证据当成低分。
 */
export const SCOPE = Object.freeze({
  WEEK: 'week_scope',
  LIBRARY: 'library_scope',
});

/**
 * 库级范围下、每首歌仍缺失的证据类别（用于逐首生成缺失清单）。
 *
 * 缺什么是**逐首变动**的，不是固定文案：歌曲升入详情层后，
 * 作品级归属 / 主题对应 / 经文依据三项若已认定即从缺失清单移出，
 * 仍未核验的缺口（中文译词版本、文本与乐谱来源、周次上下文）继续保留。
 * 这样「证据不足」随实际取得的证据收缩，而不是永远停在同一句。
 */
export function libraryScopeGaps(entry) {
  const r = (entry && entry.intake_record) || {};
  const res = (entry && entry.resolved) || null;
  const gaps = [];

  /* 作品级归属：清单不给即缺失；已升层的以详情记录的作者/作曲为准。 */
  if (!(res && (res.author || res.composer)) && !r.author && !r.composer && !r.translator) {
    gaps.push('作品级归属（作者/作曲/译词：清单未提供，须逐首核验，不得代填）');
  }
  if (r.candidate_note && /需核|待核|可能不同/.test(r.candidate_note)) {
    gaps.push(`版本核验（清单注记：「${r.candidate_note}」）`);
  }
  if (r.resources) {
    const empty = Object.keys(r.resources).filter((k) => r.resources[k] === 'NOT_IMPORTED');
    if (empty.length) gaps.push(`文本/乐谱来源（${empty.join('、')} 四槽均为 NOT_IMPORTED）`);
  }
  /* 主题对应：已升层的以详情记录的主主题为准。 */
  if (!(res && res.main_theme) && !r.initial_theme_id) {
    gaps.push('主题对应（初步主题未给或无法安全对应到 TH 编号）');
  }
  /* 经文依据：未升层的仍不得代填；已升层的由派生锚点索引承载。 */
  if (!(res && res.core_passage)) {
    gaps.push('经文依据（bible.core_passage 尚未认定；未升层的歌曲不得代填）');
  }
  gaps.push('周次上下文（未指定任何周次 → Song_Relation / S6 / S7 不可判定）');
  return gaps;
}

/**
 * 库级范围下的单首歌曲判定（歌基层）。
 * 只使用冻结技能的枚举与判定顺序，不改动任何规则，也不补造证据。
 */
export function discernLibraryEntry({ entry, lex }) {
  if (!entry) throw new Error('库级辨识需要曲库条目');
  if (!lex) throw new Error('缺少已编译的辨识词表');
  const gaps = libraryScopeGaps(entry);
  const res = (entry && entry.resolved) || null;
  const upgraded = !!(res && res.core_passage);
  const unassessed = upgraded
    ? '库级未辨识：无周次上下文与已核验文本。按冻结技能「缺失输入一律停止、不得臆测」，此处留空而不给推测分。'
    : '库级未辨识：无版本核验的文本与经文依据。按冻结技能「缺失输入一律停止、不得臆测」，此处留空而不给推测分。';
  const dim = () => ({ score: null, note: unassessed });
  const evidence = '证据不足：Song_Relation 是周相对字段（相对本周核心真理的恩典性行动词），未指定周次时无判据 → not_yet_assessed。';
  return {
    engine: `${ENGINE.id}@${ENGINE.version}`,
    scope: SCOPE.LIBRARY,
    scope_reason: upgraded
      ? '该曲已进入歌曲详情层（歌基层身份与经文锚点已认定）；库级范围仍不指定周次，因此只对不依赖周次的歌基层作判定。'
      : '清单只提供歌名与版权状态；库级范围不指定周次，因此只对不依赖周次的歌基层作判定。',
    input_layer: entry.layer,
    song_id: entry.song_id,
    candidate_song: `${entry.song_id} ${entry.title}`,
    title_zh: entry.title,
    title_en: entry.title_en || null,
    candidate_no: (entry.intake_record && entry.intake_record.candidate_no) || null,

    /* --- 歌基层：可判定的部分 --- */
    song_relation: RELATION.UNASSESSED,
    song_relation_evidence: evidence,
    primary_function: null,
    eight_dimensions: {
      biblical_truth: dim(),
      theological_formation: dim(),
      emotional_formation: dim(),
      community: dim(),
      congregational_participation: dim(),
      generational_transmission: dim(),
      life_practice: dim(),
      mission_orientation: dim(),
    },
    s6: null,
    s7: null,
    risks: [],
    risk_scan: 'not_applied',
    risk_scan_reason: '风险 A–E 的标签型判据（自我努力语汇、福音锚点、情绪功能为主）需要歌曲的神学标签与八维证据；清单无此证据时运行只会误报「以个人经验为中心」等结论，因此不作扫描。',
    gospel_structure: null,

    /* --- 两层分层的字段（不得合并） --- */
    tier: entry.tier,
    review_status: entry.review_status,
    song_is_complete_unit: false,

    /* --- 判定 --- */
    decision: DECISION.RESEARCH,
    decision_rule: '冻结技能 §十五 判定顺序：资料不完整（八维缺项/未辨识）→ Research。',
    week_fit_verdict: 'Not Yet Validated',
    week_fit_verdict_code: WEEK_FIT.NOT_YET,
    not_yet_validated: '未进入任何周次，也没有真实会众使用反馈；两者都只能在进入单元后获得。',
    human_review_required: true,

    /* --- 缺什么、补什么才能推进 --- */
    missing_evidence: gaps,
    next_steps: upgraded
      ? [
        '逐首核验中文译词版本与乐谱来源（八类权利对象分别核验）—— 这是本曲目前剩余的文本层缺口。',
        '八维辨识与 Song_Relation 必须在具备周次上下文后由完整 S1→S7 产生；本阶段一律不给推测分。',
        '人工验收本批升层结果后，才决定剩余 40 首是否沿用同一认定口径。',
      ]
      : [
        '逐首核验作品级归属与中文译词版本（八类权利对象分别核验）。',
        '按人工授权口径认定该圣诗固有的经文依据（见 docs/ADR/ADR-0013），或在进入周次后由完整 S1→S7 产生。',
        '具备经文锚点与歌基层身份之后才允许写歌曲详情记录，并重跑派生索引。',
      ],
    trace: [
      `1) 输入：${entry.song_id} ${entry.title}（${upgraded ? '歌曲详情层' : '清单登记层'}，库级范围，无周次）。`,
      `2) 关系判定：${evidence}`,
      upgraded
        ? '3) 主功能：未判定 —— primary_function 须由辨识产生；详情记录中登记的是初步映射（取自 Framework 层 MM 单元的功能亲和），不作为辨识结论。'
        : '3) 主功能：未判定 —— primary_function 取自歌曲记录的 formation.primary_function，登记层没有该字段。',
      '4) S6：不存在 —— S6 属于单元层（必须有一周的具体行动设计），当前没有单元。',
      '5) S7：不存在 —— 同上，无单元即无传递转换。',
      '6) 神学风险：未扫描 —— 标签型判据缺少证据会误报，故不作扫描（见 risk_scan_reason）。',
      `7) Tier：${entry.tier}（未经辨识即保持研究级；Tier 由辨识证据支持，不由清单推定，也不因升层而升格）。`,
      `8) Review Status：${entry.review_status}（与 Tier 独立；本首歌尚未完成完整辨识）。`,
      `9) 使用决定：${DECISION.RESEARCH}（资料不完整即 Research，不是「不好」，也不是「适合」。）`,
      '10) 停止条件：冻结技能 §十六 第 1、2 条命中（证据不足 / 上游缺失）→ 立即停止，不「想办法让它通过」。',
    ],
  };
}

/** 对整批新增候选逐一执行库级歌基层判定（候选范围 = 全部新增登记，不缩小为「先想好的一首」）。 */
export function discernLibrary({ entries, lex }) {
  return (entries || []).map((entry) => discernLibraryEntry({ entry, lex }));
}

/** 库级结果的机器可读字段清单（供工具/回归比对，避免误比实现细节）。 */
export const LIBRARY_SCOPE_FIELDS = Object.freeze([
  'scope', 'song_id', 'candidate_song', 'title_zh', 'title_en', 'candidate_no',
  'song_relation', 'song_relation_evidence', 'primary_function', 'eight_dimensions',
  's6', 's7', 'risks', 'risk_scan', 'gospel_structure',
  'tier', 'review_status', 'song_is_complete_unit',
  'decision', 'week_fit_verdict', 'week_fit_verdict_code',
  'human_review_required', 'missing_evidence',
]);

/* ---------------------------------------------------------------- 文本渲染 */

/** §十四 固定输出格式（与技能一致，便于人工与工具对读）。 */
export function renderResult(r) {
  const L = [];
  L.push('MOS-MUSIC SONG DISCERNMENT RESULT');
  L.push('');
  L.push(`Week: ${r.week}`);
  L.push(`Bible Passage: ${r.bible_passage}`);
  L.push(`Core Truth: ${r.core_truth}`);
  L.push(`LQ: ${r.lq}`);
  L.push(`MM Theme: ${r.mm_theme}`);
  L.push('');
  L.push(`Candidate Song: ${r.candidate_song}`);
  L.push('');
  L.push(`Song_Relation: ${r.song_relation}`);
  L.push(`Primary_Function: ${r.primary_function}`);
  L.push('');
  L.push('Eight-Dimension Discernment:');
  L.push(`1. Biblical Truth: ${r.eight_dimensions.biblical_truth}`);
  L.push(`2. Theology: ${r.eight_dimensions.theology}`);
  L.push(`3. Emotional Formation: ${r.eight_dimensions.emotional_formation}`);
  L.push(`4. Community: ${r.eight_dimensions.community}`);
  L.push(`5. Congregational Participation: ${r.eight_dimensions.congregational_participation}`);
  L.push(`6. Intergenerational: ${r.eight_dimensions.intergenerational}`);
  L.push(`7. Life Practice: ${r.eight_dimensions.life_practice}`);
  L.push(`8. Mission: ${r.eight_dimensions.mission}`);
  L.push('');
  L.push('S6 Practice Conversion:');
  L.push(`Object: ${r.s6.object}`);
  L.push(`Content: ${r.s6.content}`);
  L.push(`Time: ${r.s6.time}`);
  L.push(`Method: ${r.s6.method}`);
  L.push('');
  L.push(`S7 Transmission Conversion: target ${r.s7.target} / channel ${r.s7.channel} / verification ${r.s7.verification}`);
  L.push('');
  L.push(`Theological Risks: ${r.risks.length ? r.risks.map((x) => `${x.code}[${x.severity}] ${x.message}`).join(' | ') : 'none'}`);
  L.push('');
  L.push(`Gospel Structure: ${r.gospel_structure}`);
  L.push('');
  L.push(`Tier: ${r.tier}`);
  L.push('');
  L.push(`Review Status: ${r.review_status}`);
  L.push('');
  L.push(`Decision: ${r.decision}`);
  L.push('');
  L.push(`Reason: ${r.song_relation_evidence}`);
  L.push('');
  L.push(`Human Review Required: ${r.human_review_required ? 'YES' : 'NO'}`);
  L.push('');
  L.push('Song ≠ Complete Discipleship Unit: true');
  L.push(`Week Fit Verdict: ${r.week_fit_verdict}`);
  L.push(`Not Yet Validated: ${r.not_yet_validated}`);
  L.push('');
  L.push('Decision Trace:');
  r.trace.forEach((t) => L.push('- ' + t));
  return L.join('\n');
}

/** 库级范围结果的固定输出（沿用技能 §十四 的字段序，缺项一律写「未判定」而不留空）。 */
export function renderLibraryResult(r) {
  const L = [];
  L.push('MOS-MUSIC SONG DISCERNMENT RESULT（library_scope）');
  L.push('');
  L.push(`Scope: ${r.scope}`);
  L.push('Week: （未指定 —— 本阶段不进入任何周次）');
  L.push(`Candidate Song: ${r.candidate_song}`);
  L.push('');
  L.push(`Song_Relation: ${r.song_relation}`);
  L.push('Primary_Function: 未判定');
  L.push('');
  L.push('Eight-Dimension Discernment:');
  for (const [k, v] of Object.entries(r.eight_dimensions)) {
    L.push(`- ${k}: ${v.score === null ? '未辨识（不给推测分）' : v.score}`);
  }
  L.push('');
  L.push('S6 Practice Conversion: 不存在（单元层字段，当前无单元）');
  L.push('S7 Transmission Conversion: 不存在（单元层字段，当前无单元）');
  L.push(`Theological Risks: 未扫描（${r.risk_scan}）`);
  L.push('Gospel Structure: 未判定');
  L.push('');
  L.push(`Tier: ${r.tier}`);
  L.push(`Review Status: ${r.review_status}`);
  L.push(`Decision: ${r.decision}`);
  L.push(`Reason: ${r.song_relation_evidence}`);
  L.push(`Human Review Required: ${r.human_review_required ? 'YES' : 'NO'}`);
  L.push('');
  L.push('Song ≠ Complete Discipleship Unit: true');
  L.push(`Week Fit Verdict: ${r.week_fit_verdict}`);
  L.push(`Not Yet Validated: ${r.not_yet_validated}`);
  L.push('');
  L.push('Missing Evidence:');
  r.missing_evidence.forEach((m) => L.push('- ' + m));
  L.push('');
  L.push('Decision Trace:');
  r.trace.forEach((t) => L.push('- ' + t));
  return L.join('\n');
}

/** 一致性比对用的字段清单（regression 使用，避免比对实现细节）。 */
export const PARITY_FIELDS = Object.freeze([
  'week', 'mos_week', 'bible_passage', 'core_truth', 'lq', 'mm_theme',
  'music_function', 'candidate_song', 'song_relation', 'song_relation_evidence',
  'primary_function', 'eight_dimensions', 's6', 's7', 'risks', 'gospel_structure',
  'tier', 'review_status', 'song_is_complete_unit', 'decision',
  'week_fit_verdict', 'week_fit_verdict_code', 'not_yet_validated',
  'human_review_required', 'trace',
]);

export default {
  ENGINE, RELATION, DECISION, WEEK_FIT, MUSIC_FUNCTIONS, SCOPE,
  compileLexicon, discernSong, discernCandidates, selectFromDiscernment,
  assessSongRelation, assessPrimaryFunction, checkS6, checkS7, scanRisks,
  decideSong, weekFitVerdict, buildTrace, renderResult, songBlobTags, songBlobAll,
  hasGospelAnchor, PARITY_FIELDS,
  libraryScopeGaps, discernLibraryEntry, discernLibrary, renderLibraryResult, LIBRARY_SCOPE_FIELDS,
};
