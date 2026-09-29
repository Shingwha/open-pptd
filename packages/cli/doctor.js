// ============================================================================
// cli/doctor.js — doctor / paths subcommands (L1.6, command surface in appendix D.9)
// ----------------------------------------------------------------------------
//   doctor [--json]  prints five facts at once: cli / node / home (with writability) / assets / path
//   paths  [--json]  prints home and each resource dir (runtime counterpart of contract.json)
//
// doctor serves three parties with one command: model self-check, install-script final
// verification, user troubleshooting; it can distinguish three high-frequency failure
// modes — CLI missing, installed but PATH not set, CLI present but resources not downloaded.
// --json: stdout is a single JSON line (human text goes to stderr).
// ============================================================================

import { existsSync, writeFileSync, rmSync, accessSync, constants } from "node:fs";
import { join, dirname, delimiter } from "node:path";
import { paths, resourceRoots, resolveCliRoot, contractRoot } from "../paths.js";
import { readFontRegistry, readIconRegistry, fontReadyInfo, iconReadyInfo, packageVersion } from "./resource-status.js";
import { readConfig } from "../config.js";

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

/** Collect the five facts (doctor --json contract). */
export function collectDoctorFacts() {
  const fontReg = readFontRegistry();
  const iconReg = readIconRegistry();
  const f = fontReadyInfo(fontReg);
  const ic = iconReadyInfo(iconReg);
  const binDir = join(paths.cli, "bin");
  return {
    cli: { version: packageVersion(), root: resolveCliRoot() || contractRoot() },
    node: { version: process.version },
    home: { path: paths.home, writable: isWritable(paths.home) },
    assets: { fonts: { ready: f.ready, total: f.total }, icons: { ready: ic.ready, total: ic.total } },
    path: { onPath: onPath(binDir), dir: binDir },
  };
}

/** doctor subcommand entry. */
export function runDoctor(args) {
  const json = args.includes("--json");
  const log = json ? console.error : console.log;
  let facts;
  try {
    facts = collectDoctorFacts();
  } catch (err) {
    console.error(`✗ 体检失败: ${err.message}`);
    process.exit(1);
  }
  if (json) process.stdout.write(JSON.stringify(facts) + "\n");
  else {
    console.log("open-pptd doctor\n");
    console.log(`  cli      ${facts.cli.version}  (${facts.cli.root})`);
    console.log(`  node     ${facts.node.version}`);
    console.log(`  home     ${facts.home.path}  ${facts.home.writable ? "✓ 可写" : "✗ 不可写（EACCES/EPERM）"}`);
    console.log(`  assets   字体 ${facts.assets.fonts.ready}/${facts.assets.fonts.total} · 图标 ${facts.assets.icons.ready}/${facts.assets.icons.total}`);
    console.log(`  path     ${facts.path.onPath ? "✓ 已在 PATH" : "✗ 不在 PATH（新开终端或手工加入）"}  ${facts.path.dir}`);
    if (!facts.home.writable) console.log("\n⚠ home 不可写：下载/配置写入会失败，可用 OPEN_PPTD_HOME 指定可写目录。");
    else if (facts.assets.fonts.ready < facts.assets.fonts.total) console.log("\n提示：字体未齐 → node bin/open-pptd.js assets sync fonts");
    return undefined;
  }
}

/** paths subcommand entry. */
export function runPaths(args) {
  const json = args.includes("--json");
  const cfg = readConfig();
  const facts = {
    home: paths.home,
    packageRoot: contractRoot(),
    assets: paths.assets,
    fonts: paths.fonts,
    icons: paths.icons,
    cli: paths.cli,
    cliCurrent: paths.cliCurrent,
    config: paths.config,
    state: paths.state,
    cache: paths.cache,
    tmp: paths.tmp,
    resourceRoots: { fonts: resourceRoots.fonts, icons: resourceRoots.icons, registry: resourceRoots.registry },
    configValues: cfg,
  };
  if (json) {
    process.stdout.write(JSON.stringify(facts) + "\n");
    return;
  }
  console.log("open-pptd 路径\n");
  console.log(`  home        ${paths.home}${existsSync(paths.home) ? "" : "  （尚未创建）"}`);
  console.log(`  包根        ${contractRoot()}`);
  console.log(`  assets      ${paths.assets}`);
  console.log(`  fonts       ${paths.fonts}`);
  console.log(`  icons       ${paths.icons}`);
  console.log(`  cli         ${paths.cli}（current: ${paths.cliCurrent}）`);
  console.log(`  config      ${paths.config}`);
  console.log(`  state       ${paths.state}`);
  console.log(`  cache/tmp   ${paths.cache} · ${paths.tmp}`);
  console.log("\n  读三级：OPEN_PPTD_HOME → home → 包内 assets；registry.json 恒读包内。");
}
