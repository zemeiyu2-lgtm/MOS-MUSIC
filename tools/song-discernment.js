#!/usr/bin/env node
/* =========================================================
   MOS-MUSIC｜Library-Scope Song Discernment（库级歌基层辨识）
   ---------------------------------------------------------
   对**新增候选**（登记层）逐首运行已冻结技能的歌基层判定，并保存
   Song-level results。本工具不产生单元层内容，也不指定任何周次。

   为什么是「库级范围」：
     冻结技能 §三 写明输入至少需要周次（经文 / 核心真理 / LQ / MM / 功能）。
     本阶段明确不进 W05–W52，因此没有周次上下文；此时按技能 §三「缺失输入
     一律：停止 → 报资料不足，不得臆测」处理，逐首输出缺什么，而不是猜结果。

   为什么只判歌基层：
     Song_Relation 是周相对字段，S6 / S7 属于单元层。它们在没有周次时
     不可判定，输出为 not_yet_assessed / 不适用 —— 不合并成一个「Confirmed」。

   输出：content/production/song-discernment-v0.5.json
   用法：node tools/song-discernment.js [--show <song_id>] [--check]
   ========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const OUT_FILE = 'content/production/song-discernment-v0.5.json';

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function main() {
  const LI = await import(pathToFileURL(path.join(ROOT, 'app/library-intake.js')).href);
  const DE = await import(pathToFileURL(path.join(ROOT, 'app/discernment.js')).href);

  const songsIndex = readJSON('content/songs/index.json');
  const registry = readJSON(LI.V05.registry_file);
  const promotions = fs.existsSync(path.join(ROOT, LI.V05.promotions_file))
    ? readJSON(LI.V05.promotions_file) : { promotions: [] };
  const lex = DE.compileLexicon(readJSON('content/production/discernment-lexicon.json'));

  /* 升层事实投影：只为已进入详情层的候选附上「已认定」的事实，未升层的保持 null。
     库级辨识的范围是「全部新增候选」—— 升层不改变这一事实，也不让它们退出范围。 */
  const songFacts = {};
  for (const p of promotions.promotions || []) {
    if (!p.detail_file || !fs.existsSync(path.join(ROOT, p.detail_file))) {
      throw new Error(`升层声明缺少详情记录：${p.song_id}`);
    }
    const songRecord = readJSON(p.detail_file);
    if (songRecord.song_id !== p.song_id) throw new Error(`升层声明与详情记录不一致：${p.song_id}`);
    if (((songRecord.bible || {}).core_passage || null) !== ((p.anchor || {}).core_passage || null)) {
      throw new Error(`升层声明锚点与详情记录不一致：${p.song_id}`);
    }
    songFacts[p.song_id] = LI.songFactsFrom(songRecord);
  }

  const merged = LI.mergeLibrary({ songsIndex, registry, promotions, songFacts });
  /* 候选范围 = 全部新增登记记录（45 首）。升层只是让其中几首多了一层事实，不缩小候选范围。 */
  const candidateIds = new Set((registry.records || []).map((r) => r.song_id));
  const candidates = merged.entries.filter((e) => candidateIds.has(e.song_id));
  const results = DE.discernLibrary({ entries: candidates, lex });

  /* 强约束：库级结果不得反写冻结历史，也不得携带周次 */
  for (const r of results) {
    if (r.scope !== DE.SCOPE.LIBRARY) throw new Error('库级结果 scope 异常');
    if (r.week_id || r.mos_week) throw new Error('库级结果不得携带周次');
    if (r.song_is_complete_unit !== false) throw new Error('歌曲层不得被当成完整门训单元');
  }

  const byDecision = results.reduce((acc, r) => {
    acc[r.decision] = (acc[r.decision] || 0) + 1;
    return acc;
  }, {});
  const gapTally = results.flatMap((r) => r.missing_evidence).reduce((acc, g) => {
    const key = g.split('：')[0].split('（')[0];
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const doc = {
    discernment_version: 'MUS-V-0.5.0',
    generated_at: new Date().toISOString(),
    generated_by: '库级辨识脚本（tools 下的 song-discernment 工具）',
    engine: `${DE.ENGINE.id}@${DE.ENGINE.version}`,
    parity_with: DE.ENGINE.parity_with,
    scope: DE.SCOPE.LIBRARY,
    scope_note: '库级范围：无周次上下文，只判定不依赖周次的歌基层字段。'
      + '冻结技能 §三 规定「缺失输入一律：停止 → 报资料不足，不得臆测」，'
      + '故缺失证据一律留空并入列缺失清单，而不是给推测分。',
    week_assignment: 'none',
    not_redecided: 'MUS-S-0001…MUS-S-0005 不在此重新裁决：其结论仍为 W01–W04 的冻结运行留档，本文件只覆盖新增候选。',
    unit_layer: '本阶段不生成任何周次 Unit。',
    scope_candidates: '新增候选 45 首 = 已升入详情层者 + 仍在登记层者；升层不使歌曲退出库级辨识范围，只是缺失证据随之收缩。',
    counts: {
      candidates: results.length,
      promoted_in_scope: results.filter((r) => r.input_layer === 'detail').length,
      by_decision: byDecision,
      missing_evidence_categories: gapTally,
    },
    results,
  };

  if (process.argv.includes('--check')) {
    if (!fs.existsSync(path.join(ROOT, OUT_FILE))) { console.error(`FAIL 缺失 ${OUT_FILE}`); process.exit(1); }
    const onDisk = readJSON(OUT_FILE);
    const strip = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.generated_at; return JSON.stringify(c); };
    const fails = [];
    if (onDisk.scope !== DE.SCOPE.LIBRARY) fails.push('scope 不是 library_scope');
    if (onDisk.week_assignment !== 'none') fails.push('week_assignment 不是 none');
    if ((onDisk.counts && onDisk.counts.candidates) !== results.length) fails.push(`候选数不符：${onDisk.counts && onDisk.counts.candidates} vs ${results.length}`);
    if (strip(onDisk) !== strip(doc)) fails.push('结果集与曲库不一致（需重新运行库级辨识）');
    for (const r of (onDisk.results || [])) {
      if (r.song_relation !== 'not_yet_assessed') fails.push(`${r.song_id} song_relation 被代填`);
      if (r.s6 !== null || r.s7 !== null) fails.push(`${r.song_id} S6/S7 被代填`);
      if (r.risk_scan !== 'not_applied') fails.push(`${r.song_id} risk_scan 被越权执行`);
      if (!Array.isArray(r.missing_evidence) || !r.missing_evidence.length) fails.push(`${r.song_id} 缺失清单为空`);
      if (r.week_id || r.mos_week) fails.push(`${r.song_id} 携带周次`);
    }
    if (fails.length) { fails.forEach((f) => console.error('FAIL ' + f)); process.exit(1); }
    console.log(`库级辨识结果一致性检查通过：${results.length} 首，全部 Research / not_yet_assessed，无周次、无 Unit、无代填。`);
    process.exit(0);
  }

  fs.writeFileSync(path.join(ROOT, OUT_FILE), JSON.stringify(doc, null, 2) + '\n');

  console.log('MOS-MUSIC｜库级歌基层辨识（library_scope）');
  console.log(`范围：新增候选 ${results.length} 首（其中已升入详情层 ${doc.counts.promoted_in_scope} 首；W01–W04 所用歌曲不重裁）`);
  console.log(`引擎：${doc.engine}（与冻结技能 ${doc.parity_with} 保持一致）`);
  console.log('');
  console.log('判定分布：');
  for (const [k, v] of Object.entries(byDecision)) console.log(`  ${k}：${v} 首`);
  console.log('');
  console.log('缺失证据分类（逐首并入列，不代填）：');
  for (const [k, v] of Object.entries(gapTally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}：${v} 首`);
  }
  console.log('');

  const show = argValue('--show');
  if (show) {
    const r = results.find((x) => x.song_id === show || x.song_id.endsWith(show));
    if (!r) { console.error(`未找到 ${show}`); process.exit(1); }
    console.log(DE.renderLibraryResult(r));
    console.log('');
  }

  console.log(`已写出 ${OUT_FILE}`);
  console.log('未生成任何周次 Unit，未指定 W05–W52，未改动任何歌曲的历史裁决。');
  process.exit(0);
}

main().catch((e) => { console.error('库级辨识中断：', e && e.stack ? e.stack : e); process.exit(1); });
