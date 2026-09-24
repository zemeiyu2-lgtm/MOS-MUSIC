/* =========================================================
   MOS-MUSIC｜Boundary Guard（V3.x 产品边界守护）
   ---------------------------------------------------------
   独立守门工具：把「产品方向冻结」变成可执行检查。
   它与 validate-content 互补：validate 管内容/程序分离与结构契约，
   guard 管**边界语义**（前台不露周次、AI 不冒充真人、不下载转存、
   Coach 不读门训数据、分类是多归属、普查不虚构来源、无评分排名）。

   用法：node tools/guard.js        全绿输出 OK；任一违反 exit 1
========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const readText = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function listFiles(dir, exts, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, exts, acc);
    else if (exts.some((x) => e.name.endsWith(x))) acc.push(p);
  }
  return acc;
}

const checks = [];
const fail = [];
function check(name, fn) {
  try {
    const r = fn() || {};
    const issues = r.issues || [];
    checks.push({ name, ok: issues.length === 0, detail: r.detail || '', issues });
    if (issues.length) fail.push(...issues.map((i) => `[${name}] ${i}`));
  } catch (err) {
    checks.push({ name, ok: false, detail: '', issues: [String(err && err.message || err)] });
    fail.push(`[${name}] 检查异常：${err && err.message}`);
  }
}

/* ---------------- 1. 前台不露周次 / 课程码 ----------------
   前台（app/front/**）是「音乐系统」的门面：不突出 W01/W02，
   也不出现课程 ID —— 周次与课程的引用关系保留在后台数据里。 */
check('前台不露出周次与课程码', () => {
  const files = listFiles(path.join(ROOT, 'app/front'), ['.js']);
  const issues = [];
  for (const f of files) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const src = fs.readFileSync(f, 'utf8');
    const wk = src.match(/\bW[0-9]{2}\b/);
    if (wk) issues.push(`${rel} 出现周次码「${wk[0]}」—— 前台不突出周次`);
    const cid = src.match(/MUS-C-[0-9]{2}/);
    if (cid) issues.push(`${rel} 出现课程 ID「${cid[0]}」—— 音乐前台不绑定课程`);
    const uid = src.match(/MUS-U-2027-W[0-9]{2}/);
    if (uid) issues.push(`${rel} 出现年度单元 ID「${uid[0]}」`);
  }
  return { issues, detail: `${files.length} 个前台文件` };
});

/* ---------------- 2. 后台历史引用仍在（不删除） ---------------- */
check('后台周次历史引用未被删除', () => {
  const issues = [];
  const annual = 'content/annual/2027/index.json';
  if (!exists(annual)) issues.push('缺少年度索引（W01–W04 后台历史引用）');
  else {
    const idx = readJSON(annual);
    if (!(idx.weeks || []).length) issues.push('年度索引里周记录为空 —— 后台历史引用被删除');
  }
  const wk = readText('app/week-music.js');
  if (!wk.includes('W')) issues.push('周音乐模块异常');
  return { issues, detail: `年度周记录保留在 ${annual}` };
});

/* ---------------- 3. AI 不得冒充真人 ----------------
   · AI 轨必须 is_ai=true / singer=null，且界面必须写「非真人」；
   · AI 只进 demos.ai_male / demos.ai_female，不进男性 / 女性真人槽位。 */
check('AI 示唱必须显式标注且不入真人槽位', () => {
  const issues = [];
  const src = readJSON('content/song-resources/index.json');
  const types = src.source_types_v1 || [];
  const ai = types.filter((t) => t.is_ai);
  if (ai.length !== 2) issues.push(`来源类型应含 AI_MALE / AI_FEMALE 两项，实际 ${ai.length}`);
  for (const t of ai) {
    if (t.front_label.indexOf('非真人') === -1) issues.push(`${t.key} 前台标签必须写明「非真人」`);
    if (t.is_human) issues.push(`${t.key} 不得是真人类型`);
  }
  const fs1 = readText('app/front/song-page.js');
  if (fs1.indexOf('非真人') === -1) issues.push('歌曲页必须显示「非真人」标注');
  if (fs1.indexOf('AI 示唱') === -1) issues.push('歌曲页必须单独列出 AI 示唱轨');
  const coach = readJSON('content/coach/index.json');
  const aiIface = coach.interfaces.ai_analysis || {};
  if (aiIface.status !== 'RESERVED_NOT_CONNECTED') issues.push('AI 分析接口本轮必须为 RESERVED_NOT_CONNECTED（不接入厂商）');
  if (aiIface.vendor != null) issues.push('AI 分析接口 vendor 必须为 null（本轮不接入具体厂商）');
  /* AI 轨定义：singer 必须 null */
  const unitSchema = readText('content/schema/song-unit.schema.json');
  if (unitSchema.indexOf('aiDemoTrack') === -1) issues.push('单曲单元 schema 必须定义 aiDemoTrack（可选 AI 轨）');
  if (unitSchema.indexOf('"is_ai"') === -1) issues.push('AI 轨必须有 is_ai 字段（防止被当成真人）');
  return { issues, detail: `来源类型 ${types.length} 项（含 AI ${ai.length}）` };
});

/* ---------------- 4. 外部真人版本：只定位，不下载转存 ---------------- */
check('外部真人资源一律原站定位（禁下载转存）', () => {
  const issues = [];
  const banned = ['download_url', 'local_copy', 'reupload', 'downloaded_file', 'mirror_url'];
  for (const f of listFiles(path.join(ROOT, 'content'), ['.json'])) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const raw = fs.readFileSync(f, 'utf8');
    for (const b of banned) if (raw.includes(`"${b}"`)) issues.push(`${rel} 含下载 / 转存字段「${b}」—— 外部资源不得转存`);
  }
  const src = readJSON('content/song-resources/index.json');
  const seg = src.external_segment_support || {};
  for (const k of ['source_url', 'start', 'end', 'phrase_id']) {
    if (!(seg.fields || []).includes(k)) issues.push(`外部分段能力必须支持 ${k}`);
  }
  if (String(seg.host_policy || '').indexOf('不得') === -1) issues.push('外部托管政策必须写明「不得下载 / 转存」');
  /* 资源记录若有，外部类型的 file_url 必须为 null、host_policy 必须非 hosted */
  for (const r of src.resources || []) {
    const st = String(r.source_type || '');
    if (st.startsWith('EXTERNAL_')) {
      if (r.file_url) issues.push(`${r.resource_id} 外部真人资源不得带 file_url（应为原站定位）`);
      if (r.host_policy === 'hosted_authorized') issues.push(`${r.resource_id} 外部真人资源不得声明本仓托管`);
    }
    if (st.startsWith('AI_') && r.is_ai !== true) issues.push(`${r.resource_id} AI 资源必须 is_ai=true`);
  }
  return { issues, detail: '内容层无下载 / 转存字段' };
});

/* ---------------- 5. Singing Coach 独立于门训系统 ---------------- */
check('Singing Coach 不读门训数据', () => {
  const issues = [];
  const files = ['app/coach.js', 'app/front/coach.js'];
  const forbidden = ['user_progress', 'user_practice', 'user_feedback', 'my_songs', 'getWeek', 'getAllWeeks', 'content/annual', 'song_units', 'outbox'];
  for (const f of files) {
    if (!exists(f)) { issues.push(`缺少 ${f}`); continue; }
    const src = readText(f);
    for (const k of forbidden) {
      if (src.includes(k)) issues.push(`${f} 引用了门训/年度数据「${k}」—— Coach 必须独立`);
    }
    for (const k of ['leaderboard', 'badge', '總分', 'total_score']) {
      if (src.includes(k)) issues.push(`${f} 出现排行 / 徽章 / 总分字段「${k}」`);
    }
  }
  const coach = readJSON('content/coach/index.json');
  const notRead = coach.independence && coach.independence.does_not_read;
  if (!Array.isArray(notRead) || notRead.length < 4) issues.push('Coach 必须显式声明「不读哪些门训数据」');
  if ((coach.capabilities || []).length !== 10) issues.push(`Coach 能力模型应为 10 项，实际 ${(coach.capabilities || []).length}`);
  const forb = (coach.feedback_structure || {}).forbidden || [];
  for (const need of ['分数', '排行', '属灵']) {
    if (!forb.some((x) => x.includes(need))) issues.push(`反馈禁止项必须包含「${need}」类内容`);
  }
  return { issues, detail: `能力 ${(coach.capabilities || []).length} 项 / 训练项目 ${(((coach.training_item_model || {}).starter_items) || []).length} 项` };
});

/* ---------------- 6. 分类：四维 / 多归属 / 前台只显示四维 ---------------- */
check('分类四维且多归属（不是单选身份）', () => {
  const issues = [];
  const tax = readJSON('content/taxonomy/index.json');
  const assign = readJSON('content/taxonomy/assignments.json');
  const dims = (tax.dimensions || []).map((d) => d.key);
  if (JSON.stringify(dims) !== JSON.stringify(['theme', 'situation', 'scene', 'music'])) issues.push(`四维应为 theme/situation/scene/music，实际 ${JSON.stringify(dims)}`);
  for (const d of tax.dimensions || []) {
    if (d.kind === 'labels' && d.multi !== true) issues.push(`${d.key} 必须是多归属（multi=true）`);
  }
  for (const b of ['calibration', 'source_required', 'governance', 'W01', 'W02']) {
    if (!((tax.front_rules || {}).hides || []).includes(b)) issues.push(`前台隐藏词表缺 ${b}`);
  }
  const rows = assign.assignments || [];
  if (rows.length !== 100) issues.push(`分词应覆盖 100 首，实际 ${rows.length}`);
  let multi = 0;
  for (const r of rows) {
    let rowMulti = false;
    for (const k of ['theme', 'situation', 'scene']) {
      const v = (r.dimensions || {})[k];
      if (!Array.isArray(v)) issues.push(`${r.song_id}.${k} 必须是数组`);
      else if (v.length > 1) rowMulti = true;
      for (const it of (v || [])) if (!it.derived_from) issues.push(`${r.song_id}.${k} 条目缺 derived_from`);
    }
    if (rowMulti) multi += 1;
  }
  if (multi === 0) issues.push('没有任何歌曲属于多个分类 —— 分类被做成了单选');
  return { issues, detail: `100 首 / 多归属歌曲 ${multi}` };
});

/* ---------------- 7. 普查表：不虚构来源 ---------------- */
check('资源普查表不虚构来源', () => {
  const issues = [];
  const d = readJSON('content/production/resource-discovery.json');
  if (d.survey_status !== 'NOT_PERFORMED') issues.push('外部检索未执行时必须 survey_status=NOT_PERFORMED');
  if ((d.counts || {}).external_reuse_confirmed !== 0) issues.push('本轮不可能有已确认的外部复用资源');
  for (const r of d.rows || []) {
    for (const [k, f] of Object.entries(r.found || {})) {
      if (['UNSURVEYED', 'NOT_FOUND'].includes(f.status) && (f.source_url || f.source_name)) {
        issues.push(`${r.song_id}.${k} 未检索却带来源`);
      }
      if (f.status === 'FOUND' && !f.source_name) issues.push(`${r.song_id}.${k} 标记 FOUND 但无来源`);
    }
  }
  const pri = d.production_priority || [];
  if (pri.join('>') !== ['找现成', '核版本', '能用就用', '缺什么补什么', '最后自己制作'].join('>')) {
    issues.push('生产优先级必须固定为「找现成 → 核版本 → 能用就用 → 缺什么补什么 → 最后自己制作」');
  }
  return { issues, detail: `100 首 / 未检索为主：外部复用确认 ${(d.counts || {}).external_reuse_confirmed}` };
});

/* ---------------- 8. 歌曲内容层不绑定周次 / 课程 ---------------- */
check('歌曲内容层不绑定周次与课程', () => {
  const issues = [];
  const files = listFiles(path.join(ROOT, 'content/song-content'), ['.json']);
  if (!files.length) issues.push('歌曲内容层为空');
  for (const f of files) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const raw = fs.readFileSync(f, 'utf8');
    const wk = raw.match(/\bW[0-9]{2}\b/);
    if (wk) issues.push(`${rel} 出现周次码「${wk[0]}」`);
    const cid = raw.match(/MUS-C-[0-9]{2}/);
    if (cid) issues.push(`${rel} 出现课程 ID「${cid[0]}」`);
    const uid = raw.match(/MUS-U-2027-W[0-9]{2}/);
    if (uid) issues.push(`${rel} 出现年度单元 ID`);
  }
  return { issues, detail: `${files.length} 个歌曲内容层文件` };
});

/* ---------------- 9. 不评分 / 不排名 / 不评属灵 ---------------- */
check('没有评分 / 排名 / 属灵评价', () => {
  const issues = [];
  const targets = ['app/front/coach.js', 'app/coach.js', 'content/coach/index.json'];
  for (const f of targets) {
    if (!exists(f)) { issues.push(`缺少 ${f}`); continue; }
    const src = readText(f);
    for (const b of ['leaderboard', '"rank"', '"rating"', '"badge"', '属灵评分', '敬虔程度']) {
      /* 内容层词表会在 forbidden 段里**列举**禁止项 —— 那是声明，不是实现 */
      if (f.startsWith('content/') && (b === '属灵评分' || b === '敬虔程度')) continue;
      if (src.includes(b)) issues.push(`${f} 出现「${b}」—— 不得评分 / 排名 / 评属灵`);
    }
  }
  return { issues, detail: '教练模块与词表无评分字段' };
});

/* ---------------- 10. 前台只显示四维分类（不显示后台词） ---------------- */
check('前台隐藏后台术语', () => {
  const issues = [];
  const files = listFiles(path.join(ROOT, 'app/front'), ['.js']);
  /* 「我的」页底部有意保留后台入口（V2.1 决策），那里的校准入口链接不算前台泄露。 */
  const ALLOW = { 'app/front/mine.js': ['calibration'] };
  for (const f of files) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const src = fs.readFileSync(f, 'utf8');
    /* 只查会直接出现在界面文案里的词；读数据字段名（如 rights.copyright_status）不算 */
    for (const b of ['calibration', 'governance', 'source_required', 'SOURCE_REQUIRED']) {
      if (src.includes(b) && !(ALLOW[rel] || []).includes(b)) issues.push(`${rel} 出现后台术语「${b}」`);
    }
  }
  return { issues, detail: `${files.length} 个前台文件` };
});

/* ---------------------------------------------------------------- 输出 */

console.log('MOS-MUSIC boundary guard');
console.log('');
for (const c of checks) {
  console.log(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.name}${c.detail ? `  —— ${c.detail}` : ''}`);
}
if (fail.length) {
  console.log('');
  for (const f of fail) console.error(f);
}
console.log('');
console.log(`guard: ${fail.length === 0 ? 'OK' : 'FAIL'}  checks=${checks.length}  violations=${fail.length}`);
process.exit(fail.length === 0 ? 0 : 1);
