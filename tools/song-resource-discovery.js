/* =========================================================
   MOS-MUSIC｜100 首歌曲资源普查（Song Resource Discovery · V3.x §十五–§十七）
   ---------------------------------------------------------
   目的：先知道「100 首里有多少是现成的」，再决定自己要做多少。
   它**不是**生产工具：本轮不制作任何实际资源。

   铁律（反虚构）：
     1) 本工具只写**本仓可证的事实**（仓内已有的歌词 / 草稿谱 / 权利状态）；
     2) 外部检索（网络）本轮**未执行** ⇒ 一切外部资源字段一律 UNSURVEYED，
        **不得**填写任何 source_url / source_name —— 宁可空着，不许猜；
     3) 状态词表固定：FOUND / NOT_FOUND / VERIFY / REUSE / CREATE / UNSURVEYED；
     4) V3.2 口径修正：法律状态未判定 = RIGHTS_UNRESOLVED（如实事实），
        **不得**推断为「权利阻断」——真人 / 钢琴 / 教学资源是否可得须实际检索后才知（NOT_SURVEYED）；
     5) 生产优先级固定：找现成 → 核版本 → 能用就用 → 缺什么补什么 → 最后自己制作。

   用法：
     node tools/song-resource-discovery.js            生成 / 刷新普查表
     node tools/song-resource-discovery.js --check     只校验
     node tools/song-resource-discovery.js --report    打印汇总（写报告用）
========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_REL = 'content/production/resource-discovery.json';
const CAND_REL = 'content/candidates/index.json';
const SONGS_IDX_REL = 'content/songs/index.json';
const PKG_REL = 'content/production/packages';
const SCORE_IMPORT_REL = 'content/production/tune-matching.json';

const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const STATES = ['FOUND', 'NOT_FOUND', 'VERIFY', 'REUSE', 'CREATE', 'UNSURVEYED'];
const FIELDS = ['score', 'lyrics', 'human_male', 'human_female', 'piano', 'teaching'];

/** 空结果：外部检索未执行 —— 不填任何来源。 */
function unsurveyed(note) {
  return { status: 'UNSURVEYED', source_name: null, source_url: null, source_type: null, evidence: null, note };
}

/** score-import 转写表（100 首 ↔ Open Hymnal 实际匹配结果）→ song_id 映射（仅 matched=true）。 */
let importMatchesCache = null;
function buildImportMatches() {
  if (importMatchesCache) return importMatchesCache;
  const map = {};
  if (exists(SCORE_IMPORT_REL)) {
    const doc = readJSON(SCORE_IMPORT_REL);
    (doc.rows || []).forEach((r) => { if (r.matched && r.tune_x) map[r.song_id] = r; });
  }
  importMatchesCache = map;
  return map;
}

function notFound(note) {
  return { status: 'NOT_FOUND', source_name: null, source_url: null, source_type: null, evidence: null, note };
}

function build({ write = true } = {}) {
  const cand = readJSON(CAND_REL);
  const songsIdx = readJSON(SONGS_IDX_REL);
  const detailRows = (songsIdx.songs || []).filter((s) => s.file);

  const rows = [];
  for (const c of cand.candidates || []) {
    const sid = c.song_id;
    const detailRow = detailRows.find((s) => s.song_id === sid) || null;
    const song = detailRow ? readJSON(detailRow.file) : null;
    const legal = (song && song.copyright && song.copyright.copyright_status) || null;
    const pkgDir = `${PKG_REL}/${sid}`;
    const manifest = exists(`${pkgDir}/manifest.json`) ? readJSON(`${pkgDir}/manifest.json`) : null;

    /* ---- 仓内可证事实 ---- */
    const lyricsSlot = manifest && manifest.slots && manifest.slots.lyrics;
    const scoreSlot = manifest && manifest.slots && manifest.slots.score;
    const lyricsProvided = Boolean(lyricsSlot && lyricsSlot.status === 'PROVIDED');
    const importMatches = buildImportMatches();
    const scorePkg = exists(`${pkgDir}/score.json`) ? readJSON(`${pkgDir}/score.json`) : null;
    const tsPkg = (scorePkg && scorePkg.transcription && scorePkg.transcription.status) || null;
    const scoreImported = tsPkg === 'SOURCE_IMPORTED'
      || Boolean(scoreSlot && scoreSlot.transcription === 'SOURCE_IMPORTED');
    const scorePending = Boolean(scorePkg && scorePkg.score_verify_required === true);
    const scoreDraft = Boolean(scoreSlot && scoreSlot.status === 'DRAFT') && !scoreImported;

    const lyrics = lyricsProvided
      ? {
        status: 'FOUND',
        source_name: '本仓生产工作包（公版英文歌词）',
        source_url: null,
        source_type: 'MOS_PUBLIC_DOMAIN_TEXT',
        evidence: `${pkgDir}/lyrics.json（manifest 槽位 PROVIDED）`,
        note: legal === 'public_domain' ? '公版原文，可托管；中文译本未托管。' : '法律状态未判定，不得托管。',
      }
      : unsurveyed('外部/中文歌词来源尚未检索；本仓无该歌歌词。');

    const score = scoreImported
      ? {
        status: 'VERIFY',
        source_name: '本仓原谱导入简谱（SOURCE_IMPORTED，Open Hymnal 公版原谱机械转换）',
        source_url: (scorePkg.transcription.source && scorePkg.transcription.source.url) || null,
        source_type: 'MOS_SOURCE_IMPORTED_SCORE',
        evidence: `${pkgDir}/score.json（transcription.status=SOURCE_IMPORTED，proofread=PENDING）`,
        note: '原谱导入 ≠ 已人工听校：VERIFY = 需要人工对照原谱听校后才能作为 FOUND 使用。',
      }
      : (scorePending
        ? {
          status: 'VERIFY',
          source_name: null,
          source_url: null,
          source_type: null,
          evidence: `${pkgDir}/score.json（score_verify_required=true，曲调版本未定）`,
          note: '曲调版本无法确认 → SCORE_VERIFY_REQUIRED；等待人工选定曲调版本后逐音转写。',
        }
        : (scoreDraft
          ? {
            status: 'VERIFY',
            source_name: '本仓简谱草稿（待人工听校）',
            source_url: null,
            source_type: 'MOS_DRAFT_TRANSCRIPTION',
            evidence: `${pkgDir}/score.json（transcription.status=DRAFT，verified_measures=[]）`,
            note: '未听校前不计入等级；VERIFY = 需要人工核对后才能作为 FOUND 使用。',
          }
          : (importMatches[sid]
          ? {
            status: 'FOUND',
            source_name: 'Open Hymnal Project 2014.06（ABC 原谱，公有领域）',
            source_url: 'http://www.openhymnal.org/',
            source_type: 'EXTERNAL_PUBLIC_DOMAIN_SCORE',
            evidence: `sources/openhymnal/OpenHymnal2014.06.abc X:${importMatches[sid].tune_x}`
              + `（match_method=${importMatches[sid].match_method}；转写表 content/production/tune-matching.json）`,
            note: '与 Open Hymnal 曲目名完全一致 → 谱面来源已找到；逐音转写与人工听校另行完成（见工作包）。',
          }
          : {
            status: 'UNSURVEYED',
            source_name: null, source_url: null, source_type: null, evidence: null,
            note: 'Open Hymnal 2014.06 已检索：无完全一致的曲调名匹配；其余来源尚未检索'
              + '（优先复用现成版本，找不到再自己做）。— NOT_SURVEYED ≠ 不存在。',
          })));

    const row = {
      song_id: sid,
      title_zh: (song && song.title) || c.title_zh || null,
      title_en: c.title_en || null,
      layer: detailRow ? 'detail' : 'candidate',
      rights: {
        copyright_status: legal || null,
        intake_action: c.copyright_status || null,
        rights_state: (legal && ['public_domain', 'licensed', 'permission_granted'].includes(legal))
          ? 'RESOLVED' : 'RIGHTS_UNRESOLVED',
        note: legal
          ? '法律状态取自详情层（ADR-0012 词表）。'
          : '该歌尚未升详情层：登记层状态为「需要落实来源授权」（SOURCE_REQUIRED），'
            + '**不构成任何法律结论**（V3.2 口径：RIGHTS_UNRESOLVED ≠ 权利阻断；制作前须先落实来源与授权）。',
      },
      found: {
        score,
        lyrics,
        human_male: unsurveyed('外部真人版本尚未检索；本仓无录音。'),
        human_female: unsurveyed('外部真人版本尚未检索；本仓无录音。'),
        ai_male: notFound('AI 示唱类型已定义，但本轮不接入任何引擎（vendor=null），因此不存在成品。'),
        ai_female: notFound('同上：类型就位、成品不存在。'),
        piano: unsurveyed('钢琴伴奏来源尚未检索；本仓无录音。'),
        teaching: unsurveyed('外部教学内容尚未检索；本仓无真人教唱素材。'),
      },
      source_summary: {
        source_name: lyricsProvided ? '本仓公版英文歌词' : (scoreDraft ? '本仓简谱草稿' : null),
        source_url: null,
        source_type: lyricsProvided ? 'MOS_PUBLIC_DOMAIN_TEXT' : (scoreDraft ? 'MOS_DRAFT_TRANSCRIPTION' : null),
      },
    };

    /* ---- next_action：按固定优先级（找现成 → 核版本 → 能用就用 → 缺什么补什么 → 最后自己做） ---- */
    if (row.rights.rights_state === 'RIGHTS_UNRESOLVED') {
      row.next_action = '先落实来源与授权（RIGHTS_UNRESOLVED：制作前必须先解决，并非「权利已阻断」的结论）';
    } else if (lyricsProvided && scoreDraft) {
      row.next_action = '人工听校简谱 → 定稿（VERIFY → FOUND）';
    } else if (lyricsProvided) {
      row.next_action = '核版本 + 检索现成简谱（REUSE 优先，找不到再自己做）';
    } else {
      row.next_action = '外部资源普查（本轮未执行；先找现成歌词 / 简谱 / 真人版本）';
    }
    rows.push(row);
  }

  const countBy = (fn) => rows.filter(fn).length;
  const fieldStatus = (k) => FIELDS.concat(['ai_male', 'ai_female']).reduce((acc, f) => {
    acc[f] = STATES.reduce((a, s) => { a[s] = countBy((r) => r.found[f].status === s); return a; }, {});
    return acc;
  }, {});

  const out = {
    discovery_version: 'MUS-V-1.0.0',
    generated_at: new Date().toISOString().slice(0, 10),
    generated_by: 'tools/song-resource-discovery.js',
    model: 'song-resource-discovery',
    schema: 'content/schema/resource-discovery.schema.json',
    survey_status: 'NOT_PERFORMED',
    survey_note: '本轮**未执行**任何网络检索（无授权检索流程、不做猜测性填写）。因此除仓内可证事实外，一切外部资源字段一律 UNSURVEYED。填表需要人工 / 浏览器会话逐首核查，核查结果回填本文件。',
    status_vocabulary: {
      FOUND: '确认找到可用的现成资源（必须带 source_name 与可核验位置）',
      NOT_FOUND: '已确认不存在（本轮仅对 AI 成品成立：类型已定义但未接入引擎）',
      VERIFY: '找到了但需要核版本 / 听校后才能用',
      REUSE: '可以复用（外部真人版本：原站播放 / 嵌入 / 时间段定位，不下载转存）',
      CREATE: '需 MOS 自己制作',
      UNSURVEYED: '尚未检索 —— 不得填写任何来源，宁可空着',
    },
    production_priority: ['找现成', '核版本', '能用就用', '缺什么补什么', '最后自己制作'],
    output_columns: ['Song', 'Score', 'Lyrics', 'Human Male', 'Human Female', 'AI Male', 'AI Female', 'Piano', 'Teaching', 'Rights/Source', 'Next Action'],
    counts: {
      songs_total: rows.length,
      detail_layer: countBy((r) => r.layer === 'detail'),
      candidate_only: countBy((r) => r.layer === 'candidate'),
      rights_unresolved: countBy((r) => r.rights.rights_state === 'RIGHTS_UNRESOLVED'),
      lyrics_found: countBy((r) => r.found.lyrics.status === 'FOUND'),
      score_verify: countBy((r) => r.found.score.status === 'VERIFY'),
      score_unsurveyed: countBy((r) => r.found.score.status === 'UNSURVEYED'),
      human_unsurveyed: countBy((r) => r.found.human_male.status === 'UNSURVEYED' && r.found.human_female.status === 'UNSURVEYED'),
      piano_unsurveyed: countBy((r) => r.found.piano.status === 'UNSURVEYED'),
      teaching_unsurveyed: countBy((r) => r.found.teaching.status === 'UNSURVEYED'),
      ai_not_found: countBy((r) => r.found.ai_male.status === 'NOT_FOUND'),
      external_reuse_confirmed: 0,
      needs_mos_creation: countBy((r) => r.rights.rights_state === 'RESOLVED'),
    },
    by_field_status: fieldStatus(),
    rows,
    note: '普查 ≠ 生产。本轮停止条件明确：不开始制作 100 首实际资源。本表的用途是让下一步知道「哪些能找到现成的、哪些必须自己做」。',
  };

  if (write) fs.writeFileSync(path.join(ROOT, OUT_REL), JSON.stringify(out, null, 2) + '\n', 'utf8');
  return out;
}

function check() {
  const errors = [];
  if (!exists(OUT_REL)) { console.error('[ERROR] 缺少 content/production/resource-discovery.json'); return { ok: false, errors: 1 }; }
  const d = readJSON(OUT_REL);
  if (d.survey_status !== 'NOT_PERFORMED') errors.push('survey_status 必须如实为 NOT_PERFORMED（本轮未检索）');
  if ((d.rows || []).length !== 100) errors.push(`普查应覆盖 100 首，实际 ${(d.rows || []).length}`);
  if (JSON.stringify(d.production_priority) !== JSON.stringify(['找现成', '核版本', '能用就用', '缺什么补什么', '最后自己制作'])) {
    errors.push('生产优先级必须固定为：找现成 → 核版本 → 能用就用 → 缺什么补什么 → 最后自己制作');
  }
  for (const [k, v] of Object.entries(d.status_vocabulary || {})) {
    if (!STATES.includes(k)) errors.push(`状态词表含非法项 ${k}`);
    if (!v) errors.push(`状态词表 ${k} 缺说明`);
  }
  for (const r of d.rows || []) {
    const where = `row ${r.song_id}`;
    if (!/^MUS-S-\d{4}$/.test(String(r.song_id))) errors.push(`${where}: song_id 不合规`);
    if (!r.next_action) errors.push(`${where}: 缺 next_action`);
    for (const [k, f] of Object.entries(r.found || {})) {
      if (!STATES.includes(f.status)) { errors.push(`${where}: ${k}.status 非法 ${f.status}`); continue; }
      /* 反虚构：未检索 / 未找到时不得带来源 */
      if (['UNSURVEYED', 'NOT_FOUND'].includes(f.status) && (f.source_url || f.source_name)) {
        errors.push(`${where}: ${k} 状态为 ${f.status} 却带来源 —— 不得虚构来源`);
      }
      if (f.status === 'FOUND' && !f.source_name) errors.push(`${where}: ${k} 标 FOUND 但缺 source_name`);
    }
    /* 权利未判定 ⇒ 必须阻断 */
    const legal = r.rights && r.rights.copyright_status;
    if (legal && !['public_domain', 'licensed', 'permission_granted'].includes(legal) && r.rights.rights_state !== 'RIGHTS_UNRESOLVED') {
      errors.push(`${where}: 法律状态 ${legal} 未判定，必须标记 RIGHTS_UNRESOLVED`);
    }
    if (!legal && r.rights.rights_state !== 'RIGHTS_UNRESOLVED') errors.push(`${where}: 未升详情层（法律状态未判定）必须标记 RIGHTS_UNRESOLVED`);
  }
  const recount = build({ write: false });
  for (const k of Object.keys(recount.counts)) {
    if ((d.counts || {})[k] !== recount.counts[k]) errors.push(`counts.${k} 与重算不一致`);
  }
  for (const e of errors) console.error('[ERROR]', e);
  console.log(`resource-discovery check: ${errors.length === 0 ? 'OK' : 'FAIL'}  100 首 ｜ 已找到歌词 ${recount.counts.lyrics_found} ｜ 待核 ${recount.counts.score_verify} ｜ 权利未判定（RIGHTS_UNRESOLVED，非阻断结论）${recount.counts.rights_unresolved}`);
  return { ok: errors.length === 0, errors: errors.length };
}

function report() {
  const d = exists(OUT_REL) ? readJSON(OUT_REL) : build({ write: false });
  console.log('# 100 首资源普查摘要');
  console.log(JSON.stringify(d.counts, null, 1));
  console.log('by_field_status:', JSON.stringify(d.by_field_status, null, 1));
  const byAction = {};
  for (const r of d.rows) byAction[r.next_action] = (byAction[r.next_action] || 0) + 1;
  console.log('next_action 分布:', JSON.stringify(byAction, null, 1));
  return d;
}

module.exports = { build, check, report };

if (require.main === module) {
  const arg = process.argv[2] || '';
  if (arg === '--check') { const r = check(); process.exit(r.ok ? 0 : 1); }
  if (arg === '--report') { report(); }
  else if (!arg) {
    const d = build({ write: true });
    console.log(`资源普查表已生成：${d.rows.length} 首`);
    console.log(JSON.stringify(d.counts, null, 1));
  }
}
