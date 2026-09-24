#!/usr/bin/env node
/* =========================================================
   MOS-MUSIC｜Song Unit Builder（单曲完整歌曲单元生成 / 等级派生 · V3.0）
   ---------------------------------------------------------
   标准：docs/standards/MOS-SONG-PRODUCTION-TEMPLATE-V1.0.md

   两件事：
     1) 为**已有歌曲详情记录**的歌建立 content/song-units/MUS-SU-NNNN.json 的 18 段结构。
        · 只从歌曲详情 / 登记层取**已有事实**，绝不虚构歌词、简谱、音频、教学内容；
        · 已有文件先读进来再合并：人工已经填过的值一律保留（工具只补结构，不改内容）。
     2) 派生 content/production/song-unit-levels.json：
        · 覆盖**全部已进曲库的歌**（详情层 + 登记层待升层）；
        · 等级 L1–L4 由 app/song-unit.js 从实际资源推导（CI-0014 案 a：派生视图不进基线）。

   用法：
     node tools/song-units.js           # 生成 / 刷新单元包与派生等级表
     node tools/song-units.js --check   # 只核对派生表与曲库是否一致（不写盘）
   ========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const writeJSON = (rel, obj) => fs.writeFileSync(path.join(ROOT, rel), JSON.stringify(obj, null, 2) + '\n');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const UNITS_INDEX = 'content/song-units/index.json';
const LEVELS_FILE = 'content/production/song-unit-levels.json';
const UNIT_DIR = 'content/song-units';
const PKG_DIR = 'content/production/packages';
const CONTENT_VERSION = 'MUS-V-1.1.0';
const TODAY = '2026-09-23';

/* ---------------------------------------------------------------- 生产工作包消费（PILOT 10） */

/**
 * 把生产工作包（content/production/packages/MUS-S-NNNN/）的真实载荷应用到单元记录。
 * 铁律（任务书 §一 / §十二）：
 *   · 工作包是歌词 / 简谱载荷的**权威源**：由工具整体刷新单元对应段（不做部分合并，防两处不一致）；
 *   · score.transcription=DRAFT（转写未听校）**不计入等级**：单元 score 保持 NOT_PROVIDED，
 *     只登记草稿位置；人工校对通过并置 VERIFIED 后才置 PROVIDED（等级随后自动派生）；
 *   · 有真实载荷进入生产 → 状态 INTAKE → VERIFYING（VERIFYING 无机械前置）；
 *     权利未判定的阻断歌（0006–0010）保持 INTAKE。
 */
function applyProductionPackage(unit, songId) {
  const manifestRel = `${PKG_DIR}/${songId}/manifest.json`;
  if (!exists(manifestRel)) return;
  const manifest = readJSON(manifestRel);

  const pkgLyricsRel = `${PKG_DIR}/${songId}/lyrics.json`;
  if (exists(pkgLyricsRel)) {
    const ly = readJSON(pkgLyricsRel);
    if (Array.isArray(ly.sections) && ly.sections.length) {
      unit.lyrics.status = 'PROVIDED';
      unit.lyrics.language = ly.language || null;
      unit.lyrics.version_note = ly.version_note || null;
      unit.lyrics.sections = ly.sections;
      unit.lyrics.note = `全文见 ${pkgLyricsRel}；人工校对：${(ly.proofread && ly.proofread.status) || 'PENDING'}。`
        + ' 中文译本尚未提供（常见译本各有版权方，本仓不托管）；需要中文时由人工提供已获授权文本（CI-0028）。';
    }
  }

  const pkgScoreRel = `${PKG_DIR}/${songId}/score.json`;
  if (exists(pkgScoreRel)) {
    const sc = readJSON(pkgScoreRel);
    const ts = (sc.transcription && sc.transcription.status) || 'NOT_STARTED';
    if (ts === 'DRAFT') {
      unit.score.note = `简谱草稿已转写待人工听校：${pkgScoreRel}（transcription.status=DRAFT）。`
        + ' 校对通过并置 VERIFIED 之前不计入等级派生，也不得声明 SCORE_READY。';
    } else if (ts === 'SOURCE_IMPORTED' && Array.isArray(sc.sections) && sc.sections.length) {
      /* V3.2 §五：原谱导入 = 真实可用的谱面载荷（机械转换忠实于原谱）。
         计入等级派生；「未人工听校」由 proofread=PENDING 与验收 B 组如实表达，
         听校通过前不得签核验收 score 组。 */
      unit.score.status = 'PROVIDED';
      unit.score.key = sc.key || null;
      unit.score.time_signature = sc.time_signature || null;
      unit.score.tempo_bpm = Number.isInteger(sc.tempo_bpm) ? sc.tempo_bpm : null;
      unit.score.pickup = Boolean(sc.pickup);
      unit.score.starting_note = sc.starting_note || null;
      unit.score.range = sc.range || { lowest: null, highest: null };
      unit.score.sections = sc.sections;
      unit.score.special_marks = Array.isArray(sc.special_marks) ? sc.special_marks : [];
      unit.score.note = `原谱导入简谱见 ${pkgScoreRel}（SOURCE_IMPORTED；transcription.status=${ts}）。`
        + ` 人工听校：${(sc.transcription.proofread && sc.transcription.proofread.status) || 'PENDING'} —— `
        + '听校通过前验收 score 组保持 PENDING，不得宣称「已校对」。';
    } else if (ts === 'VERIFIED' && Array.isArray(sc.sections) && sc.sections.length) {
      unit.score.status = 'PROVIDED';
      unit.score.key = sc.key || null;
      unit.score.time_signature = sc.time_signature || null;
      unit.score.tempo_bpm = Number.isInteger(sc.tempo_bpm) ? sc.tempo_bpm : null;
      unit.score.pickup = Boolean(sc.pickup);
      unit.score.starting_note = sc.starting_note || null;
      unit.score.range = sc.range || { lowest: null, highest: null };
      unit.score.sections = sc.sections;
      unit.score.special_marks = Array.isArray(sc.special_marks) ? sc.special_marks : [];
      unit.score.note = `定稿简谱见 ${pkgScoreRel}。`;
    }
  }

  /* ---- 资源层（content/song-resources/index.json）→ piano / demos 槽位（V3.2 §七/§九） ---- */
  const resRel = 'content/song-resources/index.json';
  if (exists(resRel)) {
    const resIndex = readJSON(resRel);
    const mine = (resIndex.resources || []).filter((r) => r.song_id === songId);
    /* 生成钢琴（hosted_authorized 的纯钢琴伴奏） */
    const genPiano = mine.find((r) => r.resource_type === 'ACCOMPANIMENT'
      && r.host_policy === 'hosted_authorized' && r.file_url);
    if (genPiano) {
      unit.piano.status = 'PROVIDED';
      unit.piano.has_intro = null;
      unit.piano.has_interlude = null;
      unit.piano.beats_stable = true;   /* 生成 MIDI 恒定速度，节拍稳定 */
      unit.piano.loopable = null;       /* 未实现循环播放，不声索 */
      unit.piano.key_matches = true;    /* 与简谱同源生成 */
      unit.piano.note = `按结构化简谱（原谱四声部）生成的标准钢琴陪唱：${genPiano.file_url}。`
        + ' 纯钢琴，不加乐队 / 鼓 / 吉他；与 timeline.json 同源（同一简谱 × 同一速度）。资源记录 ' + genPiano.resource_id + '。';
    }
    /* 外部真人示唱（Reuse First：原站播放 / 嵌入 / 时间段定位，不下载转存） */
    const trackFor = (st) => mine.filter((r) => r.resource_type === 'LEAD_VOCAL'
      && r.source_type === st && r.verification_status === 'source_verified');
    const applyTrack = (slot, st, label) => {
      const list = trackFor(st);
      if (!list.length) return;
      const slots = [];
      for (const r of list) {
        if (Array.isArray(r.segment) && r.segment.length) {
          for (const sg of r.segment) {
            slots.push({
              phrase_id: sg.phrase_id || null, start: sg.start != null ? sg.start : null,
              end: sg.end != null ? sg.end : null, resource_id: r.resource_id,
              source_url: r.source_url || null, segment_of: sg.segment_of || null,
              note: sg.note || null,
            });
          }
        } else {
          slots.push({
            phrase_id: null, start: null, end: null, resource_id: r.resource_id,
            source_url: r.source_url || null, segment_of: 'full',
            note: '完整外部真人版本（原站播放）；分段时间点待人工看片回填。',
          });
        }
      }
      slot.status = 'PROVIDED';
      slot.singer = null;   /* singer 词表只允许 null；表演者信息在资源记录里 */
      slot.source_type = st;
      slot.source_url = list[0].source_url || null;
      slot.host_policy = 'original_site';
      slot.slots = slots;
      slot.note = `外部真人${label}（Reuse First）：${list.map((r) => (r.source || '')).filter(Boolean).join('；')}。`
        + ' 原站播放 / 嵌入 / 时间段定位，不下载转存；教学适用性验收（demo 组）保持 PENDING，待人工看片确认。';
    };
    applyTrack(unit.demos.male, 'EXTERNAL_HUMAN_MALE', '男声');
    applyTrack(unit.demos.female, 'EXTERNAL_HUMAN_FEMALE', '女声');
  }

  /* ---- 时间轴（生产工作包 timeline.json）→ timeline 槽位 ---- */
  const pkgTlRel = `${PKG_DIR}/${songId}/timeline.json`;
  let tlApplied = false;
  if (exists(pkgTlRel)) {
    const tl = readJSON(pkgTlRel);
    if (tl.status === 'SYNC_READY' && Array.isArray(tl.phrases) && tl.phrases.length) {
      unit.timeline.status = 'PROVIDED';
      unit.timeline.phrases = tl.phrases.map((p) => ({
        phrase_id: p.phrase_id,
        section_id: p.section_id || null,
        line_id: Array.isArray(p.line_ids) && p.line_ids.length ? p.line_ids[0] : null,
        start: p.start, end: p.end,
        measure_start: p.measure_start, measure_end: p.measure_end,
        marks: Array.isArray(p.marks) ? p.marks : [],
      }));
      unit.timeline.note = `由简谱节奏 × 速度精确计算（非插值）：${pkgTlRel}。`
        + ' 对「生成的钢琴陪唱」精确；对外部真人录音不适用（真人分段由人工回填）。'
        + ' 一句可跨多个歌词行（line_id 取行首词所在行，完整映射见工作包）。';
      tlApplied = true;
    }
  }

  /* ---- cursor / teaching（V3.2 §十一–§十三）：只从已就绪的谱面与时间轴**机械派生**，人工项留空 ---- */
  if (tlApplied && unit.score.status === 'PROVIDED') {
    const sc = readJSON(`${PKG_DIR}/${songId}/score.json`);
    const noteMarks = unit.timeline.phrases.flatMap((p) => p.marks).filter((m) => m.kind === 'note');
    /* cursor：只登记真实存在的跟随层级（phrase / measure / note / lyric；beat 未独立产出，不声索） */
    unit.cursor.status = 'PROVIDED';
    unit.cursor.levels = ['phrase', 'measure', 'note', 'lyric'];
    unit.cursor.auto_scroll = false;   /* 前端自动滚动未实现，不声索 */
    unit.cursor.click_seek = false;    /* 点击重唱未实现，不声索 */
    unit.cursor.note = `层级依据：phrase（${unit.timeline.phrases.length} 句 start/end）、`
      + `measure（句内小节范围）、note（${noteMarks.length} 个音符级时间标记）、`
      + 'lyric（每个音符带 lyric_line_id / 音节）。beat 层未独立产出，不列入。'
      + ' auto_scroll / click_seek 均为前端待实现项，如实 false。';
    /* score_class：全部为谱面客观事实 */
    const rhythmCount = {};
    for (const sec of sc.sections) for (const m of sec.measures) for (const b of m.beats) {
      const k = `${b.duration}${b.dot ? '.' : ''}`;
      rhythmCount[k] = (rhythmCount[k] || 0) + 1;
    }
    const mainRhythm = Object.entries(rhythmCount).sort((a, b) => b[1] - a[1])
      .slice(0, 3).map(([k, v]) => `${k}×${v}`).join('、');
    const ties = [];
    const melismas = [];
    for (const sec of sc.sections) for (const m of sec.measures) for (const b of m.beats) {
      if (b.tie) ties.push(`第${m.measure_no}小节 ${b.note} 音延音跨线`);
      if (b.melisma) melismas.push(`第${m.measure_no}小节 ${b.syllable || ''} 一字多音`);
    }
    unit.teaching.score_class.items = [
      { key: 'key_signature', value: sc.key, note: '可按会众音域整体移调；以简谱首调唱名教学。' },
      { key: 'time_signature', value: sc.time_signature, note: `速度 ♩=${sc.tempo_bpm || '?'}（原谱 Q: 标记）。` },
      { key: 'starting_note', value: sc.starting_note, note: sc.pickup ? '弱起小节起唱，第一音在拍前，注意不抢拍。' : null },
      { key: 'range', value: `${sc.range.lowest} – ${sc.range.highest}`, note: '全曲音域（按原谱写法）；超出会众能力时整体移调，不改相对音程。' },
      { key: 'main_rhythm', value: mainRhythm || null, note: '按音符时值出现次数统计（原谱事实，非教学判断）。' },
      { key: 'structure', value: `全曲 ${sc.sections[0].measures.length} 小节${sc.pickup ? ' + 弱起' : ''}；乐句 = 原谱音乐行（见 timeline.json phrases）`, note: '各节共用同一曲调；学会第一节即学会全曲旋律。' },
      { key: 'error_prone', value: [...ties.slice(0, 3), ...melismas.slice(0, 3)].join('；') || null, note: '仅列出谱面客观存在的延音线与一字多音位置；完整清单见 score.json 各音符 lyric_status/melisma/tie 标记。' },
    ];
    unit.teaching.score_class.note = '本组全部条目由 tools/song-units.js 从原谱导入简谱机械派生（谱面客观事实）；'
      + '教学重点判断由教者补充，不由工具代写。';
    /* lyrics_class：只写换气与长音这两类谱面可客观定位的项；易读错/词义/重音需人工，留空 */
    const lItems = [];
    for (const p of unit.timeline.phrases) {
      const lineIds = Array.isArray(p.line_ids) ? p.line_ids : [];
      lItems.push({
        key: 'breath_point',
        text: lineIds.length ? `句末（覆盖歌词行 ${lineIds.join(' / ')}）` : `句末 ${p.phrase_id}`,
        note: `原谱乐句边界即换气点：${p.start.toFixed(1)}–${p.end.toFixed(1)}s。`,
      });
    }
    const durs = {};
    for (const sec of sc.sections) for (const m of sec.measures) for (const b of m.beats) {
      const k = `${b.duration}${b.dot ? '.' : ''}`;
      (durs[k] = durs[k] || []).push(`第${m.measure_no}小节${b.syllable ? '「' + b.syllable + '」' : ''}`);
    }
    const longest = Object.entries(durs).sort((a, b) => b[1].length - a[1].length)[0];
    if (longest) lItems.push({ key: 'long_note', text: `${longest[0]}（${longest[1].length} 处，例：${longest[1].slice(0, 3).join('、')}）`, note: '全曲最长时值音符位置（保持时值唱满，不提前收）。' });
    unit.teaching.lyrics_class.items = lItems;
    unit.teaching.lyrics_class.note = '换气点与长音由谱面/时间轴机械派生；'
      + '易读错 / 易唱错 / 词义 / 重音需人工与真人表达参考（V3.2 §十三），本轮留空不虚构。';
    /* learn：五步的前置（词/谱/钢琴/示唱/时间轴）在本曲已齐备 */
    if (unit.piano.status === 'PROVIDED' && (unit.demos.male.status === 'PROVIDED' || unit.demos.female.status === 'PROVIDED')) {
      unit.teaching.learn.status = 'PROVIDED';
      unit.teaching.learn.note = '五步（听 → 跟 → 一起唱 → 自己唱 → 再唱一次）的机械前置已齐备：'
        + '词（公版原文）+ 谱（原谱导入）+ 钢琴（生成陪唱）+ 示唱（外部真人，原站播放）+ 时间轴（精确计算）。'
        + '示唱分段时间点与教学适用性需人工确认后使用。';
    }
  }

  const hasRealPayload = unit.lyrics.status === 'PROVIDED' || unit.score.status === 'PROVIDED'
    || ((manifest.slots && manifest.slots.score && manifest.slots.score.status) === 'DRAFT');
  if (unit.status === 'INTAKE' && hasRealPayload) {
    unit.status = 'VERIFYING';
    unit.status_note = 'PILOT 10：生产工作包已建立，公版英文歌词已结构化入包；简谱草稿待人工听校；'
      + '中文译本与音频资源待人工提供（缺什么就写什么，不虚构）。';
  }
}

/* ---------------------------------------------------------------- 合并语义 */

/** 保留人工已填值：对象递归合并，数组/标量以「已有非空」为准。 */
function mergeKeep(existing, fresh) {
  if (existing === undefined || existing === null) return fresh;
  if (Array.isArray(existing)) return existing.length ? existing : fresh;
  if (typeof existing === 'object') {
    const out = {};
    for (const key of new Set([...Object.keys(fresh || {}), ...Object.keys(existing)])) {
      out[key] = mergeKeep(existing[key], (fresh || {})[key]);
    }
    return out;
  }
  return existing; /* 标量：人工填过就保留 */
}

/* ---------------------------------------------------------------- 单曲构建 */

function splitTitle(title) {
  const raw = String(title || '');
  const m = raw.match(/^(.*?)（(.+?)）\s*$/);
  if (m) return { zh: m[1].trim(), en: m[2].trim(), parsed: true };
  return { zh: raw.trim() || null, en: null, parsed: false };
}

function emptyAcceptance() {
  const row = () => ({ result: 'PENDING', reviewer: null, date: null, note: null });
  return {
    data: row(), lyrics: row(), score: row(), demo: row(), piano: row(),
    teaching: row(), sync: row(), live_teaching: row(), content: row(), rights: row(),
  };
}

/**
 * 由歌曲详情记录 + 登记记录构建单元结构（只用已有事实）。
 * @param {object} song 歌曲详情记录（content/songs/MUS-S-NNNN.json）
 * @param {object|null} reg 登记层记录（可能不存在）
 * @param {string[]} liveModules 真人教唱模块键（来自内容层词表）
 * @param {string[]} vocalKeys 声乐提示键（来自内容层词表）
 */
function buildUnit(song, reg, liveModules, vocalKeys) {
  const sid = song.song_id;
  const n = String(sid).slice(-4);
  const t = splitTitle(song.title);
  const cw = song.copyright || {};
  const bible = song.bible || {};
  const formation = song.formation || {};
  const unresolved = [];
  if (t.parsed) unresolved.push('英文标题取自歌曲标题括号内容，未独立核验');
  if (!reg || !reg.translator) unresolved.push('中文译词版本与译者未核验');
  unresolved.push('当前采用的简谱版本未确定');
  unresolved.push('调 / 拍号 / 速度 / 时长 / 段落结构未核验');
  if (cw.copyright_status === 'unknown') unresolved.push('作品级法律状态未判定（不得据清单推定）');

  const practiceItems = [];
  for (const p of formation.practice || []) {
    practiceItems.push({ key: 'action', text: p, derived_from: `content/songs/${sid}.json#formation.practice` });
  }
  for (const p of formation.prayer || []) {
    practiceItems.push({ key: 'prayer', text: p, derived_from: `content/songs/${sid}.json#formation.prayer` });
  }
  const liveModulesRows = liveModules.map((k) => ({ key: k, label: null, status: 'NOT_PROVIDED', resource_id: null }));

  return {
    unit_id: `MUS-SU-${n}`,
    song_id: sid,
    unit_version: CONTENT_VERSION,
    standard: 'song-production-template-1.0',
    status: 'INTAKE',
    status_note: '已进入待制作库：身份与来源就绪，歌词 / 简谱 / 音频 / 教学内容均尚未制作。',
    song_meta: {
      title_zh: t.zh,
      title_en: t.en,
      lyricist: song.author || null,
      composer: song.composer || null,
      translator: (reg && reg.translator) || null,
      language: song.language || null,
      key: null,
      time_signature: null,
      tempo_bpm: null,
      duration_seconds: null,
      structure: null,
      current_version: null,
      source: song.source || (reg && reg.source) || null,
      unresolved,
    },
    lyrics: {
      status: 'NOT_PROVIDED',
      language: null,
      version_note: null,
      sections: [],
      note: '歌词必须结构化（分节 / 分句 / lyric_id）后才可进入教学；本记录不托管未经授权的译本全文。',
    },
    score: {
      status: 'NOT_PROVIDED',
      key: null,
      time_signature: null,
      tempo_bpm: null,
      pickup: false,
      starting_note: null,
      range: { lowest: null, highest: null },
      sections: [],
      special_marks: [],
      note: '简谱是主界面，不是附属 PDF；统一记谱完成后此处承载小节 / 时值 / 高低音点 / 歌词对齐数据。',
    },
    demos: {
      male: { status: 'NOT_PROVIDED', slots: [], singer: null, note: '真人示唱尚未录制；不得用合成声音冒充真人示唱。' },
      female: { status: 'NOT_PROVIDED', slots: [], singer: null, note: '真人示唱尚未录制；不得用合成声音冒充真人示唱。' },
    },
    piano: {
      status: 'NOT_PROVIDED',
      has_intro: null,
      has_interlude: null,
      beats_stable: null,
      loopable: null,
      key_matches: null,
      note: '第一阶段统一只做钢琴伴奏，作为自主歌唱的主要支持轨。',
    },
    timeline: { status: 'NOT_PROVIDED', phrases: [], note: '分句时间轴是单句循环 / 当前句高亮 / 点击重唱的地基，需与示唱或钢琴同步产生。' },
    cursor: {
      status: 'NOT_PROVIDED',
      levels: [],
      auto_scroll: false,
      click_seek: false,
      note: '光标层级只登记**真实可用**的层级（句 / 小节 / 拍 / 音符 / 歌词），不得声索尚未实现的跟随精度。',
    },
    teaching: {
      learn: { status: 'NOT_PROVIDED', note: '学唱五步（听 → 跟 → 伴 → 自己唱 → 再唱一次）需要词、谱、钢琴、至少一个示唱与时间轴齐备后才能真正可用。' },
      score_class: { items: [], note: '教谱说明随简谱制作产生，不得脱离乐谱先写结论。' },
      lyrics_class: { items: [], note: '教词说明随歌词整理产生（易读错 / 易唱错 / 换气 / 长音 / 重音）。' },
      vocal: [],
      live_teaching: {
        modules: liveModulesRows,
        note: `真人教唱采用模块化短片（${liveModules.join(' / ')}），不要求每首歌拍长视频；未录制一律 NOT_PROVIDED。`,
      },
    },
    content_understanding: {
      what_it_sings: { text: null, derived_from: null },
      core_truth: { text: null, derived_from: null },
      bible_basis: (bible.core_passage
        ? [{ reference: bible.core_passage, derived_from: `content/songs/${sid}.json#bible.core_passage` }]
        : []),
      background: { text: null, derived_from: null },
      why_church_sings: { text: null, derived_from: null },
      note: '歌曲自身的内容层：不绑定某一周 / 某一课；凡写入文本必须可追溯到内容层字段（derived_from），不得凭空生成神学内容。',
    },
    life_practice: {
      status: practiceItems.length ? 'PROVIDED' : 'NOT_PROVIDED',
      items: practiceItems,
      note: practiceItems.length
        ? '取自歌曲记录已有的形成层字段（逐项标注来源）。'
        : '尚无可落地的生命回应文本；不得把课程作业式要求写成生命实践。',
    },
    transmission: {
      status: (formation.transmission || []).length ? 'PROVIDED' : 'NOT_PROVIDED',
      front_actions: ['sing_along', 'teach_one', 'share'],
      text: (formation.transmission || []).length ? formation.transmission.join('；') : null,
      derived_from: (formation.transmission || []).length ? `content/songs/${sid}.json#formation.transmission` : null,
      note: '歌曲页固定提供三个传唱动作（自己唱 / 教一个人 / 分享）；此处只补歌曲自身的传唱说明。',
    },
    rights: {
      status: 'NOT_PROVIDED',
      source: cw.source || song.source || null,
      copyright_status: cw.copyright_status || 'unknown',
      license: cw.license || null,
      lyrics_source: null,
      score_source: null,
      audio_source: null,
      permission: cw.permission_evidence || null,
      internal_use: 'unknown',
      public_use: 'unknown',
      download_use: 'unknown',
      derived_from: `content/songs/${sid}.json#copyright.copyright_status`,
      notes: '法律状态沿用详情层词表（ADR-0012）；「歌曲存在」不等于「平台有权使用该资源」，可播放不等于可下载。',
    },
    acceptance: emptyAcceptance(),
    created_at: `${TODAY}T00:00:00+08:00`,
    updated_at: `${TODAY}T00:00:00+08:00`,
    updated_by: 'song-unit-builder',
  };
}

/* ---------------------------------------------------------------- 主流程 */

async function main() {
  const U = await import(pathToFileURL(path.join(ROOT, 'app/song-unit.js')).href);
  const check = process.argv.includes('--check');

  const unitsIndex = readJSON(UNITS_INDEX);
  const songsIndex = readJSON('content/songs/index.json');
  const registry = readJSON('content/library/registry.json');
  const promotions = readJSON('content/production/library-promotions.json');
  const promotedIds = new Set((promotions.promotions || []).map((p) => p.song_id));

  const liveModules = (unitsIndex.live_teaching_modules || []).map((m) => m.key);
  const vocalKeys = Object.keys(unitsIndex.vocal_keys || {});
  if (!liveModules.length || !vocalKeys.length) {
    console.error('ERROR 内容层词表缺失（live_teaching_modules / vocal_keys）—— 结构词表必须在内容层。');
    process.exit(1);
  }

  /* --- 1. 详情层 → 单元包 --- */
  const detailRows = songsIndex.songs || [];
  const unitRows = [];
  const created = [];
  for (const row of detailRows) {
    const song = readJSON(row.file);
    const reg = (registry.records || []).find((r) => r.song_id === song.song_id) || null;
    const fresh = buildUnit(song, reg, liveModules, vocalKeys);
    const rel = `${UNIT_DIR}/${fresh.unit_id}.json`;
    const prev = exists(rel) ? readJSON(rel) : null;
    const merged = prev ? mergeKeep(prev, fresh) : fresh;
    /* 生产工作包载荷（PILOT 10）：在合并之后整体应用（包是权威源，见函数说明） */
    applyProductionPackage(merged, song.song_id);
    /* 工具字段始终由工具维护 */
    merged.unit_version = CONTENT_VERSION;
    merged.standard = 'song-production-template-1.0';
    merged.updated_at = `${TODAY}T00:00:00+08:00`;
    if (!prev) merged.updated_by = 'song-unit-builder';
    if (!check) writeJSON(rel, merged);
    if (!prev) created.push(rel);
    unitRows.push({ song_id: merged.song_id, unit_id: merged.unit_id, status: merged.status, file: rel });
  }

  /* --- 2. 合并曲库全量 → 派生等级表 --- */
  const detailIds = new Set(detailRows.map((r) => r.song_id));
  const intakeRows = (registry.records || []).filter((r) => !detailIds.has(r.song_id));
  const unitBySong = new Map();
  for (const row of unitRows) unitBySong.set(row.song_id, readJSON(row.file));

  const allIds = [...unitRows.map((r) => r.song_id), ...intakeRows.map((r) => r.song_id)].sort();
  const levelRows = allIds.map((sid) => {
    const unit = unitBySong.get(sid) || null;
    if (!unit) {
      return {
        song_id: sid,
        unit_id: null,
        unit_file: null,
        layer: 'intake',
        status: 'INTAKE',
        level: 'NONE',
        next_level: 'L1',
        missing_next: U.LEVEL_REQUIREMENTS.L1.slice(),
        missing_all: U.REQUIREMENT_KEYS.slice(),
        next_action: { key: 'lyrics', target_status: 'LYRICS_READY' },
        note: '尚无单曲单元文件（第一批只对已有歌曲详情记录的歌建立结构）；等级为 NONE 是如实状态。',
      };
    }
    const s = U.unitSummary(unit);
    return {
      song_id: sid,
      unit_id: s.unit_id,
      unit_file: `${UNIT_DIR}/${s.unit_id}.json`,
      layer: 'detail',
      promoted: promotedIds.has(sid),
      status: s.status,
      level: s.level,
      next_level: s.next_level,
      missing_next: s.missing_next,
      missing_all: s.missing_all,
      next_action: s.next_action,
      acceptance: s.acceptance,
      note: null,
    };
  });

  const gapCounts = {};
  for (const key of U.REQUIREMENT_KEYS) gapCounts[key] = 0;
  for (const r of levelRows) for (const key of r.missing_all) gapCounts[key] += 1;

  const byLevel = {};
  for (const lvl of U.LEVELS) byLevel[lvl] = levelRows.filter((r) => r.level === lvl).length;
  const byStatus = {};
  for (const st of U.UNIT_STATUS) {
    const n = levelRows.filter((r) => r.status === st).length;
    if (n) byStatus[st] = n;
  }

  const levelsDoc = {
    levels_version: CONTENT_VERSION,
    generated_at: `${TODAY}T00:00:00+08:00`,
    generated_by: 'tools/song-units.js',
    derived: true,
    basis: '由 content/song-units/** 的实际资源推导（app/song-unit.js deriveLevel）；等级不写在单元记录里。',
    levels_vocabulary: (unitsIndex.completion_levels || []).map((l) => l.key),
    counts: {
      library_total: levelRows.length,
      with_unit_file: unitRows.length,
      intake_without_unit: intakeRows.length,
      by_level: byLevel,
      by_status: byStatus,
      gaps: gapCounts,
    },
    units: levelRows,
    note: '本文件是派生视图，不是权威源：权威源是 content/song-units/** 与曲库本身。'
      + 'CI-0014 案 a：随生产推进而变化的内容不进不可变基线，因此等级表可以随制作进度正常变化。',
  };

  if (check) {
    let bad = 0;
    if (!exists(LEVELS_FILE)) { console.error(`FAIL 缺失派生等级表：${LEVELS_FILE}`); bad += 1; }
    else {
      const onDisk = readJSON(LEVELS_FILE);
      if (onDisk.derived !== true) { console.error(`FAIL ${LEVELS_FILE} 未声明 derived=true`); bad += 1; }
      const strip = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.generated_at; return JSON.stringify(c); };
      if (strip(onDisk) !== strip(levelsDoc)) {
        console.error(`FAIL ${LEVELS_FILE} 与单元包 / 曲库不一致（需重新运行 tools/song-units.js）`);
        bad += 1;
      }
    }
    /* 单元索引自身一致性 */
    const ids = new Set(unitRows.map((r) => r.unit_id));
    for (const row of unitsIndex.units || []) {
      if (!ids.has(row.unit_id)) { console.error(`FAIL ${UNITS_INDEX} 列出的单元 ${row.unit_id} 没有对应文件或已不属于详情层`); bad += 1; }
    }
    if (bad) process.exit(1);
    console.log(`OK   ${LEVELS_FILE}`);
    console.log(`单曲等级：曲库 ${levelRows.length} 首 ｜ 已有单元文件 ${unitRows.length} ｜ 等级 NONE ${byLevel.NONE || 0} ｜ 缺口最多的项：`
      + Object.entries(gapCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}×${v}`).join('、'));
    process.exit(0);
  }

  /* --- 3. 写回单元索引（词表保持不变，只更新清单与计数） --- */
  const nextIndex = {
    ...unitsIndex,
    units_version: CONTENT_VERSION,
    generated_at: TODAY,
    counts: {
      total: unitRows.length,
      by_status: byStatus,
      by_level: byLevel,
      library_total: levelRows.length,
      intake_without_unit: intakeRows.length,
      not_in_library: Math.max(0, 100 - levelRows.length),
    },
    units: unitRows,
  };
  writeJSON(UNITS_INDEX, nextIndex);
  writeJSON(LEVELS_FILE, levelsDoc);

  /* 生产索引的平台计数同步（V3.2）：单元状态 / 等级分布 */
  const prodIdxPath = 'content/production/index.json';
  if (exists(prodIdxPath)) {
    const prod = readJSON(prodIdxPath);
    prod.counts = prod.counts || {};
    prod.counts.song_units_total = unitRows.length;
    prod.counts.song_units_with_file = unitRows.length;
    prod.counts.song_units_status_verifying = byStatus.VERIFYING || 0;
    prod.counts.song_units_status_intake = byStatus.INTAKE || 0;
    prod.counts.song_units_level_none = byLevel.NONE || 0;
    prod.counts.song_units_level_l3 = byLevel.L3 || 0;
    prod.counts.song_units_level_l4 = byLevel.L4 || 0;
    writeJSON(prodIdxPath, prod);
  }

  console.log(`已写出 ${UNIT_DIR}/：新建 ${created.length} 个单元包，共 ${unitRows.length} 个（其余 ${registry.records.length - 0} 条登记记录中的 ${intakeRows.length} 首尚无单元文件）`);
  for (const c of created) console.log(`  + ${c}`);
  console.log(`已写出 ${LEVELS_FILE}：曲库 ${levelRows.length} 首 ｜ 等级分布 ${JSON.stringify(byLevel)}`);
  console.log(` 缺口（各资源还缺多少首）：${JSON.stringify(gapCounts)}`);
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => { console.error('单曲单元构建失败：', e && e.stack ? e.stack : e); process.exit(1); });
}

module.exports = { buildUnit, mergeKeep, splitTitle, UNITS_INDEX, LEVELS_FILE };
