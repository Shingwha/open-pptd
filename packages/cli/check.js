// ============================================================================
// cli/check.js — check 命令：PPTD 结构自查（model/validate.js 的 CLI 门面）
// ----------------------------------------------------------------------------
// 校验维度见 model/validate.js（schema / token / 资源 / 字体 / 几何 / 对比度）。
// 退出码：有 error 为 1（导出闸门同标准）；仅 warning 为 0。
// ============================================================================

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDeck } from "../model/pptd-io.js";
import { validateDeck } from "../model/validate.js";
import { loadProjectFiles, FONT_LIB_DIR } from "./export.js";

/** 加载 deck 并执行校验（export 闸门复用本函数）。 */
export function checkDeck(manifest) {
  const { manifestText, deckDir, pageFiles } = loadProjectFiles(manifest);
  const deck = parseDeck(manifestText, pageFiles);
  const fontRegistry = JSON.parse(readFileSync(join(FONT_LIB_DIR, "registry.json"), "utf8"));
  const report = validateDeck(deck, {
    fileExists: (rel) => existsSync(join(deckDir, rel)),
    fontRegistry,
  });
  return { deck, report };
}

function formatIssue(issue) {
  const at = [issue.page != null ? `第${issue.page}页` : null, issue.elementId].filter(Boolean).join(" ");
  return `  ${issue.level === "error" ? "✗" : "⚠"} [${issue.rule}] ${at ? at + " " : ""}${issue.message}`;
}

/** check 子命令入口。 */
export function runCheck(manifest, { quiet = false } = {}) {
  if (!manifest || !existsSync(manifest)) {
    console.error(`✗ 文件不存在: ${manifest}`);
    process.exit(1);
  }
  let report;
  try {
    ({ report } = checkDeck(manifest));
  } catch (err) {
    console.error(`✗ 解析失败: ${err.message}`);
    process.exit(1);
  }
  for (const issue of report.errors) console.log(formatIssue(issue));
  for (const issue of report.warnings) console.log(formatIssue(issue));
  if (!report.errors.length && !report.warnings.length) {
    console.log("✓ 校验通过，未发现问题");
  } else {
    console.log(`\n${report.errors.length} 个错误，${report.warnings.length} 个警告`);
  }
  if (report.errors.length) process.exit(1);
}
