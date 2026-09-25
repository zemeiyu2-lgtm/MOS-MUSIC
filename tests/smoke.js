/* =========================================================
   MOS-MUSIC｜Smoke Test（Node，零依赖）
   ---------------------------------------------------------
   1. 语法层：所有 JS 文件 node --check 等价的 parse 检查（new Function 不可用于 module，
      改用 vm 模块的 SourceTextModule 不可用时退化为 require 检查 + 简单标记检查）。
   2. 结构层：sw.js / manifest.json / 索引 / map 的关键不变量。
   3. 隔离层：确认 app/ 不含 localStorage、不含 MOS-DIS key。
   4. 命名空间：store.js 的 assertNamespace 必须拒绝 mos_state_* / mos_user。

   退出码 0 = 全部通过。
========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let failed = 0;
let passed = 0;

function ok(cond, label) {
  if (cond) { passed += 1; console.log('  PASS  ' + label); }
  else { failed += 1; console.error('  FAIL  ' + label); }
}

function list(dir, ext, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) list(p, ext, acc);
    else if (e.name.endsWith(ext)) acc.push(p);
  }
  return acc;
}

console.log('1) JS 语法检查');
const node = process.execPath;
/* V1.0：生产平台引擎（discernment / production-rules / calibration / production-console）
   同样位于 app/，必须一并做语法检查，否则新引擎会成为盲区。 */
const jsFiles = list(path.join(ROOT, 'app'), '.js')
  .concat([path.join(ROOT, 'sw.js'), path.join(ROOT, 'tools/validate-content.js'), path.join(ROOT, 'tools/build-index.js'),
    path.join(ROOT, 'tools/build-usage.js'), path.join(ROOT, 'tools/baseline.js'),
    path.join(ROOT, 'tools/regression.js'), path.join(ROOT, 'tools/platform-tests.js'),
    path.join(ROOT, 'tools/produce-plan.js')]);
for (const f of jsFiles) {
  try {
    execFileSync(node, ['--check', f], { stdio: 'pipe' });
    ok(true, '语法 ' + path.relative(ROOT, f).replace(/\\/g, '/'));
  } catch (e) {
    ok(false, '语法 ' + path.relative(ROOT, f).replace(/\\/g, '/') + ' — ' + String(e.stderr || e.message).slice(0, 200));
  }
}

console.log('\n2) JSON 完整性');
const jsonFiles = list(path.join(ROOT, 'content'), '.json')
  .concat([path.join(ROOT, 'manifest.json')]);
for (const f of jsonFiles) {
  try { JSON.parse(fs.readFileSync(f, 'utf8')); ok(true, 'JSON ' + path.relative(ROOT, f).replace(/\\/g, '/')); }
  catch (e) { ok(false, 'JSON ' + path.relative(ROOT, f).replace(/\\/g, '/') + ' — ' + e.message); }
}

console.log('\n3) PWA 结构');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
ok(manifest.name && manifest.short_name, 'manifest 有 name/short_name');
ok(manifest.display === 'standalone', 'manifest display=standalone（§30）');
ok(Array.isArray(manifest.icons) && manifest.icons.some((i) => /maskable/.test(i.purpose || '')), 'manifest 含 maskable 图标');
ok(manifest.icons.every((i) => fs.existsSync(path.join(ROOT, i.src))), 'manifest 引用的图标文件全部存在');
ok(manifest.start_url.startsWith('./'), 'manifest start_url 为相对路径（子路径部署安全）');

const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
ok(/mos-music-v\d+/.test(swSrc), 'SW 缓存名已命名空间化（mos-music-vN）');
ok(!/ebrm-/i.test(swSrc.replace(/^\s*\*[\s\S]*?\*\//, '').split('\n').filter((l) => !l.trim().startsWith('*')).join('\n')) || !swSrc.includes("caches.delete('ebrm-"), 'SW 不清理其它产品的缓存前缀');
ok(/offline\.html/.test(swSrc), 'SW 有离线兜底页（§30）');
ok(/mode === ['"]navigate['"]/.test(swSrc), 'SW 对导航请求做网络优先（§30）');

console.log('\n4) 隔离层（内容/程序分离 + 跨产品存储）');
const appFiles = list(path.join(ROOT, 'app'), '.js').concat([path.join(ROOT, 'index.html')]);
const bad = [];
// 只检测"真实使用"，不检测注释里的说明文字
const RE_LS_USAGE = /(?:^|[^.\w$])(?:window\.)?localStorage\s*(?:\.|\[|=)/;
const RE_DIS_KEY_USAGE = /['"`]mos_(?:state|user)/;
for (const f of appFiles) {
  const s = fs.readFileSync(f, 'utf8');
  if (RE_LS_USAGE.test(s)) bad.push(path.relative(ROOT, f) + ' 使用 localStorage');
  if (RE_DIS_KEY_USAGE.test(s)) bad.push(path.relative(ROOT, f) + ' 引用 MOS-DIS key');
}
ok(bad.length === 0, bad.length ? bad.join('; ') : 'app/ 无 localStorage、无 MOS-DIS key');

const contentFiles = list(path.join(ROOT, 'content'), '.json');
const codeHits = [];
for (const f of contentFiles) {
  const s = fs.readFileSync(f, 'utf8');
  if (/function\s*\(|=>|<script|eval\(|\bmodule\.exports\b/.test(s)) codeHits.push(path.relative(ROOT, f));
}
ok(codeHits.length === 0, codeHits.length ? 'content/ 含代码：' + codeHits.join(', ') : 'content/ 全部为纯数据');

console.log('\n5) store.js 命名空间守卫');
{
  const src = fs.readFileSync(path.join(ROOT, 'app', 'store.js'), 'utf8');
  const ctx = { Error, console, exports: {} };
  const fn = src.match(/export function assertNamespace[\s\S]*?\n\}/);
  ok(!!fn, 'assertNamespace 已定义');
  if (fn) {
    const code = fn[0].replace('export ', 'globalThis.assertNamespace = ') + ';';
    try {
      vm.runInNewContext(code, { globalThis: ctx.globalThis || ctx, Error });
      const guard = (ctx.globalThis && ctx.globalThis.assertNamespace) || ctx.assertNamespace;
      let rejected = null;
      try { guard('mos_state_v14'); } catch (e) { rejected = e; }
      ok(!!rejected, '拒绝 MOS-DIS key：mos_state_v14 → ' + (rejected ? rejected.message.slice(0, 60) : '未抛错'));
      rejected = null;
      try { guard('mos_user'); } catch (e) { rejected = e; }
      ok(!!rejected, '拒绝 MOS-DIS key：mos_user');
      let accepted = null;
      try { accepted = guard('app_text_size'); } catch (e) { accepted = e; }
      ok(accepted === true, '允许自有 key（app_text_size）');
    } catch (e) {
      ok(false, 'assertNamespace 隔离执行失败：' + e.message);
    }
  }
}

console.log('\n6) 讲道音乐生产平台（MODULE 12 · V1.0）');
{
  const modulesSrc = fs.readFileSync(path.join(ROOT, 'app', 'modules.js'), 'utf8');
  ok(/key: 'production'/.test(modulesSrc), 'MODULE 12 已注册到模块表');
  ok(/production: m12/.test(modulesSrc), 'MODULE 12 已接入 RENDERERS 路由表');
  ok(!/nav: \['[^']*'\][^}]*key: 'production'/.test(modulesSrc), 'MODULE 12 不进底部导航（nav: null）');

  const swSrc2 = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  for (const f of ['app/discernment.js', 'app/production-rules.js', 'app/calibration.js',
    'app/production-console.js', 'content/production/index.json',
    'content/production/discernment-lexicon.json', 'content/production/library-usage.json',
    'content/production/calibration-issues.json', 'content/production/version-governance.json',
    'content/library/index.json', 'content/library/registry.json', 'content/library/v0.5-candidates.json',
    'content/production/theme-song-counts.json', 'content/production/song-scripture-index.json',
    'content/production/song-discernment-v0.5.json']) {
    ok(swSrc2.includes(f), `SW 预缓存包含 ${f}`);
  }

  const csSrc = fs.readFileSync(path.join(ROOT, 'app', 'content-source.js'), 'utf8');
  for (const k of ['production', 'lexicon', 'calibration', 'governance', 'usage',
    'library', 'theme_counts', 'song_scripture', 'song_discernment']) {
    ok(new RegExp(`'${k}'`).test(csSrc), `content-source 支持索引类型 ${k}`);
  }

  const prodIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/index.json'), 'utf8'));
  ok(prodIndex.platform_version === '3.2.0', '平台版本 3.2.0（V3.2）');
  ok(prodIndex.default_gate === 'human_review', '默认门为人工审核（批量不得绕过）');
  ok(Array.isArray(prodIndex.fixed_chain) && prodIndex.fixed_chain.length === 8, '闭环链条为 8 段');

  const gov = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/version-governance.json'), 'utf8'));
  ok(gov.frozen.skill_version === '1.0.0' && gov.frozen.skill_status === 'Frozen', '冻结技能版本为 1.0.0 / Frozen');
  ok(!(gov.proposed || []).some((p) => p.status === 'applied_to_frozen'), '不存在「直改 Frozen」提案记录');

  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/baseline-immutable.json'), 'utf8'));
  ok(!(baseline.immutable_scope || []).some((s) => /^content\/\*\*$/.test(s.trim())), 'N3 已修：baseline 作用域不含整个 content/**');
  ok(Object.keys(baseline.files || {}).length > 0
    && !Object.keys(baseline.files).some((f) => f.startsWith('content/production/')), '生产记录不在不可变基线内（可正常新增）');

  const issues = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/calibration-issues.json'), 'utf8'));
  const FIELDS = ['issue_id', 'date', 'week', 'song', 'category', 'description', 'evidence',
    'current_behavior', 'expected_behavior', 'severity', 'workaround', 'proposed_change', 'status', 'target_version'];
  ok(issues.issues.length > 0 && issues.issues.every((i) => FIELDS.every((f) => f in i)),
    `校准问题记录 ${issues.issues.length} 条，字段齐备`);

  const engineSrc = fs.readFileSync(path.join(ROOT, 'app', 'discernment.js'), 'utf8');
  ok(/PARITY_FIELDS/.test(engineSrc), '引擎声明与冻结技能的字段一致性清单（PARITY_FIELDS）');
  ok(!/MUS-S-\d{4}/.test(engineSrc), '引擎不含任何硬编码歌曲 ID（身份来自 content/）');

  const consoleSrc = fs.readFileSync(path.join(ROOT, 'app', 'production-console.js'), 'utf8');
  ok(!/writeFile|fs\.|require\(/.test(consoleSrc), '生产控制台为只读视图（不写任何文件）');
}

console.log('\n7) 曲库 V0.5 派生索引（CI-0014 案 a）');
{
  const li = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/library/index.json'), 'utf8'));
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/library/registry.json'), 'utf8'));
  const promo = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/library-promotions.json'), 'utf8'));
  const songsIdx = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/songs/index.json'), 'utf8'));
  const detailN = songsIdx.count;
  const regN = registry.records.length;
  const promoN = promo.promotions.length;
  ok(li.counts.total === detailN + regN - promoN && li.counts.detail_records === detailN
    && li.counts.intake_records === regN && li.counts.promoted_to_detail === promoN
    && li.counts.intake_pending_promotion === regN - promoN,
    `曲库合并口径：详情层 ${detailN} + 登记待升层 ${regN - promoN} = ${li.counts.total}`);
  ok(promo.promotions.length === promo.counts.promoted
    && promo.promotions.every((p) => p.detail_file && p.anchor && p.anchor.core_passage),
    `升层声明 ${promo.promotions.length} 条，逐条载明详情文件与经文锚点`);
  const det = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/song-anchor-determinations.json'), 'utf8'));
  ok(det.determinations.length === promo.promotions.length
    && det.determinations.every((d) => d.anchor_basis && d.verification.legal_status === 'not_determined'),
    '锚点认定留档与升层声明一一对应，且法律状态显式未判定（不据清单推定为公版）');
  ok(registry.records.length === 45, `入库登记记录 ${registry.records.length} 条（MUS-S-0006…0050）`);
  ok(registry.records.every((r) => r.copyright_status === 'SOURCE_REQUIRED'),
    '登记层版权一律 SOURCE_REQUIRED（不擅自改为 PUBLIC_DOMAIN）');
  ok(registry.records.every((r) => !('law_status' in r) && !('theological_risk' in r) && !('core_passage' in r)),
    '登记层不含任何辨识结论字段（只是登记，不是辨识）');

  const tc = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/theme-song-counts.json'), 'utf8'));
  ok(tc.derived === true && tc.themes.length === 24, `派生索引：主题歌曲计数 ${tc.themes.length} 项（derived=true）`);

  const ss = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/song-scripture-index.json'), 'utf8'));
  ok(ss.derived === true && ss.counts.total === detailN + regN - promoN
    && ss.counts.registered === detailN && ss.counts.pending === regN - promoN
    && ss.counts.promoted === promoN,
    `派生索引：经文锚点 ${ss.counts.total} 条（已登记 ${ss.counts.registered} / 待认定 ${ss.counts.pending}）`);

  const sd = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/song-discernment-v0.5.json'), 'utf8'));
  ok(sd.scope === 'library_scope' && sd.week_assignment === 'none',
    '库级辨识范围正确：library_scope 且不指定任何周次');
  ok(sd.results.length === regN && sd.results.every((r) => r.decision === 'Research'),
    `库级辨识：新增候选 ${sd.results.length} 首全部 Research（无周次上下文 → 不臆测；升层不使歌曲退出范围）`);
  ok(sd.counts.promoted_in_scope === promoN, `库级辨识范围含已升层 ${sd.counts.promoted_in_scope} 首（升层 ≠ 完成辨识）`);
  ok(sd.results.every((r) => r.song_relation === 'not_yet_assessed' && r.s6 === null && r.s7 === null),
    '库级辨识：Song_Relation / S6 / S7 一律不代填');

  const themes = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/themes/index.json'), 'utf8'));
  ok(themes.themes.every((t) => !('song_count' in t)),
    '案 a：上游主题索引不再承载 song_count（已移入派生索引）');

  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/baseline-immutable.json'), 'utf8'));
  ok(!Object.keys(baseline.files).some((f) => f.startsWith('content/production/')),
    '案 a：派生索引/生产记录不在不可变基线内（正常扩库不构成基线漂移）');
}

console.log('\n8) V1.1-A（真实使用第一轮：Song Detail / Song Resources / Week Music / Human Review）');
{
  /* --- Song Resources 层 --- */
  const res = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/song-resources/index.json'), 'utf8'));
  const RT = ['LYRICS', 'SCORE_LEAD', 'SCORE_SIMPLE', 'LEAD_VOCAL', 'ACCOMPANIMENT', 'RECORDING'];
  ok(res.resource_types.map((t) => t.type).join(',') === RT.join(','),
    '资源层：六类资源槽位定义正确（LYRICS/SCORE_LEAD/SCORE_SIMPLE/LEAD_VOCAL/ACCOMPANIMENT/RECORDING）');
  ok(res.counts.total === res.resources.length && res.counts.total > 0
    && res.resources.every((r) => r.is_ai !== true || ['AI_MALE', 'AI_FEMALE'].includes(r.source_type))
    && res.resources.every((r) => r.file_url == null || r.host_policy === 'hosted_authorized'),
    `资源层：当前 ${res.counts.total} 条资源记录（外部真人原站播放 / 生成钢琴本仓托管 / AI 独立轨，不虚构）`);
  ok(res.relation_to_song_core === 'independent_layer' && res.status_vocabulary.NOT_IMPORTED,
    '资源层独立于 Song Core Record；NOT_IMPORTED 为如实显示的状态词');
  ok(fs.existsSync(path.join(ROOT, 'content/schema/song-resource.schema.json')),
    '资源层 schema 存在（song-resource.schema.json）');
  ok(Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/baseline-immutable.json'), 'utf8')).files)
    .every((f) => !f.startsWith('content/song-resources/')),
    '资源层不在不可变基线内（Production Content）');

  /* --- Review Records 层 --- */
  const rr = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/review-records.json'), 'utf8'));
  ok(JSON.stringify(rr.decision_vocabulary) === JSON.stringify(['ACCEPT', 'REVISE', 'HOLD', 'REJECT']),
    '审查记录层：裁决词表 ACCEPT / REVISE / HOLD / REJECT');
  ok(rr.counts.total === rr.records.length && rr.records.length === 0,
    `审查记录层：当前 ${rr.counts.total} 条（试批 5 首 accepted_by_human 仍为 false，等人工验收）`);
  ok(rr.boundaries.some((b) => b.includes('不自动升层')) || rr.boundaries.some((b) => b.includes('不触发自动升层')),
    '审查记录层边界：ACCEPT 不自动改歌曲数据、不自动升层');
  ok(fs.existsSync(path.join(ROOT, 'content/schema/review-record.schema.json')),
    '审查记录层 schema 存在（review-record.schema.json）');

  /* --- 程序层接线 --- */
  const cs = fs.readFileSync(path.join(ROOT, 'app/content-source.js'), 'utf8');
  ok(cs.includes("song_resources: 'content/song-resources/index.json'")
    && cs.includes("review_records: 'content/production/review-records.json'")
    && cs.includes("registry: 'content/library/registry.json'"),
    'content-source：资源层 / 审查记录层 / 登记层索引已接线');
  ok(cs.includes("MUS-V-1.0.0"), 'content-source：内容版本 MUS-V-1.0.0');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  ok(sw.includes("CACHE = 'mos-music-v15'")
    && sw.includes('./app/song-detail.js') && sw.includes('./app/week-music.js')
    && sw.includes('./app/song-resources.js')
    && sw.includes('./content/song-resources/index.json')
    && sw.includes('./content/production/review-records.json'),
    'SW：预缓存后台程序与新索引');
  const modules = fs.readFileSync(path.join(ROOT, 'app/modules.js'), 'utf8');
  ok(modules.includes("key: 'song'") && modules.includes("key: 'week'"),
    '路由表：歌曲详情（#/song）与周音乐（#/week）模块已注册');
  const rules = fs.readFileSync(path.join(ROOT, 'app/production-rules.js'), 'utf8');
  ok(rules.includes("version: '3.1.0'") || rules.includes("version: '3.2.0'"), '平台版本声明存在（production-rules）');
  const consoleSrc = fs.readFileSync(path.join(ROOT, 'app/production-console.js'), 'utf8');
  ok(consoleSrc.includes("view === 'review'") && consoleSrc.includes("view === 'week'"),
    '生产控制台：人工审查视图与周音乐索引已接入');
  ok(consoleSrc.includes('真实使用仪表盘') && consoleSrc.includes('humanPending'),
    '生产总览：V1.1-A 七项核心指标（含 Human Review 待人工）');

  /* --- 展示层词汇（NOT_ASSESSED / NOT_IMPORTED / RESOURCE_PENDING） --- */
  const detail = fs.readFileSync(path.join(ROOT, 'app/song-detail.js'), 'utf8');
  ok(detail.includes('NOT_ASSESSED') && detail.includes('NOT_IMPORTED') && detail.includes('Anchor ≠ sermon selection'),
    'Song Detail：未辨识 NOT_ASSESSED / 未导入 NOT_IMPORTED / 锚点警示语齐备');
  const week = fs.readFileSync(path.join(ROOT, 'app/week-music.js'), 'utf8');
  ok(week.includes('RESOURCE_PENDING'),
    'Week Music：未导入资源显示 RESOURCE_PENDING');
  ok(week.includes('不会自动生产 W05'),
    'Week Music：不自动生产 W05（只读 W01–W04）');

  /* --- 生产索引计数 --- */
  const prod = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/index.json'), 'utf8'));
  ok(prod.counts.song_resource_records === res.counts.total
    && prod.counts.review_records === rr.counts.total,
    '生产索引：资源层与审查记录层计数一致');
  ok(prod.platform_version === '3.2.0' && prod.index_version === 'MUS-V-1.1.0',
    '生产索引：platform 3.2.0 / MUS-V-1.1.0');

  /* =========================================================
     9) V2.0：候选库 / 前台结构（MOS 生命诗歌软件）
  ========================================================= */
  const cand = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/candidates/index.json'), 'utf8'));
  ok(cand.candidates && cand.candidates.length === 100, 'V2.0 候选库：100 条候选记录');
  ok(cand.candidates.every((c) => c.discernment_status === 'NOT_YET_ASSESSED'),
    'V2.0 候选库：全部 NOT_YET_ASSESSED（不携带辨识结论）');
  ok(cand.candidates.every((c) => c.copyright_status === 'SOURCE_REQUIRED'),
    'V2.0 候选库：全部 SOURCE_REQUIRED（不产生法律状态结论）');
  ok(cand.candidates.every((c) => c.front_tags && c.front_tags.tags_status === 'provisional_intake_classification'),
    'V2.0 候选库：主题/场景为录入期初分类（provisional）');
  ok(!('score' in cand.candidates[0]) && !('rank' in cand.candidates[0]) && !('rating' in cand.candidates[0]),
    'V2.0 候选库：无 score/rank/rating 字段（CSV 行序不构成推荐排序）');
  ok((cand.themes || []).length === 13 && (cand.scenes || []).length === 7,
    'V2.0 候选库：主题词表 13 / 场景词表 7（词表在内容层，不在程序层）');
  const storeSrc = fs.readFileSync(path.join(ROOT, 'app/store.js'), 'utf8');
  ok(storeSrc.includes('my_songs') && /DB_VERSION = 4/.test(storeSrc),
    'V2.0 我的歌：my_songs 用户 store + DB_VERSION 4（V3.x 增 coach_sessions）');
  const frontNav = fs.readFileSync(path.join(ROOT, 'app/modules.js'), 'utf8');
  ok(frontNav.includes("key: 'home'") && frontNav.includes("key: 'songs'") && frontNav.includes("key: 'mine'")
    && frontNav.includes("home: f1") && frontNav.includes("teach: f6"),
    'V2.0 前台：三入口导航 + 歌曲页/学唱/教唱路由已注册');
  for (const f of ['home', 'songbook', 'mine', 'song-page', 'learn', 'teach']) {
    ok(fs.existsSync(path.join(ROOT, 'app/front', f + '.js')), `V2.0 前台模块存在：app/front/${f}.js`);
  }
  ok(sw.includes('./app/front/home.js') && sw.includes('./app/front/teach.js')
    && sw.includes('./content/candidates/index.json'),
    'SW v10：前台模块与候选索引已预缓存');
  ok(sw.includes('./app/front/covers.js') && sw.includes('./app/ui/v21.css'),
    'V2.1 SW：封面系统与设计系统层已预缓存');
  const v21css = fs.readFileSync(path.join(ROOT, 'app/ui/v21.css'), 'utf8');
  ok(v21css.includes('data-mood="night"') && v21css.includes('--fs-lyric'),
    'V2.1 设计系统：深夜沉浸模式 + 歌词字阶');
  const idxHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(idxHtml.includes('app/ui/v21.css') && idxHtml.includes('moodBtn'),
    'V2.1 外壳：设计系统层已引入 + 深夜模式按钮');
  ok(!idxHtml.includes('localStorage'), 'V2.1 外壳：不使用 localStorage（一律 IndexedDB）');
  const coversSrc = fs.readFileSync(path.join(ROOT, 'app/front/covers.js'), 'utf8');
  ok(coversSrc.includes('aria-hidden') && coversSrc.includes('langIndexOf'),
    'V2.1 封面：装饰性 SVG + 主题词表索引驱动（程序零主题词）');
  const shellSrc = fs.readFileSync(path.join(ROOT, 'app/shell.js'), 'utf8');
  ok(shellSrc.includes("key: 'mood'") && shellSrc.includes("data-mood"),
    'V2.1 深夜模式：偏好经 IndexedDB user_prefs 持久化');
  const playerSrc = fs.readFileSync(path.join(ROOT, 'app/front/player.js'), 'utf8');
  ok(playerSrc.includes('playbackRate') && playerSrc.includes('0.75') && playerSrc.includes('loop'),
    'V2.0 播放器：真实速度（0.5/0.75/1.0）与循环控制');
  ok(playerSrc.includes('不假装播放') || fs.readFileSync(path.join(ROOT, 'app/front/song-page.js'), 'utf8').includes('不假装播放'),
    'V2.0 播放器：无资源时不假装播放（尚未提供）');
}

console.log('\n10) V3.0：单曲完整歌曲单元 / 简谱 / 光标 / 教学法');
{
  const uidx = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/song-units/index.json'), 'utf8'));
  ok(uidx.units_version === 'MUS-V-1.1.0', 'V3.2 单元词表：MUS-V-1.1.0');
  ok((uidx.sections || []).length === 18, 'V3.0 单元词表：18 段模型');
  ok(JSON.stringify((uidx.completion_levels || []).map((l) => l.key)) === JSON.stringify(['NONE', 'L1', 'L2', 'L3', 'L4']),
    'V3.0 单元词表：完成等级 NONE/L1/L2/L3/L4');
  ok((uidx.production_states || []).length === 11, 'V3.0 单元词表：生产状态 11 态');
  ok((uidx.teaching_method || {}).steps && uidx.teaching_method.steps.length === 10,
    'V3.0 教学法：十步法 10 步');
  ok(JSON.stringify(((uidx.teaching_method || {}).modes || []).map((m) => m.key)) === JSON.stringify(['learn', 'sight', 'teach']),
    'V3.0 教学法：三模式 learn/sight/teach');
  ok(((uidx.teaching_method.modes || []).find((m) => m.key === 'sight') || {}).gives_full_demo_first === false,
    'V3.0 视唱模式：默认不先给完整示范');
  ok((uidx.learner_stages || []).length === 4 && (uidx.review_cycle || []).length === 3,
    'V3.0 学习状态：四级 + Day 0/2/7 间隔复习');
  ok(uidx.resource_absent_text === '尚未提供', 'V3.0 缺失用语统一为「尚未提供」');
  ok(!/level"\s*:/.test(fs.readFileSync(path.join(ROOT, 'content/song-units/MUS-SU-0001.json'), 'utf8')),
    'V3.0 单元记录：不写派生等级字段（由 app/song-unit.js 推导）');

  /* 单元包：18 段齐备 + 未提供一律 NOT_PROVIDED/空载荷 */
  const u1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/song-units/MUS-SU-0001.json'), 'utf8'));
  ok(u1.unit_id === 'MUS-SU-0001' && u1.song_id === 'MUS-S-0001' && u1.status === 'VERIFYING',
    'V3.0 单元包：身份与 status=VERIFYING（PILOT 10 已有真实载荷进入生产）');
  ok(u1.demos.male.status === 'PROVIDED' && u1.demos.male.source_type === 'EXTERNAL_HUMAN_MALE'
    && u1.demos.male.singer === null && u1.demos.male.host_policy === 'original_site'
    && u1.demos.female.status === 'PROVIDED' && u1.demos.female.source_type === 'EXTERNAL_HUMAN_FEMALE'
    && u1.piano.status === 'PROVIDED' && u1.timeline.status === 'PROVIDED'
    && (u1.demos.ai_male == null || u1.demos.ai_male.is_ai === true)
    && (u1.demos.ai_female == null || u1.demos.ai_female.is_ai === true),
    'V3.2 单元包：外部真人示唱原站播放（singer=null，不冒充）+ 生成钢琴 + 精确时间轴；AI 只在独立轨');
  ok((u1.content_understanding.note || '').includes('不绑定某一周'),
    'V3.0 单元包：内容理解不绑定周次（淡化 52 周关联）');
  ok((u1.rights.copyright_status === 'public_domain') && u1.rights.derived_from,
    'V3.0 单元包：版权沿用详情层法律状态并标注来源（ADR-0012）');

  /* 派生等级表 */
  const lv = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/song-unit-levels.json'), 'utf8'));
  ok(lv.derived === true && lv.counts.library_total === 50
    && lv.counts.by_level.NONE === 47 && lv.counts.by_level.L3 === 3,
    'V3.2 派生表：50 首中 47 首 NONE + 3 首 L3（0001/0002/0004 原谱导入样板；L4 真人项待人工）');
  ok(fs.existsSync(path.join(ROOT, 'content/schema/song-unit.schema.json')),
    'V3.0 schema：song-unit.schema.json 存在');

  /* 程序层：机械判定 / 简谱渲染 / 光标 / 节拍器 / 学习状态 */
  const sunit = fs.readFileSync(path.join(ROOT, 'app/song-unit.js'), 'utf8');
  ok(sunit.includes('deriveLevel') && sunit.includes('statusConsistent') && sunit.includes('missingAll'),
    'V3.0 程序：单元机械判定（等级派生 / 状态一致性 / 缺口）');
  const scoreSrc = fs.readFileSync(path.join(ROOT, 'app/front/score.js'), 'utf8');
  ok(scoreSrc.includes('renderScoreHtml') && scoreSrc.includes('renderScoreAbsentHtml'),
    'V3.0 简谱：渲染 + 未提供如实分支');
  ok(scoreSrc.includes('measure_basis') && scoreSrc.includes("'phrase_range'") && scoreSrc.includes('findIndex'),
    'V3.0 光标：只按真实时间标记，不按比例猜（不插值）');
  const reviewSrc = fs.readFileSync(path.join(ROOT, 'app/front/review.js'), 'utf8');
  ok(reviewSrc.includes('markStage') && reviewSrc.includes('dueState') && reviewSrc.includes('只增不减'),
    'V3.0 学习状态：四级只增不减 + 间隔复习到期判定');
  ok(!/rank|leaderboard/.test(reviewSrc), 'V3.0 学习状态：不含排行榜');
  const pulseSrc = fs.readFileSync(path.join(ROOT, 'app/front/pulse.js'), 'utf8');
  ok(pulseSrc.includes('createMetronome') && pulseSrc.includes('available: Boolean(Ctx)'),
    'V3.0 节拍器：真实发声，无音频环境如实不可用');
  const spSrc = fs.readFileSync(path.join(ROOT, 'app/front/song-page.js'), 'utf8');
  ok(spSrc.includes('sp-score-card') && spSrc.includes('renderScoreHtml'),
    'V3.0 歌曲页：简谱整幅置于显眼位置（乐谱最明显）');
  ok(spSrc.includes('不绑定某一周') || spSrc.includes('不指定你必须在什么时候唱'),
    'V3.0 歌曲页：明确不绑定周次 / 不指定何时唱');
  ok(spSrc.includes('钢琴'), 'V3.0 歌曲页：伴奏只提供钢琴');
  const learnSrc = fs.readFileSync(path.join(ROOT, 'app/front/learn.js'), 'utf8');
  ok(learnSrc.includes('teaching_method') && learnSrc.includes('modes'),
    'V3.0 学唱页：步骤与模式取自内容层词表（不硬编码）');
  const teachSrc = fs.readFileSync(path.join(ROOT, 'app/front/teach.js'), 'utf8');
  ok(teachSrc.includes('教谱要点') && teachSrc.includes('教词要点') && teachSrc.includes('声乐提示'),
    'V3.0 教唱页：教谱 / 教词 / 声乐提示与真人教唱模块');
  const homeSrc = fs.readFileSync(path.join(ROOT, 'app/front/home.js'), 'utf8');
  ok(homeSrc.includes('现在唱') && homeSrc.includes('继续学'),
    'V3.1 首页：现在唱 + 继续学（减法版，无仪表盘）');
  ok(!/mos_week|已人工确认的样本周/.test(homeSrc), 'V3.0 首页：不再引用周次 / 样本周');
  const mineSrc = fs.readFileSync(path.join(ROOT, 'app/front/mine.js'), 'utf8');
  ok(mineSrc.includes('stageCounts') && mineSrc.includes('学习路径状态'),
    'V3.0 我的页：四级学习状态分布（不做排名）');
  const mySrc = fs.readFileSync(path.join(ROOT, 'app/front/my-songs.js'), 'utf8');
  ok(mySrc.includes('setStage') && mySrc.includes('setReview') && mySrc.includes('stageCounts'),
    'V3.0 用户层：四级状态与间隔复习本地持久化');
  const sw3 = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  ok(sw3.includes('./app/front/score.js') && sw3.includes('./app/front/review.js')
    && sw3.includes('./app/front/pulse.js') && sw3.includes('./app/ui/v30.css')
    && sw3.includes('./content/song-units/index.json'),
    'V3.0 SW v10：单元 / 简谱 / 学习状态 / 节拍器 / 样式层已预缓存');
  const v30css = fs.readFileSync(path.join(ROOT, 'app/ui/v30.css'), 'utf8');
  ok(v30css.includes('.score') && v30css.includes('.note[data-now]') && v30css.includes('.beat-dots'),
    'V3.0 样式层：简谱 / 光标高亮 / 节拍器');
  ok(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').includes('app/ui/v30.css'),
    'V3.0 外壳：v30.css 已引入');
  const ws = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/song-worksheets.json'), 'utf8'));
  ok(ws.derived === true && ws.worksheets_version === 'MUS-V-1.0.0'
    && (ws.steps_vocabulary || []).length === 16 && (ws.worksheets || []).length === 10,
    'V3.0 工作单：STEP00–15 共 16 步 / 10 首 / derived=true');
  ok((ws.worksheets || []).every((w) => w.release && w.release.signed_by === null),
    'V3.0 工作单：不代人签核（signed_by 全为 null）');
  ok(fs.existsSync(path.join(ROOT, 'tools/song-worksheet.js')) && fs.existsSync(path.join(ROOT, 'tools/song-units.js')),
    'V3.0 工具链：单曲单元构建与工作单生成工具齐备');

  /* ---- PILOT 10：生产工作包（SONG PRODUCTION PILOT 10） ---- */
  const pkgIdx = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/packages/index.json'), 'utf8'));
  ok((pkgIdx.slots || []).length === 9 && (pkgIdx.sample.order || []).length === 5 && (pkgIdx.sample.blocked || []).length === 5,
    'PILOT 10 包索引：9 槽位 / 样板顺序 5 首 / 阻断 5 首');
  const SAMPLE_ROLES = ['A', 'B', 'C', 'D', 'E'];
  ok(JSON.stringify((pkgIdx.sample.order || []).map((o) => o.role)) === JSON.stringify(SAMPLE_ROLES),
    'PILOT 10 样板：A–E 角色齐备（生产顺序选择，不改研究状态）');
  for (let i = 1; i <= 10; i++) {
    const sid = 'MUS-S-' + String(i).padStart(4, '0');
    const base = path.join(ROOT, 'content/production/packages', sid);
    for (const f of ['manifest.json', 'metadata.json', 'lyrics.json', 'score.json', 'audio.json', 'timeline.json', 'teaching.json', 'content.json', 'rights.json', `MOS-SU-${sid.slice(-4)}_WORKSHEET.md`]) {
      ok(fs.existsSync(path.join(base, f)), `PILOT 10 工作包：${sid}/${f} 存在`);
    }
  }
  const pkg1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/packages/MUS-S-0001/lyrics.json'), 'utf8'));
  ok((pkg1.sections || []).length === 6 && pkg1.proofread.status === 'PENDING' && pkg1.rights.copyright_status === 'public_domain',
    'PILOT 10 歌词：0001 六节公版英文（proofread PENDING / public_domain）');
  const pkg9 = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/packages/MUS-S-0009/rights.json'), 'utf8'));
  ok(pkg9.legal.copyright_status === 'unknown' && pkg9.hosting.lyrics_en.status === 'NOT_AVAILABLE',
    'PILOT 10 权利：0009 未判定 ⇒ 英文歌词也不托管（不推定）');
  const pkg9mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/packages/MUS-S-0009/manifest.json'), 'utf8'));
  ok(pkg9mf.blocked === true && pkg9mf.slots.audio.status === 'NOT_AVAILABLE' && pkg9mf.slots.timeline.sync_status === 'SYNC_NOT_READY',
    'PILOT 10 阻断：0009 blocked / 音频 NOT_AVAILABLE / 时间轴 SYNC_NOT_READY');
  const su1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/song-units/MUS-SU-0001.json'), 'utf8'));
  ok(su1.status === 'VERIFYING' && su1.lyrics.status === 'PROVIDED' && su1.lyrics.sections.length === 6
    && su1.score.status === 'PROVIDED' && String(su1.score.note).includes('PENDING'),
    'V3.2 样板单元：0001 VERIFYING + 歌词结构化入单元 + 原谱导入谱面计入（SOURCE_IMPORTED，听校 PENDING）');
  const sc1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/packages/MUS-S-0001/score.json'), 'utf8'));
  ok(sc1.transcription.status === 'SOURCE_IMPORTED' && Array.isArray(sc1.transcription.verified_measures)
    && sc1.transcription.verified_measures.length === 17 && (sc1.sections[0].measures || []).length === 17
    && sc1.transcription.proofread.status === 'PENDING',
    'V3.2 样板简谱：0001 原谱导入 17 小节（忠实 Open Hymnal X:192 / 人工听校 PENDING）');
  const pkg5 = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/packages/MUS-S-0005/lyrics.json'), 'utf8'));
  ok((pkg5.sections || []).some((s) => s.section_id === 'refrain'),
    'PILOT 10 结构覆盖：0005 重复副歌（refrain 独立成节）');
  const lv2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/song-unit-levels.json'), 'utf8'));
  ok(lv2.counts.by_level.NONE === 47 && lv2.units[0].level === 'L3',
    'V3.2 等级：47 NONE + 3 L3（派生结果；L4 的真人项不得由工具代写）');
  ok(sw3.includes('./content/production/packages/MUS-S-0001/score.json'),
    'SW v13：生产工作包预缓存');

  /* ---- V3.x：独立定位 / 四维分类 / 内容层 / 资源模型 / Singing Coach / 资源普查 ---- */
  const taxIdx = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/taxonomy/index.json'), 'utf8'));
  ok((taxIdx.dimensions || []).length === 4
    && ['theme', 'situation', 'scene', 'music'].every((k) => taxIdx.dimensions.some((d) => (d.key || d.id) === k)),
    'V3.x 分类：四维词表（主题/处境/场景/音乐）');
  ok((taxIdx.principles || []).some((p) => p.includes('帮助用户找到歌曲'))
    && (taxIdx.principles || []).some((p) => p.includes('同时出现在多个分类')),
    'V3.x 分类：定位是「帮助找到歌曲」+ 允许一首歌多归属');
  const taxAssign = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/taxonomy/assignments.json'), 'utf8'));
  ok(taxAssign.counts.songs_total === 100 && taxAssign.assignments.length === 100,
    'V3.x 分类：100 首逐首分词（全部落表）');
  ok(taxAssign.assignments.every((r) => r.dimensions && Array.isArray(r.dimensions.theme)
    && Array.isArray(r.dimensions.scene) && r.note && 'gaps' in r),
    'V3.x 分类：每首四维都是集合（不单选）+ gaps 如实留空');
  ok(taxAssign.assignments.some((r) => (r.dimensions.theme.length + r.dimensions.situation.length
    + r.dimensions.scene.length) > 1),
    'V3.x 分类：存在多归属歌曲（分类不是身份）');
  const scIdx = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/song-content/index.json'), 'utf8'));
  ok((scIdx.field_keys || []).length === 6,
    'V3.x 内容层：六字段（meaning/scripture/background/reflection/practice/prayer）');
  const sc1c = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/song-content/MUS-S-0001.json'), 'utf8'));
  ok(!/W0\d/.test(JSON.stringify(sc1c)) && sc1c.scope_note.includes('不来自任何周次或课程'),
    'V3.x 内容层：不绑定周次 / 课程（内容属于歌曲本身）');
  ok(sc1c.scripture.status === 'PROVIDED' && sc1c.scripture.text === null
    && Array.isArray(sc1c.scripture.reference_ids),
    'V3.x 内容层：经文只存引用与 ID（不托管译本全文，ADR-0005）');
  ok(sc1c.meaning.status === 'NOT_AVAILABLE' && sc1c.meaning.text === null,
    'V3.x 内容层：缺失即如实 NOT_AVAILABLE（不代写）');
  const unitSchema = fs.readFileSync(path.join(ROOT, 'content/schema/song-unit.schema.json'), 'utf8');
  ok(unitSchema.includes('"ai_male"') && unitSchema.includes('"ai_female"')
    && unitSchema.includes('EXTERNAL_HUMAN_MALE') && unitSchema.includes('EXTERNAL_HUMAN_FEMALE')
    && unitSchema.includes('"expression_reference"'),
    'V3.x 资源模型：AI 独立轨 + 外部真人类型 + expression_reference 预留');
  const resSchema = fs.readFileSync(path.join(ROOT, 'content/schema/song-resource.schema.json'), 'utf8');
  ok(resSchema.includes('"source_url"') && resSchema.includes('"phrase_id"')
    && resSchema.includes('"start"') && resSchema.includes('"end"') && resSchema.includes('"source_type"'),
    'V3.x 资源模型：外部真人分段字段（source_url / start / end / phrase_id / source_type）');
  const rsIdx = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/song-resources/index.json'), 'utf8'));
  ok(JSON.stringify(rsIdx).includes('EXTERNAL_HUMAN_MALE') || JSON.stringify(rsIdx).includes('REUSE'),
    'V3.x 资源策略：Reuse First（原站播放 / 嵌入 / 时间段定位，不下载转存）');
  const coach = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/coach/index.json'), 'utf8'));
  ok((coach.capabilities || []).length === 10 && coach.counts.capabilities === 10,
    'V3.x 教练：十项核心能力模型');
  ok(coach.independence && (coach.independence.does_not_read || []).length >= 4
    && coach.independence.does_not_read.some((x) => x.includes('门训')),
    'V3.x 教练：与门训系统完全独立（不读课程完成度 / 积分 / 成绩）');
  ok((coach.training_item_model && (coach.training_item_model.starter_items || []).length === 10)
    && coach.counts.produced_items === 0,
    'V3.x 教练：训练项目 MODEL_ONLY（10 项结构，成品 0 —— 不假装有内容）');
  ok(coach.interfaces.audio_upload.status === 'RESERVED_NOT_CONNECTED'
    && coach.interfaces.ai_analysis.status === 'RESERVED_NOT_CONNECTED',
    'V3.x 教练：音频上传与 AI 分析接口仅预留（未接入不假装）');
  const fb = JSON.stringify(coach.feedback_structure);
  ok(fb.includes('descriptor') && fb.includes('再唱一次') && fb.includes('属灵评分'),
    'V3.x 教练：反馈是描述式并收在「再唱一次」；明列禁止属灵评分 / 排名');
  const disc = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/production/resource-discovery.json'), 'utf8'));
  ok(disc.rows.length === 100 && disc.counts.songs_total === 100,
    'V3.x 普查：100 首逐首落表');
  ok((disc.output_columns || []).length === 11,
    'V3.x 普查：十一列出表（Song…Next Action，含 Rights/Source）');
  ok(disc.rows.every((r) => r.found && r.found.human_male && r.found.human_female
    && r.found.ai_male && r.found.ai_female && r.found.piano && r.found.teaching
    && r.next_action),
    'V3.x 普查：每首含 真人男/真人女/AI男/AI女/钢琴/教学 六类 + 下一步');
  ok(disc.rows.every((r) => r.found.human_male.status === 'UNSURVEYED' && r.found.human_male.source_url === null),
    'V3.x 普查：外部检索未执行 ⇒ UNSURVEYED、来源留空（不虚构）');
  ok(disc.rows.every((r) => r.found.ai_male.status === 'NOT_FOUND' && r.found.ai_male.source_url === null),
    'V3.x 普查：AI 类型就位但无成品（NOT_FOUND，不冒充）');
  ok(disc.counts.needs_mos_creation === 5 && disc.counts.human_unsurveyed === 100,
    'V3.x 普查：真正需要 MOS 自制 5 首；真人/钢琴/教学全部待检索');
  const guardSrc = fs.readFileSync(path.join(ROOT, 'tools/guard.js'), 'utf8');
  ok(guardSrc.includes('前台') && guardSrc.includes('AI') && guardSrc.includes('Coach'),
    'V3.x 守护：guard.js 就绪（前台术语 / AI 冒充 / Coach 越界 / 分类多归属）');
  ok(require('child_process').execSync('node tools/guard.js', { cwd: ROOT }).toString().includes('violations=0'),
    'V3.x 守护：边界检查通过（violations=0）');
  const csSrc = fs.readFileSync(path.join(ROOT, 'app/content-source.js'), 'utf8');
  ok(csSrc.includes("MUS-V-1.0.0") && csSrc.includes("'taxonomy'") && csSrc.includes("'coach'")
    && csSrc.includes("'resource_discovery'"),
    'V3.x 内容源：MUS-V-1.0.0 + 分类/教练/普查索引已注册');
}

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAIL'}  ${passed} 通过 / ${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
