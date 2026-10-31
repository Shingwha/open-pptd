// ============================================================================
// cli/bin.js — CLI assembly root: five commands, no aliases, no compatibility layer
// ----------------------------------------------------------------------------
//   open   看/改这份 deck（起本地编辑器；Home/blank/detach/stop）
//   build  产出文件（pptx/png/bundle，全部先跑 full checkProject）
//   check  只读体检（schema/资源/几何/对比度 + 资源摘要）
//   assets 字体/图标/主题库（list/sync/clean/themes/fonts）
//   doctor 环境/路径/PNG 能力
//
// Dispatch only: business logic lives in open.js / build.js / check.js / assets.js /
// doctor.js. Old 2.x commands are gone: invoking one prints the migration hint to
// stderr and exits 1 (help lists the five commands only).
// ============================================================================

import { runOpen } from "./open.js";
import { runBuild } from "./build.js";
import { runCheck } from "./check.js";
import { runAssets } from "./assets.js";
import { runDoctor } from "./doctor.js";

const COMMANDS = {
  open: runOpen,
  build: runBuild,
  check: runCheck,
  assets: runAssets,
  doctor: runDoctor,
};

/** Old command → new command mapping (migration hint only; never executes). */
const MIGRATION = {
  serve: "open",
  export: "build --format pptx",
  "export-project": "build --format bundle",
  render: "build --format png",
  ensure: "check（只读）/ build --fetch（补字体）",
  paths: "doctor",
  gallery: "open（Home）/ node scripts/gen-gallery-manifest.mjs（发布）",
  fonts: "assets fonts list|import|remove / assets sync",
  icons: "assets list / assets sync icons",
};

function usage() {
  console.log(
    [
      "open-pptd 3.0 · 5 个命令",
      "",
      "用法:",
      "  open-pptd open [dir] [--deck <file>] [--port <n>] [--detach] [--json] [--open|--no-open] [--stop] [--blank]",
      "      打开编辑器：无参数 = Home（画廊）；<dir> 自动识别唯一 .pptd；--blank 空白。",
      "      --detach 后台；--json 单行 {url,port,pid,project,deck}；--stop 停止当前项目实例（--all 全部）。",
      "  open-pptd build <manifest> --format pptx|png|bundle [-o <path>] [--fetch|--offline] [--strict] [--json]",
      "      pptx: [--theme <id>] [--no-embed-fonts] [--full-fonts]",
      "      png:  [--page <n|all>] [--scale <1|2|3>] [--browser <path>] [--timeout <ms>]",
      "      bundle: [--raw]",
      "      所有格式先跑完整 checkProject；error 阻断，warning 软失败，--strict 阻断；默认不下载。",
      "  open-pptd check <manifest> [--json] [--strict]   只读体检；--strict 警告也失败",
      "  open-pptd assets list|sync [all|fonts|icons] [--from <zip>] [--json]",
      "  open-pptd assets clean [--json]",
      "  open-pptd assets themes list|import|export|delete|apply [--json]",
      "  open-pptd assets fonts list|import|remove [--json]",
      "  open-pptd doctor [--json]                        环境 / 路径 / 字体图标主题 / PNG 能力",
      "",
      "人类文本走 stderr；--json 时 stdout 只有一行 JSON；退出码 1 = 错误或严格失败。",
    ].join("\n")
  );
}

/** Print the migration hint for a removed 2.x command (stderr) and exit 1. */
function rejectOldCommand(command) {
  const target = MIGRATION[command];
  if (target) {
    console.error(`✗ 命令 "${command}" 在 3.0 已删除，请改用: open-pptd ${target}`);
    console.error("  （旧命令不保留别名/shim；open-pptd --help 查看 5 个命令）");
  } else {
    console.error(`✗ 未知命令: ${command}`);
    console.error("  可用: open / build / check / assets / doctor（open-pptd --help）");
  }
  process.exitCode = 1;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || command === "--help" || command === "-h" || command === "help") {
    usage();
    return;
  }
  if (command.startsWith("-")) {
    console.error(`✗ 未知选项: ${command}`);
    usage();
    process.exitCode = 1;
    return;
  }
  const handler = COMMANDS[command];
  if (!handler) return rejectOldCommand(command);
  if (args.slice(1).some((a) => a === "--help" || a === "-h")) {
    usage();
    return;
  }
  const rest = args.slice(1);
  if (command === "assets") {
    const handled = await runAssets(rest);
    if (!handled) {
      console.error("✗ assets 子命令无效");
      usage();
      process.exitCode = 1;
    }
    return;
  }
  await handler(rest);
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exitCode = 1;
});
