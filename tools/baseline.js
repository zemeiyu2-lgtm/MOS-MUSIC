#!/usr/bin/env node
/* =========================================================
   MOS-MUSIC｜Baseline Builder（N3 修正 + CI-0014 案 a）
   ---------------------------------------------------------
   问题（CI-0003 / N3）：旧做法用**一份**哈希清单同时表达
     「不许变」与「允许增长」两种语义，导致新增正常生产内容
     必然被判为「基线被破坏」。

   问题（CI-0014，曲库维度上的同类缺陷）：主题歌曲计数与歌曲经文锚点
     索引原本写在冻结文件里，于是「正常扩库」也必然被判为基线被破坏。

   修正（三份语义清晰的清单）：
     immutable  真正必须保持不变的：已冻结技能、冻结校准用例、
                W01–W04 历史裁决、核心规则（Schema 与上游模型数据：
                24 课 / MAP / MM 母库 / 主题 / 培训 / 模板 / 处境 / 经文引用）
     production 可以正常增加的：曲库、曲库登记层、生产平台数据、年度索引
     program    可随版本演进的：程序、流水线、文档

   案 a 附加规则（派生索引）：
     · 主题歌曲计数 → content/production/theme-song-counts.json
     · 歌曲经文锚点 → content/production/song-scripture-index.json
     二者与使用历史、库级辨识结果同属 Derived Index，随曲库正常变化，
     一律位于 content/production/**（production 作用域），不在不可变清单内。
     本脚本带守卫：不可变清单中一旦出现派生数据文件即报错退出。

   回归判定：
     immutable 不一致 → **失败**（基线被破坏）
     production / program 变化 → **仅报告**（正常演进）

   纪律：本脚本**不**用「重生成」来掩盖真实漂移 —— 每次运行都会把
     immutable 清单的实际变化（新增/移除/哈希变化）追加进 scope_change_log，
     供人工审计，而不是静默覆盖。

   用法：node tools/baseline.js
   ========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SKILL_DIR = 'C:/Users/Administrator/.workbuddy/skills/mos-music-song-discernment';

const IMMUTABLE_FROZEN_WEEKS = ['W01', 'W02', 'W03', 'W04'];

/* Immutable Baseline：相对项目根的路径前缀 / 具体文件 */
const IMMUTABLE_TREES = [
  'content/schema',
  'content/bible',
  'content/courses',
  'content/themes',
  'content/training',
  'content/templates',
  'content/contexts',
  'content/map',
  'content/framework',
];
const IMMUTABLE_FILES = [
  ...IMMUTABLE_FROZEN_WEEKS.map((w) => `content/annual/2027/weeks/2027-${w}.json`),
  ...IMMUTABLE_FROZEN_WEEKS.map((w) => `content/annual/2027/units/MUS-U-2027-${w}.json`),
  'docs/MODEL-CALIBRATION-V1.0.md',
  'docs/PHASE-2A-THEOLOGICAL-REVIEW.md',
  'docs/SKILL-SONG-DISCERNMENT-V1.0.md',
  'docs/SKILL-SONG-DISCERNMENT-BACKTEST-W01-W03.md',
  'docs/RESEARCH-FINDINGS-PHASE-2A.md',
  'docs/PHASE-2B-W04-DISCERNMENT.json',
];

/* Production Content：允许正常增加的 */
const PRODUCTION_TREES = ['content/songs', 'content/production', 'content/library'];
const PRODUCTION_FILES = [
  'content/annual/2027/annual.json',
  'content/annual/2027/index.json',
  'content/library/index.json',
];
/* Derived Index（案 a）：随曲库正常增长的派生视图，绝不允许出现在不可变清单里 */
const DERIVED_TREES = ['content/production', 'content/library'];
const DERIVED_FILES = [
  'content/production/theme-song-counts.json',
  'content/production/song-scripture-index.json',
  'content/production/library-usage.json',
  'content/production/song-discernment-v0.5.json',
  'content/production/library-report.json',
];
const MANIFEST_FILES = [
  'content/production/baseline-immutable.json',
  'content/production/production-manifest.json',
];

/* Program：可随版本演进 */
const PROGRAM_TREES = ['app', 'tools', 'tests', 'docs', '.github'];
const PROGRAM_FILES = ['index.html', 'offline.html', 'manifest.json', 'sw.js', 'README.md'];

const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);

function listFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, acc);
    else acc.push(p);
  }
  return acc;
}
const rp = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

function collect(trees, files) {
  const out = [];
  for (const t of trees) {
    for (const f of listFiles(path.join(ROOT, t))) out.push(rp(f));
  }
  for (const f of files) {
    if (fs.existsSync(path.join(ROOT, f))) out.push(f);
  }
  return [...new Set(out)].sort();
}

function hashSkillFiles() {
  const out = {};
  if (!fs.existsSync(SKILL_DIR)) return out;
  const targets = [
    'SKILL.md', 'README.md', 'tools/discern.js',
    'tests/backtest-w01-w03.json',
  ];
  for (const t of targets) {
    const p = path.join(SKILL_DIR, t);
    if (fs.existsSync(p)) out[`skill:mos-music-song-discernment/${t}`] = hash(p);
  }
  const ex = path.join(SKILL_DIR, 'examples');
  if (fs.existsSync(ex)) {
    for (const f of fs.readdirSync(ex).filter((f) => f.endsWith('.json')).sort()) {
      out[`skill:mos-music-song-discernment/examples/${f}`] = hash(path.join(ex, f));
    }
  }
  return out;
}

function main() {
  const immutableList = collect(IMMUTABLE_TREES, IMMUTABLE_FILES);
  const immutableSet = new Set(immutableList);

  /* 守卫（案 a）：不可变清单里不得出现派生索引/登记层文件 */
  const leaked = immutableList.filter((p) => DERIVED_TREES.some((t) => p.startsWith(t + '/')));
  if (leaked.length) {
    console.error('ERROR 不可变清单中混入派生/生产作用域文件（CI-0014 案 a 禁止）：');
    for (const p of leaked) console.error('  ' + p);
    process.exit(1);
  }

  const productionList = collect(PRODUCTION_TREES, PRODUCTION_FILES)
    .filter((p) => !immutableSet.has(p) && !MANIFEST_FILES.includes(p));
  const programList = collect(PROGRAM_TREES, PROGRAM_FILES)
    .filter((p) => !immutableSet.has(p) && !MANIFEST_FILES.includes(p) && !productionList.includes(p));

  const immutable = {};
  for (const p of immutableList) immutable[p] = hash(path.join(ROOT, p));
  Object.assign(immutable, hashSkillFiles());

  const production = {};
  for (const p of productionList) production[p] = hash(path.join(ROOT, p));

  const program = {};
  for (const p of programList) program[p] = hash(path.join(ROOT, p));

  const now = new Date().toISOString();

  /* 审计：把 immutable 清单的实际变化追加进 scope_change_log，而不是静默覆盖 */
  let previous = null;
  if (fs.existsSync(path.join(ROOT, MANIFEST_FILES[0]))) {
    try { previous = JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST_FILES[0]), 'utf8')); }
    catch (_) { previous = null; }
  }
  const log = (previous && Array.isArray(previous.scope_change_log)) ? previous.scope_change_log.slice() : [];
  let appended = null;
  if (previous && previous.files) {
    const added = Object.keys(immutable).filter((k) => !(k in previous.files));
    const removed = Object.keys(previous.files).filter((k) => !(k in immutable));
    const changed = Object.keys(immutable).filter((k) => k in previous.files && previous.files[k] !== immutable[k]);
    if (added.length || removed.length || changed.length) {
      appended = {
        at: now,
        previous_baseline_version: previous.baseline_version || null,
        added,
        removed,
        changed,
        reason: '见 CI-0014 案 a：把随曲库正常增长而变化的派生计数/登记从不可变基线移出；'
          + '本条由工具自动记录（不静默覆盖），供人工审计是否为规则性改动而非掩盖真实漂移。',
      };
      log.push(appended);
    }
  }

  const baseOut = {
    baseline_version: 'MUS-V-0.5.0',
    generated_at: now,
    generated_by: 'tools/baseline.js',
    note: 'Immutable Baseline：真正必须保持不变的内容（已冻结技能、冻结校准用例、W01–W04 历史裁决、核心规则）。回归中任何不一致即为失败。',
    immutable_scope: [
      'content/schema/**（判定与数据契约，含曲库登记层契约）',
      'content/bible|courses|themes|training|templates|contexts|map|framework/**（上游模型数据）',
      'content/annual/2027/weeks|units 的 W01–W04（历史裁决）',
      'docs/MODEL-CALIBRATION-V1.0.md 等冻结校准文档',
      'docs/PHASE-2B-W04-DISCERNMENT.json（W04 辨识留档）',
      'skill:mos-music-song-discernment/**（已冻结技能本体与校准用例）',
    ],
    derived_scope: [
      'content/production/theme-song-counts.json（主题歌曲计数，由曲库推导）',
      'content/production/song-scripture-index.json（歌曲经文锚点索引）',
      'content/production/library-usage.json（使用历史）',
      'content/production/song-discernment-v0.5.json（库级歌基层辨识结果）',
      'content/library/**（曲库登记层）',
    ],
    derived_rule: '案 a：随曲库正常增长而变化的一律归派生索引（content/production/** 与 content/library/**），'
      + '不进本清单；因此正常扩库不产生 baseline drift。本清单若混入派生文件，构建脚本直接报错。',
    frozen_weeks: IMMUTABLE_FROZEN_WEEKS,
    counts: { immutable: Object.keys(immutable).length, skill_files: Object.keys(immutable).filter((k) => k.startsWith('skill:')).length },
    scope_change_log: log,
    files: immutable,
  };

  const prodOut = {
    manifest_version: 'MUS-V-0.5.0',
    generated_at: now,
    generated_by: 'tools/baseline.js',
    note: 'Production Content / Derived Index / Program：允许正常增加或演进。回归中变化只作报告，不判失败。',
    production_scope: [
      'content/songs/**（曲库详情层可扩容）',
      'content/library/**（曲库登记层：候选清单与入库登记）',
      'content/production/**（生产平台数据与派生索引）',
      'content/annual/2027/annual.json 与 index.json（随周次增加更新）',
      'content/annual/2027/weeks|units 的 W05 及以后',
    ],
    derived_files: DERIVED_FILES,
    program_scope: [
      'app/**（程序层）',
      'tools/** / tests/** / .github/**（工具、测试、流水线）',
      'docs/**（文档，除冻结校准文档）',
      'index.html / offline.html / manifest.json / sw.js',
    ],
    excluded_manifests: MANIFEST_FILES,
    counts: { production: Object.keys(production).length, program: Object.keys(program).length },
    production,
    program,
  };

  fs.writeFileSync(path.join(ROOT, MANIFEST_FILES[0]), JSON.stringify(baseOut, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, MANIFEST_FILES[1]), JSON.stringify(prodOut, null, 2) + '\n');

  console.log(`baseline written: immutable=${baseOut.counts.immutable}（其中技能文件 ${baseOut.counts.skill_files}）`);
  console.log(`manifest written: production=${prodOut.counts.production}  program=${prodOut.counts.program}`);
  if (appended) {
    console.log(`scope_change_log 追加 1 条（共 ${log.length} 条）：新增 ${appended.added.length}｜移除 ${appended.removed.length}｜变化 ${appended.changed.length}`);
    for (const p of appended.changed) console.log(`  CHANGED ${p}`);
    for (const p of appended.added) console.log(`  ADDED   ${p}`);
  } else {
    console.log(`scope_change_log 无新增（共 ${log.length} 条）：immutable 清单与上次一致`);
  }
  process.exit(0);
}

main();
