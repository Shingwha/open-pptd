// ============================================================================
// cli/icons.js — Font Awesome 图标库下载与状态
// ----------------------------------------------------------------------------
// 注册表读**包内** `assets/icons/registry.json`；SVG 字节读 home
// （`~/.open-pptd/assets/icons`）优先、包内回退；下载只写 home、原子落盘。
//   icons list                 按风格统计（registry 总数 vs 本地已有）
//   icons download [--force]   全量下载三风格 SVG（兼容别名，内部走下载器 / assets sync）
// SVG 本体不入库不入包；未下载时浏览器/CLI 导出走 CDN 兜底（icon-fa.js 回源链）。
// ============================================================================

import { readIconRegistry, iconReadyInfo, ICON_STYLES } from "./resource-status.js";
import { downloadIcons } from "./download.js";

async function runList() {
  const registry = readIconRegistry();
  const info = iconReadyInfo(registry);
  console.log(`Font Awesome Free ${registry.faVersion} 图标库（assets/icons/）\n`);
  for (const [prefix, dir] of Object.entries(ICON_STYLES)) {
    const { ready, total } = info.per[prefix];
    console.log(`  ${ready === total ? "✓" : ready > 0 ? "◐" : "✗"} ${prefix.padEnd(4)} ${String(ready).padStart(5)} / ${total}  (${dir}/)`);
  }
  console.log(`\n  共 ${info.ready} / ${info.total} 个 SVG`);
  if (info.ready === 0) {
    console.log("  本地图标库为空：浏览器预览/导出将走 CDN 兜底（在线可用）；");
    console.log("  离线使用前执行 node bin/open-pptd.js icons download");
  }
  return true;
}

async function runDownload(args) {
  const registry = readIconRegistry();
  return downloadIcons(registry, { force: args.includes("--force") });
}

export async function runIcons(args) {
  const cmd = args[0];
  if (cmd === "list") return runList();
  if (cmd === "download") return runDownload(args.slice(1));
  return false;
}
