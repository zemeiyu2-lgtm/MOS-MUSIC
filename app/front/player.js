/* =========================================================
   MOS-MUSIC｜MusicPlayer（全站统一播放器 · V2.1 → V3.0）
   ---------------------------------------------------------
   首页 / 歌曲库 / 歌曲页 / 学唱 / 视唱 / 教唱 共用同一控制器：
     · play / pause / toggle / seek / speed / loop / 状态；
     · onTime 回调驱动进度条、声波与**简谱光标**；
     · 槽位驱动：示范 / 陪唱；V3.0 增加 男声 / 女声 / 钢琴 多轨；
     · 单句循环窗口（setWindow）：只在有时间轴时可用，否则如实不可用；
     · 没有资源时不假装播放 —— 界面显示「尚未提供」。

   V3.0 新增：
     setWindow({start,end}) / seekTo(sec) / kindList()

   只借鉴成熟音乐产品的速度/循环/进度交互思路，不复制任何代码。
========================================================= */

import { audioFor } from './util.js';
import { isMidiUrl, createMidiAudio } from '../midi-synth.js';

export const SPEEDS = [0.5, 0.75, 1.0];

/** 速度标签：0.5× / 0.75× / 1.0×（CDP 锚点要求 1.0× 精确文本） */
export function speedLabel(n) {
  return Number(n).toFixed(2).replace(/0$/, '') + '×';
}

/**
 * 创建播放器控制器。
 * sources 是一个「轨道名 → {url}」的映射：demo / accomp / male / female / piano …
 * 任何没有可用 url 的轨道一律不能播放（false），由界面如实说明。
 */
export function createPlayer() {
  let audio = null;
  let currentKind = null;
  let sources = {};
  let speed = 1.0;
  let loop = false;
  let window_ = null;      /* 单句循环窗口 {start,end}，单位秒 */
  let timeCb = null;
  let onChange = () => {};

  function enforceWindow() {
    if (!audio || !audio.src || !window_) return;
    const { start, end } = window_;
    if (!(end > start)) return;
    if (audio.currentTime >= end) {
      if (loop) { audio.currentTime = start; }
      else { audio.pause(); audio.currentTime = start; onChange(); }
    }
  }

  function ensureAudio(kind) {
    /* 媒体类型感知：.mid/.midi 走 WebAudio 合成适配器，其余走 HTMLAudio。
       两种媒体切换时重建实例，各自的播放状态互不污染。 */
    const want = kind && isMidiUrl(sources[kind] && sources[kind].url) ? 'midi' : 'html';
    if (audio && audio._mediaType === want) return audio;
    if (audio && !audio.paused) { try { audio.pause(); } catch (_) {} }
    audio = want === 'midi' ? createMidiAudio() : new Audio();
    audio.preload = 'none';
    audio.addEventListener('ended', () => onChange());
    audio.addEventListener('timeupdate', () => { enforceWindow(); onChange(); if (timeCb) timeCb(state()); });
    audio.addEventListener('loadedmetadata', () => onChange());
    audio.addEventListener('play', () => onChange());
    audio.addEventListener('pause', () => onChange());
    return audio;
  }

  function setSource(opts) {
    sources = { ...(opts || {}) };
    stop();
    onChange();
  }

  function has(kind) { return Boolean(sources[kind] && sources[kind].url); }

  async function play(kind) {
    if (!has(kind)) return false; /* 无资源：不假装播放 */
    const a = ensureAudio(kind);
    if (currentKind !== kind) {
      a.pause();
      a.src = sources[kind].url;
      currentKind = kind;
      if (window_) a.currentTime = window_.start;
    }
    a.playbackRate = speed;
    a.loop = loop && !window_;
    try { await a.play(); } catch (_) { /* 自动播放被拦截等：由 onChange 呈现实际状态 */ }
    onChange();
    return true;
  }

  function toggle() {
    if (!audio || !audio.src) return;
    if (audio.paused) { audio.play().catch(() => {}); } else { audio.pause(); }
    onChange();
  }

  /** 进度定位（0–1）；无可用的 duration 时忽略。 */
  function seek(frac) {
    if (!audio || !audio.src || !isFinite(audio.duration) || audio.duration <= 0) return;
    const f = Math.min(1, Math.max(0, Number(frac) || 0));
    audio.currentTime = f * audio.duration;
    onChange();
  }

  /** 定位到绝对秒数（点击某一句从小节处重新开始用）。 */
  function seekTo(sec) {
    if (!audio || !audio.src) return;
    const s = Math.max(0, Number(sec) || 0);
    if (isFinite(audio.duration) && audio.duration > 0) audio.currentTime = Math.min(s, audio.duration);
    else audio.currentTime = s;
    onChange();
  }

  /** 单句循环窗口；传 null 清除。没有时间轴时不要设置。 */
  function setWindow(win) {
    window_ = win && Number(win.end) > Number(win.start)
      ? { start: Number(win.start), end: Number(win.end) } : null;
    if (audio) audio.loop = loop && !window_;
    onChange();
  }

  function setSpeed(n) {
    speed = SPEEDS.includes(Number(n)) ? Number(n) : 1.0;
    if (audio) audio.playbackRate = speed;
    onChange();
  }

  function toggleLoop() {
    loop = !loop;
    if (audio) audio.loop = loop && !window_;
    onChange();
  }

  function stop() {
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    currentKind = null;
    onChange();
  }

  function state() {
    const dur = audio && isFinite(audio.duration) ? audio.duration : 0;
    const cur = audio ? audio.currentTime : 0;
    return {
      hasDemo: has('demo'),
      hasAccomp: has('accomp'),
      has: has,
      kinds: Object.keys(sources).filter((k) => has(k)),
      kind: currentKind,
      playing: Boolean(audio && !audio.paused && audio.src),
      speed,
      loop,
      window: window_,
      time: cur,
      duration: dur,
      progress: dur > 0 ? Math.min(1, cur / dur) : 0,
    };
  }

  function mount(el) { onChange = () => el.dispatchEvent(new CustomEvent('player:change')); }
  function onTime(cb) { timeCb = typeof cb === 'function' ? cb : null; }

  return { mount, setSource, has, play, toggle, seek, seekTo, setWindow, setSpeed, toggleLoop, stop, state, onTime };
}

/** 从资源槽位解析示范/陪唱源（无资源为 null）。 */
export function sourcesFromSlots(slots) {
  return {
    demo: audioFor(slots, 'demo'),
    accomp: audioFor(slots, 'accomp'),
  };
}

/**
 * 合并槽位源与单元层轨道（男声 / 女声 / 钢琴）。
 * 单元层轨道优先（它们是有明确来源的真人资源），槽位作为向后兼容。
 */
export function mergeSources(slotSources, unitSrc) {
  const out = { ...(slotSources || {}) };
  const u = unitSrc || {};
  if (u.male) out.male = u.male;
  if (u.female) out.female = u.female;
  if (u.piano) out.piano = u.piano;
  return out;
}

/** 统一进度条 HTML（.player-track > .fill），由 bindTrack() 接管交互。 */
export function trackHtml() {
  return `<div class="player-track" role="slider" aria-label="播放进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
    <div class="fill"></div>
  </div>`;
}

/** 把进度条接到播放器：点击 / 拖动定位，timeupdate 同步宽度与 aria。 */
export function bindTrack(root, player) {
  const track = root.querySelector('.player-track');
  const fill = track && track.querySelector('.fill');
  if (!track || !fill) return;
  let dragging = false;
  const apply = (clientX) => {
    const rect = track.getBoundingClientRect();
    player.seek((clientX - rect.left) / rect.width);
  };
  track.addEventListener('pointerdown', (e) => { dragging = true; track.setPointerCapture(e.pointerId); apply(e.clientX); });
  track.addEventListener('pointermove', (e) => { if (dragging) apply(e.clientX); });
  track.addEventListener('pointerup', () => { dragging = false; });
  player.onTime((st) => {
    const pct = st.duration > 0 ? Math.round(st.progress * 100) : 0;
    fill.style.width = pct + '%';
    track.setAttribute('aria-valuenow', String(pct));
  });
}

function fmt(sec) {
  if (!isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export { fmt as formatTime };
export default {
  createPlayer, sourcesFromSlots, mergeSources, SPEEDS, speedLabel, trackHtml, bindTrack, formatTime: fmt,
};
