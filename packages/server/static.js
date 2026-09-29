// ============================================================================
// server/static.js — 静态文件服务（MIME 表 + 防穿越路径解析）
// ----------------------------------------------------------------------------
// 零依赖（Node 内置 fs/path）。服务项目根（editor/、assets/ 等）与可选的
// /project/ 虚拟挂载共用同一套安全解析。
// ============================================================================

import { readFileSync, statSync, existsSync } from "node:fs";
import { join, normalize, sep, extname } from "node:path";

export const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".pptd": "text/yaml; charset=utf-8",
  ".page": "text/yaml; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".ico": "image/x-icon",
};

/**
 * 把 URL 路径解析为 base 下的真实文件路径（防路径穿越）。
 * base 可为单根字符串，或**多根数组**（按序尝试，首个命中即用）——资源外置后
 * home 优先、包内回退即由此实现，浏览器端零改动。
 * @param {string|string[]} base 根目录（或按优先级排列的根数组）
 * @param {string} pathname
 * @returns {string|null} 文件存在且为普通文件时返回绝对路径，否则 null
 */
export function resolveFile(base, pathname) {
  const roots = Array.isArray(base) ? base : [base];
  for (const root of roots) {
    const hit = resolveUnder(root, pathname);
    if (hit) return hit;
  }
  return null;
}

/** 单根下的安全解析（防穿越；目录/不存在返回 null）。 */
function resolveUnder(base, pathname) {
  if (!base) return null;
  const filePath = normalize(join(base, pathname));
  if (filePath !== base && !filePath.startsWith(base + sep)) return null; // 防路径穿越
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) return null;
  return filePath;
}

/**
 * 资源请求（/assets/**）的多根解析：
 *   · `registry.json` → **永远只查包内根**（与代码版本耦合，home 永不遮蔽）
 *   · `fonts/**`      → resourceRoots.fonts（home 优先 → 包内回退）
 *   · `icons/**`      → resourceRoots.icons
 * @param {string} pathname URL 路径（含 /assets/ 前缀）
 * @param {{fonts:string[],icons:string[],registry:string[]}} resourceRoots
 * @returns {string|null}
 */
export function resolveResourceFile(pathname, resourceRoots) {
  if (!resourceRoots || !pathname.startsWith("/assets/")) return null;
  const rel = pathname.slice("/assets/".length);
  if (!rel || rel.includes("\0")) return null;
  // 注册表：只查包根（pathname 相对包根，故直接用完整 /assets/... 路径）
  if (/(^|\/)registry\.json$/i.test(rel)) return resolveFile(resourceRoots.registry || [], pathname);
  if (rel.startsWith("fonts/")) return resolveFile(resourceRoots.fonts || [], rel.slice("fonts/".length));
  if (rel.startsWith("icons/")) return resolveFile(resourceRoots.icons || [], rel.slice("icons/".length));
  return null;
}

/** 以静态文件响应一个已解析的文件路径（no-store，本地服务永远取最新）。 */
export function sendFile(res, filePath) {
  const body = readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  res.end(body);
}
