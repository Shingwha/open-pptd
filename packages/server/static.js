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
 * @returns {string|null} 文件存在且为普通文件时返回绝对路径，否则 null
 */
export function resolveFile(base, pathname) {
  const filePath = normalize(join(base, pathname));
  if (filePath !== base && !filePath.startsWith(base + sep)) return null; // 防路径穿越
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) return null;
  return filePath;
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
