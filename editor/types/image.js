// ============================================================================
// types/image.js — image element type registration (with local file picking)
// ============================================================================

import { svgIcon } from "../ui.js";
import { dialogs } from "../dialogs.js";
import { PRESET_SHAPES, SUPPORTED_SHAPES, nextElementId, registerType } from "../../packages/model/index.js";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif"];

/**
 * Local image picking (browser only; never called under Node).
 * @param {{addElement: Function, rebuildImageMap: Function}} api
 */
function pickLocalImage(api) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".png,.jpg,.jpeg,.gif";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    // PPT export supports PNG/JPEG/GIF only (SVG/WebP corrupt the file)
    if (!IMAGE_TYPES.includes(file.type)) {
      dialogs.alert("仅支持 PNG / JPG / GIF 图片（PPT 兼容格式）");
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

  props(el, h) {
    const fields = [
      { kind: "text", label: "地址",
        get: () => el.src || "",
        set: (v) => (el.src = v) },
      { kind: "select", label: "适配", options: [["cover", "裁剪填充"], ["contain", "完整显示"], ["fill", "拉伸"]],
        get: () => el.fit?.mode || "cover",
        set: (v) => ((el.fit ||= {}).mode = v) },
      // Crop (ratio per side, 0~1; positive = crop inward, negative = expand outward)
      { kind: "num", label: "左裁", min: -0.9, max: 0.9, step: 0.05,
        get: () => el.crop?.left ?? 0,
        set: (v) => { el.crop = { ...(el.crop || {}), left: Number(v) }; } },
      { kind: "num", label: "右裁", min: -0.9, max: 0.9, step: 0.05,
        get: () => el.crop?.right ?? 0,
        set: (v) => { el.crop = { ...(el.crop || {}), right: Number(v) }; } },
      { kind: "num", label: "上裁", min: -0.9, max: 0.9, step: 0.05,
        get: () => el.crop?.top ?? 0,
        set: (v) => { el.crop = { ...(el.crop || {}), top: Number(v) }; } },
      { kind: "num", label: "下裁", min: -0.9, max: 0.9, step: 0.05,
        get: () => el.crop?.bottom ?? 0,
        set: (v) => { el.crop = { ...(el.crop || {}), bottom: Number(v) }; } },
    ];
    // Shape crop (cropShape: ShapeDef, mirroring the shape component's fields)
    const cs = el.cropShape || {};
    fields.push({
      kind: "select", label: "裁剪形状",
      options: [["rect", "无（矩形）"], ...Object.entries(SUPPORTED_SHAPES).map(([k, v]) => [k, v.label]), ["custom", "自定义路径"]],
      get: () => cs.shapeName || "rect",
      set: (v) => {
        if (v === "rect") el.cropShape = null;
        else el.cropShape = { ...cs, shapeName: v };
      },
    });
    if (cs.shapeName && cs.shapeName !== "rect") {
      if (cs.shapeName === "custom") {
        fields.push(
          { kind: "text", label: "viewBox",
            get: () => (cs.viewBox || []).join(","),
            set: (v) => {
              const parts = v.split(",").map(Number);
              if (parts.length === 2 && parts.every(Number.isFinite)) el.cropShape = { ...cs, viewBox: parts };
            } },
          { kind: "text", label: "路径",
            get: () => cs.path || "",
            set: (v) => (el.cropShape = { ...cs, path: v }) }
        );
      } else {
        const names = PRESET_SHAPES[cs.shapeName]?.adjNames || [];
        const values = cs.adjustments || SUPPORTED_SHAPES[cs.shapeName]?.adjustments || [];
        names.forEach((name, i) => {
          fields.push({
            kind: "num", label: name, min: 0, step: 500,
            get: () => values[i] ?? 0,
            set: (v) => {
              const next = [...values];
              next[i] = v;
              el.cropShape = { ...cs, adjustments: next };
            },
          });
        });
      }
    }
    return [{ title: "图片", fields }];
  },

  quickbar(el, h) {
    h.label("适配");
    h.select([["cover", "裁剪填充"], ["contain", "完整显示"], ["fill", "拉伸"]], el.fit?.mode || "cover", (v) =>
      h.change(() => (el.fit = { mode: v }))
    );
  },
});
