// ============================================================================
// types/text.js — 文字元素类型注册（渲染/导出/属性/快速条/菜单）
// ============================================================================

import { registerType } from "./registry.js";
import { nextElementId } from "../core/model.js";
import { renderText } from "../renderer/text.js";
import { textXml } from "../writer/text.js";
import { svgIcon } from "../ui.js";

const FONT_SIZE_OPTIONS = ["", 12, 14, 16, 18, 20, 24, 28, 32, 40, 48];
const ALIGN_OPTIONS = [
  ["left", "左对齐"], ["center", "居中"], ["right", "右对齐"],
  ["justify", "两端对齐"], ["distributed", "分散对齐"],
];
const VALIGN_OPTIONS = [["top", "顶部"], ["middle", "居中"], ["bottom", "底部"]];
const STYLE_OPTIONS = [
  ["", "默认"],
  ["$title", "$title 标题"],
  ["$subtitle", "$subtitle 副标题"],
  ["$body", "$body 正文"],
  ["$caption", "$caption 注释"],
  ["$quote", "$quote 引用"],
];

registerType({
  type: "text",
  label: "文字",

  menu: {
    group: "基础",
    items: [
      {
        id: "text",
        label: "文字",
        desc: "双击编辑内容（支持富文本与 \(公式\)）",
        icon: svgIcon('<path d="M5 5h14M12 5v14M9 19h6"/>'),
        create: () => ({
          elementId: nextElementId("text"),
          elementType: "text",
          bounds: [340, 220, 280, 60],
          content: { text: "双击编辑文字", align: ["center", "middle"] },
        }),
      },
    ],
  },

  render: renderText,
  toXml: textXml,

  props(el, h) {
    return [{
      title: "文字",
      fields: [
        // 内容：富文本 DSL 源码编辑（保留 <p>/<span> 标签与 \(...\) 公式，精确往返）
        { kind: "textarea", label: "内容", rows: 4,
          get: () => el.content?.text || "",
          set: (v) => { if (!el.content) el.content = {}; el.content.text = v; },
          placeholder: "文本内容… 支持 <p>/<strong>/<u> 标签与 \\(LaTeX\\) 公式" },
        { kind: "select", label: "样式", options: STYLE_OPTIONS,
          get: () => el.content?.style || "",
          set: (v) => { if (!el.content) el.content = {}; if (v) el.content.style = v; else delete el.content.style; } },
        { kind: "select", label: "字体", options: h.fontOptions(),
          get: () => el.content?.fontFamily || "",
          set: (v) => { if (!el.content) el.content = {}; if (v) el.content.fontFamily = v; else delete el.content.fontFamily; } },
        { kind: "num", label: "字号", min: 6,
          get: () => el.content?.fontSize || 18,
          set: (v) => ((el.content ||= {}).fontSize = v) },
        { kind: "num", label: "行距", min: 0.5, step: 0.05,
          get: () => el.content?.lineHeight || 1,
          set: (v) => ((el.content ||= {}).lineHeight = v) },
        { kind: "num", label: "字距", step: 0.5,
          get: () => el.content?.letterSpacing ?? 0,
          set: (v) => { if (!el.content) el.content = {}; if (v) el.content.letterSpacing = v; else delete el.content.letterSpacing; } },
        { kind: "num", label: "段前距", min: 0, step: 2,
          get: () => el.content?.marginTop ?? 0,
          set: (v) => { if (!el.content) el.content = {}; if (v) el.content.marginTop = v; else delete el.content.marginTop; } },
        { kind: "color", label: "颜色",
          get: () => el.content?.color || "$text",
          set: (v) => ((el.content ||= {}).color = v) },
        { kind: "color", label: "高亮",
          get: () => el.content?.backgroundColor || "",
          set: (v) => { if (!el.content) el.content = {}; if (v) el.content.backgroundColor = v; else delete el.content.backgroundColor; } },
        { kind: "select", label: "对齐", options: ALIGN_OPTIONS,
          get: () => (Array.isArray(el.content?.align) ? el.content.align[0] : "left"),
          set: (v) => { (el.content ||= {}).align = [v, Array.isArray(el.content.align) ? el.content.align[1] : "top"]; } },
        { kind: "select", label: "垂直", options: VALIGN_OPTIONS,
          get: () => (Array.isArray(el.content?.align) ? el.content.align[1] : "top"),
          set: (v) => { (el.content ||= {}).align = [Array.isArray(el.content.align) ? el.content.align[0] : "left", v]; } },
        { kind: "select", label: "方向", options: [["horizontal", "横排"], ["vertical", "竖排"]],
          get: () => el.content?.textDirection || "horizontal",
          set: (v) => { if (!el.content) el.content = {}; if (v === "vertical") el.content.textDirection = v; else delete el.content.textDirection; } },
        { kind: "checks", items: [
          { label: "粗体", get: () => !!el.content?.bold, set: (v) => ((el.content ||= {}).bold = v) },
          { label: "斜体", get: () => !!el.content?.italic, set: (v) => ((el.content ||= {}).italic = v) },
          { label: "自动换行", get: () => el.content?.wrap !== false,
            set: (v) => { if (!el.content) el.content = {}; if (!v) el.content.wrap = false; else delete el.content.wrap; } },
        ] },
      ],
    }];
  },

  quickbar(el, h) {
    const c = el.content || {};
    h.label("字体");
    h.select(h.fontOptions(), c.fontFamily || "", (v) =>
      h.change(() => {
        if (v) el.content.fontFamily = v;
        else delete el.content.fontFamily;
      })
    );
    h.label("字号");
    h.select(FONT_SIZE_OPTIONS.map((n) => [String(n || ""), n ? `${n}px` : "默认 18px"]), String(c.fontSize || ""), (v) =>
      h.change(() => {
        el.content.fontSize = v ? Number(v) : null;
      })
    );
    h.label("样式");
    h.btn("B", "加粗", () => h.change(() => (el.content.bold = !el.content.bold)), c.bold);
    h.btn("I", "斜体", () => h.change(() => (el.content.italic = !el.content.italic)), c.italic);
    h.label("对齐");
    h.select(ALIGN_OPTIONS, Array.isArray(c.align) ? c.align[0] : "left", (v) =>
      h.change(() => {
        if (!el.content) el.content = {};
        // 垂直对齐缺省与官方一致（top），避免快速条调水平对齐时把垂直悄悄写成 middle
        el.content.align = [v, c.align?.[1] || "top"];
      })
    );
    h.label("颜色");
    h.color(c.color || "$text", (v) => h.change(() => (el.content.color = v)));
  },
});
