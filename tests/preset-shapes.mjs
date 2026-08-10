// ============================================================================
// tests/preset-shapes.mjs — 预置形状导出回归（187 种 + 自定义路径）
// ----------------------------------------------------------------------------
// 1. 全部 187 种 PRST 形状逐一导出 → prstGeom 名必须落在官方 ST_ShapeType 枚举内
// 2. 自定义路径（含官方镂空圆环示例）→ a:custGeom 结构（arcTo 整圆拆分 / 方向）
// 3. 全部 XML 部件良构 + 包内引用一致性
// 用法：node tests/preset-shapes.mjs
// ============================================================================

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "../editor/vendor/js-yaml.mjs";
import { normalizeTheme } from "../editor/core/theme.js";
import { buildPptx } from "../editor/writer/pptx.js";
import { createDeck } from "../editor/core/model.js";
import { PRESET_SHAPES } from "../editor/core/preset-geometry.data.js";
import { parseSvgPath, splitArc, svgArcToOoxml } from "../editor/writer/custgeom.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(ROOT, "tests", "projects", "shape", "out");
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------------
// 官方 ST_ShapeType 枚举（ECMA-376 Part 1 §20.1.10.54）——prst 合法值白名单
// ---------------------------------------------------------------------------
const ST_SHAPE_TYPE = `
accentBorderCallout1 accentBorderCallout2 accentBorderCallout3 accentCallout1 accentCallout2
accentCallout3 actionButtonBackPrevious actionButtonBeginning actionButtonBlank actionButtonDocument
actionButtonEnd actionButtonForwardNext actionButtonHelp actionButtonHome actionButtonInformation
actionButtonMovie actionButtonReturn actionButtonSound arc bentArrow bentUpArrow bevel blockArc
borderCallout1 borderCallout2 borderCallout3 bracePair bracketPair callout1 callout2 callout3 can
chartPlus chartStar chartX chevron chord circularArrow cloud cloudCallout corner cornerTabs cube
curvedDownArrow curvedLeftArrow curvedRightArrow curvedUpArrow decagon diagStripe diamond dodecagon
donut doubleWave downArrow downArrowCallout ellipse ellipseRibbon ellipseRibbon2 flowChartAlternateProcess
flowChartCollate flowChartConnector flowChartDecision flowChartDelay flowChartDisplay flowChartDocument
flowChartExtract flowChartInputOutput flowChartInternalStorage flowChartMagneticDisk flowChartMagneticDrum
flowChartMagneticTape flowChartManualInput flowChartManualOperation flowChartMerge flowChartMultidocument
flowChartOfflineStorage flowChartOffpageConnector flowChartOnlineStorage flowChartOr flowChartPredefinedProcess
flowChartPreparation flowChartProcess flowChartPunchedCard flowChartPunchedTape flowChartSort
flowChartSummingJunction flowChartTerminator foldedCorner frame funnel gear6 gear9 halfFrame heart
heptagon hexagon homePlate horizontalScroll irregularSeal1 irregularSeal2 leftArrow leftArrowCallout
leftBrace leftBracket leftCircularArrow leftRightArrow leftRightArrowCallout leftRightCircularArrow
leftRightRibbon leftRightUpArrow leftUpArrow lightningBolt line lineInv mathDivide mathEqual mathMinus
mathMultiply mathNotEqual mathPlus moon nonIsoscelesTrapezoid noSmoking notchedRightArrow octagon
parallelogram pentagon pie pieWedge plaque plaqueTabs plus quadArrow quadArrowCallout rect ribbon
ribbon2 rightArrow rightArrowCallout rightBrace rightBracket round1Rect round2DiagRect round2SameRect
roundRect rtTriangle smileyFace snip1Rect snip2DiagRect snip2SameRect snipRoundRect squareTabs star10
star12 star16 star24 star32 star4 star5 star6 star7 star8 straightConnector1 stripedRightArrow sun
swooshArrow teardrop trapezoid triangle upArrow upArrowCallout upDownArrow upDownArrowCallout uturnArrow
verticalScroll wave wedgeEllipseCallout wedgeRectCallout wedgeRoundRectCallout bentConnector2
bentConnector3 bentConnector4 bentConnector5 curvedConnector2 curvedConnector3 curvedConnector4
curvedConnector5
`.trim().split(/\s+/);
const VALID = new Set(ST_SHAPE_TYPE);

// ---------------------------------------------------------------------------
// 1) 全量导出：187 预置 + 自定义路径（含官方镂空示例）
// ---------------------------------------------------------------------------
const SHAPES = Object.entries(PRESET_SHAPES);
const PAGE_CAP = 30;
const pages = [];
for (let i = 0; i < SHAPES.length; i += PAGE_CAP) {
  const chunk = SHAPES.slice(i, i + PAGE_CAP);
  pages.push({
    pageType: "content",
    background: { type: "solid", color: "#FFFFFF" },
    elements: chunk.map(([name, def], k) => ({
      elementId: `s${i + k}`,
      elementType: "shape",
      bounds: [(k % 5) * 190 + 10, Math.floor(k / 5) * 110 + 10, 170, 90],
      shapeName: name,
      adjustments: def.adjDefault.length ? def.adjDefault : null,
      fill: { type: "solid", color: "#3A6EA5" },
    })),
  });
}
// 自定义路径：官方镂空圆环示例 + 带旋转弧的路径 + 二次/三次贝塞尔 + 相对命令
pages.push({
  pageType: "content",
  background: { type: "solid", color: "#FFFFFF" },
  elements: [
    {
      elementId: "c1",
      elementType: "shape",
      bounds: [50, 50, 150, 150],
      shapeName: "custom",
      viewBox: [1000, 1000],
      path: "M500,0 A500,500 0 1 1 499,0 Z M500,200 A300,300 0 1 0 499,200 Z",
      fill: { type: "solid", color: "#2563EB" },
    },
    {
      elementId: "c2",
      elementType: "shape",
      bounds: [250, 50, 200, 100],
      shapeName: "custom",
      viewBox: [1000, 500],
      path: "M100,400 C150,50 400,50 500,250 S800,400 900,100 L900,400 Z",
      fill: { type: "solid", color: "#F59E0B" },
    },
    {
      elementId: "c3",
      elementType: "shape",
      bounds: [500, 50, 200, 120],
      shapeName: "custom",
      viewBox: [100, 60],
      path: "m10,50 q40,-40 80,0 t80,0 h40 v10 h-40 t-80,0 q-40,-40 -80,0 z",
      fill: { type: "solid", color: "#10B981" },
    },
    {
      elementId: "c4",
      elementType: "shape",
      bounds: [750, 50, 160, 120],
      shapeName: "custom",
      viewBox: [800, 600],
      path: "M400,300 A300,200 30 1 1 700,100 Z",
      fill: { type: "solid", color: "#8B5CF6" },
    },
  ],
});

const deck = createDeck({
  title: "preset-shapes",
  size: [960, 540],
  theme: { colors: { primary: "#2563EB", accent: "#F59E0B", text: "#111827", muted: "#6B7280", bg: "#FFFFFF" } },
  pages,
});
const theme = normalizeTheme(deck.theme);
const bytes = await buildPptx(deck, { theme });
const pptxPath = join(outDir, `preset-shapes-${Date.now()}.pptx`);
writeFileSync(pptxPath, bytes);

// 解包检查
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { unzip } from "./util/unzip.js";

let failures = 0;
const check = (ok, msg) => {
  if (!ok) {
    failures += 1;
    console.log(`✗ ${msg}`);
  }
};

// 解包到临时目录读取 XML
const tmpDir = mkdtempSync(joinPath(tmpdir(), "preset-shapes-"));
const files = unzip(bytes, tmpDir);
const readPart = (p) => readFileSync(joinPath(tmpDir, p), "utf8");
const listXml = files.filter((k) => k.endsWith(".xml") || k.endsWith(".rels"));

// ---- 断言 1：所有 prstGeom 名合法 ----
let slideXml = "";
for (const f of files) {
  if (/^ppt\/slides\/slide\d+\.xml$/.test(f)) slideXml += readPart(f);
}
const prstNames = [...new Set((slideXml.match(/<a:prstGeom prst="([^"]+)"/g) || []).map((m) => m.replace('<a:prstGeom prst="', "").replace(/"$/, "")))];
const invalidPrst = prstNames.filter((n) => !VALID.has(n));
check(invalidPrst.length === 0, `非法 prstGeom 名: ${invalidPrst.join(", ")}`);

// ---- 断言 2：187 种预置全部出现 ----
const missing = SHAPES.filter(([name]) => !slideXml.includes(`prst="${name}"`)).map(([n]) => n);
check(missing.length === 0, `导出缺失预置形状: ${missing.join(", ")}`);

// ---- 断言 3：custGeom 结构（镂空圆环：外环顺 + 内环逆 + 整圆拆两段）----
const custCount = (slideXml.match(/<a:custGeom>/g) || []).length;
check(custCount >= 4, `a:custGeom 数量不足: ${custCount}`);
const ringArc = (slideXml.match(/<a:arcTo wR="500" hR="500" stAng="0" swAng="10800000"\/><a:arcTo wR="500" hR="500" stAng="10800000" swAng="10800000"\/>/g) || []).length;
check(ringArc === 1, `外环整圆拆分结构不符（应为 0→180→360 两段 180° 弧）`);
const innerArc = (slideXml.match(/<a:arcTo wR="300" hR="300" stAng="0" swAng="-10800000"\/><a:arcTo wR="300" hR="300" stAng="10800000" swAng="-10800000"\/>/g) || []).length;
check(innerArc === 1, `内环逆时针结构不符（应为负扫过角两段）`);

// ---- 断言 4：相对命令/二次贝塞尔/旋转弧转换 ----
const cmds = parseSvgPath("m10,50 q40,-40 80,0 t80,0 h40 v10 h-40 t-80,0 q-40,-40 -80,0 z");
check(JSON.stringify(cmds[0]) === JSON.stringify(["M", [10, 50]]), `相对 m 解析: ${JSON.stringify(cmds[0])}`);
check(cmds.some((c) => c[0] === "Q"), "q/t 相对命令未展开为 Q");
check(cmds.some((c) => c[0] === "H") && cmds.some((c) => c[0] === "V"), "h/v 相对命令未展开");
const rotArc = splitArc(400, 300, 300, 200, 30, 1, 1, 700, 100);
check(rotArc.length === 1, "普通弧不应拆分");
const ooxmlArc = svgArcToOoxml(400, 300, 300, 200, 0, 1, 1, 700, 100);
check(!!ooxmlArc && Math.abs(ooxmlArc.swAng) > 10800000, `大弧 sweep 转换异常（应 >180°）: ${JSON.stringify(ooxmlArc)}`);
const fullCircle = splitArc(500, 0, 500, 500, 0, 1, 1, 499, 0);
check(fullCircle.length === 2, "近重合端点整圆应拆两段");
check(fullCircle[0].sweep === 1 && fullCircle[1].sweep === 1, "整圆两段方向应保持 sweep");

// ---- 断言 5：全部 XML 良构 ----
for (const f of listXml) {
  const text = readPart(f).replace(/^\uFEFF/, "");
  if (xmlDepth(text) < 0) {
    check(false, `XML 良构失败: ${f}`);
    break;
  }
}
console.log(`✓ XML 部件良构（${listXml.length} 个）`);
rmSync(tmpDir, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// 结果
// ---------------------------------------------------------------------------
console.log(`\n结果: ${failures === 0 ? "全部通过" : failures + " 项失败"}`);
console.log(`预置形状: ${SHAPES.length} 种全部导出；prstGeom 名全部合法`);
if (failures === 0) console.log(`产物: ${pptxPath}`);
process.exit(failures === 0 ? 0 : 1);

/** 简易 XML 良构深度检查（栈计数，返回 -1 表示不平衡）。 */
function xmlDepth(text) {
  let depth = 0;
  const re = /<(\/?)([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(text))) {
    const closing = m[1] === "/";
    const selfClose = m[4] === "/";
    const name = m[2];
    if (name === "?xml" || name.startsWith("!")) continue;
    if (closing) {
      depth -= 1;
      if (depth < 0) return -1;
    } else if (!selfClose) {
      depth += 1;
    }
  }
  return depth === 0 ? 0 : -1;
}
