// 生成对照文件：与用户参考文件同款 24 形状
// A: 当前行为（avLst 写满默认值）  B: PowerPoint 行为（默认值省略）
import { readFileSync, writeFileSync } from "node:fs";
import * as yaml from "../editor/vendor/js-yaml.mjs";
import { normalizeTheme } from "../editor/core/theme.js";
import { buildPptx } from "../editor/writer/pptx.js";
import { createDeck } from "../editor/core/model.js";
import { PRESET_SHAPES } from "../editor/core/preset-geometry.data.js";

const refs = JSON.parse(readFileSync("tests/out/shapes-ref.json", "utf8"));

function buildDeck(style) {
  const elements = refs.map((r, i) => {
    const def = PRESET_SHAPES[r.prst];
    let adjustments = null;
    if (style === "A") {
      // 当前行为：总是写默认值
      adjustments = def?.adjDefault.length ? def.adjDefault : null;
    } else {
      // PowerPoint 行为：只写非默认（参考文件里只有 arc 有值）
      adjustments = r.av.length ? r.av : null;
    }
    return {
      elementId: `s${i + 1}`,
      elementType: "shape",
      bounds: [r.x, r.y, r.w, r.h],
      shapeName: r.prst,
      adjustments,
      fill: { type: "solid", color: "#4472C4" },
    };
  });
  return createDeck({
    title: `对照-${style}`,
    size: [960, 540],
    theme: { colors: { primary: "#4472C4", accent: "#ED7D31", text: "#111111", muted: "#666666", bg: "#FFFFFF" } },
    pages: [{ pageType: "content", background: { type: "solid", color: "#FFFFFF" }, elements }],
  });
}

for (const style of ["A", "B"]) {
  const deck = buildDeck(style);
  const bytes = await buildPptx(deck, { theme: normalizeTheme(deck.theme) });
  const out = `tests/out/compare-${style}.pptx`;
  writeFileSync(out, bytes);
  console.log(`✓ ${out}（${refs.length} 个形状，avLst: ${style === "A" ? "写满默认值" : "仅非默认"}）`);
}
