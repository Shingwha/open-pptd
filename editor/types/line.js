// editor/types/line.js — line element UI boundary (straight / arrow / dashed arrow)
// A line ships explicit viewBox/points/border/arrow fields; the variant only swaps the
// dashed border style and the end arrowhead. Transform/delete/copy come from the canvas.

import { svgIcon } from "../ui.js";
import { nextElementId, registerType } from "../../packages/model/index.js";

const LINE_ICON = '<path d="M5 18L19 6"/>';

/** Add-menu variants, in menu order. */
const LINE_VARIANTS = [
  { id: "line", label: "直线", hint: "两端无箭头", icon: svgIcon(LINE_ICON) },
  { id: "arrow", label: "箭头线", hint: "终点箭头", icon: svgIcon(LINE_ICON + '<path d="M14 6h5v5"/>') },
  {
    id: "dash",
    label: "虚线箭头",
    hint: "虚线 + 终点箭头",
    icon: svgIcon(LINE_ICON + '<path d="M14 6h5v5" stroke-dasharray="2 2"/>'),
  },
];

const VARIANT_IDS = new Set(LINE_VARIANTS.map((v) => v.id));

/** Default line model: 560×40 box, a centered two-point line at 2px theme primary. */
function createLine(variant) {
  const id = VARIANT_IDS.has(variant) ? variant : "line";
  return {
    elementId: nextElementId("line"),
    elementType: "line",
    bounds: [180, 300, 560, 40],
    viewBox: [560, 40],
    points: "10,20 550,20",
    border: { style: id === "dash" ? "dash" : "solid", width: 2, color: "$primary" },
    arrow: id === "line" ? null : [null, "arrow"],
  };
}

registerType({
  type: "line",
  label: "线条",
  addIcon: svgIcon(LINE_ICON),
  addHint: "直线 / 箭头 / 虚线箭头",
  create: createLine,
  addVariants: () => LINE_VARIANTS,
});
