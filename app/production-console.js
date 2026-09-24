/* =========================================================
   MOS-MUSIC｜Production Console（讲道音乐生产平台 · MODULE 12）
   ---------------------------------------------------------
   内部生产工具视图（不进底部导航，从内容治理页进入或直接 #/production）。

   闭环：
     Music Library → Song Discernment → Sermon Week → Song Matching
     → Unit Production → Human Review → Validation → Production Record

   子视图（?view=）：
     dashboard    年度 / 音乐 / 技能三组统计
     library      音乐库（含使用历史、已使用周次、风险记录、辨识状态）
     discern      歌曲辨识（对某周全部候选逐一辨识 + 决策轨迹）
     producer     生产计划器（单周 / 连续 / 全年；默认人工审核门）
     calibration  校准问题与版本治理

   边界：本视图只读；不写任何 content/** 文件，不修改任何歌曲记录。
========================================================= */

import * as store from './store.js';
import { getIndex, getAllWeeks, getAllUnits } from './content-source.js';
import { compileLexicon, discernSong, discernCandidates } from './discernment.js';
import {
  PLATFORM, GATE, PRODUCE_MODES, CAPACITY_CODE,
  crossWeekReuse, libraryCapacity, unitReviewGate, summarizeDiscernment,
  planProduction, dashboardStats, weekNumber,
} from './production-rules.js';
import { CATEGORY, summarizeIssues, governanceView, validateIssue } from './calibration.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const FUNC_LABEL = {
  TR: '真理教导', MM: '记忆', EM: '情感形成', PR: '祈求',
  CO: '共同体', LI: '生活实践', MI: '使命', RP: '再生产',
};

const DIM_LABEL = [
  ['biblical_truth', '圣经真理'], ['theology', '神学形成'],
  ['emotional_formation', '情感形成'], ['community', '共同体'],
  ['congregational_participation', '会众参与'], ['intergenerational', '代际传递'],
  ['life_practice', '生活实践'], ['mission', '使命方向'],
];

const GATE_CLASS = { PASS: 'chip good', REVIEW: 'chip warn', BLOCK: 'chip gold' };

function notice(text, kind) { return `<div class="notice${kind ? ' ' + kind : ''}">${text}</div>`; }

function gateChip(state) {
  return `<span class="${GATE_CLASS[state] || 'chip'}">${esc(state || '—')}</span>`;
}

function statusLine(parts) {
  return `<div class="notice net">生产平台 ${esc(PLATFORM.version)} ｜ 默认门：人工审核 ｜ ${parts.join(' ｜ ')}</div>`;
}

function subnav(active) {
  const items = [
    ['dashboard', '生产总览'], ['library', '音乐库'], ['discern', '歌曲辨识'],
    ['week', '周音乐'], ['producer', '生产计划'], ['review', '人工审查'],
    ['calibration', '校准与版本'],
  ];
  return `<div class="facets">${items.map(([k, label]) =>
    `<a class="facet" href="#/production?view=${k}"${k === active ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('')}</div>`;
}

/* ---------------------------------------------------------------- 数据装载 */

async function loadContext() {
  const [prod, lexRaw, calib, gov, usage, annual, framework, library,
    themeCounts, scriptureIndex, songDiscernment,
    resIndex, reviewRecords, promotions] = await Promise.all([
    getIndex('production'), getIndex('lexicon'), getIndex('calibration'),
    getIndex('governance'), getIndex('usage'), getIndex('annual'), getIndex('framework'),
    getIndex('library').catch(() => null),
    getIndex('theme_counts').catch(() => null),
    getIndex('song_scripture').catch(() => null),
    getIndex('song_discernment').catch(() => null),
    /* V1.1-A：资源层 / 人工审查记录层 / 升层声明 */
    getIndex('song_resources').catch(() => null),
    getIndex('review_records').catch(() => null),
    getIndex('promotions').catch(() => null),
  ]);
  const songs = await store.getAll('content_songs').catch(() => []);
  const weeks = await getAllWeeks();
  const units = await getAllUnits();
  const libIndex = await getIndex('songs').catch(() => ({ songs: [] }));
  return {
    prod, calib, gov, usage, annual, framework, library,
    themeCounts, scriptureIndex, songDiscernment,
    resIndex, reviewRecords, promotions,
    lex: compileLexicon(lexRaw),
    songs, weeks, units, libIndex,
    weekMap: new Map(weeks.map((w) => [w.mos_week, w])),
    unitMap: new Map(units.map((u) => [u.mos_week, u])),
    songMap: new Map(songs.map((s) => [s.song_id, s])),
  };
}

function mmOf(ctx, week) {
  return ctx.framework.units.filter((u) => (week.music_unit_id || []).includes(u.unit_id));
}

/** 对某周的核心歌做歌曲层辨识 + 跨周复用 + 单元层审查门。 */
function assessUnit(ctx, unit) {
  const week = ctx.weekMap.get(unit.mos_week);
  if (!week) return null;
  const song = ctx.songMap.get(unit.core_song);
  if (!song) return null;
  const discernment = discernSong({ week, song, unit, mm: mmOf(ctx, week), lex: ctx.lex });
  const reuse = crossWeekReuse({ songId: unit.core_song, week: unit.mos_week, usage: ctx.usage });
  const gate = unitReviewGate({ week, unit, discernment, reuse });
  return { week, unit, song, discernment, reuse, gate };
}

/* ---------------------------------------------------------------- 视图 1：总览 */

/** V1.1-A：待人工数量（升层试批待验收 + 单元门 REVIEW/BLOCK），两类分开计数。 */
function humanPending(ctx) {
  const promo = ((ctx.promotions && ctx.promotions.promotions) || [])
    .filter((p) => p.accepted_by_human === false).length;
  const gateNeeds = ctx.units.filter((u) => {
    const g = (u.review_gate || {}).theological_review;
    return g !== 'confirmed';
  }).length;
  return `${promo + gateNeeds}（试批验收 ${promo} + 单元门 ${gateNeeds}）`;
}

async function viewDashboard(root, ctx) {
  const assessments = ctx.units.map((u) => assessUnit(ctx, u)).filter(Boolean);
  const states = { PASS: 0, REVIEW: 0, BLOCK: 0 };
  for (const a of assessments) states[a.gate.state] += 1;

  const stats = dashboardStats({
    weeks: ctx.weeks, units: ctx.units, library: ctx.libIndex,
    usage: ctx.usage, issues: ctx.calib.issues, governance: ctx.gov,
  });
  const remaining = 52 - stats.annual.produced;
  const capacity = libraryCapacity({ library: ctx.libIndex, usage: ctx.usage, remainingWeeks: remaining });

  root.innerHTML = `
    ${statusLine([`年度 ${ctx.annual.annual_id}`, `单元 ${stats.annual.produced}`])}
    ${subnav('dashboard')}
    ${prodNotice(ctx.prod)}
    ${capacity.warning ? notice(`<strong>${esc(CAPACITY_CODE)}</strong>｜${esc(capacity.detail)}`, 'error') : notice(esc(capacity.detail))}

    <section class="card hero">
      <div class="section-head"><h2>真实使用仪表盘（V1.1-A）</h2><span class="chip">少而重要</span></div>
      <div class="cards">
        ${row('Library（合并曲库）', capacity.total)}
        ${row('Detail（歌曲详情层）', capacity.by_layer.detail)}
        ${row('Intake（登记层待升层）', capacity.by_layer.intake)}
        ${row('Human Review（待人工）', humanPending(ctx))}
        ${row('Capacity（可用 / 剩余 / 缺口）', `${capacity.usable} / ${capacity.remaining_weeks} / ${capacity.deficit}`)}
        ${row('Calibration（未结案）', stats.skill.issues_open)}
        ${row('Production（W01–W04）', assessments.map((a) => `${a.unit.mos_week} ${a.gate.state}`).join(' ｜ ') || '—')}
      </div>
      <div class="notice">Human Review 待人工 = 升层试批待验收 ${((ctx.promotions && ctx.promotions.promotions) || []).filter((p) => p.accepted_by_human === false).length}
       + 单元门 REVIEW/BLOCK ${states.REVIEW + states.BLOCK}（两类分开计数，不混算）。人工裁决留档见「人工审查」。</div>
    </section>

    <section class="card hero">
      <div class="section-head"><h2>年度（2027）</h2><span class="chip">52 周</span></div>
      <div class="cards">
        ${row('计划周数', 52)}${row('已索引周次', stats.annual.weeks_indexed)}
        ${row('已生产单元', stats.annual.produced)}${row('已审核（本周适配确认）', stats.annual.reviewed)}
        ${row('待人工复核', stats.annual.review)}${row('未生产', stats.annual.not_produced)}
      </div>
      <div class="cards">
        <div class="entry"><span class="entry-main"><span class="entry-kicker">单元层审查门</span>
          <span class="entry-title">PASS ${states.PASS} ｜ REVIEW ${states.REVIEW} ｜ BLOCK ${states.BLOCK}</span>
          <span class="entry-note">PASS=无待裁事项；REVIEW=需人工确认但不阻断；BLOCK=须人工裁决后才可继续。历史周次被判 BLOCK 不等于周次不合格，只表示机器不可自动放行。</span></span></div>
      </div>
    </section>

    <section class="card hero">
      <div class="section-head"><h2>音乐库</h2><span class="chip">§三 A</span></div>
      <div class="cards">
        ${row('总歌曲', stats.music.total)}${row('已辨识', stats.music.assessed)}
        ${row('未辨识', stats.music.not_assessed)}${row('已使用', stats.music.used)}
        ${row('未使用', stats.music.never_used)}${row('重复使用', stats.music.reused)}
        ${row('HIGH 风险', stats.music.high_risk)}${row('证据不足', stats.music.insufficient_evidence)}
      </div>
    </section>

    <section class="card hero">
      <div class="section-head"><h2>技能与校准</h2><span class="chip">§十二 / §十三</span></div>
      <div class="cards">
        ${row('辨识技能', `${stats.skill.id}@${stats.skill.version}`)}${row('技能状态', stats.skill.status)}
        ${row('平台引擎', stats.skill.engine)}${row('Resgression 状态', stats.skill.regression)}
        ${row('校准问题', `${stats.skill.issues_total}（未结案 ${stats.skill.issues_open}）`)}
        ${row('已修问题', stats.skill.issues_fixed)}${row('待批准提案', stats.skill.pending_changes)}
      </div>
      ${notice('平台不修改已冻结技能：发现问题只记录为校准问题，进入 Proposed，取得人工批准后才允许动版本号。详见「校准与版本」。')}
    </section>

    <section class="card hero">
      <div class="section-head"><h2>生产记录（每周一行的门状态）</h2><span class="chip">Production Record</span></div>
      <div class="cards">
        ${assessments.map((a) => `
          <a class="entry" href="#/production?view=discern&week=${esc(a.unit.mos_week)}">
            <span class="entry-main">
              <span class="entry-kicker">${esc(a.unit.mos_week)} ｜ ${esc(a.week.bible_passage_id)} ｜ ${esc(a.week.life_question_id)}</span>
              <span class="entry-title">${esc(a.song.title)}</span>
              <span class="entry-note">歌曲层 ${esc(a.discernment.decision)} ｜ ${esc(a.discernment.song_relation)} ｜ 复用：${esc(a.reuse.reuse_status)}</span>
            </span>
            ${gateChip(a.gate.state)}
          </a>`).join('') || notice('尚无已生产单元。')}
      </div>
    </section>`;
}

function row(k, v) {
  return `<div class="entry" style="border:0;border-bottom:1px solid var(--line);border-radius:0;">
    <span class="entry-main"><span class="entry-note">${esc(k)}</span></span>
    <span class="entry-note"><strong>${esc(v)}</strong></span></div>`;
}

function prodNotice(prod) {
  if (!prod) return notice('生产平台索引不可读。', 'error');
  return `<div class="notice">${esc(prod.platform_name)} ｜ 固定链条：${(prod.fixed_chain || []).map(esc).join(' → ')}</div>`;
}

/* ---------------------------------------------------------------- 视图 2：音乐库 */

async function viewLibrary(root, ctx) {
  const rows = (ctx.usage.songs || []);
  const remaining = 52 - ctx.units.length;
  const capacity = libraryCapacity({ library: ctx.libIndex, usage: ctx.usage, remainingWeeks: remaining });
  const v5 = ctx.library;
  const v5Card = v5 ? `
    <section class="card hero">
      <div class="section-head"><h2>曲库扩库登记（V0.5）</h2><span class="chip">${esc(v5.index_version || '')}</span></div>
      <div class="cards">
        ${row('目标总数', v5.target_total)}${row('既有（详情层）', v5.counts.detail_records)}
        ${row('新增登记', v5.counts.intake_records)}${row('合并曲库', v5.counts.total)}
        ${row('仍待收', v5.counts.pending_list)}${row('候选清单状态', v5.counts.intake_records > 0 ? '已收（RECEIVED）' : '待提供（CI-0013）')}
      </div>
      <div class="notice">登记层只承载元数据（身份 / 来源 / 资源现状 / 清单初步主题 / 建议用途方向），它不是辨识结果；歌曲关系与使用决定一律由已冻结技能重新产生。本阶段不收录歌词、歌谱与录音。</div>
    </section>` : '';

  /* 派生索引（CI-0014 案 a）：从曲库推导，不是权威源；随曲库增长而变化，不构成基线漂移 */
  const tc = ctx.themeCounts;
  const ss = ctx.scriptureIndex;
  const sd = ctx.songDiscernment;
  const derivedCard = (tc || ss || sd) ? `
    <section class="card hero">
      <div class="section-head"><h2>派生索引（案 a）</h2><span class="chip">derived=true</span></div>
      <div class="cards">
        ${row('主题歌曲计数', tc ? `${(tc.themes || []).length} 个主题` : '不可读')}
        ${row('详情层计入', tc ? tc.detail_total : '—')}
        ${row('经文锚点总数', ss && ss.counts ? ss.counts.total : '—')}
        ${row('已登记 / 待产生', ss && ss.counts ? `${ss.counts.registered} / ${ss.counts.pending}` : '—')}
        ${row('库级辨识候选', sd && sd.counts ? sd.counts.candidates : '—')}
        ${row('范围 / 周次', sd ? `${sd.scope} / ${sd.week_assignment}` : '—')}
      </div>
      <div class="notice">这两个索引原本写在不可变基线内的上游文件里，正常扩库会因此被判为「基线漂移」。案 a 之后它们改为派生视图：权威源永远是曲库本身，本卡片只是读出来的样子。</div>
    </section>` : '';

  /* 库级歌基层辨识（library_scope）：无周次 → 只输出「缺什么」，不给推测分 */
  const libScopeCard = sd ? `
    <section class="card hero">
      <div class="section-head"><h2>库级歌基层辨识</h2><span class="chip">${esc(sd.scope || '')}</span></div>
      <div class="cards">
        ${row('候选数', sd.counts ? sd.counts.candidates : '—')}
        ${row('判定分布', sd.counts ? Object.entries(sd.counts.by_decision || {}).map(([k, n]) => `${k} ${n}`).join(' ｜ ') : '—')}
        ${row('周次指定', sd.week_assignment || 'none')}
        ${row('单元层', '未生成（本阶段不产周次 Unit）')}
      </div>
      <div class="notice">库级范围没有周次上下文，故 Song_Relation / S6 / S7 / 风险扫描一律不适用，缺失证据逐首列出而不是代填。W01–W04 的历史裁决不在此重判。</div>
    </section>` : '';

  const capCard = `
    <section class="card hero">
      <div class="section-head"><h2>容量重算（§十）</h2><span class="chip">${esc(capacity.warning ? capacity.code : '容量充足')}</span></div>
      <div class="cards">
        ${row('总歌曲数', capacity.total)}${row('可用（未使用过）', capacity.usable)}
        ${row('已辨识', capacity.assessed)}${row('未结案辨识', capacity.unresolved)}
        ${row('已用 / 未用', `${capacity.used} / ${capacity.unused}`)}
        ${row('HIGH 风险', capacity.high_risk.length)}${row('REVIEW', capacity.review.length)}
        ${row('BLOCK', capacity.block.length)}${row('证据不足', capacity.evidence_insufficient.length)}
        ${row('剩余唯一容量', capacity.remaining_unique_capacity)}${row('剩余周次需求 / 缺口', `${capacity.remaining_weeks} / ${capacity.deficit}`)}
      </div>
      <div class="notice">${esc(capacity.detail)}</div>
    </section>`;

  root.innerHTML = `
    ${statusLine([`歌曲 ${rows.length}`, `已使用 ${rows.filter((s) => s.times_used > 0).length}`, `未使用 ${rows.filter((s) => s.times_used === 0).length}`])}
    ${subnav('library')}
    ${v5Card}
    ${derivedCard}
    ${libScopeCard}
    ${capCard}
    ${notice('歌曲身份 / 神学主题 / 圣经表达 / 使用历史 / 已使用周次 / 风险记录 / 辨识状态 / 版本 / 审核状态。tier 与 review_status 为两个独立字段，互不推导。')}
    <section class="card hero">
      <div class="search-row">
        <input type="search" id="prodLibSearch" placeholder="搜索：Song ID / 中文歌名 / 英文歌名" aria-label="搜索歌曲">
        <button class="secondary" id="prodLibSearchClear" type="button">清除</button>
      </div>
      <div class="notice">搜索只过滤下方列表（ID 与名称），不做任何语义推荐。</div>
    </section>
    <div id="prodLibList">
    ${rows.map((s) => `
      <section class="card hero">
        <div class="section-head"><h2>${esc(s.title)}</h2><span class="chip">${esc(s.song_id)}</span></div>
        <div class="cards">
          ${row('资源等级 tier', s.tier)}${row('生命周期 review_status', s.review_status)}
          ${row('主功能', `${esc(s.primary_function || '—')} ${FUNC_LABEL[s.primary_function] ? '（' + FUNC_LABEL[s.primary_function] + '）' : ''}`)}
          ${row('主主题', s.main_theme)}${row('核心经文', s.core_passage)}
          ${row('版本', s.version)}${row('版权状态', s.copyright_status)}
          ${row('使用次数', `${s.times_used}（主歌 ${s.times_as_core} / 辅助 ${s.times_as_auxiliary}）`)}
          ${row('辨识状态', s.discernment_status)}${row('最近辨识周', s.last_discernment_week || '—')}
          ${row('HIGH 风险代码', s.high_risk_codes.join('、') || '—')}
        </div>
        ${s.used_in.length ? `
          <div class="cards">
            ${s.used_in.map((u) => `
              <div class="entry"><span class="entry-main">
                <span class="entry-kicker">${esc(u.week)} ｜ ${u.role === 'core' ? '主歌' : '辅助歌'} ｜ ${esc(u.bible_passage || '')} ｜ ${esc(u.life_question || '')}</span>
                <span class="entry-title">功能 ${(u.music_function || []).map(esc).join('/')}</span>
                <span class="entry-note">关系 ${esc(u.song_relation || '—')} ｜ 适配裁决 ${esc(u.unit_gate || '—')}</span>
              </span></div>`).join('')}
          </div>` : notice('本歌尚未被任何周次使用。')}
        ${s.unit_risk_notes.length ? `
          <div class="notice">单元层面的风险说明：${s.unit_risk_notes.map((r) => `${esc(r.week)}：${esc(r.text)}`).join('；')}</div>` : ''}
        ${s.theological_note ? `<div class="notice">辨识备注：${esc(s.theological_note)}</div>` : ''}
      </section>`).join('')}
    </div>`;

  /* V1.1-A：音乐库搜索（ID / 中文名 / 英文名，客户端过滤） */
  const input = root.querySelector('#prodLibSearch');
  const listEl = root.querySelector('#prodLibList');
  if (input && listEl) {
    const sections = Array.from(listEl.querySelectorAll('section.card'));
    const meta = sections.map((sec, i) => ({
      el: sec,
      hay: `${rows[i] ? rows[i].song_id + ' ' + rows[i].title : ''}`.toLowerCase(),
    }));
    const apply = () => {
      const q = String(input.value || '').trim().toLowerCase();
      for (const m of meta) m.el.style.display = (!q || m.hay.includes(q)) ? '' : 'none';
    };
    input.addEventListener('input', apply);
    const clear = root.querySelector('#prodLibSearchClear');
    if (clear) clear.addEventListener('click', () => { input.value = ''; apply(); });
  }
}

/* ---------------------------------------------------------------- 视图 3：歌曲辨识 */

async function viewDiscern(root, ctx, params) {
  const produced = ctx.units.map((u) => u.mos_week);
  const pick = params.week && produced.includes(params.week) ? params.week : (produced[produced.length - 1] || null);
  if (!pick) {
    root.innerHTML = `${statusLine([])}${subnav('discern')}${notice('尚无已生产周次可供辨识。')}`;
    return;
  }
  const week = ctx.weekMap.get(pick);
  const unit = ctx.unitMap.get(pick);
  const results = discernCandidates({ week, songs: ctx.songs, unit, framework: ctx.framework, lex: ctx.lex });
  const summary = summarizeDiscernment(results);

  root.innerHTML = `
    ${statusLine([`周次 ${esc(pick)}`, `候选 ${results.length}`, `Core Candidate ${summary.core_candidates.length}`])}
    ${subnav('discern')}
    <section class="card hero">
      <div class="section-head"><h2>候选周次</h2><span class="chip">候选 = 音乐库全量</span></div>
      <div class="facets">
        ${produced.map((w) => `<a class="facet" href="#/production?view=discern&week=${esc(w)}"${w === pick ? ' aria-current="page"' : ''}>${esc(w)}</a>`).join('')}
      </div>
      <div class="cards">
        ${row('本周经文', week.bible_passage_id)}${row('核心真理', week.core_truth.text)}
        ${row('LQ', week.life_question_id)}${row('MM 主题', (week.music_unit_id || []).join('+'))}
        ${row('音乐功能', (week.music_function || []).map(esc).join('/'))}
      </div>
    </section>
    <section class="card hero">
      <div class="section-head"><h2>候选辨识汇总</h2><span class="chip">${esc(PLATFORM.id)}</span></div>
      <div class="cards">
        ${results.map((r) => `
          <div class="entry"><span class="entry-main">
            <span class="entry-kicker">${esc(r.candidate_song)}</span>
            <span class="entry-title">${esc(r.decision)} ｜ ${esc(r.song_relation)} ｜ 主功能 ${esc(r.primary_function || '—')}</span>
            <span class="entry-note">tier ${esc(r.tier)} ｜ 生命周期 ${esc(r.review_status)} ｜ 风险 ${r.risks.map((x) => x.code + '[' + x.severity + ']').join('、') || '无'} ｜ 需人工 ${r.human_review_required ? '是' : '否'}</span>
          </span>${gateChip(r.risks.some((x) => x.severity === 'HIGH') ? 'BLOCK' : (r.song_relation === 'not_yet_assessed' ? 'REVIEW' : 'PASS'))}</div>`).join('')}
      </div>
      ${notice('Tier 与 Review Status 分别输出、互不推导；本周适配裁决与歌曲生命周期是两个层级，不得合并。')}
    </section>
    ${results.map((r) => `
      <section class="card hero">
        <div class="section-head"><h2>${esc(r.candidate_song)}</h2><span class="chip">${esc(r.decision)}</span></div>
        <div class="cards">
          <div class="entry"><span class="entry-main"><span class="entry-kicker">Song_Relation</span>
            <span class="entry-title">${esc(r.song_relation)}</span>
            <span class="entry-note">${esc(r.song_relation_evidence)}</span></span></div>
          <div class="entry"><span class="entry-main"><span class="entry-kicker">Gospel Structure</span>
            <span class="entry-title">${esc(r.gospel_structure)}</span></span></div>
        </div>
        <div class="cards">
          ${DIM_LABEL.map(([k, label]) => `<div class="entry"><span class="entry-main">
            <span class="entry-kicker">${esc(label)}</span>
            <span class="entry-note">${esc(r.eight_dimensions[k])}</span></span></div>`).join('')}
        </div>
        <div class="cards">
          <div class="entry"><span class="entry-main"><span class="entry-kicker">S6 实践转换（对象/内容/时间/方式）</span>
            <span class="entry-title">${esc(r.s6.object)} ${esc(r.s6.content)} ${esc(r.s6.time)} ${esc(r.s6.method)}</span>
            <span class="entry-note">${r.s6.ok ? '四要素齐备' : '缺 ' + (r.s6.missing || []).join('、') + ' → 不得自动生成虚假的完整结果'}</span></span></div>
          <div class="entry"><span class="entry-main"><span class="entry-kicker">S7 传递转换（对象/渠道/验证）</span>
            <span class="entry-title">${esc(r.s7.target)} ${esc(r.s7.channel)} ${esc(r.s7.verification)}</span>
            <span class="entry-note">${r.s7.ok ? '成立' : '不成立'}</span></span></div>
        </div>
        <div class="section-head"><h2>决策轨迹</h2><span class="chip">不受只看最终答案</span></div>
        ${r.trace.map((t) => `<div class="notice">${esc(t)}</div>`).join('')}
      </section>`).join('')}`;
}

/* ---------------------------------------------------------------- 视图 4：生产计划 */

async function viewProducer(root, ctx, params) {
  const modeParam = params.mode || 'single';
  const mode = modeParam === 'year' ? PRODUCE_MODES.YEAR
    : modeParam === 'range' ? PRODUCE_MODES.RANGE : PRODUCE_MODES.SINGLE;
  const from = params.from || 'W05';
  const to = params.to || (mode === PRODUCE_MODES.RANGE ? 'W10' : (mode === PRODUCE_MODES.YEAR ? 'W52' : from));

  const plan = planProduction({
    mode,
    from: mode === PRODUCE_MODES.YEAR ? 'W01' : from,
    to: mode === PRODUCE_MODES.YEAR ? 'W52' : to,
    existingWeeks: ctx.weeks.map((w) => `${ctx.annual.annual_id ? 2027 : 2027}-${w.mos_week}`),
    library: ctx.libIndex,
    usage: ctx.usage,
  });

  const links = [
    ['single', '单周 W05', 'W05', 'W05'],
    ['range', '连续 W05–W10', 'W05', 'W10'],
    ['year', '全年 W01–W52', 'W01', 'W52'],
  ];

  root.innerHTML = `
    ${statusLine([`计划 ${plan.from}–${plan.to}`, `请求 ${plan.requested} 周`, `剩余 ${plan.remaining} 周`])}
    ${subnav('producer')}
    <section class="card hero">
      <div class="section-head"><h2>生产请求</h2><span class="chip">默认 Human Review Gate</span></div>
      <div class="facets">
        ${links.map(([m, label, f, t]) => `<a class="facet" href="#/production?view=producer&mode=${m}&from=${f}&to=${t}"${m === modeParam ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('')}
      </div>
      ${notice(`批量选择<b>不会</b>绕过人工审核：每周仍需逐周通过单元层审查门；上游周记录缺失的周次为 BLOCK。`)}
      ${plan.capacity && plan.capacity.warning
        ? notice(`<strong>${esc(CAPACITY_CODE)}</strong>｜${esc(plan.capacity.detail)}`, 'error')
        : notice(esc(plan.capacity ? plan.capacity.detail : ''))}
    </section>
    <section class="card hero">
      <div class="section-head"><h2>计划明细</h2><span class="chip">平台只产出计划，不写内容</span></div>
      <div class="cards">
        ${plan.entries.slice(0, 60).map((e) => `
          <div class="entry"><span class="entry-main">
            <span class="entry-kicker">${esc(e.week)} ｜ ${e.already_produced ? '已生产（历史周次，不重写）' : '未生产'}</span>
            <span class="entry-title">上游 ${e.upstream_ready ? '就绪' : '缺失'} ｜ 动作 ${esc(e.action)}</span>
            <span class="entry-note">${e.already_produced ? '历史周次保持原样' : (e.action === 'blocked_capacity' ? '无未使用歌曲 → 须先裁定扩库或复用规则' : '需先建立上游周记录：' + e.requires.join('、'))}</span>
          </span>${gateChip(e.gate || 'PASS')}</div>`).join('')}
      </div>
      ${plan.entries.length > 60 ? notice(`仅显示前 60 周（共 ${plan.entries.length} 周）。`) : ''}
    </section>
    <section class="card hero">
      <div class="section-head"><h2>平台支持 / 不支持的</h2><span class="chip">§八 / §九</span></div>
      <div class="cards">
        <div class="entry"><span class="entry-main"><span class="entry-title">支持</span>
          <span class="entry-note">单周生产、连续区间、全年请求；逐周门状态；曲库容量告警；跨周复用提示；单元层 PASS/REVIEW/BLOCK。</span></span></div>
        <div class="entry"><span class="entry-main"><span class="entry-title">不支持（明确不实现）</span>
          <span class="entry-note">推荐算法、AI 选歌、同步服务器、用户系统、自动填满 52 周、把证据不足歌曲伪装成合格歌曲。</span></span></div>
      </div>
    </section>`;
}

/* ---------------------------------------------------------------- 视图 5：校准与版本 */

async function viewCalibration(root, ctx) {
  const issues = ctx.calib.issues || [];
  const sum = summarizeIssues(issues);
  const gov = governanceView(ctx.gov);
  const invalid = issues.filter((i) => !validateIssue(i).ok);

  root.innerHTML = `
    ${statusLine([`问题 ${sum.total}`, `未结案 ${sum.open}`, `已修 ${sum.fixed}`])}
    ${subnav('calibration')}
    ${notice('核心纪律：发现问题 → 记录 → 分类 → 累积 → 定期复盘 → 形成 V1.1/V1.2 修订。绝不「发现问题 → 自动修改已冻结的技能」。')}
    <section class="card hero">
      <div class="section-head"><h2>问题统计</h2><span class="chip">${esc(CATEGORY.length)} 类</span></div>
      <div class="cards">
        ${Object.entries(sum.by_status).map(([k, v]) => row(k, v)).join('')}
        ${Object.entries(sum.by_layer || {}).map(([k, v]) => row('归属层 ' + k, v)).join('')}
      </div>
      ${invalid.length ? notice(`有 ${invalid.length} 条记录结构不合法。`, 'error') : notice('全部记录结构合法。')}
    </section>
    ${issues.map((i) => `
      <section class="card hero">
        <div class="section-head"><h2>${esc(i.issue_id)}｜${esc(i.description.slice(0, 28))}…</h2>
          <span class="chip">${esc(i.severity)} / ${esc(i.status)}</span></div>
        <div class="cards">
          ${row('周次', i.week || '—')}${row('歌曲', i.song || '—')}
          ${row('类别', i.category)}${row('归属层', i.resolution_layer || '—')}
          ${row('目标版本', i.target_version || '—')}${row('日期', i.date)}
        </div>
        <div class="notice">问题：${esc(i.description)}</div>
        <div class="notice">证据：${esc(i.evidence)}</div>
        <div class="notice">当前行为：${esc(i.current_behavior)}</div>
        <div class="notice">期望行为：${esc(i.expected_behavior)}</div>
        ${i.workaround ? `<div class="notice">权宜做法：${esc(i.workaround)}</div>` : ''}
        <div class="notice">建议变更：${esc(i.proposed_change)}</div>
        ${i.resolved_note ? `<div class="notice">处理说明：${esc(i.resolved_note)}</div>` : ''}
      </section>`).join('')}
    <section class="card hero">
      <div class="section-head"><h2>版本治理</h2><span class="chip">Frozen → Observed → Proposed → Released</span></div>
      <div class="cards">
        ${row('Frozen 技能', `${gov.frozen.skill_id}@${gov.frozen.skill_version}（${gov.frozen.skill_status}）`)}
        ${row('冻结校准', gov.frozen.calibration || '—')}
        ${row('历史裁决', (gov.frozen.historical_decisions || []).join('、'))}
        ${row('Observed', gov.counts.observed)}${row('Proposed', gov.counts.proposed)}${row('Released', gov.counts.released)}
      </div>
      ${gov.violations.length ? notice(gov.violations.join('；'), 'error') : notice('治理检查通过：不存在「直改 Frozen」记录。')}
      ${(gov.frozen.frozen_items || []).map((t) => `<div class="notice">冻结项：${esc(t)}</div>`).join('')}
      ${(gov.proposed || []).map((p) => `
        <div class="notice"><strong>${esc(p.proposal_id)}</strong> → ${esc(p.target)}@${esc(p.target_version)}（${esc(p.status)}）<br>
        ${(p.items || []).map(esc).join('；')}<br>${esc(p.requires || '')}</div>`).join('')}
      ${(gov.released || []).map((r) => `
        <div class="notice"><strong>${esc(r.version)}</strong>｜${esc(r.name || '')}｜${esc(r.date)}<br>
        范围：${(r.scope || []).map(esc).join('、')}<br>回归：${esc(r.regression || '—')}</div>`).join('')}
    </section>`;
}

/* ---------------------------------------------------------------- 视图 6：周音乐索引 */

async function viewWeek(root, ctx) {
  const rows = ctx.units.map((u) => {
    const a = assessUnit(ctx, u);
    return { week: u.mos_week, unit: u, gate: a ? a.gate : null, song: a ? a.song : null };
  });
  root.innerHTML = `
    ${statusLine([`已生产周次 ${rows.length}`, 'W01–W04', 'W05 不自动生产'])}
    ${subnav('week')}
    ${notice('周音乐页（#/week/WNN）按周显示：经文 / 核心真理 / LQ / MM / 核心歌 / 关系 / 功能 / 审查门 / 复用 / S6 / S7 / 资源入口。未生产的周次不出现在此列表 —— 平台不指定未来周次。')}
    <section class="card hero">
      <div class="section-head"><h2>周次列表</h2><span class="chip">Production Record</span></div>
      <div class="cards">
        ${rows.map((r) => `
          <a class="entry" href="#/week/${esc(r.week)}"><span class="entry-main">
            <span class="entry-kicker">${esc(r.week)} ｜ ${esc((ctx.weekMap.get(r.week) || {}).bible_passage_id || '—')} ｜ ${esc((ctx.weekMap.get(r.week) || {}).life_question_id || '—')}</span>
            <span class="entry-title">${esc(r.song ? r.song.title : r.unit.core_song)}</span>
            <span class="entry-note">审查门 ${esc(r.unit.review_gate ? r.unit.review_gate.theological_review : '—')} ｜ 资源 RESOURCE_PENDING（未导入）</span>
          </span>${gateChip(r.gate ? r.gate.state : 'REVIEW')}</a>`).join('') || notice('尚无已生产周次。')}
      </div>
    </section>`;
}

/* ---------------------------------------------------------------- 视图 7：人工审查 */

async function viewReview(root, ctx) {
  const records = (ctx.reviewRecords && ctx.reviewRecords.records) || [];
  const vocab = (ctx.reviewRecords && ctx.reviewRecords.decision_vocabulary) || ['ACCEPT', 'REVISE', 'HOLD', 'REJECT'];
  const promoPending = ((ctx.promotions && ctx.promotions.promotions) || []).filter((p) => p.accepted_by_human === false);
  const gateNeeds = ctx.units.filter((u) => {
    const g = (u.review_gate || {}).theological_review;
    return g !== 'confirmed';
  });

  root.innerHTML = `
    ${statusLine([`审查记录 ${records.length} 条`, `待人工 ${promoPending.length + gateNeeds.length} 项`, '记录不反写 Frozen Skill'])}
    ${subnav('review')}
    ${notice('Human Review Gate：人工可记录 <strong>ACCEPT / REVISE / HOLD / REJECT</strong>。所有裁决进入 <strong>production review record</strong>（content/production/review-records.json），留下 decision / reason / evidence / reviewer / timestamp。记录层只留档：<strong>不反写 Frozen Skill、不修改既有歌曲裁决、不改变 W01–W04 历史结果、不触发自动升层或自动生产。</strong>')}
    <section class="card hero">
      <div class="section-head"><h2>当前待人工事项</h2><span class="chip">${promoPending.length + gateNeeds.length} 项</span></div>
      <div class="cards">
        ${promoPending.map((p) => `
          <div class="entry"><span class="entry-main">
            <span class="entry-kicker">升层试批验收 ｜ ${esc(p.song_id)} ｜ 批次 ${esc(p.batch || '—')}</span>
            <span class="entry-title">锚点 ${esc(p.anchor ? p.anchor.core_passage : '—')} 是否认可</span>
            <span class="entry-note">accepted_by_human=false；依据 song-anchor-determinations.json</span>
          </span><span class="chip warn">AWAITING</span></div>`).join('')}
        ${gateNeeds.map((u) => `
          <a class="entry" href="#/week/${esc(u.mos_week)}"><span class="entry-main">
            <span class="entry-kicker">单元审查门 ｜ ${esc(u.mos_week)}</span>
            <span class="entry-title">${esc((u.review_gate || {}).theological_review || '—')}</span>
            <span class="entry-note">待复核三项见周记录 note；单元层结论不反写歌曲层</span>
          </span><span class="chip warn">NEEDS_HUMAN_REVIEW</span></a>`).join('')}
        ${(promoPending.length + gateNeeds.length) ? '' : '<div class="entry"><span class="entry-main"><span class="entry-title">当前无待人工事项</span></span></div>'}
      </div>
    </section>
    <section class="card hero">
      <div class="section-head"><h2>审查记录（production review record）</h2><span class="chip">${records.length} 条</span></div>
      ${records.length ? `
        <div class="cards">
          ${records.map((r) => `
            <div class="entry"><span class="entry-main">
              <span class="entry-kicker">${esc(r.record_id)} ｜ ${esc(r.target_kind)} ｜ ${esc(r.target_id)}</span>
              <span class="entry-title">${esc(r.decision)} ｜ ${esc(r.reviewer)} ｜ ${esc(r.timestamp)}</span>
              <span class="entry-note">${esc(r.reason)}${r.evidence ? ' ｜ 依据：' + esc(r.evidence) : ''}${r.follow_up ? ' ｜ 后续：' + esc(r.follow_up) : ''}</span>
            </span><span class="chip">${esc(r.decision)}</span></div>`).join('')}
        </div>` : notice('当前 0 条记录 —— 试批 5 首的 accepted_by_human 仍为 false，等待人工验收。记录由人工写入数据文件；平台对 content/** 只读，不代填 reviewer 与 timestamp。')}
      <div class="notice">裁决词表：${vocab.map((v) => esc(v)).join(' / ')}。ACCEPT 不自动改 song.review_status / tier / 八维，也不自动升层剩余 40 首。</div>
    </section>
    <section class="card hero">
      <div class="section-head"><h2>记录模板（人工留档用）</h2><span class="chip">复制后由人工写入</span></div>
      <div class="notice mono">{
  "record_id": "MUS-RR-0001",
  "target_kind": "promotion_trial",
  "target_id": "（对象 ID，如某首升层试批歌曲）",
  "decision": "ACCEPT 或 REVISE 或 HOLD 或 REJECT",
  "reason": "（必填，≥10 字）",
  "evidence": "文件 / 记录 / 引文，可为 null",
  "reviewer": "（人工姓名，系统不得代填）",
  "timestamp": "ISO 8601 时间",
  "follow_up": "后续动作，可为 null"
}</div>
      <div class="notice">写入位置：content/production/review-records.json 的 records[]。写入后运行 validate / smoke / regression 确认结构合法。</div>
    </section>`;
}

/* 分类枚举来自 app/calibration.js（唯一来源），不在视图层重复声明内容字符串。 */

/* ---------------------------------------------------------------- 入口 */

export async function renderProduction(root, params = {}) {
  const view = params.view || 'dashboard';
  root.innerHTML = `${statusLine(['加载中…'])}<div class="empty">正在读取生产平台内容…</div>`;
  let ctx;
  try {
    ctx = await loadContext();
  } catch (err) {
    root.innerHTML = `${statusLine([])}${notice('生产平台内容读取失败：' + esc(err.message) + '（联网打开一次即可缓存）。', 'error')}`;
    return;
  }
  try {
    if (view === 'library') return await viewLibrary(root, ctx);
    if (view === 'discern') return await viewDiscern(root, ctx, params);
    if (view === 'week') return await viewWeek(root, ctx);
    if (view === 'review') return await viewReview(root, ctx);
    if (view === 'producer') return await viewProducer(root, ctx, params);
    if (view === 'calibration') return await viewCalibration(root, ctx);
    return await viewDashboard(root, ctx);
  } catch (err) {
    root.innerHTML = `${statusLine([])}${notice('视图渲染失败：' + esc(err.message), 'error')}`;
  }
}

export default { renderProduction, PLATFORM, GATE, weekNumber };
