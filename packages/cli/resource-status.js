// ============================================================================
// cli/resource-status.js — 资源就绪状态（读三级 + 尺寸一致性）
// ----------------------------------------------------------------------------
// 「✓/✗」判定契约（契约 5 的并发原子性修复）：
//   字体就绪 = 文件在候选根（home → 包内）命中 **且** size 与注册表声明一致。
//   只看 existsSync 会把下载半截的 TTF 当成已安装，导出时才炸——故必须比对 size。
// 注册表（registry.json）恒读包内（版本耦合），与字节目录分离，故本文件只从
// PACKAGE_ROOT 读注册表；字节是否存在走 paths.resolveResourceFile（读三级）。
// ============================================================================

import { readFileSync, statSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PACKAGE_ROOT, resourceRoots, resolveResourceFile } from "../paths.js";

/** 包内字体注册表目录（只 registry.json）。 */
export const FONT_REGISTRY_DIR = join(PACKAGE_ROOT, "assets", "fonts");
/** 包内图标注册表目录（只 registry.json）。 */
export const ICON_REGISTRY_DIR = join(PACKAGE_ROOT, "assets", "icons");

/** 图标前缀 ↔ classic SVG 目录（与 model/icon-fa.js 的 STYLE_DIRS 同源）。 */
export const ICON_STYLES = { fas: "solid", far: "regular", fab: "brands" };

/** 读取包内字体注册表。 */
export function readFontRegistry() {
  return JSON.parse(readFileSync(join(FONT_REGISTRY_DIR, "registry.json"), "utf8"));
}

/** 读取包内图标注册表。 */
export function readIconRegistry() {
  return JSON.parse(readFileSync(join(ICON_REGISTRY_DIR, "registry.json"), "utf8"));
}

/** 单个字体字节是否就绪（存在 **且** size 与注册表一致）。 */
export function fontFileReady(f) {
  if (!f?.file) return false;
  const p = resolveResourceFile("fonts", f.file);
  if (!p) return false;
  if (typeof f.size !== "number") return true; // 注册表未声明 size → 只判存在
  try {
    return statSync(p).size === f.size;
  } catch {
    return false;
  }
}

/** 字体就绪统计 { ready, total }。 */
export function fontReadyInfo(registry) {
  const fonts = registry?.fonts || [];
  return { ready: fonts.filter(fontFileReady).length, total: fonts.length };
}

/** 图标就绪统计：按风格目录合并候选根（home + 包内）去重后的本地 SVG 数。 */
export function iconReadyInfo(registry) {
  const per = {};
  let ready = 0;
  let total = 0;
  for (const [prefix, dir] of Object.entries(ICON_STYLES)) {
    const names = new Set();
    for (const root of resourceRoots.icons) {
      const d = join(root, dir);
      if (!existsSync(d)) continue;
      try {
        for (const f of readdirSync(d)) if (f.endsWith(".svg")) names.add(f);
      } catch { /* 目录不可读则跳过该根 */ }
    }
    const t = (registry?.icons || []).filter((i) => (i.styles || []).includes(prefix)).length;
    per[prefix] = { ready: names.size, total: t };
    ready += names.size;
    total += t;
  }
  return { ready, total, per };
}
