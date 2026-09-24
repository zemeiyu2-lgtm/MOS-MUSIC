#!/usr/bin/env node
/* =========================================================
   MOS-MUSIC｜Song Usage History（使用历史视图 · §九）
   ---------------------------------------------------------
   输入（只读）：content/production/library-usage.json
   输出：控制台表格 + 可选 JSON / Markdown 文件

   纪律（§八 / §九）：
     · 使用历史只能追加，不得重写；
     · 现阶段 S-0001 → W01、W04；S-0002 → W02；S-0003 → W03；
       S-0004 / S-0005 仅作辅助；新增歌曲一律未使用；
     · 不得预先分配未来周次，也不得给任何歌曲标注「最佳」。

   用法：node tools/usage-history.js [--json <path>] [--md <path>]
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

async function main() {
  const LI = await import(pathToFileURL(path.join(ROOT, 'app/library-intake.js')).href);
  const usage = readJSON('content/production/library-usage.json');
  const songsIndex = readJSON('content/songs/index.json');

  const rows = LI.usageHistoryRows(usage);
  const used = rows.filter((r) => r.used_weeks !== '—');
  const unused = rows.filter((r) => r.used_weeks === '—');

  console.log('SONG USAGE HISTORY（§九）');
  console.log(`曲库 ${songsIndex.songs.length} 首｜已使用 ${used.length} 首｜未使用 ${unused.length} 首`);
  console.log('');
  console.log(LI.renderUsageHistoryTable(rows));
  console.log('');
  console.log('未使用（可承担新的主歌，不代表已被推荐）：');
  console.log(unused.length
    ? unused.map((r) => `  ${r.song_id} ${r.song}`).join('\n')
    : '  （无：全部歌曲均已使用过）');
  console.log('');
  console.log('说明：本视图不指定任何未来周次，也不排序、不推荐、不评优。');

  const out = {
    usage_history_version: 'MUS-V-0.5.0',
    generated_by: 'tools/usage-history.js',
    library_total: songsIndex.songs.length,
    columns: ['song_id', 'song', 'used_weeks', 'core_uses', 'secondary_uses', 'reuse_status'],
    rows,
    summary: {
      used: used.length,
      unused: unused.length,
      reused: rows.filter((r) => r.reuse_status === 'used_multiple_times').length,
    },
  };

  const jsonPath = argValue('--json');
  if (jsonPath) {
    fs.writeFileSync(path.resolve(ROOT, jsonPath), JSON.stringify(out, null, 2) + '\n');
    console.log(`已写出 ${jsonPath}`);
  }
  const mdPath = argValue('--md');
  if (mdPath) {
    const md = [
      '# Song Usage History',
      '',
      `- 曲库：${songsIndex.songs.length} 首`,
      `- 已使用：${used.length} 首｜未使用：${unused.length} 首`,
      `- 复用（使用 > 1 次）：${out.summary.reused} 首`,
      '',
      LI.renderUsageHistoryTable(rows),
      '',
      '> 使用历史只追加，不重写（§八）。本表不指定任何未来周次，也不做推荐或评优。',
      '',
    ].join('\n');
    fs.writeFileSync(path.resolve(ROOT, mdPath), md);
    console.log(`已写出 ${mdPath}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error('生成使用历史视图失败：', e && e.stack ? e.stack : e); process.exit(1); });
