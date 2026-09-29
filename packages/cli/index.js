// ============================================================================
// cli/index.js — packages/cli 包级 barrel（契约 4 入口 open-pptd/cli）
// ----------------------------------------------------------------------------
// 把 cli/bin.js 的编排暴露为可编程 API（bin.js 仍是唯一 CLI 入口，本文件只再
// 导出底层实现，不复制任何逻辑）。Node 专用：允许 node:* / fs。
//
// 与 bin.js 的一处差异：bin.js 内部持有 EXAMPLES_DIR（<pkg>/examples）并传给
// runGallery；可编程调用方通常不关心包内示例目录，故此处用薄包装给
// runGallery 补一个默认 examplesDir（不改变传参语义，仍可显式覆盖）。
// ============================================================================

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runGallery as runGalleryImpl } from "./gallery.js";

export { runCheck } from "./check.js";
export { exportDeck, exportProject } from "./export.js";
export { runRender } from "./render.js";
export { runFonts } from "./fonts.js";
export { runIcons } from "./icons.js";

const EXAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "examples");

/** gallery scan|list；examplesDir 缺省为包内 examples/（bin.js 的取值）。 */
export function runGallery(args, examplesDir = EXAMPLES_DIR) {
  return runGalleryImpl(args, examplesDir);
}
