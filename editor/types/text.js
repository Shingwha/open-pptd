// ============================================================================
// types/text.js — 文字元素类型注册（渲染/导出/属性/快速条/菜单）
// ============================================================================

import { registerType } from "./registry.js";
import { nextElementId } from "../core/model.js";
import { richTextPlainText } from "../core/richtext.js";
import { renderText } from "../renderer/text.js";
import { textXml } from "../writer/text.js";
import { svgIcon } from "../ui.js";

const FONT_SIZE_OPTIONS = ["", 12, 14, 16, 18, 20, 24, 28, 32, 40, 48];
const ALIGN_OPTIONS = [["left", "左对齐"], ["center", "居中"], ["right", "右对齐"]];
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
        desc: "双击编辑内容",
        icon: svgIcon('<path d="M5 5h14M12 5v14M9 19h6"/>'),
        create: () => ({
          elementId: nextElementId("text"),
          elementType: "text",
          bounds: [340, 220, 280, 60],
          content: { text: "双击编辑文字", fontSize: 20, align: ["center", "middle"] },
        }),
      },
    ],
  },

  render: renderText,
  toXml: textXml,

  props(el, h) {
    const g = h.group("文字");
    // 内容：纯文本编辑，textarea 高度跟随文字数量（样式由下方控件控制）
    const ta = h.textInput(richTextPlainText(el.content?.text || ""), (v) => {
      if (!el.content) el.content = {};
      el.content.text = v;
    }, { rows: 2, placeholder: "输入文字内容…" });
    g.appendChild(h.field("内容", ta));

    g.appendChild(h.field("样式", h.selectInput(STYLE_OPTIONS, el.content?.style || "", (v) => {
      if (!el.content) el.content = {};
      if (v) el.content.style = v;
      else delete el.content.style;
    })));

    const grid = document.createElement("div");
    grid.className = "prop-grid";
    grid.appendChild(h.field("字号", h.numInput(el.content?.fontSize || 18, (v) => ((el.content ||= {}).fontSize = v), { min: 6 })));
    grid.appendChild(h.field("颜色", h.colorInput(el.content?.color || "$text", (v) => ((el.content ||= {}).color = v))));
    grid.appendChild(h.field("字体", h.selectInput(h.fontOptions(), el.content?.fontFamily || "", (v) => {
      if (!el.content) el.content = {};
      if (v) el.content.fontFamily = v;
      else delete el.content.fontFamily;
    })));
    grid.appendChild(h.field("行距", h.numInput(el.content?.lineHeight || 1.25, (v) => ((el.content ||= {}).lineHeight = v), { min: 0.5, step: 0.05 })));
    grid.appendChild(h.field("对齐", h.selectInput(ALIGN_OPTIONS, Array.isArray(el.content?.align) ? el.content.align[0] : "left", (v) => {
      (el.content ||= {}).align = [v, Array.isArray(el.content.align) ? el.content.align[1] : "middle"];
    })));
    grid.appendChild(h.field("垂直", h.selectInput(VALIGN_OPTIONS, Array.isArray(el.content?.align) ? el.content.align[1] : "middle", (v) => {
      (el.content ||= {}).align = [Array.isArray(el.content.align) ? el.content.align[0] : "left", v];
    })));
    const checks = document.createElement("div");
    checks.className = "prop-checks";
    checks.append(
      h.checkbox("粗体", !!el.content?.bold, (v) => ((el.content ||= {}).bold = v)),
      h.checkbox("斜体", !!el.content?.italic, (v) => ((el.content ||= {}).italic = v)),
      h.checkbox("下划线", !!el.content?.underline, (v) => ((el.content ||= {}).underline = v))
    );
    grid.appendChild(checks);
    g.appendChild(grid);
    return [g];
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
    h.select(FONT_SIZE_OPTIONS.map((n) => [String(n || ""), n ? `${n}px` : "默认"]), String(c.fontSize || ""), (v) =>
      h.change(() => {
        el.content.fontSize = v ? Number(v) : null;
      })
    );
    h.label("样式");
    h.btn("B", "加粗", () => h.change(() => (el.content.bold = !el.content.bold)), c.bold);
    h.btn("I", "斜体", () => h.change(() => (el.content.italic = !el.content.italic)), c.italic);
    h.btn("U", "下划线", () => h.change(() => (el.content.underline = !el.content.underline)), c.underline);
    h.label("对齐");
    h.select(ALIGN_OPTIONS, Array.isArray(c.align) ? c.align[0] : "left", (v) =>
      h.change(() => {
        // 垂直对齐缺省与属性面板/渲染/导出一致（middle），避免快速条调水平对齐时把垂直悄悄写成 top
        el.content.align = [v, c.align?.[1] || "middle"];
      })
    );
    h.label("颜色");
    h.color(c.color || "$text", (v) => h.change(() => (el.content.color = v)));
  },
});
