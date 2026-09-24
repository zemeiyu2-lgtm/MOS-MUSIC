/* =========================================================
   MOS-MUSIC｜Calibration & Version Governance
   ---------------------------------------------------------
   §十二 Calibration Issue 系统 + §十三 版本治理。

   核心纪律（V1.0 最重要的一条）：
     发现问题 → **记录** → 分类 → 累积 → 定期复盘 → 形成 V1.1/V1.2 修订。
     绝对不要「发现问题 → 自动修改已 Frozen 的技能」。

   因此本模块只做三件事：校验问题记录的结构、给出统计、约束版本阶段流转；
   它**没有任何**修改 Skill 或改写历史裁决的能力。
========================================================= */

export const ISSUE_STATUS = Object.freeze([
  'OPEN', 'OBSERVED', 'REVIEWED', 'ACCEPTED', 'REJECTED', 'FIXED', 'DEFERRED',
]);

/** 未结案状态（仍在影响生产）。 */
export const OPEN_STATUSES = Object.freeze(['OPEN', 'OBSERVED', 'REVIEWED']);

export const SEVERITY = Object.freeze(['BLOCKER', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);

export const CATEGORY = Object.freeze([
  'unit_level_gate', 'cross_week_reuse', 'baseline_scope', 'song_relation',
  'theological_risk', 'practice_conversion', 'transmission_conversion',
  'library_capacity', 'evidence_sufficiency', 'two_layer_verdict', 'process',
]);

/** 问题归属层：平台层可自行修；技能层必须先取得批准（Frozen 不得擅改）。 */
export const RESOLUTION_LAYER = Object.freeze(['platform', 'skill', 'content', 'process']);

export const GOVERNANCE_STAGES = Object.freeze(['Frozen', 'Observed', 'Proposed', 'Released']);

/** §十二 规定的字段清单（顺序即报告顺序）。 */
export const ISSUE_FIELDS = Object.freeze([
  'issue_id', 'date', 'week', 'song', 'category', 'description', 'evidence',
  'current_behavior', 'expected_behavior', 'severity', 'workaround',
  'proposed_change', 'status', 'target_version',
]);

export function validateIssue(issue) {
  const errors = [];
  if (!issue || typeof issue !== 'object') return { ok: false, errors: ['问题记录不是对象'] };
  for (const f of ISSUE_FIELDS) {
    if (!(f in issue)) errors.push(`缺少字段 ${f}`);
  }
  if (issue.issue_id && !/^CI-\d{4}$/.test(issue.issue_id)) errors.push(`issue_id 应为 CI-NNNN，实际 ${issue.issue_id}`);
  if (issue.status && !ISSUE_STATUS.includes(issue.status)) errors.push(`非法 status：${issue.status}`);
  if (issue.severity && !SEVERITY.includes(issue.severity)) errors.push(`非法 severity：${issue.severity}`);
  if (issue.category && !CATEGORY.includes(issue.category)) errors.push(`非法 category：${issue.category}`);
  if (issue.resolution_layer && !RESOLUTION_LAYER.includes(issue.resolution_layer)) {
    errors.push(`非法 resolution_layer：${issue.resolution_layer}`);
  }
  return { ok: errors.length === 0, errors };
}

export function summarizeIssues(issues) {
  const list = issues || [];
  const by = (key) => list.reduce((acc, i) => { acc[i[key]] = (acc[i[key]] || 0) + 1; return acc; }, {});
  return {
    total: list.length,
    by_status: by('status'),
    by_severity: by('severity'),
    by_layer: by('resolution_layer'),
    open: list.filter((i) => OPEN_STATUSES.includes(i.status)).length,
    fixed: list.filter((i) => i.status === 'FIXED').length,
    blockers: list.filter((i) => i.severity === 'BLOCKER' && OPEN_STATUSES.includes(i.status)).length,
  };
}

/** 仍在影响生产的问题。 */
export function activeIssues(issues) {
  return (issues || []).filter((i) => OPEN_STATUSES.includes(i.status));
}

/** 阻断级未结案问题 —— 有则不得声称"生产可无阻继续"。 */
export function blockers(issues) {
  return activeIssues(issues).filter((i) => i.severity === 'BLOCKER');
}

export function byWeek(issues, week) {
  const w = String(week || '').replace(/^\d{4}-/, '');
  return (issues || []).filter((i) => String(i.week || '').replace(/^\d{4}-/, '') === w);
}

/** 版本治理视图：Frozen / Observed / Proposed / Released 四段。 */
export function governanceView(governance) {
  const g = governance || {};
  const frozen = g.frozen || {};
  const observed = g.observed || [];
  const proposed = g.proposed || [];
  const released = g.released || [];
  const invalid = [];
  for (const stage of ['Frozen', 'Observed', 'Proposed', 'Released']) {
    if (!GOVERNANCE_STAGES.includes(stage)) invalid.push(stage);
  }
  const violations = [];
  // 纪律检查：Proposed 不得直接标记为已进入 Frozen
  if (proposed.some((p) => p.status === 'applied_to_frozen')) {
    violations.push('存在把 Proposed 直接写入 Frozen 的记录 —— 违反「发现问题不自动改 Frozen」。');
  }
  return {
    valid: invalid.length === 0,
    violations,
    frozen: {
      skill_id: frozen.skill_id || 'mos-music-song-discernment',
      skill_version: frozen.skill_version || '1.0.0',
      skill_status: frozen.skill_status || 'Frozen',
      calibration: frozen.calibration || null,
      historical_decisions: frozen.historical_decisions || [],
      frozen_at: frozen.frozen_at || null,
    },
    observed,
    proposed,
    released,
    counts: {
      observed: observed.length,
      proposed: proposed.length,
      released: released.length,
    },
  };
}

export default {
  ISSUE_STATUS, OPEN_STATUSES, SEVERITY, CATEGORY, RESOLUTION_LAYER,
  GOVERNANCE_STAGES, ISSUE_FIELDS,
  validateIssue, summarizeIssues, activeIssues, blockers, byWeek, governanceView,
};
