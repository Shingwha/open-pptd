// ============================================================================
// cli/fonts.js — fonts 子命令：内置字体库管理
// ----------------------------------------------------------------------------
// 字体库落点 assets/fonts/（全部免费商用、全部支持子集化嵌入）。
//   fonts list              查看内置字体库（状态 ✓/✗）
//   fonts download <名称|all>  按需/全量下载字体文件到字体库
//   fonts check <deck.pptd> 体检 deck 字体声明（嵌入/仅声明/缺失）
// ============================================================================

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as yaml from "../model/vendor/js-yaml.mjs";
import { parseFontResources } from "../model/font.js";
import { findFont, findSystemFont } from "../model/font-registry.js";
import { FONT_LIB_DIR } from "./export.js";

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

/** fonts 子命令入口。 */
export async function runFonts(args) {
  const sub = args[0] || "list";
  if (sub === "list") {
    await fontsList();
  } else if (sub === "download") {
    await fontsDownload(args[1] || "all");
  } else if (sub === "check") {
    await fontsCheck(args[1]);
  } else {
    return false; // 未知子命令，调用方打 usage
  }
  return true;
}
