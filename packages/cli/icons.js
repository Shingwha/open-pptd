// ============================================================================
// cli/icons.js — Font Awesome 图标库下载与状态（镜像 fonts.js 骨架）
// ----------------------------------------------------------------------------
//   icons list                 按风格统计（registry 总数 vs 本地已有）
//   icons download [--force]   全量下载三风格 SVG 到 assets/icons/<style>/
//                              （约 2100+ 个文件；已有文件跳过，--force 重下）
// SVG 本体不入库不入包；未下载时浏览器/CLI 导出走 CDN 兜底（icon-fa.js 回源链）。
// ============================================================================

import { createWriteStream, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { readFileSync } from "node:fs";
import { STYLE_DIRS, loadIconRegistry } from "../model/icon-fa.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICON_LIB_DIR = join(__dirname, "..", "..", "assets", "icons");

/** 两段式超时：连接 10s / body 30s。 */
async function fetchWithTimeout(url) {
  const ctl = new AbortController();
  const connectTimer = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    clearTimeout(connectTimer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await Promise.race([
      res.arrayBuffer(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("body timeout 30s")), 30_000)),
    ]);
  } catch (err) {
    clearTimeout(connectTimer);
    throw err;
  }
}

async function runList() {
  const registry = await loadIconRegistry({ iconDir: ICON_LIB_DIR, fs: { readFileSync } });
  console.log(`Font Awesome Free ${registry.faVersion} 图标库（assets/icons/）\n`);
  let localTotal = 0;
  for (const [prefix, dir] of Object.entries(STYLE_DIRS)) {
    const total = registry.icons.filter((i) => i.styles.includes(prefix)).length;
    const local = existsSync(join(ICON_LIB_DIR, dir))
      ? readdirSync(join(ICON_LIB_DIR, dir)).filter((f) => f.endsWith(".svg")).length
      : 0;
    localTotal += local;
    console.log(`  ${local === total ? "✓" : local > 0 ? "◐" : "✗"} ${prefix.padEnd(4)} ${String(local).padStart(5)} / ${total}  (${dir}/)`);
  }
  console.log(`\n  共 ${localTotal} / ${Object.values(registry.counts).reduce((a, b) => a + b, 0)} 个 SVG`);
  if (localTotal === 0) {
    console.log("  本地图标库为空：浏览器预览/导出将走 CDN 兜底（在线可用）；");
    console.log("  离线使用前执行 node bin/open-pptd.js icons download");
  }
  return true;
}

async function runDownload(args) {
  const force = args.includes("--force");
  const registry = await loadIconRegistry({ iconDir: ICON_LIB_DIR, fs: { readFileSync } });
  const fa = registry.faVersion;

  // 任务清单：(prefix, name)；按 (style, name) 计数
  const tasks = [];
  for (const icon of registry.icons) {
    for (const prefix of icon.styles) {
      const file = join(ICON_LIB_DIR, STYLE_DIRS[prefix], `${icon.name}.svg`);
      if (!force && existsSync(file)) continue;
      tasks.push({ prefix, name: icon.name, file });
    }
  }
  console.log(`Font Awesome Free ${fa} — 待下载 ${tasks.length} 个 SVG → assets/icons/（已存在${force ? "强制重下" : "跳过"}）`);

  let done = 0, fail = 0;
  const unhealthy = new Set();
  const cdn = (t) => [
    `https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@${fa}/svgs/${STYLE_DIRS[t.prefix]}/${t.name}.svg`,
    `https://unpkg.com/@fortawesome/fontawesome-free@${fa}/svgs/${STYLE_DIRS[t.prefix]}/${t.name}.svg`,
  ];

  async function worker(queue) {
    for (;;) {
      const task = queue.shift();
      if (!task) return;
      const sources = cdn(task).filter((u) => !unhealthy.has(u.split("/npm/")[0]));
      let ok = false, lastErr = "";
      for (const url of sources) {
        try {
          const buf = await fetchWithTimeout(url);
          const text = Buffer.from(buf).toString("utf8");
          if (!text.startsWith("<svg") || !text.includes("</svg>") || text.length < 60) {
            throw new Error("内容非法（非 SVG）");
          }
          mkdirSync(dirname(task.file), { recursive: true });
          await pipeline(Readable.from(text), createWriteStream(task.file));
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
  console.log(`完成：${tasks.length - fail} 成功${fail ? `，${fail} 失败（重跑 icons download 续传）` : ""} → assets/icons/`);
  return fail === 0;
}

export async function runIcons(args) {
  const cmd = args[0];
  if (cmd === "list") return runList();
  if (cmd === "download") return runDownload(args.slice(1));
  return false;
}
