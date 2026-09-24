/* =========================================================
   MOS-MUSIC｜Week Music（周音乐页 · V1.1-A，MODULE 14）
   ---------------------------------------------------------
   按周查看音乐门训安排（只读，W01–W04 已生产周次）：
     Scripture / Core Truth / LQ / MM / Core Song / Song Relation
     / Primary Function / Review Gate / Reuse / S6 / S7
     + Resource Access（歌词 / 歌谱 / 示唱 / 伴奏；无资源 → RESOURCE_PENDING）

   边界：只读；不生产 W05、不指定未来周次、不反写任何裁决。
========================================================= */

import { getIndex, getWeek } from './content-source.js';
import { crossWeekReuse } from './production-rules.js';
import { resourceSlots, resourceTypeLabel } from './song-resources.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const NOT_ASSIGNED = 'NOT_ASSIGNED';

const FUNC_LABEL = {
  TR: '真理教导', MM: '记忆', EM: '情感形成', PR: '祈求',
  CO: '共同体', LI: '生活实践', MI: '使命', RP: '再生产',
};

function kv(k, v, note) {
  return `<div class="entry" style="border:0;border-bottom:1px solid var(--line);border-radius:0;">
    <span class="entry-main"><span class="entry-note">${esc(k)}</span></span>
    <span class="entry-note">${v}${note ? `<br><small>${esc(note)}</small>` : ''}</span></div>`;
}
function val(v) { return `<strong>${esc(v)}</strong>`; }
function chip(text, cls) { return `<span class="chip ${cls || ''}">${esc(text)}</span>`; }

export async function renderWeekMusic(root, weekParam) {
  const m = /^W(\d{2})$/.exec(String(weekParam || ''));
  if (!m) {
    root.innerHTML = `<div class="notice error">无效周次：${esc(weekParam)}（需 WNN 形式，如 W04）</div>`;
    return;
  }
  const wn = Number(m[1]);
  const weekId = `2027-${String(weekParam).toUpperCase()}`;

  let week = null;
  try { week = await getWeek(weekId); } catch (_) { /* 下方如实报错 */ }

  if (!week) {
    root.innerHTML = `
      <div class="notice net">周音乐 ${esc(String(weekParam).toUpperCase())}</div>
      <section class="card hero">
        <div class="section-head"><h2>该周次尚未生产</h2><span class="chip">W01–W04</span></div>
        <div class="notice">目前只有 W01–W04 已生产（W04 待人工复核）。平台不会自动生产 W05，也不会指定未来周次 ——
        每周必须先经文后音乐、逐周通过人工审核门。</div>
        <div class="cards">
          ${['W01', 'W02', 'W03', 'W04'].map((w) => `
            <a class="entry" href="#/week/${w}"><span class="entry-main">
              <span class="entry-kicker">${w}</span><span class="entry-title">查看周音乐</span></span>
              <span class="chip">→</span></a>`).join('')}
        </div>
      </section>`;
    return;
  }

  const [usage, resIndex] = await Promise.all([
    getIndex('usage').catch(() => null),
    getIndex('song_resources').catch(() => null),
  ]);
  let unit = null;
  try {
    const rec = await fetch(`content/annual/2027/units/MUS-U-2027-${week.mos_week}.json`, { cache: 'no-cache' });
    if (rec.ok) unit = await rec.json();
  } catch (_) { /* 单元缺失 → 如实显示 */ }

  const coreSongId = unit ? unit.core_song : week.core_song_id;
  const usageRow = coreSongId ? ((usage && usage.songs) || []).find((s) => s.song_id === coreSongId) : null;
  const usedHere = usageRow ? (usageRow.used_in || []).find((u) => u.week === week.mos_week) : null;
  const reuse = coreSongId ? crossWeekReuse({ songId: coreSongId, week: week.mos_week, usage }) : null;
  const gate = (unit && unit.review_gate) || {};
  const gateState = gate.theological_review === 'confirmed' ? 'CONFIRMED'
    : gate.theological_review === 'needs_human_review' ? 'NEEDS_HUMAN_REVIEW' : 'PENDING';

  const slots = coreSongId ? resourceSlots(resIndex, coreSongId) : [];
  const pendingCount = slots.filter((x) => x.status === 'NOT_IMPORTED').length;

  const s6 = unit && unit.seven_step_method ? unit.seven_step_method.S6_act : null;
  const s7 = unit && unit.seven_step_method ? unit.seven_step_method.S7_transmit : null;

  root.innerHTML = `
    <div class="notice net">周音乐 ${esc(week.mos_week)} ｜ ${esc(week.annual_id)} ｜ 只读</div>
    <div class="btn-row"><a class="link" href="#/production?view=dashboard">← 生产总览</a></div>

    <section class="card hero">
      <div class="section-head"><h2>${esc(week.mos_week)}｜${esc(week.bible_passage_id)}</h2><span class="chip">${esc(gateState)}</span></div>
      <div class="cards">
        ${kv('Scripture', val(week.bible_passage_id), week.sermon_week_ref)}
        ${kv('Core Truth', val(week.core_truth && week.core_truth.text ? week.core_truth.text : '缺失'),
          week.core_truth && week.core_truth.provenance ? `copy_policy=${week.core_truth.provenance.copy_policy}` : null)}
        ${kv('LQ', val(week.life_question_id || NOT_ASSIGNED), 'LQ 只做引用，不新建第二套')}
        ${kv('MM', val((week.music_unit_id || []).join('、') || NOT_ASSIGNED), week.mm_rationale ? week.mm_rationale.slice(0, 120) + '…' : null)}
        ${kv('Primary Function', val((week.music_function || []).map((f) => `${f}（${FUNC_LABEL[f] || '—'}）`).join('、') || NOT_ASSIGNED))}
      </div>
    </section>

    <section class="card hero">
      <div class="section-head"><h2>Core Song</h2><span class="chip">${esc(coreSongId || NOT_ASSIGNED)}</span></div>
      ${coreSongId ? `
        <div class="cards">
          ${kv('Core Song', `<a href="#/song/${esc(coreSongId)}">${val(coreSongId)} → 歌曲详情</a>`)}
          ${kv('Song Relation', usedHere ? val(usedHere.song_relation) : chip('NOT_RECORDED_IN_WEEK', 'warn'),
            '本周适配裁决（review_gate）与歌曲生命周期（review_status）互相独立，不得互推')}
          ${kv('Reuse', reuse ? val(reuse.reuse_status) : chip('NOT_ASSESSED', 'warn'), reuse ? reuse.detail : null)}
          ${unit && unit.song_selection_rationale ? kv('Selection Rationale', val(String(unit.song_selection_rationale).slice(0, 140) + '…')) : ''}
        </div>` : '<div class="notice">该周未指定核心歌曲（core_song_id 为空）。</div>'}
      ${unit && unit.music_function ? kv('Music Function（单元层）',
        val(unit.music_function.primary
          ? `${unit.music_function.primary}（${FUNC_LABEL[unit.music_function.primary] || '—'}）主 ＋ ${(unit.music_function.secondary || []).map((f) => `${f}（${FUNC_LABEL[f] || '—'}）`).join('、')}辅`
          : NOT_ASSIGNED)) : ''}
    </section>

    <section class="card hero">
      <div class="section-head"><h2>Review Gate（单元层审查门）</h2><span class="chip">${esc(gateState)}</span></div>
      <div class="cards">
        ${kv('本周适配裁决', val(gateState), '单元层 PASS/REVIEW/BLOCK 不反写歌曲层')}
        ${gate.song_relation ? kv('Song Relation（单元记录）', val(gate.song_relation)) : ''}
        ${gate.theological_risk ? kv('Theological Risk', val(gate.theological_risk)) : ''}
        ${gate.note ? kv('Note', val(gate.note)) : ''}
      </div>
    </section>

    <section class="card hero">
      <div class="section-head"><h2>S6 / S7（实践与传递转换）</h2><span class="chip">歌曲 ≠ 完整门训单元</span></div>
      <div class="cards">
        ${s6 ? kv('S6 行（实践转换）', val(s6.content || s6.prompt || NOT_ASSIGNED), s6.prompt) : chip(NOT_ASSIGNED, 'warn')}
        ${gate.practice_conversion ? kv('S6 四要素核验', val(gate.practice_conversion)) : ''}
        ${s7 ? kv('S7 传（传递转换）', val(s7.content || s7.prompt || NOT_ASSIGNED), s7.prompt) : chip(NOT_ASSIGNED, 'warn')}
        ${gate.transmission_conversion ? kv('S7 三要素核验', val(gate.transmission_conversion)) : ''}
      </div>
    </section>

    <section class="card hero">
      <div class="section-head"><h2>Resource Access（资源入口）</h2><span class="chip">${pendingCount}/${slots.length} RESOURCE_PENDING</span></div>
      ${coreSongId ? `
        <div class="cards">
          ${slots.map((x) => `
            <div class="entry"><span class="entry-main">
              <span class="entry-kicker">${esc(x.type)}｜${esc(resourceTypeLabel(x.type))}</span></span>
              <span class="chip warn">${esc(x.status === 'AVAILABLE' ? 'AVAILABLE' : 'RESOURCE_PENDING')}</span></div>`).join('')}
        </div>
        <div class="notice">RESOURCE_PENDING = 该资源尚未导入（V1.1-A 只建立资源层结构，暂不强制导入实际文件）。
        传递的是真理与形成，不是音乐文件；不擅自托管未授权内容。</div>`
        : '<div class="notice">无核心歌曲，无资源入口。</div>'}
    </section>

    <div class="btn-row">
      <a class="link" href="#/production?view=discern&week=${esc(week.mos_week)}">本周辨识明细 →</a>
      <a class="link" href="#/production?view=dashboard">← 生产总览</a>
    </div>`;
}

export default { renderWeekMusic };
