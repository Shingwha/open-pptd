// ============================================================================
// types/shape.js — 形状元素类型注册（187 种 ECMA-376 预置 + 自定义路径）
// ----------------------------------------------------------------------------
// 菜单完全由 preset-geometry.data.js 驱动：按 category 分组，缩略图由
// 求值器按 24×24 实时生成，与画布/导出几何同源。
// ============================================================================

import { registerType } from "./registry.js";
import { nextElementId, SUPPORTED_SHAPES } from "../core/model.js";
import { PRESET_SHAPES } from "../core/preset-geometry.data.js";
import { shapeMenuIcon } from "../core/preset-geometry.js";
import { renderShape } from "../renderer/shape.js";
import { shapeXml } from "../writer/shape.js";
import { svgIcon } from "../ui.js";

/** 形状默认模型（调整值不预设——与 PowerPoint 一致：未设置 = 预设内置默认）。 */
function shapeItem(name) {
  const def = PRESET_SHAPES[name];
  return {
    id: `shape-${name}`,
    label: def.label,
    group: def.category,
    icon: shapeMenuIcon(name),
    create: () => ({
      elementId: nextElementId("shape"),
      elementType: "shape",
      shapeName: name,
      bounds: [380, 200, 160, 110],
      adjustments: null,
      fill: { type: "solid", color: "$primary" },
    }),
  };
}

// 调整值中文名（属性面板用；未列出的回退原名）
const ADJ_LABELS = {
  adj: "调整",
  adj1: "调整 1",
  adj2: "调整 2",
  adj3: "调整 3",
  adj4: "调整 4",
  adj5: "调整 5",
  adj6: "调整 6",
  adj7: "调整 7",
  adj8: "调整 8",
  hf: "水平比例",
  vf: "垂直比例",
};

/** 形状的调整名（预置几何按规范 adjNames，基础形状按索引）。 */
function adjNamesFor(shapeName, adjustments) {
  if (PRESET_SHAPES[shapeName]?.adjNames?.length) return PRESET_SHAPES[shapeName].adjNames;
  return (adjustments || []).map((_, i) => (i === 0 ? "adj" : `adj${i}`));
}

/** 自定义路径默认模型：甜甜圈圆环（外环顺时针 + 内环逆时针镂空，官方示例语义）。 */
function createCustomShape() {
  return {
    elementId: nextElementId("shape"),
    elementType: "shape",
    shapeName: "custom",
    bounds: [380, 200, 180, 180],
    viewBox: [1000, 1000],
    path: "M500,50 A450,450 0 1 1 499,50 Z M500,250 A250,250 0 1 0 499,250 Z",
    fill: { type: "solid", color: "$primary" },
  };
}

registerType({
  type: "shape",
  label: "形状",

  menu: {
    group: "形状",
    items: [
      {
        id: "shape-custom",
        label: "自定义路径",
        group: "基本",
        desc: "SVG path + viewBox",
        icon: svgIcon('<path d="M4 6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M9 4.5l4.5 6-3 4.5L6 9z" fill="currentColor" opacity=".35"/>'),
        create: createCustomShape,
      },
      // 187 种预置几何：按 category 分组（求值器实时生成缩略图）
      ...Object.entries(SUPPORTED_SHAPES).map(([name]) => shapeItem(name)),
    ],
  },

  render: renderShape,
  toXml: shapeXml,

  props(el, h) {
    const g = h.group("形状");
    const options = Object.entries(SUPPORTED_SHAPES).map(([k, v]) => [k, v.label]);
    options.push(["custom", "自定义路径"]);
    g.appendChild(h.field("类型", h.selectInput(options, el.shapeName, (v) => { el.shapeName = v; })));
    const grid = document.createElement("div");
    grid.className = "prop-grid";
    grid.appendChild(h.field("类型", h.selectInput([["solid", "纯色"], ["gradient", "渐变"]], el.fill?.type === "gradient" ? "gradient" : "solid", (v) => {
      if (v === "gradient") {
        el.fill = {
          type: "gradient",
          gradientType: "linear",
          angle: el.fill?.angle ?? 90,
          stops: [
            { position: 0, color: fillHex(el.fill) || "$primary" },
            { position: 1, color: "#ffffff" },
          ],
        };
      } else {
        const cur = el.fill;
        el.fill = { type: "solid", color: cur?.type === "gradient" ? cur.stops?.[0]?.color || "$primary" : fillHex(cur) };
      }
    })));
    if (el.fill?.type === "gradient") {
      grid.appendChild(h.field("起始色", h.colorField(el.fill.stops?.[0]?.color || "$primary", (v) => { el.fill.stops[0].color = v; })));
      grid.appendChild(h.field("结束色", h.colorField(el.fill.stops?.[1]?.color || "#ffffff", (v) => { el.fill.stops[1].color = v; })));
      grid.appendChild(h.field("角度", h.numInput(el.fill.angle ?? 90, (v) => (el.fill.angle = v), { min: 0, max: 360, step: 15 })));
    } else {
      grid.appendChild(h.field("填充色", h.colorField(fillHex(el.fill), (v) => (el.fill = { type: "solid", color: v }))));
    }
    grid.appendChild(h.field("边框", h.colorField(el.border?.color || "$line", (v) => ((el.border ||= {}).color = v))));
    grid.appendChild(h.field("边宽", h.numInput(el.border?.width || 0, (v) => ((el.border ||= {}).width = v), { min: 0 })));
    grid.appendChild(h.field("线型", h.selectInput([["solid", "实线"], ["dash", "虚线"], ["dot", "点线"]], el.border?.style || "solid", (v) => ((el.border ||= {}).style = v))));
    // 自定义路径：viewBox + path（text input 直改）
    if (el.shapeName === "custom") {
      grid.appendChild(h.field("viewBox", h.textInput((el.viewBox || []).join(","), (v) => {
        const parts = v.split(",").map(Number);
        if (parts.length === 2 && parts.every(Number.isFinite)) el.viewBox = parts;
      })));
      grid.appendChild(h.field("路径", h.textInput(el.path || "", (v) => (el.path = v))));
    } else {
      // 调整值（圆角/缺口/星形比例等）：按规范 adjNames
      const names = adjNamesFor(el.shapeName, el.adjustments);
      const values = el.adjustments || SUPPORTED_SHAPES[el.shapeName]?.adjustments || [];
      names.forEach((name, i) => {
        const label = ADJ_LABELS[name] || name;
        grid.appendChild(
          h.field(label, h.numInput(values[i] ?? 0, (v) => {
            const next = [...values];
            next[i] = v;
            el.adjustments = next;
          }, { min: 0, step: 500 }))
        );
      });
    }
    g.appendChild(grid);
    return [g];
  },

  quickbar(el, h) {
    h.label("填充");
    h.color(el.fill?.color || "$primary", (v) => h.change(() => (el.fill = { type: "solid", color: v })));
    h.label("边框");
    h.color(el.border?.color || "$line", (v) => h.change(() => (el.border = { ...(el.border || {}), color: v })));
    h.select([["0", "无"], ["1", "细"], ["2", "中"], ["4", "粗"]], String(el.border?.width || 0), (v) =>
      h.change(() => {
        if (Number(v) === 0) el.border = null;
        else el.border = { ...(el.border || {}), width: Number(v) };
      })
    );
  },
});

function fillHex(fill) {
  if (typeof fill === "string") return fill;
  if (fill?.type === "solid") return fill.color;
  return "$primary";
}
