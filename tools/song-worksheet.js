#!/usr/bin/env node
/* =========================================================
   MOS-MUSIC｜Song Production Worksheet（单曲生产工作单生成 · V3.0）
   ---------------------------------------------------------
   标准：docs/standards/MOS-SONG-PRODUCTION-WORKSHEET-V1.0.md
        docs/standards/MOS-SONG-PRODUCTION-TEMPLATE-V1.0.md

   把「一首歌从立案到可发布」拆成 STEP00–STEP15 + 人工签核（A–J）。
   本工具只做**机械派生**：
     · 每一步的完成状态由 app/song-unit.js 的资源就绪表推导，不人工填写；
     · 缺口 / 下一步 / 签核表全部如实列出，缺就写缺；
     · 绝不写入歌词、简谱、音频、教学内容 —— 那是人的工作。

   用法：
     node tools/song-worksheet.js               # 生成 content/production/song-worksheets.json
     node tools/song-worksheet.js --check       # 只核对与 song-unit-levels.json 是否一致（不写盘）
     node tools/song-worksheet.js --md MUS-S-0001   # 打印某一首的工作单（Markdown，供人使用）
   ========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const writeJSON = (rel, obj) => fs.writeFileSync(path.join(ROOT, rel), JSON.stringify(obj, null, 2) + '\n');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const UNIT_INDEX = 'content/song-units/index.json';
const UNIT_LEVELS = 'content/production/song-unit-levels.json';
const WORKSHEET_OUT = 'content/production/song-worksheets.json';
const PKG_DIR = 'content/production/packages';

/* STEP00–STEP15（工作单 §三）。needs = 该步完成所依据的资源就绪键；
   gate = 该步完成后可声明的生产状态（状态机 §二）。 */
const STEPS = Object.freeze([
  { no: '00', key: 'intake', label: '立案与来源登记', goal: '把这首歌放进待制作库，并登记来源与版权来源状态。', needs: [], gate: null },
  { no: '01', key: 'verify_meta', label: '资料核对', goal: '核对歌名（中/英）、词曲作者、译词版本、调 / 拍号 / 速度 / 时长 / 段落结构。', needs: [], gate: 'VERIFYING' },
  { no: '02', key: 'choose_version', label: '确定采用版本', goal: '写明当前采用哪一个歌词版本与乐谱版本，避免同一首歌出现多个未说明版本。', needs: [], gate: null },
  { no: '03', key: 'lyrics_structure', label: '歌词结构化', goal: '歌词分节 / 分句，带 section_id / lyric_id / line_id（不得只留图片或 PDF）。', needs: ['lyrics'], gate: 'LYRICS_READY' },
  { no: '04', key: 'lyrics_proof', label: '歌词校对与教词要点', goal: '标出易读错 / 易唱错 / 词义 / 换气 / 长音 / 重音。', needs: ['lyrics'], gate: null },
  { no: '05', key: 'score_notation', label: '统一简谱记谱', goal: '调号 / 拍号 / 小节 / 时值 / 高低音点 / 附点 / 延音 / 休止 / 升降号。', needs: ['score'], gate: 'SCORE_READY' },
  { no: '06', key: 'lyric_alignment', label: '歌词与音符对齐', goal: '每个音符标注 lyric_line_id / lyric_char_index，供跟谱与逐字对齐。', needs: ['score'], gate: null },
  { no: '07', key: 'piano', label: '钢琴伴奏', goal: '第一阶段统一只做钢琴：节拍稳定、与歌一致、可循环、调一致。', needs: ['piano'], gate: 'PIANO_READY' },
  { no: '08', key: 'demo_male', label: '男声示唱', goal: '真人示唱：音准稳定、节奏清楚、咬字清楚、少混响、不过度修音。', needs: ['demo_male'], gate: 'DEMO_READY' },
  { no: '09', key: 'demo_female', label: '女声示唱', goal: '同男声标准；缺一则如实未提供，不得用合成声音冒充。', needs: ['demo_female'], gate: null },
  { no: '10', key: 'timeline', label: '分句时间轴', goal: '每句 start / end（秒）与小节范围 —— 单句循环、当前句高亮的地基。', needs: ['timeline'], gate: 'SYNC_READY' },
  { no: '11', key: 'cursor', label: '光标跟谱数据', goal: '只登记真实可用的跟随层级（句 / 小节 / 拍 / 音符 / 歌词）。', needs: ['cursor'], gate: null },
  { no: '12', key: 'teach_learn', label: '学唱教学', goal: '五步（听 → 跟 → 陪 → 自己唱 → 再唱一次）需词 / 谱 / 钢琴 / 至少一个示唱 / 时间轴齐备。', needs: ['teach_learn'], gate: 'TEACHING_READY' },
  { no: '13', key: 'teach_class', label: '教谱 / 教词 / 声乐提示', goal: '教谱要点随乐谱产生；教词要点随歌词整理产生；声乐只记这首歌真正需要的提示。', needs: ['teach_score', 'teach_lyrics', 'teach_vocal'], gate: null },
  { no: '14', key: 'teach_live', label: '真人教唱模块', goal: '短、碎、可重复利用（intro / 教谱 / 教节奏 / 教词 / 分句示范 / 声乐提示 / 完整示范）。', needs: ['teach_live'], gate: null },
  { no: '15', key: 'content_formation', label: '内容理解 / 生命实践 / 传唱', goal: '只写这首歌自身的内容层，文本必须可追溯（derived_from），不绑定某一周 / 某一课。', needs: [], gate: null },
]);

/* 资源包结构（工作单 §八）：发布时应齐备的资源件。 */
const RESOURCE_PACKAGE = Object.freeze([
  { key: 'lyrics_structured', label: '结构化歌词（分节 / 分句 / line_id）', needs: ['lyrics'] },
  { key: 'score_simple', label: '统一简谱（含歌词对齐）', needs: ['score'] },
  { key: 'piano_full', label: '钢琴伴奏（全曲）', needs: ['piano'] },
  { key: 'demo_male', label: '男声示唱', needs: ['demo_male'] },
  { key: 'demo_female', label: '女声示唱', needs: ['demo_female'] },
  { key: 'timeline', label: '分句时间轴', needs: ['timeline'] },
  { key: 'cursor_data', label: '光标跟谱数据', needs: ['cursor'] },
  { key: 'teaching', label: '教学内容（学唱 / 教谱 / 教词 / 声乐）', needs: ['teach_learn', 'teach_score', 'teach_lyrics', 'teach_vocal'] },
  { key: 'live_teaching', label: '真人教唱模块', needs: ['teach_live'] },
]);

const ACCEPTANCE_KEYS = ['data', 'lyrics', 'score', 'demo', 'piano', 'teaching', 'sync', 'live_teaching', 'content', 'rights'];
const ACCEPTANCE_LETTERS = { data: 'A', lyrics: 'B', score: 'C', demo: 'D', piano: 'E', teaching: 'F', sync: 'G', live_teaching: 'H', content: 'I', rights: 'J' };

async function build() {
  const U = await import(pathToFileURL(path.join(ROOT, 'app/song-unit.js')).href);
  const idx = readJSON(UNIT_INDEX);
  const levels = exists(UNIT_LEVELS) ? readJSON(UNIT_LEVELS) : null;
  const levelByUnit = new Map(((levels && levels.units) || []).map((x) => [x.unit_id, x]));

  const worksheets = [];
  for (const row of idx.units || []) {
    const unit = readJSON(row.file);
    const flags = U.unitFlags(unit);
    const summary = U.unitSummary(unit);
    const ready = (k) => (k === 'demo_any' ? flags.demo_any : Boolean(flags[k]));

    /* 生产工作包（PILOT 10）：阻断项与槽位状态取自 manifest（由 tools/build-packages.js 维护） */
    const pkgManifestRel = `${PKG_DIR}/${row.song_id}/manifest.json`;
    const pkgManifest = exists(pkgManifestRel) ? readJSON(pkgManifestRel) : null;

    const steps = STEPS.map((s) => {
      const done = s.needs.length ? s.needs.every(ready) : null; /* null = 无机械判据（人工/文本类） */
      return { no: s.no, key: s.key, label: s.label, goal: s.goal, state: done === null ? 'HUMAN' : (done ? 'DONE' : 'TODO'), gate: s.gate };
    });
    const firstTodo = steps.find((s) => s.state === 'TODO');
    const pkg = RESOURCE_PACKAGE.map((p) => ({ key: p.key, label: p.label, ready: p.needs.every(ready) }));
    const signoff = ACCEPTANCE_KEYS.map((k) => {
      const r = (unit.acceptance || {})[k] || {};
      return { key: k, letter: ACCEPTANCE_LETTERS[k], result: r.result || 'PENDING', reviewer: r.reviewer || null };
    });
    const acc = U.acceptanceSummary(unit);

    worksheets.push({
      song_id: row.song_id,
      unit_id: row.unit_id,
      unit_file: row.file,
      title_zh: (unit.song_meta && unit.song_meta.title_zh) || null,
      status: unit.status,
      level: summary.level,
      next_level: summary.next_level,
      next_action: summary.next_action,
      next_step: firstTodo ? firstTodo.no : null,
      steps,
      gaps: summary.missing_all,
      /* 阻断项（任务书 §十二）：来自生产工作包 manifest，人工原因逐条如实列出 */
      blocking: pkgManifest ? (pkgManifest.blocking_reasons || []) : [],
      package: pkgManifest ? {
        manifest_ref: pkgManifestRel,
        sample_role: pkgManifest.sample_role,
        production_order: pkgManifest.production_order,
        blocked: Boolean(pkgManifest.blocked),
        slots: pkgManifest.slots,
      } : null,
      resource_package: pkg,
      signoff,
      acceptance: { pass: acc.pass, revise: acc.revise, hold: acc.hold, pending: acc.pending, mechanically_complete: acc.mechanically_complete },
      release: {
        /* 机械就绪 ≠ 可发布：仍需人工签核（工作单 §二十四）。 */
        mechanical_ready: acc.mechanically_complete && pkg.every((p) => p.ready),
        signed_by: null,
        note: '发布必须由人工签核；本工具不代替签核，也不把 PENDING 当作通过。',
      },
    });
  }

  const counts = {
    songs_with_unit: worksheets.length,
    by_status: {},
    by_level: {},
    mechanical_ready: worksheets.reduce((n, w) => n + (w.release.mechanical_ready ? 1 : 0), 0),
    steps_total: STEPS.length,
    steps_done: worksheets.reduce((n, w) => n + w.steps.filter((s) => s.state === 'DONE').length, 0),
  };
  for (const w of worksheets) {
    counts.by_status[w.status] = (counts.by_status[w.status] || 0) + 1;
    counts.by_level[w.level] = (counts.by_level[w.level] || 0) + 1;
  }

  return {
    worksheets_version: 'MUS-V-1.0.0',
    generated_at: new Date().toISOString(),
    generated_by: 'tools/song-worksheet.js',
    derived: true,
    basis: '由 content/song-units/** 的资源就绪表推导（app/song-unit.js）；工具不写任何内容。',
    standard: 'docs/standards/MOS-SONG-PRODUCTION-WORKSHEET-V1.0.md',
    steps_vocabulary: STEPS.map((s) => ({ no: s.no, key: s.key, label: s.label, gate: s.gate })),
    signoff_letters: ACCEPTANCE_LETTERS,
    boundaries: [
      '工作单只派生「做到哪一步」，不代替人写歌词 / 简谱 / 音频 / 教学内容',
      '机械就绪 ≠ 可发布：release.signed_by 由人工填写，工具不代填',
      'PENDING 是尚未裁决，不等于通过',
      '不产生分数、排名、推荐；不自动升层、不自动改 Frozen 技能',
    ],
    counts,
    worksheets,
    note: 'PILOT 10：5 首公版歌（0001–0005）的英文公版歌词已结构化入包，0001 另有简谱草稿（DRAFT，未听校，不计入等级）；'
      + '5 首权利未判定歌（0006–0010）全部 NOT_AVAILABLE。中文译本与音频资源待人工提供 —— 这是真实状态，不是遗漏。',
  };
}

function toMarkdown(w, meta) {
  const L = [];
  L.push(`# 单曲生产工作单｜${w.title_zh || w.song_id}`);
  L.push('');
  L.push(`- 歌曲：${w.song_id}（单元 ${w.unit_id}）`);
  L.push(`- 生产状态：${w.status}　｜　完成等级：${w.level}${w.next_level ? ' → ' + w.next_level : ''}`);
  L.push(`- 下一步：STEP${w.next_action.key ? (w.next_step || '--') : '--'}　｜　下一状态：${w.next_action.target_status}`);
  L.push(`- 机械就绪：${w.release.mechanical_ready ? '是' : '否'}　｜　人工签核：${w.release.signed_by || '未签核'}`);
  L.push('');
  L.push('## 阻断项（缺什么就写什么，不虚构）');
  L.push('');
  L.push(w.blocking.length ? w.blocking.map((b) => `- ⛔ ${b}`).join('\n') : '- （当前无登记阻断项）');
  L.push('');
  L.push('## 生产工作包槽位（9 槽位）');
  L.push('');
  if (w.package && w.package.slots) {
    L.push('| 槽位 | 状态 |');
    L.push('| --- | --- |');
    for (const [k, v] of Object.entries(w.package.slots)) L.push(`| ${k} | ${v.status || '—'} |`);
    L.push('');
  }
  L.push('## STEP00–STEP15');
  L.push('');
  L.push('| 步骤 | 名称 | 状态 | 解锁状态 |');
  L.push('| --- | --- | --- | --- |');
  for (const s of w.steps) L.push(`| ${s.no} | ${s.label} | ${s.state} | ${s.gate || '—'} |`);
  L.push('');
  L.push('## 缺口');
  L.push('');
  L.push(w.gaps.length ? w.gaps.map((g) => `- ${meta(g)}`).join('\n') : '- （结构层面无缺口）');
  L.push('');
  L.push('## 资源包');
  L.push('');
  for (const p of w.resource_package) L.push(`- [${p.ready ? 'x' : ' '}] ${p.label}`);
  L.push('');
  L.push('## 签核（A–J）');
  L.push('');
  L.push('| 组 | 项目 | 结果 | 审核人 |');
  L.push('| --- | --- | --- | --- |');
  for (const s of w.signoff) L.push(`| ${s.letter} | ${s.key} | ${s.result} | ${s.reviewer || '—'} |`);
  L.push('');
  L.push('> 发布条件：资源包齐备 + A–J 全部裁决且无 REVISE / HOLD + 人工签核。');
  L.push('> 等级是派生结果：DRAFT 简谱不计入；不得手工宣布「完成」。');
  L.push('> 本工作单由工具派生，不代替人写内容，也不代替签核。');
  L.push('');
  return L.join('\n');
}

(async () => {
  const args = process.argv.slice(2);
  const idx = readJSON(UNIT_INDEX);
  const vocab = new Map(Object.entries(idx.requirement_labels || {}));

  if (args[0] === '--md') {
    const songId = args[1];
    if (!songId) { console.error('用法：node tools/song-worksheet.js --md MUS-S-0001'); process.exit(1); }
    const row = (idx.units || []).find((u) => u.song_id === songId);
    if (!row) { console.error(`未找到单曲单元：${songId}`); process.exit(1); }
    const data = await build();
    const w = data.worksheets.find((x) => x.song_id === songId);
    console.log(toMarkdown(w, (k) => vocab.get(k) || k));
    process.exit(0);
  }

  const data = await build();

  if (args.includes('--check')) {
    if (!exists(WORKSHEET_OUT)) { console.error('FAIL 工作单尚未生成'); process.exit(1); }
    const cur = readJSON(WORKSHEET_OUT);
    const a = JSON.stringify({ c: cur.counts, w: cur.worksheets });
    const b = JSON.stringify({ c: data.counts, w: data.worksheets });
    if (a !== b) { console.error('FAIL 工作单与单元资源不一致（请重新生成）'); process.exit(1); }
    let bad = 0;
    for (const w of data.worksheets) {
      if (!w.package) continue;
      const mdRel = `${PKG_DIR}/${w.song_id}/MOS-SU-${String(w.unit_id).slice(-4)}_WORKSHEET.md`;
      if (!exists(mdRel)) { console.error(`FAIL 缺失生产包工作单：${mdRel}`); bad += 1; }
    }
    if (bad) process.exit(1);
    console.log(`OK   ${WORKSHEET_OUT}`);
    console.log(`工作单：${data.counts.songs_with_unit} 首 ｜ 机械就绪 ${data.counts.mechanical_ready} 首 ｜ 已完成步骤 ${data.counts.steps_done}/${data.counts.steps_total * data.counts.songs_with_unit}`);
    process.exit(0);
  }

  writeJSON(WORKSHEET_OUT, data);
  /* 任务书 §十二：为每首歌在生产工作包内生成 MOS-SU-xxxx_WORKSHEET.md */
  let mdCount = 0;
  for (const w of data.worksheets) {
    if (!w.package) continue;
    const mdRel = `${PKG_DIR}/${w.song_id}/MOS-SU-${String(w.unit_id).slice(-4)}_WORKSHEET.md`;
    fs.writeFileSync(path.join(ROOT, mdRel), toMarkdown(w, (k) => vocab.get(k) || k));
    mdCount += 1;
  }
  console.log(`已生成 ${WORKSHEET_OUT}`);
  console.log(`已生成生产包工作单 ×${mdCount}（content/production/packages/*/MOS-SU-xxxx_WORKSHEET.md）`);
  console.log(`工作单：${data.counts.songs_with_unit} 首 ｜ 机械就绪 ${data.counts.mechanical_ready} 首 ｜ 状态 ${JSON.stringify(data.counts.by_status)} ｜ 等级 ${JSON.stringify(data.counts.by_level)}`);
})();
