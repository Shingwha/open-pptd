// tests/cli/surface.mjs — CLI surface contract (5 commands, no aliases).
// 1. --help lists only open/build/check/assets/doctor; removed commands exit 1 with a hint.
// 2. doctor / assets --json are single-line parseable JSON.
// 3. check is read-only (--json shape, human text on stderr, --strict fails on warnings).
// 4. build pptx/bundle/png and open detach/stop/blank work; invalid options/missing browser → ERR_* JSON.
// Usage: node tests/cli/surface.mjs (non-zero exit = surface broken)

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const HOME = mkdtempSync(join(tmpdir(), "pptd-surface-home-"));
const TMP = mkdtempSync(join(tmpdir(), "pptd-surface-"));
const BIN = join(ROOT, "bin", "open-pptd.js");

let fail = 0;
let pass = 0;
function step(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}${detail ? "  " + detail : ""}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? "  " + detail : ""}`);
  }
}

/** Run the CLI with an isolated home; returns {status, stdout, stderr}. */
function cli(args, env = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    cwd: ROOT,
    env: { ...process.env, OPEN_PPTD_HOME: HOME, ...env },
    encoding: "utf8",
    timeout: 240000,
  });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function jsonLine(name, stdout) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length !== 1) {
    step(name, false, `stdout 行数=${lines.length}`);
    return null;
  }
  try {
    return JSON.parse(lines[0]);
  } catch (err) {
    step(name, false, `JSON 解析失败: ${err.message}`);
    return null;
  }
}

const OLD = ["serve", "export", "export-project", "render", "ensure", "paths", "gallery", "fonts", "icons"];
const instancesFile = join(HOME, "state", "instances.json");
const livePids = new Set();
function rememberInstances() {
  try {
    const doc = JSON.parse(readFileSync(instancesFile, "utf8"));
    for (const e of doc.instances || []) livePids.add(e.pid);
  } catch {
    /* no table */
  }
}

try {
  console.log("=== 1. help（只 5 命令）===");
  {
    const r = cli(["--help"]);
    step("--help exit 0", r.status === 0, `exit=${r.status}`);
    for (const cmd of ["open", "build", "check", "assets", "doctor"]) {
      step(`help 列出 ${cmd}`, new RegExp(`open-pptd ${cmd}\\b`).test(r.stdout));
    }
    const oldMentions = OLD.filter((c) => new RegExp(`open-pptd ${c}\\b`).test(r.stdout));
    step("help 不含旧命令", oldMentions.length === 0, oldMentions.join(","));
  }

  console.log("\n=== 2. 旧命令非零 + 迁移提示 ===");
  for (const cmd of OLD) {
    const r = cli([cmd]);
    step(`${cmd}: exit 1`, r.status === 1, `exit=${r.status}`);
    step(`${cmd}: stderr 含迁移提示`, r.stderr.includes(`命令 "${cmd}" 在 3.0 已删除`), r.stderr.slice(0, 80));
    step(`${cmd}: stdout 为空`, r.stdout === "");
  }

  console.log("\n=== 3. doctor / assets JSON 单行 ===");
  {
    const r = cli(["doctor", "--json"]);
    const doc = jsonLine("doctor --json 单行", r.stdout);
    step("doctor exit 0", r.status === 0, `exit=${r.status}`);
    step("doctor 含 paths/png/assets", !!doc?.paths?.state && "png" in (doc || {}) && !!doc?.assets?.fonts);

    const a = cli(["assets", "list", "--json"]);
    const al = jsonLine("assets list --json 单行", a.stdout);
    step("assets list exit 0", a.status === 0 && !!al?.fonts && !!al?.icons);
    step("assets list 含 home/themes", typeof al?.home === "string" && !!al?.themes);

    const t = cli(["assets", "themes", "list", "--json"]);
    const tl = jsonLine("assets themes list --json 单行", t.stdout);
    step("assets themes list exit 0 + counts", t.status === 0 && typeof tl?.counts?.builtin === "number");

    const f = cli(["assets", "fonts", "list", "--json"]);
    const fl = jsonLine("assets fonts list --json 单行", f.stdout);
    step("assets fonts list exit 0 + counts", f.status === 0 && typeof fl?.counts?.builtin === "number");
  }

  console.log("\n=== 4. check 只读 / JSON / strict ===");
  {
    const table = join(ROOT, "tests/projects/table/deck.pptd");
    const r = cli(["check", table]);
    step("check exit 0（仅 warning）", r.status === 0, `exit=${r.status}`);
    step("check human 在 stderr", r.stderr.includes("个错误") && r.stderr.includes("资源："));
    step("check stdout 无人类文本", r.stdout === "");

    const j = cli(["check", table, "--json"]);
    const doc = jsonLine("check --json 单行", j.stdout);
    step("check --json ok=true", j.status === 0 && doc?.ok === true);
    step("check --json 含 perPage/resources/summary", !!doc?.perPage && !!doc?.resources?.fonts && !!doc?.summary);

    const s = cli(["check", table, "--strict", "--json"]);
    const sd = jsonLine("check --strict --json 单行", s.stdout);
    step("check --strict 遇 warning exit 1", s.status === 1 && sd?.ok === false);
  }

  console.log("\n=== 5. build 三格式 + 错误码 ===");
  const project = join(TMP, "proj");
  mkdirSync(join(project, "pages"), { recursive: true });
  writeFileSync(
    join(project, "deck.pptd"),
    "version: v2\ntitle: surface\nsize: [960, 540]\npages:\n  - pages/1.page\n"
  );
  writeFileSync(
    join(project, "pages/1.page"),
    "pageType: content\nelements:\n  - elementId: t1\n    elementType: text\n    bounds: [40, 40, 500, 80]\n    content: {text: Surface build, fontSize: 32}\n"
  );
  const manifest = join(project, "deck.pptd");

  {
    const out = join(TMP, "out.pptx");
    const r = cli(["build", manifest, "--format", "pptx", "-o", out, "--json"]);
    const doc = jsonLine("build pptx --json 单行", r.stdout);
    step("build pptx exit 0", r.status === 0, `exit=${r.status} ${r.stderr.slice(-120)}`);
    step("build pptx 产物存在且非空", existsSync(out) && statSync(out).size > 1000, existsSync(out) ? `${statSync(out).size}B` : "missing");
    step(
      "build pptx JSON 字段",
      doc?.ok === true && doc.format === "pptx" && doc.outPath === out && doc.pages === 1 && Array.isArray(doc.warnings),
      JSON.stringify(doc && Object.keys(doc))
    );
  }

  for (const mode of ["snapshot", "raw"]) {
    const out = join(TMP, `out-${mode}.zip`);
    const args = ["build", manifest, "--format", "bundle", "-o", out, "--json"];
    if (mode === "raw") args.push("--raw");
    const r = cli(args);
    const doc = jsonLine(`build bundle(${mode}) --json 单行`, r.stdout);
    step(`build bundle(${mode}) exit 0`, r.status === 0, `exit=${r.status} ${r.stderr.slice(-120)}`);
    step(`build bundle(${mode}) 产物存在`, existsSync(out) && statSync(out).size > 100);
    step(`build bundle(${mode}) format=bundle`, doc?.format === "bundle" && doc?.ok === true);
  }

  {
    const out = join(TMP, "png");
    const r = cli(["build", manifest, "--format", "png", "--page", "1", "-o", out, "--json"]);
    const doc = jsonLine("build png --json 单行", r.stdout);
    const png = join(out, "deck-01.png");
    if (r.status === 0) {
      step("build png exit 0", !!doc?.ok && doc.format === "png");
      step("build png 产物存在", existsSync(png) && statSync(png).size > 1000);
    } else {
      step("build png 无浏览器 → ERR_RENDER_BACKEND（SKIP 成功路径）", doc?.error?.code === "ERR_RENDER_BACKEND", JSON.stringify(doc));
    }
    const bad = cli(["build", manifest, "--format", "png", "--browser", join(TMP, "nope.exe"), "--json"]);
    const bd = jsonLine("build png 指定不存在浏览器 --json 单行", bad.stdout);
    step("png 缺浏览器 → ERR_RENDER_BACKEND + exit 1", bad.status === 1 && bd?.error?.code === "ERR_RENDER_BACKEND");
  }

  {
    const r = cli(["build", manifest, "--format", "nope", "--json"]);
    const doc = jsonLine("build 非法格式 --json 单行", r.stdout);
    step("非法 --format → ERR_INVALID_OPTION + exit 1", r.status === 1 && doc?.error?.code === "ERR_INVALID_OPTION");
    const r2 = cli(["build", manifest, "--fetch", "--offline", "--json"]);
    const d2 = jsonLine("build --fetch --offline --json 单行", r2.stdout);
    step("--fetch/--offline 互斥 → exit 1", r2.status === 1 && d2?.error?.code === "ERR_INVALID_OPTION");
    const r3 = cli(["build", join(TMP, "missing.pptd"), "--json"]);
    const d3 = jsonLine("build 缺失 manifest --json 单行", r3.stdout);
    step("缺失 manifest → ERR_NOT_FOUND + exit 1", r3.status === 1 && d3?.error?.code === "ERR_NOT_FOUND");
    const r4 = cli(["build", join(ROOT, "tests/projects/table/deck.pptd"), "--strict", "--format", "pptx", "-o", join(TMP, "strict.pptx"), "--json"]);
    step("build --strict 遇 warning exit 1", r4.status === 1, `exit=${r4.status} ${r4.stderr.slice(-80)}`);
  }

  console.log("\n=== 6. open 自动识别 / detach / stop / blank ===");
  {
    const empty = join(TMP, "empty");
    mkdirSync(empty, { recursive: true });
    const r = cli(["open", empty, "--json"]);
    const doc = jsonLine("open 空目录 --json 单行", r.stdout);
    step("空目录 fail-fast：ERR_NO_DECK + exit 1", r.status === 1 && doc?.error?.code === "ERR_NO_DECK", JSON.stringify(doc));

    const multi = join(TMP, "multi");
    mkdirSync(multi, { recursive: true });
    writeFileSync(join(multi, "a.pptd"), "version: v2\ntitle: a\npages: []\n");
    writeFileSync(join(multi, "b.pptd"), "version: v2\ntitle: b\npages: []\n");
    const r2 = cli(["open", multi, "--json"]);
    const d2 = jsonLine("open 多候选 --json 单行", r2.stdout);
    step("多 manifest fail-fast：ERR_MULTI_DECK + 候选", r2.status === 1 && d2?.error?.code === "ERR_MULTI_DECK" && d2.error.message.includes("a.pptd"));

    const r3 = cli(["open", project, "--detach", "--json"]);
    rememberInstances();
    const d3 = jsonLine("open --detach --json 单行", r3.stdout);
    step("open detach exit 0", r3.status === 0, `exit=${r3.status} ${r3.stderr.slice(-120)}`);
    step("open URL = /editor/?deck=project/deck.pptd", typeof d3?.url === "string" && d3.url.includes("/editor/?deck=project/deck.pptd"));
    step("open JSON 含 url/port/pid/project/deck", !!d3?.url && Number.isInteger(d3.port) && Number.isInteger(d3.pid) && typeof d3.project === "string");
    let alive = false;
    if (d3?.port) {
      const ping = await fetchPing(d3.port);
      alive = ping;
    }
    step("/api/ping 确认实例存活", alive);

    const stop = cli(["open", project, "--stop", "--json"]);
    const sd = jsonLine("open --stop --json 单行", stop.stdout);
    step("open --stop exit 0 + stopped 1", stop.status === 0 && sd?.ok === true && sd?.stopped?.length === 1, JSON.stringify(sd));
    step("stop 后实例表为空", readInstances().length === 0);

    const b = cli(["open", "--blank", "--detach", "--json"]);
    rememberInstances();
    const bd = jsonLine("open --blank --detach --json 单行", b.stdout);
    step("open --blank URL 含 ?blank=1", b.status === 0 && typeof bd?.url === "string" && bd.url.endsWith("?blank=1"));
    const bstop = cli(["open", "--stop", "--all", "--json"]);
    step("open --stop --all 清理 blank 实例", bstop.status === 0 && readInstances().length === 0);
  }
} catch (err) {
  fail++;
  console.error(`FAIL  surface 执行异常: ${err?.stack || err}`);
} finally {
  // Kill anything this suite may have left behind (never touch foreign pids).
  try {
    rememberInstances();
    for (const pid of livePids) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
  } catch {
    /* best-effort cleanup */
  }
  try {
    rmSync(HOME, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  try {
    rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

console.log(`\n结果: ${pass}/${pass + fail} 通过${fail === 0 ? " ✅" : " ❌"}`);
process.exit(fail ? 1 : 0);

function readInstances() {
  try {
    return JSON.parse(readFileSync(instancesFile, "utf8")).instances || [];
  } catch {
    return [];
  }
}

function fetchPing(port) {
  return new Promise((done) => {
    import("node:http").then(({ default: http }) => {
      const req = http.get({ host: "127.0.0.1", port, path: "/api/ping", timeout: 2000 }, (res) => {
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
  });
}
