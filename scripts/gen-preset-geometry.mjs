#!/usr/bin/env node
// ============================================================================
// gen-preset-geometry.mjs — 从 ECMA-376 规范生成预置形状几何数据
// ----------------------------------------------------------------------------
// 输入：ECMA-376 Part 1 规范附带的 presetShapeDefinitions.xml
//   （官方下载：https://ecma-international.org/publications-and-standards/standards/ecma-376/
//    → ECMA-376-1_5th_edition_december_2016.zip → OfficeOpenXML-DrawingMLGeometries.zip）
// 输出：editor/core/preset-geometry.data.js（几何数据 + 标签 + 分类，公式/路径原样转写）
// 用法：node scripts/gen-preset-geometry.mjs <presetShapeDefinitions.xml>
// ----------------------------------------------------------------------------
// 收录全部 187 个预置形状（ECMA-376 附录），支持全部路径命令：
//   moveTo / lnTo / cubicBezTo / quadBezTo / arcTo / close
// 每个形状可含多条 path（fill 主轮廓 + lighten/darken 明暗面 + fill="none" 描边细节），
// 与 PowerPoint 渲染同源；upArrow 规范文件缺失，由 downArrow 垂直镜像推导。
// ============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// 中文标签 + 菜单分类（对齐 references/shapes.md 的 177 种 + 连接线 10 种）
// ---------------------------------------------------------------------------
const LABELS = {
  // 基本形状
  rect: "矩形", roundRect: "圆角矩形", ellipse: "椭圆", triangle: "三角形",
  rtTriangle: "直角三角形", parallelogram: "平行四边形", trapezoid: "梯形",
  nonIsoscelesTrapezoid: "不等边梯形", diamond: "菱形", pentagon: "五边形",
  hexagon: "六边形", heptagon: "七边形", octagon: "八边形", decagon: "十边形",
  dodecagon: "十二边形", plus: "加号", homePlate: "五边形箭头", chevron: "燕尾箭头",
  pie: "饼形", pieWedge: "扇形", arc: "弧形", chord: "弓形", blockArc: "块状弧",
  teardrop: "水滴形", frame: "边框", halfFrame: "半框", corner: "角形",
  diagStripe: "斜条纹", foldedCorner: "折角", donut: "圆环", noSmoking: "禁止符号",
  heart: "心形", lightningBolt: "闪电", sun: "太阳", moon: "月牙", cloud: "云形",
  smileyFace: "笑脸", bevel: "立体矩形", can: "圆柱体", cube: "立方体",
  funnel: "漏斗", gear6: "六齿齿轮", gear9: "九齿齿轮", plaque: "勋章",
  doubleWave: "双波浪", wave: "波浪", lineInv: "反线",
  // 矩形变体
  round1Rect: "单圆角矩形", round2DiagRect: "对角双圆角矩形", round2SameRect: "同侧双圆角矩形",
  snip1Rect: "单切角矩形", snip2DiagRect: "对角双切角矩形", snip2SameRect: "同侧双切角矩形",
  snipRoundRect: "一圆角一切角矩形",
  // 星与爆炸
  star4: "四角星", star5: "五角星", star6: "六角星", star7: "七角星",
  star8: "八角星", star10: "十角星", star12: "十二角星", star16: "十六角星",
  star24: "二十四角星", star32: "三十二角星", irregularSeal1: "爆炸形 1", irregularSeal2: "爆炸形 2",
  // 箭头
  rightArrow: "右箭头", leftArrow: "左箭头", upArrow: "上箭头", downArrow: "下箭头",
  leftRightArrow: "左右箭头", upDownArrow: "上下箭头", quadArrow: "四向箭头",
  leftRightUpArrow: "左右上箭头", leftUpArrow: "左上箭头", bentArrow: "弯箭头",
  bentUpArrow: "上弯箭头", uturnArrow: "U 形转弯箭头", circularArrow: "环形箭头",
  leftCircularArrow: "左环形箭头", leftRightCircularArrow: "左右环形箭头",
  curvedRightArrow: "曲线右箭头", curvedLeftArrow: "曲线左箭头", curvedUpArrow: "曲线上箭头",
  curvedDownArrow: "曲线下箭头", stripedRightArrow: "条纹右箭头",
  notchedRightArrow: "缺口右箭头", swooshArrow: "飞掠箭头",
  // 箭头标注
  rightArrowCallout: "右箭头标注", leftArrowCallout: "左箭头标注", upArrowCallout: "上箭头标注",
  downArrowCallout: "下箭头标注", leftRightArrowCallout: "左右箭头标注",
  upDownArrowCallout: "上下箭头标注", quadArrowCallout: "四向箭头标注",
  // 标注
  wedgeRectCallout: "矩形标注", wedgeRoundRectCallout: "圆角矩形标注",
  wedgeEllipseCallout: "椭圆标注", cloudCallout: "云形标注",
  borderCallout1: "线形标注 1", borderCallout2: "线形标注 2", borderCallout3: "线形标注 3",
  accentCallout1: "强调线标注 1", accentCallout2: "强调线标注 2", accentCallout3: "强调线标注 3",
  accentBorderCallout1: "带框强调线标注 1", accentBorderCallout2: "带框强调线标注 2",
  accentBorderCallout3: "带框强调线标注 3",
  callout1: "无框标注 1", callout2: "无框标注 2", callout3: "无框标注 3",
  // 括号
  leftBrace: "左大括号", rightBrace: "右大括号", leftBracket: "左中括号",
  rightBracket: "右中括号", bracePair: "双大括号", bracketPair: "双中括号",
  // 丝带
  ribbon: "下曲丝带", ribbon2: "上曲丝带", ellipseRibbon: "曲面下丝带",
  ellipseRibbon2: "曲面上丝带", leftRightRibbon: "左右丝带",
  // 卷轴
  horizontalScroll: "水平卷轴", verticalScroll: "垂直卷轴",
  // 数学符号
  mathPlus: "加号（数学）", mathMinus: "减号（数学）", mathMultiply: "乘号（数学）",
  mathDivide: "除号（数学）", mathEqual: "等号（数学）", mathNotEqual: "不等号（数学）",
  // 图表图形
  chartPlus: "图表加号", chartStar: "图表星形", chartX: "图表叉形",
  // 选项卡
  cornerTabs: "角形选项卡", squareTabs: "方形选项卡", plaqueTabs: "勋章选项卡",
  // 动作按钮
  actionButtonBackPrevious: "后退按钮", actionButtonBeginning: "开始按钮",
  actionButtonBlank: "空白按钮", actionButtonDocument: "文档按钮",
  actionButtonEnd: "结束按钮", actionButtonForwardNext: "前进按钮",
  actionButtonHelp: "帮助按钮", actionButtonHome: "主页按钮",
  actionButtonInformation: "信息按钮", actionButtonMovie: "影片按钮",
  actionButtonReturn: "返回按钮", actionButtonSound: "声音按钮",
  // 流程图
  flowChartProcess: "流程", flowChartAlternateProcess: "可选流程",
  flowChartDecision: "决策", flowChartDocument: "文档",
  flowChartMultidocument: "多文档", flowChartInputOutput: "数据",
  flowChartPredefinedProcess: "预定义流程", flowChartInternalStorage: "内部存储",
  flowChartManualInput: "手动输入", flowChartManualOperation: "手动操作",
  flowChartPreparation: "准备", flowChartDelay: "延迟", flowChartTerminator: "终止符",
  flowChartConnector: "连接符", flowChartOffpageConnector: "离页连接符",
  flowChartPunchedCard: "穿孔卡片", flowChartPunchedTape: "穿孔纸带",
  flowChartCollate: "整理", flowChartSort: "排序", flowChartExtract: "提取",
  flowChartMerge: "合并", flowChartOr: "或", flowChartSummingJunction: "求和节点",
  flowChartOnlineStorage: "在线存储", flowChartMagneticDisk: "磁盘",
  flowChartMagneticDrum: "磁鼓", flowChartMagneticTape: "磁带",
  flowChartOfflineStorage: "离线存储", flowChartDisplay: "显示",
  // 连接线（ECMA-376 线形预置）
  line: "直线", straightConnector1: "直线连接符",
  bentConnector2: "折线连接符 2", bentConnector3: "折线连接符 3",
  bentConnector4: "折线连接符 4", bentConnector5: "折线连接符 5",
  curvedConnector2: "曲线连接符 2", curvedConnector3: "曲线连接符 3",
  curvedConnector4: "曲线连接符 4", curvedConnector5: "曲线连接符 5",
};

// 菜单分组（顺序即展示顺序）
const CATEGORY_OF = {
  rect: "基本", roundRect: "基本", ellipse: "基本", triangle: "基本", rtTriangle: "基本",
  parallelogram: "基本", trapezoid: "基本", nonIsoscelesTrapezoid: "基本", diamond: "基本",
  pentagon: "基本", hexagon: "基本", heptagon: "基本", octagon: "基本", decagon: "基本",
  dodecagon: "基本", plus: "基本", homePlate: "基本", chevron: "基本", pie: "基本",
  pieWedge: "基本", arc: "基本", chord: "基本", blockArc: "基本", teardrop: "基本",
  frame: "基本", halfFrame: "基本", corner: "基本", diagStripe: "基本", foldedCorner: "基本",
  donut: "基本", noSmoking: "基本", heart: "基本", lightningBolt: "基本", sun: "基本",
  moon: "基本", cloud: "基本", smileyFace: "基本", bevel: "基本", can: "基本",
  cube: "基本", funnel: "基本", gear6: "基本", gear9: "基本", plaque: "基本",
  doubleWave: "基本", wave: "基本", lineInv: "基本",
  round1Rect: "矩形变体", round2DiagRect: "矩形变体", round2SameRect: "矩形变体",
  snip1Rect: "矩形变体", snip2DiagRect: "矩形变体", snip2SameRect: "矩形变体",
  snipRoundRect: "矩形变体",
  star4: "星与爆炸", star5: "星与爆炸", star6: "星与爆炸", star7: "星与爆炸",
  star8: "星与爆炸", star10: "星与爆炸", star12: "星与爆炸", star16: "星与爆炸",
  star24: "星与爆炸", star32: "星与爆炸", irregularSeal1: "星与爆炸", irregularSeal2: "星与爆炸",
  rightArrow: "箭头", leftArrow: "箭头", upArrow: "箭头", downArrow: "箭头",
  leftRightArrow: "箭头", upDownArrow: "箭头", quadArrow: "箭头", leftRightUpArrow: "箭头",
  leftUpArrow: "箭头", bentArrow: "箭头", bentUpArrow: "箭头", uturnArrow: "箭头",
  circularArrow: "箭头", leftCircularArrow: "箭头", leftRightCircularArrow: "箭头",
  curvedRightArrow: "箭头", curvedLeftArrow: "箭头", curvedUpArrow: "箭头",
  curvedDownArrow: "箭头", stripedRightArrow: "箭头", notchedRightArrow: "箭头",
  swooshArrow: "箭头",
  rightArrowCallout: "箭头标注", leftArrowCallout: "箭头标注", upArrowCallout: "箭头标注",
  downArrowCallout: "箭头标注", leftRightArrowCallout: "箭头标注",
  upDownArrowCallout: "箭头标注", quadArrowCallout: "箭头标注",
  wedgeRectCallout: "标注", wedgeRoundRectCallout: "标注", wedgeEllipseCallout: "标注",
  cloudCallout: "标注", borderCallout1: "标注", borderCallout2: "标注", borderCallout3: "标注",
  accentCallout1: "标注", accentCallout2: "标注", accentCallout3: "标注",
  accentBorderCallout1: "标注", accentBorderCallout2: "标注", accentBorderCallout3: "标注",
  callout1: "标注", callout2: "标注", callout3: "标注",
  leftBrace: "括号", rightBrace: "括号", leftBracket: "括号", rightBracket: "括号",
  bracePair: "括号", bracketPair: "括号",
  ribbon: "丝带", ribbon2: "丝带", ellipseRibbon: "丝带", ellipseRibbon2: "丝带",
  leftRightRibbon: "丝带",
  horizontalScroll: "卷轴", verticalScroll: "卷轴",
  mathPlus: "数学符号", mathMinus: "数学符号", mathMultiply: "数学符号",
  mathDivide: "数学符号", mathEqual: "数学符号", mathNotEqual: "数学符号",
  chartPlus: "图表图形", chartStar: "图表图形", chartX: "图表图形",
  cornerTabs: "选项卡", squareTabs: "选项卡", plaqueTabs: "选项卡",
  actionButtonBackPrevious: "动作按钮", actionButtonBeginning: "动作按钮",
  actionButtonBlank: "动作按钮", actionButtonDocument: "动作按钮", actionButtonEnd: "动作按钮",
  actionButtonForwardNext: "动作按钮", actionButtonHelp: "动作按钮", actionButtonHome: "动作按钮",
  actionButtonInformation: "动作按钮", actionButtonMovie: "动作按钮",
  actionButtonReturn: "动作按钮", actionButtonSound: "动作按钮",
  flowChartProcess: "流程图", flowChartAlternateProcess: "流程图", flowChartDecision: "流程图",
  flowChartDocument: "流程图", flowChartMultidocument: "流程图", flowChartInputOutput: "流程图",
  flowChartPredefinedProcess: "流程图", flowChartInternalStorage: "流程图",
  flowChartManualInput: "流程图", flowChartManualOperation: "流程图",
  flowChartPreparation: "流程图", flowChartDelay: "流程图", flowChartTerminator: "流程图",
  flowChartConnector: "流程图", flowChartOffpageConnector: "流程图",
  flowChartPunchedCard: "流程图", flowChartPunchedTape: "流程图", flowChartCollate: "流程图",
  flowChartSort: "流程图", flowChartExtract: "流程图", flowChartMerge: "流程图",
  flowChartOr: "流程图", flowChartSummingJunction: "流程图", flowChartOnlineStorage: "流程图",
  flowChartMagneticDisk: "流程图", flowChartMagneticDrum: "流程图",
  flowChartMagneticTape: "流程图", flowChartOfflineStorage: "流程图", flowChartDisplay: "流程图",
  line: "连接线", straightConnector1: "连接线", bentConnector2: "连接线",
  bentConnector3: "连接线", bentConnector4: "连接线", bentConnector5: "连接线",
  curvedConnector2: "连接线", curvedConnector3: "连接线", curvedConnector4: "连接线",
  curvedConnector5: "连接线",
};

const ARGS = process.argv.slice(2);
if (ARGS.length < 1) {
  console.error("用法: node scripts/gen-preset-geometry.mjs <presetShapeDefinitions.xml>");
  process.exit(1);
}
const src = readFileSync(ARGS[0], "utf8");

function stripNs(x) {
  return x.replace(/\sxmlns="[^"]*"/g, "").replace(/>\s+</g, "><");
}

/** 提取顶层形状块（扁平结构，一个顶层元素一个形状）。 */
function extractBlock(name) {
  const re = new RegExp("<" + name + ">([\\s\\S]*?)</" + name + ">");
  return re.exec(src)?.[1] ?? null;
}

/** 路径点列表（<pt x=".." y=".." />）。 */
function parsePts(block) {
  const out = [];
  const re = /<pt\s+x="([^"]*)"\s+y="([^"]*)"\s*\/>/g;
  let m;
  while ((m = re.exec(block))) out.push([m[1], m[2]]);
  return out;
}

/** 一条 path 的全部命令（moveTo/lnTo/cubicBezTo/quadBezTo/arcTo/close）。 */
function parsePathCommands(pathBody) {
  const cmds = [];
  let pos = 0;
  const tokenRe = /<(moveTo|lnTo|cubicBezTo|quadBezTo|arcTo|close)\b([^>]*)\/>|<(moveTo|lnTo|cubicBezTo|quadBezTo|arcTo)\b[^>]*>([\s\S]*?)<\/(?:moveTo|lnTo|cubicBezTo|quadBezTo|arcTo)>|<close\b[^>]*>([\s\S]*?)<\/close>/g;
  let m;
  while ((m = tokenRe.exec(pathBody))) {
    const [_, selfTag, selfAttrs, openTag, inner, closeInner] = m;
    const tag = selfTag || openTag;
    if (tag === "close") {
      cmds.push(["Z"]);
      continue;
    }
    if (tag === "arcTo") {
      const attrs = (selfAttrs || "").trim();
      const wR = /wR="([^"]+)"/.exec(attrs)?.[1] ?? "0";
      const hR = /hR="([^"]+)"/.exec(attrs)?.[1] ?? "0";
      const stAng = /stAng="([^"]+)"/.exec(attrs)?.[1] ?? "0";
      const swAng = /swAng="([^"]+)"/.exec(attrs)?.[1] ?? "0";
      cmds.push(["A", wR, hR, stAng, swAng]);
      continue;
    }
    const pts = parsePts(inner || "");
    const code = { moveTo: "M", lnTo: "L", cubicBezTo: "C", quadBezTo: "Q" }[tag];
    cmds.push([code, ...pts.flat()]);
  }
  if (cmds.length === 0) throw new Error(`路径为空`);
  return cmds;
}

function parseShape(name) {
  const raw = extractBlock(name);
  if (!raw) return null;
  const block = stripNs(raw);

  // avLst：调整值默认（保持出现顺序与名称）
  const adjNames = [];
  const adjDefault = [];
  const avm = /<avLst>([\s\S]*?)<\/avLst>/.exec(block);
  if (avm) {
    const gdRe = /<gd\s+name="([^"]+)"\s+fmla="val\s+([^"]+)"\s*\/>/g;
    let m;
    while ((m = gdRe.exec(avm[1]))) {
      adjNames.push(m[1]);
      adjDefault.push(Number(m[2]));
    }
  }

  // gdLst：公式（仅第一个 gdLst 段；avLst 段是调整值默认，已由 adjNames/adjDefault 收录）
  const guides = [];
  const glBlock = /<gdLst>([\s\S]*?)<\/gdLst>/.exec(block)?.[1] ?? "";
  const glRe = /<gd\s+name="([^"]+)"\s+fmla="([^"]+)"\s*\/>/g;
  let gm;
  while ((gm = glRe.exec(glBlock))) {
    const f = gm[2].trim().split(/\s+/);
    const op = f[0];
    guides.push([gm[1], op, f.slice(1)]);
  }

  // pathLst：全部 path（主填充 + 明暗面 + 描边细节），与 PowerPoint 同源
  const paths = [];
  const pathRe = /<path\b([^>]*)>([\s\S]*?)<\/path>/g;
  let pm;
  while ((pm = pathRe.exec(block))) {
    const attrs = pm[1].trim();
    const vbM = /w="([\d.]+)"\s+h="([\d.]+)"/.exec(attrs);
    const fillAttr = /fill="([^"]+)"/.exec(attrs)?.[1] ?? null; // null=实心；"none"=描边；lighten/darken…=明暗面
    const stroke = !/stroke="false"/.test(attrs); // 默认可描边
    paths.push({
      fill: fillAttr,
      stroke,
      vb: vbM ? [Number(vbM[1]), Number(vbM[2])] : null,
      cmds: parsePathCommands(pm[2]),
    });
  }
  if (paths.length === 0) throw new Error(`${name}: 未找到 path`);

  return { adjNames, adjDefault, guides, paths };
}

// upArrow 规范定义文件缺失：几何 = downArrow 垂直镜像（PPT 行为一致）
function deriveUpArrow() {
  const down = parseShape("downArrow");
  if (!down) throw new Error("derive upArrow: downArrow 缺失");
  // 路径点 y 引用镜像：t↔b；y 方向指南 y1/y2 由「b - dy」改为「t + dy」
  const yRefMap = { t: "b", b: "t", y1: "y1m", y2: "y2m", vc: "vc" };
  const guides = [...down.guides];
  const findGuide = (n) => guides.find((g) => g[0] === n);
  const dy1 = findGuide("dy1");
  const dy2 = findGuide("dy2");
  if (!dy1 || !dy2) throw new Error("derive upArrow: 缺少 dy1/dy2");
  guides.push(["y1m", "+-", ["t", "dy1", "0"]]); // t + dy1
  guides.push(["y2m", "+-", ["y1m", "0", "dy2"]]); // y1m - dy2
  const paths = down.paths.map((p) => ({
    ...p,
    cmds: p.cmds.map((c) =>
      c[0] === "Z" ? c : [c[0], ...c.slice(1).map((r, idx) => (idx % 2 === 1 ? yRefMap[r] ?? r : r))]
    ),
  }));
  return { ...down, paths, _derived: "downArrow(y镜像)" };
}

// ---------------------------------------------------------------------------
// 生成
// ---------------------------------------------------------------------------
const allNames = [...new Set(src.match(/\n  <(\w+)>/g).map((m) => /<(\w+)>/.exec(m)[1]))];
const out = {};
for (const name of allNames) {
  let shape = parseShape(name);
  if (!shape) throw new Error(`${name}: 定义文件中不存在`);
  if (!LABELS[name]) throw new Error(`${name}: 缺少中文标签`);
  shape.label = LABELS[name];
  shape.category = CATEGORY_OF[name];
  if (!shape.category) throw new Error(`${name}: 缺少分类`);
  out[name] = shape;
}
// upArrow 规范文件缺失：由 downArrow 垂直镜像推导（PPT 行为一致）
if (!out.upArrow) {
  const up = deriveUpArrow();
  up.label = LABELS.upArrow;
  up.category = CATEGORY_OF.upArrow;
  out.upArrow = up;
}

const lines = [];
lines.push("// ============================================================================");
lines.push("// preset-geometry.data.js — 预置形状几何（AUTO-GENERATED，勿手改）");
lines.push("// ----------------------------------------------------------------------------");
lines.push("// 来源：ECMA-376 Part 1 5th ed. 附录 presetShapeDefinitions.xml（187 种全部收录）");
lines.push("// 重新生成：node scripts/gen-preset-geometry.mjs <presetShapeDefinitions.xml>");
lines.push("// 求值器见 preset-geometry.js；path 命令：M/L/C/Q/A(arcTo)/Z，支持多路径（fill 明暗面/描边细节）。");
lines.push("// ============================================================================");
lines.push("");
lines.push("/**");
lines.push(" * 形状定义：");
lines.push(" *   label 中文标签 / category 菜单分类");
lines.push(" *   adjNames/adjDefault（avLst 调整值默认）、guides（gdLst 公式，按序求值）");
lines.push(" *   paths: [fill, stroke, viewBox, cmds]——fill: null=实心主轮廓, 'none'=仅描边,");
lines.push(" *     'lighten'/'darken'/'lightenLess'/'darkenLess'=明暗面; cmds: M/L/C/Q/A/Z");
lines.push(" */");
lines.push("export const PRESET_SHAPES = {");
for (const [name, s] of Object.entries(out)) {
  lines.push(`  ${name}: {`);
  lines.push(`    label: ${JSON.stringify(s.label)},`);
  lines.push(`    category: ${JSON.stringify(s.category)},`);
  lines.push(`    adjNames: ${JSON.stringify(s.adjNames)},`);
  lines.push(`    adjDefault: ${JSON.stringify(s.adjDefault)},`);
  lines.push(`    guides: ${JSON.stringify(s.guides)},`);
  lines.push(`    paths: ${JSON.stringify(s.paths.map((p) => [p.fill, p.stroke, p.vb, p.cmds]))}`);
  lines.push("  },");
}
lines.push("};");
lines.push("");

const dest = join(ROOT, "editor", "core", "preset-geometry.data.js");
writeFileSync(dest, lines.join("\n"), "utf8");
console.log(`✓ 已生成 ${dest}（${Object.keys(out).length} 个形状）`);
for (const [name, s] of Object.entries(out)) {
  const cmds = [...new Set(s.paths.flatMap((p) => p.cmds.map((c) => c[0])))].join("/");
  console.log(
    `  ${name.padEnd(24)} ${s.category.padEnd(5)} adj=${JSON.stringify(s.adjDefault)} cmds=${cmds}` +
      (s._derived ? "  (" + s._derived + ")" : "")
  );
}
