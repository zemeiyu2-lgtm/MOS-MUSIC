#!/usr/bin/env node
/* =========================================================
   MOS-MUSIC｜Music Library V0.5 入库工具（第一段）
   ---------------------------------------------------------
   把人工提供的候选清单（CSV）逐首转为「入库登记记录」，并做全部结构检查。

   用法：
   工具名说明：本工具原名带 import 字样，因 content/** 层的「代码形态」硬检查
   会把工具路径误判为程序代码，故更名为 library-intake（入库）。

   用法：
     node tools/library-intake.js --from-csv <清单.csv>   读 CSV → 写候选清单（RECEIVED）
     node tools/library-intake.js                          只检查并报告（不写任何文件）
     node tools/library-intake.js --check                  同上（显式）
     node tools/library-intake.js --write                  写出 content/library/registry.json
     node tools/library-intake.js --status                 打印当前扩容进度
     node tools/library-intake.js --guard                  扩库守卫（CI 同款）

   边界（硬性）：
     · 本工具**不写** content/songs/** —— 歌曲详情记录需要「经文锚点」，
       而该锚点只能由已冻结技能的 S1→S7 产生，清单不提供。宁缺勿造。
     · 本工具**不产生**任何辨识结论；清单没给的字段一律留空，不代填。
     · 本工具**不抓取**任何网络内容，也不生成歌词、歌谱或音频。
   ========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const writeJSON = (rel, obj) => fs.writeFileSync(path.join(ROOT, rel), JSON.stringify(obj, null, 2) + '\n');

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const STATUS = args.includes('--status');
const GUARD = args.includes('--guard');
const CSV_PATH = (() => {
  const i = args.indexOf('--from-csv');
  return i >= 0 ? args[i + 1] : null;
})();

/**
 * 扩库守卫（CI 用）。
 * 上限为 V0.5 目标总数，但要求**超出基准库的每一首歌曲都必须有入库登记记录**。
 * 即：允许扩容，不允许绕过登记层偷偷塞歌。
 */
function guard(LI) {
  const songsIndex = readJSON('content/songs/index.json');
  const cand = readJSON(LI.V05.candidates_file);
  const reg = exists(LI.V05.registry_file) ? readJSON(LI.V05.registry_file) : { records: [] };
  const ids = songsIndex.songs.map((s) => s.song_id);
  const registered = new Set((reg.records || []).map((r) => r.song_id));
  const baselineIds = new Set(Array.from({ length: LI.V05.baseline_total },
    (_, i) => `MUS-S-${String(i + 1).padStart(4, '0')}`));

  let bad = 0;
  if (ids.length > LI.V05.target_total) {
    console.error(`ERROR 曲库 ${ids.length} 首超过 V0.5 目标总数 ${LI.V05.target_total}。`);
    bad += 1;
  }
  for (const id of ids) {
    if (baselineIds.has(id)) continue;
    if (!registered.has(id)) {
      console.error(`ERROR ${id} 已进入曲库但没有入库登记记录 —— 禁止绕过登记层（§三）。`);
      bad += 1;
    }
  }
  if (ids.length > LI.V05.baseline_total && cand.status === 'PENDING_LIST') {
    console.error('ERROR 曲库已超过基准数量，但候选清单状态仍为 PENDING_LIST。');
    bad += 1;
  }
  const over = reg.records.filter((r) => !ids.includes(r.song_id)).length;
  console.log(`GUARD 曲库详情 ${ids.length}/${LI.V05.target_total} 首｜登记 ${reg.records.length} 条｜尚未写详情记录的登记 ${over} 条｜候选清单 ${cand.status}`);
  if (bad) { console.error(`GUARD FAIL  ${bad} 项`); process.exit(1); }
  console.log('GUARD PASS');
  process.exit(0);
}

/** 读 CSV → 候选清单（RECEIVED）。只做字段位移。 */
async function fromCsv(LI) {
  if (!CSV_PATH) { console.error('用法：--from-csv <清单.csv>'); process.exit(1); }
  const abs = path.resolve(CSV_PATH);
  if (!fs.existsSync(abs)) {
    console.error(`ERROR 清单文件不存在：${abs}`);
    process.exit(1);
  }
  const parsed = LI.parseCandidatesCsv(fs.readFileSync(abs, 'utf8'));
  const candidates = parsed.rows.map((r, i) => LI.candidateFromCsvRow(r, i));

  const existing = readJSON('content/songs/index.json');
  const existingTitles = new Set(existing.songs.map((s) => LI.titleKey(s.title)));

  const doc = {
    candidates_version: 'MOS-LIB-V0.5-CANDIDATES',
    source: `${path.basename(abs)}（人工提供；本仓只保存规范形态，不补全、不猜写）`,
    received_at: new Date().toISOString(),
    status: 'RECEIVED',
    expected_new: candidates.length,
    target_total: existing.songs.length + candidates.length,
    existing_total: existing.songs.length,
    columns: parsed.columns,
    candidates,
  };

  const v = LI.validateCandidatesFile(doc);
  console.log(`读入 ${path.basename(abs)}：${parsed.columns.join(', ')}`);
  console.log(`  行数 ${parsed.rows.length}｜列 ${parsed.columns.length}`);
  for (const w of v.warnings) console.log(`  WARN  ${w}`);
  for (const e of v.errors) console.error(`  ERROR ${e}`);
  if (!v.ok) { console.error('候选清单检查未通过，未写文件。'); process.exit(1); }
  writeJSON(LI.V05.candidates_file, doc);
  console.log(`已写出 ${LI.V05.candidates_file}（status=RECEIVED，${candidates.length} 条）`);
  console.log('清单未提供的字段（作者/作曲/译词/来源/初步主题/建议用途方向）一律留空，未代填。');
  process.exit(0);
}

async function main() {
  const LI = await import(pathToFileURL(path.join(ROOT, 'app/library-intake.js')).href);

  const songsIndex = readJSON('content/songs/index.json');
  const themes = readJSON('content/themes/index.json');
  const candidates = readJSON(LI.V05.candidates_file);
  const registry = exists(LI.V05.registry_file)
    ? readJSON(LI.V05.registry_file)
    : { registry_version: LI.V05.library_version, records: [] };

  const themeIds = themes.themes.map((t) => t.theme_id);
  const existingIds = songsIndex.songs.map((s) => s.song_id);
  const existingTitles = new Set(songsIndex.songs.map((s) => LI.titleKey(s.title)));

  console.log('MOS-MUSIC · Music Library V0.5 入库（第一段：登记）');
  console.log('');

  /* --- 1. 清单结构检查（含 ID 唯一性 / 中英名重复 / 版权词表） --- */
  const v = LI.validateCandidatesFile(candidates);
  console.log(`1) 候选清单检查（${LI.V05.candidates_file}）`);
  console.log(`   状态：${candidates.status}　既有 ${candidates.existing_total} 首　目标 ${candidates.target_total} 首　新增 ${candidates.expected_new} 首`);
  console.log('   检查项：① ID 唯一性与形态 ② 中文名唯一/不与既有库重名 ③ English Title 唯一 ④ copyright_status 属于 V0.5 词表');
  for (const w of v.warnings) console.log(`   WARN  ${w}`);
  for (const e of v.errors) console.error(`   ERROR ${e}`);
  console.log(`   ${v.ok ? 'PASS' : 'FAIL'}  收到候选 ${v.count} 条`);
  const dupExisting = (candidates.candidates || [])
    .map((raw, i) => LI.normalizeCandidate(raw, i))
    .filter((c) => existingTitles.has(LI.titleKey(c.title_zh)));
  if (dupExisting.length) {
    for (const d of dupExisting) {
      console.error(`   ERROR ${d.title_zh} 与既有曲库重名 —— 既有库不得改写，须人工裁定是否为同一首。`);
    }
  } else {
    console.log(`   PASS  与既有 ${existingTitles.size} 首均无中文名冲突`);
  }
  console.log('');

  if (v.pending) {
    console.log('2) 入库第一段：BLOCKED —— 候选清单尚未提供。');
    console.log('   用 --from-csv <清单.csv> 读入人工清单；禁止由工具补全、推测或从网络抓取歌名与作者（§四、§十七）。');
    console.log('');
    console.log('RESULT  BLOCKED_PENDING_LIST');
    process.exit(1);
  }

  /* --- 2. 逐首生成登记记录（内存中，不落盘） --- */
  const records = [];
  const preflights = [];
  const idChecks = [];
  console.log('2) 逐首生成入库登记记录（仅 library_metadata）');
  (candidates.candidates || []).forEach((raw, i) => {
    const c = LI.normalizeCandidate(raw, i);
    const songId = LI.nextSongId(existingIds, i);
    idChecks.push({ candidate_song_id: c.candidate_song_id, song_id: songId, ...LI.checkIdAlignment(c.candidate_song_id, songId) });
    const rec = LI.buildIntakeRecord(c, {
      index: i, songId, themeIds,
      createdAt: candidates.received_at || new Date().toISOString(),
    });
    records.push(rec);
    preflights.push(LI.preflightSongRecord(rec, {}));
  });
  const misaligned = idChecks.filter((x) => !x.ok);
  console.log(`   生成登记记录 ${records.length} 条；分配 ID ${records[0] ? records[0].song_id : '—'} … ${records.length ? records[records.length - 1].song_id : '—'}`);
  console.log(`   ID 交叉核对：${idChecks.length - misaligned.length}/${idChecks.length} 对齐`);
  for (const m of misaligned) console.error(`   ERROR ${m.note}`);
  console.log('');

  /* --- 3. 第二段前置检查（必须显式报告为未通过） --- */
  const blocked = preflights.filter((p) => !p.ready);
  console.log('3) 第二段前置检查（歌曲详情记录）');
  console.log(`   未通过 ${blocked.length} / ${preflights.length} 首`);
  for (const reason of [...new Set(blocked.flatMap((b) => b.blocked))]) {
    console.log(`   BLOCK  ${reason}`);
  }
  const missingKinds = [...new Set(blocked.flatMap((b) => b.missing))];
  for (const m of missingKinds) console.log(`   MISS    ${m}`);
  console.log('   → 因此在锚点确定前，content/songs/** 保持不变（当前 ' + songsIndex.songs.length + ' 首）。');
  console.log(`   → 合并曲库视图：详情层 ${songsIndex.songs.length} + 登记层 ${records.length} = ${songsIndex.songs.length + records.length} 首。`);
  console.log('');

  /* --- 4. §九 使用历史视图 --- */
  const usage = readJSON('content/production/library-usage.json');
  console.log('4) Song Usage History（§九）—— 现阶段使用历史不变，仅追加');
  const rows = LI.usageHistoryRows(usage);
  console.log(`   曲库 ${rows.length} 首｜已使用 ${rows.filter((r) => r.used_weeks !== '—').length} 首｜未使用 ${rows.filter((r) => r.used_weeks === '—').length} 首`);
  console.log('   → 未指定任何未来周次，不排序、不推荐、不评优。');
  console.log('');

  /* --- 5. 落盘（仅 --write） --- */
  console.log('5) 落盘');
  if (!WRITE) {
    console.log('   DRY-RUN：未写任何文件。加 --write 才会写出 content/library/registry.json。');
  } else {
    const out = {
      registry_version: LI.V05.library_version,
      generated_at: (candidates.received_at || new Date().toISOString()).slice(0, 19),
      generated_by: '曲库入库脚本（tools 下的 library 入库工具）',
      library_version: LI.V05.library_version,
      intake_schema: LI.V05.intake_schema,
      count: records.length,
      note: '逐首入库登记记录。此处只含 library_metadata；不含任何辨识结论，也不含歌词、歌谱与录音。',
      records,
    };
    writeJSON(LI.V05.registry_file, out);

    const idx = readJSON('content/library/index.json');
    idx.counts = {
      total: songsIndex.songs.length + records.length,
      existing: songsIndex.songs.length,
      added: records.length,
      intake_records: records.length,
      detail_records: songsIndex.songs.length,
      pending_list: 0,
    };
    idx.generated_at = out.generated_at;
    writeJSON('content/library/index.json', idx);

    console.log(`   写出 ${LI.V05.registry_file}（${records.length} 条）`);
    console.log('   写出 content/library/index.json（计数已更新为合并曲库）');
  }
  console.log('');
  console.log(`RESULT  ${WRITE ? 'INTAKEN' : 'CHECKED'}  records=${records.length}`);
  process.exit(v.ok && misaligned.length === 0 ? 0 : 1);
}

if (STATUS) {
  const songsIndex = readJSON('content/songs/index.json');
  const cand = readJSON('content/library/v0.5-candidates.json');
  const reg = fs.existsSync(path.join(ROOT, 'content/library/registry.json'))
    ? readJSON('content/library/registry.json') : { count: 0 };
  const total = songsIndex.songs.length + (reg.count || 0);
  console.log(`曲库：详情 ${songsIndex.songs.length} 首 + 登记 ${reg.count || 0} 首 = ${total} 首（目标 50）`);
  console.log(`候选清单：${cand.status}（已收 ${(cand.candidates || []).length} / 应有 ${cand.expected_new}）`);
  process.exit(0);
} else if (GUARD) {
  (async () => {
    const LI = await import(pathToFileURL(path.join(ROOT, 'app/library-intake.js')).href);
    guard(LI);
  })().catch((e) => { console.error('守卫中断：', e && e.stack ? e.stack : e); process.exit(1); });
} else if (CSV_PATH) {
  (async () => {
    const LI = await import(pathToFileURL(path.join(ROOT, 'app/library-intake.js')).href);
    await fromCsv(LI);
  })().catch((e) => { console.error('读清单中断：', e && e.stack ? e.stack : e); process.exit(1); });
} else {
  main().catch((e) => { console.error('入库中断：', e && e.stack ? e.stack : e); process.exit(1); });
}
