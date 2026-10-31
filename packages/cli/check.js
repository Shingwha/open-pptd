// ============================================================================
// cli/check.js — check command: PPTD structural self-check (CLI facade over runtime/check)
// ----------------------------------------------------------------------------
// Validation dimensions live in model/validate.js (schema / token / resources /
// fonts / geometry facts / contrast); orchestration lives in runtime/check.js so
// CLI/editor/server share one chain: parse → layout → validateDeck.
// Call chain: disk source readSync → createProject → checkProject (default layout
// with fontMetricsMeasure), environment facts (registries/file existence) injected
// from the Node adapters.
// Exit code: 1 when there are errors (same bar as the export gate); 0 when only warnings.
// Output (human text and counts) is the 2.x baseline and must stay byte-identical.
// ============================================================================

import { existsSync } from "node:fs";
import { join } from "node:path";
import { checkProject, createProject } from "../runtime/index.js";
import { createDiskProjectSource, createFsResourceProvider } from "../server/runtime-node.js";
import { issueLocation } from "./export.js";

/** Load a deck and validate it (the export gate reuses this). */
export function checkDeck(manifest) {
  const files = createDiskProjectSource(manifest).readSync();
  const project = createProject(files);
  const resources = createFsResourceProvider({ baseDir: files.baseDir });
  const report = checkProject(project, {
    resources,
    fileExists: (rel) => existsSync(join(files.baseDir, rel)),
  });
  return { deck: project.deck, report };
}

function formatIssue(issue) {
  const at = issueLocation(issue);
  return `  ${issue.level === "error" ? "✗" : "⚠"} [${issue.rule}] ${at ? at + " " : ""}${issue.message}`;
}

/** check subcommand entry. */
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
