#!/usr/bin/env node
/* =========================================================
   MOS-MUSIC｜五首完整样板生产（V3.2 §十 / §十一）
   ---------------------------------------------------------
   输入：已出版公有领域原谱（sources/openhymnal/**）+ 生产工作包既有歌词
   输出：
     · content/production/packages/MUS-S-NNNN/score.json   （原谱导入的结构化简谱 + 四声部钢琴声部）
     · content/production/packages/MUS-S-NNNN/timeline.json（由简谱节奏 + 速度**精确计算**的时间轴）
     · assets/audio/MUS-S-NNNN-piano.mid                   （由简谱生成的标准钢琴陪唱 MIDI）
     · content/song-resources/index.json 的资源记录         （外部真人 / 生成的钢琴 / AI 预留）
     · content/song-units/MUS-SU-NNNN.json                 （18 段单元，等级由 app/song-unit.js 派生）

   铁律（V3.2 §五 / §六 / §七 / §九 / §十三）：
     1) 只做**格式转换**，不改音高 / 时值 / 歌词 —— 不凭记忆编曲；
     2) 无法确认的谱面一律 SCORE_VERIFY_REQUIRED，绝不按字数或印象推算；
     3) 外部真人版本一律 source_url + start/end 定位，不下载转存；
     4) AI 示唱是独立轨（is_ai=true），永不进入真人槽位、不参与等级派生；
     5) 钢琴只做钢琴：找不到现成就按结构化简谱**生成**标准钢琴陪唱，不加乐队 / 鼓 / 吉他；
     6) 表达参考（expression_reference）必须由真人给出 —— 本轮留空数组，不由 AI 代写；
     7) 人工验收（acceptance A–J）保持 PENDING：完成等级是派生结果，不是签核结果。
========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const A = require('./abc-import.js');

const ROOT = path.resolve(__dirname, '..');
const PKG_DIR = 'content/production/packages';
const RES_INDEX = 'content/song-resources/index.json';
const MIDI_DIR = 'assets/audio';
const VERSION = 'MUS-V-1.1.0';
const TODAY = '2026-09-23';

const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const writeJSON = (rel, obj) => {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(obj, null, 2) + '\n');
};

/* ---------------------------------------------------------------- 样板定义 */

/* 曲调的定位依据：tune_x 是 Open Hymnal 曲目编号；via 说明这是怎么确定的。 */
const SAMPLES = {
  'MUS-S-0001': {
    tune_x: '192', via_title: 'Amazing Grace',
    tune_note: '曲调 NEW BRITAIN；Open Hymnal X:192（标题完全一致），无需人工选择版本。',
  },
  'MUS-S-0002': {
    tune_x: '193', via_title: 'Be Still My Soul',
    tune_note: '曲调 FINLANDIA；Open Hymnal X:193（标题完全一致）。',
  },
  'MUS-S-0004': {
    tune_x: '61', via_title: 'Joy to the World',
    tune_note: '曲调 ANTIOCH；Open Hymnal X:61（标题完全一致）。',
  },
  /* 0003 / 0005：曲调版本无法在本轮确认 → 谱面保持 SCORE_VERIFY_REQUIRED（V3.2 §五） */
  'MUS-S-0003': {
    score_pending: true,
    pending_reason: '曲调版本未定：同一文本在 hymnary.org 的出版物记录中出现 ST. CATHERINE（Hemy 1864）'
      + '，而多数教会歌本用 GALILEE（Jude 1871）。按「原谱优先，不自行凭记忆编曲」与'
      + '「无法确认 → SCORE_VERIFY_REQUIRED」，本轮不导入任何记谱，等待人工选定曲调版本。',
    tune_candidates: [
      { tune: 'ST. CATHERINE', composer: 'Henri F. Hemy (1864) / J. G. Walton', evidence: 'hymnary.org 出版物音频文件名 JesusCallsUs-StCatherine；曲调公版' },
      { tune: 'GALILEE', composer: 'John B. Dykes / Herbert Jude', evidence: 'hymnfortheday.com「Organ accompaniment to Jude’s tune」' },
    ],
    evidence_url: 'https://hymnary.org/text/jesus_calls_us_oer_the_tumult',
  },
  'MUS-S-0005': {
    score_pending: true,
    pending_reason: '曲调 SURRENDER（W. S. Weeden, 1896）的公版记谱在本轮可达的公开机器可读源中不存在；'
      + '已归档 1896 年印刷谱图像（Wikimedia Commons，Public domain）供人工逐音转写。按'
      + '「无法确认 → SCORE_VERIFY_REQUIRED」，本轮不做凭印象转写。',
    evidence: {
      source_name: 'I Surrender All, Gospel Songs of Grace and Glory（New York: Sebring Publishing Company, 1896）',
      url: 'https://commons.wikimedia.org/wiki/File:I_Surrender_All_1896_Gospel_Songs_of_Grace_and_Glory.jpg',
      local_file: 'sources/score-images/MUS-S-0005_surrender_1896_Seebring.jpg',
      license: 'Public domain（Wikimedia Commons 标注 pd；1896 年出版）',
    },
    evidence_url: 'https://hymnary.org/text/all_to_jesus_i_surrender',
  },
};

/* 外部真人资源（Reuse First：原站播放 / 嵌入 / 时间段定位，不下载转存）。
   verification_status=source_verified：来源出现在权威页面检索结果里；
   分段时间点必须由人工看片后回填 —— 本轮不猜。 */
const EXTERNAL_DEMOS = {
  'MUS-S-0001': [
    {
      gender: 'male', performer: 'Wintley Phipps', platform: 'YouTube',
      source_url: 'https://www.youtube.com/watch?v=HfGytXRpfho',
      found_via: 'jmm.org.au 文章引用的 Carnegie Hall 现场版链接',
      note: '男声独唱（Carnegie Hall 现场）。分段时间点待人工看片回填。',
    },
    {
      gender: 'male', performer: 'Guy Penrod', platform: 'GodTube',
      source_url: 'https://www.godtube.com/watch?v=GLPY7WNX',
      found_via: 'godtube.com 检索结果',
      note: '男声独唱（Gaither Music TV）。',
    },
    {
      gender: 'female', performer: 'Hayley Westenra', platform: 'YouTube',
      source_url: 'https://www.youtube.com/watch?v=5mnTKN8LuiY',
      found_via: 'artgrouplist 聚合页引用（上传者 Hayley Westenra International；2011 基督城全国纪念仪式现场清唱）',
      note: '女声独唱（a cappella 现场）。分段时间点待人工看片回填。',
    },
    {
      gender: 'female', performer: 'Judy Collins', platform: 'YouTube',
      source_url: 'https://www.youtube.com/watch?v=AtteRD5bBNQ',
      found_via: 'artgrouplist 聚合页引用（"Best Version"）',
      note: '女声独唱。分段时间点待人工看片回填。',
    },
    {
      gender: 'female', performer: null, platform: 'hymnary.org',
      source_url: 'https://hymnary.org/media/fetch/179245/hymnary/media/SCM/MP3-AmazingGrace-SPiano-128-CAM.mp3',
      found_via: 'hymnary.org 官方文本页（sources/web/hymnary-evidence.json）',
      note: ' hymnary「SPiano」系列音频（钢琴伴奏演示，非人声独唱）；登记为钢琴类来源而非真人示唱。',
      kind: 'piano_external',
    },
  ],
  'MUS-S-0002': [
    {
      gender: 'female', performer: 'Rosemary Siemens', platform: 'YouTube',
      source_url: 'https://www.youtube.com/watch?v=xDP1H5GmaxY',
      found_via: 'YouTube 检索结果（影片描述含逐段时间点）',
      segments: [
        { segment_of: 'verse', phrase_id: null, start: 30, end: 105, note: 'Verse 1（影片描述给出 0:30 起）' },
        { segment_of: 'verse', phrase_id: null, start: 105, end: 180, note: 'Verse 2（影片描述给出 1:45 起）' },
        { segment_of: 'verse', phrase_id: null, start: 254, end: 316, note: 'Verse 3（影片描述给出 4:14 起）' },
        { segment_of: 'verse', phrase_id: null, start: 316, end: 380, note: 'Verse 4（影片描述给出 5:26 起）' },
      ],
      note: '女声独唱 + 琴；影片描述自带分段时间点（0:30 / 1:45 / 4:14 / 5:26），可作为真人示唱分段依据（仍需人工复核）。',
    },
    {
      gender: 'male', performer: 'The Priests', platform: 'YouTube',
      source_url: 'https://www.youtube.com/watch?v=zf-SM5qCCRg',
      found_via: 'audio-digital.net 聚合页引用（Sony Music UK 官方音频，2021）',
      note: '男声组合（Official Audio）。分段时间点待人工看片回填。',
    },
    {
      gender: 'male', performer: 'Pat Barrett', platform: 'YouTube',
      source_url: 'https://www.youtube.com/watch?v=jNqz_DJ2Cws',
      found_via: 'audio-digital.net 聚合页引用（官方音频）',
      note: '男声独唱（Official Audio）。分段时间点待人工看片回填。',
    },
  ],
  'MUS-S-0004': [
    {
      gender: 'female', performer: 'Renée Fleming', platform: 'YouTube',
      source_url: 'https://www.youtube.com/watch?v=cLFVZBURSLc',
      found_via: '文学城论坛引用的演唱链接（washingtoninst.org 亦列出）',
      note: '女声独唱。分段时间点待人工看片回填。',
    },
    {
      gender: 'male', performer: 'Sherina Joseph（Aaradhana TV 唱诗）', platform: 'YouTube',
      source_url: 'https://www.youtube.com/watch?v=ae2FIUQUCwk',
      found_via: 'YouTube 检索结果',
      note: '男声/合唱（Sing for Jesus 节目）；性别标注需人工确认。',
    },
  ],
  'MUS-S-0003': [
    {
      gender: 'unknown', performer: '來跟從他（comeforhim.org）', platform: '自站媒体',
      source_url: 'https://cfhmedia.blob.core.windows.net/media/2024/11/247-%E8%80%B6%E7%A9%8C%E5%91%BC%E5%8F%AC-JESUS-CALLS-US.mp4',
      found_via: 'comeforhim.org《247 耶穌呼召 JESUS CALLS US》页面',
      note: '中英文对照的完整演唱视频（含繁体中文译词）。性别与分段待人工看片确认；同时是**中文歌词来源**（译本权利未判定，不托管）。',
    },
    {
      gender: 'unknown', performer: 'A Scottish Congregation', platform: 'YouTube',
      source_url: 'https://www.youtube.com/watch?v=idAoS7at3nQ',
      found_via: 'hymnfortheday.com 页面引用',
      note: '会众齐唱（另一曲调）——可作为曲调版本比较的证据。',
    },
  ],
  'MUS-S-0005': [
    {
      gender: 'male', performer: 'Wintley Phipps', platform: 'GodTube',
      source_url: 'https://www.godtube.com/watch/?v=GWLDLPNX',
      found_via: 'godtube.com 检索结果页（Gaither Music TV）',
      note: '男声独唱（低男中音）。分段时间点待人工看片回填。',
    },
    {
      gender: 'male', performer: 'Jordan Smith', platform: 'GodTube',
      source_url: 'https://www.godtube.com/watch?v=E1199CNU',
      found_via: "godtube.com 检索结果页（专辑 The People's Hymnal 版本）",
      note: '男声独唱（重新编曲版本 —— 注意与原谱曲调可能有差异，仅作示唱参考）。分段时间点待人工看片回填。',
    },
    {
      gender: 'female', performer: 'Amy Grant', platform: 'christianmusicvideosonline.com（内嵌 YouTube）',
      source_url: 'https://www.christianmusicvideosonline.com/amy-grant-i-surrender-all/',
      found_via: '检索结果页（内嵌 YouTube 音乐视频）',
      note: '女声独唱（页面内嵌 YouTube 视频）。分段时间点待人工看片回填。',
    },
  ],
};

/* ---------------------------------------------------------------- 工具 */

function fmtOct(o) {
  if (o > 0) return "'".repeat(o);
  if (o < 0) return ','.repeat(-o);
  return '';
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9']/g, '');

/* ---------------------------------------------------------------- 简谱构建 */

function buildVoiceRows(tune, key, voiceId) {
  const v = tune.voices[voiceId];
  if (!v) return { pickup: [], measures: [] };
  const rows = A.buildVoiceNotes(v, key);
  const pickup = [];
  const measures = [];
  let cur = null;
  for (const r of rows) {
    if (r.bar) { cur = []; measures.push(cur); continue; }
    if (cur === null) pickup.push(r);
    else cur.push(r);
  }
  return { pickup, measures };
}

/** 第一节 token：每个音乐行歌词块的第 1 节行（verse1TokenLines），按块序拼接。 */
function verse1Tokens(tune, voiceId) {
  const v = tune.voices[voiceId];
  if (!v) return { tokens: [], blocks: [], numbered: false };
  const sel = A.verse1TokenLines(v);
  const blocks = sel.map((line) => (line ? line.length : 0));
  const numbered = sel.some((line) => line && /^\d+\s*[.·]/.test(String(line[0] || '')));
  return { tokens: sel.filter(Boolean).flat(), blocks, numbered };
}

const normWord = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9']/g, '');

/** 歌词行 → 期望词序列（带原文字符起点，用于逐音节定位）。 */
function expectedWords(lines) {
  const out = [];
  lines.forEach((l, li) => {
    const re = /[A-Za-z0-9']+/g;
    let m;
    while ((m = re.exec(l.text))) out.push({ line_index: li, word: m[0].toLowerCase(), char: m.index });
  });
  return out;
}

/**
 * 把 alignVerse 的行（逐音符）合并成「词」：
 * joins_next（token 以 - 结尾）连接下一音节；melisma（*）归属当前词。
 */
function groupWordRows(rows) {
  const words = [];
  let cur = null;
  rows.forEach((r, i) => {
    if (r.status === A.ALIGN.OK) {
      const joins = Boolean(r.syllable && r.syllable.joins_next);
      if (cur && cur.open) {
        cur.rows.push(i);
        cur.text += r.syllable ? r.syllable.syllable : '';
        cur.open = joins;
      } else {
        cur = { rows: [i], text: r.syllable ? r.syllable.syllable : '', open: joins, melisma_only: false };
        words.push(cur);
      }
    } else if (r.status === A.ALIGN.MELISMA) {
      if (cur) cur.rows.push(i);
      else {
        cur = { rows: [i], text: '', open: false, melisma_only: true };
        words.push(cur);
      }
    } else {
      /* no_lyric（_ / |）：不参与词 */
      cur = null;
    }
  });
  return words;
}

/**
 * 谱词对齐（V3.2 §六）：原谱 w: token 与音符一一对应是**权威对齐**；
 * 再把 token 词与歌词分行文本逐词匹配，得到每个音符的歌词行与字符位置。
 * 任何一步对不上：该处标 ALIGNMENT_VERIFY_REQUIRED，绝不按字数推算。
 */
function alignVerse1(tune, key, voiceId, lines, flat) {
  const v = tune.voices[voiceId];
  if (!v || !v.lyric_lines.length) {
    return { rows: flat.map(() => ({ status: A.ALIGN.UNRESOLVED, syllable: null, line_index: null })), unresolved: flat.length, tokens: [], words: [], diag: { reason: 'no_source_lyrics' } };
  }
  const v1 = verse1Tokens(tune, voiceId);
  const rows = A.alignVerse(v1.tokens, flat);
  const diag = { blocks: v1.blocks, numbered: v1.numbered, token_count: v1.tokens.length, note_count: flat.length };
  if (v1.tokens.length !== flat.length) {
    diag.reason = 'count_mismatch';
    for (const r of rows) { r.status = A.ALIGN.UNRESOLVED; r.line_index = null; r.lyric_char_index = null; }
    return { rows, unresolved: rows.length, tokens: v1.tokens, words: [], diag };
  }
  const words = groupWordRows(rows);
  const expected = expectedWords(lines);
  let wi = 0;
  let prevLine = null;
  for (const w of words) {
    const assign = (lineIndex, charIndex) => {
      w.line_index = lineIndex;
      w.rows.forEach((ri, k) => {
        const r = rows[ri];
        r.line_index = lineIndex;
        /* 只给词首音节写字符位置：词内其余音节的位置原文无连字符，不可确定 */
        r.lyric_char_index = (k === 0 && r.status === A.ALIGN.OK) ? charIndex : null;
      });
    };
    if (w.melisma_only || !normWord(w.text)) {
      /* 纯 melisma 词：跟随前一个词的行 */
      if (prevLine !== null) assign(prevLine, null);
      else { w.rows.forEach((ri) => { rows[ri].status = A.ALIGN.UNRESOLVED; rows[ri].line_index = null; }); }
      continue;
    }
    const t = normWord(w.text);
    let found = -1;
    if (wi < expected.length && expected[wi].word === t) found = wi;
    else {
      for (let k = 1; k <= 3 && wi + k < expected.length; k += 1) {
        if (expected[wi + k].word === t) { found = wi + k; (diag.resyncs = diag.resyncs || []).push({ token: w.text, skipped: k }); break; }
      }
    }
    if (found < 0) {
      w.rows.forEach((ri) => { rows[ri].status = A.ALIGN.UNRESOLVED; rows[ri].line_index = null; rows[ri].lyric_char_index = null; });
      diag.first_mismatch = diag.first_mismatch === undefined ? wi : diag.first_mismatch;
      continue;
    }
    const exp = expected[found];
    assign(exp.line_index, exp.char);
    prevLine = exp.line_index;
    wi = found + 1;
    diag.matched_words = (diag.matched_words || 0) + 1;
  }
  const unresolved = rows.filter((r) => r.status === A.ALIGN.UNRESOLVED).length;
  return { rows, unresolved, tokens: v1.tokens, words, diag };
}

function buildScore(songId, tune, lyricLines) {
  const key = A.parseKey(tune.key_raw);
  const melodyId = tune.voice_order.find((v) => tune.voices[v].lyric_lines.length) || tune.voice_order[0];
  const mel = buildVoiceRows(tune, key, melodyId);
  const all = [...mel.pickup, ...mel.measures.flat()];
  const pitches = all.filter((r) => !r.rest).map((r) => r.midi);
  const range = {
    lowest: pitches.length ? A.midiName(Math.min(...pitches)) : null,
    highest: pitches.length ? A.midiName(Math.max(...pitches)) : null,
  };
  const ali = alignVerse1(tune, key, melodyId, lyricLines, all);

  /* 乐句 = 原谱音乐行（w: 歌词块边界）。token 与音符 1:1 时，块边界即音符边界；
     对不上时**不推算**：整曲合并为一个乐句并标记待核。 */
  const phrases = [];
  const diag = ali.diag || {};
  const aligned = diag.reason !== 'count_mismatch' && diag.reason !== 'no_source_lyrics';
  if (aligned && diag.blocks && diag.blocks.length) {
    let acc = 0;
    diag.blocks.forEach((cnt) => {
      const from = acc;
      const to = acc + cnt - 1;
      acc += cnt;
      if (cnt <= 0) return;
      const lineIds = [];
      for (let i = from; i <= to && i < ali.rows.length; i += 1) {
        const r = ali.rows[i];
        if (r.line_index != null && lyricLines[r.line_index]) {
          const lid = lyricLines[r.line_index].line_id;
          if (!lineIds.includes(lid)) lineIds.push(lid);
        }
      }
      phrases.push({ from, to, line_ids: lineIds });
    });
  } else {
    phrases.push({ from: 0, to: all.length - 1, line_ids: [], unverified: !aligned });
  }

  const toBeat = (r, row) => {
    const li = row && row.line_index != null ? row.line_index : null;
    return {
      note: r.note, octave: r.octave, duration: r.duration, dot: Boolean(r.dot),
      tie: Boolean(r.tie), rest: Boolean(r.rest), accidental: r.accidental,
      lyric_line_id: li != null && lyricLines[li] ? lyricLines[li].line_id : null,
      lyric_char_index: row && row.lyric_char_index !== undefined ? row.lyric_char_index : null,
      lyric_status: row ? row.status : A.ALIGN.UNRESOLVED,
      beat_start: r.beat_start,
      ...(row && row.status === A.ALIGN.OK ? { syllable: row.syllable ? row.syllable.syllable : null } : {}),
      ...(row && row.status === A.ALIGN.MELISMA ? { melisma: true, syllable: row.syllable_text || null } : {}),
    };
  };

  let gi = 0;
  const pickupBeats = mel.pickup.map((r) => toBeat(r, ali.rows[gi++]));
  const sections = [{
    section_id: 'tune', label: '曲调（全曲各节共用同一旋律）',
    measures: mel.measures.map((mm) => ({
      measure_no: 0, repeat: null,
      beats: mm.map((r) => toBeat(r, ali.rows[gi++])),
    })),
  }];
  let mno = 1;
  for (const m of sections[0].measures) m.measure_no = mno++;

  /* 四声部钢琴声部（各自带弱起） */
  const voiceParts = {};
  const voiceMeta = [];
  for (const vid of tune.voice_order) {
    const vp = buildVoiceRows(tune, key, vid);
    voiceParts[vid] = { pickup: vp.pickup, measures: vp.measures };
    voiceMeta.push({ voice_id: vid, label: vid, note_count: vp.pickup.length + vp.measures.flat().length });
  }
  const pianoMeasures = [];
  const nM = mel.measures.length;
  for (let m = 0; m < nM; m += 1) {
    pianoMeasures.push({
      measure_no: m + 1,
      voices: Object.fromEntries(tune.voice_order.map((vid) => [vid, (voiceParts[vid].measures[m] || [])])),
    });
  }
  const pianoPickup = Object.fromEntries(tune.voice_order.map((vid) => [vid, voiceParts[vid].pickup]));

  const sight = {
    starting_note: (mel.pickup[0] && !mel.pickup[0].rest)
      ? `${mel.pickup[0].note}${fmtOct(mel.pickup[0].octave)}` : null,
    phrases: phrases.map((p, i) => {
      const ms = all.slice(p.from, p.to + 1).map((x) => x.measure_no).filter((n) => n > 0);
      return {
        phrase_id: `PHRASE-${String(i + 1).padStart(2, '0')}`,
        line_ids: p.line_ids,
        measures: [ms.length ? Math.min(...ms) : 1, ms.length ? Math.max(...ms) : 1],
        singable: true,
        ...(p.unverified ? { unverified: true } : {}),
      };
    }),
    note: '乐句 = 原谱音乐行（w: 歌词块）；一句可跨多个歌词行（line_ids 按出现序）。'
      + '秒数时间轴见 timeline.json（由简谱节奏 + 速度精确计算，非插值）。',
  };

  const unresolvedNotes = ali.rows
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r.status === A.ALIGN.UNRESOLVED)
    .map((x) => x.i);

  return {
    key, melodyId, mel, ali, phrases, sections, pickupBeats, pianoMeasures, pianoPickup,
    voiceMeta, sight, range, unresolvedNotes, allNotes: all, default_len: tune.default_len || 0.25,
  };
}

/* ---------------------------------------------------------------- 时间轴 */

/** 由简谱节奏 × 速度精确计算每个音的秒数（非插值、非猜测）。 */
function noteTimes(scoreObj, tempoBpm) {
  const spq = 60 / tempoBpm;
  const unit = scoreObj.default_len || 0.25;
  const out = [];
  let q = 0;
  for (const r of scoreObj.allNotes) {
    const beats = r.length_whole / unit;
    out.push({ r, t: q * spq, end: (q + beats) * spq, beats });
    q += beats;
  }
  return { times: out, spq };
}

function timelinePhrases(scoreObj, tempoBpm, lyricLines) {
  const { times, spq } = noteTimes(scoreObj, tempoBpm);
  const phrases = [];
  scoreObj.phrases.forEach((p) => {
    const items = times.slice(p.from, p.to + 1);
    if (!items.length) return;
    const start = Math.round(items[0].t * 1000) / 1000;
    const end = Math.round(items[items.length - 1].end * 1000) / 1000;
    const ms = items.map((it) => it.r.measure_no).filter((n) => n > 0);
    phrases.push({
      phrase_id: `PHRASE-${String(phrases.length + 1).padStart(2, '0')}`,
      section_id: 'tune',
      line_ids: p.line_ids || [],
      start, end,
      measure_start: ms.length ? Math.min(...ms) : null,
      measure_end: ms.length ? Math.max(...ms) : null,
      marks: items.map((it, i) => ({
        kind: 'note', start: Math.round(it.t * 1000) / 1000,
        end: Math.round(it.end * 1000) / 1000, no: null, index: i, beat: it.r.beat_start,
      })),
      ...(p.unverified ? { unverified: true } : {}),
    });
  });
  const total = times.length ? Math.round(times[times.length - 1].end * 1000) / 1000 : 0;
  return { phrases, total, spq };
}

/* ---------------------------------------------------------------- MIDI */

function writeMidi(rel, scoreObj, tempoBpm) {
  const TPQ = 480;
  const unit = scoreObj.default_len || 0.25;
  const events = [];
  for (const vid of scoreObj.pianoVoiceIds) {
    let t = 0;
    const seq = scoreObj.pianoVoices[vid];
    for (let i = 0; i < seq.length; i += 1) {
      const r = seq[i];
      let dur = Math.max(1, Math.round(r.length_whole / unit * TPQ));
      /* 延音线：与后续同音符合并时值（不重击），忠实于原谱的 tie */
      if (r.tie && !r.rest) {
        let j = i + 1;
        while (j < seq.length && !seq[j].rest && seq[j].midi === r.midi) {
          dur += Math.max(1, Math.round(seq[j].length_whole / unit * TPQ));
          const chain = Boolean(seq[j].tie);
          i = j;
          j += 1;
          if (!chain) break;
        }
      }
      if (!r.rest && r.midi) {
        events.push({ t, type: 'on', note: r.midi, vel: 78 });
        events.push({ t: t + dur - 4, type: 'off', note: r.midi, vel: 0 });
      }
      t += dur;
    }
  }
  events.sort((a, b) => (a.t - b.t) || ((a.type === 'off' ? 0 : 1) - (b.type === 'off' ? 0 : 1)));
  const bytes = [];
  const push = (...a) => bytes.push(...a);
  /* varLen 只属于轨道数据：返回字节数组，由调用方推入 track（此前误推入
     bytes 顶层，导致 delta 全部错位、整条轨道损坏 —— 2026-09-24 修复）。 */
  const varLen = (n) => {
    const buf = [n & 0x7f];
    n >>= 7;
    while (n > 0) { buf.unshift((n & 0x7f) | 0x80); n >>= 7; }
    return buf;
  };
  /* header */
  const head = 'MThd';
  for (const c of head) push(c.charCodeAt(0));
  push(0, 0, 0, 6, 0, 0, 0, 1, (TPQ >> 8) & 0xff, TPQ & 0xff);
  /* track */
  const track = [];
  const tpush = (...a) => track.push(...a);
  const tempoUs = Math.round(60000000 / tempoBpm);
  tpush(0x00, 0xff, 0x51, 0x03, (tempoUs >> 16) & 0xff, (tempoUs >> 8) & 0xff, tempoUs & 0xff);
  tpush(0x00, 0xc0, 0x00); /* program 0 = piano */
  let last = 0;
  for (const e of events) {
    tpush(...varLen(e.t - last));
    last = e.t;
    tpush(e.type === 'on' ? 0x90 : 0x80, e.note & 0x7f, e.vel & 0x7f);
  }
  tpush(...varLen(0));
  tpush(0xff, 0x2f, 0x00);
  for (const c of 'MTrk') push(c.charCodeAt(0));
  push((track.length >> 24) & 0xff, (track.length >> 16) & 0xff, (track.length >> 8) & 0xff, track.length & 0xff);
  push(...track);
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, Buffer.from(bytes));
  return rel;
}

/* ---------------------------------------------------------------- 主流程 */

function main() {
  const only = process.argv.find((a) => a.startsWith('--song='));
  const tunes = A.loadABC();
  const resIndex = readJSON(RES_INDEX);
  const resources = [...(resIndex.resources || [])];
  let rid = resources.reduce((m, r) => Math.max(m, parseInt(String(r.resource_id).slice(-4), 10) || 0), 0);

  const summary = [];
  for (const [songId, cfg] of Object.entries(SAMPLES)) {
    if (only && !songId.endsWith(only.split('=')[1])) continue;
    const n = songId.slice(-4);
    const pkg = `${PKG_DIR}/${songId}`;
    const lyricPkg = exists(`${pkg}/lyrics.json`) ? readJSON(`${pkg}/lyrics.json`) : null;
    const verse1 = lyricPkg && lyricPkg.sections && lyricPkg.sections[0]
      ? lyricPkg.sections[0].lines : [];

    /* ---- 资源层记录（V3.2 §七 / §八 / §九）：先移除本工具旧记录，再重建（幂等） ---- */
    for (let i = resources.length - 1; i >= 0; i -= 1) {
      if (resources[i].song_id === songId && String(resources[i].notes || '').includes('generated_by:sample-l4')) resources.splice(i, 1);
    }
    const newRes = [];
    const stamp = `${TODAY}T00:00:00Z`;
    const mkRes = (fields) => {
      rid += 1;
      newRes.push(Object.assign({
        resource_id: `MUS-R-${String(rid).padStart(4, '0')}`,
        song_id: songId,
        resource_type: 'LEAD_VOCAL',
        language: null,
        version: null,
        key: null,
        source: 'MOS-MUSIC 五首样板生产（tools/sample-l4.js）',
        copyright_status: 'unknown',
        license_status: null,
        verification_status: 'unverified',
        file_url: null,
        source_type: null,
        source_url: null,
        host_policy: null,
        segment: null,
        is_ai: null,
        engine: null,
        vendor: null,
        source_tracking: null,
        notes: 'generated_by:sample-l4',
        created_at: stamp,
        updated_at: stamp,
      }, fields));
    };
    for (const d of (EXTERNAL_DEMOS[songId] || [])) {
      if (d.kind === 'piano_external') {
        mkRes({
          resource_type: 'ACCOMPANIMENT',
          source: `hymnary.org 官方文本页列出的钢琴演示音频（${d.performer || 'SPiano'}）`,
          copyright_status: 'unknown',
          verification_status: 'source_verified',
          source_url: d.source_url,
          host_policy: 'original_site',
          notes: `generated_by:sample-l4｜${d.note}｜找到途径：${d.found_via}`,
        });
        continue;
      }
      const st = d.gender === 'male' ? 'EXTERNAL_HUMAN_MALE' : (d.gender === 'female' ? 'EXTERNAL_HUMAN_FEMALE' : null);
      /* schema：segment 为单对象 → 每个切段一条资源记录（同一完整版本可切整曲 / 分节 / 难句） */
      const segs = (d.segments && d.segments.length) ? d.segments : [null];
      for (const sg of segs) {
        mkRes({
          resource_type: 'LEAD_VOCAL',
          source: `${d.performer || '未署名表演者'}（${d.platform}）`,
          copyright_status: 'unknown',
          verification_status: 'source_verified',
          source_type: st,
          source_url: d.source_url,
          host_policy: 'original_site',
          segment: sg ? {
            phrase_id: sg.phrase_id || null, segment_of: sg.segment_of || null,
            start: sg.start != null ? sg.start : null, end: sg.end != null ? sg.end : null,
          } : null,
          notes: `generated_by:sample-l4｜${d.note}｜找到途径：${d.found_via}`
            + (sg ? `｜切段：${sg.note || ''}` : '｜分段时间点 start/end = null，待人工看片回填（不猜）。'),
        });
      }
    }
    if (cfg.score_pending !== true) {
      mkRes({
        resource_type: 'ACCOMPANIMENT',
        source: 'MOS 生成：按结构化简谱（原谱四声部 S/A/T/B）生成的标准钢琴陪唱',
        copyright_status: 'public_domain',
        license_status: null,
        verification_status: 'source_verified',
        file_url: `${MIDI_DIR}/${songId}-piano.mid`,
        host_policy: 'hosted_authorized',
        notes: 'generated_by:sample-l4｜GENERATED_PIANO：纯钢琴，不加乐队 / 鼓 / 吉他；'
          + '时值与延音线忠实于原谱（Open Hymnal 2014.06，公有领域）；MIDI 与 timeline.json 同源（同一简谱 × 同一速度）。',
      });
    }
    /* AI 示唱预留轨：RESERVED / NOT_CONNECTED（V3.2 §八） */
    for (const st of ['AI_MALE', 'AI_FEMALE']) {
      mkRes({
        resource_type: 'LEAD_VOCAL',
        source: 'AI 歌声接口（预留）',
        copyright_status: 'unknown',
        verification_status: 'unverified',
        source_type: st,
        is_ai: true,
        notes: 'generated_by:sample-l4｜RESERVED / NOT_CONNECTED：本轮未接入任何 AI 歌声引擎；'
          + '前台必须标注「AI示唱（非真人）」，不进入真人槽位、不参与 L1–L4 等级派生。',
      });
    }
    resources.push(...newRes);

    if (cfg.score_pending) {
      /* 谱面无法确认：如实记录，不导入任何记谱 */
      const scorePath = `${pkg}/score.json`;
      const prev = exists(scorePath) ? readJSON(scorePath) : null;
      const obj = {
        package_version: VERSION, song_id: songId, unit_id: `MUS-SU-${n}`, slot: 'score',
        status: 'NOT_AVAILABLE',
        key: null, time_signature: null, tempo_bpm: null, pickup: null,
        starting_note: null, range: { lowest: null, highest: null },
        sections: [], pickup_beats: [], special_marks: [], sight_singing: null,
        transcription: { status: 'NOT_STARTED', method: null, verified_measures: null, proofread: { status: 'PENDING', checked_by: null, date: null, note: null } },
        score_verify_required: true,
        pending_reason: cfg.pending_reason,
        tune_candidates: cfg.tune_candidates || null,
        evidence: cfg.evidence || null,
        note: 'V3.2 §五：无法确认 → SCORE_VERIFY_REQUIRED。不做凭记忆 / 凭印象的转写；'
          + '来源证据已归档，等人工逐音转写并听校后才置 PROVIDED。',
      };
      if (!prev || prev.transcription.status !== 'SOURCE_IMPORTED') writeJSON(scorePath, obj);
      summary.push({ song_id: songId, score: 'SCORE_VERIFY_REQUIRED' });
      continue;
    }

    const tune = tunes.find((t) => t.x === cfg.tune_x);
    if (!tune) { console.error(`找不到 X:${cfg.tune_x}`); process.exit(1); }
    const s = buildScore(songId, tune, verse1);
    const tl = timelinePhrases(s, tune.tempo_bpm || 100, verse1);
    const tempo = tune.tempo_bpm || 100;

    const scoreObj = {
      package_version: VERSION, song_id: songId, unit_id: `MUS-SU-${n}`, slot: 'score',
      status: 'PROVIDED',
      key: `1=${tune.key_raw}（do=中央C上方同名音；可按会众音域整体移调）`,
      time_signature: tune.meter, tempo_bpm: tune.tempo_bpm || null,
      pickup: s.mel.pickup.length > 0,
      starting_note: s.sight.starting_note ? `${s.sight.starting_note}（${s.range.lowest === s.sight.starting_note ? '最低音' : '起音'}）` : null,
      range: s.range,
      sections: s.sections,
      pickup_beats: s.pickupBeats,
      special_marks: [
        `拍号 ${tune.meter}；速度 ♩=${tune.tempo_bpm || '?'}`,
        `全曲 ${s.mel.measures.length} 小节${s.mel.pickup.length ? '，弱起 ' + s.mel.pickup.length + ' 音' : ''}`,
        ...s.pianoMeasures.slice(0, 1).length ? ['四声部钢琴声部见 piano_voicing（原谱 S/A/T/B）'] : [],
      ],
      sight_singing: s.sight,
      transcription: {
        status: 'SOURCE_IMPORTED',
        method: `由已出版公有领域原谱（Open Hymnal Project 2014.06，X:${cfg.tune_x}）机械转换；`
          + '只做格式转换，不改音高 / 时值 / 歌词。',
        source: {
          name: 'Open Hymnal Project（2014.06 版）',
          url: 'http://openhymnal.org/OpenHymnal2014.06.abc',
          local_file: 'sources/openhymnal/OpenHymnal2014.06.abc',
          tune_x: cfg.tune_x,
          tune_title: (tune.titles || [])[0] || null,
          license: 'Public Domain（项目自述可自由分发与修改）',
          credits: tune.credits,
        },
        verified_measures: s.sections[0].measures.map((m) => m.measure_no),
        proofread: {
          status: 'PENDING', checked_by: null, date: null,
          note: 'SOURCE_IMPORTED ≠ 已人工听校：转换忠实于原谱，但仍需人工对照原谱逐小节听校；'
            + '通过前不得改为 VERIFIED，也不得据此宣称「已校对」。',
        },
        known_gaps: [
          '逐音节歌词对齐只覆盖第一节（各节共用同一旋律）；',
          ...(s.unresolvedNotes.length ? [`第一节仍有 ${s.unresolvedNotes.length} 个音节的字符位置未能确定（ALIGNMENT_VERIFY_REQUIRED）`] : []),
        ],
      },
      piano_voicing: {
        basis: `Open Hymnal X:${cfg.tune_x} 四声部（S/A/T/B）`,
        voices: s.voiceMeta,
        measures: s.pianoMeasures,
        generated_piano: {
          kind: 'GENERATED_PIANO',
          note: '按结构化简谱（原谱四声部）生成的标准钢琴陪唱；纯钢琴，不加乐队 / 鼓 / 吉他。',
          midi_file: `${MIDI_DIR}/${songId}-piano.mid`,
        },
      },
      lyric_alignment: {
        rule: '逐音节对齐只写能确定的位置；不能确定处为 null 并计入 unresolved（ALIGNMENT_VERIFY_REQUIRED）。',
        method: '原谱 w: token ↔ 音符 1:1（权威对齐）→ token 合词 → 与歌词分行文本逐词匹配（行号 + 词首字符位置）。',
        verse_1_tokens: s.ali.tokens.length,
        unresolved: s.unresolvedNotes.length,
        resolved: s.ali.rows.filter((r) => r.status === A.ALIGN.OK || r.status === A.ALIGN.MELISMA).length,
        diagnostic: s.ali.diag || null,
      },
      note: `曲调定位：${cfg.tune_note} 谱面状态 SOURCE_IMPORTED（原谱导入）；人工听校 PENDING。`,
    };
    writeJSON(`${pkg}/score.json`, scoreObj);

    /* lyrics.json 的 phrase_id 回填：行首词所在乐句（仅 token↔音符 1:1 时可做） */
    const alignedOk = s.ali.diag && s.ali.diag.reason === undefined;
    if (alignedOk && lyricPkg) {
      const linePhrase = {};
      s.ali.words.forEach((w) => {
        if (!w.rows || !w.rows.length || w.line_index == null) return;
        const ni = w.rows[0];
        const pi = s.phrases.findIndex((p) => ni >= p.from && ni <= p.to);
        if (pi >= 0 && verse1[w.line_index]) {
          const lid = verse1[w.line_index].line_id;
          if (lid && !(lid in linePhrase)) linePhrase[lid] = pi;
        }
      });
      lyricPkg.sections.forEach((sec) => sec.lines.forEach((l) => {
        if (linePhrase[l.line_id] !== undefined) {
          l.phrase_id = `PHRASE-${String(linePhrase[l.line_id] + 1).padStart(2, '0')}`;
        }
      }));
      lyricPkg.structure_note = '每节四行；全曲各节共用同一曲调。phrase_id = 行首词所在的原谱乐句'
        + '（由 tools/sample-l4.js 按逐词对齐回填；一句歌词可跨乐句，以行首词为准）。';
      writeJSON(`${pkg}/lyrics.json`, lyricPkg);
    }

    /* timeline */
    const tlObj = {
      package_version: VERSION, song_id: songId, slot: 'timeline', status: 'SYNC_READY',
      tempo_bpm: tempo,
      beats_per_second: Math.round((1 / tl.spq) * 1000) / 1000,
      duration_seconds: tl.total,
      phrases: tl.phrases,
      rule: '时间由简谱节奏 × 速度**精确计算**（非插值、非猜测）：每个 note 标记都是乐谱自身的时值。'
        + '该时间轴对「生成的钢琴陪唱」是精确的；对外部真人录音**不适用**，真人版本的分段时间点须由人工看片回填。',
      note: `共 ${tl.phrases.length} 句；总时长约 ${tl.total}s（按 ♩=${tempo}）`,
    };
    writeJSON(`${pkg}/timeline.json`, tlObj);

    /* manifest 槽位同步：谱面 = 原谱导入（PROVIDED）；时间轴 = 简谱精确计算（SYNC_READY） */
    const mfPath = `${pkg}/manifest.json`;
    if (exists(mfPath)) {
      const mf = readJSON(mfPath);
      mf.slots.score = { status: 'PROVIDED', file: 'score.json', transcription: 'SOURCE_IMPORTED', proofread: 'PENDING' };
      mf.slots.timeline = { status: 'PROVIDED', file: 'timeline.json', sync_status: 'SYNC_READY' };
      writeJSON(mfPath, mf);
    }

    /* piano MIDI */
    scoreObj.pianoVoiceIds = tune.voice_order;
    scoreObj.pianoVoices = Object.fromEntries(tune.voice_order.map((vid) => [
      vid, [...s.pianoPickup[vid], ...s.pianoMeasures.map((m) => m.voices[vid]).flat()],
    ]));
    const midiRel = writeMidi(`${MIDI_DIR}/${songId}-piano.mid`, scoreObj, tempo);
    delete scoreObj.pianoVoices;
    delete scoreObj.pianoVoiceIds;

    summary.push({ song_id: songId, score: 'SOURCE_IMPORTED', measures: s.mel.measures.length, phrases: tl.phrases.length, midi: midiRel });
  }

  /* 写回资源索引与计数 */
  resIndex.resources_version = VERSION;
  resIndex.resources = resources;
  resIndex.counts = {
    total: resources.length,
    by_type: resources.reduce((m, r) => { m[r.resource_type] = (m[r.resource_type] || 0) + 1; return m; }, {}),
    external_human: resources.filter((r) => String(r.source_type || '').startsWith('EXTERNAL_HUMAN')).length,
    mos_human: resources.filter((r) => String(r.source_type || '').startsWith('MOS_HUMAN')).length,
    ai: resources.filter((r) => r.is_ai === true).length,
  };
  writeJSON(RES_INDEX, resIndex);

  /* 生产索引的平台计数同步（V3.2）：资源记录 / 简谱状态 / 真人示唱轨 */
  const prodIdxPath = 'content/production/index.json';
  if (exists(prodIdxPath)) {
    const prod = readJSON(prodIdxPath);
    prod.counts = prod.counts || {};
    prod.counts.song_resource_records = resources.length;
    prod.counts.song_packages_score_draft = 0;
    prod.counts.song_packages_score_imported = 3;
    prod.counts.song_packages_score_pending = 2;
    prod.counts.external_human_tracks_provided = resources
      .filter((r) => String(r.source_type || '').startsWith('EXTERNAL_HUMAN')).length;
    prod.counts.ai_demo_tracks_provided = 0; /* AI 示唱 RESERVED / NOT_CONNECTED，不计入已提供 */
    writeJSON(prodIdxPath, prod);
  }

  writeJSON('content/production/sample-l4-report.json', {
    report_version: VERSION,
    generated_at: TODAY,
    generated_by: 'tools/sample-l4.js',
    summary,
    note: '五首样板的生产结果；等级由 app/song-unit.js 派生，本文件不宣布等级。',
  });
  console.log(JSON.stringify(summary, null, 1));
}

main();
