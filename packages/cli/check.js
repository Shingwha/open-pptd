// ============================================================================
// cli/check.js — check 命令：PPTD 结构自查（model/validate.js 的 CLI 门面）
// ----------------------------------------------------------------------------
// 校验维度见 model/validate.js（schema / token / 资源 / 字体 / 几何事实 / 对比度）。
// 调用链（spec 09 T4）：parse → resolve（normalizeTheme 在 layout 内）→ layout →
// validateDeck(opts.layout)，越界/重叠读 LayoutTree 的 overflow 事实（替代旧启发式）。
// 退出码：有 error 为 1（导出闸门同标准）；仅 warning 为 0。
// ============================================================================

import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseDeck } from "../model/pptd-io.js";
import { validateDeck } from "../model/validate.js";
import { layout } from "../layout/index.js";
import { fontMetricsMeasure } from "../measure/index.js";
import { loadProjectFiles, issueLocation } from "./export.js";
import { readFontRegistry, readIconRegistry } from "./resource-status.js";

/** 加载 deck 并执行校验（export 闸门复用本函数）。 */
export function checkDeck(manifest) {
  const { manifestText, deckDir, pageFiles } = loadProjectFiles(manifest);
  const deck = parseDeck(manifestText, pageFiles);
  const fontRegistry = readFontRegistry();
  const iconRegistry = readIconRegistry();
  // 布局阶段：确定性纯函数度量（Node 端无 DOM），产出 overflow 事实供校验消费
  const layoutTree = layout(deck, fontMetricsMeasure);
  const report = validateDeck(deck, {
    fileExists: (rel) => existsSync(join(deckDir, rel)),
    fontRegistry,
    iconRegistry,
    layout: layoutTree,
  });
  return { deck, report };
}

function formatIssue(issue) {
  const at = issueLocation(issue);
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
