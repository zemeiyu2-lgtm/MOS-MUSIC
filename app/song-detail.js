/* =========================================================
   MOS-MUSIC｜Song Detail（歌曲详情页 · V1.1-A，MODULE 13）
   ---------------------------------------------------------
   单首歌曲的完整档案视图，按固定顺序组织：
     01 基本资料 → 02 Bible Anchor → 03 Theme / Ministry Mapping
     → 04 Discernment → 05 Human Review → 06 Usage History
     → 07 Missing Resources → 08 Copyright / Sources

   展示层状态词约定（无 schema 承载，只用于界面）：
     NOT_ASSESSED  = 尚未辨识（不是漏数据）
     NOT_IMPORTED  = 资源槽位为空（不是占位遗漏）
     未记载        = 数据里没有这一项（如实显示，不代填）

   边界：本页只读；不改歌曲记录、不做推荐、不触发升层或生产。
========================================================= */

import { getIndex } from './content-source.js';
import { resourceSlots, resourceTypeLabel } from './song-resources.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const NOT_ASSESSED = 'NOT_ASSESSED';

const DIMS = [
  ['biblical_truth', '圣经真理'], ['theological_formation', '神学形成'],
  ['emotional_formation', '情感形成'], ['community', '共同体'],
  ['congregational_participation', '会众参与'], ['generational_transmission', '代际传递'],
  ['life_practice', '生活实践'], ['mission_orientation', '使命方向'],
];

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

function sectionHead(no, title, tag) {
  return `<div class="section-head"><h2>${no} ${esc(title)}</h2><span class="chip">${esc(tag)}</span></div>`;
}

function splitTitle(title) {
  const m = /^(.*?)（(.*)）\s*$/.exec(String(title || ''));
  return m ? { zh: m[1], en: m[2] } : { zh: String(title || ''), en: null };
}

/* ---------------------------------------------------------------- 数据装载 */

async function loadDetail(songId) {
  const [promotions, determinations, usage, resIndex, reviewRecords, registry]
    = await Promise.all([
      getIndex('promotions').catch(() => null),
      getIndex('determinations').catch(() => null),
      getIndex('usage').catch(() => null),
      getIndex('song_resources').catch(() => null),
      getIndex('review_records').catch(() => null),
      getIndex('registry').catch(() => null),
    ]);
  const promo = ((promotions && promotions.promotions) || []).find((p) => p.song_id === songId) || null;
  const det = ((determinations && determinations.determinations) || []).find((d) => d.song_id === songId) || null;
  const usageRow = ((usage && usage.songs) || []).find((s) => s.song_id === songId) || null;
  const reg = ((registry && registry.records) || []).find((r) => r.song_id === songId) || null;
  const reviews = ((reviewRecords && reviewRecords.records) || []).filter((r) => r.target_id === songId);
  return { promo, det, usageRow, resIndex, reviews, reg };
}

/* ---------------------------------------------------------------- 视图 */

export async function renderSongDetail(root, songId) {
  if (!/^MUS-S-\d{4}$/.test(String(songId || ''))) {
    root.innerHTML = `<div class="notice error">无效歌曲 ID：${esc(songId)}</div>
      <div class="btn-row"><a class="link" href="#/library">← 返回音乐库</a></div>`;
    return;
  }

  let s = null;
  /* 歌曲详情记录：fetch 兜底（SW 缓存优先），本地未缓存且离线时如实报错 */
  try {
    const rec = await fetch(`content/songs/${songId}.json`, { cache: 'no-cache' });
    if (rec.ok) s = await rec.json();
  } catch (_) { /* 离线且未缓存 → 下方如实报错 */ }

  const ctx = await loadDetail(songId);
  const back = `<div class="btn-row"><a class="link" href="#/library">← 返回音乐库</a>
    <a class="link" href="#/production?view=library">生产平台·音乐库</a></div>`;

  /* 登记层-only（未升详情层）：如实说明，不伪装成歌曲档案 */
  if (!s) {
    root.innerHTML = `
      <div class="notice net">歌曲详情 ${esc(songId)}</div>
      <section class="card hero">
        <div class="section-head"><h2>该歌曲只有入库登记记录</h2><span class="chip">CI-0018</span></div>
        ${ctx.reg ? `
          <div class="cards">
            ${kv('中文歌名', val(ctx.reg.title_zh || '未记载'))}
            ${kv('英文歌名', val(ctx.reg.title_en || '未记载'))}
            ${kv('登记状态', val(String(ctx.reg.work_status)))}
            ${kv('登记层版权口径', val(String(ctx.reg.copyright_status)) + '（来源与行动状态，不是法律结论）')}
          </div>` : '<div class="notice error">登记记录不可读。</div>'}
        <div class="notice">这首歌尚未升入歌曲详情层（曲库 50 首 = 详情层 10 + 登记层 40 待升层，CI-0018 保持 OPEN）。
        没有详情记录就没有辨识结论、没有经文锚点、没有使用历史 —— 平台不会用登记记录伪装成歌曲档案。</div>
        ${back}
      </section>`;
    return;
  }

  const t = splitTitle(s.title);
  const dims = s.eight_dimensions || {};
  const dimAssessed = DIMS.filter(([k]) => dims[k] && dims[k].score != null);
  const mappingStatus = dimAssessed.length === DIMS.length ? 'discerned（样本研究值，待人工审核）' : 'preliminary';

  /* 02 锚点 */
  const anchorVerification = (ctx.det && ctx.det.verification && ctx.det.verification.anchor) || null;
  const anchorHuman = ctx.promo ? ctx.promo.accepted_by_human : null;
  const anchorCard = (s.bible && s.bible.core_passage) ? `
    <section class="card hero">
      ${sectionHead('02', 'Bible Anchor（圣经锚点）', 'Anchor ≠ sermon selection')}
      <div class="notice error"><strong>Anchor ≠ sermon selection</strong>｜锚点是这首圣诗自身歌词指向的经文（固有属性），
      不是从任何周次反推的选择依据；本周该唱什么歌只能由周次辨识（先经文后音乐）产生。</div>
      <div class="cards">
        ${kv('Scripture Reference', val(s.bible.core_passage))}
        ${kv('Anchor Type', val((ctx.det && ctx.det.anchor_evidence_type) || 'inherent_hymn_anchor（歌的固有属性，非周次推导）'))}
        ${kv('Evidence Status', val(anchorVerification || 'unrecorded'), ctx.det ? ctx.det.anchor_basis : null)}
        ${kv('Determination Record', val(ctx.det ? 'song-anchor-determinations.json（已留档）' : '未留档'))}
        ${kv('是否经过人工确认', anchorHuman === true ? chip('ACCEPTED', 'good') : chip('NOT_YET（accepted_by_human=false）', 'warn'))}
      </div>
      ${(s.bible.bible_reference_ids || []).length ? `<div class="notice mono">Reference IDs：${s.bible.bible_reference_ids.map(esc).join('、')}</div>` : ''}
    </section>` : `
    <section class="card hero">
      ${sectionHead('02', 'Bible Anchor（圣经锚点）', 'Anchor ≠ sermon selection')}
      <div class="notice">经文锚点：${NOT_ASSESSED}（该歌曲尚无锚点认定记录；平台不代填）。</div>
    </section>`;

  /* 03 主题映射 */
  const themeCard = `
    <section class="card hero">
      ${sectionHead('03', 'Theme / Ministry Mapping（主题与事工映射）', esc(mappingStatus))}
      <div class="cards">
        ${kv('Initial Theme', val((ctx.reg && ctx.reg.initial_theme) || '未记载（登记层未填）'))}
        ${kv('Theme Mapping', val(s.discipleship && s.discipleship.main_theme ? s.discipleship.main_theme : NOT_ASSESSED),
          ctx.det && ctx.det.preliminary ? ctx.det.preliminary.main_theme_basis : null)}
        ${kv('MM Mapping', val((s.discipleship && (s.discipleship.music_unit_refs || s.discipleship.music_unit_ids) || []).join('、') || NOT_ASSESSED))}
        ${kv('Primary Function', val(s.formation && s.formation.primary_function
          ? `${s.formation.primary_function}（${FUNC_LABEL[s.formation.primary_function] || '—'}）` : NOT_ASSESSED),
          ctx.det && ctx.det.preliminary ? ctx.det.preliminary.primary_function_basis : null)}
        ${kv('Mapping Status', val(mappingStatus),
          dimAssessed.length === DIMS.length ? '映射来自完成的八维辨识' : '映射为升层试批的初步认定（preliminary_pending_acceptance），未经人工验收')}
      </div>
      <div class="notice">preliminary = 升层试批的初步认定（待人工验收）；discerned = 来自已完成的歌曲辨识。两者不得混写。</div>
    </section>`;

  /* 04 辨识 */
  const relationRows = ((ctx.usageRow && ctx.usageRow.used_in) || [])
    .map((u) => `${esc(u.week)}：${esc(u.song_relation)}（${u.role === 'core' ? '主歌' : '辅助歌'}）`);
  const highRisks = (ctx.usageRow && ctx.usageRow.high_risk_codes) || [];
  const discernCard = `
    <section class="card hero">
      ${sectionHead('04', 'Discernment（八维辨识）', `${dimAssessed.length}/8 已评`)}
      <div class="cards">
        ${DIMS.map(([k, label]) => {
          const d = dims[k];
          const scored = d && d.score != null;
          return kv(label, scored
            ? val(`${d.score}/5`) + `　${chip('ASSESSED', 'good')}`
            : chip(NOT_ASSESSED, 'warn'),
            scored ? d.note : (d && d.note ? d.note : null));
        }).join('')}
      </div>
      <div class="cards">
        ${kv('Song_Relation', relationRows.length ? val(relationRows.join('；')) : chip(NOT_ASSESSED, 'warn'),
          relationRows.length ? '来自已生产周次的辨识留档' : '周相对字段：没有周次上下文就没有关系等级（库级辨识一律 not_yet_assessed）')}
        ${kv('Risk', highRisks.length ? val(highRisks.join('、')) : chip(NOT_ASSESSED, 'warn'),
          highRisks.length ? '来自使用历史的风险记录' : '尚未进行带周次的风险扫描')}
        ${kv('Secondary Function', val((ctx.usageRow && ctx.usageRow.secondary_functions || []).join('、') || NOT_ASSESSED))}
        ${kv('S6 / S7', chip(NOT_ASSESSED, 'warn'), '单元层字段（实践转换 / 传递转换）：由周次单元承载，歌曲层不填，防止把歌当成完整门训单元')}
        ${kv('Tier', val(s.tier) + '　（A 核心 / B 推荐 / C 研究；独立字段）')}
        ${kv('Review Status', val(s.review_status) + '　（生命周期七态；与 tier 互不推导）')}
      </div>
    </section>`;

  /* 05 人工审查 */
  const pendingItems = [];
  if (ctx.promo && ctx.promo.accepted_by_human === false) pendingItems.push('升层试批验收（anchor / 主题映射 / 归属记载是否认可）');
  if (ctx.det && ctx.det.verification) {
    const v = ctx.det.verification;
    if (v.identity === 'literature_based_pending_verification') pendingItems.push('作品级归属核验（词曲版本仍为文献记载）');
    if (v.chinese_translation === 'unverified') pendingItems.push('中文译本版本选择与核验');
    if (v.legal_status === 'not_determined') pendingItems.push('法律状态判定（当前 unknown = 未判定，不得推定公版）');
  }
  if ((s.review_status || '').startsWith('under_review')) pendingItems.push(`歌曲生命周期推进（当前 ${s.review_status}）`);
  const reviewCard = `
    <section class="card hero">
      ${sectionHead('05', 'Human Review（人工审查）', `${pendingItems.length} 项待人工`)}
      <div class="cards">
        ${pendingItems.length ? pendingItems.map((p) => `
          <div class="entry"><span class="entry-main">
            <span class="entry-kicker">待人工判断</span><span class="entry-title">${esc(p)}</span></span></div>`).join('')
          : '<div class="entry"><span class="entry-main"><span class="entry-title">当前无待人工事项（由数据如实判断，不代表整体已验收）</span></span></div>'}
        ${kv('当前状态', ctx.promo && ctx.promo.accepted_by_human === false ? chip('AWAITING HUMAN ACCEPTANCE', 'warn') : chip('NOT_RECORDED', 'warn'))}
        ${kv('审核人 / 审核时间 / 决定', val('无 —— 尚无人工裁决记录；平台不自认已验收'))}
        ${kv('审查记录', val(`${ctx.reviews.length} 条`), '人工裁决记录层：content/production/review-records.json（ACCEPT / REVISE / HOLD / REJECT），由人工写入')}
      </div>
      <div class="notice">记录裁决请到 <a href="#/production?view=review">生产平台·Human Review</a>；记录不反写歌曲数据，也不代替验收本身。</div>
    </section>`;

  /* 06 使用历史 */
  const usedIn = (ctx.usageRow && ctx.usageRow.used_in) || [];
  const usageCard = `
    <section class="card hero">
      ${sectionHead('06', 'Usage History（使用历史）', `${usedIn.length} 次`)}
      <div class="cards">
        ${kv('Used Weeks', val(usedIn.map((u) => u.week).join('、') || NOT_ASSESSED))}
        ${kv('Core Uses', val(String((ctx.usageRow && ctx.usageRow.times_as_core) || 0)))}
        ${kv('Secondary Uses', val(String((ctx.usageRow && ctx.usageRow.times_as_auxiliary) || 0)))}
        ${kv('Last Used', val(usedIn.length ? usedIn[usedIn.length - 1].week : '—'))}
        ${kv('Reuse Review', val((ctx.usageRow && ctx.usageRow.reuse_status) || 'never_used'), '复用只提示不否决：是否可接受属人工裁决')}
      </div>
      ${usedIn.length ? `
        <div class="cards">
          ${usedIn.map((u) => `
            <a class="entry" href="#/week/${esc(u.week)}"><span class="entry-main">
              <span class="entry-kicker">${esc(u.week)} ｜ ${esc(u.bible_passage || '')} ｜ ${esc(u.life_question || '')}</span>
              <span class="entry-title">${u.role === 'core' ? '主歌' : '辅助歌'} ｜ 功能 ${(u.music_function || []).map(esc).join('/')}</span>
              <span class="entry-note">关系 ${esc(u.song_relation || '—')} ｜ 单元门 ${esc(u.unit_gate || '—')}</span>
            </span><span class="chip">周音乐 →</span></a>`).join('')}
        </div>` : '<div class="notice">本歌尚未被任何周次使用（never_used）。</div>'}
    </section>`;

  /* 07 资源槽位 */
  const slots = resourceSlots(ctx.resIndex, songId);
  const resCard = `
    <section class="card hero">
      ${sectionHead('07', 'Missing Resources（资源现状）', `${slots.filter((x) => x.status === 'NOT_IMPORTED').length}/6 未导入`)}
      <div class="cards">
        ${slots.map((x) => `
          <div class="entry"><span class="entry-main">
            <span class="entry-kicker">${esc(x.type)}｜${esc(x.label)}</span></span>
            <span class="chip warn">${esc(x.status)}</span></div>`).join('')}
      </div>
      <div class="notice">NOT_IMPORTED = 该槽位没有任何已导入资源（真实状态）。资源记录独立于歌曲档案（Song Resources 层）；
      本阶段只建立资源层结构，暂不强制导入实际文件，也不虚构资源。</div>
    </section>`;

  /* 08 版权与来源（每项资源独立显示） */
  const c = s.copyright || {};
  const copyCard = `
    <section class="card hero">
      ${sectionHead('08', 'Copyright / Sources（版权与来源）', esc(c.copyright_status || 'unknown'))}
      <div class="cards">
        ${kv('source', val(c.source || s.source || '未记载'))}
        ${kv('copyright_status', val(c.copyright_status || 'unknown'), '详情层法律状态词表；unknown = 未判定，不是「无版权」')}
        ${kv('license', val(c.license || '—'), c.usage_permission || null)}
        ${kv('verification_status', val(c.permission_evidence ? String(c.permission_evidence) : 'unverified（无凭证留档）'))}
        ${ctx.reg ? kv('登记层口径（来源与行动状态）', val(String(ctx.reg.copyright_status)) + '　→ 详情层映射结果：' + esc(String(ctx.reg.copyright_status_mapped)), '两个维度禁止互相映射（ADR-0012）；SOURCE_REQUIRED 表示「需要取得来源」，不是法律结论') : ''}
        ${kv('audio / lyrics 托管', val(`${c.audio_availability || 'none'} / ${c.lyrics_availability || 'none'}`), '不擅自托管未授权内容')}
      </div>
    </section>`;

  /* 01 基本资料（置顶） */
  root.innerHTML = `
    <div class="notice net">歌曲详情 ${esc(songId)} ｜ 只读 ｜ V1.1-A</div>
    ${back}
    <section class="card hero">
      ${sectionHead('01', '基本资料', esc(s.song_id))}
      <h1>${esc(t.zh)}</h1>
      ${t.en ? `<div class="entry-kicker">${esc(t.en)}</div>` : ''}
      ${ctx.det && ctx.det.title_en && !t.en ? `<div class="entry-kicker">${esc(ctx.det.title_en)}</div>` : ''}
      <div class="cards">
        ${kv('Song ID', val(s.song_id))}
        ${kv('中文歌名', val(t.zh))}
        ${kv('English Title', val(t.en || (ctx.det && ctx.det.title_en) || '未记载'))}
        ${kv('作者（词）', val((ctx.det && ctx.det.hymnology && ctx.det.hymnology.words_by) || s.author || '未记载'),
          (ctx.det && ctx.det.hymnology && ctx.det.hymnology.words_year) || null)}
        ${kv('作曲', val((ctx.det && ctx.det.hymnology && ctx.det.hymnology.music_by) || s.composer || '未记载'),
          ctx.det && ctx.det.hymnology && ctx.det.hymnology.tune ? `曲调 ${ctx.det.hymnology.tune}（${ctx.det.hymnology.music_year || '—'}）` : null)}
        ${kv('翻译', val((ctx.det && ctx.det.hymnology && ctx.det.hymnology.translator) || (ctx.reg && ctx.reg.translator) || '未记载（中文译本版本待核验）'))}
        ${kv('版本', val(s.version || '—'), (ctx.det && ctx.det.hymnology && ctx.det.hymnology.source_note) || null)}
        ${kv('来源', val(s.source || '未记载'))}
        ${kv('当前状态', `${chip(`tier ${s.tier}`)} ${chip(s.review_status, s.review_status === 'draft' ? 'warn' : '')} ${chip(`法律状态 ${c.copyright_status || 'unknown'}`, 'warn')}`,
          'tier 与生命周期互不推导；法律状态 unknown = 未判定')}
      </div>
      ${ctx.promo ? `<div class="notice">升层记录：${esc(ctx.promo.from_layer)} → ${esc(ctx.promo.to_layer)}（批次 ${esc(ctx.promo.batch)}｜accepted_by_human=false）</div>` : ''}
    </section>
    ${anchorCard}
    ${themeCard}
    ${discernCard}
    ${reviewCard}
    ${usageCard}
    ${resCard}
    ${copyCard}
    ${back}`;
}

export default { renderSongDetail };
