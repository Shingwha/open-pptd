// ============================================================================
// server/static.js — static file serving (MIME table + traversal-safe resolution)
// ----------------------------------------------------------------------------
// Zero dependencies (Node built-in fs/path). Both the project root (editor/,
// assets/, ...) and the optional /project/ virtual mount share this safe resolver.
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
 * Resolve a URL path to a real file under base (traversal-safe). base may be a
 * single root string or a **multi-root array** (tried in order, first hit wins) —
 * this is how home-first / package-fallback works after resources were
 * externalized, with no browser-side change.
 * @param {string|string[]} base root dir (or roots ordered by priority)
 * @param {string} pathname
 * @returns {string|null} absolute path when it exists and is a regular file, else null
 */
export function resolveFile(base, pathname) {
  const roots = Array.isArray(base) ? base : [base];
  for (const root of roots) {
    const hit = resolveUnder(root, pathname);
    if (hit) return hit;
  }
  return null;
}

/** Safe resolution under one root (traversal-safe; null for dirs/missing). */
function resolveUnder(base, pathname) {
  if (!base) return null;
  const filePath = normalize(join(base, pathname));
  if (filePath !== base && !filePath.startsWith(base + sep)) return null; // traversal guard
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) return null;
  return filePath;
}

/**
 * Multi-root resolution for resource requests (/assets/**):
 *   · `registry.json` → **package root only** (version-coupled, home never shadows)
 *   · `fonts/**`      → resourceRoots.fonts (home first, then package fallback)
 *   · `icons/**`      → resourceRoots.icons
 * @param {string} pathname URL path (with the /assets/ prefix)
 * @param {{fonts:string[],icons:string[],registry:string[]}} resourceRoots
 * @returns {string|null}
 */
export function resolveResourceFile(pathname, resourceRoots) {
  if (!resourceRoots || !pathname.startsWith("/assets/")) return null;
  const rel = pathname.slice("/assets/".length);
  if (!rel || rel.includes("\0")) return null;
  // registry: package root only (pathname is relative to the package root, so use the full /assets/... path)
  if (/(^|\/)registry\.json$/i.test(rel)) return resolveFile(resourceRoots.registry || [], pathname);
  if (rel.startsWith("fonts/")) return resolveFile(resourceRoots.fonts || [], rel.slice("fonts/".length));
  if (rel.startsWith("icons/")) return resolveFile(resourceRoots.icons || [], rel.slice("icons/".length));
  return null;
}

/** Respond with a resolved file (no-store; local serving always takes the latest). */
export function sendFile(res, filePath) {
  const body = readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  res.end(body);
}
