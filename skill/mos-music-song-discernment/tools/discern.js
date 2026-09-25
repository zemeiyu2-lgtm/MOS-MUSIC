#!/usr/bin/env node
/* =========================================================
   MOS-MUSIC｜歌曲辨识与选歌技能 V1.0 —— 可执行运行器
   （零依赖，只读上游；不写任何 content/ 文件）

   用法：
     node tools/discern.js --project <MOS-MUSIC 路径> --week 2027-W02 [--json]
     node tools/discern.js --project <MOS-MUSIC 路径> --backtest
     node tools/discern.js --project <MOS-MUSIC 路径> --emit-examples

   设计约束（对应 SKILL.md）：
     · 先经文后音乐：判定全部从周记录（经文/核心真理/LQ/MM/功能）出发
     · 上游只读：本脚本不写 content/**，回测前后上游哈希必须一致
     · Tier 与 Review Status 独立输出，不合并
     · 两个层级分离：歌曲生命周期(review_status) ≠ 本周适配裁决(theological_review)
   ========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ---------------------------------------------------------------- 词表 */

/** 恩典性行动词：核心真理与歌曲标签共现 → 直接表达同一真理 */
const ACT_WORDS = [
  '恩典', '救恩', '拯救', '救赎', '赎罪', '赦免', '赦罪', '称义', '稱義',
  '呼召', '差遣', '悦纳', '悅納', '释放', '釋放', '拣选', '揀選', '寻回', '尋回',
  '寻找', '尋找', '重生', '复活', '復活', '降卑', '临到', '臨到', '膏立', '施恩',
  '应验', '應驗', '接纳', '接納', '挽回', '眷顾',
];

/** 姿态类情感词：回应性歌曲的主要词汇 */
const STANCE_WORDS = [
  '信靠', '安靜', '安静', '交托', '交託', '盼望', '敬畏', '忍耐', '感恩',
  '渴慕', '降服', '悔改', '安慰', '等候', '安息',
];

/** 非直译声明：出现即不得判为 direct */
const DISCLAIMER_RE = /(非經文直譯|非经文直译|不是經文的直接|不是经文的直接|經文.{0,4}直譯|经文.{0,4}直译|逐節對應|逐节对应|間接呼應|间接呼应|主題級|主题级|不直接表达|并非直译|並非直譯)/;

/** 叙事同构标记 */
const NARRATIVE_RE = /(敘事|叙事|故事|场景|場景|場景呼應|叙述|敘述)/;

/** 自我努力词（道德主义风险探测） */
const SELF_EFFORT_WORDS = ['献上', '獻上', '委身', '努力', '立志', '决志', '決志', '降服', '献身', '獻身'];

/** 福音锚点：基督论 / 救恩论 标签 */
function gospelAnchor(song) {
  const t = song.theology || {};
  return (t.christology || []).length + (t.soteriology || []).length + (t.theology || []).filter((x) => /基督|救恩|恩典|福音|十字架/.test(x)).length > 0;
}

/* ---------------------------------------------------------------- S6 / S7 结构检查 */

const S6_RULES = {
  object: /(一位|一位|一件|一項|一项|某个|某段|某人|某个具体|具體|具体的人|家人|鄰舍|邻舍|圈外人|肢體|肢体|组员|組員|孩子|同事|朋友|難處|难处|關係|关系|工作壓力|工作压力|小組|小组)/,
  content: /(邀請|邀请|約|约|問候|问候|表達|表达|承認|承认|請求|请求|饒恕|饶恕|停止|加入|拜訪|拜访|聆聽|聆听|陪伴|改寫|改写|寫下|写下|禱告|祷告|分享|幫助|帮助|服事|奉獻|奉献|行動|行动|接受|接納|接纳)/,
  time: /(本週|本周|這週|这周|一週內|一周内|今天|三次|一次|每天|每日|完成時間|完成时间|週內|周内)/,
  method: /(寫下來|写下来|寫下|写下|記錄|记录|檢查|检查|選一項|选一项|三選一|三选一|從以下|从以下|方式|如何|互報|互报|完成時間|完成时间|分座|分組|分组|坐到)/,
};

const S7_RULES = {
  target: /(一位|一個|一个|家人|組員|组员|肢體|肢体|孩子|下一代|組長|组长|同伴)/,
  channel: /(講|讲|解釋|解释|唱|帶|带|分享|教|見證|见证|走一遍|七步法)/,
  verification: /(下週|下周|下次|互相回報|互相回报|互報|互报|回報|回报|複述|复述|一起完成|檢查|检查|驗證|验证)/,
};

function checkS6(text) {
  const t = String(text || '');
  const hit = {};
  for (const [k, re] of Object.entries(S6_RULES)) hit[k] = re.test(t);
  const missing = Object.entries(hit).filter(([, v]) => !v).map(([k]) => k);
  return { ok: missing.length === 0, hit, missing };
}

function checkS7(text) {
  const t = String(text || '');
  const hit = {};
  for (const [k, re] of Object.entries(S7_RULES)) hit[k] = re.test(t);
  const missing = Object.entries(hit).filter(([, v]) => !v).map(([k]) => k);
  // Verification 缺失不判失败（记为改善提示）
  return { ok: hit.target && hit.channel, hit, missing, verification_present: hit.verification };
}

/* ---------------------------------------------------------------- 上游加载 */

function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function projectPaths(project) {
  return {
    project,
    framework: path.join(project, 'content/framework/music-units.json'),
    songs: path.join(project, 'content/songs'),
    annual: path.join(project, 'content/annual/2027'),
  };
}

function loadWeek(P, weekId) {
  const full = String(weekId).includes('-') ? String(weekId) : `2027-${weekId}`;
  const file = `${full}.json`;
  const p = path.join(P.annual, 'weeks', file);
  if (!fs.existsSync(p)) throw new Error(`找不到周记录 ${full}`);
  const week = readJSON(p);
  const unitPath = path.join(P.annual, 'units', `MUS-U-${full}.json`);
  const unit = fs.existsSync(unitPath) ? readJSON(unitPath) : null;
  const framework = readJSON(P.framework);
  const mm = framework.units.filter((u) => week.music_unit_id.includes(u.unit_id));
  return { week, unit, mm, weekFile: file, unitPath };
}

function loadSong(P, songId) {
  const p = path.join(P.songs, `${songId}.json`);
  if (!fs.existsSync(p)) return null;
  return readJSON(p);
}

function songBlobTags(song) {
  const t = song.theology || {};
  return [
    ...(t.theology || []), ...(t.christology || []), ...(t.soteriology || []),
    ...(t.ecclesiology || []), ...(t.missiology || []),
    ...((song.bible && song.bible.bible_themes) || []),
    ...((song.formation && song.formation.emotion) || []),
    song.title || '',
  ].join(' ');
}

function songBlobAll(song) {
  return songBlobTags(song) + ' ' + [
    song.theological_note || '',
    JSON.stringify(song.eight_dimensions || {}),
    song.source || '',
  ].join(' ');
}

/* ---------------------------------------------------------------- 判定器 */

function assessRelation(week, song) {
  const truth = week.core_truth.text;
  const tags = songBlobTags(song);
  const all = songBlobAll(song);
  const overlap = ACT_WORDS.filter((w) => truth.includes(w) && tags.includes(w));
  const stance = STANCE_WORDS.filter((w) => tags.includes(w));
  const disclaimed = DISCLAIMER_RE.test(all);
  const narrative = NARRATIVE_RE.test(all);

  let relation = 'not_yet_assessed';
  let evidence = '';
  if (overlap.length) {
    relation = 'direct_biblical_expression';
    evidence = `歌曲标签与本周核心真理的恩典性行动词共现：${overlap.join('、')}——直接表达同一真理。`;
  } else if (disclaimed) {
    relation = 'theme_response';
    evidence = '歌曲记录明确声明为间接呼应/主题级/非经文直译，且无恩典性行动词共现。';
  } else if (narrative) {
    relation = 'narrative_response';
    evidence = '歌曲叙述与本周经文场景同构，但无恩典性行动词共现。';
  } else if (stance.length) {
    relation = 'theme_response';
    evidence = `歌曲仅提供姿态类情感回应（${stance.join('、')}），未承接经文主张。`;
  } else {
    evidence = '证据不足：既无行动词共现，也无姿态词或叙事标记 → 交人工裁决。';
  }
  return { relation, evidence, overlap, stance, disclaimed };
}

function assessPrimaryFunction(song) {
  const f = song.formation && song.formation.primary_function;
  return f || null;
}

function scanRisks({ week, song, unit, relation, s6, s7 }) {
  const risks = [];
  const low = (code, msg, sev = 'NOTE') => risks.push({ code, severity: sev, message: msg });
  const all = songBlobAll(song);
  const note = song.theological_note || '';

  // A 道德主义
  const selfEffort = SELF_EFFORT_WORDS.filter((w) => all.includes(w));
  if (/道德主义|道德主義/.test(note)) {
    low('A', '歌曲记录已声明道德主义风险：跟随若被简化为意志奉献/个人道德努力，福音结构即被倒置。', 'HIGH');
  } else if (selfEffort.length && !gospelAnchor(song)) {
    low('A', `出现自我努力语汇（${selfEffort.join('、')}）且缺乏基督论/救恩论锚点 → 道德主义风险。`, 'HIGH');
  }

  // B 情绪取代真理
  const bt = song.eight_dimensions && song.eight_dimensions.biblical_truth ? song.eight_dimensions.biblical_truth.score : null;
  if (song.formation && song.formation.primary_function === 'EM' && bt !== null && bt <= 3) {
    low('B', '情感功能为主而圣经真理维度偏低 → 须防「唱得感动即已改变」的推论。');
  }

  // C 歌曲替代释经
  if (unit) {
    const s3 = (unit.seven_step_method.S3_sing || {}).content || '';
    if (s3 && !/(詩本|诗本|授權|授权|來源|来源|本系統|本系统)/.test(s3)) {
      low('C', 'S3「唱」未标明歌词来源/授权出处 → 防止把歌曲当作经文本身解释。');
    }
  }

  // D 个人经验取代福音
  const gospelWords = ['神', '基督', '主', '福音', '恩典', '救恩', '聖', '圣'];
  if (!gospelWords.some((w) => songBlobTags(song).includes(w))) {
    low('D', '歌曲标签缺少以神/基督/福音为中心的词汇 → 检查是否以个人经验为中心。');
  }

  // E 实践空洞化
  if (!s6.ok) {
    low('E', `S6 缺要素（${s6.missing.join('、')}）→ S6_Insufficient：行动将退化为抽象属灵愿望。`, 'HIGH');
  }
  const s6txt = unit ? (unit.seven_step_method.S6_act || {}).content || '' : '';
  if (/(更加愛主|更加爱主|更加信靠|更加委身|更多愛神|更多爱神)/.test(s6txt)) {
    low('E', 'S6 出现「更加…」式抽象表述 → S6_Insufficient。', 'HIGH');
  }

  // F 对齐风险（本技能补充）
  const fn = week.music_function || [];
  if (relation.relation === 'theme_response' && fn.some((f) => ['TR', 'CO', 'MI', 'MM'].includes(f))) {
    low('F', `本周功能含 ${fn.filter((f) => ['TR', 'CO', 'MI', 'MM'].includes(f)).join('/')}（真理/共同体/使命导向），而歌曲仅为主题级回应 → 可能以安静/情感取代经文主张，须人工复核。`, 'HIGH');
  }

  return risks;
}

function decide({ song, relation, s6, s7, risks }) {
  if (!song) return 'No Suitable Song Found';
  const ed = song.eight_dimensions || {};
  const dims = Object.values(ed);
  const incomplete = dims.length === 0 || dims.some((d) => !d || d.score === null || d.score === undefined);
  const high = risks.filter((r) => r.severity === 'HIGH');
  const bt = ed.biblical_truth ? ed.biblical_truth.score : null;

  if (incomplete) return 'Research';
  if (high.length) return 'Needs Human Review';
  if (relation.relation === 'direct_biblical_expression' && bt !== null && bt >= 4 && s6.ok && s7.ok) return 'Core Candidate';
  if ((relation.relation === 'direct_biblical_expression' || relation.relation === 'theme_response') && s6.ok && s7.ok) return 'Recommended';
  return 'Needs Human Review';
}

function verdictOf(decision, risks) {
  const high = risks.filter((r) => r.severity === 'HIGH');
  if (decision === 'Needs Human Review' || decision === 'No Suitable Song Found' || high.length) {
    return { code: 'needs_human_review', label: 'Needs Human Review' };
  }
  if (decision === 'Core Candidate' || decision === 'Recommended') {
    return { code: 'confirmed', label: 'Confirmed' };
  }
  return { code: 'needs_human_review', label: 'Needs Human Review' };
}

/* ---------------------------------------------------------------- 主辨识流程 */

function discern(P, weekId, songId, opts = {}) {
  const { week, unit, mm } = loadWeek(P, weekId);
  const song = loadSong(P, songId);
  if (!song) throw new Error(`候选歌曲 ${songId} 不在 Music Library —— 禁止自行制造歌曲资料`);

  const relation = assessRelation(week, song);
  const primaryFunction = assessPrimaryFunction(song);
  const s6 = checkS6(unit ? unit.seven_step_method.S6_act.content : opts.proposedS6);
  const s7 = checkS7(unit ? unit.seven_step_method.S7_transmit.content : opts.proposedS7);
  const risks = scanRisks({ week, song, unit, relation, s6, s7 });
  const decision = decide({ song, relation, s6, s7, risks });
  const verdict = verdictOf(decision, risks);

  const ed = song.eight_dimensions || {};
  const dimLine = (k) => {
    const d = ed[k];
    return d ? `${d.score}/5 — ${d.note || ''}` : '未辨识';
  };

  return {
    week: week.week_id || weekId,
    mos_week: week.mos_week,
    bible_passage: week.bible_passage_id,
    core_truth: week.core_truth.text,
    lq: week.life_question_id,
    mm_theme: (mm.length ? mm.map((m) => `${m.unit_id} ${m.title}`) : week.music_unit_id).join(' + '),
    music_function: week.music_function,
    candidate_song: `${song.song_id} ${song.title}`,
    song_relation: relation.relation,
    song_relation_evidence: relation.evidence,
    primary_function: primaryFunction,
    eight_dimensions: {
      biblical_truth: dimLine('biblical_truth'),
      theology: dimLine('theological_formation'),
      emotional_formation: dimLine('emotional_formation'),
      community: dimLine('community'),
      congregational_participation: dimLine('congregational_participation'),
      intergenerational: dimLine('generational_transmission'),
      life_practice: dimLine('life_practice'),
      mission: dimLine('mission_orientation'),
    },
    s6: {
      object: s6.hit.object ? '✓' : '✗',
      content: s6.hit.content ? '✓' : '✗',
      time: s6.hit.time ? '✓' : '✗',
      method: s6.hit.method ? '✓' : '✗',
      ok: s6.ok,
      missing: s6.missing,
      text: unit ? unit.seven_step_method.S6_act.content : (opts.proposedS6 || null),
    },
    s7: {
      target: s7.hit.target ? '✓' : '✗',
      channel: s7.hit.channel ? '✓' : '✗',
      verification: s7.hit.verification ? '✓' : '（缺：仅记改善提示）',
      ok: s7.ok,
      text: unit ? unit.seven_step_method.S7_transmit.content : (opts.proposedS7 || null),
    },
    risks,
    gospel_structure: gospelAnchor(song) ? `有福音锚点（${(song.theology.christology || []).concat(song.theology.soteriology || []).join('、') || '神学标签'}）` : '⚠ 无基督论/救恩论锚点',
    tier: song.tier,
    review_status: song.review_status,
    song_is_complete_unit: false,
    decision,
    week_fit_verdict: verdict.label,
    week_fit_verdict_code: verdict.code,
    not_yet_validated: '真实会众使用后的反馈（只能在会众使用中验证）',
    human_review_required: decision === 'Needs Human Review' || risks.some((r) => r.severity === 'HIGH'),
    trace: buildTrace({ week, song, relation, primaryFunction, s6, s7, risks, decision }),
  };
}

function buildTrace({ week, song, relation, primaryFunction, s6, s7, risks, decision }) {
  const high = risks.filter((r) => r.severity === 'HIGH').map((r) => r.code);
  return [
    `1) 选此歌：因 ${relation.evidence}`,
    `2) 关系判定：${relation.relation}${relation.relation === 'direct_biblical_expression' ? '（与核心真理恩典性行动词共现 → 直接表达同一真理）' : `（${relation.disclaimed ? '记录中含非直译声明' : relation.stance.length ? '仅姿态类回应' : '无行动词共现'}）`}。`,
    `3) 主功能：${primaryFunction}（取自歌曲 formation.primary_function；周功能为 ${(week.music_function || []).join('/')}）。`,
    `4) S6：${s6.ok ? '四要素齐备（Object/Content/Time/Method）' : `缺 ${s6.missing.join('、')} → S6_Insufficient`}。`,
    `5) S7：${s7.ok ? `成立${s7.verification_present ? '（含可验证机制）' : '（提示：缺互报/验证机制）'}` : `不成立（缺 ${s7.missing.join('、')}）`}。`,
    `6) 神学风险：${risks.length ? risks.map((r) => `${r.code}[${r.severity}]`).join('、') : '未发现'}。`,
    `7) Tier：${song.tier}（来自歌曲记录 tier，独立字段）。`,
    `8) Review Status：${song.review_status}（歌曲生命周期，与 Tier 独立；本周适配裁决为 ${decision}）。`,
  ];
}

/* ---------------------------------------------------------------- §14 文本渲染 */

function render(r) {
  const L = [];
  L.push('MOS-MUSIC SONG DISCERNMENT RESULT');
  L.push('');
  L.push(`Week: ${r.week}`);
  L.push(`Bible Passage: ${r.bible_passage}`);
  L.push(`Core Truth: ${r.core_truth}`);
  L.push(`LQ: ${r.lq}`);
  L.push(`MM Theme: ${r.mm_theme}`);
  L.push('');
  L.push(`Candidate Song: ${r.candidate_song}`);
  L.push('');
  L.push(`Song_Relation: ${r.song_relation}`);
  L.push(`Primary_Function: ${r.primary_function}`);
  L.push('');
  L.push('Eight-Dimension Discernment:');
  L.push(`1. Biblical Truth: ${r.eight_dimensions.biblical_truth}`);
  L.push(`2. Theology: ${r.eight_dimensions.theology}`);
  L.push(`3. Emotional Formation: ${r.eight_dimensions.emotional_formation}`);
  L.push(`4. Community: ${r.eight_dimensions.community}`);
  L.push(`5. Congregational Participation: ${r.eight_dimensions.congregational_participation}`);
  L.push(`6. Intergenerational: ${r.eight_dimensions.intergenerational}`);
  L.push(`7. Life Practice: ${r.eight_dimensions.life_practice}`);
  L.push(`8. Mission: ${r.eight_dimensions.mission}`);
  L.push('');
  L.push('S6 Practice Conversion:');
  L.push(`Object: ${r.s6.object}`);
  L.push(`Content: ${r.s6.content}`);
  L.push(`Time: ${r.s6.time}`);
  L.push(`Method: ${r.s6.method}`);
  L.push('');
  L.push(`S7 Transmission Conversion: target ${r.s7.target} / channel ${r.s7.channel} / verification ${r.s7.verification}`);
  L.push('');
  L.push(`Theological Risks: ${r.risks.length ? r.risks.map((x) => `${x.code}[${x.severity}] ${x.message}`).join(' | ') : 'none'}`);
  L.push('');
  L.push(`Gospel Structure: ${r.gospel_structure}`);
  L.push('');
  L.push(`Tier: ${r.tier}`);
  L.push('');
  L.push(`Review Status: ${r.review_status}`);
  L.push('');
  L.push(`Decision: ${r.decision}`);
  L.push('');
  L.push(`Reason: ${r.song_relation_evidence}`);
  L.push('');
  L.push(`Human Review Required: ${r.human_review_required ? 'YES' : 'NO'}`);
  L.push('');
  L.push(`Song ≠ Complete Discipleship Unit: true`);
  L.push(`Week Fit Verdict: ${r.week_fit_verdict}`);
  L.push(`Not Yet Validated: ${r.not_yet_validated}`);
  L.push('');
  L.push('Decision Trace:');
  r.trace.forEach((t) => L.push('- ' + t));
  return L.join('\n');
}

/* ---------------------------------------------------------------- 上游哈希（回测 A 项） */

function upstreamHash(P) {
  const files = [];
  const add = (p) => { if (fs.existsSync(p)) files.push(p); };
  for (const f of fs.readdirSync(path.join(P.annual, 'weeks'))) add(path.join(P.annual, 'weeks', f));
  for (const f of fs.readdirSync(path.join(P.annual, 'units'))) add(path.join(P.annual, 'units', f));
  for (const f of fs.readdirSync(P.songs)) add(path.join(P.songs, f));
  add(P.framework);
  add(path.join(P.annual, 'annual.json'));
  const out = {};
  for (const f of files.sort()) {
    out[path.relative(P.project, f).replace(/\\/g, '/')] = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16);
  }
  return out;
}

/* ---------------------------------------------------------------- 回测 */

const SKILL_DIR = path.resolve(__dirname, '..');

function runBacktest(P, emit) {
  const spec = readJSON(path.join(SKILL_DIR, 'tests/backtest-w01-w03.json'));
  const hashFile = path.join(SKILL_DIR, 'tests/upstream-hashes.json');
  const now = upstreamHash(P);
  let hashStatus = 'created';
  if (fs.existsSync(hashFile)) {
    const prev = readJSON(hashFile).hashes;
    const same = JSON.stringify(prev) === JSON.stringify(now);
    hashStatus = same ? 'unchanged' : 'CHANGED';
    if (emit) fs.writeFileSync(hashFile, JSON.stringify({ generated_at: new Date().toISOString(), note: 'Phase 2A.1 冻结时的上游快照；回测 A 项要求一致。', hashes: now }, null, 2) + '\n');
  } else {
    fs.writeFileSync(hashFile, JSON.stringify({ generated_at: new Date().toISOString(), note: 'Phase 2A.1 冻结时的上游快照；回测 A 项要求一致。', hashes: now }, null, 2) + '\n');
    hashStatus = 'created';
  }

  const rows = [];
  const results = [];
  for (const c of spec.cases) {
    const r = discern(P, c.mos_week, c.candidate_song);
    results.push({ case: c, result: r });
    const checks = [];
    const exp = c.expect || {};
    if (exp.song_relation) checks.push({ field: 'song_relation', expected: exp.song_relation, actual: r.song_relation, pass: r.song_relation === exp.song_relation });
    if (exp.week_fit_verdict) checks.push({ field: 'week_fit_verdict', expected: exp.week_fit_verdict, actual: r.week_fit_verdict_code, pass: r.week_fit_verdict_code === exp.week_fit_verdict });
    if (exp.tier) checks.push({ field: 'tier', expected: exp.tier, actual: r.tier, pass: r.tier === exp.tier });
    if (exp.review_status) checks.push({ field: 'review_status', expected: exp.review_status, actual: r.review_status, pass: r.review_status === exp.review_status });
    if (exp.risk_codes) {
      for (const rc of exp.risk_codes) {
        const found = r.risks.some((x) => x.code === rc);
        checks.push({ field: `risk_${rc}`, expected: 'detected', actual: found ? 'detected' : 'missing', pass: found });
      }
    }
    const pass = checks.every((x) => x.pass) && r.song_relation !== 'not_yet_assessed';
    rows.push({ id: c.id, week: c.mos_week, song: c.candidate_song, role: c.role || 'core', checks, pass });
  }

  /* 验收 A–G */
  const acceptance = [];
  acceptance.push({ key: 'A', label: '上游不变（哈希一致）', pass: hashStatus !== 'CHANGED', detail: hashStatus });
  acceptance.push({ key: 'B', label: 'Song_Relation 正确', pass: rows.filter((r) => ['W01', 'W02', 'W03'].includes(r.id) || r.role === 'core').every((r) => r.checks.filter((c) => c.field === 'song_relation').every((c) => c.pass)), detail: '' });
  acceptance.push({
    key: 'C', label: '神学风险识别正确（W03 道德主义 / W02 对齐风险）',
    pass: ['A', 'F'].every((code) => rows.some((r) => r.checks.some((c) => c.field === `risk_${code}` && c.pass))),
    detail: '',
  });
  const s6all = results.filter((x) => ['W01', 'W02', 'W03'].includes(x.case.id)).every((x) => x.result.s6.ok);
  acceptance.push({ key: 'D', label: 'S6 检查有效（三周均四要素齐备）', pass: s6all, detail: '' });
  const s7all = results.filter((x) => ['W01', 'W02', 'W03'].includes(x.case.id)).every((x) => x.result.s7.ok);
  acceptance.push({ key: 'E', label: 'S7 检查有效（三周均成立）', pass: s7all, detail: '' });
  acceptance.push({ key: 'F', label: '歌曲 ≠ 完整门训单元（显式声明）', pass: results.every((x) => x.result.song_is_complete_unit === false), detail: '' });
  acceptance.push({
    key: 'G', label: 'Tier 与 Review Status 独立',
    pass: results.every((x) => x.result.tier && x.result.review_status && x.result.tier !== x.result.review_status),
    detail: '',
  });

  /* 打印 */
  console.log('MOS-MUSIC｜Song Discernment V1.0 回测（W01–W03，Ground Truth = Phase 2A.1 冻结裁决）');
  console.log('');
  console.log('| Week | Song | Expected | Actual | Pass |');
  console.log('|---|---|---|---|---|');
  for (const r of rows) {
    const e = r.checks.map((c) => `${c.field}=${c.expected}`).join(' / ');
    const a = r.checks.map((c) => `${c.field}=${c.actual}`).join(' / ');
    console.log(`| ${r.id} | ${r.song} | ${e} | ${a} | ${r.pass ? 'PASS' : 'FAIL'} |`);
  }
  console.log('');
  console.log('回测验收 A–G：');
  for (const a of acceptance) console.log(`  ${a.pass ? 'PASS' : 'FAIL'}  ${a.key}｜${a.label}${a.detail ? `（${a.detail}）` : ''}`);
  console.log('');
  for (const x of results) {
    console.log(`--- ${x.case.id}｜${x.result.candidate_song} ---`);
    console.log(render(x.result));
    console.log('');
  }
  console.log(`上游哈希：${hashStatus}`);
  const allPass = rows.every((r) => r.pass) && acceptance.every((a) => a.pass);
  console.log(allPass ? 'BACKTEST ALL PASS' : 'BACKTEST FAIL');

  if (emit) {
    const exDir = path.join(SKILL_DIR, 'examples');
    fs.mkdirSync(exDir, { recursive: true });
    for (const x of results) fs.writeFileSync(path.join(exDir, `${x.case.id}.json`), JSON.stringify(x.result, null, 2) + '\n');
    fs.writeFileSync(path.join(SKILL_DIR, 'tests/backtest-result.json'), JSON.stringify({ rows, acceptance, hashStatus, ran_at: new Date().toISOString() }, null, 2) + '\n');
    console.log('已写出 examples/ 与 tests/backtest-result.json');
  }
  process.exit(allPass ? 0 : 1);
}

/* ---------------------------------------------------------------- CLI */

function main() {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const project = opt('--project', path.resolve(SKILL_DIR, '../../../WorkBuddy/2026-09-21-11-08-49/MOS-MUSIC'));
  const P = projectPaths(project);
  if (!fs.existsSync(P.framework)) { console.error(`项目路径无效：${project}`); process.exit(1); }

  if (argv.includes('--backtest')) return runBacktest(P, argv.includes('--emit'));
  if (argv.includes('--emit-examples')) return runBacktest(P, true);

  const weekId = opt('--week', null);
  if (!weekId) { console.error('用法：--week 2027-W02 | --backtest | --emit-examples'); process.exit(1); }
  const songId = opt('--song', null) || loadWeek(P, weekId).week.core_song_id;
  const r = discern(P, weekId, songId, { proposedS6: opt('--s6', null), proposedS7: opt('--s7', null) });
  console.log(argv.includes('--json') ? JSON.stringify(r, null, 2) : render(r));
  process.exit(0);
}

if (require.main === module) main();
module.exports = { discern, render, checkS6, checkS7, assessRelation, scanRisks, decide };
