#!/usr/bin/env node
// ============================================================================
// bin/open-pptd.js — CLI
//   serve [--port <port>] [--project <dir>]        启动本地网页编辑器
//   export <deck.pptd> [-o out.pptx] [--theme <key>]  命令行导出 PPTX（<key> = 配色预设：
//                         consult/tech/orange/green/red/purple/mono/brown/morandi/sakura）
//                        [--no-embed-fonts]         不嵌入字体（默认嵌入）
// ============================================================================

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, basename, dirname } from "path";
import { fileURLToPath } from "url";
import { startServer } from "../lib/editor-server.js";
import { exportDeck, exportProject, FONT_LIB_DIR } from "../lib/pptd-export.js";
import { renderDeck } from "../lib/pptd-render.js";
import { buildManifest } from "../lib/gallery.js";
import * as yaml from "../editor/vendor/js-yaml.mjs";
import { parseFontResources } from "../editor/core/theme.js";
import { findFont, findSystemFont } from "../editor/core/font-registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = join(__dirname, "..", "examples");

function usage() {
  console.log(
    "open-pptd CLI\n\n" +
      "用法:\n" +
      "  open-pptd serve [--port <port>] [--project <目录>]  启动本地网页编辑器\n" +
      "      --project: 挂载任意项目目录到浏览器（?deck=project/deck.pptd），端口占用自动顺延\n" +
      "  open-pptd export <deck.pptd> [-o <out.pptx>]  命令行导出 PPTX\n" +
      "                           [--no-embed-fonts]   不嵌入字体（默认嵌入）\n" +
      "  open-pptd export-project <deck.pptd> [-o <out.zip>]  导出项目包（pptd+pages+media，原样打包）\n" +
      "  open-pptd render <deck.pptd> [-o <目录>] [--page <n|all>] [--scale <1|2|3>]\n" +
      "                           [--browser <路径>] [--timeout <毫秒>]\n" +
      "                        逐页渲染为 PNG（无头浏览器，与编辑器预览同管线）\n" +
      "  open-pptd gallery scan                      扫描 examples/ 生成静态画廊索引\n" +
      "                        （examples/manifest.json，仅提交给 GitHub Pages 用；本地 serve 自动扫描）\n" +
      "  open-pptd gallery list                      列出画廊条目\n" +
      "\n" +
      "  字体库（assets/fonts/，全部免费商用，默认子集化嵌入）：\n" +
      "  open-pptd fonts list                         查看内置字体库（状态 ✓/✗）\n" +
      "  open-pptd fonts download <名称|all>          按需/全量下载字体文件到字体库\n" +
      "  open-pptd fonts check <deck.pptd>            体检 deck 字体声明（嵌入/仅声明/缺失）\n"
  );
}

// ----------------------------------------------------------------------------
// fonts 子命令：内置字体库管理（assets/fonts/，全部免费商用、全部支持子集化嵌入）
// ----------------------------------------------------------------------------

function loadRegistry() {
  const p = join(FONT_LIB_DIR, "registry.json");
  return JSON.parse(readFileSync(p, "utf8"));
}

function fontStatus(f) {
  return existsSync(join(FONT_LIB_DIR, f.file)) ? "✓" : "✗";
}

const CAT_LABEL = { sans: "黑体", serif: "宋/衬线", handwriting: "手写/书法", display: "标题/艺术", pixel: "像素" };

async function fontsList() {
  const reg = loadRegistry();
  const byCat = {};
  for (const f of reg.fonts) (byCat[f.category] ||= []).push(f);
  console.log(`内置字体库 ${reg.fonts.length} 种（全部免费商用，默认子集化嵌入）\n`);
  for (const [cat, list] of Object.entries(byCat)) {
    console.log(`【${CAT_LABEL[cat] || cat}】`);
    for (const f of list) {
      console.log(`  ${fontStatus(f)} ${f.key.padEnd(14)} ${f.family.padEnd(28)} ${(f.size / 1024 / 1024).toFixed(1)}MB  ${f.license}`);
    }
    console.log();
  }
  if (reg.systemFonts?.length) {
    console.log(`系统字体 ${reg.systemFonts.length} 种（仅声明不嵌入，依赖打开方系统已装）\n`);
    for (const f of reg.systemFonts) {
      console.log(`  ○ ${f.key.padEnd(12)} ${f.family.padEnd(24)} ${f.platform.padEnd(18)} ${f.style}`);
    }
    console.log();
  }
  console.log("用法：deck.fonts 资源项写 {family: <注册名>} 即自动嵌入；fonts download <名称|all> 可补下载。");
}

// 下载超时策略（两段式）：
//  - 连接阶段短超时（headers 到达前）：国内直连 GitHub 黑洞时快速放弃、回退镜像；
//  - body 读取阶段长超时：大字体在慢速网络下需要更久，避免误杀正常下载。
const FONT_CONNECT_TIMEOUT_MS = 10000;
const FONT_BODY_TIMEOUT_MS = 60000;
// 并发下载数：源降级后所有字体直达镜像，下载阶段并行吃带宽
const FONT_DOWNLOAD_CONCURRENCY = 6;

async function fontsDownload(name) {
  const reg = loadRegistry();
  // 系统字体无需下载：单独提示，不参与下载流程
  const sysHit = (reg.systemFonts || []).filter(
    (f) => f.key === name || f.family === name || f.key.includes(name) || f.family.toLowerCase().includes(name.toLowerCase())
  );
  if (sysHit.length) {
    console.log(`○ ${sysHit.map((f) => `${f.key}（${f.family}）`).join("、")} 是系统字体：仅声明不嵌入，无需下载。`);
    return;
  }
  const targets =
    name === "all" ? reg.fonts : reg.fonts.filter((f) => f.key === name || f.family === name || f.key.includes(name) || f.family.toLowerCase().includes(name.toLowerCase()));
  if (!targets.length) {
    console.error(`✗ 未找到匹配“${name}”的字体（用 fonts list 查看全表）`);
    process.exit(1);
  }
  let idx = 0;
  let ok = 0;
  // 源健康降级：网络类错误（fetch 拒绝/超时）判定该源当前不可达，后续字体直接跳过；
  // HTTP 状态码错误（404/403 等）是单字体问题，不降级。
  const unhealthy = new Set();
  let hintShown = false;

  const downloadOne = async (f) => {
    const out = join(FONT_LIB_DIR, f.file);
    if (existsSync(out)) {
      const magic = readFileSync(out).subarray(0, 4);
      if (magic.toString("latin1") === "OTTO" || magic.equals(Buffer.from([0, 1, 0, 0]))) {
        console.log(`  = ${f.key} 已存在（${f.file}），跳过`);
        return true;
      }
    }
    // 回退链：主源 url（GitHub raw）→ mirrors 镜像（jsDelivr 等），逐个尝试直到成功
    const sources = [f.url, ...(f.mirrors || [])].filter(Boolean);
    for (const src of sources) {
      if (unhealthy.has(src)) continue; // 已降级源直接跳过
      try {
        // 连接阶段：短超时，超时即放弃该源
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), FONT_CONNECT_TIMEOUT_MS);
        let res;
        try {
          res = await fetch(src, { signal: ctrl.signal });
        } finally {
          clearTimeout(timer);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // body 读取阶段：长超时（超时后放弃该源，但连接已建立，下个源重新下载）
        let bodyTimer;
        const buf = Buffer.from(
          await Promise.race([
            res.arrayBuffer(),
            new Promise((_, reject) => {
              bodyTimer = setTimeout(() => reject(new Error("读取超时")), FONT_BODY_TIMEOUT_MS);
            }),
          ]).finally(() => clearTimeout(bodyTimer))
        );
        if (buf.length < 1000 || !(buf.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0])) || buf.subarray(0, 4).toString("latin1") === "OTTO")) {
          throw new Error("响应不是有效字体文件");
        }
        writeFileSync(out, buf);
        console.log(`  ✓ ${f.key} ← ${src} ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
        return true;
      } catch (e) {
        const detail = `${e.message}${e.cause?.message ? "：" + e.cause.message : ""}`;
        const networkErr = e.name === "AbortError" || /fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|UND_ERR|network/i.test(detail);
        if (networkErr) {
          unhealthy.add(src);
          if (!hintShown) {
            hintShown = true;
            console.log(`  ! ${new URL(src).host} 网络不可达，后续字体直接使用镜像源`);
          }
        }
        console.log(`  ✗ ${f.key} ← ${src} ${detail}`);
      }
    }
    console.log(`  ✗ ${f.key}：所有下载源均失败`);
    return false;
  };

  // 并发池：最多同时下载 N 个字体，完成一个补一个
  const worker = async () => {
    while (idx < targets.length) {
      const f = targets[idx++];
      if (await downloadOne(f)) ok += 1;
    }
  };
  const poolSize = Math.min(FONT_DOWNLOAD_CONCURRENCY, targets.length);
  await Promise.all(Array.from({ length: poolSize }, () => worker()));
  console.log(`\n完成：${ok}/${targets.length}`);
}

async function fontsCheck(manifest) {
  if (!existsSync(manifest)) {
    console.error(`✗ 文件不存在: ${manifest}`);
    process.exit(1);
  }
  const deck = yaml.load(readFileSync(manifest, "utf8"));
  const reg = loadRegistry();
  const resources = parseFontResources(deck?.fonts);
  const entries = Object.entries(resources);
  if (!entries.length) {
    console.log("deck 未声明字体资源（deck.fonts 为空），不会嵌入任何字体。");
    return;
  }
  console.log(`检查 ${manifest} 的字体声明（${entries.length} 项）:\n`);
  for (const [key, res] of entries) {
    const family = res.family || res.name || key;
    const hit = findFont(reg, family);
    if (hit) {
      const fileOk = fontStatus(hit) === "✓";
      console.log(`  ${fileOk ? "✓" : "✗"} ${key.padEnd(12)} → 注册表命中: ${hit.family}（${hit.file}${fileOk ? "" : " 缺失,需 fonts download"}）→ 将嵌入${hit.subset ? "(子集化)" : ""}`);
    } else {
      const sys = findSystemFont(reg, family);
      if (sys) {
        console.log(`  ○ ${key.padEnd(12)} → 系统字体: ${sys.family}（${sys.platform}；仅声明不嵌入，需打开方系统已装）`);
      } else {
        console.log(`  ○ ${key.padEnd(12)} → 未命中注册表: ${family}（仅声明，不嵌入；需系统已装该字体）`);
      }
    }
  }
  console.log("\n提示：注册表引用写法 fonts: {title: {family: <注册名>}}；未命中注册表的 family 视为系统字体。");
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || command === "--help" || command === "-h") {
    usage();
    return;
  }
  if (command === "fonts") {
    const sub = args[1] || "list";
    if (sub === "list") {
      await fontsList();
    } else if (sub === "download") {
      await fontsDownload(args[2] || "all");
    } else if (sub === "check") {
      await fontsCheck(args[2]);
    } else {
      usage();
      process.exit(1);
    }
    return;
  }
  if (command === "gallery") {
    const sub = args[1] || "list";
    if (sub === "scan") {
      const manifest = buildManifest(EXAMPLES_DIR);
      const out = join(EXAMPLES_DIR, "manifest.json");
      writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n", "utf8");
      console.log(`✓ 已生成 ${out}（${manifest.entries.length} 套）`);
      for (const e of manifest.entries) {
        console.log(`  · ${e.id}  ${e.title}（${e.pages} 页${e.tags.length ? " · " + e.tags.join("/") : ""}）`);
      }
    } else if (sub === "list") {
      const manifest = buildManifest(EXAMPLES_DIR);
      if (!manifest.entries.length) {
        console.log("examples/ 下暂无画廊项目（放入 deck.pptd+pages/+media/ 文件夹即可）");
        return;
      }
      for (const e of manifest.entries) {
        console.log(`· ${e.id}  ${e.title}（${e.pages} 页）  ${e.deck}`);
      }
    } else {
      usage();
      process.exit(1);
    }
    return;
  }
  if (command === "serve") {
    const portIdx = args.indexOf("--port");
    const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 55173;
    const projIdx = args.indexOf("--project");
    const projectRoot = projIdx >= 0 ? args[projIdx + 1] : null;
    try {
      if (projectRoot) {
        if (!existsSync(projectRoot)) {
          console.error(`✗ 项目目录不存在: ${projectRoot}`);
          process.exit(1);
        }
        if (!existsSync(join(projectRoot, "deck.pptd"))) {
          console.warn(`⚠ ${projectRoot} 下未找到 deck.pptd（期望项目 manifest 名）`);
        }
      }
      await startServer({ port, projectRoot, deckUrl: projectRoot ? "project/deck.pptd" : null });
    } catch (err) {
      if (err?.code === "EADDRINUSE") {
        console.error(`端口 ${port}~${port + 9} 均被占用，可用 --port 指定其他端口`);
        process.exit(1);
      }
      throw err;
    }
    return;
  }
  if (command === "export-project") {
    const manifest = args[1];
    if (!manifest) {
      usage();
      process.exit(1);
    }
    const outIdx = args.indexOf("-o") >= 0 ? args.indexOf("-o") : args.indexOf("--out");
    const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
    try {
      const { outPath: finalPath } = await exportProject({ manifest, outPath });
      console.log(`✓ 项目包已导出 → ${finalPath}`);
    } catch (err) {
      console.error(`✗ 导出失败: ${err.message}`);
      process.exit(1);
    }
    return;
  }
  if (command === "render") {
    const major = Number(process.versions.node.split(".")[0]);
    if (major < 18) {
      console.error("✗ render 需要 Node 18+（当前 " + process.version + "）");
      process.exit(1);
    }
    if (major < 21) {
      console.warn("⚠ 当前 Node " + process.version + " < 21：render 将使用内置最小 WebSocket 客户端（推荐 Node 21+）");
    }
    const manifest = args[1];
    if (!manifest) {
      usage();
      process.exit(1);
    }
    const outIdx = args.indexOf("-o") >= 0 ? args.indexOf("-o") : args.indexOf("--out");
    const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
    const pageIdx = args.indexOf("--page");
    const page = pageIdx >= 0 ? args[pageIdx + 1] : "all";
    const scaleIdx = args.indexOf("--scale");
    const scale = scaleIdx >= 0 ? args[scaleIdx + 1] : 1;
    const browserIdx = args.indexOf("--browser");
    const browserPath = browserIdx >= 0 ? args[browserIdx + 1] : null;
    const timeoutIdx = args.indexOf("--timeout");
    const timeoutMs = timeoutIdx >= 0 ? Number(args[timeoutIdx + 1]) : 30000;
    try {
      const { files } = await renderDeck({ manifest, outPath, page, scale, browserPath, timeoutMs });
      console.log(`✓ 渲染完成，共 ${files.length} 张图片`);
    } catch (err) {
      console.error(`✗ 渲染失败: ${err.message}`);
      process.exit(1);
    }
    return;
  }
  if (command === "export") {
    const manifest = args[1];
    if (!manifest) {
      usage();
      process.exit(1);
    }
    const outIdx = args.indexOf("-o") >= 0 ? args.indexOf("-o") : args.indexOf("--out");
    const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
    const themeIdx = args.indexOf("--theme");
    const theme = themeIdx >= 0 ? args[themeIdx + 1] : null;
    const embedFonts = !args.includes("--no-embed-fonts");
    try {
      const { outPath: finalPath } = await exportDeck({ manifest, outPath, theme, embedFonts });
      console.log(`✓ 已导出 → ${finalPath}`);
    } catch (err) {
      console.error(`✗ 导出失败: ${err.message}`);
      process.exit(1);
    }
    return;
  }
  usage();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
