#!/usr/bin/env node
/* =========================================================
   MOS-MUSIC｜Music Library V0.5 入库报告（§十四 + §十）
   ---------------------------------------------------------
   输入（全部只读）：曲库索引 / 入库登记 / 候选清单 / 使用历史
   输出：控制台 Markdown + content/production/library-report.json

   报告只统计实际数据，不做估计、不给建议、不排序、不评优。
   容量一项由平台规则库（app/production-rules.js）计算，与仪表盘同源。

   用法：node tools/library-report.js [--md <path>]
   ========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

const row = (k, v) => `| ${k} | ${v} |`;

/** 完成条件（§十六）：登记记录齐备 + 合并总数达到目标 + 每首都有身份记录。 */
function recordsAllPresent(registry) {
  const records = (registry && registry.records) || [];
  return records.length === V05_EXPECTED_NEW
    && records.every((r) => r.song_id && r.title_zh && r.copyright_status);
}
const V05_EXPECTED_NEW = 45;

async function main() {
  const LI = await import(pathToFileURL(path.join(ROOT, 'app/library-intake.js')).href);
  const PR = await import(pathToFileURL(path.join(ROOT, 'app/production-rules.js')).href);

  const songsIndex = readJSON('content/songs/index.json');
  const libraryIndex = readJSON('content/library/index.json');
  const registry = readJSON('content/library/registry.json');
  const candidates = readJSON('content/library/v0.5-candidates.json');
  const promotions = fs.existsSync(path.join(ROOT, 'content/production/library-promotions.json'))
    ? readJSON('content/production/library-promotions.json') : { promotions: [], counts: {} };
  const determinations = fs.existsSync(path.join(ROOT, 'content/production/song-anchor-determinations.json'))
    ? readJSON('content/production/song-anchor-determinations.json') : { determinations: [], counts: {} };
  const usage = readJSON('content/production/library-usage.json');
  const merged = LI.mergeLibrary({ songsIndex, registry, promotions });
  const scopeDoc = fs.existsSync(path.join(ROOT, 'content/production/song-discernment-v0.5.json'))
    ? readJSON('content/production/song-discernment-v0.5.json') : { results: [] };

  const annualIndex = readJSON('content/annual/2027/index.json');
  const producedWeeks = annualIndex.weeks.length;
  const remainingWeeks = 52 - producedWeeks;
  const capacity = PR.libraryCapacity({ library: merged, usage, remainingWeeks });

  const report = LI.intakeReport({ songsIndex, registry, candidates, usage, capacity, promotions });
  report.generated_at = new Date().toISOString();
  report.generated_by = 'tools/library-report.js';
  report.library_index = {
    status: candidates.status,
    target_total: libraryIndex.target_total,
    registered_total: libraryIndex.counts.total,
    intake_records: libraryIndex.counts.intake_records,
    detail_records: libraryIndex.counts.detail_records,
    promoted_to_detail: libraryIndex.counts.promoted_to_detail,
    intake_pending_promotion: libraryIndex.counts.intake_pending_promotion,
    pending_list: libraryIndex.counts.pending_list,
  };
  report.promotion_path = {
    note: '升层不改写登记记录（登记层字段契约冻结、不允许附加字段），而由独立文件声明升层关系；合并曲库时同一首歌只计一次。',
    promotions_file: 'content/production/library-promotions.json',
    determinations_file: 'content/production/song-anchor-determinations.json',
    authorization: '2026-09-21 人工授权：按公版圣诗固有经文依据逐首认定。',
    adr: 'docs/ADR/ADR-0013-hymn-anchor-determination-and-promotion-path.md',
    batch: 'V0.5-promotion-trial-1（试批 5 首）',
    promoted: (promotions.promotions || []).map((p) => ({
      song_id: p.song_id,
      title_zh: p.title_zh,
      core_passage: p.anchor.core_passage,
      anchor_basis: p.anchor.basis,
      accepted_by_human: p.accepted_by_human,
    })),
    awaiting: '人工验收本批 5 首；剩余 40 首是否沿用同一口径须人工决定。',
    determination_counts: determinations.counts || {},
  };
  report.library_scope_discernment = {
    ref: 'content/production/song-discernment-v0.5.json',
    scope: 'library_scope',
    engine: scopeDoc.engine || null,
    parity_with: scopeDoc.parity_with || null,
    candidates: (scopeDoc.results || []).length,
    by_decision: scopeDoc.counts ? scopeDoc.counts.by_decision : null,
    missing_evidence_categories: scopeDoc.counts ? scopeDoc.counts.missing_evidence_categories : null,
  };
  report.completed = candidates.status !== 'PENDING_LIST'
    && merged.total === libraryIndex.target_total
    && recordsAllPresent(registry);
  report.next_stage_target = {
    note: '50 首为第一阶段（V0.5）扩容完成；全年唯一可用容量仍不足，目标下一阶段扩充至约 60 首。',
    current_total: merged.total,
    target_after_v05: 60,
  };

  const L = [];
  L.push('# Music Library V0.5 Intake Report');
  L.push('');
  L.push(`生成时间：${report.generated_at}`);
  L.push(`状态：${candidates.status === 'PENDING_LIST' ? '**BLOCKED**（候选清单未提供）' : candidates.status}`);
  L.push('');
  L.push('## 数量');
  L.push('');
  L.push('| 项 | 值 |');
  L.push('| ---- | ---- |');
  L.push(row('原有（Phase 2A 样本库）', report.counts.existing));
  L.push(row('新增（入库登记记录）', report.counts.added));
  L.push(row('总计', `${report.counts.total}（目标 ${report.counts.target_total}）`));
  L.push(row('歌曲详情层合计', report.counts.detail_records));
  L.push(row('其中本批已升层', report.counts.promoted_to_detail));
  L.push(row('登记层记录条数', report.counts.intake_records));
  L.push(row('其中仍待升层', report.counts.intake_pending_promotion));
  L.push(row('候选已收', `${report.counts.candidates_received} / ${report.counts.expected_new}`));
  L.push(row('尚未到位', report.counts.still_pending));
  L.push(row('完成判定', report.completed ? '**MUSIC LIBRARY V0.5 COMPLETE**' : '未完成'));
  L.push('');
  L.push('## 升层（第二段，试批）');
  L.push('');
  L.push(`授权：${report.promotion_path.authorization}`);
  L.push('');
  L.push(`批次：${report.promotion_path.batch}　决策见 ${report.promotion_path.adr}`);
  L.push('');
  L.push('| 歌曲 | 经文锚点 | 锚点依据 | 人工已验收 |');
  L.push('| ---- | ---- | ---- | ---- |');
  for (const p of report.promotion_path.promoted) {
    L.push(`| ${p.song_id} ${p.title_zh} | ${p.core_passage} | ${p.anchor_basis} | ${p.accepted_by_human ? '是' : '否'} |`);
  }
  L.push('');
  L.push(`> ${report.promotion_path.note}`);
  L.push(`> ${report.promotion_path.awaiting}`);
  L.push('');
  L.push('## 辨识');
  L.push('');
  L.push('| 项 | 值 |');
  L.push('| ---- | ---- |');
  L.push(row('assessed（有周辨识留档）', report.discernment.assessed));
  L.push(row('not yet assessed（未完成周辨识）', report.discernment.not_yet_assessed));
  L.push(row('core candidate（历次运行）', report.discernment.core_candidate_runs));
  L.push(row('theme response（历次运行）', report.discernment.theme_response_runs));
  L.push(row('direct（历次运行）', report.discernment.direct_runs));
  L.push(row('review（历次运行）', report.discernment.review_runs));
  L.push(row('research（周辨识留档）', report.discernment.research_runs));
  L.push(row('research（库级辨识留档，无周次）', report.discernment.library_scope_research_runs));
  L.push(row('block（含 HIGH 风险歌曲）', report.discernment.block_songs));
  L.push(row('evidence insufficient', report.discernment.evidence_insufficient));
  L.push('');
  L.push('### 库级（无周次）歌基层辨识');
  L.push('');
  L.push('| 项 | 值 |');
  L.push('| ---- | ---- |');
  L.push(row('覆盖候选', report.library_scope_discernment.candidates));
  L.push(row('范围', report.library_scope_discernment.scope));
  L.push(row('引擎 / 对拍技能', `${report.library_scope_discernment.engine} ｜ ${report.library_scope_discernment.parity_with}`));
  L.push(row('判定分布', Object.entries(report.library_scope_discernment.by_decision || {}).map(([k, v]) => `${k}=${v}`).join('，') || '—'));
  L.push('');
  L.push('缺失证据分类（逐首入列，不代填）：');
  L.push('');
  for (const [k, v] of Object.entries(report.library_scope_discernment.missing_evidence_categories || {})) {
    L.push(`- ${k}：${v} 首`);
  }
  L.push('');
  L.push('## 风险');
  L.push('');
  L.push('| 项 | 值 |');
  L.push('| ---- | ---- |');
  for (const k of ['HIGH', 'MEDIUM', 'LOW', 'NOTE', 'NONE']) L.push(row(k, report.risk[k]));
  L.push('');
  L.push('## 资源');
  L.push('');
  L.push('| 项 | 值 |');
  L.push('| ---- | ---- |');
  L.push(row('lyrics 已收录', report.resources.lyrics_imported));
  L.push(row('score 已收录', report.resources.score_imported));
  L.push(row('lead_vocal 已收录', report.resources.lead_vocal_imported));
  L.push(row('accompaniment 已收录', report.resources.accompaniment_imported));
  L.push(row('来源待补（SOURCE_REQUIRED）', report.resources.source_required));
  L.push(row('版权未明（UNKNOWN）', report.resources.unknown_copyright));
  L.push(row('提示', '本阶段不收录歌词、歌谱、示唱与伴奏；四槽一律 NOT_IMPORTED（§四）。'));
  L.push(row('版权边界', 'SOURCE_REQUIRED 只表示「候选登记已完成」，不得据此升格为 PUBLIC_DOMAIN；'
    + '原始英文作品 / 中文译词 / 中文编曲 / 五线谱 / 简谱 / 示唱 / 录音 / 伴奏 须分别核验（§六）。'));
  L.push('');
  L.push('## 使用');
  L.push('');
  L.push('| 项 | 值 |');
  L.push('| ---- | ---- |');
  L.push(row('used', report.usage.used));
  L.push(row('unused', report.usage.unused));
  L.push(row('reused（使用 > 1 次）', report.usage.reused));
  L.push('');
  L.push('## 容量（§十）');
  L.push('');
  L.push('| 项 | 值 |');
  L.push('| ---- | ---- |');
  L.push(row('total songs', capacity.total));
  L.push(row('分层（详情 / 登记）', `${capacity.by_layer.detail} / ${capacity.by_layer.intake}`));
  L.push(row('usable（未使用过）', capacity.usable));
  L.push(row('assessed songs', capacity.assessed));
  L.push(row('unresolved songs', capacity.unresolved));
  L.push(row('used songs', capacity.used));
  L.push(row('unused songs', capacity.unused));
  L.push(row('HIGH risk', capacity.high_risk.length));
  L.push(row('REVIEW', capacity.review.length));
  L.push(row('BLOCK', capacity.block.length));
  L.push(row('evidence insufficient', capacity.evidence_insufficient.length));
  L.push(row('remaining unique capacity', capacity.remaining_unique_capacity));
  L.push(row('剩余周次需求', capacity.remaining_weeks));
  L.push(row('缺口', capacity.deficit));
  L.push(row('告警', capacity.warning ? `**${capacity.code}** 仍然生效` : '已解除'));
  L.push('');
  L.push(`> ${capacity.detail}`);
  L.push('');
  L.push('## 复用政策（§四 保持不变）');
  L.push('');
  L.push('跨周复用沿用 V1.0：允许重复使用，进入 `reuse_review`；不自动放行、不自动否决、'
    + '不降低神学辨识标准，也不因容量不足而强行选歌。');
  L.push('');
  L.push('## 下一阶段目标（§三）');
  L.push('');
  L.push(`50 首只表示**第一阶段曲库扩容完成**，不表示全年唯一可用。`
    + `全年生产前目标扩充至约 ${report.next_stage_target.target_after_v05} 首；本阶段不追加新歌。`);
  L.push('');
  L.push('## 未做（本阶段边界）');
  L.push('');
  L.push('- 未生成 W05–W52 任何周次或单元；未给任何歌曲指定未来周次。');
  L.push('- 未把 SOURCE_REQUIRED 改成 PUBLIC_DOMAIN；已升层歌曲的法律状态仍为 unknown（未判定）。');
  L.push('- 未做八维辨识、未升级 tier、未作 Song_Relation 判定 —— 这些需要周次上下文与人工审核。');
  L.push('- 未收录歌词 / 歌谱 / 示唱 / 伴奏；未推荐「最佳歌曲」；未改动已冻结技能与 W01–W04。');
  L.push('- 剩余 40 首未升层，等人工验收本批试批后再定。');
  L.push('');

  const md = L.join('\n');
  console.log(md);

  fs.writeFileSync(
    path.join(ROOT, 'content/production/library-report.json'),
    JSON.stringify(report, null, 2) + '\n'
  );
  console.log('已写出 content/production/library-report.json');

  const mdPath = argValue('--md');
  if (mdPath) {
    fs.writeFileSync(path.resolve(ROOT, mdPath), md);
    console.log(`已写出 ${mdPath}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error('生成入库报告失败：', e && e.stack ? e.stack : e); process.exit(1); });
