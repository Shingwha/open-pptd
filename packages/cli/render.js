// ============================================================================
// cli/render.js — render 命令（无头渲染为 PNG）
// ----------------------------------------------------------------------------
// 装配：Node 版本检查 + 注入 packages/server 的 startServer → headless 截图。
// ============================================================================

import { startServer } from "../server/index.js";
import { renderDeck } from "../renderer/headless/shoot.js";

/** render 子命令入口。 */
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
