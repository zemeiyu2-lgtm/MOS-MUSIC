#!/usr/bin/env node
/* =========================================================
   MOS-MUSIC｜score.json → .jpwabc 批量生成器
   ---------------------------------------------------------
   输入：
     content/production/packages/MUS-S-*/score.json
     content/production/packages/MUS-S-*/metadata.json

   输出：
     默认 work/jpwabc/MUS-S-xxxx.jpwabc
     --write-package 时写回每个 package/score.jpwabc

   原则：
     1) 只转换已有结构化真实谱源，不重新作曲；
     2) 不改原 score.json；
     3) 歌词按 score.json 中已存在的 lyric_line_id / syllable / melisma 逐音符落点；
     4) 不确定能力（连音、复杂时值、未知结构）直接失败，不静默近似；
     5) 不写 .Layout，避免干扰 jpeditor 自动分页；
     6) 输出遵循 jpeditor 的 JpwWriter 口径。
========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const PACKAGE_ROOT = path.join(ROOT, 'content/production/packages');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

function has(name) { return process.argv.includes(name); }

function readJSON(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function esc(s) {
  return String(s ?? '').replace(/\\n/g, '\\\\n');
}

function keyName(raw) {
  const m = String(raw || '').match(/1\\s*=\\s*([A-Ga-g](?:#|b)?)/);
  if (!m) throw new Error('无法从 key 提取 1=调：' + raw);
  return m[1].toUpperCase().replace(/B$/, 'b');
}

const DUR = {
  whole:   { beams: 0, beats: 4 },
  half:    { beams: 0, beats: 2 },
  quarter: { beams: 0, beats: 1 },
  eighth:  { beams: 1, beats: 1 },
  '16th':  { beams: 2, beats: 1 },
  '32nd':  { beams: 3, beats: 1 },
  '64th':  { beams: 4, beats: 1 },
};

function noteToken(b) {
  if (b.tie) throw new Error('score.json 含 tie=true，当前生成器拒绝静默丢失：需要单独映射 tieStart/tieEnd。');
  if (!DUR[b.duration]) throw new Error('不支持的时值：' + b.duration);

  const d = DUR[b.duration];
  if (b.dot && d.beats > 2) {
    throw new Error('当前 .jpwabc 写出端不接受 whole dotted 等不可逆时值：' + JSON.stringify(b));
  }

  const n = b.rest ? '0' : String(b.note || '');
  if (!b.rest && !/^[1-7]$/.test(n)) throw new Error('非法简谱音级：' + n);

  let s = n;
  if (!b.rest && b.accidental) {
    const acc = { sharp: '#', flat: 'b', natural: 'n' }[b.accidental];
    if (!acc) throw new Error('未知 accidental：' + b.accidental);
    s = acc + s;
  }
  if (!b.rest) {
    const oct = Number(b.octave || 0);
    if (!Number.isInteger(oct)) throw new Error('非法 octave：' + oct);
    if (oct > 0) s += "'".repeat(oct);
    if (oct < 0) s += ",".repeat(-oct);
  }
  if (b.dot) s += '.';
  for (let i = 0; i < d.beams; i++) s += '_';
  for (let i = 1; i < d.beats; i++) s += '-';
  return s;
}

function lyricUnit(text) {
  const s = String(text ?? '').trim();
  if (!s) return '/';
  if (/[\\s]/.test(s)) return '{' + s.replace(/[{}]/g, '') + '}';
  return s.replace(/[{}]/g, '');
}

function lyricPass(id) {
  const m = String(id || '').match(/^v(\\d+)-/i);
  return m ? Number(m[1]) : 1;
}

function lyricSegments(measures) {
  const out = [];
  let cur = null;

  for (const m of measures) {
    for (let ni = 0; ni < (m.beats || []).length; ni++) {
      const b = m.beats[ni];
      const id = b.lyric_line_id || null;

      if (id && (!cur || cur.lineId !== id)) {
        if (cur && cur.items.length) out.push(cur);
        cur = {
          pass: lyricPass(id),
          lineId: id,
          measure: Number(m.measure_no),
          noteIndex: ni + 1,
          items: [],
        };
      }

      if (!cur) continue;

      if (!id || id !== cur.lineId) {
        cur.items.push('/');
        continue;
      }

      if (b.lyric_status === 'melisma' || b.melisma || !b.syllable) {
        cur.items.push('/');
      } else {
        cur.items.push(lyricUnit(b.syllable));
      }
    }
  }

  if (cur && cur.items.length) out.push(cur);

  return out;
}

function validateScore(score, songId) {
  if (!score || score.status === 'NOT_AVAILABLE') throw new Error(songId + ' score.status=NOT_AVAILABLE');
  const allMeasures = score.sections?.[0]?.measures || score.measures || [];
  // SOURCE score.json 中部分试算稿保留一个空尾小节；空尾不是可演奏内容，
  // 不把它写进 .jpwabc，避免解析后产生一个无意义的空小节。
  const measures = allMeasures.filter((m) => (m.beats || []).length > 0);
  if (!measures.length) throw new Error(songId + ' 没有可写出的 measures');

  for (const m of measures) {
    if (m.repeat !== null && m.repeat !== undefined) {
      throw new Error(songId + ' 存在 repeat 字段，当前版本暂拒绝静默转换：measure ' + m.measure_no);
    }
  }
  return measures;
}

function writeJpwabc(songId, score, meta) {
  const measures = validateScore(score, songId);
  const title = meta.title_en
    ? meta.title_zh + '（' + meta.title_en + '）'
    : meta.title_zh;

  const lines = [];
  lines.push('// ************** MOS-MUSIC score.json → JPW-ABC 1.0 **************');
  lines.push('// source = ' + 'content/production/packages/' + songId + '/score.json');
  lines.push('// status = SOURCE_IMPORTED / 原 score.json 保持不变');
  lines.push('// lyric_scope = score.json 已存在的歌词音节；未自动补写其它诗歌节');
  lines.push('');
  lines.push('.Title');
  lines.push('Title = ' + esc(title));
  lines.push('KeyAndMeters = {1=' + keyName(score.key) + ',' + score.time_signature + '}');

  const authors = [];
  if (meta.author) authors.push('词：' + meta.author);
  if (meta.composer) authors.push('曲：' + meta.composer);
  if (authors.length) lines.push('WordsByAndMusicBy = ' + esc(authors.join('\\n')));
  if (Number(score.tempo_bpm) > 0) lines.push('Expression = {♩=' + Number(score.tempo_bpm) + '}');

  lines.push('');
  lines.push('.Voice');
  lines.push(measures.map((m) => {
    const body = (m.beats || []).map(noteToken).join(' ');
    return body + ' |';
  }).join(' '));

  const segs = lyricSegments(measures);
  lines.push('');
  lines.push('.Words');

  for (const seg of segs) {
    lines.push('W' + seg.pass + '@' + seg.measure + ',' + seg.noteIndex + ':');
    lines.push(seg.items.join(' '));
  }

  lines.push('');
  return lines.join('\\n');
}

function discoverSongs() {
  return fs.readdirSync(PACKAGE_ROOT)
    .filter((x) => /^MUS-S-\\d{4}$/.test(x))
    .sort()
    .filter((id) => fs.existsSync(path.join(PACKAGE_ROOT, id, 'score.json')));
}

function main() {
  const requested = arg('--song');
  const ids = requested ? [requested] : discoverSongs();
  const outDir = path.resolve(ROOT, arg('--out', 'work/jpwabc'));
  const writePackage = has('--write-package');
  const results = [];

  for (const songId of ids) {
    const score = readJSON('content/production/packages/' + songId + '/score.json');
    const meta = fs.existsSync(path.join(PACKAGE_ROOT, songId, 'metadata.json'))
      ? readJSON('content/production/packages/' + songId + '/metadata.json')
      : { title_zh: songId, title_en: '', author: '', composer: '' };

    try {
      const text = writeJpwabc(songId, score, meta);
      const dest = writePackage
        ? path.join(PACKAGE_ROOT, songId, 'score.jpwabc')
        : path.join(outDir, songId + '.jpwabc');

      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, text, 'utf8');

      const measures = (score.sections?.[0]?.measures || score.measures || [])
        .filter((m) => (m.beats || []).length > 0);
      const notes = measures.reduce((n, m) => n + (m.beats || []).length, 0);
      results.push({ song_id: songId, status: 'OK', measures: measures.length, notes, lyric_segments: lyricSegments(measures).length, output: path.relative(ROOT, dest) });
    } catch (e) {
      results.push({ song_id: songId, status: 'FAIL', error: e.message });
    }
  }

  console.log(JSON.stringify({
    schema_version: 'MUS-MUSIC-JPWABC-GEN-1.0',
    generated_by: 'tools/score-pipeline/score-to-jpwabc.js',
    results,
  }, null, 2));

  if (results.some((x) => x.status !== 'OK')) process.exitCode = 1;
}

main();
