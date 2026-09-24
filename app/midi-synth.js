/* =========================================================
   MOS-MUSIC｜MIDI 合成播放适配器（最小连接层）
   ---------------------------------------------------------
   背景：库内钢琴伴奏是本项目自产的公版 MIDI（assets/audio/*-piano.mid，
   与 timeline 同源）。浏览器 <audio> 不能解码 MIDI —— 这是「播放器无声音」
   的根因。本文件用 WebAudio 把同一批 MIDI 合成为可听钢琴，并暴露与
   HTMLAudioElement 兼容的接口（play/pause/currentTime/duration/事件），
   使 player.js 现有逻辑零重构直接可用。

   边界：
   - 只做合成，不改变任何内容数据；不是第二套播放器（接口适配层）。
   - 只认 .mid / .midi；其余 URL 一律交回 HTMLAudio。
   - 音色为最简双振荡器钢琴近似（公有领域素材，无采样依赖）。
========================================================= */

'use strict';

/** URL 是否为 MIDI 资源。 */
export function isMidiUrl(url) {
  return typeof url === 'string' && /\.midi?($|\?)/i.test(url);
}

/* ---------------- SMF（标准 MIDI 文件）解析 ---------------- */

function readVarLen(bytes, p) {
  let v = 0;
  for (let i = 0; i < 4; i++) {
    const b = bytes[p++];
    v = (v << 7) | (b & 0x7f);
    if (!(b & 0x80)) break;
  }
  return { value: v, pos: p };
}

/** 解析 SMF → { notes:[{t,d,midi,vel}], duration }；时间单位秒。 */
export function parseMidi(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  const tag = (n) => String.fromCharCode(...bytes.slice(p, p + n));
  if (tag(4) !== 'MThd') throw new Error('NOT_SMF');
  p += 4;
  const hdrLen = dv.getUint32(p); p += 4;
  const fmt = dv.getUint16(p);
  const ntrks = dv.getUint16(p + 2);
  const division = dv.getUint16(p + 4);
  p += 6;
  p += hdrLen - 6;
  const tpqn = (division & 0x8000) ? 480 : division; /* SMPTE 时间轴按最常见 480 兜底 */

  /* 逐轨收集绝对 tick 事件（音符 + 速度变化），format 0/1 均按合并处理 */
  const evs = [];
  for (let trk = 0; trk < ntrks; trk++) {
    if (tag(4) !== 'MTrk') break;
    p += 4;
    const len = dv.getUint32(p); p += 4;
    const end = p + len;
    let tick = 0, running = 0;
    const open = new Map(); /* midi -> {tick, vel} */
    while (p < end) {
      const d = readVarLen(bytes, p); tick += d.value; p = d.pos;
      let status = bytes[p];
      if (status & 0x80) p++; else status = running;
      running = status;
      const hi = status & 0xf0;
      if (status === 0xff) {
        const type = bytes[p];
        const lenEv = readVarLen(bytes, p + 1);
        p = lenEv.pos;
        if (type === 0x51 && lenEv.value === 3) {
          const us = (bytes[p] << 16) | (bytes[p + 1] << 8) | bytes[p + 2];
          evs.push({ tick, kind: 'tempo', us });
        }
        p += lenEv.value;
      } else if (status === 0xf0 || status === 0xf7) {
        const lenEv = readVarLen(bytes, p); p = lenEv.pos + lenEv.value;
      } else if (hi === 0x90 || hi === 0x80) {
        const midi = bytes[p], vel = bytes[p + 1]; p += 2;
        const on = hi === 0x90 && vel > 0;
        if (on) open.set(midi, { tick, vel });
        else if (open.has(midi)) {
          const st = open.get(midi);
          open.delete(midi);
          if (tick > st.tick) evs.push({ tick: st.tick, kind: 'on', midi, vel: st.vel, endTick: tick });
        }
      } else if (hi === 0xc0 || hi === 0xd0) p += 1;
      else p += 2;
    }
    p = end;
  }

  /* tempo map：tick → 秒（分段线性） */
  evs.sort((a, b) => a.tick - b.tick);
  const tempos = [{ tick: 0, us: 500000 }];
  for (const e of evs) if (e.kind === 'tempo') tempos.push({ tick: e.tick, us: e.us });
  function tickToSec(tick) {
    let sec = 0, lastTick = 0, us = tempos[0].us;
    for (const tp of tempos) {
      if (tp.tick >= tick) break;
      if (tp.tick > lastTick) { sec += ((tp.tick - lastTick) * (us / 1e6)) / tpqn; lastTick = tp.tick; }
      us = tp.us;
    }
    return sec + ((tick - lastTick) * (us / 1e6)) / tpqn;
  }
  const notes = [];
  for (const e of evs) {
    if (e.kind !== 'on') continue;
    const t0 = tickToSec(e.tick);
    const t1 = tickToSec(e.endTick);
    notes.push({ t: t0, d: Math.max(t1 - t0, 0.05), midi: e.midi, vel: e.vel });
  }
  let duration = 0;
  for (const n of notes) duration = Math.max(duration, n.t + n.d);
  return { notes, duration: duration + 0.8, format: fmt };
}

/* ---------------- WebAudio 钢琴近似音色 ---------------- */

function midiFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

function voiceAt(ctx, dest, note, when, durSec, velScale) {
  const f = midiFreq(note.midi);
  const g = ctx.createGain();
  const peak = Math.min(0.5, (note.vel / 127) * 0.5) * velScale;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.001), when + 0.006);
  g.gain.exponentialRampToValueAtTime(Math.max(peak * 0.35, 0.0008), when + Math.min(durSec, 1.2));
  g.gain.exponentialRampToValueAtTime(0.0001, when + durSec + 0.25);
  g.connect(dest);
  const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
  const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
  const g2 = ctx.createGain(); g2.gain.value = 0.35;
  o1.connect(g); o2.connect(g2); g2.connect(g);
  const stopAt = when + durSec + 0.35;
  o1.start(when); o2.start(when);
  o1.stop(stopAt); o2.stop(stopAt);
  return [o1, o2];
}

/* ---------------- Audio 兼容适配器 ---------------- */

export function createMidiAudio() {
  let ctx = null;
  let master = null;
  let notes = [];
  let parsed = false;
  let loading = null;
  let scheduled = [];

  let _src = '';
  let _time = 0;
  let _playing = false;
  let _rate = 1;
  let _loop = false;
  let _duration = 0;
  let _startCtx = 0;
  let _base = 0;
  let _timer = null;
  let _ended = false;

  const a = new EventTarget();
  a._mediaType = 'midi';
  a.preload = 'none';
  a.readyState = 0;

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    }
    return ctx;
  }

  function unschedule() {
    for (const s of scheduled) { try { s.stop(0); } catch (_) {} }
    scheduled = [];
  }

  function scheduleFrom(offset) {
    unschedule();
    const c = ensureCtx();
    const startCtx = c.currentTime;
    _startCtx = startCtx; _base = offset;
    for (const n of notes) {
      const end = n.t + n.d;
      if (end <= offset + 0.01) continue;
      const when = startCtx + Math.max(0, (n.t - offset) / _rate);
      const dur = Math.max(0.06, n.d / _rate);
      scheduled.push(...voiceAt(c, master, n, when, dur, _rate));
    }
  }

  function fire(type) { a.dispatchEvent(new Event(type)); }

  a.getObject = () => null;
  Object.defineProperty(a, 'src', {
    get() { return _src; },
    set(url) {
      _src = String(url || '');
      parsed = false; notes = []; _duration = 0; _time = 0; _playing = false;
      a.readyState = 0;
      if (!_src) return;
      loading = fetch(_src).then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      }).then((buf) => {
        const out = parseMidi(buf);
        notes = out.notes; _duration = out.duration;
        parsed = true; a.readyState = 4;
        fire('loadedmetadata'); fire('canplay'); fire('load');
        onChange && onChange();
      }).catch((err) => {
        fire('error');
        console.warn('[midi] 加载失败：', _src, err && err.message);
      });
    },
  });

  let onChange = null;
  a._setOnChange = (fn) => { onChange = fn; };

  Object.defineProperty(a, 'duration', { get() { return parsed ? _duration : NaN; } });
  Object.defineProperty(a, 'paused', { get() { return !_playing; } });
  Object.defineProperty(a, 'loop', {
    get() { return _loop; },
    set(v) { _loop = Boolean(v); },
  });
  Object.defineProperty(a, 'playbackRate', {
    get() { return _rate; },
    set(v) {
      const nv = Number(v) > 0 ? Number(v) : 1;
      if (_playing) { _time = a.currentTime; const wasPlaying = true; _rate = nv; scheduleFrom(_time); }
      else _rate = nv;
    },
  });
  Object.defineProperty(a, 'currentTime', {
    get() {
      if (!_playing) return _time;
      const c = ensureCtx();
      return Math.min(_base + (c.currentTime - _startCtx) * _rate, _duration || Infinity);
    },
    set(v) {
      _time = Math.max(0, Number(v) || 0);
      _ended = false;
      if (_playing) scheduleFrom(_time);
      fire('seeked');
    },
  });

  a.play = function play() {
    if (!parsed) {
      /* 未解析完成：等加载后再起播一次 */
      return (loading || Promise.resolve()).then(() => {
        if (parsed) return a.play();
      });
    }
    const c = ensureCtx();
    const resume = c.state === 'suspended' ? c.resume() : Promise.resolve();
    if (window.MOS_MIDI_DEBUG) console.info('[midi] play() ctx.state=', c.state, 'parsed=', parsed, 'notes=', notes.length);
    return resume.then(() => {
      if (window.MOS_MIDI_DEBUG) console.info('[midi] after resume ctx.state=', c.state);
      if (_ended || _time >= _duration - 0.01) { _time = 0; _ended = false; }
      _playing = true;
      scheduleFrom(_time);
      fire('play');
      if (!_timer) _timer = setInterval(() => {
        if (!_playing) return;
        if (window.MOS_MIDI_DEBUG) console.info('[midi] tick t=', a.currentTime.toFixed(3), '_base=', _base, 'ctxT=', ctx.currentTime.toFixed(3), '_startCtx=', _startCtx.toFixed(3));
        fire('timeupdate');
        onChange && onChange();
        if (a.currentTime >= _duration - 0.02) {
          if (_loop) { _time = 0; scheduleFrom(0); }
          else {
            _playing = false; _time = _duration; unschedule();
            clearInterval(_timer); _timer = null;
            fire('pause'); fire('ended'); _ended = true;
          }
        }
      }, 250);
    });
  };

  a.pause = function pause() {
    if (_playing) { _time = a.currentTime; _playing = false; unschedule(); fire('pause'); }
  };

  a.load = function load() {};
  a.removeAttribute = function removeAttribute(name) { if (name === 'src') { _src = ''; parsed = false; _time = 0; } };

  /* 播放器 player.js 用 addEventListener 注册这些事件；EventTarget 原生支持 */
  return a;
}
