// ============================================================================
// types/formula.js — 公式元素类型注册（渲染/导出/属性/菜单）
// ----------------------------------------------------------------------------
// PPTD 写法：
//   - elementId: f1
//     elementType: formula
//     bounds: [48, 130, 400, 60]
//     latex: "x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}"   # LaTeX 公式（必填）
//     fontSize: 16        # 可选，默认 16pt
//     color: "#E53935"    # 可选，公式颜色
//     align: left         # 可选 left/center/right
// ============================================================================

import { registerType } from "./registry.js";
import { nextElementId } from "../core/model.js";
import { renderFormula } from "../renderer/formula.js";
import { formulaXml } from "../writer/formula.js";
import { svgIcon } from "../ui.js";

registerType({
  type: "formula",
  label: "公式",

  menu: {
    group: "基础",
    items: [
      {
        id: "formula",
        label: "公式",
        desc: "LaTeX 数学公式（导出为可编辑公式）",
        icon: svgIcon('<path d="M4 8l4-4 4 4M8 4v10M12 8l4-4 4 4"/>'),
        create: () => ({
          elementId: nextElementId("formula"),
          elementType: "formula",
          bounds: [280, 220, 400, 60],
          latex: "E = mc^2",
          fontSize: 16,
          align: "left",
        }),
      },
    ],
  },

  render: renderFormula,
  toXml: formulaXml,

  props(el, h) {
    const g = h.group("公式");
    // LaTeX 源
    const ta = h.textInput(el.latex || "", (v) => {
      el.latex = v;
    }, { rows: 4, placeholder: "输入 LaTeX，如：\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}" });
    g.appendChild(h.field("LaTeX", ta));
    // 字号
    const sizeSel = h.select(
      ["", 12, 14, 16, 20, 24, 32, 40].map((v) => [String(v), v ? `${v}pt` : "默认 16pt"]),
      el.fontSize || "",
      (v) => { el.fontSize = v ? Number(v) : 16; }
    );
    g.appendChild(h.field("字号", sizeSel));
    // 对齐
    const alignSel = h.select(
      [["left", "左对齐"], ["center", "居中"], ["right", "右对齐"]],
      el.align || "left",
      (v) => { el.align = v; }
    );
    g.appendChild(h.field("对齐", alignSel));
    // 颜色
    const colorInput = h.colorInput(el.color || "#000000", (v) => {
      el.color = v === "#000000" ? null : v;
    });
    g.appendChild(h.field("颜色", colorInput));
    const tip = document.createElement("div");
    tip.className = "prop-hint";
    tip.textContent = "导出为 PowerPoint 原生可编辑公式（双击可改）；预览使用浏览器原生 MathML 渲染";
    g.appendChild(tip);
    return g;
  },
});
