#!/usr/bin/env node
/* =========================================================
   MOS-MUSIC｜Phrase Cards 门禁测试（Node，零依赖）
   ---------------------------------------------------------
   验收五首样板歌曲乐句卡前台接入的硬门禁（数据层 = content/teaching，
   schema = content/schema/teaching-pack.schema.json）：
     D) phrase 数量核对（18 / 13 / 9 / 13 / 13，共 66）
     E) time_status 门禁（非 VERIFIED 一律禁止 cursor-follow）
     F) recording 防混用（start/end 只属于同一录音 recording_id）
     G) performer 防误标（CANDIDATE / UNNAMED 不得显示姓名；
        difficulty=null 保持 null）
     H) coach 白名单（只许六个音乐参数；禁止属灵 / 真诚度评分）
     + 前台接线静态检查（UI 必须经门禁函数，不得绕过）

   用法：node tests/phrase-cards.test.js    退出码 0 = 全部通过
   ========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;
function ok(cond, label, detail) {
  if (cond) { passed += 1; console.log('  PASS  ' + label); }
  else { failed += 1; console.error('  FAIL  ' + label + (detail ? '  —— ' + detail : '')); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const EXPECT = [
  ['MUS-S-0001', 18, 'REFERENCE_ONLY'],
  ['MUS-S-0002', 13, null], /* 混合：1 张 TIME_PENDING */
  ['MUS-S-0003', 9, 'TIME_PENDING'],
  ['MUS-S-0004', 13, null],
  ['MUS-S-0005', 13, null],
];

const BANNED_CONTENT_KEYS = [
  'spiritual_score', 'worship_score', 'sincerity_score', 'spiritual_level',
  'formation_score', 'devotion_score', 'score', 'rating', 'stars', 'rank',
];

/* ---------------------------------------------------------------- 主流程 */

async function main() {
  const pc = await import(pathToFileURL(path.join(ROOT, 'app/phrase-cards.js')).href);

  const idxPath = path.join(ROOT, 'content/teaching/index.json');
  ok(fs.existsSync(idxPath), '教学包索引存在 content/teaching/index.json');
  const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
  ok(idx.teaching_version === 'MUS-V-1.2.0', 'teaching_version = MUS-V-1.2.0', idx.teaching_version);

  const packs = [];
  for (const e of idx.packs) {
    const p = path.join(ROOT, e.file);
    ok(fs.existsSync(p), `包文件存在 ${e.song_id}`);
    packs.push(JSON.parse(fs.readFileSync(p, 'utf8')));
  }
  const allCards = packs.flatMap((d) => d.phrase_cards);

  /* -------- D) phrase 数量核对 -------- */
  console.log('\nD) phrase 数量核对');
  for (let i = 0; i < EXPECT.length; i += 1) {
    const [sid, n] = EXPECT[i];
    const d = packs[i];
    ok(d.song_id === sid, `${sid} 主键正确`, d.song_id);
    ok(d.phrase_cards.length === n, `${sid} 卡数 = ${n}`, String(d.phrase_cards.length));
    const labels = d.phrase_cards.map((c) => c.card_label);
    ok(new Set(labels).size === n, `${sid} card_label 不重复`);
    ok(d.phrase_cards.every((c) => /^MUS-S-\d{4}-TC-\d{2}$/.test(c.phrase_id)), `${sid} phrase_id 格式统一`);
  }
  ok(allCards.length === 66, '全量卡数 = 66', String(allCards.length));
  ok(eq(EXPECT.map(([sid, n]) => [sid, n]), idx.packs.map((e) => [e.song_id, e.cards])),
    '索引与各包卡数一致（18/13/9/13/13）');
  ok(packs.every((d) => !/MUS-C-\d|W\d{2}\b|52W/.test(JSON.stringify(d.phrase_cards))),
    '乐句卡不引用周次 / 课程（独立性）');

  /* -------- E) time_status 门禁 -------- */
  console.log('\nE) time_status 门禁（cursor-follow）');
  const blocked = allCards.filter((c) => !pc.cursorAllowed(c));
  ok(blocked.length === 66, '当前 66 张卡全部禁止 cursor-follow（未核实 / 未绑定）');
  /* 镜像 validator 规则：cursor_ready ⇔ timecode.time_status === VERIFIED */
  ok(allCards.every((c) => c.cursor_ready === ((c.timecode || {}).time_status === 'VERIFIED')),
    '全部卡片满足 cursor_ready ⇔ time_status=VERIFIED');
  const statuses = new Set(allCards.map((c) => (c.timecode || {}).time_status));
  ok(!statuses.has('VERIFIED'), '当前没有任何 VERIFIED 时间码（真实待人工听校）', [...statuses].join(','));
  const gateMatrix = [
    [{ cursor_ready: true, timecode: { recording_id: 'R1', start: 1, end: 2, time_status: 'VERIFIED' } }, true, 'cursor_ready + VERIFIED + 绑定录音 → 允许'],
    [{ cursor_ready: false, timecode: { recording_id: 'R1', start: 1, end: 2, time_status: 'REFERENCE_ONLY' } }, false, 'REFERENCE_ONLY → 禁止'],
    [{ cursor_ready: false, timecode: { recording_id: 'R1', start: 1, end: 2, time_status: 'TIME_PENDING' } }, false, 'TIME_PENDING → 禁止'],
    [{ cursor_ready: true, timecode: { recording_id: 'R1', start: 1, end: 2, time_status: 'TIME_PENDING' } }, false, 'cursor_ready 与 VERIFIED 不一致 → 禁止'],
    [{ cursor_ready: true, timecode: null }, false, '无 timecode → 禁止'],
    [{ cursor_ready: true, timecode: { recording_id: null, start: 1, end: 2, time_status: 'VERIFIED' } }, false, '未绑定录音 → 禁止'],
    [{ cursor_ready: false, timecode: null }, false, '空卡 → 禁止'],
  ];
  for (const [card, want, label] of gateMatrix) ok(pc.cursorAllowed(card) === want, label);
  ok(allCards.every((c) => ['VERIFIED', 'REFERENCE_ONLY', 'TIME_PENDING'].includes((c.timecode || {}).time_status) || c.timecode == null),
    'time_status 只能是三态枚举或无 timecode');

  /* -------- F) recording 防混用 -------- */
  console.log('\nF) recording 防混用（单句循环窗口绑定）');
  const verified = { cursor_ready: true, timecode: { recording_id: 'R1', start: 40.16, end: 45.39, time_status: 'VERIFIED' } };
  ok(pc.loopWindowFor({ ...verified, timecode: { ...verified.timecode, recording_id: null } }, 'R1') === null,
    '未绑定录音 → 不产生循环窗口');
  ok(pc.loopWindowFor({ ...verified, timecode: { ...verified.timecode, recording_id: 'R2' } }, 'R1') === null,
    '录音版本不同 → 不产生循环窗口（绝不混用）');
  ok(pc.loopWindowFor({ cursor_ready: false, timecode: { recording_id: 'R1', start: 40.16, end: 45.39, time_status: 'REFERENCE_ONLY' } }, 'R1') === null,
    'REFERENCE_ONLY + 同录音 → 仍不产生自动循环窗口');
  ok(eq(pc.loopWindowFor(verified, 'R1'), { start: 40.16, end: 45.39 }),
    '全条件满足 → 窗口 = {40.16, 45.39}');
  ok(pc.loopWindowFor({ ...verified, timecode: { ...verified.timecode, start: null, end: null } }, 'R1') === null,
    'start/end 非数值 → 不产生窗口（不猜）');
  ok(allCards.every((c) => !c.timecode || typeof c.timecode.recording_id === 'string'),
    '每张卡单一录音绑定（timecode.recording_id 必填）');

  /* -------- G) performer 防误标 + difficulty=null -------- */
  console.log('\nG) performer 防误标 / difficulty=null 保持');
  const named = allCards.filter((c) => (c.vocal_reference || {}).performer);
  ok(named.length > 0, `存在带姓名的候选示唱卡（${named.length} 张）—— 前台一律不得显示`);
  ok(allCards.every((c) => !pc.performerConfirmed(c)), '候选（CANDIDATE）状态一律判为未确认');
  ok(allCards.every((c) => pc.performerDisplay(c).name == null),
    '当前任何卡的前台演唱者显示名都为空（显示「待确认」）');
  ok(eq(pc.performerDisplay({ vocal_reference: { status: 'SELECTED', identity_status: 'NAMED_SOURCE', performer: '某人' } }),
    { name: '某人', confirmed: true }), 'SELECTED + NAMED_SOURCE + 有姓名 → 才显示');
  ok(pc.performerDisplay({ vocal_reference: { status: 'SELECTED', identity_status: 'UNNAMED_SOURCE', performer: null } }).confirmed === false,
    'UNNAMED_SOURCE 永远不显示姓名');
  ok(allCards.every((c) => c.difficulty == null), 'difficulty 全部保持 null（程序不评分）');
  for (const d of packs) {
    const raw = JSON.stringify(d.phrase_cards);
    for (const k of BANNED_CONTENT_KEYS) {
      ok(!raw.includes(`"${k}"`), `${d.song_id} 乐句卡无违规评分字段 ${k}`);
    }
  }

  /* -------- H) coach 白名单 -------- */
  console.log('\nH) coach_scope 白名单（音乐维度）');
  for (const d of packs) {
    ok(eq((d.coach_scope.allowed_params || []).slice().sort(),
      ['diction', 'dynamics', 'expression', 'pitch', 'rhythm', 'sustain']),
      `${d.song_id} coach_scope.allowed_params 恰为六个音乐参数`);
    ok(d.coach_scope.forbidden.includes('属灵程度评分') && d.coach_scope.forbidden.includes('敬拜真诚度评分'),
      `${d.song_id} coach_scope.forbidden 明确禁止属灵 / 真诚度评分`);
    ok(pc.coachScopeOf(d).every((x) => !/属灵|敬拜|真诚/.test(x)), `${d.song_id} 前台教练维度无属灵词`);
  }
  ok(pc.coachForbiddenOf(packs[0]).length >= 4, '禁项列表完整保留（不删边界）');

  /* -------- 前台接线静态检查（UI 必须经门禁，不得绕过） -------- */
  console.log('\n前台接线静态检查');
  const uiSrc = fs.readFileSync(path.join(ROOT, 'app/front/phrase-card.js'), 'utf8');
  ok(uiSrc.includes('pc.loopWindowFor') && uiSrc.includes('pc.timeStateOf') && uiSrc.includes('pc.performerDisplay'),
    '乐句卡 UI 经 loopWindowFor / timeStateOf / performerDisplay 渲染');
  for (const f of ['app/front/song-page.js', 'app/front/learn.js', 'app/front/teach.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    ok(src.includes('mountPhraseCards'), `${f} 接入乐句卡组件`);
    ok(src.includes("'../phrase-cards.js'") && src.includes('loadTeachingPack'), `${f} 从门禁层取数`);
    ok(src.includes('activeRecordingId: null'), `${f} 显式声明当前播放轨道无录音绑定（门禁如实不放行）`);
  }
  const registered = fs.readFileSync(path.join(ROOT, 'app/content-source.js'), 'utf8');
  ok(registered.includes("'teaching'") && registered.includes('content/teaching/index.json'),
    'content-source 已注册 teaching 索引');
  const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  ok(swSrc.includes("'./content/teaching/index.json'") && swSrc.includes("'./app/front/phrase-card.js'"),
    'SW 已预缓存教学包与模块（离线冷启动）');
  ok(!fs.existsSync(path.join(ROOT, 'content/phrase-cards')), '不存在重复的第二套乐句卡数据层');

  console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
