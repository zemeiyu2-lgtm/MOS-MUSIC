/* =========================================================
   MOS-MUSIC｜Index Builder
   ---------------------------------------------------------
   把 content/songs/*.json 逐条记录汇成 content/songs/index.json，
   并重算 themes/index.json 的 song_count。

   Phase 1 音乐库为空，此脚本主要证明"索引可再生"这条管线是通的：
   不手工维护 count / facets / song_count，全部由记录推导。
   规格书 §31：首屏只加载索引，完整记录按需 fetch。
========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function listRecords(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /^\d+\.json$|^[A-Z0-9-]+\.json$/.test(f))
    .map((f) => path.join(dir, f))
    .map((f) => ({ file: path.basename(f), data: JSON.parse(fs.readFileSync(f, 'utf8')) }));
}

const TIER = ['A', 'B', 'C'];
const STATUS = ['draft', 'under_review', 'approved', 'core', 'recommended', 'research', 'archived'];

function main() {
  const songsDir = path.join(ROOT, 'content', 'songs');
  const records = listRecords(songsDir).filter((r) => /^MUS-S-\d{4}\.json$/.test(r.file));

  const facets = {
    tier: Object.fromEntries(TIER.map((t) => [t, 0])),
    review_status: Object.fromEntries(STATUS.map((s) => [s, 0])),
    main_theme: [...new Set(records.map((r) => r.data.discipleship.main_theme).filter(Boolean))],
    scenes: [...new Set(records.flatMap((r) => r.data.scenes || []))],
    age_group: [...new Set(records.flatMap((r) => r.data.discipleship.age_group || []))],
    context: [...new Set(records.flatMap((r) => r.data.discipleship.context || []))],
    difficulty: [...new Set(records.map((r) => r.data.discipleship.difficulty).filter((v) => v != null))].sort(),
  };
  for (const r of records) {
    if (facets.tier[r.data.tier] !== undefined) facets.tier[r.data.tier] += 1;
    if (facets.review_status[r.data.review_status] !== undefined) facets.review_status[r.data.review_status] += 1;
  }

  const indexPath = path.join(songsDir, 'index.json');
  let index;
  if (fs.existsSync(indexPath)) index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  else index = {};

  index.library_version = index.library_version || 'MUS-V-0.1.0';
  index.record_of = 'MUS-S-NNNN';
  index.schema = 'content/schema/song.schema.json';
  index.count = records.length;
  index.songs = records.map((r) => ({
    song_id: r.data.song_id,
    title: r.data.title,
    tier: r.data.tier,
    review_status: r.data.review_status,
    main_theme: r.data.discipleship.main_theme,
    core_passage: r.data.bible.core_passage,
    scenes: r.data.scenes || [],
  }));
  index.facets = facets;
  index.generated_at = new Date().toISOString();

  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');

  /* 重算主题的 song_count */
  const themesPath = path.join(ROOT, 'content', 'themes', 'index.json');
  if (fs.existsSync(themesPath)) {
    const themes = JSON.parse(fs.readFileSync(themesPath, 'utf8'));
    for (const t of themes.themes || []) {
      t.song_count = records.filter((r) => r.data.discipleship.main_theme === t.theme_id).length;
    }
    themes.generated_at = new Date().toISOString();
    fs.writeFileSync(themesPath, JSON.stringify(themes, null, 2) + '\n');
  }

  console.log(`index rebuilt: songs=${index.count}  themes updated`);
  for (const [k, v] of Object.entries(facets.tier)) console.log(`  tier ${k}: ${v}`);
  process.exit(0);
}

main();
