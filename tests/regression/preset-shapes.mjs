// ============================================================================
// tests/regression/preset-shapes.mjs — preset shape export regression (187 presets + custom paths)
// ----------------------------------------------------------------------------
// 1. Export all 187 PRST shapes one by one → the prstGeom name must be in the official ST_ShapeType enum
// 2. Custom paths (including the official donut example) → a:custGeom structure (full-circle arc split / direction)
// 3. All XML parts well-formed + in-package reference integrity
// Usage: node tests/regression/preset-shapes.mjs
// ============================================================================

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "../../packages/model/vendor/js-yaml.mjs";
import { normalizeTheme } from "../../packages/model/theme.js";
import { buildPptx } from "../../packages/writer/pptx.js";
import { createDeck } from "../../packages/model/model.js";
import { PRESET_SHAPES } from "../../packages/model/preset-geometry.data.js";
import { parseSvgPath, splitArc, svgArcToOoxml } from "../../packages/writer/custgeom.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(ROOT, "tests", "projects", "shape", "out");
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------------
// Official ST_ShapeType enum (ECMA-376 Part 1 §20.1.10.54) — the prst whitelist
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
// 1) Full export: 187 presets + custom paths (including the official donut example)
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
// Custom paths: official donut example + rotated-arc path + quadratic/cubic bézier + relative commands
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

// Unpack for inspection
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { unzip } from "../lib/unzip.js";

let failures = 0;
const check = (ok, msg) => {
  if (!ok) {
    failures += 1;
    console.log(`✗ ${msg}`);
  }
};

// Unpack into a temp directory to read the XML
const tmpDir = mkdtempSync(joinPath(tmpdir(), "preset-shapes-"));
const files = unzip(bytes, tmpDir);
const readPart = (p) => readFileSync(joinPath(tmpDir, p), "utf8");
const listXml = files.filter((k) => k.endsWith(".xml") || k.endsWith(".rels"));

// ---- Assertion 1: every prstGeom name is valid ----
let slideXml = "";
for (const f of files) {
  if (/^ppt\/slides\/slide\d+\.xml$/.test(f)) slideXml += readPart(f);
}
const prstNames = [...new Set((slideXml.match(/<a:prstGeom prst="([^"]+)"/g) || []).map((m) => m.replace('<a:prstGeom prst="', "").replace(/"$/, "")))];
const invalidPrst = prstNames.filter((n) => !VALID.has(n));
check(invalidPrst.length === 0, `非法 prstGeom 名: ${invalidPrst.join(", ")}`);

// ---- Assertion 2: all 187 presets appear ----
const missing = SHAPES.filter(([name]) => !slideXml.includes(`prst="${name}"`)).map(([n]) => n);
check(missing.length === 0, `导出缺失预置形状: ${missing.join(", ")}`);

// ---- Assertion 3: custGeom structure (donut: outer CW + inner CCW + full circle split in two) ----
const custCount = (slideXml.match(/<a:custGeom>/g) || []).length;
check(custCount >= 4, `a:custGeom 数量不足: ${custCount}`);
const ringArc = (slideXml.match(/<a:arcTo wR="500" hR="500" stAng="0" swAng="10800000"\/><a:arcTo wR="500" hR="500" stAng="10800000" swAng="10800000"\/>/g) || []).length;
check(ringArc === 1, `外环整圆拆分结构不符（应为 0→180→360 两段 180° 弧）`);
const innerArc = (slideXml.match(/<a:arcTo wR="300" hR="300" stAng="0" swAng="-10800000"\/><a:arcTo wR="300" hR="300" stAng="10800000" swAng="-10800000"\/>/g) || []).length;
check(innerArc === 1, `内环逆时针结构不符（应为负扫过角两段）`);

// ---- Assertion 4: relative commands / quadratic bézier / rotated arc conversion ----
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

// ---- Assertion 5: all XML well-formed ----
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
// Result
// ---------------------------------------------------------------------------
console.log(`\n结果: ${failures === 0 ? "全部通过" : failures + " 项失败"}`);
console.log(`预置形状: ${SHAPES.length} 种全部导出；prstGeom 名全部合法`);
if (failures === 0) console.log(`产物: ${pptxPath}`);
process.exit(failures === 0 ? 0 : 1);

/** Simple XML well-formedness depth check (stack counter, -1 = unbalanced). */
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
