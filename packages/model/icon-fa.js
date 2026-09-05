// ============================================================================
// model/icon-fa.js — Font Awesome 图标注册表与解析（fas/far/fab，官方 PPTD 规范）
// ----------------------------------------------------------------------------
// 注册表 assets/icons/registry.json 由 scripts/gen-icon-registry.mjs 生成；
// SVG 本体不入库（assets/icons/<style>/<name>.svg，经 `icons download` 或 CDN）。
// 与 font-registry.js 同构的双端模式：
//   - loadIconRegistry(options)：Node 走 {iconDir, fs} 注入，浏览器走 ROOT 相对 fetch；
//     模块级单例缓存
//   - resolveIconName(iconName, registry) → hit {name, prefix, dir, w, h} | null
//     （前缀映射目录；名字含 aliases 归一化，如 home→house；style 可用性校验）
//   - fetchIconSvg(hit, registry)：浏览器回源链 Cache API → 本地 → jsDelivr → unpkg
//   - loadIconSvgNode(hit, registry, {iconDir, fs})：CLI/Node 端本地直读 → CDN 兜底
//   - normalizeIconSvg(text, hit) → {inner, w, h}（剥根 svg/注释，去 fill="currentColor"
//     使路径继承注入的 fill）
// ============================================================================

const REGISTRY_REL = "assets/icons/registry.json";
const ROOT = new URL("../../", import.meta.url).href;

/** 前缀 ↔ classic 家族 SVG 目录。 */
export const STYLE_DIRS = { fas: "solid", far: "regular", fab: "brands" };

/** CDN 源（jsDelivr 主 + unpkg 镜像），与 icons download 一致。 */
export function faCdnUrls(faVersion, hit) {
  const path = `@fortawesome/fontawesome-free@${faVersion}/svgs/${hit.dir}/${hit.name}.svg`;
  return [`https://cdn.jsdelivr.net/npm/${path}`, `https://unpkg.com/${path}`];
}

// ---------------------------------------------------------------------------
// 注册表加载（双端，单例缓存）
// ---------------------------------------------------------------------------

let cachedRegistry = null;

/**
 * @param {object} [options] Node 端传 { iconDir, fs:{readFileSync} }；
 *   浏览器无参（fetch ROOT 相对 registry.json）。
 */
export async function loadIconRegistry(options = {}) {
  if (cachedRegistry) return cachedRegistry;
  if (options.iconDir && options.fs?.readFileSync) {
    // 路径拼接用字符串（零依赖：model 层禁 node: 来源，见 dep-graph 规则）
    const base = String(options.iconDir).replace(/\\/g, "/").replace(/\/+$/, "");
    cachedRegistry = JSON.parse(options.fs.readFileSync(`${base}/registry.json`, "utf8"));
  } else {
    const res = await fetch(new URL(REGISTRY_REL, ROOT).href);
    if (!res.ok) throw new Error(`icon registry HTTP ${res.status}`);
    cachedRegistry = await res.json();
  }
  return cachedRegistry;
}

/** 置空单例（测试用）。 */
export function resetIconRegistryCache() {
  cachedRegistry = null;
}

// ---------------------------------------------------------------------------
// 名字解析（含别名归一化；索引按 registry 实例缓存）
// ---------------------------------------------------------------------------

const indexCache = new WeakMap();

/** name → entry 主索引 + alias → entry 别名索引（别名仅指向主名）。 */
function indexOf(registry) {
  let idx = indexCache.get(registry);
  if (!idx) {
    idx = { byName: new Map(), byAlias: new Map() };
    for (const entry of registry.icons) {
      idx.byName.set(entry.name, entry);
      for (const a of entry.aliases || []) idx.byAlias.set(a, entry);
    }
    indexCache.set(registry, idx);
  }
  return idx;
}

/**
 * 官方 iconName "style:name" → 命中条目；非法格式/未知名字/该前缀不可用 → null。
 * @returns {{name, prefix, dir, w, h}} 规范化名（别名归一到主名）。
 */
export function resolveIconName(iconName, registry) {
  if (!iconName || !registry) return null;
  const i = String(iconName).indexOf(":");
  if (i <= 0) return null;
  const prefix = iconName.slice(0, i);
  const dir = STYLE_DIRS[prefix];
  if (!dir) return null;
  const raw = iconName.slice(i + 1);
  const { byName, byAlias } = indexOf(registry);
  const entry = byName.get(raw) || byAlias.get(raw);
  if (!entry || !entry.styles.includes(prefix)) return null;
  return { name: entry.name, prefix, dir, w: entry.w, h: entry.h };
}

// ---------------------------------------------------------------------------
// SVG 获取与归一化
// ---------------------------------------------------------------------------

const ICON_CACHE = "open-pptd-icons-v1";
const cacheKey = (url, v) => `${url}?v=${v}`;

/** 浏览器端：Cache API → 本地 → CDN 链；全失败返回 null。 */
export async function fetchIconSvg(hit, registry) {
  const localUrl = new URL(`assets/icons/${hit.dir}/${hit.name}.svg`, ROOT).href;
  const urls = [localUrl, ...faCdnUrls(registry.faVersion, hit)];
  try {
    const cache = await caches.open(ICON_CACHE);
    for (const url of urls) {
      const cached = await cache.match(cacheKey(url, registry.faVersion));
      if (cached) return await cached.text();
    }
  } catch { /* Cache API 不可用（隐私模式等）则跳过缓存层 */ }
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const text = await res.text();
      try {
        const cache = await caches.open(ICON_CACHE);
        await cache.put(cacheKey(url, registry.faVersion), new Response(text));
      } catch { /* 缓存写失败不阻塞 */ }
      return text;
    } catch { /* 网络失败换下一源 */ }
  }
  return null;
}

/** Node 端（CLI export/check）：本地库直读 → CDN fetch 兜底；null = 两端皆无。 */
export async function loadIconSvgNode(hit, registry, env = {}) {
  if (env.iconDir && env.fs?.readFileSync) {
    try {
      const base = String(env.iconDir).replace(/\\/g, "/").replace(/\/+$/, "");
      return env.fs.readFileSync(`${base}/${hit.dir}/${hit.name}.svg`, "utf8");
    } catch { /* 本地缺文件走 CDN */ }
  }
  for (const url of faCdnUrls(registry.faVersion, hit)) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
    } catch { /* 换镜像 */ }
  }
  return null;
}

/**
 * FA 原始 SVG → {inner, w, h, vx, vy}：剥根 <svg> 标签与版权注释，去掉
 * fill="currentColor"（FA 路径显式 currentColor 会绕过我们注入的根 fill，
 * 必须剥除让路径继承）。
 * viewBox 语义：FA 7 部分图标路径越出声明框（fire/bolt 等含负坐标），SVG 默认
 * 裁剪 → 尖端被削。此处做内容感知扩展：越界时 vx/vy 非 0、w/h 相应扩大，
 * 保证图标完整（调用方以 viewBox="${vx} ${vy} ${w} ${h}" 输出）。
 */
export function normalizeIconSvg(text, hit = null) {
  const m = text && text.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  if (!m) return null;
  let w = hit?.w, h = hit?.h;
  if (!w || !h) {
    const vb = text.match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/);
    if (!vb) return null;
    w = Number(vb[3]);
    h = Number(vb[4]);
  }
  const inner = m[1].replace(/<!--[\s\S]*?-->/g, "").replace(/\sfill="currentColor"/g, "").trim();
  if (!inner) return null;
  const expanded = expandViewBox(inner, w, h);
  if (expanded) {
    const [vx, vy, ew, eh] = expanded;
    return { inner, w: ew, h: eh, vx, vy };
  }
  return { inner, w, h, vx: 0, vy: 0 };
}

// ---------------------------------------------------------------------------
// 路径越界检测与 viewBox 扩展
// ----------------------------------------------------------------------------
// FA 7 部分图标的路径越出声明的 viewBox（如 fire 从 y=-26.4 开始），而 SVG 根
// 默认裁剪 viewBox 外内容 → 火焰/闪电尖端被削平（浏览器与 PowerPoint 同样受影响）。
// 快路径：扫描绝对化坐标是否落在声明框内（绝大多数图标不越界，零开销）；
// 慢路径：贝塞尔精确求界（极值 = 端点 + 导数零点），viewBox 扩到内容完全包含。
// ----------------------------------------------------------------------------

/** 路径命令 tokenizer（FA 路径为 M/L/H/V/C/S/Q/T/A/Z 子集）。 */
function tokenizePath(d) {
  return String(d).match(/[a-zA-Z]|-?\.?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g) || [];
}

/** 内容包围盒（含三次曲线极值：导数求根；弧线 A 按端点保守估计，FA 路径极少用）。 */
export function pathBBox(d) {
  const t = tokenizePath(d);
  let i = 0, x = 0, y = 0, sx = 0, sy = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const push = (px, py) => {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  };
  /** 三次曲线两维度的极值（导数二次求根，根在 (0,1) 内取值入 bbox）。 */
  function sampleDims(dims, emit) {
    for (let dim = 0; dim < 2; dim++) {
      const [p0, p1, p2, p3] = dims[dim];
      const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3);
      const b = 6 * (p0 - 2 * p1 + p2);
      const c = 3 * (p1 - p0);
      const roots = [];
      if (Math.abs(a) < 1e-9) {
        if (Math.abs(b) > 1e-9) roots.push(-c / b);
      } else {
        const disc = b * b - 4 * a * c;
        if (disc >= 0) {
          const sq = Math.sqrt(disc);
          roots.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
        }
      }
      for (const r of roots) {
        if (r > 0 && r < 1) {
          const v = p0 * (1 - r) ** 3 + 3 * p1 * r * (1 - r) ** 2 + 3 * p2 * r ** 2 * (1 - r) + p3 * r ** 3;
          emit(v, dim === 0);
        }
      }
    }
  }

  const num = () => parseFloat(t[i++]);
  let prevCx = null, prevCy = null, prevQx = null, prevQy = null; // C/S、Q/T 反射用
  while (i < t.length) {
    const cmd = t[i];
    if (/[\d.]/.test(cmd)) { i++; continue; } // 防御：游离数字跳过（命令驱动足够）
    i += 1;
    if (cmd === "Z" || cmd === "z") { x = sx; y = sy; continue; }
    const rel = cmd >= "a" && cmd <= "z";
    if (cmd.toLowerCase() === "m") { prevCx = prevCy = prevQx = prevQy = null; } // M 重置反射
    switch (cmd.toLowerCase()) {
      case "m": {
        let px = num(), py = num();
        if (rel) { px += x; py += y; }
        x = sx = px; y = sy = py; push(x, y);
        // 后续隐式坐标对视为 L
        while (i < t.length && /[\d.]/.test(t[i])) {
          let lx = num(), ly = num();
          if (rel) { lx += x; ly += y; }
          x = lx; y = ly; push(x, y);
        }
        break;
      }
      case "l": {
        while (i < t.length && /[\d.]/.test(t[i])) {
          let px = num(), py = num();
          if (rel) { px += x; py += y; }
          x = px; y = py; push(x, y);
        }
        break;
      }
      case "h": {
        while (i < t.length && /[\d.]/.test(t[i])) {
          let px = num();
          if (rel) px += x;
          x = px; push(x, y);
        }
        break;
      }
      case "v": {
        while (i < t.length && /[\d.]/.test(t[i])) {
          let py = num();
          if (rel) py += y;
          y = py; push(x, y);
        }
        break;
      }
      case "c":
      case "s": {
        // C 显式双控制点；S 隐式第一控制点 = 上一 C/S 的控制点关于当前点的反射
        do {
          let x1, y1, x2, y2, px, py;
          if (cmd.toLowerCase() === "c") {
            x1 = num(); y1 = num(); x2 = num(); y2 = num(); px = num(); py = num();
            if (rel) { x1 += x; y1 += y; x2 += x; y2 += y; px += x; py += y; }
          } else {
            x1 = 2 * x - (prevCx ?? x); y1 = 2 * y - (prevCy ?? y);
            x2 = num(); y2 = num(); px = num(); py = num();
            if (rel) { x2 += x; y2 += y; px += x; py += y; }
          }
          sampleDims([[x, x1, x2, px], [y, y1, y2, py]], (v, isX) => (isX ? push(v, y) : push(x, v)));
          prevCx = x2; prevCy = y2;
          x = px; y = py; push(x, y);
        } while (i < t.length && /[\d.]/.test(t[i]));
        break;
      }
      case "q":
      case "t": {
        // Q 显式控制点；T 隐式 = 上一 Q/T 控制点的反射。二次曲线极值 = 一次导数求根
        do {
          let qx, qy, px, py;
          if (cmd.toLowerCase() === "q") {
            qx = num(); qy = num(); px = num(); py = num();
            if (rel) { qx += x; qy += y; px += x; py += y; }
          } else {
            qx = 2 * x - (prevQx ?? x); qy = 2 * y - (prevQy ?? y);
            px = num(); py = num();
            if (rel) { px += x; py += y; }
          }
          const dims = [[x, qx, px], [y, qy, py]];
          for (let dim = 0; dim < 2; dim++) {
            const [p0, p1, p2] = dims[dim];
            const denom = p0 - 2 * p1 + p2;
            if (Math.abs(denom) > 1e-9) {
              const r = (p0 - p1) / denom;
              if (r > 0 && r < 1) {
                const v = p0 * (1 - r) ** 2 + 2 * p1 * r * (1 - r) + p2 * r ** 2;
                dim === 0 ? push(v, y) : push(x, v);
              }
            }
          }
          prevQx = qx; prevQy = qy;
          x = px; y = py; push(x, y);
        } while (i < t.length && /[\d.]/.test(t[i]));
        break;
      }
      case "a": {
        // 弧线：端点 + 半径保守界（FA 路径极少用 A）
        do {
          num(); num(); num(); // rx ry rot
          num(); num();        // laf sf
          let px = num(), py = num();
          if (rel) { px += x; py += y; }
          x = px; y = py; push(x, y);
        } while (i < t.length && /[\d.]/.test(t[i]));
        break;
      }
      default:
        // 未知命令：停止解析（保守返回已收集界）
        i = t.length;
    }
  }
  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * 内容越界时扩展 viewBox：返回 [x, y, w, h]（声明框与内容框的并集）。
 * 未越界返回 null（调用方沿用声明框，零开销路径）。
 * inner 是含 <path> 标签的完整内容——只取各 d 属性求界。
 */
export function expandViewBox(inner, w, h) {
  const ds = String(inner).match(/\bd="([^"]*)"/g) || [];
  if (!ds.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const attr of ds) {
    const bb = pathBBox(attr.slice(3, -1));
    if (!bb) continue;
    minX = Math.min(minX, bb.minX); minY = Math.min(minY, bb.minY);
    maxX = Math.max(maxX, bb.maxX); maxY = Math.max(maxY, bb.maxY);
  }
  if (!isFinite(minX)) return null;
  if (minX >= -0.01 && minY >= -0.01 && maxX <= w + 0.01 && maxY <= h + 0.01) return null;
  const x0 = Math.min(0, Math.floor(minX * 10) / 10);
  const y0 = Math.min(0, Math.floor(minY * 10) / 10);
  const x1 = Math.max(w, Math.ceil(maxX * 10) / 10);
  const y1 = Math.max(h, Math.ceil(maxY * 10) / 10);
  return [x0, y0, Math.round((x1 - x0) * 10) / 10, Math.round((y1 - y0) * 10) / 10];
}
