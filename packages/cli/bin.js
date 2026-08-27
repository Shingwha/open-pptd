// ============================================================================
// cli/bin.js — CLI 装配根（参数解析与命令分发，薄壳）
// ----------------------------------------------------------------------------
//   serve [--port <port>] [--project <dir>]        启动本地网页编辑器
//   export <deck.pptd> [-o out.pptx] [--theme <key>]  命令行导出 PPTX（<key> = 配色预设：
//                         consult/tech/orange/green/red/purple/mono/brown/morandi/sakura）
//                        [--no-embed-fonts]         不嵌入字体（默认嵌入）
// 业务实现：export.js / render.js / gallery.js / fonts.js（本文件只做分发）。
// ============================================================================

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../server/index.js";
import { exportDeck, exportProject } from "./export.js";
import { runCheck } from "./check.js";
import { runRender } from "./render.js";
import { runGallery } from "./gallery.js";
import { runFonts } from "./fonts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = join(__dirname, "..", "..", "examples");

function usage() {
  console.log(
    "open-pptd CLI\n\n" +
      "用法:\n" +
      "  open-pptd serve [--port <port>] [--project <目录>]  启动本地网页编辑器\n" +
      "      --project: 挂载任意项目目录到浏览器（?deck=project/deck.pptd），端口占用自动顺延\n" +
      "  open-pptd export <deck.pptd> [-o <out.pptx>]  命令行导出 PPTX\n" +
      "                           [--no-embed-fonts]   不嵌入字体（默认嵌入）\n" +
      "  open-pptd export-project <deck.pptd> [-o <out.zip>]  导出项目包（pptd+pages+media，原样打包）\n" +
      "  open-pptd check <deck.pptd>                   结构自查（schema/token/资源/字体/几何/对比度）\n" +
      "  open-pptd render <deck.pptd> [-o <目录>] [--page <n|all>] [--scale <1|2|3>]\n" +
      "                           [--browser <路径>] [--timeout <毫秒>]\n" +
      "                        逐页渲染为 PNG（无头浏览器，与编辑器预览同管线）\n" +
      "  open-pptd gallery scan                      扫描 examples/ 生成静态画廊索引\n" +
      "                        （examples/manifest.json，仅提交给 GitHub Pages 用；本地 serve 自动扫描）\n" +
      "  open-pptd gallery list                      列出画廊条目\n" +
      "\n" +
      "  字体库（assets/fonts/，全部免费商用，默认子集化嵌入）：\n" +
      "  open-pptd fonts list                         查看内置字体库（状态 ✓/✗）\n" +
      "  open-pptd fonts download <名称|all>          按需/全量下载字体文件到字体库\n" +
      "  open-pptd fonts check <deck.pptd>            体检 deck 字体声明（嵌入/仅声明/缺失）\n"
  );
}

/** 取选项值：--key <value>，缺省返回 fallback。 */
function opt(args, key, fallback = null) {
  const idx = args.indexOf(key);
  return idx >= 0 ? args[idx + 1] : fallback;
}

/** 取输出路径：-o 或 --out。 */
function outArg(args) {
  const idx = args.indexOf("-o") >= 0 ? args.indexOf("-o") : args.indexOf("--out");
  return idx >= 0 ? args[idx + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || command === "--help" || command === "-h") {
    usage();
    return;
  }
  if (command === "fonts") {
    if (!(await runFonts(args.slice(1)))) {
      usage();
      process.exit(1);
    }
    return;
  }
  if (command === "gallery") {
    if (!runGallery(args.slice(1), EXAMPLES_DIR)) {
      usage();
      process.exit(1);
    }
    return;
  }
  if (command === "serve") {
    const port = Number(opt(args, "--port", 55173));
    const projectRoot = opt(args, "--project");
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
    try {
      const { outPath: finalPath } = await exportProject({ manifest, outPath: outArg(args) });
      console.log(`✓ 项目包已导出 → ${finalPath}`);
    } catch (err) {
      console.error(`✗ 导出失败: ${err.message}`);
      process.exit(1);
    }
    return;
  }
  if (command === "render") {
    const manifest = args[1];
    if (!manifest) {
      usage();
      process.exit(1);
    }
    await runRender({
      manifest,
      outPath: outArg(args),
      page: opt(args, "--page", "all"),
      scale: opt(args, "--scale", 1),
      browserPath: opt(args, "--browser"),
      timeoutMs: Number(opt(args, "--timeout", 30000)),
    });
    return;
  }
  if (command === "check") {
    runCheck(args[1]);
    return;
  }
  if (command === "export") {
    const manifest = args[1];
    if (!manifest) {
      usage();
      process.exit(1);
    }
    try {
      const { outPath: finalPath } = await exportDeck({
        manifest,
        outPath: outArg(args),
        theme: opt(args, "--theme"),
        embedFonts: !args.includes("--no-embed-fonts"),
      });
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
