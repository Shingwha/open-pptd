#!/usr/bin/env node
// ============================================================================
// bin/open-pptd.js — CLI
//   serve [--port <port>] [--project <dir>]        启动本地网页编辑器
//   export <deck.pptd> [-o out.pptx] [--theme <key>]  命令行导出 PPTX（<key> = 配色预设：
//                         consult/tech/orange/green/red/purple/mono/brown/morandi/sakura）
//                        [--no-embed-fonts]         不嵌入字体（默认嵌入）
// ============================================================================

import { existsSync } from "fs";
import { join } from "path";
import { startServer } from "../lib/editor-server.js";
import { exportDeck, exportProject } from "../lib/pptd-export.js";

function usage() {
  console.log(
    "open-pptd CLI\n\n" +
      "用法:\n" +
      "  open-pptd serve [--port <port>] [--project <目录>]  启动本地网页编辑器\n" +
      "      --project: 挂载任意项目目录到浏览器（?deck=project/deck.pptd），端口占用自动顺延\n" +
      "  open-pptd export <deck.pptd> [-o <out.pptx>]  命令行导出 PPTX\n" +
      "                           [--no-embed-fonts]   不嵌入字体（默认嵌入）\n" +
      "  open-pptd export-project <deck.pptd> [-o <out.zip>]  导出项目包（pptd+pages+media，原样打包）\n"
  );
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || command === "--help" || command === "-h") {
    usage();
    return;
  }
  if (command === "serve") {
    const portIdx = args.indexOf("--port");
    const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 55173;
    const projIdx = args.indexOf("--project");
    const projectRoot = projIdx >= 0 ? args[projIdx + 1] : null;
    try {
      if (projectRoot) {
        if (!existsSync(projectRoot)) {
          console.error(`✗ 项目目录不存在: ${projectRoot}`);
          process.exit(1);
        }
        if (!existsSync(join(projectRoot, "deck.pptd"))) {
          console.warn(`⚠ ${projectRoot} 下未找到 deck.pptd（期望项目 manifest 名）`);
        }
      }
      await startServer({ port, projectRoot, deckUrl: projectRoot ? "project/deck.pptd" : null });
    } catch (err) {
      if (err?.code === "EADDRINUSE") {
        console.error(`端口 ${port}~${port + 9} 均被占用，可用 --port 指定其他端口`);
        process.exit(1);
      }
      throw err;
    }
    return;
  }
  if (command === "export-project") {
    const manifest = args[1];
    if (!manifest) {
      usage();
      process.exit(1);
    }
    const outIdx = args.indexOf("-o") >= 0 ? args.indexOf("-o") : args.indexOf("--out");
    const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
    try {
      const { outPath: finalPath } = await exportProject({ manifest, outPath });
      console.log(`✓ 项目包已导出 → ${finalPath}`);
    } catch (err) {
      console.error(`✗ 导出失败: ${err.message}`);
      process.exit(1);
    }
    return;
  }
  if (command === "export") {
    const manifest = args[1];
    if (!manifest) {
      usage();
      process.exit(1);
    }
    const outIdx = args.indexOf("-o") >= 0 ? args.indexOf("-o") : args.indexOf("--out");
    const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
    const themeIdx = args.indexOf("--theme");
    const theme = themeIdx >= 0 ? args[themeIdx + 1] : null;
    const embedFonts = !args.includes("--no-embed-fonts");
    try {
      const { outPath: finalPath } = await exportDeck({ manifest, outPath, theme, embedFonts });
      console.log(`✓ 已导出 → ${finalPath}`);
    } catch (err) {
      console.error(`✗ 导出失败: ${err.message}`);
      process.exit(1);
    }
    return;
  }
  usage();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
