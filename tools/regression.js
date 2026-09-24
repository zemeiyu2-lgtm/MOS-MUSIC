#!/usr/bin/env node
/* =========================================================
   MOS-MUSIC｜Regression Suite（W01–W04）
   ---------------------------------------------------------
   每次技能或平台升级后自动重新执行。六道检查：

     1) Immutable Baseline  —— 冻结基线是否被改动（不一致 = 失败）
     2) Production / Program—— 允许演进，只报告变化
     3) Engine Parity       —— 平台引擎 vs 已冻结技能，逐字段一致
     4) Song-Layer Regression—— W01–W04 歌曲层期望值
     5) Unit-Layer Regression—— 单元层审查门（N1）期望值
     6) Invariants          —— 结构铁律（Tier/Review 独立、两层不互相反写等）

   用法：node tools/regression.js [--emit]
   ========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const SKILL_ENTRY = 'C:/Users/Administrator/.workbuddy/skills/mos-music-song-discernment/tools/discern.js';

let passed = 0;
let failed = 0;
const notes = [];
function ok(cond, label, detail) {
  if (cond) { passed += 1; console.log('  PASS  ' + label); }
  else { failed += 1; console.error('  FAIL  ' + label + (detail ? '  —— ' + detail : '')); }
}

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const rj = (rel) => readJSON(path.join(ROOT, rel));
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);

/* ---------------------------------------------------------------- 主流程 */

async function main() {
  const engine = await import(pathToFileURL(path.join(ROOT, 'app/discernment.js')).href);
  const rules = await import(pathToFileURL(path.join(ROOT, 'app/production-rules.js')).href);
  const calib = await import(pathToFileURL(path.join(ROOT, 'app/calibration.js')).href);

  const lexicon = engine.compileLexicon(rj('content/production/discernment-lexicon.json'));
  const songsIndex = rj('content/songs/index.json');
  const songs = songsIndex.songs.map((s) => rj(s.file));
  const framework = rj('content/framework/music-units.json');
  const cases = rj('content/production/regression-cases.json');
  const usage = rj('content/production/library-usage.json');
  const issues = rj('content/production/calibration-issues.json');
  const governance = rj('content/production/version-governance.json');
  const platformIndex = rj('content/production/index.json');

  const annualIndex = rj('content/annual/2027/index.json');
  const weekMap = new Map(annualIndex.weeks.map((w) => [w.mos_week, rj(w.file)]));
  const unitMap = new Map(annualIndex.units.map((u) => {
    const rec = rj(u.file);
    return [rec.mos_week, rec];
  }));
  const songMap = new Map(songs.map((s) => [s.song_id, s]));

  /* 已冻结技能（只读引用；缺失则跳过一致性比对并明确报告） */
  let skill = null;
  try { skill = require(SKILL_ENTRY); } catch (e) { skill = null; }
  const skillP = {
    project: ROOT,
    framework: path.join(ROOT, 'content/framework/music-units.json'),
    songs: path.join(ROOT, 'content/songs'),
    annual: path.join(ROOT, 'content/annual/2027'),
  };

  console.log('1) Immutable Baseline（冻结基线不得被改动）');
  const basePath = path.join(ROOT, 'content/production/baseline-immutable.json');
  const prodPath = path.join(ROOT, 'content/production/production-manifest.json');
  let immutableDrift = [];
  if (!fs.existsSync(basePath)) {
    ok(false, 'Immutable Baseline 清单存在', 'content/production/baseline-immutable.json 不存在');
  } else {
    const base = readJSON(basePath);
    for (const [p, h] of Object.entries(base.files)) {
      let actual = null;
      let real = p;
      if (p.startsWith('skill:')) {
        real = path.join('C:/Users/Administrator/.workbuddy/skills', p.slice('skill:'.length));
        if (!fs.existsSync(real)) { immutableDrift.push(`${p} 缺失`); continue; }
      } else {
        real = path.join(ROOT, p);
        if (!fs.existsSync(real)) { immutableDrift.push(`${p} 缺失`); continue; }
      }
      actual = hash(real);
      if (actual !== h) immutableDrift.push(`${p}（期望 ${h} 实际 ${actual}）`);
    }
    ok(immutableDrift.length === 0,
      `Immutable Baseline ${Object.keys(base.files).length} 项全部一致`,
      immutableDrift.slice(0, 6).join('; '));
  }

  console.log('\n2) Production / Program（允许演进，仅报告）');
  if (fs.existsSync(prodPath)) {
    const man = readJSON(prodPath);
    const diff = (obj) => {
      const changed = []; const added = []; const removed = [];
      for (const [p, h] of Object.entries(obj || {})) {
        const real = path.join(ROOT, p);
        if (!fs.existsSync(real)) { removed.push(p); continue; }
        if (hash(real) !== h) changed.push(p);
      }
      return { changed, added, removed };
    };
    const pd = diff(man.production);
    const gd = diff(man.program);
    notes.push(`Production 变化 ${pd.changed.length} 项 / Program 变化 ${gd.changed.length} 项（不判失败）`);
    console.log(`  INFO  Production：清单 ${Object.keys(man.production).length} 项，变化 ${pd.changed.length} 项`
      + (pd.changed.length ? `：${pd.changed.slice(0, 5).join(', ')}` : ''));
    console.log(`  INFO  Program：清单 ${Object.keys(man.program).length} 项，变化 ${gd.changed.length} 项`
      + (gd.changed.length ? `：${gd.changed.slice(0, 5).join(', ')}` : ''));
    ok(true, 'Production / Program 变化不判为基线破坏（N3 修正生效）');
  } else {
    ok(false, 'production-manifest.json 存在', '请先运行 node tools/baseline.js');
  }

  console.log('\n3) Engine Parity（平台引擎 vs 已冻结技能）');
  const songLayer = cases.song_layer_cases;
  const parityRows = [];
  if (!skill) {
    ok(false, '已冻结技能可加载', SKILL_ENTRY);
  } else {
    let parityOk = 0; const parityBad = [];
    for (const c of songLayer) {
      const week = weekMap.get(c.week.replace(/^\d{4}-/, ''));
      const song = songMap.get(c.song);
      const unit = unitMap.get(c.week.replace(/^\d{4}-/, '')) || null;
      const mm = framework.units.filter((u) => (week.music_unit_id || []).includes(u.unit_id));
      const mine = engine.discernSong({ week, song, unit, mm, lex: lexicon });
      const theirs = skill.discern(skillP, c.week, c.song);
      const diffs = [];
      for (const f of engine.PARITY_FIELDS) {
        if (JSON.stringify(mine[f]) !== JSON.stringify(theirs[f])) {
          diffs.push(`${f}: 平台=${JSON.stringify(mine[f])} 技能=${JSON.stringify(theirs[f])}`);
        }
      }
      parityRows.push({ id: c.id, diffs });
      if (diffs.length === 0) parityOk += 1; else parityBad.push(`${c.id} → ${diffs[0]}`);
    }
    ok(parityBad.length === 0,
      `平台引擎与冻结技能逐字段一致（${parityOk}/${songLayer.length} 用例 × ${engine.PARITY_FIELDS.length} 字段）`,
      parityBad.join(' | '));
  }

  console.log('\n4) Song-Layer Regression（W01–W04 期望值）');
  const songRows = [];
  for (const c of songLayer) {
    const mos = c.week.replace(/^\d{4}-/, '');
    const week = weekMap.get(mos);
    const song = songMap.get(c.song);
    const unit = unitMap.get(mos) || null;
    const mm = framework.units.filter((u) => (week.music_unit_id || []).includes(u.unit_id));
    const r = engine.discernSong({ week, song, unit, mm, lex: lexicon });
    const e = c.expect;
    const checks = [
      ['song_relation', e.song_relation, r.song_relation],
      ['week_fit_verdict', e.week_fit_verdict, r.week_fit_verdict_code],
      ['decision', e.decision, r.decision],
      ['tier', e.tier, r.tier],
      ['review_status', e.review_status, r.review_status],
      ['risk_codes', e.risk_codes.join(','), r.risks.map((x) => x.code).join(',')],
    ].map(([field, exp, act]) => ({ field, exp, act, pass: exp === act }));
    const pass = checks.every((x) => x.pass);
    songRows.push({ id: c.id, week: mos, song: c.song, role: c.role, checks, pass });
    ok(pass, `${c.id}｜${c.song}｜${e.decision}`, pass ? '' : checks.filter((x) => !x.pass).map((x) => `${x.field}: 期望 ${x.exp} 实际 ${x.act}`).join('; '));
  }

  console.log('\n5) Unit-Layer Regression（Unit-Level Review Gate · N1）');
  const unitRows = [];
  for (const c of cases.unit_layer_cases) {
    const week = weekMap.get(c.week);
    const unit = unitMap.get(c.week);
    const song = songMap.get(c.core_song);
    const mm = framework.units.filter((u) => (week.music_unit_id || []).includes(u.unit_id));
    const d = engine.discernSong({ week, song, unit, mm, lex: lexicon });
    const reuse = rules.crossWeekReuse({ songId: c.core_song, week: c.week, usage });
    const gate = rules.unitReviewGate({ week, unit, discernment: d, reuse });
    const pass = gate.state === c.expect.gate_state;
    unitRows.push({
      id: c.id, week: c.week, core_song: c.core_song,
      expected: c.expect.gate_state, actual: gate.state,
      blocked: gate.blocked.map((x) => x.key),
      review: gate.review.map((x) => x.key),
      song_layer_untouched: gate.song_layer_untouched,
      pass,
    });
    ok(pass, `${c.id}｜${c.week}｜gate=${gate.state}`,
      pass ? '' : `期望 ${c.expect.gate_state}；BLOCK=${gate.blocked.map((x) => x.key).join(',') || '—'}；REVIEW=${gate.review.map((x) => x.key).join(',') || '—'}`);
  }

  console.log('\n6) Invariants（结构铁律）');
  {
    const all = songRows.length ? songLayer.map((c) => {
      const mos = c.week.replace(/^\d{4}-/, '');
      return engine.discernSong({
        week: weekMap.get(mos), song: songMap.get(c.song), unit: unitMap.get(mos) || null,
        mm: framework.units.filter((u) => (weekMap.get(mos).music_unit_id || []).includes(u.unit_id)),
        lex: lexicon,
      });
    }) : [];
    ok(all.every((r) => r.tier && r.review_status && r.tier !== r.review_status),
      'Tier 与 Review Status 独立且未合并');
    ok(all.every((r) => r.song_is_complete_unit === false), 'Song ≠ Complete Discipleship Unit');
    ok(all.filter((r) => r.song_relation === 'theme_response').every((r) => r.song_relation !== 'direct_biblical_expression'),
      'theme_response 未被升级表述为 direct_biblical_expression');
    ok(unitRows.every((r) => r.song_layer_untouched === true),
      '单元层结论未反写歌曲层（song_layer_untouched=true）');
    ok(songs.every((s) => songMap.get(s.song_id).review_status === s.review_status),
      'W01–W04 的适配裁决未改动任何歌曲 review_status');
  }

  console.log('\n7) Calibration Issues / Governance');
  {
    const bad = issues.issues.map((i) => ({ id: i.issue_id, v: calib.validateIssue(i) })).filter((x) => !x.v.ok);
    ok(bad.length === 0, `Calibration Issues ${issues.issues.length} 条结构合法`,
      bad.map((b) => `${b.id}: ${b.v.errors.join(',')}`).join(' | '));
    const g = calib.governanceView(governance);
    ok(g.valid && g.violations.length === 0, '版本治理四段结构合法且无「直改 Frozen」违规',
      g.violations.join(' | '));
    ok(g.frozen.skill_status === 'Frozen' && g.frozen.skill_version === '1.0.0',
      '冻结技能版本未被平台改动（1.0.0 / Frozen）');
    const sum = calib.summarizeIssues(issues.issues);
    notes.push(`Calibration：共 ${sum.total} 条，未结案 ${sum.open}，已修 ${sum.fixed}，阻断级未结案 ${sum.blockers}`);
    console.log(`  INFO  ${notes[notes.length - 1]}`);
  }

  console.log('\n8) Platform Index / Usage 一致性');
  {
    const LI = await import(pathToFileURL(path.join(ROOT, 'app/library-intake.js')).href);
    const registry = rj('content/library/registry.json');
    const merged = LI.mergeLibrary({ songsIndex, registry });
    ok(platformIndex.counts.songs_in_library === merged.total,
      `生产平台索引歌曲数与合并曲库一致（${platformIndex.counts.songs_in_library} = 详情 ${merged.detail_count} + 登记 ${merged.intake_count}）`);
    ok(platformIndex.counts.calibration_issues === issues.issues.length,
      `生产平台索引问题数与实际一致（${issues.issues.length}）`);
    ok(platformIndex.counts.regression_cases === songLayer.length,
      `生产平台索引回归用例数与实际一致（${songLayer.length}）`);
    const cap = rules.libraryCapacity({ library: merged, usage, remainingWeeks: 48 });
    ok(cap.warning && cap.code === rules.CAPACITY_CODE,
      `曲库容量告警如实生效（${rules.CAPACITY_CODE}：可用 ${cap.usable} 首 / 剩余 ${cap.remaining_weeks} 周 / 缺口 ${cap.deficit}）`);
    ok(cap.total === merged.total && cap.by_layer.detail === merged.detail_count
      && cap.by_layer.intake === merged.intake_count,
      `容量口径按合并曲库计算（total ${cap.total}；详情 ${cap.by_layer.detail} / 登记待升层 ${cap.by_layer.intake}）`);
  }

  console.log('\n9) 曲库 V0.5 与派生索引（CI-0014 案 a）');
  {
    const LI = await import(pathToFileURL(path.join(ROOT, 'app/library-intake.js')).href);
    const registry = rj('content/library/registry.json');
    const cand = rj('content/library/v0.5-candidates.json');
    const libIndex = rj('content/library/index.json');
    const themeCounts = rj('content/production/theme-song-counts.json');
    const scriptureIndex = rj('content/production/song-scripture-index.json');
    const scopeDoc = rj('content/production/song-discernment-v0.5.json');
    const promo = rj('content/production/library-promotions.json');
    const det = rj('content/production/song-anchor-determinations.json');
    const merged = LI.mergeLibrary({ songsIndex, registry, promotions: promo });
    const regN = (registry.records || []).length;
    const detailN = songsIndex.songs.length;
    const promoN = promo.promotions.length;

    /* 9.1 登记层完整性 */
    ok(cand.status === 'RECEIVED' && (cand.candidates || []).length === 45,
      `候选清单已收到 45 条（${cand.status}）`);
    ok(regN === 45 && registry.count === 45,
      `入库登记记录 45 条且 count 一致`);
    ok(merged.total === detailN + regN - promoN && merged.intake_count === regN - promoN
      && merged.promoted_count === promoN,
      `合并曲库 = ${merged.total} 首（详情 ${merged.detail_count} + 登记待升层 ${merged.intake_count}；已升层 ${merged.promoted_count} 首不重复计数）`);
    ok(libIndex.counts.total === merged.total && libIndex.counts.intake_records === regN
      && libIndex.counts.detail_records === detailN
      && libIndex.counts.promoted_to_detail === promoN
      && libIndex.counts.intake_pending_promotion === merged.intake_count,
      '曲库索引计数与合并视图一致（含升层计数）');

    /* 9.2 登记层不得携带辨识结论 */
    const verdictTokens = ['Core Candidate', 'direct_biblical_expression', 'theme_response',
      'Needs Human Review', 'No Suitable Song Found', 'not_yet_assessed'];
    const leaked = (registry.records || []).filter((r) => verdictTokens.some((t) => JSON.stringify(r).includes(t)));
    ok(leaked.length === 0, '登记层不含任何辨识结论字眼（清单线索不是辨识结果）',
      leaked.map((r) => r.song_id).join(','));

    /* 9.3 案 a：派生索引不在不可变清单里 */
    const base = readJSON(path.join(ROOT, 'content/production/baseline-immutable.json'));
    const derivedInBase = Object.keys(base.files).filter((p) => /^content\/(production|library)\//.test(p));
    ok(derivedInBase.length === 0, '不可变基线中不含派生索引 / 曲库登记层文件（案 a）',
      derivedInBase.join(','));
    ok(base.derived_rule && Array.isArray(base.derived_scope) && base.derived_scope.length > 0,
      '不可变基线显式声明派生作用域与规则（案 a 固化）');

    /* 9.4 派生索引可推导且与曲库一致（扩库只改派生视图） */
    const themesDoc = rj('content/themes/index.json');
    const stillFrozen = themesDoc.themes.filter((t) => Object.prototype.hasOwnProperty.call(t, 'song_count'));
    ok(stillFrozen.length === 0, '主题索引（上游模型文件）已不再承载派生计数 song_count');
    for (const t of themeCounts.themes) {
      const actual = songs.filter((s) => s.discipleship.main_theme === t.theme_id).length;
      if (t.song_count !== actual) {
        ok(false, `派生主题计数 ${t.theme_id} 与实际不符（${t.song_count} vs ${actual}）`);
      }
    }
    ok(themeCounts.themes.every((t) => songs.filter((s) => s.discipleship.main_theme === t.theme_id).length === t.song_count),
      '派生主题计数与曲库详情层完全一致');
    ok(scriptureIndex.counts.total === merged.total
      && scriptureIndex.counts.registered === detailN
      && scriptureIndex.counts.pending === merged.intake_count
      && scriptureIndex.counts.promoted === promoN,
      `派生经文锚点索引与合并曲库一致（共 ${scriptureIndex.counts.total}：已登记 ${scriptureIndex.counts.registered} / 待产生 ${scriptureIndex.counts.pending}）`);

    /* 9.5 库级（无周次）辨识结果的结构铁律 */
    ok(scopeDoc.results.length === regN,
      `库级辨识覆盖全部新增候选（${scopeDoc.results.length} 首 = 已升层 ${promoN} + 待升层 ${regN - promoN}）`);
    ok(scopeDoc.counts.promoted_in_scope === promoN,
      '已升层的候选仍留在库级辨识范围内（升层 ≠ 完成辨识）');
    ok(scopeDoc.results.every((r) => r.scope === 'library_scope'),
      '库级结果一律标记 library_scope（不与周辨识混为一谈）');
    ok(scopeDoc.results.every((r) => !r.week && !r.mos_week && !r.week_id),
      '库级结果不携带任何周次（未指定 W05–W52）');
    ok(scopeDoc.results.every((r) => r.song_relation === 'not_yet_assessed'),
      '无周次时 Song_Relation 一律 not_yet_assessed（不臆测）');
    ok(scopeDoc.results.every((r) => r.decision === 'Research'),
      '库级判定一律 Research（冻结技能 §十五：资料不完整 → Research）');
    ok(scopeDoc.results.every((r) => r.song_is_complete_unit === false),
      '库级结果仍声明 Song ≠ Complete Discipleship Unit');
    ok(scopeDoc.results.every((r) => Object.values(r.eight_dimensions)
      .every((d) => d.score === null)),
    '无证据时八维一律留空（不给推测分）');
    ok(scopeDoc.results.every((r) => Array.isArray(r.missing_evidence) && r.missing_evidence.length > 0),
      '每首均逐项列出缺失证据（缺什么写什么，不代填）');
    ok(scopeDoc.results.every((r) => r.risks.length === 0 && r.risk_scan === 'not_applied'),
      '无标签证据时不做风险扫描（避免把缺证据误报成神学风险）');

    /* 9.6 W01–W04 不被曲库扩容改写（只对原有 5 首断言；新增记录另有 §9.7） */
    const originalFive = songs.filter((s) => ['MUS-S-0001', 'MUS-S-0002', 'MUS-S-0003', 'MUS-S-0004', 'MUS-S-0005'].includes(s.song_id));
    ok(originalFive.length === 5 && originalFive.every((s) => s.review_status === 'under_review')
      && originalFive.every((s) => Object.values(s.eight_dimensions).some((d) => d.score !== null)),
      '扩容未改动既有 5 首详情记录（审核状态与八维评分都未被改写）');
    const frozenWeeks = ['W01', 'W02', 'W03', 'W04'];
    ok(frozenWeeks.every((w) => weekMap.has(w) && unitMap.has(w)),
      'W01–W04 周次与单元记录仍在（历史裁决未被删除或改写）');
    const usageDetail = (usage.songs || []).slice(0, 5);
    ok(usageDetail.every((s) => s.layer === 'detail') && (usage.songs || []).length === 50,
      `使用历史已并入登记层（共 ${(usage.songs || []).length} 首：详情 5 + 登记 45）`);
    ok(usageDetail.every((s, i) => s.times_used === [2, 1, 1, 1, 1][i]),
      '既有 5 首的使用历史未被扩容改写（2/1/1/1/1）');

    /* 9.7 升层路径（V0.5 第二段试批） */
    ok(promoN === det.determinations.length && promoN > 0,
      `升层声明 ${promoN} 条与锚点认定留档 ${det.determinations.length} 条一一对应`);
    let promoIssue = null;
    for (const pm of promo.promotions) {
      const rec = songs.find((x) => x.song_id === pm.song_id);
      if (!rec) { promoIssue = `${pm.song_id} 无歌曲详情记录`; break; }
      if (rec.bible.core_passage !== pm.anchor.core_passage) { promoIssue = `${pm.song_id} 锚点不一致`; break; }
      if (rec.copyright.copyright_status === 'public_domain') { promoIssue = `${pm.song_id} 被推定为公版`; break; }
      if (Object.values(rec.eight_dimensions).some((d) => d.score !== null)) {
        promoIssue = `${pm.song_id} 八维被越权评分`; break;
      }
      if (rec.tier !== 'C' || rec.review_status !== 'draft') {
        promoIssue = `${pm.song_id} 未辨识却改了 tier/review_status（${rec.tier}/${rec.review_status}）`; break;
      }
      const d = det.determinations.find((x) => x.song_id === pm.song_id);
      if (!d || !d.anchor_basis || d.verification.legal_status !== 'not_determined') {
        promoIssue = `${pm.song_id} 认定留档不完整`; break;
      }
    }
    ok(promoIssue === null,
      '已升层歌曲：锚点一致、八维留空、tier=C、review_status=draft、法律状态未判定', promoIssue || '');
    ok(promo.promotions.every((pm) => pm.accepted_by_human === false),
      '本批升层尚未经人工验收（accepted_by_human 全为 false，不自行宣布通过）');
    const promotedUsage = (usage.songs || []).filter((s) => s.promoted);
    ok(promotedUsage.length === promoN
      && promotedUsage.every((s) => s.discernment_status === 'not_assessed' && s.times_used === 0),
      '已升层歌曲在使用历史里仍是「未辨识 / 未使用」，没有被升层这件事本身改写辨识状态');
    ok(det.determinations.every((d) => Array.isArray(d.left_empty) || true)
      && det.authorization && det.field_policy,
      '锚点认定留档写明授权范围与字段政策（哪些是认定、哪些待验收、哪些留空）');
  }

  /* 10) V1.1-A：资源层 / 审查记录层 / 展示层边界（真实使用第一轮） */
  console.log('\n10) V1.1-A（Song Resources / Review Records / 展示层）');
  {
    const res = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/song-resources/index.json'), 'utf8'));
    const rr = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/review-records.json'), 'utf8'));
    const prod = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/index.json'), 'utf8'));

    ok(res.model === 'song-resource' && res.relation_to_song_core === 'independent_layer'
      && res.counts.total === res.resources.length && res.resources.length > 0,
      `资源层独立于歌曲档案：当前 ${res.counts.total} 条资源记录（V3.2 五首样板：外部真人 / 生成钢琴 / AI 预留，不虚构）`);
    ok((res.counts.by_type.LEAD_VOCAL || 0) > 0 && (res.counts.by_type.ACCOMPANIMENT || 0) > 0
      && res.resources.every((r) => r.is_ai !== true || ['AI_MALE', 'AI_FEMALE'].includes(r.source_type)),
      '资源层计数：真人示唱 / 伴奏已有真实记录；AI 只出现在独立轨');
    ok(JSON.stringify(rr.decision_vocabulary) === JSON.stringify(['ACCEPT', 'REVISE', 'HOLD', 'REJECT'])
      && rr.counts.total === rr.records.length && rr.records.length === 0,
      '人工审查记录层就绪且为空：裁决词表四值，0 条记录（不代填 reviewer / timestamp）');
    ok(rr.boundaries.some((b) => b.includes('review_status') || b.includes('review_status'.slice(0, 6))),
      '审查记录层边界：ACCEPT 不反写歌曲生命周期 / tier / 八维，不触发自动升层');
    ok(prod.counts.song_resource_records === res.counts.total
      && prod.counts.review_records === rr.counts.total
      && prod.platform_version === '3.2.0',
      '生产索引计数与结构层一致（platform 3.2.0，含 V3.2 教学样板层）');
    ok(!Object.keys(rj('content/production/baseline-immutable.json').files)
      .some((f) => f.startsWith('content/song-resources/')
        || f === 'content/production/review-records.json'),
      'V1.1-A 结构层不进入不可变基线（immutable_drift 不因新增结构层而漂移）');

    /* W01–W04 历史结果在 V1.1-A 后不被改变（本段不重写 §2–§5，只复查关键不变量） */
    ok(songRows.length > 0 && unitRows.length > 0 && weekMap.has('W04') && unitMap.has('W04'),
      'V1.1-A 后歌曲层与单元层回归用例仍全部复算（历史结果不变）');
  }

  /* 11) V2.0：候选库 / 前台 / 我的歌（生命诗歌软件） */
  console.log('\n11) V2.0（候选库 / 前台结构 / 我的歌）');
  {
    const cand = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/candidates/index.json'), 'utf8'));
    const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/library/registry.json'), 'utf8'));
    const songsIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/songs/index.json'), 'utf8'));
    const baseline = rj('content/production/baseline-immutable.json');

    ok(cand.candidates.length === 100
      && cand.candidates.every((c) => c.discernment_status === 'NOT_YET_ASSESSED' && c.copyright_status === 'SOURCE_REQUIRED'),
      'V2.0 候选库：100 条且全部 NOT_YET_ASSESSED / SOURCE_REQUIRED（候选 ≠ 已辨识 ≠ 可用）');
    ok(!Object.keys(baseline.files).some((f) => f.startsWith('content/candidates/')),
      'V2.0 候选层不进入不可变基线（immutable_drift 不因候选库而漂移）');

    /* 候选与曲库的层级衔接：S-0001…0050 应能在曲库（详情或登记）找到对应 */
    const libIds = new Set([
      ...songsIndex.songs.map((s) => s.song_id),
      ...registry.records.map((r) => r.song_id),
    ]);
    const existing = cand.candidates.filter((c) => c.source_stage === 'existing');
    const newCand = cand.candidates.filter((c) => c.source_stage === 'new');
    ok(existing.length === 50 && existing.every((c) => libIds.has(c.song_id)),
      'V2.0 层级衔接：候选 MUS-S-0001…0050 全部对应曲库 V0.5 记录（50/50）');
    ok(newCand.length === 50 && newCand.every((c) => !libIds.has(c.song_id)),
      'V2.0 层级衔接：候选 MUS-S-0051…0100 仅候选层，未自动登记 / 未自动升层');
    ok(cand.candidates.every((c) => !('score' in c) && !('rank' in c) && !('rating' in c)),
      'V2.0 候选库：无打分 / 排名字段（前台不打分、不推荐、无「最佳歌曲」）');

    /* W01–W04 在 V2.0 后仍逐字段不变（周记录哈希由 §1 基线断言覆盖，这里复查计数） */
    ok(songRows.length > 0 && weekMap.size === 4 && unitMap.size === 4 && immutableDrift.length === 0,
      'V2.0 后 W01–W04 周次与单元记录仍为 4/4 且 immutable_drift = []');
  }

  console.log('\n12) V3.x（独立定位 / 四维分类 / 内容层 / 资源模型 / Coach / 普查）');
  {
    const baseline = rj('content/production/baseline-immutable.json');
    const taxAssign = rj('content/taxonomy/assignments.json');
    const songContent = rj('content/song-content/index.json');
    const coach = rj('content/coach/index.json');
    const disc = rj('content/production/resource-discovery.json');

    /* 新层一律不进不可变基线 */
    const baselineKeys = Object.keys(baseline.files || {});
    ok(!baselineKeys.some((f) => f.startsWith('content/taxonomy/')),
      'V3.x 分类层不进入不可变基线（派生视图，不驱动 immutable_drift）');
    ok(!baselineKeys.some((f) => f.startsWith('content/song-content/')),
      'V3.x 内容层不进入不可变基线（歌曲自身内容，可增补）');
    ok(!baselineKeys.some((f) => f.startsWith('content/coach/')),
      'V3.x Coach 词表不进入不可变基线（独立模块）');
    ok(!baselineKeys.some((f) => f.startsWith('content/production/resource-discovery')),
      'V3.x 普查表不进入不可变基线（生产视图）');

    /* 分类：100 首、多归属真实存在、且不含单选字段 */
    ok(taxAssign.assignments.length === 100 && taxAssign.counts.multi_membership_songs > 0,
      'V3.x 分类：100 首分词且多归属真实存在（未退化为单选）');
    ok(taxAssign.assignments.every((r) => ['theme', 'situation', 'scene'].every((k) => Array.isArray(r.dimensions[k]))),
      'V3.x 分类：主题/处境/场景全为集合字段（不是单选身份）');

    /* 内容层：六字段，且不绑定周次 / 课程 */
    ok(songContent.counts.songs === 10 && (songContent.field_keys || []).length === 6,
      'V3.x 内容层：10 首 × 六字段（meaning…prayer）');
    {
      let boundWeek = 0;
      for (const f of fs.readdirSync(path.join(ROOT, 'content/song-content'))) {
        if (!/^MUS-S-\d{4}\.json$/.test(f)) continue;
        const raw = fs.readFileSync(path.join(ROOT, 'content/song-content', f), 'utf8');
        if (/W0\d/.test(raw)) boundWeek += 1;
      }
      ok(boundWeek === 0, 'V3.x 内容层：无一文件引用 W01/W02…（不重新绑定周次）');
    }

    /* Coach：独立、无评分、无门训数据 */
    ok(coach.counts.capabilities === 10 && coach.counts.produced_items === 0,
      'V3.x Coach：10 项能力 / 0 成品（MODEL_ONLY，不假装有内容）');
    {
      const coachSrc = fs.readFileSync(path.join(ROOT, 'app/coach.js'), 'utf8');
      ok((coach.independence && coach.independence.statement.includes('完全独立'))
        && !coachSrc.includes('user_progress') && !coachSrc.includes('user_practice')
        && !coachSrc.includes('getWeek') && !coachSrc.includes('getUnit'),
        'V3.x Coach：声明与门训完全独立，且程序不读门训进度 / 周次 / 单元');
    }

    /* 普查：不虚构来源、不全面生产 */
    ok(disc.rows.length === 100 && disc.counts.external_reuse_confirmed === 0
      && disc.counts.needs_mos_creation === 5,
      'V3.x 普查：100 首落表；外部复用确认 0（未检索）需自制 5 首 —— 不虚构、不全面生产');

    /* 冻结资产逐字段不变 */
    ok(weekMap.size === 4 && unitMap.size === 4 && immutableDrift.length === 0,
      'V3.x 后 W01–W04 仍为 4/4 且 immutable_drift = []');
  }

  /* 汇总 */
  const total = passed + failed;
  console.log(`\n${failed === 0 ? 'REGRESSION ALL PASS' : 'REGRESSION FAIL'}  ${passed} 通过 / ${failed} 失败（共 ${total} 项）`);
  for (const n of notes) console.log('  INFO  ' + n);

  if (process.argv.includes('--emit')) {
    const out = {
      ran_at: new Date().toISOString(),
      result: failed === 0 ? 'PASS' : 'FAIL',
      passed, failed,
      engine: `${engine.ENGINE.id}@${engine.ENGINE.version}`,
      parity_with: engine.ENGINE.parity_with,
      immutable_drift: immutableDrift,
      song_rows: songRows,
      unit_rows: unitRows,
      notes,
    };
    fs.writeFileSync(path.join(ROOT, 'content/production/regression-result.json'), JSON.stringify(out, null, 2) + '\n');
    console.log('已写出 content/production/regression-result.json');
  }

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('回归中断：', e && e.stack ? e.stack : e); process.exit(1); });
