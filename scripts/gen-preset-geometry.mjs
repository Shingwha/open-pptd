#!/usr/bin/env node
// ============================================================================
// gen-preset-geometry.mjs — 从 ECMA-376 规范生成预置形状几何数据
// ----------------------------------------------------------------------------
// 输入：ECMA-376 Part 1 规范附带的 presetShapeDefinitions.xml
//   （官方下载：https://ecma-international.org/publications-and-standards/standards/ecma-376/
//    → ECMA-376-1_5th_edition_december_2016.zip → OfficeOpenXML-DrawingMLGeometries.zip）
// 输出：editor/core/preset-geometry.data.js（仅几何数据，公式/路径原样转写）
// 用法：node scripts/gen-preset-geometry.mjs <presetShapeDefinitions.xml>
// ----------------------------------------------------------------------------
// 仅收录「纯多边形 / 三次贝塞尔」形状（moveTo/lnTo/cubicBezTo/close），
// 含 arcTo/quadBezTo 的形状（cloud/sun/moon/gear6/teardrop/plaque…）暂不支持，
// 白名单中若出现会直接报错，防止静默生成错误数据。
// ============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// 白名单：shapeName → 中文标签（菜单/属性面板用）
const WHITELIST = {
  chevron: "燕尾箭头",
  pentagon: "五边形",
  hexagon: "六边形",
  octagon: "八边形",
  parallelogram: "平行四边形",
  trapezoid: "梯形",
  homePlate: "本垒板",
  lightningBolt: "闪电",
  rightArrow: "右箭头",
  leftArrow: "左箭头",
  upArrow: "上箭头",
  downArrow: "下箭头",
  leftRightArrow: "左右箭头",
  upDownArrow: "上下箭头",
  quadArrow: "四向箭头",
  star4: "四角星",
  star5: "五角星",
  star8: "八角星",
  plus: "加号",
  mathMinus: "减号",
  heart: "心形",
};

const ARGS = process.argv.slice(2);
if (ARGS.length < 1) {
  console.error("用法: node scripts/gen-preset-geometry.mjs <presetShapeDefinitions.xml>");
  process.exit(1);
}
const src = readFileSync(ARGS[0], "utf8");

function extractBlock(name) {
  const m = new RegExp("<" + name + ">(?![\\s\\S]*?<" + name + ">)", "").test(src);
  void m;
  // 直接按标签查找（XML 为扁平结构，一个顶层元素一个形状）
  const re = new RegExp("<" + name + ">([\\s\\S]*?)</" + name + ">");
  return re.exec(src)?.[1] ?? null;
}

function parsePts(tag, block) {
  // <pt x="xx" y="yy" />（含 <pos>，但路径只用 <pt>）
  const out = [];
  const re = /<pt\s+x="([^"]*)"\s+y="([^"]*)"\s*\/>/g;
  let m;
  while ((m = re.exec(block))) out.push([m[1], m[2]]);
  return out;
}

function stripNs(x) {
  return x.replace(/\sxmlns="[^"]*"/g, "").replace(/>\s+</g, "><");
}

function parseShape(name) {
  const raw = extractBlock(name);
  if (!raw) return null;
  const block = stripNs(raw);

  // avLst：调整值默认（保持出现顺序与名称）
  const adjNames = [];
  const adjDefault = [];
  const avRe = /<avLst>([\s\S]*?)<\/avLst>/;
  const avm = avRe.exec(block);
  if (avm) {
    const gdRe = /<gd\s+name="([^"]+)"\s+fmla="val\s+([^"]+)"\s*\/>/g;
    let m;
    while ((m = gdRe.exec(avm[1]))) {
      adjNames.push(m[1]);
      adjDefault.push(Number(m[2]));
    }
  }

  // gdLst：公式（仅 gdLst 段；avLst 段是调整值默认，已由 adjNames/adjDefault 收录，
  // 重复提取会让求值时用默认值覆盖元素自定义调整值）
  const guides = [];
  const glBlock = /<gdLst>([\s\S]*?)<\/gdLst>/.exec(block)?.[1] ?? "";
  const glRe = /<gd\s+name="([^"]+)"\s+fmla="([^"]+)"\s*\/>/g;
  let gm;
  while ((gm = glRe.exec(glBlock))) {
    const f = gm[2].trim().split(/\s+/);
    const op = f[0];
    guides.push([gm[1], op, f.slice(1)]);
  }

  // pathLst：取第一个 path（填充路径；后续 path 多为描边/阴影辅助，忽略）
  const pathM = /<pathLst>[\s\S]*?<path\b([^>]*)>([\s\S]*?)<\/path>/.exec(block);
  if (!pathM) throw new Error(`${name}: 未找到 path`);
  // path 可声明自视图框（如 lightningBolt w=21600 h=21600），坐标按视图框归一化后缩放
  const vbM = /w="([\d.]+)"\s+h="([\d.]+)"/.exec(pathM[1]);
  const pathViewBox = vbM ? [Number(vbM[1]), Number(vbM[2])] : null;
  const pathBody = pathM[2];
  const cmds = [];
  let i = 0;
  const cmdRe = /<(moveTo|lnTo|cubicBezTo|quadBezTo|arcTo|close)\b[^>]*>([\s\S]*?)<\/(?:moveTo|lnTo|cubicBezTo|quadBezTo|arcTo)>|<close\s*\/?>/g;
  let m;
  while ((m = cmdRe.exec(pathBody))) {
    if (m[1] === "close" || m[0].startsWith("<close")) {
      cmds.push(["Z"]);
      continue;
    }
    const cmd = m[1];
    if (cmd === "arcTo" || cmd === "quadBezTo") {
      throw new Error(`${name}: 含 ${cmd}，暂不支持（仅接受 moveTo/lnTo/cubicBezTo/close）`);
    }
    const pts = parsePts(m[2], m[0]);
    cmds.push([cmd === "moveTo" ? "M" : cmd === "lnTo" ? "L" : "C", ...pts.flat()]);
  }
  if (cmds.length === 0) throw new Error(`${name}: 路径为空`);

  return { adjNames, adjDefault, guides, path: cmds, pathViewBox };
}

// upArrow 规范定义文件缺失：几何 = downArrow 垂直镜像（PPT 行为一致）
function deriveUpArrow() {
  const down = parseShape("downArrow");
  if (!down) throw new Error("derive upArrow: downArrow 缺失");
  // 路径点 y 引用镜像：t↔b；y 方向指南 y1/y2 由「b - dy」改为「t + dy」
  const yRefMap = { t: "b", b: "t", y1: "y1m", y2: "y2m", vc: "vc" };
  const guides = [...down.guides];
  // 找到 dy1/dy2 的原始定义，追加镜像指南
  const findGuide = (n) => guides.find((g) => g[0] === n);
  const dy1 = findGuide("dy1");
  const dy2 = findGuide("dy2");
  if (!dy1 || !dy2) throw new Error("derive upArrow: 缺少 dy1/dy2");
  // 镜像指南直接引用 dy1/dy2 的指南值（不是公式参数）
  guides.push(["y1m", "+-", ["t", "dy1", "0"]]); // t + dy1
  guides.push(["y2m", "+-", ["y1m", "0", "dy2"]]); // y1m - dy2
  const path = down.path.map((c) => {
    if (c[0] === "Z") return c;
    return [c[0], ...c.slice(1).map((r, idx) => (idx % 2 === 1 ? yRefMap[r] ?? r : r))];
  });
  return { ...down, guides, path, _derived: "downArrow(y镜像)" };
}

// ---------------------------------------------------------------------------
// 生成
// ---------------------------------------------------------------------------
const out = {};
for (const [name, label] of Object.entries(WHITELIST)) {
  let shape = name === "upArrow" ? null : parseShape(name);
  if (!shape && name === "upArrow") shape = deriveUpArrow();
  if (!shape) throw new Error(`${name}: 定义文件中不存在`);
  shape.label = label;
  out[name] = shape;
}

const lines = [];
lines.push("// ============================================================================");
lines.push("// preset-geometry.data.js — 预置形状几何（AUTO-GENERATED，勿手改）");
lines.push("// ----------------------------------------------------------------------------");
lines.push("// 来源：ECMA-376 Part 1 5th ed. 附录 presetShapeDefinitions.xml");
lines.push("// 重新生成：node scripts/gen-preset-geometry.mjs <presetShapeDefinitions.xml>");
lines.push("// 求值器见 preset-geometry.js；arcTo/quadBezTo 形状暂未收录。");
lines.push("// ============================================================================");
lines.push("");
lines.push("/** 形状定义：adjNames/adjDefault（avLst 调整值默认）、guides（gdLst 公式，按序求值）、path（moveTo/lnTo/cubicBezTo/close）。 */");
lines.push("export const PRESET_SHAPES = {");
for (const [name, s] of Object.entries(out)) {
  lines.push(`  ${name}: {`);
  lines.push(`    label: "${s.label}",`);
  lines.push(`    adjNames: ${JSON.stringify(s.adjNames)},`);
  lines.push(`    adjDefault: ${JSON.stringify(s.adjDefault)},`);
  lines.push(`    guides: ${JSON.stringify(s.guides)},`);
  lines.push(`    path: ${JSON.stringify(s.path)},`);
  lines.push(`    pathViewBox: ${JSON.stringify(s.pathViewBox)}`);
  lines.push("  },");
}
lines.push("};");
lines.push("");

const dest = join(ROOT, "editor", "core", "preset-geometry.data.js");
writeFileSync(dest, lines.join("\n"), "utf8");
console.log(`✓ 已生成 ${dest}（${Object.keys(out).length} 个形状）`);
for (const [name, s] of Object.entries(out)) {
  const cmds = [...new Set(s.path.map((c) => c[0]))].join("/");
  console.log(`  ${name.padEnd(16)} adj=${JSON.stringify(s.adjDefault)} cmds=${cmds}${s._derived ? "  (" + s._derived + ")" : ""}`);
}
