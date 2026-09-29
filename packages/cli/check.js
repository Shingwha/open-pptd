// ============================================================================
// cli/check.js — check command: PPTD structural self-check (CLI facade over model/validate.js)
// ----------------------------------------------------------------------------
// Validation dimensions live in model/validate.js (schema / token / resources /
// fonts / geometry facts / contrast).
// Call chain (spec 09 T4): parse → resolve (normalizeTheme inside layout) → layout →
// validateDeck(opts.layout); overflow/overlap read LayoutTree facts (replacing the
// old heuristics).
// Exit code: 1 when there are errors (same bar as the export gate); 0 when only warnings.
// ============================================================================

import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseDeck } from "../model/pptd-io.js";
import { validateDeck } from "../model/validate.js";
import { layout } from "../layout/index.js";
import { fontMetricsMeasure } from "../measure/index.js";
import { loadProjectFiles, issueLocation } from "./export.js";
import { readFontRegistry, readIconRegistry } from "./resource-status.js";

/** Load a deck and validate it (the export gate reuses this). */
export function checkDeck(manifest) {
  const { manifestText, deckDir, pageFiles } = loadProjectFiles(manifest);
  const deck = parseDeck(manifestText, pageFiles);
  const fontRegistry = readFontRegistry();
  const iconRegistry = readIconRegistry();
  // Layout stage: deterministic pure-function measurement (no DOM in Node), producing overflow facts for validation.
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
