/* =========================================================
   MOS-MUSIC｜Series Covers（系列化艺术封面 · V2.1）
   ---------------------------------------------------------
   为每首歌生成确定性的抽象 SVG 封面：
     · 视觉语言 = **内容层主题词表的索引**驱动（§34：主题词属于内容，
       程序不硬编码任何主题词；本文件只有中性的语言名与色值）；
     · 变体由 song_id 哈希决定（渐变角度 / 母题位置 / 波环数量），
       同主题不同歌不完全一样，但同一首歌永远一样；
     · 纯代码生成，不使用外部图片 / stock 素材，不复制任何品牌；
     · 统一元素：一组「声波圆环」贯穿全系列（音乐感）。

   封面是装饰性视觉（aria-hidden），不承载任何辨识结论或排序信息。
========================================================= */

/* 13 套中性命名的视觉语言（色域 + 抽象母题）。 */
const LANGS = [
  { a: '#2C3A5E', b: '#5C6E9E', c: '#E9DCC4', motif: 'stars' },       /* 0 夜空与星 */
  { a: '#F3E7CF', b: '#D9B97F', c: '#8A6B33', motif: 'rays' },        /* 1 晨光 */
  { a: '#274B44', b: '#4E8474', c: '#F2E3C2', motif: 'dawn' },        /* 2 破晓 */
  { a: '#3C3A36', b: '#6E6A61', c: '#E9DCC4', motif: 'vertical' },    /* 3 竖光 */
  { a: '#4A2E24', b: '#C67B4A', c: '#F5E3C8', motif: 'risen' },       /* 4 升起的圆 */
  { a: '#4E5D46', b: '#8CA07A', c: '#F1EAD6', motif: 'path' },        /* 5 路径 */
  { a: '#274447', b: '#56807F', c: '#EADFC6', motif: 'flame' },       /* 6 炉火 */
  { a: '#33415C', b: '#66799C', c: '#EFE6D2', motif: 'ripples' },     /* 7 静水涟漪 */
  { a: '#41525E', b: '#7C93A0', c: '#EEE8DA', motif: 'waves' },       /* 8 平缓水面 */
  { a: '#5E4044', b: '#A97E80', c: '#F4E8DC', motif: 'twocircles' },  /* 9 相交的圆 */
  { a: '#3E4A52', b: '#77878F', c: '#EDE6D4', motif: 'gather' },      /* 10 聚集 */
  { a: '#2E5350', b: '#5E8A82', c: '#F0E7CF', motif: 'horizon' },     /* 11 海平线 */
  { a: '#1F2C44', b: '#4A5F86', c: '#F2E4C4', motif: 'morningstar' }, /* 12 晨星 */
];

/* 确定性哈希：同一首歌永远同一变体 */
function hash(str) {
  let h = 5381;
  for (let i = 0; i < String(str).length; i += 1) h = ((h << 5) + h + String(str).charCodeAt(i)) >>> 0;
  return h;
}

/** 声波圆环（全系列统一元素） */
function rings(cx, cy, n, color, op) {
  let s = '';
  for (let i = 1; i <= n; i += 1) {
    s += `<circle cx="${cx}" cy="${cy}" r="${10 + i * 14}" fill="none" stroke="${color}" stroke-width="1.4" opacity="${(op / i).toFixed(2)}"/>`;
  }
  return s;
}

/* 各母题：抽象几何，不用具象插画 */
function motifSvg(kind, c, x, y, v) {
  switch (kind) {
    case 'stars':
      return Array.from({ length: 7 + (v % 4) }, (_, i) => {
        const sx = 40 + ((v * (i + 3) * 37) % 400);
        const sy = 30 + ((v * (i + 5) * 53) % 300);
        const r = 1.2 + ((v + i) % 3) * 0.7;
        return `<circle cx="${sx}" cy="${sy}" r="${r.toFixed(1)}" fill="${c}" opacity="${(0.5 + ((i * 7 + v) % 4) / 10).toFixed(2)}"/>`;
      }).join('');
    case 'rays':
      return [0, 1, 2].map((i) => {
        const ang = -28 + i * 24 + (v % 10);
        return `<rect x="${x + i * 26}" y="${y - 190}" width="16" height="380" rx="8" fill="${c}" opacity=".2" transform="rotate(${ang} ${x + i * 26} ${y})"/>`;
      }).join('');
    case 'dawn':
      return `<circle cx="${x}" cy="${y + 60}" r="86" fill="${c}" opacity=".85"/>
              <rect x="0" y="${y + 62}" width="480" height="240" fill="${c}" opacity=".12"/>`;
    case 'vertical':
      return `<rect x="${x - 9}" y="${y - 150}" width="18" height="300" rx="9" fill="${c}" opacity=".8"/>
              <rect x="${x - 90}" y="${y - 34}" width="180" height="18" rx="9" fill="${c}" opacity=".55"/>`;
    case 'risen':
      return `<circle cx="${x}" cy="${y}" r="66" fill="none" stroke="${c}" stroke-width="3" opacity=".9"/>
              <path d="M ${x - 120} ${y + 120} Q ${x} ${y + 30} ${x + 120} ${y + 120}" fill="none" stroke="${c}" stroke-width="3" opacity=".5"/>`;
    case 'path':
      return `<path d="M ${60 + (v % 40)} 430 C ${x - 80} ${y + 90}, ${x + 60} ${y - 60}, ${x + 130} ${y - 130}"
                fill="none" stroke="${c}" stroke-width="4" stroke-dasharray="2 16" stroke-linecap="round" opacity=".85"/>`;
    case 'flame':
      return `<path d="M ${x} ${y - 130} C ${x + 62} ${y - 40}, ${x + 44} ${y + 40}, ${x} ${y + 84}
                       C ${x - 44} ${y + 40}, ${x - 62} ${y - 40}, ${x} ${y - 130} Z"
                fill="${c}" opacity=".55"/>
              <circle cx="${x}" cy="${y + 96}" r="10" fill="${c}" opacity=".8"/>`;
    case 'ripples':
      return rings(x, y, 5, c, 0.5);
    case 'waves':
      return [0, 1, 2].map((i) => {
        const yy = y - 60 + i * 58 + (v % 14);
        return `<path d="M 0 ${yy} Q 120 ${yy - 26} 240 ${yy} T 480 ${yy}" fill="none" stroke="${c}" stroke-width="3" opacity="${(0.5 - i * 0.12).toFixed(2)}"/>`;
      }).join('');
    case 'twocircles':
      return `<circle cx="${x - 42}" cy="${y}" r="74" fill="${c}" opacity=".42"/>
              <circle cx="${x + 42}" cy="${y}" r="74" fill="${c}" opacity=".42"/>`;
    case 'gather':
      return [[0, 0], [-64, 26], [64, 26], [-30, 62], [34, 60]].map(([dx, dy], i) =>
        `<circle cx="${x + dx + ((v + i * 11) % 9) - 4}" cy="${y + dy}" r="${13 - i}" fill="${c}" opacity="${(0.85 - i * 0.13).toFixed(2)}"/>`).join('');
    case 'horizon':
      return `<line x1="0" y1="${y}" x2="480" y2="${y}" stroke="${c}" stroke-width="2.5" opacity=".7"/>
              <path d="M ${x - 46} ${y - 4} L ${x} ${y - 30} L ${x + 46} ${y - 4} Z" fill="${c}" opacity=".8"/>
              <circle cx="${x + 130}" cy="${y - 90}" r="20" fill="${c}" opacity=".5"/>`;
    case 'morningstar':
      return `<circle cx="${x}" cy="${y}" r="7" fill="${c}"/>
              <path d="M ${x} ${y - 54} L ${x + 9} ${y - 9} L ${x + 54} ${y} L ${x + 9} ${y + 9} L ${x} ${y + 54} L ${x - 9} ${y + 9} L ${x - 54} ${y} L ${x - 9} ${y - 9} Z"
                fill="${c}" opacity=".55"/>
              <line x1="0" y1="400" x2="480" y2="400" stroke="${c}" stroke-width="2" opacity=".45"/>`;
    default:
      return rings(x, y, 3, c, 0.4);
  }
}

/**
 * 主题 → 视觉语言索引：**用内容层的主题词表顺序**（程序不含主题词）。
 * 词表外的主题退化为字符串哈希（仍确定性）。
 */
export function langIndexOf(theme, themes) {
  if (theme && Array.isArray(themes) && themes.length) {
    const i = themes.indexOf(theme);
    if (i >= 0) return i % LANGS.length;
  }
  return theme ? hash(theme) % LANGS.length : 0;
}

/**
 * 生成封面 SVG 字符串。
 * @param {{song_id:string, lang?:number}} song
 * @param {{compact?:boolean}} opts  compact=列表小封面（元素更少，性能优先）
 */
export function coverFor(song, opts = {}) {
  const id = (song && song.song_id) || 'cover';
  const lang = LANGS[(Number.isInteger(song && song.lang) ? song.lang : hash(id)) % LANGS.length];
  const v = hash(id);
  const ang = (v % 60) - 30;                     /* 渐变角度变体 */
  const cx = 170 + (v % 140);                    /* 母题位置变体 */
  const cy = 150 + ((v >> 3) % 90);
  const ringN = opts.compact ? 2 : 2 + (v % 3);  /* 波环数量变体 */
  const gid = `cg${(v & 0xffff).toString(16)}`;
  const motif = opts.compact && (v & 1) ? '' : motifSvg(lang.motif, lang.c, cx, cy, v);
  return `<svg viewBox="0 0 480 480" role="img" aria-hidden="true" focusable="false"
    preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="${gid}" gradientTransform="rotate(${ang} .5 .5)">
      <stop offset="0" stop-color="${lang.a}"/><stop offset="1" stop-color="${lang.b}"/>
    </linearGradient></defs>
    <rect width="480" height="480" fill="url(#${gid})"/>
    ${motif}
    ${rings(240, 205, ringN, lang.c, 0.34)}
  </svg>`;
}

function esc2(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

/** 封面容器 HTML：<span class="cover cover-xx">SVG</span>；opts.playing 传布尔时附播放呼吸钮。 */
export function coverHtml(song, size, opts = {}) {
  const play = opts.playing != null
    ? `<button type="button" class="cover-play${opts.playing ? ' playing' : ''}" data-cover-play="${esc2(song.song_id)}" aria-label="${opts.playing ? '暂停' : '播放'}${esc2(song.zh || '')}">▶</button>`
    : '';
  return `<span class="cover cover-${size}">${coverFor(song, opts)}${play}</span>`;
}

export default { coverFor, coverHtml, langIndexOf };
