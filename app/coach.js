/* =========================================================
   MOS-MUSIC｜MOS Singing Coach（歌唱教练 · 数据层 · V3.x）
   ---------------------------------------------------------
   §十一：Singing Coach 是**独立产品模块**，与 MOS Formation 完全独立。
   §十二：本轮只做基础层 —— 数据模型 / 页面入口 / 个人训练记录 /
          训练项目模型 / 反馈结构 / 音频上传接口预留 / AI 分析接口预留。

   硬边界（校验器与 tools/guard.js 都会查）：
     · 不读取任何门训数据（周次 / 课程 / 进度 / 积分 / 成绩）；
     · 不产生分数、排行、通过结论，也不产生任何属灵评价；
     · 反馈必须是可以「再唱一次」的具体描述，不是总分；
     · AI 分析接口**未接入**时必须如实返回不可用，绝不假装分析；
     · 训练项目与能力词表来自内容层（content/coach/index.json），
       程序不硬编码任何能力词 / 项目名。
========================================================= */

import { getIndex } from './content-source.js';
import * as store from './store.js';

export const SESSION_STORE = 'coach_sessions';

let vocabCache = null;

/** 词表（内容层）。 */
export async function loadVocab() {
  if (vocabCache) return vocabCache;
  vocabCache = await getIndex('coach');
  return vocabCache;
}

/** 十项能力模型。 */
export async function capabilities() {
  const v = await loadVocab();
  return (v && v.capabilities) || [];
}

/** 训练项目（本轮全部为 MODEL_ONLY）。 */
export async function trainingItems() {
  const v = await loadVocab();
  return ((v && v.training_item_model) || {}).starter_items || [];
}

/** 独立声明（前台要如实展示：Coach 不读门训数据）。 */
export async function independence() {
  const v = await loadVocab();
  return (v && v.independence) || null;
}

/* ---------------------------------------------------------------- 个人训练记录 */

/** 会话 ID：MUS-CS-<YYYYMMDD>-<NN>（本地生成，序号按当天已有记录递增）。 */
export async function nextSessionId(date = new Date()) {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
  const all = await store.getAll(SESSION_STORE).catch(() => []);
  const today = (all || []).filter((s) => String(s.session_id || '').startsWith(`MUS-CS-${ymd}-`));
  const n = today.length + 1;
  return `MUS-CS-${ymd}-${String(n).padStart(2, '0')}`;
}

/**
 * 记一次练习（只是事实：练了什么、多久、自评一句）。
 * 不存分数、不存评级、不存名次。
 */
export async function recordSession(input) {
  const id = input.session_id || await nextSessionId();
  const rec = {
    session_id: id,
    item_id: input.item_id || null,
    capability: input.capability || null,
    song_id: input.song_id || null,
    created_at: input.created_at || new Date().toISOString(),
    duration_seconds: Number.isFinite(input.duration_seconds) ? input.duration_seconds : null,
    practice_mode: input.practice_mode || null,
    self_note: input.self_note || null,
    audio_ref: input.audio_ref || null,
    feedback: input.feedback || null,
    dirty: true,
  };
  await store.put(SESSION_STORE, rec);
  if (typeof store.enqueue === 'function') {
    await store.enqueue({ store: SESSION_STORE, op: 'put', key: id, payload: rec }).catch(() => {});
  }
  return rec;
}

/** 最近的练习记录（新的在前）。 */
export async function recentSessions(limit = 20) {
  const all = await store.getAll(SESSION_STORE).catch(() => []);
  return (all || [])
    .slice()
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, limit);
}

export async function sessionCount() {
  return store.count(SESSION_STORE).catch(() => 0);
}

/* ---------------------------------------------------------------- 反馈结构 */

/**
 * 反馈对象：只有描述，没有总分（§十三）。
 * @param {{target:string, observed:string, descriptor:string, next_action:string}} input
 */
export async function buildFeedback(input) {
  const v = await loadVocab();
  const shape = ((v && v.feedback_structure) || {}).shape || {};
  const out = {
    target: input.target || shape.target || null,
    observed: input.observed || shape.observed || null,
    descriptor: input.descriptor || shape.descriptor || null,
    next_action: input.next_action || shape.next_action || null,
    retry_prompt: shape.retry_prompt || '再唱一次',
    basis: ((v && v.feedback_structure) || {}).allowed_basis || [],
  };
  if (!out.descriptor) out.descriptor = null;
  return out;
}

/* ---------------------------------------------------------------- 预留接口 */

/**
 * 音频上传接口（预留，§十二）。
 * 本轮：只在本机保存并在本地回听；**没有任何上传动作**。
 */
export async function uploadInterface() {
  const v = await loadVocab();
  const cfg = ((v && v.interfaces) || {}).audio_upload || {};
  return {
    available: false,
    status: cfg.status || 'RESERVED_NOT_CONNECTED',
    label: cfg.label || null,
    accepts: cfg.accepts || [],
    max_seconds: cfg.max_seconds || null,
    behavior_now: cfg.behavior_now || null,
    local_only: true,
  };
}

/**
 * AI 分析接口（预留，§十二 / §十三）。
 * 未接入 ⇒ 如实返回 available:false；绝不假装分析、绝不编造反馈。
 */
export async function analyzeInterface() {
  const v = await loadVocab();
  const cfg = ((v && v.interfaces) || {}).ai_analysis || {};
  return {
    available: false,
    status: cfg.status || 'RESERVED_NOT_CONNECTED',
    label: cfg.label || null,
    vendor: cfg.vendor == null ? null : cfg.vendor,
    metrics_basis: cfg.metrics_basis || [],
    behavior_now: cfg.behavior_now || null,
  };
}

/** 占位调用：任何「分析」请求都返回不可用 —— 不产生假反馈。 */
export async function analyze() {
  const iface = await analyzeInterface();
  return {
    available: false,
    status: iface.status,
    reason: iface.behavior_now,
    feedback: null,
  };
}

export default {
  SESSION_STORE, loadVocab, capabilities, trainingItems, independence,
  nextSessionId, recordSession, recentSessions, sessionCount,
  buildFeedback, uploadInterface, analyzeInterface, analyze,
};
