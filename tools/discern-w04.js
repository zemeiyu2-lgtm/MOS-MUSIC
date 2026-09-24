#!/usr/bin/env node
/* =========================================================
   Phase 2B｜W04 单周辨识驱动
   ---------------------------------------------------------
   本脚本不实现任何选歌逻辑：它只把 W04 的上游输入交给
   Frozen Skill（mos-music-song-discernment@1.0.0）的
   tools/discern.js，对音乐库全部候选歌曲逐一辨识，
   再把结果打印/落盘。判定全部由 Skill 产生。

   用法：
     node tools/discern-w04.js            # 打印
     node tools/discern-w04.js --emit     # 另存 docs/PHASE-2B-W04-DISCERNMENT.json
   ========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKILL = 'C:/Users/Administrator/.workbuddy/skills/mos-music-song-discernment/tools/discern.js';
const { discern, render } = require(SKILL);

const P = {
  project: ROOT,
  framework: path.join(ROOT, 'content/framework/music-units.json'),
  songs: path.join(ROOT, 'content/songs'),
  annual: path.join(ROOT, 'content/annual/2027'),
};

const WEEK = '2027-W04';
const week = JSON.parse(fs.readFileSync(path.join(P.annual, 'weeks', `${WEEK}.json`), 'utf8'));
const s6 = week.seven_step_practice.S6_act.content;
const s7 = week.seven_step_practice.S7_transmit.content;

/* 候选范围：当前 Music Library 全部歌曲（不得自行制造歌曲资料） */
const candidates = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/songs/index.json'), 'utf8'))
  .songs.map((s) => s.song_id);

const results = candidates.map((id) => discern(P, WEEK, id, { proposedS6: s6, proposedS7: s7 }));

for (const r of results) {
  console.log('='.repeat(72));
  console.log(render(r));
}
console.log('='.repeat(72));
console.log('候选辨识汇总：');
console.log('| Song | Song_Relation | Primary | Decision | Tier | Review | HIGH风险 | HumanReview |');
console.log('|---|---|---|---|---|---|---|---|');
for (const r of results) {
  const high = r.risks.filter((x) => x.severity === 'HIGH').map((x) => x.code).join(',') || '—';
  console.log(`| ${r.candidate_song} | ${r.song_relation} | ${r.primary_function} | ${r.decision} | ${r.tier} | ${r.review_status} | ${high} | ${r.human_review_required ? 'YES' : 'NO'} |`);
}

if (process.argv.includes('--emit')) {
  const out = path.join(ROOT, 'docs/PHASE-2B-W04-DISCERNMENT.json');
  fs.writeFileSync(out, JSON.stringify({
    skill: 'mos-music-song-discernment@1.0.0',
    skill_status: 'Frozen',
    week: WEEK,
    upstream: {
      bible_passage: week.bible_passage_id,
      core_truth: week.core_truth.text,
      lq: week.life_question_id,
      mm: week.music_unit_id,
      music_function: week.music_function,
    },
    candidates: results,
  }, null, 2) + '\n');
  console.log(`\n已写出 ${path.relative(ROOT, out).replace(/\\/g, '/')}`);
}
