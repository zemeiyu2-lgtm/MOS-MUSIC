#!/usr/bin/env node
/* =========================================================
   MOS-MUSIC｜ABC 谱源提取器
   ---------------------------------------------------------
   用途：
     只读提取 OpenHymnal ABC → 工作区中间数据。
     不修改 content/production/**，不覆盖既有 score.json。

   输入：
     sources/openhymnal/OpenHymnal2014.06.abc
     content/production/tune-matching.json

   输出：
     默认 stdout；
     --out <file> 可写入 work/abc_scores.json。

   设计原则：
     1) 以 tune-matching.json 已确认的 tune_x 为入口；
     2) 使用项目既有 tools/abc-import.js 的解析器，不复制另一套 ABC 语法；
     3) 保留原始 key / meter / tempo / voice / 小节 / 音高 / 时值；
     4) 保留第一节歌词机械对齐结果，但不把它当人工校对；
     5) SOURCE_IMPORTED 只表示「从公版原谱机械提取」，不是人工听校通过。
========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const ABC_TOOL = require(path.join(ROOT, 'tools/abc-import.js'));
const MATCH_REL = 'content/production/tune-matching.json';
const DEFAULT_OUT = 'work/abc_scores.json';

const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

function argValue(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

function parseBool(name) {
  return process.argv.includes(name);
}

function chooseVoice(tune) {
  const withLyrics = tune.voice_order.find((v) => tune.voices[v] && tune.voices[v].lyric_lines?.length);
  return withLyrics || tune.voice_order[0] || null;
}

function flattenNotes(notes) {
  return notes.filter((x) => !x.bar);
}

function measureSummary(notes) {
  const bars = notes.filter((x) => x.bar);
  const flat = flattenNotes(notes);
  const measureNos = [...new Set(flat.map((x) => x.measure_no).filter((n) => Number.isFinite(n)))];
  return {
    note_count: flat.length,
    bar_markers: bars.length,
    measure_count: measureNos.length,
    first_measure_no: measureNos.length ? Math.min(...measureNos) : null,
    last_measure_no: measureNos.length ? Math.max(...measureNos) : null,
  };
}

function alignmentSummary(tune, voice, notes) {
  const tokenLines = ABC_TOOL.verse1TokenLines(voice);
  const lineResults = [];
  for (let i = 0; i < tokenLines.length; i += 1) {
    const tokens = tokenLines[i];
    if (!tokens) continue;
    const lineNotes = [];
    const all = flattenNotes(notes);
    const rows = ABC_TOOL.alignVerse(tokens, lineNotes.length ? lineNotes : all);
    const counts = {
      ok: rows.filter((r) => r.status === ABC_TOOL.ALIGN.OK).length,
      melisma: rows.filter((r) => r.status === ABC_TOOL.ALIGN.MELISMA).length,
      no_lyric: rows.filter((r) => r.status === ABC_TOOL.ALIGN.NONE).length,
      unresolved: rows.filter((r) => r.status === ABC_TOOL.ALIGN.UNRESOLVED).length,
    };
    lineResults.push({ music_line_index: i, token_count: tokens.length, ...counts });
  }
  return {
    source: 'OpenHymnal w: 第一节机械对齐',
    lines: lineResults,
    note: '此结果仅用于机器交叉验证；不可替代人工谱词校对。',
  };
}

function serializeTune(row, tune) {
  const key = ABC_TOOL.parseKey(tune.key_raw);
  const voiceId = chooseVoice(tune);
  if (!voiceId) throw new Error(`${row.song_id} X:${row.tune_x} 没有可用声部`);

  const voice = tune.voices[voiceId];
  const notes = ABC_TOOL.buildVoiceNotes(voice, key);
  const summary = measureSummary(notes);

  return {
    song_id: row.song_id,
    title_zh: row.title_zh,
    title_en: row.title_en,
    match_method: row.match_method,
    tune_x: row.tune_x,
    tune_titles: row.tune_titles,
    source: {
      name: 'Open Hymnal Project 2014.06',
      local_file: 'sources/openhymnal/OpenHymnal2014.06.abc',
      license: 'Public Domain',
      status: 'SOURCE_IMPORTED',
      proofread: 'PENDING',
    },
    abc: {
      x: tune.x,
      titles: tune.titles,
      aliases: tune.aliases,
      credits: tune.credits,
      source_hint: tune.sources?.[0] || null,
      key_raw: tune.key_raw,
      parsed_key: {
        tonic_pc: key.tonicPc,
        mode: key.mode,
        tonic_letter: key.tonicLetter,
        accidental: key.accidental,
        raw: key.raw,
      },
      meter: tune.meter,
      default_length: tune.default_len,
      tempo_bpm: tune.tempo_bpm,
      voice: voiceId,
      available_voices: tune.voice_order,
    },
    melody: {
      ...summary,
      events: notes,
    },
    verification: {
      verse1_alignment: alignmentSummary(tune, voice, notes),
      note: '旋律事件来自项目既有 ABC parser + toSolfege/lengthToRhythm；本文件是中间层，不直接成为发布用 score.json。',
    },
  };
}

function main() {
  const match = readJSON(MATCH_REL);
  const tunes = ABC_TOOL.loadABC();
  const byX = new Map(tunes.map((t) => [String(t.x), t]));
  const matchedRows = (match.rows || []).filter((r) => r.matched && r.tune_x);

  const seen = new Set();
  const songs = [];
  const missing = [];
  const duplicate = [];

  for (const row of matchedRows) {
    if (seen.has(row.song_id)) {
      duplicate.push(row.song_id);
      continue;
    }
    seen.add(row.song_id);

    const tune = byX.get(String(row.tune_x));
    if (!tune) {
      missing.push({ song_id: row.song_id, tune_x: row.tune_x, title_en: row.title_en });
      continue;
    }
    songs.push(serializeTune(row, tune));
  }

  const result = {
    schema_version: 'MUS-MUSIC-ABC-WORK-1.0',
    generated_at: new Date().toISOString(),
    generated_by: 'tools/score-pipeline/extract-abc-scores.js',
    source: {
      matching_file: MATCH_REL,
      abc_file: 'sources/openhymnal/OpenHymnal2014.06.abc',
      matching_rows: (match.rows || []).length,
      matched_rows: matchedRows.length,
    },
    counts: {
      matched_requested: matchedRows.length,
      extracted: songs.length,
      missing_tune: missing.length,
      duplicate_song_id: duplicate.length,
    },
    songs,
    missing,
    duplicate,
    note: '此文件只保存机器读取的真实公版谱源中间层；下一步由 writer 生成 .jpwabc，再进行 jpeditor 读回与 PDF 视觉验收。',
  };

  const out = argValue('--out');
  const pretty = parseBool('--pretty');
  const text = JSON.stringify(result, null, pretty ? 2 : 0) + '\n';

  if (out) {
    const abs = path.resolve(ROOT, out);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text, 'utf8');
    console.log(`写出：${path.relative(ROOT, abs)}  songs=${songs.length} missing=${missing.length}`);
  } else {
    process.stdout.write(text);
  }

  if (missing.length || duplicate.length) process.exitCode = 2;
}

main();
