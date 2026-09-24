#!/usr/bin/env node
/* =========================================================
   MOS-MUSIC｜Production Planner（生产计划器 CLI）
   ---------------------------------------------------------
   支持单周 / 连续 / 全年三种生产请求，但**默认 Human Review Gate**：

     · 只产出「计划 + 门状态」，不写任何 content/annual/** 内容；
     · 上游周记录缺失的周次 = BLOCK（不得凭空生产）；
     · 可用歌曲不足时输出 MUSIC_LIBRARY_CAPACITY_WARNING，
       且绝不强行复用、降低标准或虚构歌曲。

   用法：
     node tools/produce-plan.js                     # 默认：单周 W05
     node tools/produce-plan.js --week W05
     node tools/produce-plan.js --range W05-W10
     node tools/produce-plan.js --year              # W01–W52
     node tools/produce-plan.js --week W05 --emit   # 另存生产计划快照
   ========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const rj = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

function arg(k) {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function main() {
  const E = await import(pathToFileURL(path.join(ROOT, 'app/discernment.js')).href);
  const R = await import(pathToFileURL(path.join(ROOT, 'app/production-rules.js')).href);

  const lex = E.compileLexicon(rj('content/production/discernment-lexicon.json'));
  const songsIndex = rj('content/songs/index.json');
  const songs = songsIndex.songs.map((s) => rj(s.file));
  const framework = rj('content/framework/music-units.json');
  const usage = rj('content/production/library-usage.json');
  const annualIndex = rj('content/annual/2027/index.json');
  const weekMap = new Map(annualIndex.weeks.map((w) => [w.mos_week, rj(w.file)]));
  const unitMap = new Map(annualIndex.units.map((u) => {
    const rec = rj(u.file);
    return [rec.mos_week, rec];
  }));
  const songMap = new Map(songs.map((s) => [s.song_id, s]));

  const yearMode = process.argv.includes('--year');
  const range = arg('--range');
  const single = arg('--week');
  let mode = R.PRODUCE_MODES.SINGLE;
  let from = single || 'W05';
  let to = from;
  if (yearMode) { mode = R.PRODUCE_MODES.YEAR; from = 'W01'; to = 'W52'; }
  if (range) {
    mode = R.PRODUCE_MODES.RANGE;
    const [a, b] = range.split('-');
    from = a; to = b || a;
  }

  const plan = R.planProduction({
    mode, from, to,
    existingWeeks: annualIndex.weeks.map((w) => w.week_id),
    library: songsIndex,
    usage,
  });

  if (!plan.ok) { console.error(plan.error); process.exit(1); }

  console.log('MOS-MUSIC｜生产计划（Production Plan）');
  console.log(`platform: ${plan.platform}`);
  console.log(`mode: ${plan.mode}   range: ${plan.from}–${plan.to}`);
  console.log(`请求 ${plan.requested} 周｜已生产 ${plan.already_produced} 周｜剩余 ${plan.remaining} 周`);
  console.log(`默认门：${plan.default_gate}｜批量是否绕过审核：${plan.batch_bypasses_review ? '是' : '否'}`);
  console.log('');

  if (plan.capacity && plan.capacity.warning) {
    console.log(`⚠ ${R.CAPACITY_CODE}`);
    console.log(`  ${plan.capacity.detail}`);
    console.log(`  总歌曲 ${plan.capacity.total}｜已辨识 ${plan.capacity.assessed}｜未使用 ${plan.capacity.usable}｜HIGH 风险 ${plan.capacity.high_risk.join(',') || '—'}`);
    console.log('');
  } else if (plan.capacity) {
    console.log(`曲库容量：${plan.capacity.detail}`);
    console.log('');
  }

  console.log('| Week | 已生产 | 上游 | 动作 | 门 | 说明 |');
  console.log('|---|---|---|---|---|---|');
  for (const e of plan.entries) {
    let note = '';
    if (e.already_produced) note = '历史周次，不重写';
    else if (e.action === 'blocked_capacity') note = '无未使用歌曲 → 须先裁定扩库或复用规则';
    else note = `需先建立上游周记录（${e.requires.join('/')}）`;
    console.log(`| ${e.week} | ${e.already_produced ? '是' : '否'} | ${e.upstream_ready ? '就绪' : '缺失'} | ${e.action} | ${e.gate || '—'} | ${note} |`);
  }

  /* 对已有上游的周次跑真实辨识与单元层审查门（示范"平台可以怎么用"） */
  const readyWeeks = plan.entries.filter((e) => e.upstream_ready).map((e) => e.week);
  if (readyWeeks.length) {
    console.log('\n已有上游周次的单元层审查门复核：');
    for (const wk of readyWeeks) {
      const week = weekMap.get(wk);
      const unit = unitMap.get(wk);
      const mm = framework.units.filter((u) => (week.music_unit_id || []).includes(u.unit_id));
      const d = E.discernSong({ week, song: songMap.get(unit.core_song), unit, mm, lex });
      const reuse = R.crossWeekReuse({ songId: unit.core_song, week: wk, usage });
      const gate = R.unitReviewGate({ week, unit, discernment: d, reuse });
      console.log(`  ${wk}｜主歌 ${unit.core_song}｜歌曲层 ${d.decision}｜单元层 ${gate.state}`
        + `｜BLOCK=${gate.blocked.map((x) => x.key).join(',') || '—'}｜REVIEW=${gate.review.map((x) => x.key).join(',') || '—'}`);
    }
  }

  console.log('\n说明：本工具只产出计划与门状态，不写任何年度周次内容。'
    + '真正落盘须经人工审核后按生产流程逐周执行。');

  if (process.argv.includes('--emit')) {
    const out = {
      generated_at: new Date().toISOString(),
      generated_by: 'tools/produce-plan.js',
      plan_only: true,
      writes_annual_content: false,
      platform: plan.platform,
      mode: plan.mode,
      from: plan.from,
      to: plan.to,
      requested: plan.requested,
      already_produced: plan.already_produced,
      remaining: plan.remaining,
      default_gate: plan.default_gate,
      batch_bypasses_review: plan.batch_bypasses_review,
      capacity: plan.capacity,
      entries: plan.entries,
      note: '生产计划快照（不是生产结果）。上游缺失与曲库容量不足会在计划中显式暴露，不做静默兜底。',
    };
    fs.writeFileSync(path.join(ROOT, 'content/production/production-plan.json'), JSON.stringify(out, null, 2) + '\n');
    console.log('已写出 content/production/production-plan.json');
  }
  process.exit(0);
}

main().catch((e) => { console.error('计划生成失败：', e && e.stack ? e.stack : e); process.exit(1); });
