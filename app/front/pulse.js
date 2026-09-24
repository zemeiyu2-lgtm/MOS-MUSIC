/* =========================================================
   MOS-MUSIC｜Pulse（节拍器 · V3.0）
   ---------------------------------------------------------
   标准：docs/standards/MOS-SONG-TEACHING-METHOD-V1.0.md
     十、STEP 02 准备声音与身体 / STEP 04 教节奏：
     拍手 · 点拍 · 口读节奏 · 轻声数拍 —— 身体先认识节拍。

   这是一个**工具**，不是歌曲资源：它按用户设定的速度发出节拍声，
   不冒充任何一首歌的音频、不假装示唱或伴奏。（歌还没有音频时，
   节拍器仍然真实可用 —— 这是「先能练节奏」的部分。）

   纯函数部分（beatIndex / barPosition / tickPlan）可离线单测。
========================================================= */

export const BPM_MIN = 40;
export const BPM_MAX = 160;
export const DEFAULT_BPM = 76;

export const TEMPO_PRESETS = Object.freeze([
  { key: 'slow', label: '很慢', bpm: 60 },
  { key: 'slowish', label: '慢', bpm: 76 },
  { key: 'medium', label: '中', bpm: 92 },
  { key: 'steady', label: '稳', bpm: 108 },
]);

/** 第几拍（从 0 起）。 */
export function beatIndex(t, bpm) {
  const b = clampBpm(bpm);
  return Math.floor((Number(t) || 0) * b / 60);
}

/** 拍号 → 每小节拍数；无法解析时为 4。 */
export function beatsPerBar(timeSignature) {
  const m = String(timeSignature || '').match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
  if (!m) return 4;
  const n = Number(m[1]);
  return n >= 2 && n <= 12 ? n : 4;
}

export function clampBpm(bpm) {
  const n = Number(bpm);
  if (!Number.isFinite(n)) return DEFAULT_BPM;
  return Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(n)));
}

/** 拍在小节内的位置与是否重音（每小节第一拍）。 */
export function barPosition(beatNo, perBar) {
  const p = Math.max(1, Math.floor(perBar) || 4);
  const i = Math.max(0, Math.floor(beatNo));
  return { in_bar: (i % p) + 1, accent: i % p === 0 };
}

/**
 * 未来一小段时间内的节拍计划（供调度器使用）。
 * @returns {Array<{beat:number, at:number, accent:boolean}>} at 为毫秒时间
 */
export function tickPlan({ fromMs, toMs, bpm, perBar }) {
  const b = clampBpm(bpm);
  const interval = 60000 / b;
  const out = [];
  const first = Math.floor((Number(fromMs) || 0) / interval);
  for (let i = first; ; i += 1) {
    const at = i * interval;
    if (at > Number(toMs)) break;
    if (at < Number(fromMs)) continue;
    const pos = barPosition(i, perBar);
    out.push({ beat: i, at, accent: pos.accent });
    if (out.length > 256) break;
  }
  return out;
}

/**
 * 创建节拍器（Web Audio；需在用户手势中启动）。
 * 没有 Web Audio 时如实返回 available=false，界面应说明不可用。
 */
export function createMetronome() {
  const Ctx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
  let ctx = null;
  let timer = null;
  let bpm = DEFAULT_BPM;
  let perBar = 4;
  let beatNo = 0;
  let nextAt = 0;
  let running = false;

  function click(at, accent) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.28 : 0.16, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.08);
  }

  function schedule() {
    const horizon = ctx.currentTime + 0.25;
    while (nextAt < horizon) {
      const pos = barPosition(beatNo, perBar);
      click(nextAt, pos.accent);
      nextAt += 60 / bpm;
      beatNo += 1;
    }
  }

  function start() {
    if (!Ctx) return false;
    if (!ctx) ctx = new Ctx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (running) return true;
    running = true;
    beatNo = 0;
    nextAt = ctx.currentTime + 0.12;
    timer = setInterval(schedule, 60);
    schedule();
    return true;
  }

  function stop() {
    running = false;
    if (timer) { clearInterval(timer); timer = null; }
    return true;
  }

  function setTempo(v) { bpm = clampBpm(v); return bpm; }
  function setBeatsPerBar(n) { perBar = Math.max(1, Math.floor(Number(n) || 4)); return perBar; }
  function state() { return { available: Boolean(Ctx), running, bpm, beats_per_bar: perBar, beat: beatNo }; }

  return { start, stop, setTempo, setBeatsPerBar, state };
}

export default {
  BPM_MIN, BPM_MAX, DEFAULT_BPM, TEMPO_PRESETS,
  beatIndex, beatsPerBar, clampBpm, barPosition, tickPlan, createMetronome,
};
