// ============================================================================
// core/font-registry.js — 内置字体库注册表（浏览器 + Node 双端）
// ----------------------------------------------------------------------------
// 数据源：assets/fonts/registry.json（技能资源文件夹，不上传 GitHub）。
// 每个字体：key（展示名）/ family（嵌入注册名，ID16 优先）/ file（库内文件名）/
//           url（回源下载）/ 许可 / 子集化建议。
// registry.systemFonts：系统字体参考清单（无 file/url，仅声明不嵌入，
//           依赖打开方系统已装；仅供查表对齐注册名 + CLI check 识别）。
//
// 用途：
//   - writer/font.js：deck.fonts 资源项写 {family: X}（无 file/url）时，按
//     family 或 key 命中注册表 → 自动补库内文件并嵌入（默认子集化）
//   - 编辑器字体面板：展示内置字体库（✓ 已加载 / ✗ 未加载），一键使用
//   - CLI fonts list/download：注册表全览 + 补下载
// ============================================================================

const REGISTRY_PATH = "assets/fonts/registry.json";

// 仓库根 URL（本文件位于 <root>/editor/core/，../../ 即站点根——兼容本地与 GitHub Pages 子路径）
const ROOT = new URL("../../", import.meta.url).href;

let cached = null;

/**
 * 加载注册表（双端）。
 * @param {object} [options]
 * @param {string} [options.registryUrl] 浏览器端：注册表 URL（默认仓库根相对 assets/fonts/registry.json）
 * @param {string} [options.fontDir]     Node 端：assets/fonts 绝对路径（含 registry.json）
 * @returns {Promise<{version:number, fonts:object[]}>}
 */
export async function loadFontRegistry(options = {}) {
  if (cached) return cached;
  // Node 端：fontDir（assets/fonts 绝对路径）+ fs 注入 → 直接读文件
  if (options.fontDir && options.fs?.readFileSync) {
    const { join } = await import("path");
    cached = JSON.parse(options.fs.readFileSync(join(options.fontDir, "registry.json"), "utf8"));
    return cached;
  }
  if (options.registryUrl || typeof fetch === "function") {
    const url = options.registryUrl || new URL("assets/fonts/registry.json", ROOT).href;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`字体注册表加载失败: HTTP ${res.status}`);
    cached = await res.json();
    return cached;
  }
  throw new Error("无法加载字体注册表（需 registryUrl 或 fontDir）");
}

/** 清缓存（测试用）。 */
export function resetFontRegistry() {
  cached = null;
}

/**
 * 按 family（注册名，精确匹配）或 key（展示名，精确匹配）查注册表。
 * @param {object} registry loadFontRegistry 的返回值
 * @param {string} ref
 * @returns {object|undefined}
 */
export function findFont(registry, ref) {
  if (!registry?.fonts?.length) return undefined;
  return registry.fonts.find(
    (f) => f.family === ref || f.key === ref
  );
}

/** 库内文件 URL（浏览器端，仓库根相对——本地 serve 与 GitHub Pages 子路径均正确）。 */
export function fontFileUrl(file) {
  return new URL(`assets/fonts/${encodeURIComponent(file)}`, ROOT).href;
}

// ----------------------------------------------------------------------------
// 字体字节拉取：本地库文件优先 → 线上源回退（registry 的 url 主源 + mirrors 镜像）
//   - 本地 serve：assets/fonts/ 有文件 → 本地读（快、离线可用）
//   - 线上 Pages：仓库未上传字体文件 → raw.githubusercontent / jsDelivr 拉取
//     （两者均允许 CORS；FontFace 用字节注册，不受跨域限制）
//   - 拉到的字节进 Cache API 跨会话缓存，重复访问不再网络请求
// ----------------------------------------------------------------------------
const FONT_CACHE_NAME = "open-pptd-fonts-v1";

async function readCachedFont(key) {
  try {
    const cache = await caches.open(FONT_CACHE_NAME);
    const res = await cache.match(key);
    return res ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

async function writeFontCache(key, bytes) {
  try {
    const cache = await caches.open(FONT_CACHE_NAME);
    await cache.put(key, new Response(bytes));
  } catch {
    /* 缓存不可用（隐私模式等）则忽略 */
  }
}

/**
 * 拉取字体字节（浏览器端）：Cache API → 本地库文件 → 线上主源 → 镜像。
 * @param {object} hit registry 字体条目（含 file/url/mirrors）
 * @returns {Promise<Uint8Array|null>} 全部失败返回 null（调用方回退系统字体）
 */
export async function fetchFontBytes(hit) {
  if (!hit?.file) return null;
  // 缓存键 = 仓库根绝对 URL：画廊（/）与编辑器（/editor/）共享同一份缓存
  const cacheKey = fontFileUrl(hit.file);
  const cached = await readCachedFont(cacheKey);
  if (cached) return cached;
  try {
    const res = await fetch(cacheKey);
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      writeFontCache(cacheKey, bytes);
      return bytes;
    }
  } catch {
    /* 网络错误 → 线上源 */
  }
  const sources = [hit.url, ...(hit.mirrors || [])].filter(Boolean);
  for (const src of sources) {
    try {
      const res = await fetch(src);
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      writeFontCache(cacheKey, bytes);
      return bytes;
    } catch {
      /* 尝试下一个源 */
    }
  }
  return null;
}

/**
 * 按 family（注册名，精确匹配）或 key（展示名，精确匹配）查系统字体清单。
 * 系统字体无字节：命中仅表示“注册名正确、仅声明不嵌入”，不产生嵌入。
 * @param {object} registry loadFontRegistry 的返回值
 * @param {string} ref
 * @returns {object|undefined}
 */
export function findSystemFont(registry, ref) {
  if (!registry?.systemFonts?.length) return undefined;
  return registry.systemFonts.find((f) => f.family === ref || f.key === ref);
}
