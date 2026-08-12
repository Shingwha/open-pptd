// ============================================================================
// project-cache.js — PPTD 项目文本的跨会话缓存（Cache API）
// ----------------------------------------------------------------------------
// 画廊缩略图与编辑器加载的是同一份项目（manifest + pages/*.page），
// 这些文件部署后很少变化，值得跨会话缓存：第二次打开页面时直接命中
// 缓存，秒开且省掉几十个网络请求（断网也能看画廊）。
//
// 缓存键 = manifest 内容哈希：manifest 变了 → 哈希变 → 自动失效重新拉取，
// 不会出现"改了主题但页面还是旧的"。页面文件与 manifest 一起发布，
// 所以 manifest 不变即认为整包未变。
//
// 本地 serve（开发模式）对静态文件发 Cache-Control: no-store，
// 浏览器不会缓存，本地开发永远走网络，不受本缓存影响。
// ============================================================================

const CACHE_NAME = "open-pptd-projects-v1";
const KEY_PREFIX = "/__pptd_cache__/proj/"; // 纯缓存键（伪造路径，永不真实请求）
const MAX_ENTRIES = 24;

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
 * @returns {Promise<{ manifestText: string, pageTexts: Map<string,string>, fromCache: boolean }>}
 */
export async function fetchProjectTexts(manifestUrl, parseManifest) {
  const res = await fetch(manifestUrl);
  if (!res.ok) throw new Error(`加载失败 ${manifestUrl}: ${res.status}`);
  const manifestText = await res.text();
  // 本地 serve 开发模式发 Cache-Control: no-store → 直接走网络，跳过 Cache API
  //（应用层缓存不受 no-store 控制，否则改了页面但 manifest 没变时会命中旧缓存）
  const localDev = (res.headers.get("cache-control") || "").includes("no-store");
  if (localDev) {
    const { pageTexts, missing } = await fetchPages(manifestUrl, parseManifest(manifestText));
    return { manifestText, pageTexts, missing, fromCache: false };
  }
  const cacheKey = location.origin + KEY_PREFIX + hashText(manifestText);

  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(cacheKey);
    if (hit) {
      const data = await hit.json();
      return { manifestText, pageTexts: new Map(data.pages), missing: 0, fromCache: true };
    }
    const { pageTexts, missing } = await fetchPages(manifestUrl, parseManifest(manifestText));
    // 页面缺失时不写缓存（避免缓存不完整项目，页面补全后仍命中旧缓存）
    if (missing === 0) {
      const body = JSON.stringify({ pages: [...pageTexts] });
      await cache.put(cacheKey, new Response(body, { headers: { "Content-Type": "application/json" } }));
      await prune(cache, cacheKey);
    }
    return { manifestText, pageTexts, missing, fromCache: false };
  } catch (err) {
    // Cache API 不可用（旧浏览器/隐私模式/配额满）：退化为每次直接拉取
    const { pageTexts, missing } = await fetchPages(manifestUrl, parseManifest(manifestText));
    return { manifestText, pageTexts, missing, fromCache: false };
  }
}

async function fetchPages(manifestUrl, manifest) {
  const base = manifestUrl.slice(0, manifestUrl.lastIndexOf("/") + 1);
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

/** 控制缓存体积：条目数超上限时，清掉除当前键外的所有旧版本。 */
async function prune(cache, keepKey) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  for (const req of keys) {
    if (req.url.includes(keepKey)) continue;
    await cache.delete(req);
  }
}
