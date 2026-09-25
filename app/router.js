/* =========================================================
   MOS-MUSIC｜Hash Router
   ---------------------------------------------------------
   使用 hash 路由而不是 History API，原因：GitHub Pages 的子路径部署
   （/MOS-MUSIC/）在刷新时无法回落 index.html，hash 路由天然避免 404。
   规格书 §31 要求"按需加载"，因此路由只决定渲染哪个模块，
   数据由模块自己按需 fetch，不在路由层预取。
========================================================= */

export const DEFAULT_ROUTE = 'home';

/** 解析 "#/key/param?query" → { key, param, query } */
export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segs = pathPart.split('/').filter(Boolean);
  const key = segs[0] || DEFAULT_ROUTE;
  const param = segs[1] || null;
  const query = {};
  if (queryPart) {
    for (const kv of queryPart.split('&')) {
      if (!kv) continue;
      const i = kv.indexOf('=');
      const k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i));
      const v = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1));
      query[k] = v;
    }
  }
  return { key, param, query };
}

export function buildHash(key, param, query) {
  let h = '#/' + key;
  if (param) h += '/' + encodeURIComponent(param);
  const qs = Object.entries(query || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return qs ? `${h}?${qs}` : h;
}

export function createRouter({ onRoute, allowedKeys }) {
  let current = null;

  async function handle() {
    const route = parseHash(location.hash);
    if (allowedKeys && !allowedKeys.includes(route.key)) {
      location.replace(buildHash(DEFAULT_ROUTE));
      return;
    }
    if (current && current.key === route.key && current.param === route.param) {
      // 同模块内的参数变化（例如七步法第 3 步 → 第 4 步）仍要重渲染
    }
    current = route;
    await onRoute(route);
  }

  function go(key, param, query) {
    const next = buildHash(key, param, query);
    if (location.hash === next) handle();
    else location.hash = next;
  }

  window.addEventListener('hashchange', handle);
  if (!location.hash) location.replace(buildHash(DEFAULT_ROUTE));

  return { go, handle, current: () => current };
}

export default { parseHash, buildHash, createRouter, DEFAULT_ROUTE };
