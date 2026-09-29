// ============================================================================
// cli/bin.js — CLI assembly root (argument parsing and command dispatch, thin shell)
// ----------------------------------------------------------------------------
// Command surface (stable surface in integration-plan appendix D.9; adding a
// subcommand is a compatible change):
//   serve [--port <n>] [--project <dir>] [--detach] [--json] [--stop] [--open]
//   export <deck.pptd> [--out <pptx>] [--theme <key>] [--no-embed-fonts] [--full-fonts]
//                      [--offline] [--strict] [--json] [--fetch]
//   export-project <deck.pptd> [--out <zip>] [--offline] [--strict] [--json]
//   ensure <manifest> [--offline] [--strict] [--json]
//   check <deck.pptd>
//   render <deck.pptd> [-o <dir>] [--page <n|all>] [--scale <n>] [--browser <p>] [--timeout <ms>]
//   gallery scan|list
//   assets list | sync [icons|fonts|all] [--from <zip>] | clean
//   paths [--json]
//   doctor [--json]
//   fonts list|download|check    (compatibility aliases)
//   icons list|download          (compatibility aliases)
// Business logic: export.js / render.js / gallery.js / fonts.js / icons.js /
//                 doctor.js / paths(doctor.js) / assets.js / ensure.js (this file only dispatches).
// serve --json: stdout carries a single JSON line ({url,port,pid}); all human text goes to stderr.
// ============================================================================

import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import http from "node:http";
import { startServer } from "../server/index.js";
import { paths } from "../paths.js";
import { readConfig } from "../config.js";
import { exportDeck, exportProject } from "./export.js";
import { runCheck } from "./check.js";
import { runRender } from "./render.js";
import { runGallery } from "./gallery.js";
import { runFonts } from "./fonts.js";
import { runIcons } from "./icons.js";
import { runDoctor, runPaths } from "./doctor.js";
import { runAssets } from "./assets.js";
import { runEnsure, collectRequirements, checkResources, ensureResources } from "./ensure.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, "..", "..");
const EXAMPLES_DIR = join(PKG_ROOT, "examples");

function usage() {
  console.log(
    "open-pptd CLI\n\n" +
      "用法:\n" +
      "  open-pptd serve [--port <port>] [--project <目录>] [--detach] [--json] [--open]\n" +
      "                  启动本地网页编辑器（绑 127.0.0.1，端口占用自动顺延）\n" +
      "      --detach: 后台启动后立即返回；--json: stdout 仅一行 {url,port,pid}；--open: 唤起浏览器\n" +
      "  open-pptd serve --stop                     停止由本 CLI 启动的 serve（陈旧 pid 不误杀）\n" +
      "  open-pptd export <deck.pptd> [-o <out.pptx>]  命令行导出 PPTX\n" +
      "                           [--no-embed-fonts]   不嵌入字体（默认嵌入）\n" +
      "                           [--full-fonts]       嵌入完整字体（默认子集化；导出后可继续编辑，文件更大）\n" +
      "                           [--offline]          只体检不下载（默认也仅体检；--fetch 才补齐）\n" +
      "                           [--strict]           资源缺失即非零退出；[--json] 输出体检清单\n" +
      "  open-pptd export-project <deck.pptd> [-o <out.zip>]  导出项目包（pptd+pages+media，原样打包）\n" +
      "                           [--offline] [--strict] [--json]\n" +
      "  open-pptd ensure <manifest> [--offline] [--strict] [--json]  导出前置资源体检 + 按需补齐\n" +
      "  open-pptd check <deck.pptd>                   结构自查（schema/token/资源/字体/几何/对比度）\n" +
      "  open-pptd render <deck.pptd> [-o <目录>] [--page <n|all>] [--scale <1|2|3>]\n" +
      "                           [--browser <路径>] [--timeout <毫秒>]\n" +
      "                        逐页渲染为 PNG（无头浏览器，与编辑器预览同管线）\n" +
      "  open-pptd gallery scan                      扫描 examples/ 生成静态画廊索引\n" +
      "                        （examples/manifest.json，仅提交给 GitHub Pages 用；本地 serve 自动扫描）\n" +
      "  open-pptd gallery list                      列出画廊条目\n" +
      "\n" +
      "  资源与自检：\n" +
      "  open-pptd assets list                        资源状态（字体/图标就绪数、体积、注册表版本）\n" +
      "  open-pptd assets sync [icons|fonts|all]      下载资产包并解压到 ~/.open-pptd/assets\n" +
      "                        [--from <zip>]         离线导入本地 zip\n" +
      "  open-pptd assets clean                       清 cache/ 与 tmp/（可安全删除）\n" +
      "  open-pptd paths [--json]                     输出 home 与各资源目录\n" +
      "  open-pptd doctor [--json]                    五项自检（cli/node/home/assets/path）\n" +
      "\n" +
      "  字体库（注册表读包内，字节读 ~/.open-pptd/assets/fonts，下载只写 home）：\n" +
      "  open-pptd fonts list                         查看内置字体库（状态 ✓/✗）\n" +
      "  open-pptd fonts download <名称|all>          按需/全量下载字体文件（兼容别名）\n" +
      "  open-pptd fonts check <deck.pptd>            体检 deck 字体声明（嵌入/仅声明/缺失）\n" +
      "\n" +
      "  图标库（Font Awesome Free，浏览器/导出有 CDN 兜底，下载仅供离线）：\n" +
      "  open-pptd icons list                         查看图标库状态（fas/far/fab 本地/总数）\n" +
      "  open-pptd icons download [--force]           全量下载三风格 SVG（兼容别名）\n"
  );
}

/** Option value: --key <value>, returns fallback when absent. */
function opt(args, key, fallback = null) {
  const idx = args.indexOf(key);
  return idx >= 0 ? args[idx + 1] : fallback;
}

/** Output path: -o or --out. */
function outArg(args) {
  const idx = args.indexOf("-o") >= 0 ? args.indexOf("-o") : args.indexOf("--out");
  return idx >= 0 ? args[idx + 1] : null;
}

// ---------------------------------------------------------------------------
// serve: state file (~/.open-pptd/state/serve.json) and the stop/detach handshake
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function writeServeState(stateFile, state) {
  mkdirSync(dirname(stateFile), { recursive: true });
  const tmp = `${stateFile}.${process.pid.toString(36)}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
  renameSync(tmp, stateFile);
}

/** Read the state file (null when not ready/corrupt). */
function readServeState(stateFile) {
  try {
    const s = JSON.parse(readFileSync(stateFile, "utf8"));
    return s && typeof s === "object" ? s : null;
  } catch {
    return null;
  }
}

/** Liveness: confirm the port is really open-pptd serve (/api/ping → {ok:true,mode:"local"}). */
function pingOpenPptd(port) {
  return new Promise((done) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/api/ping", timeout: 1500 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => done(res.statusCode === 200 && /"mode"\s*:\s*"local"/.test(body)));
    });
    req.on("error", () => done(false));
    req.on("timeout", () => {
      req.destroy();
      done(false);
    });
  });
}

function openBrowser(url) {
  try {
    const isWin = process.platform === "win32";
    const cmd = isWin ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
    const argv = isWin ? ["/c", "start", "", url] : [url];
    const child = spawn(cmd, argv, { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
  } catch {
    /* a browser launch failure does not affect serve */
  }
}

/** serve --stop: read state → verify the pid is alive and really ours → terminate and clean up. */
async function serveStop(stateFile, json) {
  const human = (m) => (json ? console.error(m) : console.log(m));
  if (!existsSync(stateFile)) {
    human("无运行中的 serve（状态文件不存在）");
    return;
  }
  const st = readServeState(stateFile);
  if (!st) {
    rmSync(stateFile, { force: true });
    human("无运行中的 serve（状态文件损坏，已清理）");
    return;
  }
  let alive = false;
  try {
    process.kill(st.pid, 0);
    alive = true;
  } catch {
    alive = false;
  }
  if (!alive) {
    rmSync(stateFile, { force: true });
    human(`无运行中的 serve（pid ${st.pid} 已退出，已清理陈旧状态）`);
    return;
  }
  const confirmed = await pingOpenPptd(st.port);
  if (!confirmed) {
    human(`✗ 状态文件中的进程（pid ${st.pid}）不是 open-pptd serve（探活失败），未终止`);
    process.exitCode = 1;
    return;
  }
  try {
    process.kill(st.pid, "SIGTERM");
  } catch (err) {
    human(`✗ 终止失败: ${err.message}`);
    process.exitCode = 1;
    return;
  }
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    let still = false;
    try {
      process.kill(st.pid, 0);
      still = true;
    } catch {
      still = false;
    }
    if (!still) break;
    await sleep(100);
  }
  rmSync(stateFile, { force: true });
  human(`✓ 已停止 serve（pid ${st.pid} · port ${st.port}）`);
}

/** serve --detach: spawn a detached child and return once it writes state to state/serve.json. */
async function serveDetach({ port, projectRoot, json, open }) {
  const binPath = join(PKG_ROOT, "bin", "open-pptd.js");
  const childArgs = [binPath, "serve", "--port", String(port)];
  if (projectRoot) childArgs.push("--project", projectRoot);
  const child = spawn(process.execPath, childArgs, { detached: true, stdio: "ignore", windowsHide: true, cwd: process.cwd() });
  child.unref();

  const stateFile = join(paths.state, "serve.json");
  const deadline = Date.now() + 15000;
  let exited = false;
  child.once("exit", () => (exited = true));
  let info = null;
  while (Date.now() < deadline) {
    if (exited) break;
    const st = readServeState(stateFile);
    if (st && st.pid === child.pid) {
      info = st;
      break;
    }
    await sleep(100);
  }
  if (!info) {
    console.error("✗ serve --detach 启动失败（子进程未就绪；端口可能全部被占用）");
    process.exit(1);
  }
  if (open) openBrowser(info.url);
  if (json) process.stdout.write(JSON.stringify({ url: info.url, port: info.port, pid: info.pid }) + "\n");
  else {
    console.log(`✓ open-pptd 已在后台启动（pid ${info.pid}）`);
    console.log(`  ${info.url}`);
    console.log("  停止：node bin/open-pptd.js serve --stop");
  }
}

async function runServe(args) {
  const json = args.includes("--json");
  const detach = args.includes("--detach");
  const open = args.includes("--open");
  const port = Number(opt(args, "--port", 55173));
  const projectRoot = opt(args, "--project");
  const stateFile = join(paths.state, "serve.json");

  if (args.includes("--stop")) return serveStop(stateFile, json);

  if (projectRoot) {
    if (!existsSync(projectRoot)) {
      console.error(`✗ 项目目录不存在: ${projectRoot}`);
      process.exit(1);
    }
    if (!existsSync(join(projectRoot, "deck.pptd"))) {
      console.warn(`⚠ ${projectRoot} 下未找到 deck.pptd（期望项目 manifest 名）`);
    }
  }

  if (detach) return serveDetach({ port, projectRoot, json, open });

  try {
    await startServer({
      port,
      projectRoot,
      deckUrl: projectRoot ? "project/deck.pptd" : null,
      onListen: (info) => {
        try {
          writeServeState(stateFile, {
            pid: process.pid,
            port: info.port,
            url: info.url,
            projectRoot: projectRoot ? resolve(projectRoot) : null,
            startedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.error(`⚠ 无法写入 serve 状态（--stop 将不可用）: ${err.message}`);
        }
        if (open) openBrowser(info.url);
        if (json) process.stdout.write(JSON.stringify({ url: info.url, port: info.port, pid: process.pid }) + "\n");
        else console.log(`open-pptd 已启动: ${info.url}`);
      },
    });
  } catch (err) {
    if (err?.code === "EADDRINUSE") {
      console.error(`端口 ${port}~${port + 9} 均被占用，可用 --port 指定其他端口`);
      process.exit(1);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// export / export-project: preflight resource check by default (soft-degrade, never blocks export)
// ---------------------------------------------------------------------------
async function runExportLike(args, { projectMode }) {
  const manifest = args[1];
  if (!manifest) {
    usage();
    process.exit(1);
  }
  const json = args.includes("--json");
  const offline = args.includes("--offline");
  const strict = args.includes("--strict");
  // Check only by default (avoids accidentally triggering tens of MB of downloads in CI/agent);
  // only --fetch / config.autoFetch fetch.
  const fetchToo = !offline && (args.includes("--fetch") || args.includes("--auto-fetch") || readConfig().autoFetch === true);
  const warn = (m) => console.error(m);

  let reqs = null;
  let summary = null;
  let fetched = [];
  try {
    if (!existsSync(manifest)) throw Object.assign(new Error(`文件不存在: ${manifest}`), { skipPreflight: true });
    reqs = collectRequirements({ manifest });
    summary = checkResources(reqs);
    warn(`▸ 资源体检：字体 ${summary.fonts.ready}/${summary.checked.fonts} 就绪 · 图标 ${summary.icons.known}/${summary.checked.icons} · 媒体 ${summary.media.ready}/${summary.checked.media}`);
    if (summary.missing.length) warn(`⚠ ${summary.missing.length} 项缺失（软降级：不阻塞导出${fetchToo ? "" : "；--fetch 可补齐"}）`);
    if (strict && summary.missing.length) {
      if (json) process.stdout.write(JSON.stringify({ checked: summary.checked, fetched: [], embedded: [], skipped: [], missing: summary.missing }) + "\n");
      warn("✗ --strict：资源缺失，已中止导出");
      process.exit(1);
    }
    if (fetchToo && summary.fonts.fetchable) {
      warn(`▸ 按需补齐 ${summary.fonts.fetchable} 个字体…`);
      const r = await ensureResources(reqs, { offline: false });
      fetched = r.fetched;
      summary = r.summary;
    }
  } catch (err) {
    if (!err?.skipPreflight) warn(`⚠ 资源体检失败（忽略，不影响导出）: ${err.message}`);
  }

  let res;
  try {
    if (projectMode) {
      res = await exportProject({ manifest, outPath: outArg(args) });
    } else {
      res = await exportDeck({
        manifest,
        outPath: outArg(args),
        theme: opt(args, "--theme"),
        embedFonts: !args.includes("--no-embed-fonts"),
        fullFonts: args.includes("--full-fonts"),
      });
    }
  } catch (err) {
    console.error(`✗ 导出失败: ${err.message}`);
    process.exit(1);
  }

  if (json) {
    const skipped = res.skipped || [];
    const skippedSet = new Set(skipped.map((s) => s.family));
    const embedded = (reqs?.fonts || [])
      .filter((f) => f.status === "ready" && !skippedSet.has(f.family))
      .map((f) => ({ family: f.family, file: f.file, subset: f.subset }));
    process.stdout.write(
      JSON.stringify({
        checked: summary?.checked || {},
        fetched,
        embedded,
        skipped,
        missing: summary?.missing || [],
      }) + "\n"
    );
  } else {
    console.log(projectMode ? `✓ 项目包已导出 → ${res.outPath}` : `✓ 已导出 → ${res.outPath}`);
  }
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
  if (command === "icons") {
    if (!(await runIcons(args.slice(1)))) {
      usage();
      process.exit(1);
    }
    return;
  }
  if (command === "assets") {
    if (!(await runAssets(args.slice(1)))) {
      usage();
      process.exit(1);
    }
    return;
  }
  if (command === "doctor") {
    runDoctor(args.slice(1));
    return;
  }
  if (command === "paths") {
    runPaths(args.slice(1));
    return;
  }
  if (command === "ensure") {
    await runEnsure(args);
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
    await runServe(args);
    return;
  }
  if (command === "export-project") {
    await runExportLike(args, { projectMode: true });
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
    await runExportLike(args, { projectMode: false });
    return;
  }
  usage();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
