#!/usr/bin/env node
/* MOS-MUSIC｜OpenHymnal ABC → .jpwabc
   只处理 tune-matching.json 中 match_method=exact 的曲目。
   原谱：sources/openhymnal/OpenHymnal2014.06.abc
   结构解析：复用 tools/abc-import.js
*/

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const OUT_DEFAULT = path.join(ROOT, 'content/production/abc-jpwabc');

const abc = require('../abc-import.js');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
function has(name) { return process.argv.includes(name); }
function readJSON(rel) { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }

const DUR = {
  whole: [0, 4],
  half: [0, 2],
  quarter: [0, 1],
  eighth: [1, 1],
  sixteenth: [2, 1],
};

function lyricUnit(text) {
  const s = String(text ?? '').trim();
  if (!s) return '/';
  if (s.length === 1) return s.replace(/[{}]/g, '');
  return '{' + s.replace(/[{}]/g, '') + '}';
}

function noteToken(x, pendingTieClose) {
  if (!DUR[x.duration]) {
    throw new Error('unsupported_duration:' + x.duration);
  }
  const d = DUR[x.duration];
  if (x.exact_fraction !== null && x.exact_fraction !== undefined) {
    throw new Error('approximate_duration:' + x.exact_fraction);
  }
  let s = x.rest ? '0' : String(x.note || '');
  if (!x.rest && x.accidental) {
    if (!['#', 'b', 'n'].includes(x.accidental)) {
      throw new Error('unsupported_accidental:' + x.accidental);
    }
    s = x.accidental + s;
  }
  if (!x.rest) {
    const oct = Number(x.octave || 0);
    if (oct > 0) s += "'".repeat(oct);
    if (oct < 0) s += ','.repeat(-oct);
  }
  if (x.dot) s += '.';
  for (let i = 0; i < d[0]; i += 1) s += '_';
  for (let i = 1; i < d[1]; i += 1) s += '-';
  if (pendingTieClose) s += ')';
  return s;
}

function lyricSequence(tune, voice, notes) {
  const lines = abc.verse1TokenLines(voice);
  const tokens = [];
  for (const row of lines) {
    if (row) tokens.push(...row);
  }
  const aligned = abc.alignVerse(tokens, notes);
  return aligned.map((r) => {
    if (r.status === abc.ALIGN?.OK || r.status === 'ok') return lyricUnit(r.syllable_text);
    return '/';
  });
}

function buildJpw(song, tune) {
  const voiceId = tune.voice_order[0];
  const voice = tune.voices[voiceId];
  if (!voice) throw new Error('no_primary_voice');

  const built = abc.buildVoiceNotes(voice, tune.key_raw);
  const noteEvents = built.filter((x) => !x.bar);
  const bars = built.filter((x) => x.bar);
  const lyricItems = lyricSequence(tune, voice, noteEvents);
  if (lyricItems.length !== noteEvents.length) {
    throw new Error('lyric_note_length_mismatch:' + lyricItems.length + '/' + noteEvents.length);
  }

  let tieOpen = false;
  const voiceTokens = [];
  const measures = [];
  let current = [];

  for (const e of built) {
    if (e.bar) {
      if (current.length) {
        measures.push(current);
        current = [];
      }
      voiceTokens.push('|');
      continue;
    }
    const token = noteToken(e, tieOpen);
    tieOpen = Boolean(e.tie);
    voiceTokens.push(token);
    current.push(e);
  }
  if (current.length) measures.push(current);
  if (tieOpen) throw new Error('dangling_tie');

  const title = songTitle(tune);
  const lines = [
    '// ************** MOS-MUSIC OpenHymnal ABC → JPW-ABC 1.0 **************',
    '// source = sources/openhymnal/OpenHymnal2014.06.abc',
    '// match = exact title match from content/production/tune-matching.json',
    '',
    '.Title',
    'Title = ' + title,
    'KeyAndMeters = {1=' + normalizeKey(tune.key_raw) + ',' + normalizeMeter(tune.meter) + '}',
  ];
  const credits = tune.credits || [];
  if (credits.length) lines.push('WordsByAndMusicBy = ' + credits.map((x) => x.trim()).filter(Boolean).join('\\n'));
  if (Number(tune.tempo_bpm) > 0) lines.push('Expression = {♩=' + Number(tune.tempo_bpm) + '}');
  lines.push('', '.Voice');

  // 只写已有真实音符；不保留 ABC 解析产生的空尾小节。
  const measureLines = [];
  let mi = 0;
  for (const m of measures) {
    const text = m.map((e) => noteToken(e, false)).join(' ');
    measureLines.push(text + ' |');
    mi += 1;
  }
  lines.push(measureLines.join(' '));

  lines.push('', '.Words');
  lines.push('W1@1,1:');
  lines.push(lyricItems.join(' '));
  lines.push('');

  return {
    text: lines.join('\\n'),
    stats: {
      note_count: noteEvents.length,
      measure_count: measures.length,
      lyric_item_count: lyricItems.filter((x) => x !== '/').length,
      lyric_slot_count: lyricItems.length,
      tie_count: noteEvents.filter((x) => x.tie).length,
      rest_count: noteEvents.filter((x) => x.rest).length,
      approximate_count: noteEvents.filter((x) => x.exact_fraction != null).length,
    },
  };
}

function normalizeKey(raw) {
  const m = String(raw || '').match(/^([A-Ga-g])([#b]?)/);
  if (!m) throw new Error('bad_key:' + raw);
  return m[1].toUpperCase() + (m[2] || '');
}
function normalizeMeter(raw) {
  const m = String(raw || '').match(/^(\d+\/\d+)/);
  if (!m) throw new Error('bad_meter:' + raw);
  return m[1];
}
function songTitle(tune) {
  return (tune.titles && tune.titles[0]) || ('OpenHymnal X:' + tune.x);
}

function main() {
  const outDir = path.resolve(ROOT, arg('--out', 'content/production/abc-jpwabc'));
  fs.mkdirSync(outDir, { recursive: true });

  const matching = readJSON('content/production/tune-matching.json');
  const rows = (matching.rows || matching).filter((r) =>
    r.matched === true && r.match_method === 'exact' && r.tune_x
  );

  const tunes = abc.loadABC();
  const byX = new Map(tunes.map((t) => [String(t.x), t]));
  const results = [];

  for (const row of rows) {
    const base = {
      song_id: row.song_id,
      title_zh: row.title_zh,
      title_en: row.title_en,
      tune_x: String(row.tune_x),
      match_method: row.match_method,
      tune_titles: row.tune_titles || [],
    };
    const tune = byX.get(String(row.tune_x));
    try {
      if (!tune) throw new Error('tune_not_found');
      const built = buildJpw(base, tune);
      const outPath = path.join(outDir, row.song_id + '.jpwabc');
      fs.writeFileSync(outPath, built.text, 'utf8');
      results.push({ ...base, status: 'OK', output: path.relative(ROOT, outPath), ...built.stats });
    } catch (err) {
      results.push({ ...base, status: 'SKIP', reason: String(err?.message ?? err) });
    }
  }

  const index = {
    schema_version: 'MUS-MUSIC-ABC-JPWABC-1.0',
    generated_by: 'tools/score-pipeline/abc-to-jpwabc.js',
    source: {
      file: 'sources/openhymnal/OpenHymnal2014.06.abc',
      matching: 'content/production/tune-matching.json',
      match_scope: 'exact',
    },
    counts: {
      requested_exact: rows.length,
      generated: results.filter((x) => x.status === 'OK').length,
      skipped: results.filter((x) => x.status === 'SKIP').length,
    },
    results,
  };
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(JSON.stringify(index, null, 2));
  if (index.counts.skipped > 0) process.exitCode = 1;
}

main();
