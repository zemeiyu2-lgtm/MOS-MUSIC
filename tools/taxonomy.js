/* =========================================================
   MOS-MUSIC｜Song Taxonomy V1.1（四维分类推导器）
   ---------------------------------------------------------
   分类只是「帮助用户找到歌曲」，不是歌曲的身份（ADR-0019）。

   本工具只做**派生**，不做判断：
     主题   ← 候选层 front_tags.theme（录入期初分类）
     处境   ← 曲库详情层 formation.emotion（记录里已有的情感/处境词）
     场景   ← 候选层 front_tags.scene ∪ 详情层 scenes[]
     音乐   ← 详情层 discipleship.difficulty + 单元 score（拍号/速度/音域）

   铁律：
     1) **不虚构标签**：源里没有的维度一律留空，并写明「尚未标注 + 原因」；
     2) 词表只能来自 content/taxonomy/index.json；源值不在词表内 → 记入 unmapped，
        由人工裁决，**绝不自动扩表**（CI-0032）；
     3) 每个分词条目必须带 derived_from（可追溯）；
     4) 多归属：四维都是集合，不产生「只能属于一类」的约束；
     5) 不写 content/songs/**、不写 content/song-units/**（只读）。

   用法：
     node tools/taxonomy.js           生成 / 刷新 content/taxonomy/assignments.json
     node tools/taxonomy.js --check   只校验，不写文件
========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX_REL = 'content/taxonomy/index.json';
const ASSIGN_REL = 'content/taxonomy/assignments.json';
const CAND_REL = 'content/candidates/index.json';
const SONGS_IDX_REL = 'content/songs/index.json';

const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

/** 词表 → Set（按维度取 key）。 */
function vocabSet(tax, dimKey) {
  const dim = (tax.dimensions || []).find((d) => d.key === dimKey) || {};
  return new Set((dim.vocab || []).map((v) => v.key));
}

/** 过滤到词表内；不在词表内的值进入 unmapped（人工裁决，不自动扩表）。 */
function pick(values, allowed, unmapped, where) {
  const out = [];
  for (const v of values || []) {
    if (v == null || v === '') continue;
    const key = String(v);
    if (allowed.has(key)) {
      if (!out.includes(key)) out.push(key);
    } else if (!unmapped.some((u) => u.value === key && u.dimension === where)) {
      unmapped.push({ dimension: where, value: key, seen_at: where.startsWith('theme') ? 'candidate' : 'record' });
    }
  }
  return out;
}

function unitFor(songId) {
  const rel = `content/song-units/MUS-SU-${String(songId).slice(-4)}.json`;
  if (!exists(rel)) return null;
  try { return readJSON(rel); } catch (_) { return null; }
}

function build({ write = true } = {}) {
  const tax = readJSON(INDEX_REL);
  const cand = readJSON(CAND_REL);
  const songsIdx = readJSON(SONGS_IDX_REL);
  const detailRows = (songsIdx.songs || []).filter((s) => s.file);

  const V_THEME = vocabSet(tax, 'theme');
  const V_SIT = vocabSet(tax, 'situation');
  const V_SCENE = vocabSet(tax, 'scene');

  const unmapped = [];
  const rows = [];

  /* 以候选层 100 首为骨架（前台目录同序），详情层补充。 */
  for (const c of cand.candidates || []) {
    const detailRow = detailRows.find((s) => s.song_id === c.song_id) || null;
    const song = detailRow ? readJSON(detailRow.file) : null;
    const unit = detailRow ? unitFor(c.song_id) : null;

    /* --- 主题 --- */
    const theme = [];
    if (c.front_tags && c.front_tags.theme) {
      const t = pick([c.front_tags.theme], V_THEME, unmapped, 'theme');
      for (const k of t) theme.push({ key: k, label: k, derived_from: 'content/candidates/index.json#front_tags.theme', provenance: 'provisional_intake_classification' });
    }

    /* --- 处境（只有详情层有来源） --- */
    const situation = pick(song ? song.formation && song.formation.emotion : [], V_SIT, unmapped, 'situation')
      .map((k) => ({ key: k, label: k, derived_from: `content/songs/${c.song_id}.json#formation.emotion`, provenance: 'existing_record_field' }));

    /* --- 场景（候选 + 详情） --- */
    const scene = [];
    const candScene = pick([c.front_tags && c.front_tags.scene], V_SCENE, unmapped, 'scene')
      .map((k) => ({ key: k, label: k, derived_from: 'content/candidates/index.json#front_tags.scene', provenance: 'provisional_intake_classification' }));
    const coreScene = pick(song ? song.scenes : [], V_SCENE, unmapped, 'scene')
      .map((k) => ({ key: k, label: k, derived_from: `content/songs/${c.song_id}.json#scenes`, provenance: 'existing_record_field' }));
    for (const item of candScene.concat(coreScene)) if (!scene.some((s) => s.key === item.key)) scene.push(item);

    /* --- 音乐 --- */
    const score = (unit && unit.score) || {};
    const music = {
      difficulty: (song && song.discipleship && typeof song.discipleship.difficulty === 'number') ? song.discipleship.difficulty : null,
      difficulty_source: (song && song.discipleship && typeof song.discipleship.difficulty === 'number') ? `content/songs/${c.song_id}.json#discipleship.difficulty` : null,
      tempo_bpm: score.tempo_bpm == null ? null : score.tempo_bpm,
      time_signature: score.time_signature == null ? null : score.time_signature,
      range: (score.range && (score.range.lowest || score.range.highest)) ? score.range : { lowest: null, highest: null },
      suitable_for: [],
      suitable_for_note: '「适合视唱 / 群体歌唱 / 个人练习」目前没有任何内容层来源，一律留空 —— 尚未标注，不是遗漏。',
    };
    const hasMusic = music.difficulty != null || music.tempo_bpm != null || music.time_signature != null
      || music.range.lowest != null || music.range.highest != null;

    rows.push({
      song_id: c.song_id,
      title_zh: (song && song.title) || c.title_zh || null,
      title_en: c.title_en || null,
      layer: detailRow ? 'detail' : 'candidate',
      dimensions: {
        theme,
        situation,
        scene,
        music,
      },
      gaps: {
        situation: situation.length ? null : '这首歌没有处境标注：候选层没有 formation.emotion 字段（等人工标注或后续研究）。',
        music: hasMusic ? null : '这首歌没有音乐属性：难度 / 拍号 / 速度 / 音域都还没有内容层来源（等简谱与辨识推进）。',
      },
      note: '分类是检索入口，不是歌曲身份；空维度为如实留空。',
    });
  }

  const count = (fn) => rows.filter(fn).length;
  const counts = {
    dimensions: (tax.dimensions || []).length,
    songs_total: rows.length,
    songs_with_theme: count((r) => r.dimensions.theme.length > 0),
    songs_with_situation: count((r) => r.dimensions.situation.length > 0),
    songs_with_scene: count((r) => r.dimensions.scene.length > 0),
    songs_with_music: count((r) => r.dimensions.music.difficulty != null
      || r.dimensions.music.tempo_bpm != null || r.dimensions.music.time_signature != null
      || r.dimensions.music.range.lowest != null || r.dimensions.music.range.highest != null),
    multi_membership_songs: count((r) => r.dimensions.theme.length > 1 || r.dimensions.situation.length > 1
      || r.dimensions.scene.length > 1),
    theme_labels_in_use: new Set(rows.flatMap((r) => r.dimensions.theme.map((t) => t.key))).size,
    scene_labels_in_use: new Set(rows.flatMap((r) => r.dimensions.scene.map((t) => t.key))).size,
    situation_labels_in_use: new Set(rows.flatMap((r) => r.dimensions.situation.map((t) => t.key))).size,
  };

  const out = {
    assignments_version: tax.taxonomy_version,
    generated_at: new Date().toISOString().slice(0, 10),
    generated_by: 'tools/taxonomy.js（从既有记录派生；不新增任何含义）',
    model: 'song-taxonomy-assignments',
    schema: 'content/schema/taxonomy.schema.json',
    taxonomy_ref: INDEX_REL,
    derived: true,
    rules: {
      multi_membership: '每个维度都是集合，一首歌可以同时属于多个分类；不存在「只能属于一类」的字段。',
      no_invention: '源里没有的维度留空并列出原因；词表外的新值只记入 unmapped，不自动采用。',
      evidence: '每个分词条目都带 derived_from。',
    },
    counts,
    unmapped,
    assignments: rows,
    note: '本文件是派生索引（CI-0014 案 a 口径）：可重建、不进不可变基线。分类不代表研究裁决，不改变任何 tier / review_status。',
  };

  if (write) fs.writeFileSync(path.join(ROOT, ASSIGN_REL), JSON.stringify(out, null, 2) + '\n', 'utf8');

  /* 词表内实际在用计数回写 taxonomy 索引（只改 counts，不改词表）。 */
  if (write) {
    tax.counts = {
      dimensions: counts.dimensions,
      songs_total: counts.songs_total,
      songs_with_theme: counts.songs_with_theme,
      songs_with_situation: counts.songs_with_situation,
      songs_with_scene: counts.songs_with_scene,
      songs_with_music: counts.songs_with_music,
      multi_membership_songs: counts.multi_membership_songs,
    };
    fs.writeFileSync(path.join(ROOT, INDEX_REL), JSON.stringify(tax, null, 2) + '\n', 'utf8');
  }
  return out;
}

/* ---------------------------------------------------------------- 校验 */

function check() {
  const errors = [];
  const warns = [];
  const tax = readJSON(INDEX_REL);
  if (!exists(ASSIGN_REL)) { console.error('[ERROR] 缺少 content/taxonomy/assignments.json（先跑 node tools/taxonomy.js）'); return { ok: false, errors: 1, warnings: 0 }; }
  const a = readJSON(ASSIGN_REL);

  if (a.derived !== true) errors.push('assignments.derived 必须为 true（派生文件）');
  if (a.assignments_version !== tax.taxonomy_version) errors.push(`assignments_version ${a.assignments_version} ≠ taxonomy_version ${tax.taxonomy_version}`);
  if ((tax.dimensions || []).length !== 4) errors.push(`四维分类应恰好 4 维，实际 ${(tax.dimensions || []).length}`);
  const dimKeys = (tax.dimensions || []).map((d) => d.key);
  if (JSON.stringify(dimKeys) !== JSON.stringify(['theme', 'situation', 'scene', 'music'])) {
    errors.push(`四维键应为 theme/situation/scene/music，实际 ${JSON.stringify(dimKeys)}`);
  }
  const front = tax.front_rules || {};
  for (const banned of ['calibration', 'source_required', 'governance', 'W01', 'W02']) {
    if (!(front.hides || []).includes(banned)) errors.push(`前台隐藏词表必须包含 ${banned}`);
  }
  const V = { theme: vocabSet(tax, 'theme'), situation: vocabSet(tax, 'situation'), scene: vocabSet(tax, 'scene') };

  const cand = readJSON(CAND_REL);
  const candIds = new Set((cand.candidates || []).map((c) => c.song_id));
  const seen = new Set();
  for (const r of a.assignments || []) {
    const where = `assignments ${r.song_id}`;
    if (seen.has(r.song_id)) errors.push(`${where}: 重复`);
    seen.add(r.song_id);
    if (!candIds.has(r.song_id)) errors.push(`${where}: 不在候选库（分类只覆盖候选 100 首）`);
    if (!/^MUS-S-\d{4}$/.test(String(r.song_id))) errors.push(`${where}: song_id 不合规`);
    for (const dim of ['theme', 'situation', 'scene']) {
      const arr = r.dimensions && r.dimensions[dim];
      if (!Array.isArray(arr)) { errors.push(`${where}: ${dim} 必须是数组（多归属，禁止单选字段）`); continue; }
      for (const item of arr) {
        if (!V[dim].has(item.key)) errors.push(`${where}: ${dim} 含词表外标签「${item.key}」（须人工裁决后扩表）`);
        if (!item.derived_from) errors.push(`${where}: ${dim} 条目缺 derived_from（不可追溯）`);
        if (String(item.derived_from).startsWith('app/')) errors.push(`${where}: ${dim} 追溯指向程序目录`);
      }
    }
    const m = r.dimensions && r.dimensions.music;
    if (!m || typeof m !== 'object') errors.push(`${where}: music 必须是对象（facets）`);
    else {
      for (const k of ['suitable_for']) {
        if (!Array.isArray(m[k])) errors.push(`${where}: music.${k} 必须是数组`);
      }
    }
  }
  if ((a.assignments || []).length !== 100) errors.push(`分类覆盖应为候选 100 首，实际 ${(a.assignments || []).length}`);

  /* 计数必须与逐行重算一致（防手改计数） */
  const recount = build({ write: false }).counts;
  for (const k of Object.keys(recount)) {
    if ((a.counts || {})[k] !== recount[k]) errors.push(`counts.${k} 与重算不一致：${(a.counts || {})[k]} ≠ ${recount[k]}`);
  }
  /* 多归属必须真实存在（否则说明被做成了单选） */
  if (!(recount.multi_membership_songs > 0)) errors.push('多归属歌曲数为 0 —— 分类不得退化为单选');
  if ((a.unmapped || []).length) warns.push(`词表外值 ${a.unmapped.length} 条待人工裁决（不自动扩表）：${JSON.stringify(a.unmapped.slice(0, 5))}`);

  for (const w of warns) console.log('[WARN]', w);
  for (const e of errors) console.error('[ERROR]', e);
  console.log(`taxonomy check: ${errors.length === 0 ? 'OK' : 'FAIL'}  词语 ${a.assignments.length} 首 ｜ 主题 ${recount.songs_with_theme} ｜ 处境 ${recount.songs_with_situation} ｜ 场景 ${recount.songs_with_scene} ｜ 音乐 ${recount.songs_with_music} ｜ 多归属 ${recount.multi_membership_songs}`);
  return { ok: errors.length === 0, errors: errors.length, warnings: warns.length };
}

module.exports = { build, check };

if (require.main === module) {
  const arg = process.argv[2] || '';
  if (arg === '--check') {
    const r = check();
    process.exit(r.ok ? 0 : 1);
  } else {
    const out = build({ write: true });
    console.log(`taxonomy 已生成：${out.assignments.length} 首`);
    console.log(JSON.stringify(out.counts, null, 1));
    if (out.unmapped.length) console.log('unmapped（待人工裁决，未采用）：', JSON.stringify(out.unmapped));
  }
}
