// ============================================================================
// tests/tools/golden-run.mjs — 黄金基线共享运行器（项目发现 / 渲染 / 指纹）
// ----------------------------------------------------------------------------
// 被 golden-render.mjs（写基线）与 golden-diff.mjs（比对）共用，避免两套实现漂移。
//   discoverProjects()            发现 examples/* 与 tests/projects/*（含 deck.pptd）
//   renderProject(entry, pngDir)  用现役旧管线（renderDeck + headless CDP）逐页出 PNG
//   deckSourceHash(entry)         项目源文件（deck + pages，排除 out/）整体 sha256
//   pageFingerprint(pngPath)      → { dHash, aHash, w, h, bytes, sha256 }
// 只 import 不修改 renderer/headless（禁触边界：允许调用，禁止改其文件）。
// ============================================================================

import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { renderDeck } from "../../packages/renderer/headless/shoot.js";
import { findBrowser } from "../../packages/renderer/headless/browser.js";
import { startServer } from "../../packages/server/index.js";
import { imageFingerprint, sha256 } from "./golden-lib.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
export { ROOT };

const SOURCES = ["examples", "tests/projects"];

/** 项目目录名 → PNG 输出目录名（/ 换 __，保证文件系统安全）。 */
export const pngDirName = (key) => key.replace(/[\\/]+/g, "__");

/** 发现全部含 deck.pptd 的基线项目（examples 15 + tests/projects 9 = 24）。 */
export function discoverProjects() {
  const out = [];
  for (const src of SOURCES) {
    const dir = join(ROOT, src);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      const projDir = join(dir, name);
      if (!statSync(projDir).isDirectory()) continue;
      const deck = join(projDir, "deck.pptd");
      if (!existsSync(deck)) continue;
      out.push({
        key: `${src}/${name}`,
        name,
        dir: projDir,
        deck,
        relDeck: `${src}/${name}/deck.pptd`,
        pngDir: pngDirName(`${src}/${name}`),
      });
    }
  }
  return out;
}

/** 项目源文件整体哈希（deck + pages + 媒体，排除 out/ 与导出产物）。 */
export function deckSourceHash(entry) {
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name === "out" || e.name === "node_modules") continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(pptd|page|json|png|jpe?g|gif|webp|svg|md|txt|ya?ml)$/i.test(e.name)) files.push(p);
    }
  };
  walk(entry.dir);
  const h = [];
  for (const p of files.sort()) {
    h.push(`${relative(entry.dir, p).split(sep).join("/")}:${sha256(readFileSync(p))}`);
  }
  return sha256(Buffer.from(h.join("\n"), "utf8"));
}

/**
 * 渲染单个项目全部页面到 pngDir（现役旧管线：renderDeck + headless CDP）。
 * @returns {Promise<{files: string[], count: number}>}
 */
export async function renderProject(entry, pngDir) {
  return renderDeck({
    manifest: entry.deck,
    outPath: pngDir,
    scale: 1,
    timeoutMs: 180000, // font-embed（27 字体，含 CDN 回退）等重项目需要更长就绪等待
    quiet: true,
    startServer,
  });
}

/** 页面 PNG → 指纹。 */
export function pageFingerprint(pngPath) {
  return imageFingerprint(readFileSync(pngPath));
}

/** 浏览器探测（基线必需）；不可用返回 null 并打印原因。 */
export function probeBrowser() {
  try {
    return findBrowser();
  } catch (e) {
    console.error(`✗ 需要本机 Chrome/Edge（SMOKE_CHROME 可指定路径）: ${e.message}`);
    return null;
  }
}
