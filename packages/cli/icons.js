// ============================================================================
// cli/icons.js — Font Awesome icon library download and status
// ----------------------------------------------------------------------------
// The registry is read from the **in-package** `assets/icons/registry.json`; SVG bytes
// are read from home (`~/.open-pptd/assets/icons`) first, with an in-package fallback;
// downloads write home only, atomically.
//   icons list                 per-style counts (registry total vs local present)
//   icons download [--force]   fetch all three styles as SVG (compatibility alias, backed by the downloader / assets sync)
// SVGs are neither committed to the repo nor shipped in the package; when not downloaded
// the browser/CLI export falls back to the CDN (icon-fa.js origin chain).
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
