// ============================================================================
// gen-themes-manifest.js — 生成 themes/manifest.json（画廊展示用）
// ----------------------------------------------------------------------------
// GitHub Pages 无目录枚举能力，画廊需要静态主题清单。
// 扫描 themes/ 下每个项目：读 deck.pptd 提取标题/页数，叠加人工维护的
// 风格/色系/字体/场景元数据，输出 themes/manifest.json。
// 用法：node scripts/gen-themes-manifest.js
// ============================================================================

import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import * as yaml from "../editor/vendor/js-yaml.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const THEMES_DIR = join(ROOT, "themes");

// 画廊元数据从各主题 deck.pptd 的 gallery 字段读取（主题自我描述，单一事实来源）：
//   gallery:
//     name: 学术论文
//     style: academic 学术论文
//     color: blue 蓝色
//     font: 微软雅黑
//     scene: 论文汇报 / 学术答辩 / 组会
// 新增主题 = 建目录 + deck.pptd 写 gallery，脚本与画廊零改动。
const list = [];
for (const dir of readdirSync(THEMES_DIR)) {
  const dirPath = join(THEMES_DIR, dir);
  if (!statSync(dirPath).isDirectory()) continue; // 跳过 manifest.json 等文件
  const manifestPath = join(dirPath, "deck.pptd");
  let manifest = null;
  try {
    manifest = yaml.load(readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = null;
  }
  if (!manifest) {
    console.warn(`[gen] themes/${dir} deck.pptd 解析失败，跳过`);
    continue;
  }
  const meta = manifest.gallery || {};
  if (!meta.name) {
    console.warn(`[gen] themes/${dir} deck.pptd 缺少 gallery.name，跳过`);
    continue;
  }
  list.push({
    key: dir,
    name: meta.name,
    deck: `themes/${dir}/deck.pptd`,
    title: manifest.title || meta.name,
    style: meta.style || "",
    color: meta.color || "",
    font: meta.font || "",
    scene: meta.scene || "",
    pages: Array.isArray(manifest.pages) ? manifest.pages.length : 0,
  });
}

list.sort((a, b) => a.key.localeCompare(b.key));
writeFileSync(join(THEMES_DIR, "manifest.json"), JSON.stringify(list, null, 2) + "\n");
console.log(`✓ 已生成 themes/manifest.json（${list.length} 个主题）`);
