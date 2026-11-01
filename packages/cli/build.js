// cli/build.js — `build`: the only artifact-producing command
// Formats: pptx (default) | png | bundle — all go through ExportService, which runs the full
// checkProject gate (errors block, warnings soft unless --strict) and owns writer/zip/naming.
// This file is the Node adapter only: disk project + fs/registry ResourceProvider + sink,
// the headless RenderBackend for png and optional font completion (--fetch). Human text goes
// to stderr; --json emits a single JSON line on stdout.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { startServer } from "../server/index.js";
import { exportProject as runExport } from "../export/index.js";
import { safeFileName } from "../writer/index.js";
import { createHeadlessRenderBackend } from "../renderer/headless/backend.js";
import { findBrowser } from "../renderer/headless/browser.js";
import { prepareProject, captureSink } from "./project.js";
import { collectRequirements, checkResources, ensureResources } from "./resources.js";
import { CliError, reportError } from "./errors.js";

const FORMATS = ["pptx", "png", "bundle"];
const VALUED = new Set(["-o", "--out", "--format", "--page", "--scale", "--browser", "--timeout"]);

/** Option parser: positional / flags / valued options (supports --key=value). */
export function parseArgs(args) {
  const positional = [];
  const flags = new Set();
  const values = new Map();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith("--") && a.includes("=")) {
      const [k, ...rest] = a.split("=");
      values.set(k, rest.join("="));
      continue;
    }
    if (VALUED.has(a)) {
      values.set(a, args[i + 1] ?? null);
      i += 1;
      continue;
    }
    if (a.startsWith("-")) flags.add(a);
    else positional.push(a);
  }
  return { positional, flags, values };
}

function value(values, ...keys) {
  for (const k of keys) if (values.has(k)) return values.get(k);
  return null;
}

function defaultOutPath(project, format) {
  const baseDir = project.baseDir || ".";
  const title = safeFileName(project.deck?.title || "deck");
  if (format === "pptx") return resolve(baseDir, `${title}.pptx`);
  if (format === "bundle") return resolve(baseDir, `${title}-project.zip`);
  return resolve(baseDir);
}

/**
 * Programmatic build (throws CliError; never calls process.exit).
 * @param {object} options
 * @param {string} options.manifest
 * @param {"pptx"|"png"|"bundle"} [options.format]
 * @param {string} [options.outPath]
 * @param {boolean} [options.embedFonts]
 * @param {boolean} [options.fullFonts]
 * @param {string|number} [options.pages]
 * @param {number} [options.scale]
 * @param {string} [options.browserPath]
 * @param {number} [options.timeoutMs]
 * @param {boolean} [options.fetchFonts]
 * @param {boolean} [options.offline]
 * @param {boolean} [options.strict]
 * @param {boolean} [options.raw] bundle raw mode
 * @param {(line:string)=>void} [options.log] human progress sink
 * @returns {Promise<object>} { report, project, requirements, summary, fetched }
 */
export async function buildDeck(options = {}) {
  const {
    manifest,
    format = "pptx",
    embedFonts = true,
    fullFonts = false,
    pages = "all",
    scale = 1,
    browserPath = null,
    timeoutMs = 30000,
    fetchFonts = false,
    offline = false,
    strict = false,
    raw = false,
    log = () => {},
  } = options;

  if (!manifest) throw new CliError("ERR_USAGE", "用法: open-pptd build <manifest> [--format pptx|png|bundle] [options]");
  if (!FORMATS.includes(format)) throw new CliError("ERR_INVALID_OPTION", `--format 仅支持 ${FORMATS.join("|")}（当前 ${format}）`);
  if (fetchFonts && offline) throw new CliError("ERR_INVALID_OPTION", "--fetch 与 --offline 互斥");
  if (!existsSync(manifest)) throw new CliError("ERR_NOT_FOUND", `文件不存在: ${manifest}`);

  // PNG needs a real browser before doing any work (clear ERR_RENDER_BACKEND).
  if (format === "png") {
    try {
      findBrowser(browserPath || null);
    } catch (err) {
      throw new CliError(
        "ERR_RENDER_BACKEND",
        `${err.message}。PNG 导出需要本机 Chrome/Edge；PPTX/bundle 不需要浏览器。`
      );
    }
  }

  const { project, resources } = await prepareProject(manifest);

  // 1. Resource requirements (read-only) + optional explicit font completion.
  const requirements = collectRequirements({ manifest });
  const pre = checkResources(requirements);
  log(
    `▸ 资源：字体 ${pre.fonts.ready}/${pre.checked.fonts} 就绪（可下载 ${pre.fonts.fetchable} · 系统/未注册 ${pre.fonts.system}）` +
      ` · 图标 ${pre.icons.known}/${pre.checked.icons} · 媒体 ${pre.media.ready}/${pre.checked.media}`
  );
  let fetched = [];
  if (fetchFonts && pre.fonts.fetchable) {
    log(`▸ --fetch：补齐 ${pre.fonts.fetchable} 个项目引用字体…`);
    const r = await ensureResources(requirements, { offline: false });
    fetched = r.fetched;
    if (fetched.length) log(`  ✓ 已补齐 ${fetched.map((f) => f.family).join("、")}`);
    if (r.failed.length) log(`  ! 未补齐 ${r.failed.map((f) => f.family).join("、")}`);
  }
  const summary = checkResources(requirements);

  // 3. Export through the shared service (full checkProject by default).
  const outPath = options.outPath ? resolve(options.outPath) : defaultOutPath(project, format);
  const { sink } = captureSink();
  const env = {
    resources,
    sink,
    onProgress(evt) {
      if (evt.stage === "check") {
        for (const issue of evt.warnings || []) log(`  ⚠ [${issue.rule}] ${issue.message}`);
      } else if (evt.stage === "page") {
        log(`  ✓ 第 ${evt.page}/${evt.deckPages} 页 → ${evt.outPath}（${(evt.bytes / 1024).toFixed(0)}KB）`);
      }
    },
  };
  if (format === "png") {
    // The headless backend starts one-shot static servers; silence their default banner so
    // stdout stays empty when --json is used (human progress goes through `log` → stderr).
    const quietStartServer = (opts) => startServer({ ...opts, onListen: () => {} });
    env.renderBackend = (req) => createHeadlessRenderBackend({ ...req, startServer: quietStartServer, quiet: true });
  }

  const report = await runExport(
    project,
    {
      format,
      outPath,
      strict,
      offline,
      ...(format === "pptx" ? { embedFonts, fullFonts } : {}),
      ...(format === "png" ? { pages, scale: Number(scale), browserPath, timeoutMs: Number(timeoutMs) } : {}),
      ...(format === "bundle" ? { bundleMode: raw ? "raw" : "snapshot" } : {}),
    },
    env
  );

  if (!report.ok) {
    const code = report.check && report.check.ok === false ? "ERR_CHECK" : "ERR_EXPORT";
    const message = report.errors.join("\n") || "导出失败";
    const err = new CliError(code, message);
    err.report = report;
    throw err;
  }

  return { report, project, requirements, summary, fetched, outPath, format, scale: Number(scale) };
}

/** Human summary lines for a successful build. */
function printHuman({ report, project, summary, fetched }, format) {
  const log = (m) => console.error(m);
  log(
    `资源检查：字体 ${summary.fonts.ready}/${summary.checked.fonts} · 图标 ${summary.icons.known}/${summary.checked.icons} · 媒体 ${summary.media.ready}/${summary.checked.media}` +
      (summary.missing.length ? `（缺失 ${summary.missing.length} 项）` : "")
  );
  for (const warning of report.warnings) log(`⚠ ${warning}`);
  for (const s of report.skipped || []) log(`⚠ 字体未嵌入：${s.family}（${s.reason || "无本地字节"}）`);
  for (const s of report.skippedIcons || []) log(`⚠ 图标未导出：${s.iconName}（${s.reason}）`);
  if (fetched.length) log(`✓ 已补齐字体：${fetched.map((f) => f.family).join("、")}`);
  if (format === "pptx") log(`✓ 已导出 PPTX → ${report.outPath}（${Math.round(report.bytes / 1024)}KB，${project.deck.pages.length} 页）`);
  else if (format === "bundle") log(`✓ 已导出项目包 → ${report.outPath}（${Math.round(report.bytes / 1024)}KB）`);
  else log(`✓ 渲染完成，共 ${report.files.length} 张图片 → ${report.outPath}`);
}

/** JSON payload for build --json (single line). */
function buildJson(result, format) {
  const { report, project, summary, fetched } = result;
  return {
    ok: true,
    format,
    outPath: report.outPath,
    checked: summary.checked,
    fetched,
    embedded: report.embedded || [],
    skipped: report.skipped || [],
    missing: report.missing || [],
    warnings: report.warnings || [],
    pages: project.deck?.pages?.length || 0,
    ...(format === "png" ? { renderedPages: report.pages || [], scale: result.scale || undefined } : {}),
  };
}

/** build subcommand entry. */
export async function runBuild(args) {
  const { positional, flags, values } = parseArgs(args);
  const manifest = positional[0] || null;
  const json = flags.has("--json");
  const log = (m) => console.error(m);
  const emitError = (err) => reportError(err, { json, log });

  if (args.some((a) => a === "--theme" || a.startsWith("--theme="))) {
    return emitError(new CliError("ERR_INVALID_OPTION", "build --theme 已移除：颜色请直接修改 deck.theme.colors"));
  }

  if (!manifest) return emitError(new CliError("ERR_USAGE", "用法: open-pptd build <manifest> [--format pptx|png|bundle] [-o <path>] [--fetch|--offline] [--strict] [--json]"));

  const format = value(values, "--format") || "pptx";
  try {
    if (!FORMATS.includes(format)) throw new CliError("ERR_INVALID_OPTION", `--format 仅支持 ${FORMATS.join("|")}（当前 ${format}）`);
    if (flags.has("--fetch") && flags.has("--offline")) throw new CliError("ERR_INVALID_OPTION", "--fetch 与 --offline 互斥");
    if (format === "pptx" && flags.has("--raw")) throw new CliError("ERR_INVALID_OPTION", "--raw 仅用于 --format bundle");
    if (format === "bundle" && (values.has("--page") || values.has("--scale"))) throw new CliError("ERR_INVALID_OPTION", "--page/--scale 仅用于 --format png");
    if (format !== "pptx" && (flags.has("--no-embed-fonts") || flags.has("--full-fonts"))) {
      throw new CliError("ERR_INVALID_OPTION", "--no-embed-fonts/--full-fonts 仅用于 --format pptx");
    }
    const result = await buildDeck({
      manifest,
      format,
      outPath: value(values, "-o", "--out"),
      embedFonts: !flags.has("--no-embed-fonts"),
      fullFonts: flags.has("--full-fonts"),
      pages: value(values, "--page") ?? "all",
      scale: value(values, "--scale") ?? 1,
      browserPath: value(values, "--browser"),
      timeoutMs: value(values, "--timeout") ?? 30000,
      fetchFonts: flags.has("--fetch"),
      offline: flags.has("--offline"),
      strict: flags.has("--strict"),
      raw: flags.has("--raw"),
      log,
    });
    if (json) process.stdout.write(JSON.stringify(buildJson(result, format)) + "\n");
    else printHuman(result, format);
  } catch (err) {
    emitError(err);
  }
}
