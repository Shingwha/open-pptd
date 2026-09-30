// ============================================================================
// cli/render.js — render command (headless render to PNG)
// ----------------------------------------------------------------------------
// Assembly: Node version check + injecting packages/server startServer → headless screenshot.
// ============================================================================

import { startServer } from "../server/index.js";
import { renderDeck } from "../renderer/headless/shoot.js";

// Programmatic API: expose the pure render pipeline for in-process consumers (e.g. the DSH
// adapter's pptd_render tool); runRender above stays the CLI entry (prints + process.exit).
export { renderDeck };

/** render subcommand entry. */
export async function runRender({ manifest, outPath, page, scale, browserPath, timeoutMs }) {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18) {
    console.error("✗ render 需要 Node 18+（当前 " + process.version + "）");
    process.exit(1);
  }
  if (major < 21) {
    console.warn("⚠ 当前 Node " + process.version + " < 21：render 将使用内置最小 WebSocket 客户端（推荐 Node 21+）");
  }
  try {
    const { files } = await renderDeck({ manifest, outPath, page, scale, browserPath, timeoutMs, startServer });
    console.log(`✓ 渲染完成，共 ${files.length} 张图片`);
  } catch (err) {
    console.error(`✗ 渲染失败: ${err.message}`);
    process.exit(1);
  }
}
