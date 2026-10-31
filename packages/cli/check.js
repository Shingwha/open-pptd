// ============================================================================
// cli/check.js — `check`: read-only deck validation + resource summary
// ----------------------------------------------------------------------------
// Validation dimensions live in model/validate.js (schema / token / resources /
// fonts / geometry facts / contrast); orchestration lives in runtime/check.js so
// CLI/editor/server share one chain: parse → layout → validateDeck.
// This command never writes, never downloads and never renders:
//   · checkDeck(manifest)  programmatic entry (regression helpers use it)
//   · runCheck(args)       CLI entry: --json single line / --strict warnings fail
// Human text goes to stderr; stdout carries JSON only when --json is passed.
// ============================================================================

import { existsSync } from "node:fs";
import { join } from "node:path";
import { checkProject, createProject } from "../runtime/index.js";
import { createDiskProjectSource, createFsResourceProvider } from "../server/runtime-node.js";
import { issueLocation } from "../export/index.js";
import { collectRequirements, checkResources } from "./resources.js";

/** Load a deck and validate it against disk facts (shared with the export gate). */
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

/** Resource summary for a manifest (read-only; no downloads). */
export function resourceSummary(manifest) {
  try {
    return checkResources(collectRequirements({ manifest }));
  } catch (err) {
    return {
      checked: { fonts: 0, icons: 0, media: 0 },
      fonts: { ready: 0, fetchable: 0, missing: 0, system: 0 },
      icons: { known: 0, unknown: 0 },
      media: { ready: 0, missing: 0 },
      missing: [],
      error: String(err?.message || err),
    };
  }
}

function formatIssue(issue) {
  const at = issueLocation(issue);
  // The page header carries the page number; keep only the element id here.
  const where = issue.page != null ? (issue.elementId || "") : at;
  return `  ${issue.level === "error" ? "✗" : "⚠"} [${issue.rule}] ${where ? where + " " : ""}${issue.message}`;
}

/** Group issues by page (issues without a page go under 全局). */
function printGrouped(issues, log) {
  const groups = new Map();
  for (const issue of issues) {
    const key = issue.page == null ? null : issue.page;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(issue);
  }
  const pages = [...groups.keys()].filter((k) => k != null).sort((a, b) => a - b);
  if (groups.has(null)) pages.push(null);
  for (const page of pages) {
    log(page == null ? "全局" : `第 ${page} 页`);
    for (const issue of groups.get(page)) log(formatIssue(issue));
  }
}

/** JSON view: Map perPage → plain object. */
function perPageObject(report) {
  const out = {};
  for (const [page, issues] of report.perPage || []) out[String(page)] = issues;
  return out;
}

/**
 * check subcommand entry.
 * @param {string[]} args [manifest, --json, --strict]
 */
export function runCheck(args) {
  const manifest = args.find((a) => !a.startsWith("-"));
  const json = args.includes("--json");
  const strict = args.includes("--strict");
  const log = (m) => console.error(m);
  const fail = (code, message) => {
    if (json) process.stdout.write(JSON.stringify({ ok: false, error: { code, message } }) + "\n");
    else log(`✗ ${message}`);
    process.exitCode = 1;
  };

  if (!manifest) return fail("ERR_USAGE", "用法: open-pptd check <manifest> [--json] [--strict]");
  if (!existsSync(manifest)) return fail("ERR_NOT_FOUND", `文件不存在: ${manifest}`);

  let deck;
  let report;
  try {
    ({ deck, report } = checkDeck(manifest));
  } catch (err) {
    return fail("ERR_PARSE", `解析失败: ${err.message}`);
  }
  const resources = resourceSummary(manifest);
  const failed = report.errors.length > 0 || (strict && report.warnings.length > 0);

  if (json) {
    process.stdout.write(
      JSON.stringify({
        ok: !failed,
        errors: report.errors,
        warnings: report.warnings,
        perPage: perPageObject(report),
        resources,
        summary: {
          errors: report.errors.length,
          warnings: report.warnings.length,
          pages: deck?.pages?.length || 0,
          strict,
        },
      }) + "\n"
    );
  } else {
    printGrouped(report.errors, log);
    printGrouped(report.warnings, log);
    if (!report.errors.length && !report.warnings.length) log("✓ 校验通过，未发现问题");
    else log(`\n${report.errors.length} 个错误，${report.warnings.length} 个警告`);
    log(
      `资源：字体 ${resources.fonts.ready}/${resources.checked.fonts} 就绪（可下载 ${resources.fonts.fetchable} · 系统/未注册 ${resources.fonts.system}）` +
        ` · 图标 ${resources.icons.known}/${resources.checked.icons} · 媒体 ${resources.media.ready}/${resources.checked.media}`
    );
    if (resources.missing.length) log(`⚠ 缺失 ${resources.missing.length} 项（check 只读；build --fetch 或 assets sync 可补齐字体）`);
    if (strict && report.warnings.length) log("✗ --strict：存在警告，按失败退出");
  }
  if (failed) process.exitCode = 1;
}
