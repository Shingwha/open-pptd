// cli/open.js — `open`: local preview/editor server (the only serve entry)
// No argument → Home (gallery); <dir> → deck.pptd or the single *.pptd in that dir
// (missing/multiple manifests fail fast with candidates); --blank → blank editor;
// --stop stops instances of the current project (--all stops every one).
// Instances live in ~/.open-pptd/state/instances.json; --stop verifies the pid is
// alive AND /api/ping answers before killing. Human text → stderr; --json is one line.

import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import http from "node:http";
import { startServer } from "../server/index.js";
import { paths } from "../paths.js";
import { CliError, jsonLine, reportError } from "./errors.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OPEN_VALUED = new Set(["--deck", "--port"]);

function parseOpenArgs(args) {
  const positional = [];
  const flags = new Set();
  const values = new Map();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--") && a.includes("=")) {
      const [k, ...rest] = a.split("=");
      values.set(k, rest.join("="));
      continue;
    }
    if (OPEN_VALUED.has(a)) {
      values.set(a, args[i + 1] ?? null);
      i += 1;
      continue;
    }
    if (a.startsWith("-")) flags.add(a);
    else positional.push(a);
  }
  return { positional, flags, values };
}

// ---------------------------------------------------------------------------
// Instance table (~/.open-pptd/state/instances.json)
// ---------------------------------------------------------------------------
function instancesFile() {
  return join(paths.state, "instances.json");
}

function readInstances() {
  try {
    const doc = JSON.parse(readFileSync(instancesFile(), "utf8"));
    const list = Array.isArray(doc) ? doc : doc?.instances;
    return Array.isArray(list) ? list.filter((e) => e && Number.isInteger(e.pid)) : [];
  } catch {
    return [];
  }
}

function writeInstances(list) {
  const file = instancesFile();
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid.toString(36)}.tmp`;
  writeFileSync(tmp, JSON.stringify({ version: 1, instances: list }, null, 2) + "\n", "utf8");
  renameSync(tmp, file);
}

function upsertInstance(entry) {
  const list = readInstances().filter((e) => e.pid !== entry.pid);
  list.push(entry);
  writeInstances(list);
}

function removeInstance(pid) {
  const list = readInstances();
  const next = list.filter((e) => e.pid !== pid);
  if (next.length !== list.length) {
    try {
      writeInstances(next);
    } catch {
      /* the process is going away; a failed cleanup must not mask the exit */
    }
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Liveness: the port must be an open-pptd server (/api/ping → {ok:true,mode:"local"}). */
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

function normPath(p) {
  const s = String(p || "").replace(/[\\/]+/g, "/").replace(/\/+$/, "");
  return process.platform === "win32" ? s.toLowerCase() : s;
}

function samePath(a, b) {
  return !!a && !!b && normPath(resolve(a)) === normPath(resolve(b));
}

// ---------------------------------------------------------------------------
// Project / deck discovery (fail fast; never start a server that cannot load)
// ---------------------------------------------------------------------------
function resolveTarget(dirArg, deckArg) {
  if (deckArg) {
    let base = process.cwd();
    if (dirArg) {
      const abs = resolve(dirArg);
      base = existsSync(abs) && statSync(abs).isDirectory() ? abs : dirname(abs);
    }
    const manifest = resolve(base, deckArg);
    if (!existsSync(manifest)) throw new CliError("ERR_NOT_FOUND", `deck 不存在: ${manifest}`);
    return { manifest, projectRoot: dirname(manifest) };
  }
  if (!dirArg) return { manifest: null, projectRoot: null };
  const abs = resolve(dirArg);
  if (!existsSync(abs)) throw new CliError("ERR_NOT_FOUND", `目录不存在: ${abs}`);
  if (!statSync(abs).isDirectory()) return { manifest: abs, projectRoot: dirname(abs) };
  const standard = join(abs, "deck.pptd");
  if (existsSync(standard)) return { manifest: standard, projectRoot: abs };
  const candidates = readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".pptd"))
    .map((e) => e.name)
    .sort();
  if (!candidates.length) {
    throw new CliError("ERR_NO_DECK", `未找到 .pptd：${abs}（--blank 打开空白，或不带参数打开 Home）`);
  }
  if (candidates.length > 1) {
    throw new CliError("ERR_MULTI_DECK", `发现多个 .pptd 候选，请用 --deck 指定：${candidates.join("、")}`);
  }
  return { manifest: join(abs, candidates[0]), projectRoot: abs };
}

/** Project dir used by --stop matching (no existence requirement: the dir may be gone). */
function stopProjectPath(dirArg, deckArg) {
  if (deckArg) {
    let base = process.cwd();
    if (dirArg) {
      const abs = resolve(dirArg);
      base = existsSync(abs) && statSync(abs).isDirectory() ? abs : dirname(abs);
    }
    return dirname(resolve(base, deckArg));
  }
  return dirArg ? resolve(dirArg) : resolve(".");
}

function deckUrlOf(manifest) {
  return "project/" + encodeURIComponent(basename(manifest));
}

function openBrowser(url) {
  try {
    const isWin = process.platform === "win32";
    const cmd = isWin ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
    const argv = isWin ? ["/c", "start", "", url] : [url];
    const child = spawn(cmd, argv, { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
  } catch {
    /* a browser launch failure does not affect the server */
  }
}

// ---------------------------------------------------------------------------
// --stop
// ---------------------------------------------------------------------------
async function runStop({ dirArg, deckArg, all, json }) {
  const log = (m) => console.error(m);
  const list = readInstances();
  if (!list.length) {
    if (json) jsonLine({ ok: true, stopped: [], stale: [], refused: [] });
    else log("无运行中的 open-pptd 实例");
    return;
  }
  const project = all ? null : stopProjectPath(dirArg, deckArg);
  const targets = list.filter((e) => all || samePath(e.project, project));
  if (!targets.length) {
    if (json) jsonLine({ ok: true, stopped: [], stale: [], refused: [] });
    else log(`无匹配的 open-pptd 实例（项目：${project}；--all 停止全部）`);
    return;
  }

  const stopped = [];
  const stale = [];
  const refused = [];
  let remaining = list.filter((e) => !targets.includes(e));
  for (const entry of targets) {
    if (!pidAlive(entry.pid)) {
      stale.push({ pid: entry.pid, port: entry.port, project: entry.project || null });
      continue;
    }
    const confirmed = await pingOpenPptd(entry.port);
    if (!confirmed) {
      refused.push({ pid: entry.pid, port: entry.port, project: entry.project || null });
      remaining.push(entry);
      continue;
    }
    try {
      process.kill(entry.pid, "SIGTERM");
    } catch (err) {
      refused.push({ pid: entry.pid, port: entry.port, project: entry.project || null, reason: err.message });
      remaining.push(entry);
      continue;
    }
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && pidAlive(entry.pid)) await sleep(100);
    stopped.push({ pid: entry.pid, port: entry.port, project: entry.project || null, url: entry.url });
  }
  try {
    writeInstances(remaining);
  } catch (err) {
    log(`⚠ 实例表写入失败: ${err.message}`);
  }

  const ok = refused.length === 0;
  if (json) jsonLine({ ok, stopped, stale, refused });
  else {
    for (const e of stopped) log(`✓ 已停止 open-pptd（pid ${e.pid} · port ${e.port}）${e.url ? " " + e.url : ""}`);
    for (const e of stale) log(`✓ 已清理陈旧实例（pid ${e.pid} 已退出）`);
    for (const e of refused) log(`✗ 实例（pid ${e.pid} · port ${e.port}）探活失败，未终止`);
    if (!stopped.length && !stale.length && !refused.length) log("无运行中的 open-pptd 实例");
  }
  if (!ok) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// foreground / detached start
// ---------------------------------------------------------------------------
async function runForeground({ target, blank, port, json, open }) {
  const log = (m) => console.error(m);
  const entry = {
    pid: process.pid,
    port: 0,
    url: "",
    project: target.projectRoot || null,
    deck: target.manifest || null,
    startedAt: "",
  };
  process.once("exit", () => removeInstance(process.pid));
  try {
    await startServer({
      port,
      projectRoot: target.projectRoot || undefined,
      deckUrl: target.manifest ? deckUrlOf(target.manifest) : null,
      onListen(info) {
        const url = blank ? `${info.url}?blank=1` : info.url;
        entry.port = info.port;
        entry.url = url;
        entry.startedAt = new Date().toISOString();
        try {
          upsertInstance(entry);
        } catch (err) {
          log(`⚠ 无法写入实例表（--stop 将不可用）: ${err.message}`);
        }
        if (json) jsonLine({ url, port: info.port, pid: process.pid, project: entry.project, deck: entry.deck });
        else {
          log(`open-pptd 已启动: ${url}`);
          log(`  停止：node bin/open-pptd.js open${target.projectRoot ? " " + target.projectRoot : ""} --stop`);
        }
        if (open) openBrowser(url);
      },
    });
  } catch (err) {
    if (err?.code === "EADDRINUSE") throw new CliError("ERR_PORT", `端口 ${port}~${port + 9} 均被占用，可用 --port 指定其他端口`);
    throw err;
  }
}

async function runDetach({ target, blank, port, json, open }) {
  const log = (m) => console.error(m);
  const binPath = join(PKG_ROOT, "bin", "open-pptd.js");
  // The detached child is the long-lived foreground server; only the parent decides
  // whether to open a browser (--open). Without --no-open the child would apply its
  // default open policy and pop a second tab for every `open --detach`.
  const childArgs = [binPath, "open", "--port", String(port), "--no-open"];
  if (target.manifest) childArgs.push("--deck", target.manifest);
  if (blank) childArgs.push("--blank");
  const child = spawn(process.execPath, childArgs, { detached: true, stdio: "ignore", windowsHide: true, cwd: process.cwd() });
  child.unref();

  let exited = false;
  child.once("exit", () => (exited = true));
  const deadline = Date.now() + 15000;
  let info = null;
  while (Date.now() < deadline) {
    if (exited) break;
    info = readInstances().find((e) => e.pid === child.pid) || null;
    if (info) break;
    await sleep(100);
  }
  if (!info) {
    throw new CliError("ERR_OPEN_DETACH", "open --detach 启动失败（子进程未就绪；端口可能全部被占用）");
  }
  if (open) openBrowser(info.url);
  const payload = { url: info.url, port: info.port, pid: info.pid, project: info.project || null, deck: info.deck || null };
  if (json) jsonLine(payload);
  else {
    log(`✓ open-pptd 已在后台启动（pid ${info.pid}）`);
    log(`  ${info.url}`);
    log(`  停止：node bin/open-pptd.js open${info.project ? " " + info.project : ""} --stop`);
  }
}

/**
 * open subcommand entry.
 * @param {string[]} args
 */
export async function runOpen(args) {
  const { positional, flags, values } = parseOpenArgs(args);
  const json = flags.has("--json");
  const log = (m) => console.error(m);

  const dirArg = positional[0] || null;
  const deckArg = values.get("--deck") || null;
  const blank = flags.has("--blank");
  const detach = flags.has("--detach");
  const stop = flags.has("--stop");
  const all = flags.has("--all");
  const port = Number(values.get("--port") || 55173);

  try {
    if (stop) return await runStop({ dirArg, deckArg, all, json });
    if (blank && deckArg) throw new CliError("ERR_USAGE", "--blank 与 --deck 互斥");
    const target = blank ? { manifest: null, projectRoot: null } : resolveTarget(dirArg, deckArg);
    const openExplicit = flags.has("--open");
    const openDefault = !detach && !json && !flags.has("--no-open");
    const open = openExplicit || openDefault;
    if (detach) return await runDetach({ target, blank, port, json, open });
    return await runForeground({ target, blank, port, json, open });
  } catch (err) {
    return reportError(err, { json, log });
  }
}

// Local path helpers used by tests (exported for the CLI surface suite).
export { readInstances, resolveTarget, instancesFile };
