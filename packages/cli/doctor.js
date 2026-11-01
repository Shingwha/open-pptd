// cli/doctor.js — `doctor`: environment, paths, libraries and PNG capability
// One read-only report: cli version/root · node · home writability · asset/theme/user-font
// counts · PATH · every path value · Chrome/Edge availability for PNG export.
// Exit code: critical failures (node < 18, home not writable) → 1; missing PATH /
// incomplete assets / no browser → 0 with a hint (resources are optional).
// --json prints a single line on stdout; human output goes to stderr.

import { existsSync, writeFileSync, rmSync, accessSync, constants, readdirSync } from "node:fs";
import { join, dirname, delimiter } from "node:path";
import { paths, resourceRoots, resolveCliRoot, contractRoot } from "../paths.js";
import { readFontRegistry, readIconRegistry, fontReadyInfo, iconReadyInfo, packageVersion } from "./resource-status.js";
import { readConfig } from "../config.js";
import { listBuiltinThemes, BUILTIN_THEME_PREFIX } from "../model/theme-library.js";
import { readUserFontEntries } from "../server/font-library.js";
import { findBrowser } from "../renderer/headless/browser.js";
import { jsonLine } from "./errors.js";

/** Nearest existing ancestor (write the probe there, so testing writability never creates home). */
function nearestExisting(dir) {
  let d = dir;
  for (;;) {
    if (existsSync(d)) return d;
    const p = dirname(d);
    if (p === d) return null;
    d = p;
  }
}

/** Is the dir (or its nearest ancestor) writable: permission bits first, then a real probe write cleaned up after. */
function isWritable(dir) {
  const base = nearestExisting(dir);
  if (!base) return false;
  try {
    accessSync(base, constants.W_OK);
  } catch {
    return false;
  }
  const probe = join(base, `.open-pptd-probe-${process.pid.toString(36)}${Date.now().toString(36)}.tmp`);
  try {
    writeFileSync(probe, "");
    rmSync(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

/** Does PATH contain a dir (Windows case-insensitive, separators normalized). */
function onPath(dir) {
  const norm = (s) => String(s).replace(/[\\/]+/g, "/").replace(/\/+$/, "").toLowerCase();
  const target = norm(dir);
  return String(process.env.PATH || "")
    .split(delimiter)
    .some((e) => e && norm(e) === target);
}

/** User theme count (file-per-theme JSON in home/themes; built-ins are code constants). */
function userThemeCount() {
  try {
    if (!existsSync(paths.themes)) return 0;
    return readdirSync(paths.themes).filter((n) => n.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

/** PNG capability: Chrome/Edge discovery (no launch). */
function pngCapability() {
  try {
    const browser = findBrowser();
    return { available: true, browser, reason: null };
  } catch (err) {
    return { available: false, browser: null, reason: String(err?.message || err) };
  }
}

/** Collect every doctor fact (doctor --json contract). */
export function collectDoctorFacts() {
  const fontReg = readFontRegistry();
  const iconReg = readIconRegistry();
  const f = fontReadyInfo(fontReg);
  const ic = iconReadyInfo(iconReg);
  const userFonts = readUserFontEntries().length;
  const builtin = listBuiltinThemes().length;
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const homeWritable = isWritable(paths.home);
  const cliRoot = resolveCliRoot() || contractRoot();
  const png = pngCapability();
  const critical = [];
  if (nodeMajor < 18) critical.push(`Node ${process.version} 过低（需要 ≥ 18）`);
  if (!homeWritable) critical.push("home 不可写（下载/配置写入会失败）");
  if (!cliRoot) critical.push("CLI 根目录未找到");
  return {
    ok: critical.length === 0,
    critical,
    cli: { version: packageVersion(), root: cliRoot },
    node: { version: process.version, major: nodeMajor, supported: nodeMajor >= 18 },
    home: { path: paths.home, writable: homeWritable },
    assets: {
      fonts: { ready: f.ready, total: f.total, user: userFonts },
      icons: { ready: ic.ready, total: ic.total },
      themes: { builtin, user: userThemeCount(), userPrefix: BUILTIN_THEME_PREFIX },
    },
    path: { onPath: onPath(join(paths.cli, "bin")), dir: join(paths.cli, "bin") },
    paths: {
      home: paths.home,
      packageRoot: contractRoot(),
      assets: paths.assets,
      fonts: paths.fonts,
      userFonts: paths.userFonts,
      icons: paths.icons,
      themes: paths.themes,
      cli: paths.cli,
      cliCurrent: paths.cliCurrent,
      config: paths.config,
      state: paths.state,
      cache: paths.cache,
      tmp: paths.tmp,
      resourceRoots: { fonts: resourceRoots.fonts, icons: resourceRoots.icons, registry: resourceRoots.registry },
      configValues: readConfig(),
    },
    png,
  };
}

/** doctor subcommand entry. */
export function runDoctor(args) {
  const json = args.includes("--json");
  const log = (m) => console.error(m);
  let facts;
  try {
    facts = collectDoctorFacts();
  } catch (err) {
    log(`✗ 体检失败: ${err.message}`);
    process.exitCode = 1;
    return;
  }
  if (json) jsonLine(facts);
  else {
    log("open-pptd doctor\n");
    log(`  cli      ${facts.cli.version}  (${facts.cli.root})`);
    log(`  node     ${facts.node.version}${facts.node.supported ? "" : "  ✗ 需要 ≥ 18"}`);
    log(`  home     ${facts.home.path}  ${facts.home.writable ? "✓ 可写" : "✗ 不可写（EACCES/EPERM）"}`);
    log(
      `  assets   字体 ${facts.assets.fonts.ready}/${facts.assets.fonts.total}（用户 ${facts.assets.fonts.user}）` +
        ` · 图标 ${facts.assets.icons.ready}/${facts.assets.icons.total}` +
        ` · 主题 ${facts.assets.themes.builtin} 内置/${facts.assets.themes.user} 我的`
    );
    log(`  png      ${facts.png.available ? "✓ " + facts.png.browser : "✗ 未找到 Chrome/Edge（--browser 可指定）"}`);
    log(`  path     ${facts.path.onPath ? "✓ 已在 PATH" : "✗ 不在 PATH（新开终端或手工加入）"}  ${facts.path.dir}`);
    log("\n  home 路径");
    for (const [key, value] of Object.entries(facts.paths)) {
      if (key === "resourceRoots" || key === "configValues") continue;
      log(`    ${key.padEnd(12)} ${value}`);
    }
    log(`    configValues ${JSON.stringify(facts.paths.configValues)}`);
    log("\n  读三级：OPEN_PPTD_HOME → home → 包内 assets；registry.json 恒读包内。");
    if (!facts.home.writable) log("\n⚠ home 不可写：可用 OPEN_PPTD_HOME 指定可写目录。");
    else if (facts.assets.fonts.ready < facts.assets.fonts.total) log("\n提示：字体未齐 → node bin/open-pptd.js assets sync fonts");
    if (!facts.png.available) log("提示：PNG 导出需要 Chrome/Edge；PPTX/bundle 不需要浏览器。");
    if (!facts.path.onPath) log("提示：CLI 不在 PATH；装上后可直接用 open-pptd 命令。");
  }
  if (!facts.ok) process.exitCode = 1;
}
