// ============================================================================
// tests/regression/resource-paths.mjs — contract 5 resource resolution long-term guard
// ----------------------------------------------------------------------------
// Asserts:
//   1. OPEN_PPTD_HOME override works; resourceRoots order = home → package; registry has a single root (package)
//   2. Three-tier resolution order (home hit wins; fall back to package when home misses)
//   3. registry.json is never shadowed by home (a stale registry in home does not affect behavior)
//   4. ensureHome() is re-entrant; read-only commands do not create home
//   5. Atomic download: concurrent writes to one target leave no .part residue, content intact
//   6. Browser-side resource URL construction unchanged (source-level assertions on font-registry.js / icon-fa.js)
//   7. assets --from offline import (store + deflate); the registry never lands in assets/
//   8. serve --stop does not kill a stale/foreign pid
// Usage: node tests/regression/resource-paths.mjs (non-zero exit = contract broken)
// ============================================================================

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { deflateRawSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const HOME = mkdtempSync(join(tmpdir(), "pptd-home-"));
process.env.OPEN_PPTD_HOME = HOME;

const P = (rel) => join(ROOT, rel);
const importAt = (rel) => import(pathToFileURL(P(rel)).href);

const { paths, resourceRoots, ensureHome, resolveResourceFile, atomicWriteFile, openPptdHome, contractRoot, PACKAGE_ROOT } =
  await importAt("packages/paths.js");
const { resolveFile } = await importAt("packages/server/static.js");
const { createServer } = await importAt("packages/server/index.js");

let fail = 0;
const ok = (n) => console.log(`✓ ${n}`);
const bad = (n, d) => {
  fail++;
  console.error(`✗ ${n}${d ? " — " + d : ""}`);
};
const step = (n, cond, d) => (cond ? ok(n) : bad(n, d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cli = (args, env = {}) => spawnSync(process.execPath, [P("bin/open-pptd.js"), ...args], { cwd: ROOT, env: { ...process.env, OPEN_PPTD_HOME: HOME, ...env }, encoding: "utf8" });

try {
  // 1. Environment override + root order -------------------------------------
  console.log("=== 1. OPEN_PPTD_HOME 与根顺序 ===");
  step("openPptdHome() 取 OPEN_PPTD_HOME", openPptdHome() === HOME, `${openPptdHome()} ≠ ${HOME}`);
  step("paths.home 指向临时目录", paths.home === HOME);
  step("resourceRoots.fonts = [home, 包内]", resourceRoots.fonts[0] === paths.fonts && resourceRoots.fonts[1] === join(PACKAGE_ROOT, "assets", "fonts"));
  step("resourceRoots.icons = [home, 包内]", resourceRoots.icons[0] === paths.icons && resourceRoots.icons[1] === join(PACKAGE_ROOT, "assets", "icons"));
  step("resourceRoots.registry 仅一根（包根）", resourceRoots.registry.length === 1 && resourceRoots.registry[0] === PACKAGE_ROOT, JSON.stringify(resourceRoots.registry));
  step("contractRoot() === PACKAGE_ROOT", contractRoot() === PACKAGE_ROOT);
  {
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", `import("${pathToFileURL(P("packages/paths.js")).href}").then(m=>console.log(m.paths.home))`], {
      cwd: ROOT,
      env: { ...process.env, OPEN_PPTD_HOME: join(HOME, "child") },
      encoding: "utf8",
    });
    step("子进程 OPEN_PPTD_HOME 覆盖生效", r.stdout.trim() === join(HOME, "child"), r.stdout.trim());
  }

  // 2. Three-tier resolution order -------------------------------------------
  console.log("\n=== 2. 三级解析顺序 ===");
  mkdirSync(paths.fonts, { recursive: true });
  writeFileSync(join(paths.fonts, "HomeFont.ttf"), "HOME");
  step("home 命中优先", resolveResourceFile("fonts", "HomeFont.ttf") === join(paths.fonts, "HomeFont.ttf"));
  step("home 无 → 包内回退（registry）", resolveResourceFile("registry", "assets/fonts/registry.json") === join(PACKAGE_ROOT, "assets", "fonts", "registry.json"));
  step("两级皆无 → null", resolveResourceFile("fonts", "NoSuchFont-xyz.ttf") === null);
  {
    // Multi-root in order: two synthetic roots verify "first hit wins" rather than "last wins"
    const a = mkdtempSync(join(tmpdir(), "pptd-rA-"));
    const b = mkdtempSync(join(tmpdir(), "pptd-rB-"));
    writeFileSync(join(a, "both.ttf"), "A");
    writeFileSync(join(b, "both.ttf"), "B");
    writeFileSync(join(b, "onlyB.ttf"), "B");
    step("多根首选第一根", readFileSync(resolveFile([a, b], "both.ttf"), "utf8") === "A");
    step("多根回退后续根", readFileSync(resolveFile([a, b], "onlyB.ttf"), "utf8") === "B");
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }

  // 3. registry always read from package (home does not shadow) ---------------
  console.log("\n=== 3. registry 恒读包内（home 不遮蔽）===");
  mkdirSync(paths.fonts, { recursive: true });
  mkdirSync(paths.icons, { recursive: true });
  writeFileSync(join(paths.fonts, "registry.json"), '{"EXPIRED":true}');
  writeFileSync(join(paths.icons, "registry.json"), '{"EXPIRED":true}');
  const srv = createServer({});
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  const get = (p) =>
    new Promise((res) => {
      const req = http.get({ host: "127.0.0.1", port, path: p }, (r) => {
        let b = "";
        r.on("data", (c) => (b += c));
        r.on("end", () => res({ status: r.statusCode, body: b }));
      });
      req.on("error", () => res({ status: 0, body: "" }));
    });
  const fontReg = await get("/assets/fonts/registry.json");
  const iconReg = await get("/assets/icons/registry.json");
  step("home 过期 registry 不影响字体注册表", fontReg.status === 200 && fontReg.body.includes("fonts") && !fontReg.body.includes("EXPIRED"));
  step("home 过期 registry 不影响图标注册表", iconReg.status === 200 && iconReg.body.includes("faVersion") && !iconReg.body.includes("EXPIRED"));
  const homeFont = await get("/assets/fonts/HomeFont.ttf");
  step("字体字节 home 优先命中", homeFont.status === 200 && homeFont.body === "HOME");
  step("缺失资源 404", (await get("/assets/fonts/NoSuchFont-xyz.ttf")).status === 404);
  await new Promise((r) => srv.close(r));

  // 4. ensureHome re-entrant + read-only commands do not create home ----------
  console.log("\n=== 4. ensureHome 可重入 / 只读零迁移 ===");
  ensureHome();
  ensureHome();
  step("ensureHome() 幂等可重入", existsSync(paths.fonts) && existsSync(paths.icons) && existsSync(paths.state) && existsSync(paths.tmp));
  {
    const ghost = join(HOME, "ghost-home");
    const r = cli(["fonts", "list"], { OPEN_PPTD_HOME: ghost });
    step("~/.open-pptd 不存在时 fonts list 照常（只读回退）", r.status === 0, r.stderr.slice(0, 120));
    const r2 = cli(["icons", "list"], { OPEN_PPTD_HOME: ghost });
    step("~/.open-pptd 不存在时 icons list 照常", r2.status === 0, r2.stderr.slice(0, 120));
    step("只读命令不创建 home", !existsSync(ghost));
  }

  // 5. Atomic download: concurrent writes leave no .part residue ------------
  console.log("\n=== 5. 原子下载（并发无半截文件）===");
  {
    const dest = join(paths.fonts, "Concurrent.ttf");
    const child = `import("${pathToFileURL(P("packages/paths.js")).href}").then(m=>{const b=Buffer.alloc(4096,m.paths.home.length);Buffer.from([0,1,0,0]).copy(b,0);for(let i=0;i<40;i++)m.atomicWriteFile(${JSON.stringify(dest)},b);})`;
    const kids = Array.from({ length: 4 }, () =>
      new Promise((done) => {
        const c = spawn(process.execPath, ["--input-type=module", "-e", child], { cwd: ROOT, env: { ...process.env, OPEN_PPTD_HOME: HOME }, stdio: "ignore" });
        c.on("exit", () => done());
      })
    );
    await Promise.all(kids);
    step("并发写后目标完整", existsSync(dest) && statSync(dest).size === 4096, existsSync(dest) ? String(statSync(dest).size) : "missing");
    const parts = readdirSync(paths.tmp).filter((f) => f.endsWith(".part"));
    step("tmp/ 无 .part 残留", parts.length === 0, parts.join(","));
  }

  // 6. Browser branch unchanged (source-level assertions) --------------------
  console.log("\n=== 6. 浏览器分支零改动 ===");
  {
    const fr = readFileSync(P("packages/model/font-registry.js"), "utf8");
    const ifa = readFileSync(P("packages/model/icon-fa.js"), "utf8");
    const must = [
      [fr, 'const ROOT = new URL("../../", import.meta.url).href;', "font ROOT 站点根"],
      [fr, "export function fontFileUrl(file) {", "fontFileUrl 定义"],
      [fr, "return new URL(`assets/fonts/${encodeURIComponent(file)}`, ROOT).href;", "fontFileUrl 站点根相对 URL"],
      [fr, 'const FONT_CACHE_NAME = "open-pptd-fonts-v2";', "字体 Cache API 名"],
      [ifa, 'const ROOT = new URL("../../", import.meta.url).href;', "icon ROOT 站点根"],
      [ifa, "const localUrl = new URL(`assets/icons/${hit.dir}/${hit.name}.svg`, ROOT).href;", "图标本地 URL 站点根相对"],
      [ifa, "export function faCdnUrls(", "faCdnUrls 定义"],
    ];
    for (const [src, needle, label] of must) {
      step(`浏览器分支未改：${label}`, src.includes(needle));
    }
    step("双端包不含 node: 来源", !/from\s*["']node:/.test(fr) && !/from\s*["']node:/.test(ifa));
    // Behaviour assertion: fontFileUrl yields a repo-root-relative URL (browser semantics)
    const { fontFileUrl } = await importAt("packages/model/font-registry.js");
    const u = fontFileUrl("得意黑.ttf");
    step("fontFileUrl 产出 assets/fonts 相对 URL", u.endsWith("assets/fonts/%E5%BE%97%E6%84%8F%E9%BB%91.ttf"), u);
  }

  // 7. assets --from offline import (store + deflate) ------------------------
  console.log("\n=== 7. assets --from 离线导入 ===");
  {
    const zipBuf = (entries, deflate) => buildZip(entries, deflate);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
    const storeZip = join(HOME, "icons-store.zip");
    const defZip = join(HOME, "icons-deflate.zip");
    writeFileSync(storeZip, zipBuf([{ name: "solid/star.svg", data: svg }, { name: "registry.json", data: '{"EXPIRED":1}' }], false));
    writeFileSync(defZip, zipBuf([{ name: "regular/heart.svg", data: svg }], true));
    const r1 = cli(["assets", "sync", "icons", "--from", storeZip]);
    step("store zip 离线导入成功", r1.status === 0, r1.stderr.slice(0, 120));
    const r2 = cli(["assets", "sync", "icons", "--from", defZip]);
    step("deflate zip 离线导入成功", r2.status === 0, r2.stderr.slice(0, 120));
    step("SVG 落到 home/assets/icons", existsSync(join(paths.icons, "solid", "star.svg")) && existsSync(join(paths.icons, "regular", "heart.svg")));
    step("注册表永不进 assets/", !existsSync(join(paths.icons, "registry.json")) || readFileSync(join(paths.icons, "registry.json"), "utf8") === '{"EXPIRED":true}');
  }

  // 8. serve --stop does not kill the wrong process ----------------------------
  console.log("\n=== 8. serve --stop 陈旧/外来 pid ===");
  {
    // Foreign live process: write its pid to the state file → --stop must refuse and not kill it
    const foreign = spawn(process.execPath, ["-e", "setTimeout(()=>{},60000)"], { stdio: "ignore" });
    await sleep(400);
    mkdirSync(paths.state, { recursive: true });
    writeFileSync(join(paths.state, "serve.json"), JSON.stringify({ pid: foreign.pid, port: 1, url: "x" }));
    const r = cli(["serve", "--stop"]);
    step("外来 pid 被拒绝（非零退出）", r.status === 1, `exit=${r.status} ${r.stdout}${r.stderr}`);
    let alive = true;
    try { process.kill(foreign.pid, 0); } catch { alive = false; }
    step("外来进程未被误杀", alive);
    foreign.kill();
    // Stale dead pid → clean up without error
    writeFileSync(join(paths.state, "serve.json"), JSON.stringify({ pid: 999999, port: 1, url: "x" }));
    const r2 = cli(["serve", "--stop"]);
    step("陈旧死 pid 清理且退出 0", r2.status === 0 && !existsSync(join(paths.state, "serve.json")), `exit=${r2.status}`);
  }
} catch (err) {
  bad("resource-paths 执行异常", err?.stack || String(err));
} finally {
  try { rmSync(HOME, { recursive: true, force: true }); } catch { /* a failed cleanup does not change the verdict */ }
}

console.log(`\n结果: ${fail === 0 ? "resource-paths 全部通过 ✅" : `resource-paths 失败 ❌（${fail} 处）`}`);
process.exit(fail ? 1 : 0);

// ---------------------------------------------------------------------------
// Minimal ZIP builder (store / deflate), test-only
// ---------------------------------------------------------------------------
function buildZip(entries, deflate) {
  const crcTable = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let crc = 0xffffffff;
    for (const b of buf) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  const locals = [];
  const centrals = [];
  let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const data = Buffer.from(e.data);
    const comp = deflate ? deflateRawSync(data) : data;
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(deflate ? 8 : 0, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(deflate ? 8 : 0, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(off, 42);
    centrals.push(ch, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, eocd]);
}
