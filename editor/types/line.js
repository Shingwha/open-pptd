// ============================================================================
// types/line.js — 线条元素类型注册
// ============================================================================

import { registerType } from "./registry.js";
import { nextElementId } from "../core/model.js";
import { renderLine } from "../renderer/line.js";
import { lineXml } from "../writer/line.js";
import { svgIcon } from "../ui.js";

registerType({
  type: "line",
  label: "线条",

  menu: {
    group: "基础",
    items: [
      {
        id: "line",
        label: "线条",
        desc: "直线 / 箭头",
        icon: svgIcon('<path d="M5 18L19 6"/><path d="M14 6h5v5"/>'),
        create: () => ({
          elementId: nextElementId("line"),
          elementType: "line",
          bounds: [180, 300, 560, 40],
          viewBox: [560, 40],
          points: "10,20 550,20",
          border: { style: "solid", width: 2, color: "$primary" },
          arrow: [null, "arrow"],
        }),
      },
    ],
  },

  render: renderLine,
  toXml: lineXml,

  props(el, h) {
    const g = h.group("线条");
    const grid = document.createElement("div");
    grid.className = "prop-grid";
    grid.appendChild(h.field("颜色", h.colorInput(el.border?.color || "#000000", (v) => ((el.border ||= {}).color = v))));
    grid.appendChild(h.field("宽度", h.numInput(el.border?.width || 1, (v) => ((el.border ||= {}).width = v), { min: 0 })));
    grid.appendChild(h.field("线型", h.selectInput([["solid", "实线"], ["dash", "虚线"], ["dot", "点线"]], el.border?.style || "solid", (v) => ((el.border ||= {}).style = v))));
    grid.appendChild(h.field("曲线", h.selectInput([["sharp", "直线段"], ["round", "圆角连接"], ["smooth", "贝塞尔"]] , el.curve || "round", (v) => (el.curve = v))));
    const checks = document.createElement("div");
    checks.className = "prop-checks";
    checks.append(
      h.checkbox("终点箭头", !!el.arrow?.[1], (v) => { el.arrow = [el.arrow?.[0] || null, v ? "arrow" : null]; }),
      h.checkbox("起点箭头", !!el.arrow?.[0], (v) => { el.arrow = [v ? "arrow" : null, el.arrow?.[1] || null]; })
    );
    grid.appendChild(checks);
    g.appendChild(grid);
    return [g];
  },

  quickbar(el, h) {
    h.label("线宽");
    h.select([[1, "1px"], [2, "2px"], [3, "3px"], [4, "4px"], [6, "6px"]], String(el.border?.width || 2), (v) =>
      h.change(() => (el.border = { ...(el.border || {}), width: Number(v) }))
    );
    h.label("颜色");
    h.color(el.border?.color || "$text", (v) => h.change(() => (el.border = { ...(el.border || {}), color: v })));
    h.label("箭头");
    h.select([["none", "无箭头"], ["arrow", "箭头"], ["dot", "圆点"]], el.arrow?.[1] || "none", (v) =>
      h.change(() => (el.arrow = [null, v === "none" ? null : v]))
    );
  },
});
