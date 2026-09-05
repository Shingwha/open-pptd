// ============================================================================
// project-cache.js — PPTD 项目文本的跨会话缓存（Cache API）
// ----------------------------------------------------------------------------
// 画廊缩略图与编辑器加载的是同一份项目（manifest + pages/*.page），
// 这些文件部署后很少变化，值得跨会话缓存：第二次打开页面时直接命中
// 缓存，秒开且省掉几十个网络请求（断网也能看画廊）。
//
// 缓存键 = 应用版本 + manifest 内容哈希：发版（版本号变化）自动全量失效，
// 页面随版本更新的内容（如 examples 迁移）不会命中旧缓存；版本内第二次
// 打开命中缓存秒开。版本号取自仓库根 package.json（Pages 与本地 serve
// 均可相对定位），获取失败退化为 "unknown"（键稳定，仍可缓存）。
//
// 本地 serve（开发模式）对静态文件发 Cache-Control: no-store，
// 浏览器不会缓存，本地开发永远走网络，不受本缓存影响。
// ============================================================================

const CACHE_NAME = "open-pptd-projects-v2";
const KEY_PREFIX = "/__pptd_cache__/proj/"; // 纯缓存键（伪造路径，永不真实请求）
const MAX_ENTRIES = 24;
const ROOT = new URL("../../../", import.meta.url).href; // 本文件位于 editor/app/project/，../../../ 即站点根

let versionPromise = null;

/** 应用版本（package.json 的 version；发版变化 → 缓存键全变 → 旧缓存自动失效）。 */
function getAppVersion() {
  if (!versionPromise) {
    versionPromise = fetch(new URL("package.json", ROOT).href, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j && j.version ? String(j.version) : "unknown"))
      .catch(() => "unknown");
  }
  return versionPromise;
}

/** djb2 哈希（仅用于缓存键区分内容版本，不涉及安全）。 */
export function hashText(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

/**
 * 拉取 manifest + 页面文本，带跨会话缓存。
 * @param {string} manifestUrl deck.pptd 的绝对 URL
 * @param {(manifestText: string) => { pages?: string[] }} parseManifest
 *   解析 manifest 提取页面相对路径列表（仅缓存未命中时调用）
 * @returns {Promise<{ manifestText: string, pageTexts: Map<string,string>, missing?: number, fromCache: boolean }>}
 */
export async function fetchProjectTexts(manifestUrl, parseManifest) {
  const res = await fetch(manifestUrl);
  if (!res.ok) throw new Error(`加载失败 ${manifestUrl}: ${res.status}`);
  const manifestText = await res.text();
  const base = manifestUrl.slice(0, manifestUrl.lastIndexOf("/") + 1);
  // 本地 serve 开发模式发 Cache-Control: no-store → 直接走网络，跳过 Cache API
  const localDev = (res.headers.get("cache-control") || "").includes("no-store");
  if (localDev) {
    const { pageTexts, missing } = await fetchPages(base, parseManifest(manifestText));
    return { manifestText, pageTexts, missing, fromCache: false };
  }
  const version = await getAppVersion();
  const cacheKey = `${location.origin}${KEY_PREFIX}${version}/${hashText(manifestText)}`;

  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(cacheKey);
    if (hit) {
      const data = await hit.json();
      return { manifestText, pageTexts: new Map(data.pages), missing: 0, fromCache: true };
    }
    const { pageTexts, missing } = await fetchPages(base, parseManifest(manifestText));
    // 页面缺失时不写缓存（避免缓存不完整项目，页面补全后仍命中旧缓存）
    if (missing === 0) {
      const body = JSON.stringify({ pages: [...pageTexts] });
      await cache.put(cacheKey, new Response(body, { headers: { "Content-Type": "application/json" } }));
      await prune(cache, cacheKey);
    }
    return { manifestText, pageTexts, missing, fromCache: false };
  } catch (err) {
    // Cache API 不可用（旧浏览器/隐私模式/配额满）：退化为每次直接拉取
    const { pageTexts, missing } = await fetchPages(base, parseManifest(manifestText));
    return { manifestText, pageTexts, missing, fromCache: false };
  }
}

async function fetchPages(base, manifest) {
  const pageTexts = new Map();
  let missing = 0;
  for (const rel of manifest.pages || []) {
    const url = base + rel;
    const res = await fetch(url);
    if (res.status === 404) {
      // 页面文件尚未创建（Agent 写入中）：跳过，交给 parseDeck 宽容处理——
      // 保证「有一页显示一页」，而不是整个项目加载失败
      missing += 1;
      continue;
    }
    if (!res.ok) throw new Error(`加载失败 ${url}: ${res.status}`);
    pageTexts.set(rel, await res.text());
  }
  return { pageTexts, missing };
}

/** 控制缓存体积：条目数超上限时，清掉除当前键外的所有旧版本（含历史版本键）。 */
async function prune(cache, keepKey) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  for (const req of keys) {
    if (req.url.includes(keepKey)) continue;
    await cache.delete(req);
  }
}
