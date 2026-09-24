#!/usr/bin/env node
/* =========================================================
   MOS-MUSIC｜Production Package Builder（生产工作包生成器 · PILOT 10）
   ---------------------------------------------------------
   任务书：SONG PRODUCTION PILOT 10（§二 生产工作包）
   为 10 首详情层歌曲各建 content/production/packages/MUS-S-NNNN/，
   每包含 9 槽位：metadata / lyrics / score / audio / timeline /
   teaching / content / rights / worksheet（+ manifest）。

   铁律：
     · 只生成结构；**绝不覆盖**已存在的 lyrics.json / score.json / manifest.json
       （人工与工具产出的内容文件优先）；
     · 资源不存在一律 NOT_AVAILABLE / SYNC_NOT_READY，绝不虚构；
     · 禁 AI 歌声冒充真人示唱；伴奏只做钢琴；
     · 法律状态沿用详情层词表（ADR-0012），不作推定。
   用法：node tools/build-packages.js [--check]
   ========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PKG_DIR = 'content/production/packages';
const TODAY = '2026-09-22';
const VERSION = 'MUS-V-1.0.0';

const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const writeJSON = (rel, obj, force) => {
  const abs = path.join(ROOT, rel);
  if (!force && fs.existsSync(abs)) return false;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(obj, null, 2) + '\n');
  return true;
};
const j = (o) => JSON.stringify(o, null, 2) + '\n';

function splitTitle(title) {
  const m = String(title || '').match(/^(.*?)（(.+?)）\s*$/);
  return m ? { zh: m[1].trim(), en: m[2].trim() } : { zh: String(title || ''), en: null };
}

/* 每首的阻断项与权利注记（任务书 §一 / §十五：缺什么写什么，不虚构）。 */
const SONG_NOTES = {
  'MUS-S-0009': {
    extra_blocking: ['english_adaptation_may_be_copyrighted（详情记录明示：通行英译与改编 Stuart K. Hine 可能仍在版权期内）'],
    rights_note: '1923？否——原词 1885；但通行英译与改编（Stuart K. Hine）可能仍在版权期内。本仓不作判定。',
  },
  'MUS-S-0010': {
    extra_blocking: ['jurisdiction_dependent（1923 年作品在不同法域状态不一致，详情记录不作判定）'],
    rights_note: '1923 年作品在不同法域的法律状态不一致；详情记录明示不作判定，等待逐首认定或授权。',
  },
};
const COMMON_BLOCKING = [
  'lyrics_zh_translation_rights（常见中文译本各有版权方，本仓不托管；等待 USER_PROVIDED 或授权，CI-0028）',
  'audio_human_recording（钢琴伴奏与真人示唱未录制；禁 AI 歌声冒充真人）',
  'score_not_started（统一简谱未转写或未听校）',
  'lyrics_proofread_pending（已托管歌词尚未逐节核对）',
];
const RIGHTS_UNDETERMINED_BLOCKING = [
  'rights_undetermined（作品级法律状态未判定，ADR-0012：不得据清单推定；一切资源 NOT_AVAILABLE）',
];

function main() {
  const check = process.argv.includes('--check');
  const pkgIndex = readJSON(`${PKG_DIR}/index.json`);
  const orderMap = new Map((pkgIndex.sample.order || []).map((o) => [o.song_id, o]));
  const blockedMap = new Map((pkgIndex.sample.blocked || []).map((o) => [o.song_id, o]));
  const songsIndex = readJSON('content/songs/index.json');

  const missing = [];
  const written = [];
  for (const row of songsIndex.songs || []) {
    const song = readJSON(row.file);
    const sid = song.song_id;
    const n = String(sid).slice(-4);
    const base = `${PKG_DIR}/${sid}`;
    const sample = orderMap.get(sid) || null;
    const blockedInfo = blockedMap.get(sid) || null;
    const legal = (song.copyright && song.copyright.copyright_status) || 'unknown';
    const isPD = legal === 'public_domain';
    const notes = SONG_NOTES[sid] || {};

    /* --- lyrics（缺失时写 NOT_AVAILABLE 骨架） --- */
    const lyricsRel = `${base}/lyrics.json`;
    let lyricsStatus = 'NOT_AVAILABLE';
    if (exists(lyricsRel)) {
      const ly = readJSON(lyricsRel);
      lyricsStatus = (Array.isArray(ly.sections) && ly.sections.length) ? 'PROVIDED' : 'NOT_AVAILABLE';
    } else {
      const obj = {
        package_version: VERSION, song_id: sid, unit_id: `MUS-SU-${n}`, slot: 'lyrics',
        status: 'NOT_AVAILABLE', language: null, version_note: null, sections: [],
        reason: isPD
          ? '歌词未整理；整理后人工写入本文件（不得自动生成）。'
          : '作品级法律状态未判定（ADR-0012）；在完成逐首认定或取得授权之前，不托管任何语言的歌词文本。',
        proofread: { status: 'PENDING', checked_by: null, date: null, note: null },
        rights: { copyright_status: legal, basis: null, derived_from: `content/songs/${sid}.json#copyright.copyright_status` },
        note: '中文译本一律 NOT_AVAILABLE（译本权利未确认，CI-0028）。',
      };
      if (!check && writeJSON(lyricsRel, obj)) written.push(lyricsRel);
    }

    /* --- score（缺失时写 NOT_STARTED 骨架） --- */
    const scoreRel = `${base}/score.json`;
    let scoreStatus = 'NOT_AVAILABLE';
    let scoreTrans = 'NOT_STARTED';
    if (exists(scoreRel)) {
      const sc = readJSON(scoreRel);
      scoreTrans = (sc.transcription && sc.transcription.status) || 'NOT_STARTED';
      scoreStatus = scoreTrans === 'VERIFIED' ? 'PROVIDED' : (scoreTrans === 'DRAFT' ? 'DRAFT' : 'NOT_AVAILABLE');
    } else {
      const obj = {
        package_version: VERSION, song_id: sid, unit_id: `MUS-SU-${n}`, slot: 'score',
        status: 'NOT_AVAILABLE', key: null, time_signature: null, tempo_bpm: null,
        pickup: null, starting_note: null, range: { lowest: null, highest: null },
        sections: [], pickup_beats: [], special_marks: [], sight_singing: null,
        transcription: {
          status: 'NOT_STARTED', method: null, verified_measures: null,
          proofread: { status: 'PENDING', checked_by: null, date: null, note: null },
        },
        reason: isPD
          ? '统一简谱未转写；转写后人工写入本文件（统一格式：调 / 拍号 / 起音 / 小节 / 音符 / 节奏 / 歌词对齐）。不得用 PDF 截图冒充结构化简谱。'
          : '作品级法律状态未判定（ADR-0012）；曲调权利未确认前不托管任何记谱。',
        note: 'DRAFT（转写未听校）不计入等级派生；校对通过并置 VERIFIED 后，由工具把单元 score 置为 PROVIDED。',
      };
      if (!check && writeJSON(scoreRel, obj)) written.push(scoreRel);
    }

    /* --- metadata（来自详情记录的既有事实） --- */
    const t = splitTitle(song.title);
    const metaRel = `${base}/metadata.json`;
    const meta = {
      package_version: VERSION, song_id: sid, unit_id: `MUS-SU-${n}`, slot: 'metadata',
      title_zh: t.zh, title_en: t.en, author: song.author || null, composer: song.composer || null,
      language: song.language || null, original_or_translation: song.original_or_translation || null,
      era: song.era || null, source: song.source || null,
      copyright_status: legal,
      structure: null, current_version: null,
      unresolved: [
        '中文译词版本与译者未核验',
        '当前采用的简谱版本未确定',
        '调 / 拍号 / 速度 / 时长 / 段落结构未核验',
        ...(legal === 'unknown' ? ['作品级法律状态未判定（不得据清单推定）'] : []),
      ],
      derived_from: `content/songs/${sid}.json`,
      note: '本文件只登记详情层的既有事实；不确定的项进 unresolved，不得用空字符串掩盖。',
    };
    if (!check && writeJSON(metaRel, meta, true)) written.push(metaRel);

    /* --- audio（一律 NOT_AVAILABLE：没有真人录音） --- */
    const audioRel = `${base}/audio.json`;
    const audio = {
      package_version: VERSION, song_id: sid, slot: 'audio', status: 'NOT_AVAILABLE',
      standard: '第一阶段伴奏统一只做钢琴（piano）；不做乐队 / 鼓 / 吉他 / 多轨复杂编曲。',
      piano: { status: 'NOT_AVAILABLE', file_url: null, reason: '真人钢琴伴奏未录制。' },
      demo_male: { status: 'NOT_AVAILABLE', file_url: null, singer_type: null, gender: 'male', language: null, key: null, version: null, source: null, rights: null, reason: '真人男声示唱未录制；禁 AI 歌声冒充真人示唱。' },
      demo_female: { status: 'NOT_AVAILABLE', file_url: null, singer_type: null, gender: 'female', language: null, key: null, version: null, source: null, rights: null, reason: '真人女声示唱未录制；禁 AI 歌声冒充真人示唱。' },
      files: [],
      note: '出现真实录音时：登记 singer_type / gender / language / key / version / source / rights，并把 status 置 PROVIDED（任务书 §七）。',
    };
    if (!check && writeJSON(audioRel, audio, true)) written.push(audioRel);

    /* --- timeline（无音频 ⇒ SYNC_NOT_READY） --- */
    const tlRel = `${base}/timeline.json`;
    const tl = {
      package_version: VERSION, song_id: sid, slot: 'timeline', status: 'SYNC_NOT_READY',
      phrases: [],
      rule: '要求真实同步：音频 → 小节 → 音符 → 歌词；没有可靠时间标记就保持 SYNC_NOT_READY，不进行时间插值猜测（任务书 §八）。',
      note: '示唱与钢琴录音进入后，按真实标记建立 phrase timeline / measure mapping / lyric timing / cursor marks。',
    };
    if (!check && writeJSON(tlRel, tl, true)) written.push(tlRel);

    /* --- teaching（真人教学资源一律 NOT_AVAILABLE） --- */
    const teachRel = `${base}/teaching.json`;
    const teaching = {
      package_version: VERSION, song_id: sid, slot: 'teaching', status: 'NOT_AVAILABLE',
      modules: ['intro', 'teach-score', 'teach-rhythm', 'teach-lyrics', 'phrase-teaching', 'vocal-tip', 'full-demo']
        .map((k) => ({ key: k, status: 'NOT_AVAILABLE', resource_id: null })),
      learn: { status: 'NOT_AVAILABLE', note: '学唱五步要真能跑，需词 / 谱 / 钢琴 / 至少一个示唱 / 时间轴齐备。' },
      note: '没有真人资源时保持 NOT_AVAILABLE，不要虚构（任务书 §九）。',
    };
    if (!check && writeJSON(teachRel, teaching, true)) written.push(teachRel);

    /* --- content（引用单元记录，避免双份维护） --- */
    const contentRel = `${base}/content.json`;
    const content = {
      package_version: VERSION, song_id: sid, slot: 'content', status: 'PROVIDED',
      unit_ref: `content/song-units/MUS-SU-${n}.json`,
      sections: ['content_understanding', 'life_practice', 'transmission'],
      rule: '内容理解 / 生命实践 / 传唱的权威文本在单元记录（可追溯 derived_from）；本包不重复托管，防止两处不一致。不绑定周次 / 课程 / 讲章。',
      note: '单元记录中相应文本为 null 时，即如实为「尚未撰写」。',
    };
    if (!check && writeJSON(contentRel, content, true)) written.push(contentRel);

    /* --- rights --- */
    const rightsRel = `${base}/rights.json`;
    const rights = {
      package_version: VERSION, song_id: sid, slot: 'rights',
      legal: {
        copyright_status: legal,
        license: (song.copyright && song.copyright.license) || null,
        derived_from: `content/songs/${sid}.json#copyright.copyright_status`,
        note: legal === 'public_domain'
          ? '详情记录已判定 public_domain；英文公版原文可托管。'
          : (notes.rights_note || '详情记录为 unknown（未判定）；本仓不作推定，等待逐首认定或授权（ADR-0012 / ADR-0013）。'),
      },
      hosting: {
        lyrics_en: isPD
          ? { status: exists(lyricsRel) && lyricsStatus === 'PROVIDED' ? 'PROVIDED' : 'NOT_AVAILABLE', basis: '公版英文原文（已判定 public_domain）。' }
          : { status: 'NOT_AVAILABLE', reason: '法律状态未判定，不托管。' },
        lyrics_zh: { status: 'NOT_AVAILABLE', reason: '常见中文译本各有版权方，本仓不托管；等待 USER_PROVIDED 或授权（CI-0028）。' },
        score: { status: scoreStatus, reason: scoreStatus === 'NOT_AVAILABLE' ? (isPD ? '未转写。' : '权利未判定，不托管。') : null },
        audio_piano: { status: 'NOT_AVAILABLE', reason: '真人钢琴伴奏未录制。' },
        audio_demo_male: { status: 'NOT_AVAILABLE', reason: '真人男声示唱未录制；禁 AI 歌声冒充。' },
        audio_demo_female: { status: 'NOT_AVAILABLE', reason: '真人女声示唱未录制；禁 AI 歌声冒充。' },
        timeline: { status: 'NOT_AVAILABLE', reason: '无音频即无可靠时间标记。' },
      },
      ai_policy: { synthetic_vocals: 'FORBIDDEN', note: '禁止使用 AI 歌声冒充真人示唱（任务书 §七）。' },
      vocabulary_note: '登记 / 行动状态（SOURCE_REQUIRED 等）不得映射为法律状态（ADR-0012）。',
    };
    if (!check && writeJSON(rightsRel, rights, true)) written.push(rightsRel);

    /* --- worksheet（由 tools/song-worksheet.js 生成；此处只探状态） --- */
    const wsRel = `${base}/MOS-SU-${n}_WORKSHEET.md`;
    const wsStatus = exists(wsRel) ? 'PROVIDED' : 'NOT_AVAILABLE';

    /* --- manifest（总是刷新：由包内真实文件状态拼出） --- */
    const blocking = [];
    if (blockedInfo) blocking.push(blockedInfo.reason);
    else blocking.push(...COMMON_BLOCKING);
    if (notes.extra_blocking) blocking.push(...notes.extra_blocking);
    const manifest = {
      package_version: VERSION, song_id: sid, unit_id: `MUS-SU-${n}`,
      unit_ref: `content/song-units/MUS-SU-${n}.json`,
      task: 'SONG PRODUCTION PILOT 10',
      sample_role: sample ? sample.role : null,
      production_order: sample ? sample.order : null,
      blocked: Boolean(blockedInfo),
      blocking_reasons: blocking,
      slots: {
        metadata: { status: 'PROVIDED', file: 'metadata.json' },
        lyrics: { status: lyricsStatus, file: 'lyrics.json', proofread: 'PENDING' },
        score: { status: scoreStatus, file: 'score.json', transcription: scoreTrans },
        audio: { status: 'NOT_AVAILABLE', file: 'audio.json' },
        timeline: { status: 'NOT_AVAILABLE', file: 'timeline.json', sync_status: 'SYNC_NOT_READY' },
        teaching: { status: 'NOT_AVAILABLE', file: 'teaching.json' },
        content: { status: 'PROVIDED', file: 'content.json' },
        rights: { status: 'PROVIDED', file: 'rights.json' },
        worksheet: { status: wsStatus, file: `MOS-SU-${n}_WORKSHEET.md` },
      },
      level_note: '等级由 app/song-unit.js 从单元记录派生（DRAFT 简谱不计入）；不得在 manifest 里宣布等级。',
    };
    if (!check && writeJSON(`${base}/manifest.json`, manifest, true)) written.push(`${base}/manifest.json`);

    for (const s of ['metadata', 'lyrics', 'score', 'audio', 'timeline', 'teaching', 'content', 'rights', 'worksheet']) {
      if (!exists(`${base}/${manifest.slots[s].file}`)) missing.push(`${sid}/${s}`);
    }
  }

  if (check) {
    if (missing.length) { console.error(`FAIL 缺失槽位文件：\n  ${missing.join('\n  ')}`); process.exit(1); }
    console.log(`OK   生产工作包：${(songsIndex.songs || []).length} 首 × 9 槽位齐备`);
    process.exit(0);
  }
  console.log(`已生成 / 刷新生产工作包：新写 ${written.length} 个文件（存在的内容文件未被覆盖）`);
  for (const w of written.slice(0, 12)) console.log(`  + ${w}`);
  if (written.length > 12) console.log(`  … 共 ${written.length} 个`);
  process.exit(0);
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('生产工作包生成失败：', e && e.stack ? e.stack : e); process.exit(1); }
}
module.exports = { PKG_DIR };
