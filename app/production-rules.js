/* =========================================================
   MOS-MUSIC｜Production Rules（生产规则 · 平台层）
   ---------------------------------------------------------
   本模块把 Phase 2B（W04）实践中暴露的三个"范围缺口"正式平台化：

     N1 → Unit-Level Review Gate（单元层审查门，见 unitReviewGate）
          歌曲层与单元层分开裁决：歌曲层回答"歌本身是否适合"，
          单元层回答"放进这一周是否仍然成立"。
          **单元层的结论不得反写成歌曲层**（`song_review_status` 一律只读）。

     N2 → Cross-Week Reuse Check（跨周复用检查，见 crossWeekReuse）
          一首歌已作为别周主歌使用时必须显式提示（前周/歌曲角色/前周主题/本周主题），
          但**不自动否决** —— 只升级为人工复核。

     N3 → Baseline Scope（回测基线作用域，见 tools/baseline.js）
          区分 Immutable Baseline 与 Production Content，
          新增正常生产内容不得被判为基线被破坏。

   另含：
     · S6／S7 结构检查（缺失 → REVIEW，绝不自动生成虚假的完整结果）
     · Library Capacity Warning（可用歌曲 < 剩余生产需求 → 告警，且不得强行凑数）
     · 生产计划器 planProduction（单周／连续／全年；默认 Human Review Gate）

   本模块为**纯逻辑**：不读写存储、不发网络请求、不依赖 DOM。
========================================================= */

import { checkS6, checkS7, DECISION } from './discernment.js';

export const PLATFORM = Object.freeze({
  id: 'mos-sermon-music-production-platform',
  name: 'MOS Sermon Music Production Platform V3.0',
  version: '3.1.0',
  gate_default: 'human_review',
});

export const GATE = Object.freeze({ PASS: 'PASS', REVIEW: 'REVIEW', BLOCK: 'BLOCK' });

export const PRODUCE_MODES = Object.freeze({
  SINGLE: 'single_week',
  RANGE: 'continuous_range',
  YEAR: 'full_year',
});

export const CAPACITY_CODE = 'MUSIC_LIBRARY_CAPACITY_WARNING';

const WEEK_RE = /^W(\d{2})$/;

export function weekNumber(week) {
  const s = String(week || '').replace(/^\d{4}-/, '');
  const m = WEEK_RE.exec(s);
  return m ? Number(m[1]) : null;
}

/* ---------------------------------------------------------------- 使用历史 */

/** 取某首歌的既有使用记录（来自 content/production/library-usage.json）。 */
export function findUsages(songId, usage) {
  const row = ((usage && usage.songs) || []).find((s) => s.song_id === songId);
  return (row && row.used_in) || [];
}

/**
 * N2｜跨周复用检查。
 * 只做提示与升级，不做否决 —— "复用是否可接受"属于人工裁决。
 */
export function crossWeekReuse({ songId, week, usage, adjacentWindow = 1 }) {
  const current = weekNumber(week);
  const usages = findUsages(songId, usage);
  const prior = usages.filter((u) => {
    const n = weekNumber(u.week);
    if (n !== null && current !== null) return n < current;
    return u.week !== week;
  });

  const asCore = prior.filter((u) => u.role === 'core');
  const asAux = prior.filter((u) => u.role === 'auxiliary');
  const adjacent = prior.filter((u) => current !== null && weekNumber(u.week) !== null
    && current - weekNumber(u.week) <= adjacentWindow);

  let status = 'never_used';
  if (asCore.length) status = 'used_as_core';
  else if (asAux.length) status = 'used_as_auxiliary';

  const parts = [];
  if (asCore.length) parts.push(`曾作为主歌使用：${asCore.map((u) => u.week).join('、')}`);
  if (asAux.length) parts.push(`曾作为辅助歌使用：${asAux.map((u) => u.week).join('、')}`);
  if (adjacent.length) parts.push(`与相邻周重复：${adjacent.map((u) => u.week).join('、')}`);

  return {
    song_id: songId,
    previously_used: prior.length > 0,
    reuse_status: status,
    as_core_in: asCore,
    as_auxiliary_in: asAux,
    adjacent_reuse: adjacent,
    review_required: asCore.length > 0 || adjacent.length > 0,
    detail: parts.length ? parts.join('；') : '本歌此前未在任何周次使用。',
  };
}

/* ---------------------------------------------------------------- 库容告警 */

/**
 * 曲库容量告警（§九）。
 * 不得为了填满 52 周而强行重复、降低标准、使用 HIGH 风险歌曲或虚构歌曲；
 * 容量不足只允许"告警 + 交人工决定是否扩库"。
 */
export function libraryCapacity({ library, usage, remainingWeeks }) {
  /* 接受两种输入：既有歌曲索引 { songs:[…] }，或 V0.5 的合并曲库视图
     { entries:[…] }（详情层 + 登记层并列）。合并只改变「有多少首」，
     不改变任何一首歌的辨识状态。 */
  const rows = (library && library.entries) || (library && library.songs) || [];
  const songs = rows.map((r) => ({ song_id: r.song_id, layer: r.layer || 'detail' }));
  const usageRows = (usage && usage.songs) || [];
  const usedSet = new Set(usageRows
    .filter((s) => (s.used_in || []).length > 0).map((s) => s.song_id));
  const assessed = usageRows.filter((s) => s.discernment_status === 'assessed');
  const highRisk = usageRows
    .filter((s) => (s.risk_records || []).some((r) => r.severity === 'HIGH'));
  const neverUsed = songs.filter((s) => !usedSet.has(s.song_id));
  const usable = neverUsed.length;
  const need = Number(remainingWeeks || 0);
  const warning = need > usable;

  /* §十 扩库后的重算口径：除容量外，另给出辨识与风险分布，
     以免把「还有多少首没用过」当成唯一指标。 */
  const notAssessed = usageRows.filter((s) => s.discernment_status !== 'assessed');
  const needsReview = usageRows.filter((s) => (s.discernment_history || [])
    .some((h) => h.decision === 'Needs Human Review' || h.week_fit === 'needs_human_review'));
  const evidenceInsufficient = usageRows.filter((s) => (s.discernment_history || [])
    .some((h) => h.decision === 'Research' || h.song_relation === 'not_yet_assessed')
    || (s.library_scope_result && s.library_scope_result.decision === 'Research'));

  return {
    code: warning ? CAPACITY_CODE : null,
    warning,
    total: songs.length,
    assessed: assessed.length,
    never_used: neverUsed.map((s) => s.song_id),
    usable,
    high_risk: highRisk.map((s) => s.song_id),
    remaining_weeks: need,
    /* --- §十 指标（新增，不改既有字段语义） --- */
    used: usedSet.size,
    unused: neverUsed.length,
    unresolved: notAssessed.length,
    not_assessed: notAssessed.map((s) => s.song_id),
    review: needsReview.map((s) => s.song_id),
    block: highRisk.map((s) => s.song_id),
    evidence_insufficient: evidenceInsufficient.map((s) => s.song_id),
    remaining_unique_capacity: usable,
    deficit: Math.max(0, need - usable),
    /* --- 分层计数（合并曲库不得抹掉「有没有歌曲详情记录」这件事） --- */
    by_layer: {
      detail: songs.filter((s) => s.layer === 'detail').length,
      intake: songs.filter((s) => s.layer === 'intake').length,
    },
    detail: warning
      ? `可用（未使用过）歌曲 ${usable} 首 < 剩余生产需求 ${need} 周 → 必须由人工决定：扩库、复用或缩减计划；平台不会强行凑数。`
      : `可用歌曲 ${usable} 首，可覆盖剩余 ${need} 周。`,
  };
}

/* ---------------------------------------------------------------- 单元层审查门 */

function ok(key, label, state, detail) { return { key, label, state, detail: detail || '' }; }

/**
 * N1｜Unit-Level Review Gate。
 * 输入：周记录（上游）、单元记录（草案或已落盘）、歌曲层辨识结果、跨周复用结果。
 * 输出：PASS / REVIEW / BLOCK + 逐项检查明细。
 * 铁律：本函数的结论只描述"这一周是否成立"，**不写回歌曲层**。
 *
 * 检查范围严格按 §六：核心真理 / 经文段落 / LQ / MM / 歌曲关系 / 歌曲功能 /
 * 神学风险 / S6 / S7 / 跨周复用，另加单元自身完整性（七步与预期形成）。
 * 曲库容量（§九）不属单元层判断，由 planProduction 与仪表盘承担。
 *
 * 语义约定（V1.0 文档化）：
 *   PASS  = 无待裁事项，可自动通过
 *   REVIEW= 有需人工确认但不阻断的事项（证据不足 / 缺验证 / 复用 / 说明缺失）
 *   BLOCK = 必须人工裁决后才可继续（上游缺失 / 歌曲不在库 / HIGH 风险未化解 /
 *           七步或预期形成缺失）。历史周次被判 BLOCK 不等于"周次不合格"，
 *           只表示"机器不可自动放行"。
 */
export function unitReviewGate({ week, unit, discernment, reuse, capacity }) {
  const checks = [];
  const w = week || {};
  const u = unit || {};

  /* --- 上游完整性（缺失即 BLOCK：不得在没有上游的情况下生产） --- */
  const ctOk = Boolean(w.core_truth && w.core_truth.text)
    && (!w.core_truth.provenance || w.core_truth.provenance.copy_policy === 'reference_only');
  checks.push(ok('upstream_core_truth', '核心真理存在且为只读引用',
    ctOk ? GATE.PASS : GATE.BLOCK,
    ctOk ? 'copy_policy=reference_only' : '核心真理缺失或 provenance 不是 reference_only'));

  const passOk = Boolean(w.bible_passage_id);
  checks.push(ok('upstream_passage', '本周经文段落已确定', passOk ? GATE.PASS : GATE.BLOCK,
    passOk ? w.bible_passage_id : '缺少 bible_passage_id'));

  const lqOk = /^LQ0[1-8]$/.test(String(w.life_question_id || ''));
  checks.push(ok('upstream_lq', 'LQ 引用既有 LQ01–LQ08', lqOk ? GATE.PASS : GATE.BLOCK,
    lqOk ? w.life_question_id : 'LQ 缺失或非法（不得新建第二套 LQ）'));

  const mmOk = Array.isArray(w.music_unit_id) && w.music_unit_id.length > 0;
  checks.push(ok('music_theme_mm', 'MM 主题已指定（Framework 母库）',
    mmOk ? GATE.PASS : GATE.REVIEW,
    mmOk ? w.music_unit_id.join('+') : '未指定 MM，须在 mm_rationale 说明理由'));

  /* --- 歌曲层结果（只读引用，不反写） --- */
  const d = discernment || null;
  if (!d) {
    checks.push(ok('song_discernment', '候选歌曲已完成辨识', GATE.BLOCK, '尚无辨识结果 → 不得据未辨识歌曲生产'));
  } else {
    checks.push(ok('song_in_library', '歌曲来自 Music Library',
      d.song_id ? GATE.PASS : GATE.BLOCK, d.candidate_song || ''));
    const relOk = ['direct_biblical_expression', 'theme_response', 'narrative_response']
      .includes(d.song_relation);
    checks.push(ok('song_relation', '歌曲与经文的关系已判定且未升级表述',
      d.song_relation === 'not_yet_assessed' ? GATE.REVIEW : (relOk ? GATE.PASS : GATE.REVIEW),
      `${d.song_relation}；单元记录为 ${u.review_gate ? u.review_gate.song_relation : '（未记录）'}`));
    const fnOk = Boolean(d.primary_function);
    checks.push(ok('song_function', '主功能已指定（不得为凑完整填满功能码）',
      fnOk ? GATE.PASS : GATE.REVIEW, d.primary_function || '缺 primary_function'));
    const high = (d.risks || []).filter((r) => r.severity === 'HIGH');
    checks.push(ok('theological_risk_high', '无阻断级（HIGH）神学风险',
      high.length ? GATE.BLOCK : GATE.PASS,
      high.length ? high.map((r) => `风险${r.code}`).join('、') : '未发现 HIGH 风险'));
  }

  /* --- S6 / S7（本模块自行复核，不依赖歌曲层结论） --- */
  const s6 = d && d.s6 ? d.s6 : null;
  checks.push(ok('s6_structure', 'S6 实践转换层四要素齐备',
    !s6 ? GATE.BLOCK : (s6.ok ? GATE.PASS : GATE.REVIEW),
    !s6 ? '无 S6 文本' : (s6.ok ? '对象/内容/时间/方式齐备' : `缺 ${(s6.missing || []).join('、')} → 不得自动生成虚假完整结果`)));

  const s7 = d && d.s7 ? d.s7 : null;
  checks.push(ok('s7_structure', 'S7 传递转换层对象与渠道成立',
    !s7 ? GATE.BLOCK : (s7.ok ? GATE.PASS : GATE.REVIEW),
    !s7 ? '无 S7 文本' : (s7.ok ? '对象/渠道成立' : '缺对象或渠道')));
  checks.push(ok('s7_verification', 'S7 含可验证机制（互报/复述/共同完成）',
    s7 && s7.verification === '✓' ? GATE.PASS : GATE.REVIEW,
    s7 && s7.verification === '✓' ? '含验证机制' : '缺验证机制 → 仅记改善提示，不阻断'));

  /* --- 跨周复用（N2） --- */
  if (reuse) {
    checks.push(ok('cross_week_reuse', '跨周复用检查',
      reuse.review_required ? GATE.REVIEW : GATE.PASS, reuse.detail));
  }

  /* --- 单元自身完整性 --- */
  const steps = u.seven_step_method || {};
  const stepKeys = ['S1_read', 'S2_understand', 'S3_sing', 'S4_remember', 'S5_feel', 'S6_act', 'S7_transmit'];
  const thin = stepKeys.filter((k) => !(steps[k] && String(steps[k].content || '').trim().length >= 15));
  checks.push(ok('unit_seven_steps', '单元七步法内容真实可执行',
    thin.length ? GATE.BLOCK : GATE.PASS,
    thin.length ? `过短或缺失：${thin.join('、')}` : '七步齐备'));
  const efOk = Boolean(u.expected_formation && String(u.expected_formation).trim().length >= 15);
  checks.push(ok('unit_expected_formation', '已回答"这首歌正在形成怎样的门徒"',
    efOk ? GATE.PASS : GATE.BLOCK, efOk ? '' : 'expected_formation 缺失'));

  const state = checks.some((c) => c.state === GATE.BLOCK) ? GATE.BLOCK
    : checks.some((c) => c.state === GATE.REVIEW) ? GATE.REVIEW : GATE.PASS;

  return {
    state,
    blocked: checks.filter((c) => c.state === GATE.BLOCK),
    review: checks.filter((c) => c.state === GATE.REVIEW),
    checks,
    song_layer_untouched: true,
    note: '单元层结论只描述本周是否成立；歌曲层的 tier / review_status 未被本门改写。',
  };
}

/* ---------------------------------------------------------------- 候选汇总 */

export function summarizeDiscernment(results) {
  const list = results || [];
  const by = {};
  for (const r of list) by[r.decision] = (by[r.decision] || 0) + 1;
  return {
    candidates: list.length,
    core_candidates: list.filter((r) => r.decision === DECISION.CORE).map((r) => r.song_id),
    recommended: list.filter((r) => r.decision === DECISION.RECOMMENDED).map((r) => r.song_id),
    needs_review: list.filter((r) => r.decision === DECISION.REVIEW).map((r) => r.song_id),
    research: list.filter((r) => r.decision === DECISION.RESEARCH).map((r) => r.song_id),
    high_risk: list.filter((r) => (r.risks || []).some((x) => x.severity === 'HIGH')).map((r) => r.song_id),
    by_decision: by,
  };
}

/* ---------------------------------------------------------------- 生产计划器 */

/**
 * 生产计划器（§八）。
 * 支持 single_week / continuous_range / full_year，但**默认 Human Review Gate**：
 * 批量选择不改变"必须逐周过门"的事实，也不允许跳过人工审核。
 *
 * 平台只产出"计划 + 门状态"，不替人写内容；上游周记录缺失的周次一律 BLOCK。
 */
export function planProduction({
  mode = PRODUCE_MODES.SINGLE, from, to, year = 2027,
  existingWeeks = [], usage = null, library = null,
}) {
  const start = weekNumber(from);
  const end = weekNumber(to || from);
  if (start === null || end === null) {
    return { ok: false, error: 'from/to 必须是 WNN 形式（例如 W05）' };
  }
  const produced = new Set(existingWeeks.map((w) => weekNumber(w)));
  const targets = [];
  for (let n = start; n <= end; n += 1) targets.push(n);

  const remaining = targets.filter((n) => !produced.has(n)).length;
  const capacity = library
    ? libraryCapacity({ library, usage, remainingWeeks: remaining })
    : null;

  const entries = targets.map((n) => {
    const week = `W${String(n).padStart(2, '0')}`;
    const isProduced = produced.has(n);
    const weeksLeftAfter = targets.filter((m) => m >= n && !produced.has(m)).length;
    const weekCapacity = library
      ? libraryCapacity({ library, usage, remainingWeeks: weeksLeftAfter })
      : null;
    let action = 'produce';
    if (isProduced) action = 'already_produced';
    else if (!weekCapacity || weekCapacity.warning) action = 'blocked_capacity';
    return {
      week,
      week_id: `${year}-${week}`,
      already_produced: isProduced,
      upstream_ready: isProduced,
      requires: isProduced ? [] : ['upstream_week_record', 'song_discernment_run'],
      action,
      gate: isProduced ? null : GATE.REVIEW,
      capacity_warning: Boolean(weekCapacity && weekCapacity.warning),
    };
  });

  return {
    ok: true,
    platform: `${PLATFORM.id}@${PLATFORM.version}`,
    mode,
    from: `W${String(start).padStart(2, '0')}`,
    to: `W${String(end).padStart(2, '0')}`,
    requested: targets.length,
    already_produced: targets.filter((n) => produced.has(n)).length,
    remaining,
    default_gate: 'human_review',
    batch_bypasses_review: false,
    capacity,
    entries,
    note: '批量选择不会绕过人工审核：每周仍需逐周通过单元层审查门，且上游周记录缺失时该周为 BLOCK。',
  };
}

/* ---------------------------------------------------------------- 仪表盘统计 */

export function dashboardStats({ weeks = [], units = [], library, usage, issues = [], governance }) {
  const total = weeks.length;
  const produced = units.length;
  const gateState = (u) => {
    const g = u.review_gate || {};
    if (g.theological_review === 'confirmed') return 'confirmed';
    if (g.theological_review === 'needs_human_review') return 'review';
    return 'pending';
  };
  const states = { confirmed: 0, review: 0, pending: 0 };
  for (const u of units) states[gateState(u)] += 1;

  const songs = (library && library.songs) || [];
  const usageRows = (usage && usage.songs) || [];
  const usedIds = new Set(usageRows.filter((s) => (s.used_in || []).length > 0).map((s) => s.song_id));

  const issueList = issues || [];
  return {
    annual: {
      year: 2027,
      weeks_planned: 52,
      weeks_indexed: total,
      produced,
      reviewed: states.confirmed,
      review: states.review,
      pending: states.pending,
      not_produced: 52 - produced,
    },
    music: {
      total: songs.length,
      assessed: usageRows.filter((s) => s.discernment_status === 'assessed').length,
      not_assessed: songs.length - usageRows.filter((s) => s.discernment_status === 'assessed').length,
      used: usedIds.size,
      never_used: songs.length - usedIds.size,
      reused: usageRows.filter((s) => (s.used_in || []).length > 1).length,
      high_risk: usageRows.filter((s) => (s.risk_records || []).some((r) => r.severity === 'HIGH')).length,
      insufficient_evidence: usageRows.filter((s) => (s.discernment_history || [])
        .some((h) => h.decision === 'Research' || h.song_relation === 'not_yet_assessed')).length,
    },
    skill: {
      id: 'mos-music-song-discernment',
      version: (governance && governance.frozen && governance.frozen.skill_version) || '1.0.0',
      status: (governance && governance.frozen && governance.frozen.skill_status) || 'Frozen',
      engine: `${PLATFORM.id}@${PLATFORM.version}`,
      regression: (governance && governance.released && governance.released[0]
        && governance.released[0].regression) || 'unknown',
      issues_total: issueList.length,
      issues_open: issueList.filter((i) => ['OPEN', 'OBSERVED', 'REVIEWED'].includes(i.status)).length,
      issues_fixed: issueList.filter((i) => i.status === 'FIXED').length,
      pending_changes: ((governance && governance.proposed) || []).length,
    },
  };
}

export default {
  PLATFORM, GATE, PRODUCE_MODES, CAPACITY_CODE,
  weekNumber, findUsages, crossWeekReuse, libraryCapacity,
  unitReviewGate, summarizeDiscernment, planProduction, dashboardStats,
};
