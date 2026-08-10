// ============================================================================
// types/shape.js — 形状元素类型注册（基础 5 种 + ECMA-376 预置几何 21 种）
// ----------------------------------------------------------------------------
// 菜单分组：形状（多边形/符号类）与箭头（箭头类）；新形状缩略图由
// preset-geometry 求值器按 24×24 实时生成，与画布/导出几何同源。
// ============================================================================

import { registerType } from "./registry.js";
import { nextElementId, SUPPORTED_SHAPES } from "../core/model.js";
import { PRESET_SHAPES } from "../core/preset-geometry.data.js";
import { shapeMenuIcon } from "../core/preset-geometry.js";
import { renderShape } from "../renderer/shape.js";
import { shapeXml } from "../writer/shape.js";
import { svgIcon } from "../ui.js";

/** 形状默认模型（adjustments 对齐 SUPPORTED_SHAPES/PRESET_SHAPES）。 */
function shapeItem(name, label, icon, adjustments, group) {
  return {
    id: name,
    label,
    icon,
    group,
    create: () => ({
      elementId: nextElementId("shape"),
      elementType: "shape",
      shapeName: name,
      bounds: [380, 200, 160, 110],
      adjustments: adjustments ?? null,
      fill: { type: "solid", color: "$primary" },
    }),
  };
}

/** 菜单缩略图：预置几何形状用求值器生成（描边风，与 svgIcon 风格一致）。 */
function presetThumb(name) {
  return shapeMenuIcon(name);
}

// 调整值中文名（属性面板用；未列出的回退原名）
const ADJ_LABELS = {
  adj: "调整",
  adj1: "调整 1",
  adj2: "调整 2",
  adj3: "调整 3",
  hf: "水平比例",
  vf: "垂直比例",
};

/** 形状的调整名（预置几何按规范 adjNames，基础形状按索引）。 */
function adjNamesFor(shapeName, adjustments) {
  if (PRESET_SHAPES[shapeName]?.adjNames?.length) return PRESET_SHAPES[shapeName].adjNames;
  return (adjustments || []).map((_, i) => (i === 0 ? "adj" : `adj${i}`));
}

registerType({
  type: "shape",
  label: "形状",

  menu: {
    group: "形状",
    items: [
      shapeItem("rect", "矩形", svgIcon('<rect x="4" y="5" width="16" height="14" rx="1"/>')),
      shapeItem("roundRect", "圆角矩形", svgIcon('<rect x="4" y="5" width="16" height="14" rx="4"/>'), [16667]),
      shapeItem("ellipse", "椭圆", svgIcon('<ellipse cx="12" cy="12" rx="8" ry="6"/>')),
      shapeItem("triangle", "三角形", svgIcon('<path d="M12 5l8 14H4z"/>'), [50000]),
      shapeItem("diamond", "菱形", svgIcon('<path d="M12 4l8 8-8 8-8-8z"/>')),
      // ---- 预置几何：多边形/符号 ----
      shapeItem("pentagon", "五边形", presetThumb("pentagon")),
      shapeItem("hexagon", "六边形", presetThumb("hexagon")),
      shapeItem("octagon", "八边形", presetThumb("octagon")),
      shapeItem("parallelogram", "平行四边形", presetThumb("parallelogram")),
      shapeItem("trapezoid", "梯形", presetThumb("trapezoid")),
      shapeItem("homePlate", "本垒板", presetThumb("homePlate")),
      shapeItem("heart", "心形", presetThumb("heart")),
      shapeItem("lightningBolt", "闪电", presetThumb("lightningBolt")),
      shapeItem("plus", "加号", presetThumb("plus")),
      shapeItem("mathMinus", "减号", presetThumb("mathMinus")),
      shapeItem("star4", "四角星", presetThumb("star4")),
      shapeItem("star5", "五角星", presetThumb("star5")),
      shapeItem("star8", "八角星", presetThumb("star8")),
      // ---- 箭头 ----
      shapeItem("chevron", "燕尾箭头", presetThumb("chevron"), null, "箭头"),
      shapeItem("rightArrow", "右箭头", presetThumb("rightArrow"), null, "箭头"),
      shapeItem("leftArrow", "左箭头", presetThumb("leftArrow"), null, "箭头"),
      shapeItem("upArrow", "上箭头", presetThumb("upArrow"), null, "箭头"),
      shapeItem("downArrow", "下箭头", presetThumb("downArrow"), null, "箭头"),
      shapeItem("leftRightArrow", "左右箭头", presetThumb("leftRightArrow"), null, "箭头"),
      shapeItem("upDownArrow", "上下箭头", presetThumb("upDownArrow"), null, "箭头"),
      shapeItem("quadArrow", "四向箭头", presetThumb("quadArrow"), null, "箭头"),
    ],
  },

  render: renderShape,
  toXml: shapeXml,

  props(el, h) {
    const g = h.group("形状");
    const options = Object.entries(SUPPORTED_SHAPES).map(([k, v]) => [k, v.label]);
    g.appendChild(h.field("类型", h.selectInput(options, el.shapeName, (v) => { el.shapeName = v; })));
    const grid = document.createElement("div");
    grid.className = "prop-grid";
    grid.appendChild(h.field("填充", h.colorInput(fillHex(el.fill), (v) => (el.fill = { type: "solid", color: v }))));
    grid.appendChild(h.field("边框", h.colorInput(el.border?.color || "$line", (v) => ((el.border ||= {}).color = v))));
    grid.appendChild(h.field("边宽", h.numInput(el.border?.width || 0, (v) => ((el.border ||= {}).width = v), { min: 0 })));
    // 调整值（圆角/缺口/星形比例等）：预置几何形状 + roundRect/triangle
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
