// ============================================================================
// tests/split-shape.mjs — 把 iso-09（形状页）的每个形状拆成独立 PPTX
// ----------------------------------------------------------------------------
// 定位具体哪个形状导致 PowerPoint 弹修复。
// 用法：node tests/split-shape.mjs
// ============================================================================

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import yaml from "../editor/vendor/js-yaml.mjs";
import { normalizeTheme } from "../editor/core/theme.js";
import { buildPptx } from "../editor/writer/pptx.js";
import { createDeck } from "../editor/core/model.js";

const projectDir = resolve("tests/projects/isolation");
const outDir = resolve("tests/out");
mkdirSync(outDir, { recursive: true });

const deck = yaml.load(readFileSync(join(projectDir, "deck.pptd"), "utf8"));
const page = yaml.load(readFileSync(join(projectDir, "pages/09-shape.page"), "utf8"));

// 标题 + 单个形状
const title = page.elements[0];
const shapes = page.elements.slice(1);
const cases = [
  ["09a-roundRect", shapes[0]],
  ["09b-ellipse-border", shapes[1]],
  ["09c-star5", shapes[2]],
  ["09d-rect-gradient-shadow", shapes[3]],
  ["09e-all", shapes],
];

for (const [name, els] of cases) {
  const single = createDeck({
    title: name,
    size: deck.size,
    theme: deck.theme,
    pages: [{ pageType: "content", background: page.background, elements: [title, ...(Array.isArray(els) ? els : [els])] }],
  });
  const bytes = await buildPptx(single, {});
  writeFileSync(join(outDir, `iso-${name}.pptx`), bytes);
  console.log(`✓ iso-${name}.pptx`);
}
console.log("\n请打开 iso-09a ~ iso-09d：哪个弹修复即问题形状。");
