// ============================================================================
// types/image.js — 图片元素类型注册（含本地文件选择）
// ============================================================================

import { registerType } from "./registry.js";
import { nextElementId } from "../core/model.js";
import { renderImage } from "../renderer/image.js";
import { imageXml } from "../writer/image.js";
import { svgIcon } from "../ui.js";

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
    return [g];
  },

  quickbar(el, h) {
    h.label("适配");
    h.select([["cover", "裁剪填充"], ["contain", "完整显示"]], el.fit?.mode || "cover", (v) =>
      h.change(() => (el.fit = { mode: v }))
    );
  },
});
