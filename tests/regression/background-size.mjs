// ============================================================================
// tests/regression/background-size.mjs — 背景图 cover 裁剪随 deck.size 回归
// ----------------------------------------------------------------------------
// 历史 bug：writer/background.js 把页面尺寸硬编码为 960×540，非标准尺寸 deck
// 的背景图 cover 裁剪（a:srcRect）算错。修复后 pageSize 由 buildPptx 沿
// deck.size 传入 buildSlide → backgroundXml。
// 用例：1000×1000 方图 + [1200,600]（2:1）页面 → 上下各裁 25%（t/b=25000）；
// 旧的 960×540 硬编码会算出 21875。
// ============================================================================

import { buildSlide } from "../../packages/writer/slide.js";

const page = {
  background: { type: "image", src: "media/bg.png" },
  elements: [],
};

// 桩注册表：1×1 假 PNG 字节 + 已知逻辑尺寸 1000×1000
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

// 缺省 pageSize 时回退 960×540（t/b=21875）
const { xml: xmlDefault } = buildSlide(null, page, 1, registry, {});
check("缺省 pageSize 回退 960×540（t/b=21875）", xmlDefault.includes('t="21875"'));

process.exit(ok ? 0 : 1);
