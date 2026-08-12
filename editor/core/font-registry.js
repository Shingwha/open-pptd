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

let cached = null;

/**
 * 加载注册表（双端）。
 * @param {object} [options]
 * @param {string} [options.registryUrl] 浏览器端：注册表 URL（默认 "/assets/fonts/registry.json"）
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
    const url = options.registryUrl || "/assets/fonts/registry.json";
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

/** 库内文件 URL（浏览器端）。 */
export function fontFileUrl(file) {
  return `/assets/fonts/${encodeURIComponent(file)}`;
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
