// ============================================================================
// cli/gallery.js — gallery subcommand: gallery index scan
// ----------------------------------------------------------------------------
//   gallery scan  scan examples/ and write the static gallery index
//                 (examples/manifest.json; for GitHub Pages only — local serve scans live)
//   gallery list  list gallery entries
// ============================================================================

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildManifest } from "../server/gallery.js";

/** gallery subcommand entry. */
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
    return false; // unknown subcommand; caller prints usage
  }
  return true;
}
