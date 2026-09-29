// ============================================================================
// tests/regression/background-size.mjs — background cover crop follows deck.size
// ----------------------------------------------------------------------------
// The background cover crop (a:srcRect) must be computed from the live page size:
// pageSize flows from buildPptx along deck.size into buildSlide → backgroundXml.
// Case: a 1000×1000 square image on a [1200,600] (2:1) page crops 25% off the top
// and bottom (t/b=25000). A hard-coded 960×540 page would yield 21875 instead.
// ============================================================================

import { buildSlide } from "../../packages/writer/slide.js";

const page = {
  background: { type: "image", src: "media/bg.png" },
  elements: [],
};

// Stub registry: 1×1 fake PNG bytes with a known logical size of 1000×1000
const registry = {
  loadImage: () => ({ bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), ext: "png", size: [1000, 1000] }),
};

const { xml } = buildSlide(null, page, 1, registry, { pageSize: [1200, 600] });

let ok = true;
function check(name, cond, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) ok = false;
}

check("背景按 pageSize=[1200,600] 裁剪（t/b=25000）", xml.includes('t="25000"') && xml.includes('b="25000"'));
check("不含旧的 960×540 硬编码结果（21875）", !xml.includes("21875"));

// Without an explicit pageSize the crop falls back to 960×540 (t/b=21875)
const { xml: xmlDefault } = buildSlide(null, page, 1, registry, {});
check("缺省 pageSize 回退 960×540（t/b=21875）", xmlDefault.includes('t="21875"'));

process.exit(ok ? 0 : 1);
