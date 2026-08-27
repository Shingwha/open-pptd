// ============================================================================
// cli/gallery.js — gallery 子命令：画廊索引扫描
// ----------------------------------------------------------------------------
//   gallery scan  扫描 examples/ 生成静态画廊索引
//                 （examples/manifest.json，仅提交给 GitHub Pages 用；本地 serve 自动扫描）
//   gallery list  列出画廊条目
// ============================================================================

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildManifest } from "../server/gallery.js";

/** gallery 子命令入口。 */
export function runGallery(args, examplesDir) {
  const sub = args[0] || "list";
  if (sub === "scan") {
    const manifest = buildManifest(examplesDir);
    const out = join(examplesDir, "manifest.json");
    writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    console.log(`✓ 已生成 ${out}（${manifest.entries.length} 套）`);
    for (const e of manifest.entries) {
      console.log(`  · ${e.id}  ${e.title}（${e.pages} 页${e.tags.length ? " · " + e.tags.join("/") : ""}）`);
    }
  } else if (sub === "list") {
    const manifest = buildManifest(examplesDir);
    if (!manifest.entries.length) {
      console.log("examples/ 下暂无画廊项目（放入 deck.pptd+pages/+media/ 文件夹即可）");
      return true;
    }
    for (const e of manifest.entries) {
      console.log(`· ${e.id}  ${e.title}（${e.pages} 页）  ${e.deck}`);
    }
  } else {
    return false; // 未知子命令，调用方打 usage
  }
  return true;
}
