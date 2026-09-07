// ============================================================================
// tests/regression/font-full-embed.mjs — 完整字体嵌入回归（fullFonts / --full-fonts）
// ----------------------------------------------------------------------------
// 覆盖：
//   1. 默认（子集）：fntdata 为子集（FontDataSize < 源字节），EOT Flags=0x1(SUBSET)，
//      presentation.xml 带 saveSubsetFonts="1"
//   2. fullFonts=true：fntdata 为全量（FontDataSize == 源字节），EOT Flags=0，
//      presentation.xml 无 saveSubsetFonts（仍含 embedTrueTypeFonts）
//   3. fullFonts 是一次性覆盖：不回写 deck.fonts 的 subset 声明
//   4. embedFonts=false 时 fullFonts 无效（整体不嵌）
// EOT 头布局（buildEot）：EOTSize@0 / FontDataSize@4 / Version@8 / Flags@12（小端）
// 运行：node tests/regression/font-full-embed.mjs
// ============================================================================

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildEmbeddedFonts } from "../../packages/writer/font.js";
import { buildPresentation } from "../../packages/writer/parts.js";

const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "fonts");
const FILE = "QuattrocentoSans-Regular.ttf"; // 98KB 西文小字体（TrueType，可子集化）
const FAMILY = "Quattrocento Sans";

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ ${msg}`); }
};

const mkDeck = () => ({
  title: "full-fonts 回归",
  size: [1280, 720],
  // 显式 subset:true（对齐注册表默认），验证 fullFonts 能覆盖它
  fonts: { body: { family: FAMILY, file: FILE, subset: true } },
  pages: [{ elements: [{ elementId: "t1", elementType: "text", bounds: [100, 100, 400, 80], content: { text: "Full font embed 你好" } }] }],
});
const opts = (extra = {}) => ({ fontDir: FONT_DIR, fs: { readFileSync }, ...extra });
const u32 = (b, off) => new DataView(b.buffer, b.byteOffset + off, 4).getUint32(0, true);
const presXml = (emb) => buildPresentation("t", 1, [1280, 720], null, emb, false);
const srcLen = () => readFileSync(join(FONT_DIR, FILE)).length;

console.log("== 1. 默认：子集嵌入 ==");
{
  const deck = mkDeck();
  const emb = await buildEmbeddedFonts(deck, opts());
  ok(emb.parts.length === 1, "嵌入 1 个字体部件");
  ok(u32(emb.parts[0].bytes, 4) < srcLen(), `FontDataSize ${u32(emb.parts[0].bytes, 4)} < 源 ${srcLen()}（子集化生效）`);
  ok(u32(emb.parts[0].bytes, 12) === 0x1, "EOT Flags = 0x1（SUBSET）");
  ok(emb.subsetMode === true, "subsetMode = true");
  ok(presXml(emb).includes('saveSubsetFonts="1"'), "presentation.xml 含 saveSubsetFonts");
  ok(deck.fonts.body.subset === true, "deck 声明未被回写");
}

console.log("== 2. fullFonts=true：全量嵌入 ==");
{
  const deck = mkDeck();
  const emb = await buildEmbeddedFonts(deck, opts({ fullFonts: true }));
  ok(emb.parts.length === 1, "嵌入 1 个字体部件");
  ok(u32(emb.parts[0].bytes, 4) === srcLen(), `FontDataSize ${u32(emb.parts[0].bytes, 4)} == 源 ${srcLen()}（全量字节）`);
  ok(u32(emb.parts[0].bytes, 12) === 0, "EOT Flags = 0（非 SUBSET）");
  ok(emb.subsetMode === false, "subsetMode = false");
  const xml = presXml(emb);
  ok(!xml.includes("saveSubsetFonts"), "presentation.xml 无 saveSubsetFonts");
  ok(xml.includes('embedTrueTypeFonts="1"'), "presentation.xml 仍含 embedTrueTypeFonts");
  ok(deck.fonts.body.subset === true, "覆盖不回写：deck 声明仍是 subset:true");
}

console.log("== 3. embedFonts=false：fullFonts 无效（整体不嵌）==");
{
  const emb = await buildEmbeddedFonts(mkDeck(), opts({ embedFonts: false, fullFonts: true }));
  ok(emb.parts.length === 0 && emb.subsetMode === false, "不产出任何字体部件");
}

console.log(`\n结果: ${pass}/${pass + fail} 通过`);
process.exit(fail ? 1 : 0);
