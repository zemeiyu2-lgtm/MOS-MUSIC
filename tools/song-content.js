/* =========================================================
   MOS-MUSIC｜Song Content Layer（歌曲内容层 · V3.x §四）
   ---------------------------------------------------------
   歌曲自身的内容层：meaning / scripture / background /
   reflection / practice / prayer —— 属于**这首歌**，
   不绑定 W01 / W02 / 某一课 / 某一次讲道（ADR-0018）。

   本工具只搬事实，不写神学内容：
     · scripture  ← content/songs/**#bible.core_passage（记录里已有的经文引用）
     · practice   ← content/songs/**#formation.practice（记录里已有的实践句）
     · prayer     ← content/songs/**#formation.prayer（记录里已有的祷告句）
     · meaning / background / reflection ← **没有来源就是没有**：
       一律 status=NOT_AVAILABLE，并在 note 里写明「已有的其他字段可作人工撰写依据」。

   铁律：
     1) 有 text 必须有 derived_from（校验器强制）；
     2) 不得出现周次码 / 课程 ID / 讲道引用（内容属于歌曲本身）；
     3) 不写 content/songs/**（只读）。

   用法：
     node tools/song-content.js           生成 / 刷新歌曲内容层
     node tools/song-content.js --check   只校验
========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = 'content/song-content';
const INDEX_REL = `${OUT_DIR}/index.json`;
const SONGS_IDX_REL = 'content/songs/index.json';

const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const FIELD_KEYS = ['meaning', 'scripture', 'background', 'reflection', 'practice', 'prayer'];

function field(shape) {
  return Object.assign({ text: null, status: 'NOT_AVAILABLE', derived_from: null, note: null }, shape);
}

function buildSong(song) {
  const sid = song.song_id;
  const core = song.bible || {};
  const form = song.formation || {};

  const out = {
    song_id: sid,
    content_version: 'MUS-V-1.0.0',
    model: 'song-content',
    scope_note: '这份内容是这首歌自己的（意义 / 经文 / 背景 / 默想 / 实践 / 祷告），不来自任何周次或课程；周次与课程只可以在下游**引用**它。',
    meaning: field({
      note: '「这首歌在说什么」需要人工撰写。可作依据的既有字段：'
        + `content/songs/${sid}.json#bible.bible_themes、#theology.theology、#formation.primary_function（当前 primary_function=${form.primary_function || 'null'}）。`
        + '程序不代写意义陈述。',
    }),
    scripture: core.core_passage
      ? { reference: core.core_passage, reference_ids: core.bible_reference_ids || [], text: null, status: 'PROVIDED', derived_from: `content/songs/${sid}.json#bible.core_passage`, note: '只存经文引用与 ID，不托管译本全文（ADR-0005）。' }
      : field({ note: '歌曲记录里没有核心经文引用。' }),
    background: field({
      source_note: song.source || null,
      derived_from: song.source ? `content/songs/${sid}.json#source` : null,
      note: '这里只保留来源记载（作者 / 年代 / 出处），不代写背景叙述；背景文本需人工撰写。',
    }),
    reflection: field({
      note: '默想文本需人工撰写。既有可依据字段：'
        + `#formation.memory（${(form.memory || []).length} 条）、#formation.emotion（${(form.emotion || []).length} 条）。`
        + '程序不把记忆句直接改写成默想。',
    }),
    practice: (form.practice || []).length
      ? {
        items: form.practice.map((t) => ({ text: t, derived_from: `content/songs/${sid}.json#formation.practice` })),
        text: null, status: 'PROVIDED', derived_from: `content/songs/${sid}.json#formation.practice`, note: null,
      }
      : field({ note: '歌曲记录里没有实践句 —— 尚未提供，不是遗漏（不得把课程作业式要求写成生命实践）。' }),
    prayer: (form.prayer || []).length
      ? {
        items: form.prayer.map((t) => ({ text: t, derived_from: `content/songs/${sid}.json#formation.prayer` })),
        text: null, status: 'PROVIDED', derived_from: `content/songs/${sid}.json#formation.prayer`, note: null,
      }
      : field({ note: '歌曲记录里没有祷告句 —— 尚未提供。' }),
    boundaries: [
      '内容层属于歌曲本身；不得重新绑定任何周次码 / 课程 ID / 某一次讲道',
      '有文本必须有 derived_from（可追溯），不得凭空生成神学内容',
      '本层不写入 content/songs/**（Song Core Record 逐字节不变）',
    ],
  };
  return out;
}

function build({ write = true } = {}) {
  const idx = readJSON(SONGS_IDX_REL);
  const rows = (idx.songs || []).filter((s) => s.file);
  const written = [];
  for (const row of rows) {
    const song = readJSON(row.file);
    const rec = buildSong(song);
    if (write) {
      fs.mkdirSync(path.join(ROOT, OUT_DIR), { recursive: true });
      fs.writeFileSync(path.join(ROOT, OUT_DIR, `${song.song_id}.json`), JSON.stringify(rec, null, 2) + '\n', 'utf8');
    }
    written.push(rec);
  }
  const index = {
    content_version: 'MUS-V-1.0.0',
    generated_at: new Date().toISOString().slice(0, 10),
    model: 'song-content',
    schema: 'content/schema/song-content.schema.json',
    relation_to_song_core: 'independent_layer',
    relation_note: '歌曲内容层只按 song_id 挂在歌曲上；不引用周次 / 课程。周次与课程可以在下游引用它，反向绑定禁止。',
    field_keys: FIELD_KEYS,
    field_labels: {
      meaning: '这首歌在说什么', scripture: '经文根基', background: '背景',
      reflection: '默想', practice: '生命实践', prayer: '祷告',
    },
    status_vocabulary: {
      PROVIDED: '该字段有真实内容（逐条带 derived_from）',
      NOT_AVAILABLE: '该字段尚未提供 —— 必须在界面上如实显示，不得为补满结构而虚构',
    },
    counts: {
      songs: written.length,
      by_field_provided: FIELD_KEYS.reduce((acc, k) => {
        acc[k] = written.filter((w) => w[k] && w[k].status === 'PROVIDED').length;
        return acc;
      }, {}),
      by_field_absent: FIELD_KEYS.reduce((acc, k) => {
        acc[k] = written.filter((w) => !w[k] || w[k].status !== 'PROVIDED').length;
        return acc;
      }, {}),
    },
    songs: written.map((w) => ({ song_id: w.song_id, file: `${OUT_DIR}/${w.song_id}.json` })),
    boundaries: [
      '内容层属于歌曲本身，不绑定周次 / 课程 / 讲道',
      '缺失一律如实显示为「尚未提供」',
      '不写入 Song Core Record，不改动任何冻结研究数据',
      '不产生评分 / 排名 / 推荐',
    ],
    note: 'V3.x §四：歌曲内容层保持 meaning / scripture / background / reflection / practice / prayer 六项；没有来源的项留空并写明原因。',
  };
  if (write) fs.writeFileSync(path.join(ROOT, INDEX_REL), JSON.stringify(index, null, 2) + '\n', 'utf8');
  return index;
}

function check() {
  const errors = [];
  const idx = readJSON(SONGS_IDX_REL);
  const detail = (idx.songs || []).filter((s) => s.file);
  if (!exists(INDEX_REL)) { console.error('[ERROR] 缺少 content/song-content/index.json'); return { ok: false, errors: 1 }; }
  const cidx = readJSON(INDEX_REL);
  if (cidx.content_version !== 'MUS-V-1.0.0') errors.push(`song-content content_version 应为 MUS-V-1.0.0，实际 ${cidx.content_version}`);
  if ((cidx.field_keys || []).length !== 6 || JSON.stringify(cidx.field_keys) !== JSON.stringify(FIELD_KEYS)) {
    errors.push('歌曲内容层必须保持六项：meaning / scripture / background / reflection / practice / prayer');
  }
  if ((cidx.songs || []).length !== detail.length) errors.push(`歌曲内容层应覆盖详情层 ${detail.length} 首，实际 ${(cidx.songs || []).length}`);

  const BANNED = [/W[0-9]{2}/, /MUS-C-[0-9]{2}/, /MUS-U-2027-W/];
  for (const row of detail) {
    const rel = `${OUT_DIR}/${row.song_id}.json`;
    if (!exists(rel)) { errors.push(`缺少歌曲内容层文件：${rel}`); continue; }
    const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const re of BANNED) {
      const m = raw.match(re);
      if (m) errors.push(`${rel}: 歌曲内容层不得出现周次 / 课程绑定「${m[0]}」`);
    }
    const rec = JSON.parse(raw);
    if (rec.song_id !== row.song_id) errors.push(`${rel}: song_id 不一致`);
    for (const k of FIELD_KEYS) {
      const f = rec[k];
      if (!f) { errors.push(`${rel}: 缺字段 ${k}`); continue; }
      const hasText = Boolean(f.text) || (Array.isArray(f.items) && f.items.length > 0);
      if (hasText && !f.derived_from) errors.push(`${rel}: ${k} 有内容但缺 derived_from（不可追溯）`);
      if (hasText && f.status !== 'PROVIDED') errors.push(`${rel}: ${k} 有内容但 status ≠ PROVIDED（如实标注）`);
      for (const it of f.items || []) {
        if (it.text && !it.derived_from) errors.push(`${rel}: ${k} 条目缺 derived_from`);
      }
      for (const banned of ['"score"', '"rank"', '"rating"', '"badge"']) {
        if (JSON.stringify(f).includes(banned)) errors.push(`${rel}: ${k} 不得出现评分 / 排名类字段 ${banned}`);
      }
    }
  }
  /* 计数一致 */
  const recomputed = build({ write: false }).counts;
  for (const k of Object.keys(recomputed.by_field_provided)) {
    if ((cidx.counts.by_field_provided || {})[k] !== recomputed.by_field_provided[k]) {
      errors.push(`counts.by_field_provided.${k} 与重算不一致`);
    }
  }
  for (const e of errors) console.error('[ERROR]', e);
  console.log(`song-content check: ${errors.length === 0 ? 'OK' : 'FAIL'}  歌曲 ${detail.length} 首 ｜ 已提供字段 ${JSON.stringify(recomputed.by_field_provided)}`);
  return { ok: errors.length === 0, errors: errors.length };
}

module.exports = { build, check, FIELD_KEYS };

if (require.main === module) {
  if ((process.argv[2] || '') === '--check') {
    const r = check();
    process.exit(r.ok ? 0 : 1);
  } else {
    const idx = build({ write: true });
    console.log(`歌曲内容层已生成：${idx.counts.songs} 首`);
    console.log('已提供：', JSON.stringify(idx.counts.by_field_provided));
    console.log('尚未提供：', JSON.stringify(idx.counts.by_field_absent));
  }
}
