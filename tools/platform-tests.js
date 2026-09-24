#!/usr/bin/env node
/* =========================================================
   MOS-MUSIC｜Platform Unit Tests
   ---------------------------------------------------------
   对三个核心纯逻辑模块做单元测试（不依赖项目内容，使用合成夹具）：
     app/discernment.js     歌曲辨识引擎
     app/production-rules.js 生产规则（审查门 / 复用 / 库容 / 计划器）
     app/calibration.js     校准问题与版本治理

   用法：node tools/platform-tests.js
   ========================================================= */

'use strict';

const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;
function ok(cond, label, detail) {
  if (cond) { passed += 1; console.log('  PASS  ' + label); }
  else { failed += 1; console.error('  FAIL  ' + label + (detail ? '  —— ' + detail : '')); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------------------------------------------------------------- 夹具 */

const LEXICON_RAW = {
  act_words: { words: ['恩典', '呼召', '寻找'] },
  stance_words: { words: ['信靠', '安静'] },
  disclaimer_pattern: { regex: '非经文直译|主题级' },
  narrative_pattern: { regex: '叙事|故事' },
  self_effort_words: { words: ['献上', '委身'] },
  s6_rules: {
    note: '说明字段不得被当成规则',
    object: '一位|家人',
    content: '邀请|写下|帮助',
    time: '本周|今天',
    method: '写下来|互报',
  },
  s7_rules: {
    note: '说明字段不得被当成规则',
    target: '一位',
    channel: '带|唱|解释',
    verification: '下周|互报',
  },
  risk_trigger: {
    moralism_note: '道德主义',
    abstract_s6: '更加爱主|更加委身',
    gospel_anchor_theology: '基督|救恩|恩典',
    gospel_words: ['神', '基督', '恩典'],
    s3_source_marker: '诗本|授权',
  },
  high_risk_functions: { codes: ['TR', 'CO', 'MI', 'MM'] },
};

const songBase = {
  song_id: 'MUS-S-9001',
  title: '测试曲（Test Song）',
  theology: { christology: ['基督的寻找'], soteriology: ['恩典先行'], theology: ['恩典'], ecclesiology: [], missiology: [] },
  bible: { bible_themes: ['寻找'], core_passage: 'BB-TST-1' },
  formation: { primary_function: 'EM', emotion: ['感恩'] },
  eight_dimensions: {
    biblical_truth: { score: 5, note: 'n' },
    theological_formation: { score: 4, note: 'n' },
    emotional_formation: { score: 5, note: 'n' },
    community: { score: 3, note: 'n' },
    congregational_participation: { score: 4, note: 'n' },
    generational_transmission: { score: 4, note: 'n' },
    life_practice: { score: 3, note: 'n' },
    mission_orientation: { score: 2, note: 'n' },
  },
  tier: 'A',
  review_status: 'under_review',
};

const weekBase = {
  week_id: '2099-W01',
  mos_week: 'W01',
  bible_passage_id: 'BB-TST-1',
  core_truth: { text: '神主动寻找并呼召失丧的人。', provenance: { copy_policy: 'reference_only' } },
  life_question_id: 'LQ01',
  music_unit_id: ['MM08'],
  music_function: ['TR', 'EM'],
};

const S6_GOOD = '本周向一位平时不主动接触的家人发出一次具体邀请，写下时间并互报完成情况。';
const S6_BAD = '本周更加爱主。';
const S7_GOOD = '本周带一位肢体走一遍七步法，下周互相回报各自的实践结果。';
const S7_NO_VERIFY = '用一句自己的话向一位家人解释本周的真理。';

function unitWith(s6, s7, extra = {}) {
  return {
    unit_id: 'MUS-U-2099-W01',
    core_song: 'MUS-S-9001',
    seven_step_method: {
      S1_read: { content: '读经并观察经文的四个动作与次序。' },
      S2_understand: { content: '理解恩典先行与人的回应之间的次序关系。' },
      S3_sing: { content: '唱本周歌曲（歌词见诗本或授权来源）。' },
      S4_remember: { content: '记住一句话：我原是被寻回的人。' },
      S5_feel: { content: '让真理塑造谦卑与怜悯，而不是只求情绪。' },
      S6_act: { content: s6 },
      S7_transmit: { content: s7 },
    },
    expected_formation: '出现一项可查验的具体行动，并能用七步法带人走一遍。',
    review_gate: { song_relation: 'direct_biblical_expression', theological_review: 'confirmed' },
    ...extra,
  };
}

/* ---------------------------------------------------------------- 主流程 */

async function main() {
  const E = await import(pathToFileURL(path.join(ROOT, 'app/discernment.js')).href);
  const R = await import(pathToFileURL(path.join(ROOT, 'app/production-rules.js')).href);
  const C = await import(pathToFileURL(path.join(ROOT, 'app/calibration.js')).href);

  const lex = E.compileLexicon(LEXICON_RAW);

  console.log('1) 词表编译与结构检查');
  ok(!!lex.s6Rules.object && !lex.s6Rules.note, '词表说明字段（note）未被编译为判定规则');
  ok(Object.keys(lex.s6Rules).length === 4 && Object.keys(lex.s7Rules).length === 3,
    'S6 恰为四要素、S7 恰为三要素');
  let threw = false;
  try { E.compileLexicon({}); } catch (_) { threw = true; }
  ok(threw, '词表缺失时抛错而不是静默降级');

  console.log('\n2) checkS6 / checkS7');
  ok(E.checkS6(S6_GOOD, lex).ok, 'S6 四要素齐备 → ok');
  const bad6 = E.checkS6(S6_BAD, lex);
  ok(!bad6.ok && bad6.missing.length > 0, `S6「更加爱主」→ 不成立（缺 ${bad6.missing.join(',')}）`);
  ok(E.checkS7(S7_GOOD, lex).ok && E.checkS7(S7_GOOD, lex).verification_present, 'S7 成立且含验证机制');
  const noV = E.checkS7(S7_NO_VERIFY, lex);
  ok(noV.ok && !noV.verification_present, 'S7 缺验证不判失败，但记录为改善提示');

  console.log('\n3) Song_Relation');
  ok(E.assessSongRelation({ coreTruth: weekBase.core_truth.text, song: songBase }, lex).relation === 'direct_biblical_expression',
    '恩典性行动词共现 → direct');
  const disclaimSong = { ...songBase, theological_note: '本歌属主题级回应，非经文直译。' };
  const truthNoOverlap = '主按名认识属祂的人，并在旷野中牧养他们。';
  ok(E.assessSongRelation({ coreTruth: truthNoOverlap, song: disclaimSong }, lex).relation === 'theme_response',
    '无行动词共现但含非直译声明 → theme_response（不得写成 direct）');
  ok(E.assessSongRelation({ coreTruth: truthNoOverlap, song: disclaimSong }, lex).disclaimed === true,
    '非直译声明被识别');
  ok(E.assessSongRelation({ coreTruth: truthNoOverlap, song: songBase }, lex).relation !== 'direct_biblical_expression',
    '本周核心真理未与歌曲标签共现 → 不得判 direct（防止把主题级回应升级）');
  const narrativeSong = { ...songBase, title: '叙事曲', bible: { bible_themes: [], core_passage: 'BB-TST-1' }, source: '叙事同构' };
  ok(E.assessSongRelation({ coreTruth: '毫无交集的表述。', song: narrativeSong }, lex).relation === 'narrative_response',
    '叙事同构 → narrative_response');
  const stanceSong = { ...songBase, theology: { christology: [], soteriology: [], theology: [], ecclesiology: [], missiology: [] }, title: '安静曲', bible: { bible_themes: ['信靠'], core_passage: 'BB-TST-1' }, formation: { primary_function: 'EM', emotion: ['信靠'] } };
  ok(E.assessSongRelation({ coreTruth: weekBase.core_truth.text, song: stanceSong }, lex).relation === 'theme_response',
    '仅姿态回应 → theme_response');
  const emptySong = { ...songBase, theology: { christology: [], soteriology: [], theology: [], ecclesiology: [], missiology: [] }, title: '空曲', bible: { bible_themes: [], core_passage: 'BB-TST-1' }, formation: { primary_function: 'EM', emotion: [] } };
  ok(E.assessSongRelation({ coreTruth: weekBase.core_truth.text, song: emptySong }, lex).relation === 'not_yet_assessed',
    '证据不足 → not_yet_assessed');

  console.log('\n4) 神学风险 A–F');
  const moralist = { ...songBase, theological_note: '单独使用存在道德主义风险。' };
  let risks = E.scanRisks({ week: weekBase, song: moralist, unit: unitWith(S6_GOOD, S7_GOOD), relation: { relation: 'direct_biblical_expression' }, s6: E.checkS6(S6_GOOD, lex), s7: E.checkS7(S7_GOOD, lex) }, lex);
  ok(risks.some((r) => r.code === 'A' && r.severity === 'HIGH'), '风险 A 道德主义（HIGH）');
  risks = E.scanRisks({ week: weekBase, song: songBase, unit: unitWith(S6_BAD, S7_GOOD), relation: { relation: 'direct_biblical_expression' }, s6: E.checkS6(S6_BAD, lex), s7: E.checkS7(S7_GOOD, lex) }, lex);
  ok(risks.some((r) => r.code === 'E' && r.severity === 'HIGH'), '风险 E 实践空洞化（S6 不足 → HIGH）');
  risks = E.scanRisks({ week: weekBase, song: songBase, unit: unitWith(S6_GOOD, S7_GOOD), relation: { relation: 'theme_response', stance: ['安静'] }, s6: E.checkS6(S6_GOOD, lex), s7: E.checkS7(S7_GOOD, lex) }, lex);
  ok(risks.some((r) => r.code === 'F' && r.severity === 'HIGH'), '风险 F 对齐（theme_response + 本周含 TR）');

  console.log('\n5) Decision 顺序与本周适配裁决');
  const noDims = { ...songBase, eight_dimensions: {} };
  ok(E.decideSong({ song: noDims, relation: { relation: 'direct_biblical_expression' }, s6: { ok: true }, s7: { ok: true }, risks: [] }) === 'Research',
    '资料不完整 → Research（先阻断后定级）');
  ok(E.decideSong({ song: null, relation: {}, s6: {}, s7: {}, risks: [] }) === 'No Suitable Song Found',
    '候选为空 → No Suitable Song Found');
  ok(E.decideSong({ song: songBase, relation: { relation: 'direct_biblical_expression' }, s6: { ok: true }, s7: { ok: true }, risks: [{ code: 'F', severity: 'HIGH' }] }) === 'Needs Human Review',
    'HIGH 风险 → Needs Human Review');
  ok(E.decideSong({ song: songBase, relation: { relation: 'direct_biblical_expression' }, s6: { ok: true }, s7: { ok: true }, risks: [] }) === 'Core Candidate',
    'direct + 真理维度≥4 + S6✓S7✓ → Core Candidate');
  ok(E.weekFitVerdict('Core Candidate', []).code === 'confirmed', '适配裁决 confirmed 与歌曲生命周期分层输出');
  ok(E.weekFitVerdict('Core Candidate', [{ code: 'F', severity: 'HIGH' }]).code === 'needs_human_review',
    '存在 HIGH 风险时不得判 confirmed');

  console.log('\n6) Song ≠ Complete Discipleship Unit / Tier 独立');
  const d1 = E.discernSong({ week: weekBase, song: songBase, unit: unitWith(S6_GOOD, S7_GOOD), mm: [], lex });
  ok(d1.song_is_complete_unit === false, 'song_is_complete_unit 恒为 false');
  ok(d1.tier === 'A' && d1.review_status === 'under_review' && d1.tier !== d1.review_status,
    'tier 与 review_status 分别输出且未合并');
  ok(d1.trace.length === 8, 'Decision Trace 输出 8 项');

  console.log('\n7) N2 跨周复用');
  const usage = { songs: [{ song_id: 'MUS-S-9001', used_in: [{ week: 'W01', role: 'core' }, { week: 'W04', role: 'core' }] }, { song_id: 'MUS-S-9002', used_in: [{ week: 'W02', role: 'auxiliary' }] }] };
  const r1 = R.crossWeekReuse({ songId: 'MUS-S-9001', week: 'W05', usage });
  ok(r1.reuse_status === 'used_as_core' && r1.adjacent_reuse.length === 1 && r1.review_required,
    'W05 复用 W04 主歌 → used_as_core + 相邻周重复 + 需复核');
  ok(r1.detail.includes('W01') && r1.detail.includes('W04'), '复用提示含前周信息');
  const r2 = R.crossWeekReuse({ songId: 'MUS-S-9002', week: 'W05', usage });
  ok(r2.reuse_status === 'used_as_auxiliary' && !r2.adjacent_reuse.length, '仅作为辅助歌使用 → 提示但不升级相邻');
  const r3 = R.crossWeekReuse({ songId: 'MUS-S-9003', week: 'W05', usage });
  ok(!r3.previously_used && !r3.review_required, '未使用过 → 无需复核');

  console.log('\n8) 库容告警（§九）');
  const library = { songs: [{ song_id: 'MUS-S-9001' }, { song_id: 'MUS-S-9002' }, { song_id: 'MUS-S-9003' }] };
  const cap = R.libraryCapacity({ library, usage, remainingWeeks: 5 });
  ok(cap.warning && cap.code === R.CAPACITY_CODE, '可用 1 首 < 剩余 5 周 → 告警');
  ok(eq(cap.never_used, ['MUS-S-9003']), '正确识别未使用歌曲');
  const capOk = R.libraryCapacity({ library, usage, remainingWeeks: 1 });
  ok(!capOk.warning && capOk.code === null, '容量充足 → 不告警');
  ok(typeof cap.detail === 'string' && cap.detail.includes('不会强行凑数'), '告警文案声明不强行凑数');

  console.log('\n9) N1 单元层审查门');
  const u = unitWith(S6_GOOD, S7_GOOD);
  const dOk = E.discernSong({ week: weekBase, song: songBase, unit: u, mm: [], lex });
  const g1 = R.unitReviewGate({ week: weekBase, unit: u, discernment: dOk, reuse: r3 });
  ok(g1.state === 'PASS', `完整且无待裁事项 → PASS（实际 ${g1.state}）`);
  ok(g1.song_layer_untouched === true, '声明未反写歌曲层');
  const g2 = R.unitReviewGate({ week: {}, unit: u, discernment: dOk, reuse: r3 });
  ok(g2.state === 'BLOCK' && g2.blocked.length >= 3, '上游缺失 → BLOCK');
  const dNoVerify = E.discernSong({ week: weekBase, song: songBase, unit: unitWith(S6_GOOD, S7_NO_VERIFY), mm: [], lex });
  const g3 = R.unitReviewGate({ week: weekBase, unit: unitWith(S6_GOOD, S7_NO_VERIFY), discernment: dNoVerify, reuse: r3 });
  ok(g3.state === 'REVIEW' && g3.review.some((c) => c.key === 's7_verification'), 'S7 缺验证 → REVIEW（不阻断、不伪造）');
  const g4 = R.unitReviewGate({ week: weekBase, unit: u, discernment: null, reuse: r3 });
  ok(g4.state === 'BLOCK', '无辨识结果 → BLOCK（不得据未辨识歌曲生产）');
  const g5 = R.unitReviewGate({ week: weekBase, unit: unitWith(S6_GOOD, S7_GOOD), discernment: dOk, reuse: r1 });
  ok(g5.state === 'REVIEW' && g5.review.some((c) => c.key === 'cross_week_reuse'), '跨周复用 → REVIEW，不自动否决');

  console.log('\n10) 生产计划器（单周 / 连续 / 全年）');
  const p1 = R.planProduction({ mode: R.PRODUCE_MODES.SINGLE, from: 'W05', to: 'W05', existingWeeks: ['2027-W01', '2027-W04'], library: { songs: [{ song_id: 'MUS-S-9001' }, { song_id: 'MUS-S-9002' }] }, usage });
  ok(p1.ok && p1.requested === 1 && p1.entries[0].action === 'blocked_capacity', '单周 W05 → 无未使用歌曲 → blocked_capacity');
  const p2 = R.planProduction({ mode: R.PRODUCE_MODES.RANGE, from: 'W05', to: 'W10', existingWeeks: [], library, usage });
  ok(p2.requested === 6 && p2.batch_bypasses_review === false, '连续 W05–W10 共 6 周，且批量不绕过审核');
  const p3 = R.planProduction({ mode: R.PRODUCE_MODES.YEAR, from: 'W01', to: 'W52', existingWeeks: ['2027-W01', '2027-W02', '2027-W03', '2027-W04'], library, usage });
  ok(p3.requested === 52 && p3.already_produced === 4 && p3.remaining === 48, '全年 52 周：已生产 4、剩余 48');
  ok(p3.entries.filter((e) => e.already_produced).length === 4, '已生产的周次标记 already_produced');
  const p4 = R.planProduction({ mode: R.PRODUCE_MODES.SINGLE, from: 'bad', library, usage });
  ok(p4.ok === false, '非法周次请求 → 明确报错');

  console.log('\n11) 仪表盘统计');
  const dash = R.dashboardStats({
    weeks: [{}, {}, {}, {}],
    units: [{ review_gate: { theological_review: 'confirmed' } }, { review_gate: { theological_review: 'needs_human_review' } }],
    library, usage,
    issues: [{ status: 'OPEN', severity: 'BLOCKER' }, { status: 'FIXED', severity: 'HIGH' }],
    governance: { frozen: { skill_version: '1.0.0', skill_status: 'Frozen' }, proposed: [{}], released: [{ regression: 'PASS' }] },
  });
  ok(dash.annual.weeks_indexed === 4 && dash.annual.produced === 2 && dash.annual.not_produced === 50, '年度统计正确');
  ok(dash.music.total === 3 && dash.music.used === 2 && dash.music.never_used === 1, '音乐库统计正确');
  ok(dash.skill.issues_open === 1 && dash.skill.pending_changes === 1, '技能统计正确（未结案 1 / 待批 1）');

  console.log('\n12) Calibration Issue 与版本治理');
  const bad = { issue_id: 'X', date: '2026-09-21', week: null, song: null, category: 'process', description: 'd', evidence: 'e', current_behavior: 'c', expected_behavior: 'x', severity: 'NOPE', workaround: null, proposed_change: 'p', status: 'UNKNOWN', target_version: null };
  ok(!C.validateIssue(bad).ok, '非法 problem 记录被拒绝');
  const good = { issue_id: 'CI-9999', date: '2026-09-21', week: 'W05', song: null, category: 'library_capacity', description: 'xxxxx', evidence: 'xxxxx', current_behavior: 'xxxxx', expected_behavior: 'xxxxx', severity: 'BLOCKER', workaround: null, proposed_change: 'xxxxx', status: 'OPEN', target_version: null };
  ok(C.validateIssue(good).ok, '合法问题记录通过');
  ok(C.ISSUE_FIELDS.length === 14, '字段清单为 14 项（含 resolution_layer 之外的 §十二 全部字段）');
  const sum = C.summarizeIssues([good, { ...good, issue_id: 'CI-9998', status: 'FIXED', severity: 'LOW' }]);
  ok(sum.total === 2 && sum.open === 1 && sum.fixed === 1 && sum.blockers === 1, '问题统计正确');
  ok(C.activeIssues([good, { ...good, status: 'DEFERRED' }]).length === 1, 'activeIssues 只含未结案');
  const gv = C.governanceView({ frozen: { skill_version: '1.0.0' }, proposed: [{ status: 'applied_to_frozen' }] });
  ok(gv.violations.length === 1, '治理检查能识别「直改 Frozen」违规');
  const gv2 = C.governanceView({ frozen: { skill_version: '1.0.0', skill_status: 'Frozen' }, proposed: [{ status: 'pending_human_approval' }] });
  ok(gv2.violations.length === 0 && gv2.frozen.skill_status === 'Frozen', '合规治理记录通过');

  console.log('\n12b) 库容重算的 §十 指标');
  ok(cap.used === 2 && cap.unused === 1, '§十：已用/未用计数正确');
  ok(cap.remaining_unique_capacity === cap.usable, '§十：remaining unique capacity = usable');
  ok(cap.deficit === 4, `§十：缺口 = 剩余 5 − 可用 1 = 4（实际 ${cap.deficit}）`);
  ok(Array.isArray(cap.review) && Array.isArray(cap.block) && Array.isArray(cap.evidence_insufficient),
    '§十：REVIEW / BLOCK / 证据不足均为列表，未合并为单一评分');

  console.log('\n13) 曲库 V0.5 入库（登记层与辨识层分离）');
  const LI = await import(pathToFileURL(path.join(ROOT, 'app/library-intake.js')).href);
  const rawCand = {
    candidate_no: 1, '中文歌名': '测试圣诗', 'English Title': 'Test Hymn',
    '初步主题': 'TH-03', '建议用途方向': '会众齐唱', source: '公版',
    copyright_status: 'PUBLIC_DOMAIN', author: 'A. Author',
  };
  const nc = LI.normalizeCandidate(rawCand, 0);
  ok(nc.title_zh === '测试圣诗' && nc.title_en === 'Test Hymn' && nc.copyright_status === 'PUBLIC_DOMAIN',
    '清单中文列名可被规范化（不改内容、不补内容）');
  ok(LI.validateCandidate(nc, { seenTitles: new Set() }).ok, '合法候选通过检查');
  const seen = new Set(['测试圣诗']);
  ok(!LI.validateCandidate(nc, { seenTitles: seen }).ok, '同一清单内中文歌名重复 → 拒绝');
  ok(!LI.validateCandidate({ ...nc, title_zh: null }, {}).ok, '缺中文歌名 → 拒绝（不代填）');
  ok(!LI.validateCandidate({ ...nc, copyright_status: 'MAYBE' }, {}).ok, '版权状态不在 V0.5 词表 → 拒绝');

  const pending = LI.validateCandidatesFile({ status: 'PENDING_LIST', candidates: [], expected_new: 45 });
  ok(pending.ok && pending.pending === true, '清单未提供是合法状态（PENDING_LIST），工具不代填');
  const inconsistent = LI.validateCandidatesFile({ status: 'PENDING_LIST', candidates: [nc], expected_new: 1 });
  ok(!inconsistent.ok, 'status 与 candidates 不一致 → 拒绝');

  ok(LI.nextSongId(['MUS-S-0001', 'MUS-S-0005'], 0) === 'MUS-S-0006', '新 ID 顺序追加（不复用、不打乱既有编号）');
  /* CI-0015 案 a（2026-09-21 裁决）：两侧词表维度不同 → 禁止互相映射 */
  ok(LI.legalStatusOf('PUBLIC_DOMAIN') === 'public_domain'
    && LI.legalStatusOf('LICENSED') === 'licensed', '案 a：可直接判定的法律状态给出判定值');
  ok(LI.COPYRIGHT_STATUS.includes('SOURCE_REQUIRED') && LI.COPYRIGHT_STATUS.includes('USER_PROVIDED'),
    '案 a：登记层词表保持来源与行动状态（不改写清单口径）');
  ok(LI.legalStatusOf('SOURCE_REQUIRED') === 'unknown' && LI.legalStatusOf('USER_PROVIDED') === 'unknown',
    '案 a：SOURCE_REQUIRED / USER_PROVIDED 不是法律状态 → 一律留在未判定');
  ok(LI.legalStatusOf('USER_PROVIDED') !== 'permission_granted',
    '案 a 硬约束：用户自备 ≠ 已获授权，禁止映射为 permission_granted');
  ok(LI.COPYRIGHT_MAP_PROHIBITED === true && !('COPYRIGHT_MAP' in LI),
    '案 a：机械映射表已废止，且「禁止映射」可被断言');

  const rec = LI.buildIntakeRecord(nc, { songId: 'MUS-S-0006', themeIds: ['TH-03'], createdAt: '2026-09-21T15:00:00+08:00' });
  ok(LI.RESOURCE_SLOTS.every((k) => rec.resources[k] === 'NOT_IMPORTED'),
    '资源四槽一律 NOT_IMPORTED（不抓取、不生成歌词歌谱录音）');
  ok(rec.initial_theme_id === 'TH-03' && rec.initial_theme === 'TH-03', '初步主题按 library_metadata 记录并单独存映射');
  const verdictTokens = ['Core Candidate', 'direct_biblical_expression', 'theme_response', 'Needs Human Review'];
  ok(!verdictTokens.some((t) => JSON.stringify(rec).includes(t)),
    '登记记录不含任何辨识结论字眼（清单初步主题不是辨识结果）');

  const pf = LI.preflightSongRecord(rec, {});
  ok(pf.ready === false && pf.blocked.some((b) => b.includes('经文锚点')),
    '缺经文锚点 → 拒绝写歌曲详情（宁缺勿造）');
  const pf2 = LI.preflightSongRecord(rec, { anchorPassage: 'BB-TST-9', anchorIndexSet: new Set(['BB-TST-9']), primaryFunction: 'EM' });
  ok(pf2.ready === true, '锚点与主功能齐备后前置检查通过');
  const pf3 = LI.preflightSongRecord(rec, { anchorPassage: 'BB-NEW-1', anchorIndexSet: new Set(['BB-TST-9']), primaryFunction: 'EM' });
  ok(pf3.ready === false && pf3.blocked.some((b) => b.includes('派生锚点索引')),
    '锚点未进入派生锚点索引 → 拒绝写出（案 a：锚点依据是派生索引，不再要求改上游冻结表）');

  const rep = LI.intakeReport({
    songsIndex: library,
    registry: { existing_total: 2, records: [rec] },
    candidates: { candidates: [nc] },
    usage: { songs: [{ song_id: 'MUS-S-9001', used_in: [{ week: 'W01' }], times_as_core: 1, times_as_auxiliary: 0, discernment_status: 'assessed', discernment_history: [{ decision: 'Core Candidate', song_relation: 'direct_biblical_expression' }], risk_records: [], high_risk_codes: [], review_status: 'under_review' }] },
    capacity: cap,
  });
  /* V0.5 口径：existing = Phase 2A 样本库基数（常量）/ added = 登记层 / total = 合并视图（§三）。
     detail_records / promoted_to_detail / intake_pending_promotion 三者必须自洽。 */
  ok(rep.counts.existing === LI.V05.baseline_total && rep.counts.added === 1
    && rep.counts.total === library.songs.length + 1
    && rep.counts.detail_records === library.songs.length
    && rep.counts.promoted_to_detail === 0
    && rep.counts.intake_pending_promotion === 1,
    `报告数量口径正确（样本库 ${rep.counts.existing} + 登记 ${rep.counts.added} = 合并 ${rep.counts.total}；详情层 ${rep.counts.detail_records}）`);
  ok(rep.counts.detail_records === library.songs.length && rep.counts.intake_records === 1,
    '报告显式区分详情层与登记层（两层不混算）');
  ok(rep.counts.still_pending === 44, '报告如实给出尚未到位的数量');
  ok(rep.discernment.core_candidate_runs === 1 && rep.discernment.not_yet_assessed === 0, '报告辨识统计来自实际留档');
  ok(rep.risk.NONE === 1 && rep.risk.HIGH === 0, '报告风险分布正确（无记录记 NONE）');
  ok(rep.resources.lyrics_imported === 0 && rep.resources.not_imported_slots === 4, '报告资源统计：本阶段零收录');
  ok(rep.capacity && rep.capacity.deficit === 4, '报告携带容量缺口（与仪表盘同源）');

  const histRows = LI.usageHistoryRows({ songs: [{ song_id: 'MUS-S-9001', title: 'X', used_in: [{ week: 'W04' }], times_as_core: 1, times_as_auxiliary: 0, reuse_status: 'used_once' }] });
  ok(histRows[0].used_weeks === 'W04' && LI.renderUsageHistoryTable(histRows).includes('| Song |'),
    '§九 使用历史表可生成');

  /* ---------------------------------------------------------------- V1.1-A：Song Resources 层 */
  console.log('\nV1.1-A｜Song Resources 层（app/song-resources.js）');
  {
    const SR = await import(pathToFileURL(path.join(ROOT, 'app/song-resources.js')).href);

    ok(SR.RESOURCE_TYPE_IDS.length === 6
      && SR.RESOURCE_TYPE_IDS[0] === 'LYRICS' && SR.RESOURCE_TYPE_IDS[5] === 'RECORDING',
      '六类资源槽位定义正确（LYRICS → RECORDING）');
    ok(SR.resourceTypeLabel('SCORE_SIMPLE') === '简谱' && SR.resourceTypeLabel('ACCOMPANIMENT') === '伴奏',
      '资源类型中文标签映射正确');

    const empty = { resources: [] };
    const slots = SR.resourceSlots(empty, 'MUS-S-0001');
    ok(slots.length === 6 && slots.every((s) => s.status === SR.NOT_IMPORTED && s.records.length === 0),
      '无资源记录时六个槽位全部 NOT_IMPORTED（如实显示，不虚构）');
    ok(SR.slotSummary(slots).not_imported === 6 && SR.slotSummary(slots).available === 0,
      '槽位汇总：not_imported 6 / available 0');

    const withRes = { resources: [
      { song_id: 'MUS-S-0001', resource_type: 'LYRICS', source: '某公版诗本' },
      { song_id: 'MUS-S-0002', resource_type: 'ACCOMPANIMENT', source: '某来源' },
    ] };
    const slots2 = SR.resourceSlots(withRes, 'MUS-S-0001');
    ok(slots2[0].status === SR.AVAILABLE && slots2[0].records.length === 1
      && slots2.slice(1).every((s) => s.status === SR.NOT_IMPORTED),
      '有资源的槽位 AVAILABLE，其余仍 NOT_IMPORTED（逐槽位独立）');
    ok(SR.slotSummary(slots2).available === 1 && SR.slotSummary(slots2).not_imported === 5,
      '槽位汇总随资源记录正确变化');
    ok(SR.resourceSlots(withRes, 'MUS-S-9999').every((s) => s.status === SR.NOT_IMPORTED),
      '资源按 song_id 隔离：其他歌曲不受影响');
    ok(SR.NOT_IMPORTED === 'NOT_IMPORTED' && SR.AVAILABLE === 'AVAILABLE',
      '状态词表固定：NOT_IMPORTED / AVAILABLE（歌曲详情页口径）');
  }

  /* ---------------------------------------------------------------- V3.x：资源来源类型与真人槽位 */
  console.log('\nV3.x｜资源来源类型（app/song-resources.js）');
  {
    const SR2 = await import(pathToFileURL(path.join(ROOT, 'app/song-resources.js')).href);
    ok(SR2.SOURCE_TYPE_IDS.length === 6
      && ['EXTERNAL_HUMAN_MALE', 'EXTERNAL_HUMAN_FEMALE', 'MOS_HUMAN_MALE', 'MOS_HUMAN_FEMALE', 'AI_MALE', 'AI_FEMALE']
        .every((k) => SR2.SOURCE_TYPE_IDS.includes(k)),
      '来源类型 6 项（外部真人 2 / MOS 真人 2 / AI 2）');
    ok(SR2.isAiType('AI_MALE') && SR2.isAiType('AI_FEMALE')
      && !SR2.isAiType('MOS_HUMAN_MALE') && !SR2.isAiType('EXTERNAL_HUMAN_FEMALE'),
      'AI 判定：仅 AI_MALE / AI_FEMALE 为 AI');
    ok(SR2.isHumanType('EXTERNAL_HUMAN_MALE') && SR2.isHumanType('MOS_HUMAN_FEMALE')
      && !SR2.isHumanType('AI_FEMALE'),
      '真人判定：外部 / MOS 真人为 human，AI 不是');
    ok(SR2.sourceTypeDisplay('AI_MALE').text === '男声示唱（非真人）'
      && SR2.sourceTypeDisplay('AI_MALE').ai === true,
      '前台文案：AI 必须带「（非真人）」');
    ok(SR2.sourceTypeDisplay('EXTERNAL_HUMAN_FEMALE').text === '女声示唱'
      && SR2.sourceTypeDisplay('MOS_HUMAN_MALE').text === '男声示唱',
      '前台文案：真人只写「男声/女声示唱」（来源类型记在内部）');
    ok(SR2.sourceTypeDisplay(null).text.includes('来源未标注'),
      '前台文案：来源缺失如实写「来源未标注」（不猜）');
    ok(SR2.violatesHumanSlot('AI_FEMALE') === true && SR2.violatesHumanSlot('MOS_HUMAN_FEMALE') === false,
      '硬约束：AI 资源不得进入真人槽位');
  }

  console.log(`\n${failed === 0 ? 'PLATFORM TESTS ALL PASS' : 'PLATFORM TESTS FAIL'}  ${passed} 通过 / ${failed} 失败`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('单元测试中断：', e && e.stack ? e.stack : e); process.exit(1); });
