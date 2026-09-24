#!/usr/bin/env node
/* =========================================================
   MOS-MUSIC｜ABC 原谱导入（V3.2 §五 / §六）
   ---------------------------------------------------------
   目的：**不做凭记忆编曲**。把已出版、已确认公有领域的原谱（ABC 记谱）
         机械转换为 MOS 的结构化简谱 + 逐音节谱词对齐。

   权威源：Open Hymnal Project 2014.06 版（openhymnal.org）
           · 项目自述：public domain，可自由分发与修改；
           · 本仓归档：sources/openhymnal/OpenHymnal2014.06.abc（见 sources/manifest.json）。

   铁律：
     1) 只做**格式转换**，不改音高 / 时值 / 歌词；不做听感修订；
     2) 转不出确定结果的音符 → 标 alignment 未决，绝不按字数推算；
     3) 转换结果的状态是 SOURCE_IMPORTED（原谱导入），**不是**已人工听校；
        人工听校仍为 PENDING，由 proofread 字段如实记录；
     4) 外部来源只登记、不下载转存。

   用法：
     node tools/abc-import.js --index          # 写出全库曲目索引
     node tools/abc-import.js --match          # 写出 100 首 ↔ 原谱匹配表
     node tools/abc-import.js --tune 192       # 打印单首解析结果（人工核对用）
     node tools/abc-import.js --score MUS-S-0001   # 输出结构化简谱 JSON 到 stdout
     node tools/abc-import.js --check
========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ABC_REL = 'sources/openhymnal/OpenHymnal2014.06.abc';
const INDEX_REL = 'sources/openhymnal/tune-index.json';
const MATCH_REL = 'content/production/tune-matching.json';

const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const writeJSON = (rel, obj) => {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(obj, null, 2) + '\n');
};

/* ---------------------------------------------------------------- 音高 */

const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11], major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10], minor: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
};
const SOLFEGE = ['1', '2', '3', '4', '5', '6', '7'];
const PICTH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * ABC 音名 → MIDI。
 * 约定（ABC 标准）：C = 中央 C（C4）；小写升八度；' 升八度、, 降八度。
 * 调号（K:）隐含的音也在这里套用：K: D 里的 `c` 就是 C#5。
 * @param {string|null} acc 写在音名前的临时记号 '^' / '^^' / '_' / '__' / '='
 * @param {string} letter A–G
 * @param {string} octMarks ',' 与 "'" 串
 * @param {object} key parseKey() 的结果
 */
function abcPitchToMidi(acc, letter, octMarks, key) {
  const L = letter.toUpperCase();
  const lower = letter === letter.toLowerCase();
  const natural = LETTER_PC[L];
  let pc;
  if (acc === '^') pc = natural + 1;
  else if (acc === '^^') pc = natural + 2;
  else if (acc === '_') pc = natural - 1;
  else if (acc === '__') pc = natural - 2;
  else if (acc === '=') pc = natural;
  else pc = keySignaturePc(L, key);
  let delta = ((pc - natural) % 12 + 12) % 12;
  if (delta > 6) delta -= 12;
  const marks = octMarks || '';
  const up = (marks.match(/'/g) || []).length;
  const down = (marks.match(/,/g) || []).length;
  return 60 + natural + delta + (lower ? 12 : 0) + 12 * (up - down);
}

/** 调号下某个音名字母应取的音级（K: D ⇒ F→F#, C→C#）。 */
function keySignaturePc(letterUpper, key) {
  const natural = LETTER_PC[letterUpper];
  if (key && key.sigByLetter && key.sigByLetter[letterUpper] !== undefined) return key.sigByLetter[letterUpper];
  const scale = key && key.scale ? key.scale : MAJOR;
  const pcs = scale.map((p) => (p + (key ? key.tonicPc : 0)) % 12);
  for (const pc of pcs) if (pc % 12 === natural % 12) return pc;
  return natural;
}

/** 由调性算出「音名字母 → 该调的调号音级」表。 */
function buildSigByLetter(tonicPc, scale) {
  const map = {};
  for (const p of scale) {
    const pc = (p + tonicPc) % 12;
    const letter = PICTH_NAMES[pc][0];
    map[letter] = pc;
  }
  return map;
}

function midiName(m) {
  return PICTH_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

/** 解析 K: 字段 → {tonicPc, mode, scale, ...}。 */
function parseKey(raw) {
  const s = String(raw || 'C').trim();
  const m = s.match(/^\s*([A-Ga-g])([#b]?)\s*(.*)$/);
  if (!m) return { tonicPc: 0, mode: 'major', scale: MAJOR, raw: s, unknown: true };
  const letter = m[1].toUpperCase();
  const acc = m[2] === '#' ? 1 : (m[2] === 'b' ? -1 : 0);
  const rest = (m[3] || '').trim();
  const rl = rest.toLowerCase();
  let mode = 'major';
  if (/^(m|min|minor)\b/.test(rl) || rl === 'm') mode = 'minor';
  for (const k of Object.keys(MODES)) if (rl.startsWith(k)) mode = k;
  const tonicPc = ((LETTER_PC[letter] + acc) % 12 + 12) % 12;
  const scale = MODES[mode] || MAJOR;
  return {
    tonicPc, mode, scale, tonicLetter: letter, accidental: acc, raw: s,
    sigByLetter: buildSigByLetter(tonicPc, scale),
  };
}

/**
 * MIDI + 调 → 简谱（唱名 / 高低音点 / 临时升降）。
 * 相对主音按本调音阶求级数；不在音阶内的音取最近音级并标临时升降号。
 */
function toSolfege(midi, key) {
  const scale = key.scale || MAJOR;
  const rel = midi - (60 + key.tonicPc);
  let oct = Math.floor(rel / 12);
  const pc = rel - oct * 12;
  let idx = scale.indexOf(pc);
  let accidental = null;
  if (idx < 0) {
    let best = 0;
    let bestDist = 99;
    for (let i = 0; i < scale.length; i += 1) {
      const d = Math.abs(scale[i] - pc);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    idx = best;
    accidental = pc > scale[best] ? 'sharp' : 'flat';
  }
  return { degree: SOLFEGE[idx], octave: oct, accidental };
}

/* ---------------------------------------------------------------- 时值 */

/* 时值以「全音符 = 1」为单位（与 ABC 的 L: 一致） */
const DUR_TABLE = [
  { v: 1, name: 'whole' }, { v: 0.5, name: 'half' }, { v: 0.25, name: 'quarter' },
  { v: 0.125, name: 'eighth' }, { v: 0.0625, name: 'sixteenth' },
];

/** 长度（以全音符为 1）→ { duration, dot }。 */
function lengthToRhythm(len) {
  for (const d of DUR_TABLE) {
    if (Math.abs(len - d.v) < 1e-9) return { duration: d.name, dot: false };
    if (Math.abs(len - d.v * 1.5) < 1e-9) return { duration: d.name, dot: true };
  }
  /* 找不到精确值：取最接近的、不撒谎地标注为近似 */
  let best = DUR_TABLE[0];
  let bd = 99;
  for (const d of DUR_TABLE) {
    const dist = Math.abs(len - d.v);
    if (dist < bd) { bd = dist; best = d; }
  }
  return { duration: best.name, dot: false, approx: true, exact_fraction: len };
}

/* ---------------------------------------------------------------- 音乐行解析 */

const NOTE_RE = /(\^{1,2}|_{1,2}|=)?([A-Ga-gzZxX])(,*|'*)(\d+)?(\/{1,2})?(\d+)?/y;

/** 解析一段 ABC 音符串 → 事件数组。 */
function parseMusicChunk(chunk, defaultLen) {
  const events = [];
  let i = 0;
  const notes = [];
  while (i < chunk.length) {
    const ch = chunk[i];
    if (ch === '%') break;
    if (ch === ' ' || ch === '\t') { i += 1; continue; }
    if (ch === '\\') { i += 1; continue; }
    if (ch === '[') {
      /* 弦内字段 [Q:..] [K:..] [M:..] 或和弦 [CEG] */
      const close = chunk.indexOf(']', i);
      if (close < 0) { i += 1; continue; }
      const inner = chunk.slice(i + 1, close);
      const fm = inner.match(/^([A-Za-z]):(.*)$/);
      if (fm) notes.push({ inline_field: fm[1].toUpperCase(), value: fm[2].trim() });
      else notes.push({ chord: inner });
      i = close + 1;
      continue;
    }
    if (ch === '{') { const close = chunk.indexOf('}', i); i = close < 0 ? chunk.length : close + 1; continue; }
    if (ch === '"') { const close = chunk.indexOf('"', i + 1); i = close < 0 ? chunk.length : close + 1; continue; }
    if (ch === '!') { const close = chunk.indexOf('!', i + 1); i = close < 0 ? chunk.length : close + 1; continue; }
    if (ch === '+' ) { const close = chunk.indexOf('+', i + 1); i = close < 0 ? chunk.length : close + 1; continue; }
    if (ch === '(' && /^\(3/.test(chunk.slice(i))) { i += 2; notes.push({ tuplet: 3 }); continue; }
    if (ch === '-') {
      /* 延音线（tie）：'- ' 跟在音符后，表示与前一个音相连（常跨小节线） */
      const last = notes[notes.length - 1];
      if (last && last.rest === undefined && last.chord === undefined && last.inline_field === undefined && last.tuplet === undefined) last.tie = true;
      i += 1; continue;
    }
    if (ch === '(' || ch === ')' || ch === '>' || ch === '<' || ch === '~' || ch === '&') { i += 1; continue; }
    const rest = chunk.slice(i);
    NOTE_RE.lastIndex = i;
    const m = NOTE_RE.exec(chunk);
    if (!m || m.index !== i) { i += 1; continue; }
    const [full, acc, letter, octMarks, num, slash, slashNum] = m;
    /* 长度 */
    let len = defaultLen;
    if (num) len = defaultLen * parseInt(num, 10);
    if (slash) {
      const div = slashNum ? parseInt(slashNum, 10) : 2;
      len = (num ? defaultLen * parseInt(num, 10) : defaultLen) / div;
    }
    notes.push({
      rest: /[zZxX]/.test(letter),
      letter: /[zZxX]/.test(letter) ? null : letter,
      accidental_raw: /[A-Ga-g]/.test(letter) ? (acc || null) : null,
      octave_marks: octMarks || '',
      length_whole: len,
      raw: full,
    });
    i += full.length;
    void rest;
  }

  /* 粘连符 - 表示延音：把 tie 标到前一个音 */
  let prev = null;
  for (const n of notes) {
    if (n.chord !== undefined || n.inline_field !== undefined || n.tuplet !== undefined) { events.push(n); continue; }
    if (n.raw === '-') { if (prev) prev.tie = true; continue; }
    events.push(n);
    prev = n;
  }
  return events;
}

/** 把事件流切成小节：第一个 | 之前的内容 = 弱起。 */
function splitMeasures(events) {
  const pickup = [];
  const measures = [];
  let cur = null;
  for (const e of events) {
    if (e.bar) {
      if (cur === null) { /* 弱起结束 */ cur = []; }
      else { measures.push(cur); cur = []; }
      continue;
    }
    if (cur === null) pickup.push(e);
    else cur.push(e);
  }
  if (cur && cur.length) measures.push(cur);
  return { pickup, measures };
}

/* ---------------------------------------------------------------- 整体解析 */

function parseABC(text) {
  const lines = text.split(/\r?\n/);
  const tunes = [];
  let cur = null;
  let lastVoice = null;

  const newTune = () => ({
    x: null, titles: [], aliases: [], credits: [], sources: [],
    scripture: null, topics: [], category: null, metrical: null,
    meter: null, default_len: 0.25, key_raw: null, tempo_bpm: null,
    voices: {}, voice_order: [], lyrics: {}, headers: [],
  });

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line) continue;
    if (line.startsWith('%') && !line.startsWith('%%')) continue;
    if (line.startsWith('%%')) {
      if (cur && line.startsWith('%OHSCRIP')) cur.scripture = line.slice(8).trim();
      else if (cur && line.startsWith('%OHCATEGORY')) cur.category = line.slice(11).trim();
      else if (cur && line.startsWith('%OHMETRICAL')) cur.metrical = line.slice(11).trim();
      else if (cur && line.startsWith('%OHTOPICS')) {
        cur.topics = line.slice(9).trim().replace(/^\{|\}$/g, '').split(/},\s*\{/).map((s) => s.trim());
      }
      continue;
    }
    const f = line.match(/^([A-Za-z]):\s?(.*)$/);
    if (f && f[1] !== 'w') {
      const code = f[1];
      /* 字段值里允许行尾注释（"3/4 % time signature"） */
      const value = f[2].replace(/\s*%.*$/, '').replace(/\s+$/, '');
      if (code === 'X') {
        cur = newTune();
        cur.x = value.trim();
        tunes.push(cur);
        lastVoice = null;
      } else if (!cur) {
        continue;
      } else if (code === 'T') {
        if (/^\(also known as/i.test(value)) cur.aliases.push(value.trim());
        else cur.titles.push(value.trim());
      } else if (code === 'C') cur.credits.push(value.trim());
      else if (code === 'S') cur.sources.push(value.trim());
      else if (code === 'M') cur.meter = value.trim();
      else if (code === 'L') cur.default_len = evalLen(value.trim());
      else if (code === 'K') cur.key_raw = value.trim();
      else if (code === 'V') {
        const vid = value.trim().split(/\s+/)[0];
        if (!cur.voices[vid]) {
          cur.voices[vid] = { id: vid, lines: [], lyric_lines: [], lyric_marks: [] };
          cur.voice_order.push(vid);
        }
        lastVoice = vid;
      } else if (code === 'W') {
        if (!cur.verses) cur.verses = [];
        cur.verses.push(value);
      }
      continue;
    }
    if (!cur) continue;
    if (/^w:/.test(line)) {
      if (!lastVoice) continue;
      const tokens = line.slice(2).trim().split(/\s+/).filter(Boolean);
      cur.voices[lastVoice].lyric_lines.push(tokens);
      continue;
    }
    /* 音乐行：[V: XX] notes… */
    const vm = line.match(/^\[V:\s*([^\]]+)\]\s*(.*)$/);
    if (vm) {
      const vid = vm[1].trim().split(/\s+/)[0];
      if (!cur.voices[vid]) {
        cur.voices[vid] = { id: vid, lines: [], lyric_lines: [], lyric_marks: [] };
        cur.voice_order.push(vid);
      }
      lastVoice = vid;
      /* 记录该音乐行之前的歌词行数，用于把 w: 行归属到音乐行（歌词块） */
      cur.voices[vid].lyric_marks.push(cur.voices[vid].lyric_lines.length);
      cur.voices[vid].lines.push(vm[2]);
      continue;
    }
    if (/^\s*\[[A-Za-z]:/.test(line)) { /* 其他内联字段：忽略 */ continue; }
    if (lastVoice) {
      cur.voices[lastVoice].lyric_marks.push(cur.voices[lastVoice].lyric_lines.length);
      cur.voices[lastVoice].lines.push(line);
    }
  }

  /* 后处理：小节 / 事件 / 弱起 */
  for (const t of tunes) {
    for (const vid of t.voice_order) {
      const v = t.voices[vid];
      /* 按行重建，保留小节线：'|' 切分；行尾的 '|]' / '||' / ':|' 同样计为小节线 */
      const rebuilt = [];
      for (const l of v.lines) {
        const parts = l.split('|');
        for (let i = 0; i < parts.length; i += 1) {
          if (i > 0) rebuilt.push({ bar: true });
          rebuilt.push(...parseMusicChunk(parts[i], t.default_len));
        }
      }
      const finalEvents = [];
      for (const e of rebuilt) {
        if (e.inline_field) {
          if (e.inline_field === 'Q') {
            const qm = String(e.value).match(/1\/(\d+)\s*=\s*(\d+)/);
            if (qm) t.tempo_bpm = parseInt(qm[2], 10);
          }
          continue;
        }
        if (e.tuplet) continue;
        if (e.chord !== undefined) continue;
        finalEvents.push(e);
      }
      /* tie 处理：'-' 表示前一个音延音 */
      let prev = null;
      for (const e of finalEvents) {
        if (e.bar) { prev = null; continue; }
        if (e.raw === '-') { if (prev) prev.tie = true; }
        else prev = e;
      }
      const noTie = finalEvents.filter((e) => e.raw !== '-');
      v.events = noTie;
      const { pickup, measures } = splitMeasures(noTie);
      v.pickup = pickup;
      v.measures = measures;
      v.note_count = noTie.filter((e) => !e.bar).length;
      /* 拍位按 default_len 为单位累计；第一小节线前为弱起（measure_no = 0） */
      const beatUnit = t.default_len || 0.25;
      let mi = 0;
      let beat = 0;
      let pickupDone = false;
      for (const e of noTie) {
        if (e.bar) { mi += 1; beat = 0; pickupDone = true; continue; }
        e.measure_no = pickupDone ? mi : 0;
        e.beat_start = Number((beat / beatUnit).toFixed(4));
        beat += e.length_whole;
      }
      v.pickupDone = pickupDone;
      /* 歌词块：第 i 个音乐行对应的 w: 行区间 = [lyric_marks[i], lyric_marks[i+1] || end)。
         Open Hymnal 惯例：每个音乐行后跟一块 w: 行（每节一条，按节序排列；
         通常只有第一块的首行带 "1." 编号）。 */
      const marks = v.lyric_marks || [];
      v.lyric_blocks = [];
      for (let i = 0; i < v.lines.length; i += 1) {
        const s = marks[i] !== undefined ? marks[i] : v.lyric_lines.length;
        const e = i + 1 < v.lines.length ? (marks[i + 1] !== undefined ? marks[i + 1] : v.lyric_lines.length) : v.lyric_lines.length;
        v.lyric_blocks.push(v.lyric_lines.slice(s, e));
      }
    }
    t.verses = t.verses || [];
  }
  return tunes;
}

function evalLen(s) {
  const m = String(s).match(/^(\d+)\/(\d+)$/);
  if (m) return parseInt(m[1], 10) / parseInt(m[2], 10);
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0.25;
}

/* ---------------------------------------------------------------- 归一化与匹配 */

function normTitle(s) {
  return String(s || '')
    .replace(/\(also known as[^)]*\)/gi, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titleKeys(t) {
  const keys = new Set();
  for (const x of t.titles) {
    const k = normTitle(x);
    if (k) keys.add(k);
  }
  for (const a of t.aliases) {
    const cleaned = a.replace(/\(also known as/i, '').replace(/\)$/, '');
    for (const part of cleaned.split(/\bor\b/i)) {
      const k = normTitle(part);
      if (k) keys.add(k);
    }
  }
  return [...keys];
}

/* ---------------------------------------------------------------- 结构化简谱 */

function buildVoiceNotes(voice, key) {
  const out = [];
  for (const e of voice.events) {
    if (e.bar) { out.push({ bar: true, measure_no: e.measure_no }); continue; }
    if (e.rest) {
      const r = lengthToRhythm(e.length_whole);
      out.push({
        note: null, octave: 0, duration: r.duration, dot: Boolean(r.dot), tie: false,
        rest: true, accidental: null, beat_start: e.beat_start, measure_no: e.measure_no,
        midi: null, length_whole: e.length_whole, exact_fraction: r.exact_fraction || null,
      });
      continue;
    }
    const midi = abcPitchToMidi(e.accidental_raw, e.letter, e.octave_marks, key);
    const sf = toSolfege(midi, key);
    const r = lengthToRhythm(e.length_whole);
    out.push({
      note: sf.degree, octave: sf.octave, duration: r.duration, dot: Boolean(r.dot),
      tie: Boolean(e.tie), rest: false, accidental: sf.accidental,
      beat_start: e.beat_start, measure_no: e.measure_no, midi,
      length_whole: e.length_whole, exact_fraction: r.exact_fraction || null,
    });
  }
  return out;
}

/* ---------------------------------------------------------------- 谱词对齐 */

const ALIGN = { OK: 'ok', MELISMA: 'melisma', HOLD: 'hold', NONE: 'no_lyric', UNRESOLVED: 'ALIGNMENT_VERIFY_REQUIRED' };

/**
 * 选出每一音乐行「第 1 节」的 w: token 行（Open Hymnal：每音乐行一块 w:，
 * 块内按节序排列；块内若带编号则取 "1." 行，否则取块首行）。
 * 返回与 voice.lines 等长的数组（该音乐行无歌词时为 null）。
 */
function verse1TokenLines(voice) {
  const blocks = voice.lyric_blocks || [];
  return blocks.map((block) => {
    if (!block.length) return null;
    for (let i = 0; i < block.length; i += 1) {
      const m = String(block[i][0] || '').match(/^1\s*[.\u00b7]/);
      if (m) return block[i];
    }
    return block[0];
  });
}

/** 把一行 w: token 序列与音符序列对齐。 */
function alignVerse(tokens, notes) {
  const rows = [];
  let prevWord = null;
  for (let i = 0; i < notes.length; i += 1) {
    const tok = tokens[i];
    if (tok === undefined) { rows.push({ status: ALIGN.UNRESOLVED, syllable: null }); continue; }
    if (tok === '*' || tok === '-') { rows.push({ status: ALIGN.MELISMA, syllable: prevWord, syllable_text: prevWord ? prevWord.text : null }); continue; }
    if (tok === '_' || tok === '|') { rows.push({ status: ALIGN.NONE, syllable: null }); continue; }
    let text = tok.replace(/^\d+\.\s*/, '').replace(/~/g, ' ');
    const joinsNext = /-$/.test(text);
    text = text.replace(/-$/, '');
    let split = null;
    if (/-/.test(text)) split = text.split('-');
    const word = { text: tok, syllable: text, split, joins_next: joinsNext };
    prevWord = word;
    rows.push({ status: ALIGN.OK, syllable: word, syllable_text: text });
  }
  return rows;
}

/**
 * 把唱名序列贴回歌词行的字符位置（逐音节对齐）。
 * 只在能确定的情况下写 lyric_char_index；不能确定时留 null + 标未决。
 */
function attachCharIndex(rows, lineText) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9']/g, '');
  const target = norm(lineText);
  let ptr = 0;
  /* 音节在原文中的位置：用归一化后的偏移近似映射回原字符下标 */
  const map = [];
  for (let i = 0; i < lineText.length; i += 1) {
    if (norm(lineText[i])) map.push(i);
  }
  for (const r of rows) {
    if (r.status !== ALIGN.OK || !r.syllable) continue;
    const syl = norm(r.syllable.syllable);    if (!syl) { r.char_index = null; continue; }
    const found = target.indexOf(syl, ptr);
    if (found < 0) { r.char_index = null; r.status = ALIGN.UNRESOLVED; continue; }
    r.char_index = found < map.length ? map[found] : null;
    ptr = found + 1;
  }
  return rows;
}

/* ---------------------------------------------------------------- 主流程 */

function loadABC() {
  if (!exists(ABC_REL)) throw new Error(`缺少原谱文件 ${ABC_REL}（见 sources/manifest.json）`);
  return parseABC(fs.readFileSync(path.join(ROOT, ABC_REL), 'utf8'));
}

function buildIndex(tunes) {
  return tunes.map((t) => ({
    x: t.x,
    titles: t.titles,
    aliases: t.aliases,
    tune_name: null,
    key: t.key_raw,
    meter: t.meter,
    default_length: t.default_len,
    tempo_bpm: t.tempo_bpm,
    voices: t.voice_order,
    credits: t.credits,
    scripture: t.scripture,
    category: t.category,
    source_hint: (t.sources[0] || '').slice(0, 200),
    title_keys: titleKeys(t),
  }));
}

function matchCandidates(tunes) {
  const cand = readJSON('content/candidates/index.json').candidates || [];
  const idx = new Map();
  for (const t of tunes) for (const k of titleKeys(t)) {
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(t);
  }
  const rows = [];
  for (const c of cand) {
    const k = normTitle(c.title_en);
    let hits = idx.get(k) || [];
    let method = hits.length ? 'exact' : null;
    if (!hits.length) {
      /* 前缀 / 包含匹配（例：Holy, Holy, Holy! Lord God Almighty → Holy, Holy, Holy） */
      for (const [tk, list] of idx.entries()) {
        if (!tk) continue;
        if (k === tk) { hits = list; method = 'exact'; break; }
        if (tk.length >= 8 && (k.startsWith(tk + ' ') || k.startsWith(tk))) { hits = list; method = 'prefix'; break; }
        if (tk.length >= 10 && k.includes(tk)) { hits = list; method = 'contains'; break; }
      }
    }
    rows.push({
      song_id: c.song_id,
      title_zh: c.title_zh,
      title_en: c.title_en,
      matched: method !== null,
      match_method: method,
      tune_x: hits.length ? hits[0].x : null,
      tune_titles: hits.length ? hits[0].titles : [],
      note: method === 'exact'
        ? '与 Open Hymnal 曲目名完全一致。'
        : (method ? '按标题前缀/包含匹配（英国拼写等差异）；需人工确认同一曲调。' : '未在 Open Hymnal 2014.06 中找到对应曲目。'),
    });
  }
  return rows;
}

function main() {
  const arg = process.argv[2] || '';
  const tunes = loadABC();

  if (arg === '--index') {
    writeJSON(INDEX_REL, {
      index_version: 'MUS-V-1.1.0',
      generated_at: '2026-09-23',
      generated_by: 'MOS MUSIC tune matcher (tools, abc source)',
      source: {
        name: 'Open Hymnal Project（2014.06 版）',
        url: 'http://openhymnal.org/OpenHymnal2014.06.abc',
        license: 'Public Domain（项目自述可自由分发与修改）',
        local_file: ABC_REL,
      },
      counts: { tunes: tunes.length },
      tunes: buildIndex(tunes),
      note: '本索引是**原谱目录**，不是 MOS 曲库；用于把 MOS 100 首候选对到已出版公版原谱。',
    });
    console.log(`已写出 ${INDEX_REL}：${tunes.length} 首原谱`);
    process.exit(0);
  }

  if (arg === '--match') {
    const rows = matchCandidates(tunes);
    const matched = rows.filter((r) => r.matched).length;
    writeJSON(MATCH_REL, {
      matching_version: 'MUS-V-1.1.0',
      generated_at: '2026-09-23',
      generated_by: 'MOS MUSIC tune matcher (tools, abc source)',
      source: {
        name: 'Open Hymnal Project（2014.06 版）',
        url: 'http://openhymnal.org/OpenHymnal2014.06.abc',
        local_file: ABC_REL,
        license: 'Public Domain',
      },
      counts: { candidates: rows.length, matched, unmatched: rows.length - matched },
      rows,
      note: 'matched=true 表示曲调在已出版公版原谱库中有对应记录，可**从原谱转换**（V3.2 §五）；'
        + 'match_method 非 exact 时需人工确认是否为同一曲调。',
    });
    console.log(`已写出 ${MATCH_REL}：匹配 ${matched}/${rows.length}`);
    for (const r of rows) console.log(`  ${r.song_id} ${r.matched ? '✓' : '·'} ${r.title_en}${r.matched ? ` → X:${r.tune_x}` : ''}`);
    process.exit(0);
  }

  if (arg === '--tune') {
    const x = String(process.argv[3] || '');
    const t = tunes.find((u) => u.x === x);
    if (!t) { console.error('未找到 X:' + x); process.exit(1); }
    const key = parseKey(t.key_raw);
    console.log(JSON.stringify({
      x: t.x, titles: t.titles, aliases: t.aliases, key: t.key_raw, parsed_key: key,
      meter: t.meter, default_len: t.default_len, tempo_bpm: t.tempo_bpm, voices: t.voice_order,
      counts: Object.fromEntries(t.voice_order.map((v) => [v, t.voices[v].note_count])),
      verses_lines: t.verses,
    }, null, 2));
    const mel = t.voice_order.find((v) => t.voices[v].lyric_lines.length) || t.voice_order[0];
    const notes = buildVoiceNotes(t.voices[mel], key);
    const flat = notes.filter((n) => !n.bar);
    console.log(`\n旋律声部：${mel}  音符 ${flat.length}`);
    console.log(flat.slice(0, 40).map((n) => `${n.note || '0'}${n.octave > 0 ? "'".repeat(n.octave) : (n.octave < 0 ? ','.repeat(-n.octave) : '')}`).join(' '));
    if (t.voices[mel].lyric_lines.length) {
      const toks = t.voices[mel].lyric_lines[0];
      console.log(`\n第一节 token（${toks.length}）：${toks.slice(0, 30).join(' ')}`);
      const rows = alignVerse(toks, flat);
      console.log('对齐：', rows.slice(0, 18).map((r) => `${r.syllable_text || (r.status === ALIGN.MELISMA ? '~' : '·')}`).join('|'));
    }
    process.exit(0);
  }

  if (arg === '--check') {
    const issues = [];
    if (!exists(INDEX_REL)) issues.push(`缺少 ${INDEX_REL}`);
    if (!exists(MATCH_REL)) issues.push(`缺少 ${MATCH_REL}`);
    if (exists(MATCH_REL)) {
      const m = readJSON(MATCH_REL);
      const recount = matchCandidates(tunes);
      if ((m.rows || []).length !== recount.length) issues.push('匹配表行数与候选数不一致');
      for (let i = 0; i < recount.length; i += 1) {
        const a = m.rows[i];
        const b = recount[i];
        if (!a || a.song_id !== b.song_id || a.matched !== b.matched) issues.push(`匹配表第 ${i + 1} 行与重算不一致`);
      }
      const matched = (m.rows || []).filter((r) => r.matched).length;
      if (m.counts.matched !== matched) issues.push('counts.matched 与重算不一致');
    }
    for (const e of issues) console.error('[ERROR]', e);
    console.log(`abc-import check: ${issues.length ? 'FAIL' : 'OK'}  原谱 ${tunes.length} 首`);
    process.exit(issues.length ? 1 : 0);
  }

  console.log('用法：--index | --match | --tune <X> | --check');
  process.exit(1);
}

module.exports = {
  parseABC, parseKey, toSolfege, abcPitchToMidi, lengthToRhythm,
  buildVoiceNotes, alignVerse, attachCharIndex, loadABC, titleKeys, normTitle,
  matchCandidates, splitMeasures, ALIGN, midiName, verse1TokenLines,
};

if (require.main === module) main();
