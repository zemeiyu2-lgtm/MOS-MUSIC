/* =========================================================
   MOS-MUSIC｜MOS Singing Coach（前台 · V3.x 基础层）
   ---------------------------------------------------------
   §十一 / §十二：独立产品模块，本轮只交付基础层。
   前台只显示：能练什么（十项能力）、练什么项目、我练过什么、
   反馈长什么样、两个接口的**真实状态**。

   铁律：
     · 不显示门训数据（周次 / 课程 / 进度 / 积分 / 成绩）；
     · 不显示任何分数 / 排名 / 徽章 / 通过结论；
     · 不判断属灵状态；反馈是描述，不是总评；
     · 接口未接入就如实说明「尚未接入」，绝不假装分析。
========================================================= */

import { esc } from './util.js';
import * as coach from '../coach.js';

const MODE_LABELS = { listen: '听', repeat: '跟', sight: '视唱', record: '录' };
const REF_LABELS = { score: '简谱', demo: '真人示唱', expression_reference: '人工表达参考' };

function itemHtml(it, capLabel) {
  const status = it.item_status === 'PRODUCED' ? '已制作' : '模型就位 · 内容待生产';
  return `<div class="entry" data-item="${esc(it.item_id)}">
    <span class="entry-main">
      <span class="entry-kicker">${esc(capLabel)} ｜ ${esc(it.item_id)}</span>
      <span class="entry-title">${esc(it.title)}</span>
      <span class="entry-note">${esc(it.goal)}</span>
      <span class="entry-note">练法：${(it.practice || []).map((p) => MODE_LABELS[p] || esc(p)).join(' · ')}
        ｜ 参照：${(it.reference || []).map((r) => REF_LABELS[r] || esc(r)).join(' · ')}</span>
    </span>
    <span class="chip">${esc(status)}</span>
  </div>`;
}

function sessionHtml(s, itemTitle) {
  const when = String(s.created_at || '').slice(0, 10);
  const mins = s.duration_seconds ? `${Math.round(s.duration_seconds / 60)} 分钟` : '未记时长';
  return `<div class="entry">
    <span class="entry-main">
      <span class="entry-kicker">${esc(when)} ｜ ${esc(s.session_id)}</span>
      <span class="entry-title">${esc(itemTitle || '自由练习')}</span>
      <span class="entry-note">${esc(mins)}${s.self_note ? ` ｜ ${esc(s.self_note)}` : ''}</span>
    </span>
  </div>`;
}

export async function renderCoach(root) {
  const [vocab, caps, items, indep, upload, ai, sessions, n] = await Promise.all([
    coach.loadVocab().catch(() => null),
    coach.capabilities().catch(() => []),
    coach.trainingItems().catch(() => []),
    coach.independence().catch(() => null),
    coach.uploadInterface().catch(() => null),
    coach.analyzeInterface().catch(() => null),
    coach.recentSessions(10).catch(() => []),
    coach.sessionCount().catch(() => 0),
  ]);

  if (!vocab) {
    root.innerHTML = `<section class="card"><div class="notice error">歌唱教练词表暂时读不到（离线首次启动时可能出现）。稍后重试即可。</div></section>`;
    return;
  }

  const fb = vocab.feedback_structure || {};
  const example = fb.example || {};
  const capOf = new Map(caps.map((c) => [c.key, c.label]));
  const titleOf = new Map(items.map((i) => [i.item_id, i.title]));

  root.innerHTML = `
    <section class="card hero">
      <div class="eyebrow">MOS Singing Coach</div>
      <h1>${esc(vocab.product_name || 'MOS Singing Coach')}</h1>
      <p>这是<strong>歌唱训练</strong>模块：练音高、节奏、视唱、气息、长音、咬字、音域、分句、力度、表达。
      它与门训系统彼此独立 —— ${esc((indep && indep.statement) || '')}</p>
      <div class="notice">这里<strong>不会</strong>显示：门训完成度、积分、成绩或属灵评价。练习记录只写事实：练了什么、多久、自己一句话。</div>
      ${indep ? `<div class="facets">${(indep.does_not_read || []).map((x) => `<span class="chip">不读：${esc(x)}</span>`).join('')}</div>` : ''}
    </section>

    <section class="card">
      <div class="section-head"><h2>可以练什么</h2><span class="chip">${caps.length} 项能力</span></div>
      <div class="cards">
        ${caps.map((c) => `
          <div class="entry"><span class="entry-main">
            <span class="entry-title">${esc(c.label)}</span>
            <span class="entry-note">${esc(c.goal)}</span>
            <span class="entry-note">看得见的变化：${(c.observable || []).map((x) => esc(x)).join('；')}</span>
            <span class="entry-note">不评价：${(c.not_judged || []).map((x) => esc(x)).join('；')}</span>
          </span></div>`).join('')}
      </div>
    </section>

    <section class="card">
      <div class="section-head"><h2>训练项目</h2><span class="chip">模型就位 · 内容待生产</span></div>
      <div class="cards">
        ${items.map((it) => itemHtml(it, capOf.get(it.capability) || it.capability)).join('')}
      </div>
      <div class="notice">这 ${items.length} 个项目是<strong>训练项目模型</strong>（练法 · 参照 · 可观察项已定义），
      本轮还没有把它们做成课程内容 —— 尚未生产，不是遗漏。歌曲专属的教唱内容属于歌曲自己的单元，不在这里。</div>
    </section>

    <section class="card">
      <div class="section-head"><h2>我的练习记录</h2><span class="chip" id="ccCount">${n} 次</span></div>
      <div class="entry" style="display:block">
        <div class="entry-main">
          <span class="entry-kicker">记一次练习（只存本机）</span>
          <div class="btn-row" style="flex-wrap:wrap;gap:var(--sp-2)">
            <select id="ccItem" aria-label="练的项目">
              ${items.map((i) => `<option value="${esc(i.item_id)}">${esc(capOf.get(i.capability) || '')}｜${esc(i.title)}</option>`).join('')}
            </select>
            <select id="ccMode" aria-label="练法">
              ${Object.keys(MODE_LABELS).map((k) => `<option value="${k}">${MODE_LABELS[k]}</option>`).join('')}
            </select>
            <input id="ccMin" type="number" min="1" max="120" value="5" aria-label="分钟" style="width:5em"> <span class="entry-note">分钟</span>
            <input id="ccNote" type="text" placeholder="一句话：这次哪里难" aria-label="自评" style="flex:1;min-width:10em">
            <button class="primary" id="ccSave" type="button">记下</button>
          </div>
        </div>
      </div>
      <div id="ccList">${sessions.length
        ? sessions.map((s) => sessionHtml(s, titleOf.get(s.item_id))).join('')
        : '<div class="notice">还没有练习记录。记录只保存在这台设备上，不上传。</div>'}</div>
    </section>

    <section class="card">
      <div class="section-head"><h2>反馈长什么样</h2><span class="chip">描述，不是总分</span></div>
      <div class="notice">系统不会只给你一个分数，而是告诉你「哪一句、哪里、下一步做什么」，然后请你再唱一次。</div>
      <div class="cards">
        <div class="entry"><span class="entry-main"><span class="entry-kicker">要做什么</span><span class="entry-title">${esc(example.target || '')}</span></span></div>
        <div class="entry"><span class="entry-main"><span class="entry-kicker">听到什么</span><span class="entry-title">${esc(example.observed || '')}</span></span></div>
        <div class="entry"><span class="entry-main"><span class="entry-kicker">用话说</span><span class="entry-title">${esc(example.descriptor || '')}</span></span></div>
        <div class="entry"><span class="entry-main"><span class="entry-kicker">下一步</span><span class="entry-title">${esc(example.next_action || '')}</span></span></div>
        <div class="entry"><span class="entry-main"><span class="entry-kicker">最后</span><span class="entry-title">${esc((fb.shape || {}).retry_prompt || '再唱一次')}</span></span></div>
      </div>
      <div class="facets">${(fb.allowed_basis || []).map((x) => `<span class="chip">依据：${esc(x)}</span>`).join('')}</div>
      <div class="notice">反馈的依据只有乐谱、优秀真人示范、教师标注与声学指标。系统不会判断「你有没有属灵感情」。</div>
    </section>

    <section class="card">
      <div class="section-head"><h2>两个接口的真实状态</h2><span class="chip">尚未接入</span></div>
      <div class="cards">
        <div class="entry"><span class="entry-main">
          <span class="entry-kicker">${esc((upload && upload.label) || '录音上传接口（预留）')}</span>
          <span class="entry-title">${esc((upload && upload.status) === 'RESERVED_NOT_CONNECTED' ? '已预留 · 尚未接入' : esc(String(upload && upload.status)))}</span>
          <span class="entry-note">${esc((upload && upload.behavior_now) || '')}</span>
        </span><span class="chip">本地优先</span></div>
        <div class="entry"><span class="entry-main">
          <span class="entry-kicker">${esc((ai && ai.label) || 'AI 分析接口（预留）')}</span>
          <span class="entry-title">${esc((ai && ai.status) === 'RESERVED_NOT_CONNECTED' ? '已预留 · 尚未接入' : esc(String(ai && ai.status)))}</span>
          <span class="entry-note">${esc((ai && ai.behavior_now) || '')}</span>
        </span><span class="chip">不假装分析</span></div>
      </div>
      <div class="facets">${((ai && ai.metrics_basis) || []).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>
    </section>

    <section class="card">
      <div class="section-head"><h2>边界</h2><span class="chip">不变</span></div>
      <div class="cards">${(vocab.boundaries || []).map((b) => `<div class="entry"><span class="entry-main"><span class="entry-note">${esc(b)}</span></span></div>`).join('')}</div>
    </section>`;

  /* 记一次练习：真实写入本地库并即时刷新列表 */
  const save = root.querySelector('#ccSave');
  if (save) {
    save.addEventListener('click', async () => {
      const itemId = root.querySelector('#ccItem').value;
      const mode = root.querySelector('#ccMode').value;
      const mins = Number(root.querySelector('#ccMin').value) || 0;
      const note = root.querySelector('#ccNote').value.trim() || null;
      const item = items.find((i) => i.item_id === itemId) || null;
      save.disabled = true;
      try {
        await coach.recordSession({
          item_id: itemId,
          capability: item ? item.capability : null,
          practice_mode: mode,
          duration_seconds: mins * 60,
          self_note: note,
        });
        const [list, count] = await Promise.all([coach.recentSessions(10), coach.sessionCount()]);
        root.querySelector('#ccList').innerHTML = list.map((s) => sessionHtml(s, titleOf.get(s.item_id))).join('');
        root.querySelector('#ccCount').textContent = `${count} 次`;
        root.querySelector('#ccNote').value = '';
      } finally {
        save.disabled = false;
      }
    });
  }
}

export default { renderCoach };
