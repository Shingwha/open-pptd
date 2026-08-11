// ============================================================================
// types/image.js — 图片元素类型注册（含本地文件选择）
// ============================================================================

import { registerType } from "./registry.js";
import { nextElementId } from "../core/model.js";
import { renderImage } from "../renderer/image.js";
import { imageXml } from "../writer/image.js";
import { svgIcon } from "../ui.js";
import { PRESET_SHAPES } from "../core/preset-geometry.data.js";
import { SUPPORTED_SHAPES } from "../core/model.js";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif"];

/**
 * 本地图片选择（仅浏览器；Node 下不会被调用）。
 * @param {{addElement: Function, rebuildImageMap: Function}} api
 */
function pickLocalImage(api) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".png,.jpg,.jpeg,.gif";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    // PPT 导出只支持 PNG/JPEG/GIF（SVG/WebP 会损坏文件）
    if (!IMAGE_TYPES.includes(file.type)) {
      alert("仅支持 PNG / JPG / GIF 图片（PPT 兼容格式）");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      api.addElement({
        elementId: nextElementId("image"),
        elementType: "image",
        src: reader.result,
        bounds: [330, 160, 300, 200],
        fit: { mode: "cover" },
      });
      api.rebuildImageMap();
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

registerType({
  type: "image",
  label: "图片",

  menu: {
    group: "基础",
    items: [
      {
        id: "image",
        label: "图片",
        desc: "从本地选择",
        icon: svgIcon(
          '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M5 17l5-4 3.5 3 3.5-4 2 2"/>'
        ),
        onClick: pickLocalImage,
      },
    ],
  },

  render: renderImage,
  toXml: imageXml,

  props(el, h) {
    const g = h.group("图片");
    g.appendChild(h.field("地址", h.textInput(el.src || "", (v) => (el.src = v))));
    g.appendChild(h.field("适配", h.selectInput([["cover", "裁剪填充"], ["contain", "完整显示"], ["fill", "拉伸"]], el.fit?.mode || "cover", (v) => ((el.fit ||= {}).mode = v))));
    // 裁剪（四边比例，0~1；正 = 向内裁，负 = 向外扩）
    const cropGrid = document.createElement("div");
    cropGrid.className = "prop-grid";
    const c = el.crop || {};
    const setCrop = (k) => (v) => {
      el.crop = { ...(el.crop || {}), [k]: Number(v) };
    };
    cropGrid.appendChild(h.field("左裁", h.numInput(c.left ?? 0, setCrop("left"), { min: -0.9, max: 0.9, step: 0.05 })));
    cropGrid.appendChild(h.field("右裁", h.numInput(c.right ?? 0, setCrop("right"), { min: -0.9, max: 0.9, step: 0.05 })));
    cropGrid.appendChild(h.field("上裁", h.numInput(c.top ?? 0, setCrop("top"), { min: -0.9, max: 0.9, step: 0.05 })));
    cropGrid.appendChild(h.field("下裁", h.numInput(c.bottom ?? 0, setCrop("bottom"), { min: -0.9, max: 0.9, step: 0.05 })));
    g.appendChild(cropGrid);
    // 形状裁剪（cropShape：ShapeDef，与形状组件字段一一对应）
    const cs = el.cropShape || {};
    g.appendChild(h.field("裁剪形状", h.selectInput(
      [["rect", "无（矩形）"], ...Object.entries(SUPPORTED_SHAPES).map(([k, v]) => [k, v.label]), ["custom", "自定义路径"]],
      cs.shapeName || "rect",
      (v) => {
        if (v === "rect") el.cropShape = null;
        else el.cropShape = { ...cs, shapeName: v };
      }
    )));
    if (cs.shapeName && cs.shapeName !== "rect") {
      const csGrid = document.createElement("div");
      csGrid.className = "prop-grid";
      if (cs.shapeName === "custom") {
        csGrid.appendChild(h.field("viewBox", h.textInput((cs.viewBox || []).join(","), (v) => {
          const parts = v.split(",").map(Number);
          if (parts.length === 2 && parts.every(Number.isFinite)) el.cropShape = { ...cs, viewBox: parts };
        })));
        csGrid.appendChild(h.field("路径", h.textInput(cs.path || "", (v) => (el.cropShape = { ...cs, path: v }))));
      } else {
        const names = PRESET_SHAPES[cs.shapeName]?.adjNames || [];
        const values = cs.adjustments || SUPPORTED_SHAPES[cs.shapeName]?.adjustments || [];
        names.forEach((name, i) => {
          csGrid.appendChild(h.field(name, h.numInput(values[i] ?? 0, (v) => {
            const next = [...values];
            next[i] = v;
            el.cropShape = { ...cs, adjustments: next };
          }, { min: 0, step: 500 })));
        });
      }
      g.appendChild(csGrid);
    }
    return [g];
  },

  quickbar(el, h) {
    h.label("适配");
    h.select([["cover", "裁剪填充"], ["contain", "完整显示"], ["fill", "拉伸"]], el.fit?.mode || "cover", (v) =>
      h.change(() => (el.fit = { mode: v }))
    );
  },
});
