#!/usr/bin/env node
/* =========================================================
   MOS-MUSIC｜Derived Index Builder（CI-0014 案 a 的落地工具）
   ---------------------------------------------------------
   案 a 的裁决：

     Immutable Baseline 只冻结真正不可变的：
       已冻结技能 / 冻结校准用例 / W01–W04 历史裁决 / 核心规则（Schema 与上游模型）
     Production Content / Derived Index 允许正常变化：
       曲库 / 主题歌曲计数 / 经文引用索引 / 使用历史 / 生产记录

   因此把两个「会随曲库正常增长而变化」的索引从冻结文件里搬出来，
   改为由本工具从实际数据推导的派生视图：

     1) content/production/theme-song-counts.json
        主题歌曲计数。原来手写在 content/themes/index.json 的 song_count 里，
        一扩库就必须改冻结文件 → 「正常扩库」被误判为基线被破坏。
     2) content/production/song-scripture-index.json
        歌曲经文锚点索引。原来必须往 content/bible/reference-index.json 里加行，
        而那是上游（52W/课程）经文登记表，不该为歌曲扩张而变动。

   关键纪律：派生索引只**读取**曲库，绝不写入冻结文件；
   新增歌曲 → 派生索引变化 → Immutable Baseline 不变。

   用法：node tools/derive-indexes.js
   ========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const writeJSON = (rel, obj) => fs.writeFileSync(path.join(ROOT, rel), JSON.stringify(obj, null, 2) + '\n');

const THEME_COUNTS_FILE = 'content/production/theme-song-counts.json';
const SCRIPTURE_INDEX_FILE = 'content/production/song-scripture-index.json';

/**
 * 纯函数：从曲库与登记层推导航点索引。
 * 只读输入，不修改任何传入对象（扩库安全性的单元测试就靠这一点）。
 */
function derive({ songsIndex, registry, themes, promotions }) {
  const detailSongs = (songsIndex && songsIndex.songs) || [];
  const detailRecords = detailSongs.map((row) => readJSON(row.file));
  const detailIds = new Set(detailRecords.map((s) => s.song_id));
  const intakeRecords = (registry && registry.records) || [];
  const promotedIds = new Set(((promotions && promotions.promotions) || []).map((p) => p.song_id));

  /* --- 1. 主题歌曲计数（口径：歌曲详情的 discipleship.main_theme） --- */
  const themeRows = ((themes && themes.themes) || []).map((t) => ({
    theme_id: t.theme_id,
    name: t.name,
    song_count: detailRecords.filter((s) => s.discipleship && s.discipleship.main_theme === t.theme_id).length,
  }));

  /* --- 2. 歌曲经文锚点索引（口径：歌曲详情的 bible.core_passage） ---
     已升层的歌曲由详情记录承载锚点；仍在登记层的不再重复出现（升层不是「两首」）。
     登记层字段契约被冻结，所以升层关系由 content/production/library-promotions.json 单独声明。 */
  const anchors = [
    ...detailRecords.map((s) => ({
      song_id: s.song_id,
      layer: 'detail',
      promoted: promotedIds.has(s.song_id),
      core_passage: (s.bible && s.bible.core_passage) || null,
      status: (s.bible && s.bible.core_passage) ? 'registered' : 'pending',
      basis: '歌曲详情记录 bible.core_passage',
    })),
    ...intakeRecords.filter((r) => !detailIds.has(r.song_id)).map((r) => ({
      song_id: r.song_id,
      layer: 'intake',
      promoted: false,
      core_passage: null,
      status: 'pending',
      basis: '仅登记层：经文锚点尚未认定，不得凭常识代填；认定口径见 docs/ADR/ADR-0013',
    })),
  ].sort((a, b) => a.song_id.localeCompare(b.song_id));

  return {
    themeCounts: {
      counts_version: 'MUS-V-0.5.0',
      generated_at: new Date().toISOString(),
      generated_by: '派生索引脚本（tools 下的 derive 工具）',
      derived: true,
      basis: '曲库详情层的 discipleship.main_theme（一歌一主主题）',
      detail_total: detailRecords.length,
      intake_total: intakeRecords.length,
      note: '本文件是派生视图，不是权威源：权威源是曲库本身。'
        + '案 a 裁决后，主题歌曲计数不再写在 content/themes/index.json（上游模型文件）里，'
        + '以免正常扩库被判为不可变基线漂移。',
      themes: themeRows,
      unmapped: detailRecords
        .filter((s) => !themeRows.some((t) => t.theme_id === (s.discipleship && s.discipleship.main_theme)))
        .map((s) => s.song_id),
    },
    scriptureIndex: {
      index_version: 'MUS-V-0.5.0',
      generated_at: new Date().toISOString(),
      generated_by: '派生索引脚本（tools 下的 derive 工具）',
      derived: true,
      upstream_registry: 'content/bible/reference-index.json',
      upstream_note: '上游经文登记表（52W / 课程）保持冻结；歌曲锚点不进该文件，改由本派生索引承载。',
      counts: {
        total: anchors.length,
        registered: anchors.filter((a) => a.status === 'registered').length,
        pending: anchors.filter((a) => a.status === 'pending').length,
        promoted: anchors.filter((a) => a.promoted).length,
      },
      anchors,
      note: '歌曲经文锚点索引。status=pending 表示锚点尚未认定，此时不得写歌曲详情记录，也不得为填满必填字段而代填经文。'
        + '升层后的歌曲只在此处出现一次（其登记层记录不再重复计入）。',
    },
  };
}

/** 比较派生结果与已落盘文件（忽略时间戳：时间戳不参与一致性判定） */
function stripStamp(obj) {
  const copy = JSON.parse(JSON.stringify(obj));
  delete copy.generated_at;
  return copy;
}

async function main() {
  const LI = await import(pathToFileURL(path.join(ROOT, 'app/library-intake.js')).href);
  const songsIndex = readJSON('content/songs/index.json');
  const themes = readJSON('content/themes/index.json');
  const registry = fs.existsSync(path.join(ROOT, LI.V05.registry_file))
    ? readJSON(LI.V05.registry_file) : { records: [] };
  const promotions = fs.existsSync(path.join(ROOT, LI.V05.promotions_file))
    ? readJSON(LI.V05.promotions_file) : { promotions: [] };

  /* CI-0014 案 a 的守卫：冻结文件里不得再出现随曲库变化的派生字段 */
  const legacy = themes.themes.filter((t) => Object.prototype.hasOwnProperty.call(t, 'song_count'));
  if (legacy.length) {
    console.error(`ERROR content/themes/index.json 仍有 ${legacy.length} 个 song_count 字段 —— 案 a 要求该计数归派生视图。`);
    process.exit(1);
  }

  const out = derive({ songsIndex, registry, themes, promotions });

  if (process.argv.includes('--check')) {
    const pairs = [
      [THEME_COUNTS_FILE, out.themeCounts],
      [SCRIPTURE_INDEX_FILE, out.scriptureIndex],
    ];
    let bad = 0;
    for (const [file, fresh] of pairs) {
      if (!fs.existsSync(path.join(ROOT, file))) { console.error(`FAIL 缺失派生索引：${file}`); bad++; continue; }
      const onDisk = readJSON(file);
      if (onDisk.derived !== true) { console.error(`FAIL ${file} 未声明 derived=true`); bad++; }
      const a = JSON.stringify(stripStamp(onDisk));
      const b = JSON.stringify(stripStamp(fresh));
      if (a !== b) { console.error(`FAIL ${file} 与曲库不一致（需重新生成派生索引）`); bad++; }
      else console.log(`OK   ${file}`);
    }
    if (bad) process.exit(1);
    const merged = LI.mergeLibrary({ songsIndex, registry, promotions });
    console.log(`派生索引一致性检查通过：主题计数 ${out.themeCounts.themes.length} 项；经文锚点 ${out.scriptureIndex.counts.total} 条（已登记 ${out.scriptureIndex.counts.registered} / 待认定 ${out.scriptureIndex.counts.pending}）；合并曲库 ${merged.total} 首（详情 ${merged.detail_count} + 登记待升层 ${merged.intake_count}）。`);
    process.exit(0);
  }

  writeJSON(THEME_COUNTS_FILE, out.themeCounts);
  writeJSON(SCRIPTURE_INDEX_FILE, out.scriptureIndex);

  console.log(`已写出 ${THEME_COUNTS_FILE}（${out.themeCounts.themes.length} 个主题，详情层 ${out.themeCounts.detail_total} 首）`);
  console.log(`已写出 ${SCRIPTURE_INDEX_FILE}（锚点 ${out.scriptureIndex.counts.total} 条：已登记 ${out.scriptureIndex.counts.registered} / 待产生 ${out.scriptureIndex.counts.pending}）`);
  for (const t of out.themeCounts.themes) {
    if (t.song_count > 0) console.log(`  ${t.theme_id} ${t.name} → ${t.song_count} 首`);
  }
  const merged = LI.mergeLibrary({ songsIndex, registry, promotions });
  console.log(`合并曲库：详情层 ${merged.detail_count} + 登记层待升层 ${merged.intake_count} = ${merged.total} 首（已升层 ${merged.promoted_count} 首不重复计数）`);
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => { console.error('派生索引生成失败：', e && e.stack ? e.stack : e); process.exit(1); });
}

module.exports = { derive, THEME_COUNTS_FILE, SCRIPTURE_INDEX_FILE };
