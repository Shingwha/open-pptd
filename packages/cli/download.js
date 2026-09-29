// ============================================================================
// cli/download.js — 逐文件下载器（字体 / 图标），原子落盘到 home
// ----------------------------------------------------------------------------
// 契约 5 的并发原子性：
//   · 写盘目标改 home（写一级）：`~/.open-pptd/assets/{fonts,icons}`
//   · 先落 `tmp/<random>.part` → 同盘 `rename()` 原子落地（cli/../paths.atomicWriteFile）
//   · 字体保留既有校验：magic 前 4 字节 + size 与注册表比对；图标保留 SVG 结构校验
//   · 并发 6、两段式超时（连接 10s / body 60s[字体] · 30s[图标]）保留
//
// 本模块是 `assets sync` 的**回退路径**（release zip 缺失时）；也是
// `fonts download` / `icons download` 兼容别名的实现。
// ============================================================================

import { existsSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { paths, ensureHome, atomicWriteFile, resolveResourceFile } from "../paths.js";
import { ICON_STYLES } from "./resource-status.js";

// ---------------------------------------------------------------------------
// 字体
// ---------------------------------------------------------------------------
const FONT_CONNECT_TIMEOUT_MS = 10000;
const FONT_BODY_TIMEOUT_MS = 60000;
const FONT_DOWNLOAD_CONCURRENCY = 6;

function isFontMagic(buf) {
  return buf.length >= 4 && (buf.subarray(0, 4).toString("latin1") === "OTTO" || buf.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0])));
}

/**
 * 下载注册表字体到 home（按 key/family/子串匹配目标）。
 * @param {object} reg 字体注册表
 * @param {string} name "all" 或字体 key/family/子串
 * @returns {Promise<{ok:number,total:number,notFound:boolean}>}
 */
export async function downloadFonts(reg, name = "all") {
  const sysHit = (reg.systemFonts || []).filter(
    (f) => f.key === name || f.family === name || f.key.includes(name) || f.family.toLowerCase().includes(name.toLowerCase())
  );
  if (sysHit.length) {
    console.log(`○ ${sysHit.map((f) => `${f.key}（${f.family}）`).join("、")} 是系统字体：仅声明不嵌入，无需下载。`);
    return { ok: 0, total: 0, notFound: false };
  }
  const targets =
    name === "all"
      ? reg.fonts
      : reg.fonts.filter((f) => f.key === name || f.family === name || f.key.includes(name) || f.family.toLowerCase().includes(name.toLowerCase()));
  if (!targets.length) return { ok: 0, total: 0, notFound: true };

  ensureHome();
  let idx = 0;
  let ok = 0;
  const unhealthy = new Set();
  let hintShown = false;

  const downloadOne = async (f) => {
    const out = join(paths.fonts, f.file);
    // 已就绪（home 或包内命中，且 size 一致）→ 跳过；尺寸不符 = 上游字节更换，重下
    const existing = resolveResourceFile("fonts", f.file);
    if (existing) {
      const magic = readFileSync(existing).subarray(0, 4);
      const validMagic = magic.toString("latin1") === "OTTO" || magic.equals(Buffer.from([0, 1, 0, 0]));
      const stale = typeof f.size === "number" && statSync(existing).size !== f.size;
      if (validMagic && !stale) {
        console.log(`  = ${f.key} 已存在（${f.file}），跳过`);
        return true;
      }
      if (validMagic && stale) console.log(`  ↻ ${f.key} 本地文件与注册表尺寸不符，重新下载`);
    }
    // 回退链：主源 url（GitHub raw）→ mirrors 镜像（jsDelivr 等），逐个尝试直到成功
    const sources = [f.url, ...(f.mirrors || [])].filter(Boolean);
    for (const src of sources) {
      if (unhealthy.has(src)) continue;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), FONT_CONNECT_TIMEOUT_MS);
        let res;
        try {
          res = await fetch(src, { signal: ctrl.signal });
        } finally {
          clearTimeout(timer);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let bodyTimer;
        const buf = Buffer.from(
          await Promise.race([
            res.arrayBuffer(),
            new Promise((_, reject) => {
              bodyTimer = setTimeout(() => reject(new Error("读取超时")), FONT_BODY_TIMEOUT_MS);
            }),
          ]).finally(() => clearTimeout(bodyTimer))
        );
        if (buf.length < 1000 || !isFontMagic(buf)) throw new Error("响应不是有效字体文件");
        atomicWriteFile(out, buf); // tmp/*.part → rename（并发安全）
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

  const worker = async () => {
    while (idx < targets.length) {
      const f = targets[idx++];
      if (await downloadOne(f)) ok += 1;
    }
  };
  const poolSize = Math.min(FONT_DOWNLOAD_CONCURRENCY, targets.length);
  await Promise.all(Array.from({ length: poolSize }, () => worker()));
  return { ok, total: targets.length, notFound: false };
}

// ---------------------------------------------------------------------------
// 图标
// ---------------------------------------------------------------------------
async function fetchWithTimeout(url, bodyMs) {
  const ctl = new AbortController();
  const connectTimer = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    clearTimeout(connectTimer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await Promise.race([
      res.arrayBuffer(),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`body timeout ${bodyMs / 1000}s`)), bodyMs)),
    ]);
  } catch (err) {
    clearTimeout(connectTimer);
    throw err;
  }
}

/**
 * 全量下载三风格 SVG 到 home/assets/icons（已有跳过，--force 重下）。
 * @param {object} registry 图标注册表
 * @param {{force?:boolean}} [opts]
 * @returns {Promise<boolean>} 全部成功
 */
export async function downloadIcons(registry, { force = false } = {}) {
  ensureHome();
  const fa = registry.faVersion;
  const tasks = [];
  for (const icon of registry.icons) {
    for (const prefix of icon.styles) {
      const file = join(paths.icons, ICON_STYLES[prefix], `${icon.name}.svg`);
      if (!force && existsSync(file)) continue;
      tasks.push({ prefix, name: icon.name, file });
    }
  }
  console.log(`Font Awesome Free ${fa} — 待下载 ${tasks.length} 个 SVG → ${paths.icons}（已存在${force ? "强制重下" : "跳过"}）`);

  let done = 0;
  let fail = 0;
  const unhealthy = new Set();
  const cdn = (t) => [
    `https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@${fa}/svgs/${ICON_STYLES[t.prefix]}/${t.name}.svg`,
    `https://unpkg.com/@fortawesome/fontawesome-free@${fa}/svgs/${ICON_STYLES[t.prefix]}/${t.name}.svg`,
  ];

  async function worker(queue) {
    for (;;) {
      const task = queue.shift();
      if (!task) return;
      const sources = cdn(task).filter((u) => !unhealthy.has(u.split("/npm/")[0]));
      let ok = false;
      let lastErr = "";
      for (const url of sources) {
        try {
          const buf = await fetchWithTimeout(url, 30_000);
          const text = Buffer.from(buf).toString("utf8");
          if (!text.startsWith("<svg") || !text.includes("</svg>") || text.length < 60) throw new Error("内容非法（非 SVG）");
          atomicWriteFile(task.file, text); // tmp/*.part → rename（并发安全）
          ok = true;
          break;
        } catch (err) {
          lastErr = err.message;
          if (/abort|timeout|fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|UND_ERR|network/i.test(err.message)) {
            unhealthy.add(url.split("/npm/")[0]);
            console.log(`  ⚠ 源不可达，后续跳过：${url.split("/npm/")[0]}`);
          }
        }
      }
      done += 1;
      if (!ok) {
        fail += 1;
        console.error(`  ✗ ${task.prefix}:${task.name} ${lastErr}`);
      }
      if (done % 200 === 0) console.log(`  … ${done}/${tasks.length}`);
    }
  }

  const queue = [...tasks];
  await Promise.all(Array.from({ length: 6 }, () => worker(queue)));
  console.log(`完成：${tasks.length - fail} 成功${fail ? `，${fail} 失败（重跑 icons download 续传）` : ""} → ${paths.icons}`);
  return fail === 0;
}
