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
    return [{
      title: "线条",
      fields: [
        { kind: "num", label: "宽度", min: 0,
          get: () => el.border?.width || 1,
          set: (v) => ((el.border ||= {}).width = v) },
        { kind: "select", label: "线型", options: [["solid", "实线"], ["dash", "虚线"], ["dot", "点线"]],
          get: () => el.border?.style || "solid",
          set: (v) => ((el.border ||= {}).style = v) },
        { kind: "select", label: "曲线", options: [["sharp", "直线段"], ["round", "圆角连接"], ["smooth", "贝塞尔"]],
          get: () => el.curve || "round",
          set: (v) => (el.curve = v) },
        { kind: "color", label: "颜色",
          get: () => el.border?.color || "#000000",
          set: (v) => ((el.border ||= {}).color = v) },
        { kind: "checks", items: [
          { label: "终点箭头", get: () => !!el.arrow?.[1], set: (v) => { el.arrow = [el.arrow?.[0] || null, v ? "arrow" : null]; } },
          { label: "起点箭头", get: () => !!el.arrow?.[0], set: (v) => { el.arrow = [v ? "arrow" : null, el.arrow?.[1] || null]; } },
        ] },
      ],
    }];
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
