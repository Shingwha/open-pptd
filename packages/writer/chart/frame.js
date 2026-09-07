// ============================================================================
// writer/chart/frame.js — 图表元素 → slide 内 graphicFrame（含 chartEx mc 包装）
// ----------------------------------------------------------------------------

import { el, escAttr } from "../xml.js";
import { CHARTEX_TYPES, TINY_PNG } from "./types.js";

/** 图表元素 → slide 内 graphicFrame（引用 chart part，媒体/部件由 pptx.js 汇总）。 */
export function chartXml(theme, chartEl, ctx, chartId) {
  const [x, y, w, h] = chartEl.bounds;
  const isChartEx = CHARTEX_TYPES.includes(chartEl.series?.[0]?.type);
  const rId = ctx.chartRef ? ctx.chartRef(chartId, isChartEx ? "chartEx" : "chart") : "rIdChart1";
  const uri = isChartEx
    ? "http://schemas.microsoft.com/office/drawing/2014/chartex"
    : "http://schemas.openxmlformats.org/drawingml/2006/chart";
  const inner = isChartEx
    ? el("cx:chart", { "r:id": rId, "xmlns:cx": "http://schemas.microsoft.com/office/drawing/2014/chartex", "xmlns:r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships" })
    : el("c:chart", { "r:id": rId, "xmlns:c": "http://schemas.openxmlformats.org/drawingml/2006/chart" });
  const frameId = ctx.nextId();
  const name = escAttr(chartEl.elementId);
  const xfrm =
    el("a:off", { x: Math.round(x * 12700), y: Math.round(y * 12700) }) +
    el("a:ext", { cx: Math.round(w * 12700), cy: Math.round(h * 12700) });
  const graphicFrame = el("p:graphicFrame", {}, [
    el("p:nvGraphicFramePr", {}, [
      el("p:cNvPr", { id: frameId, name }),
      el("p:cNvGraphicFramePr", {}, el("a:graphicFrameLocks", { noGrp: "1" })),
      el("p:nvPr"),
    ]),
    el("p:xfrm", {}, xfrm),
    el("a:graphic", {}, el("a:graphicData", { uri }, inner)),
  ].join(""));
  if (!isChartEx) return graphicFrame;
  // chartEx（PowerPoint 2016+ 新图表）：官方结构 = mc:AlternateContent 包裹，
  // Choice Requires="cx4"（2016/5/10 chartex 命名空间）+ Fallback 预览图
  // （对照用户 waterfall-color.pptx 实测）。缺 Fallback 违反 mc 规范（必含
  // Choice + Fallback），Fallback 用 1×1 透明 PNG 占位（生成不了图表截图）。
  const media = ctx.addMedia(TINY_PNG, "png");
  const fallbackPic = el("p:pic", {}, [
    el("p:nvPicPr", {}, [
      el("p:cNvPr", { id: frameId, name }),
      el("p:cNvPicPr", {}, el("a:picLocks", {
        noGrp: "1", noRot: "1", noChangeAspect: "1", noMove: "1", noResize: "1",
        noEditPoints: "1", noAdjustHandles: "1", noChangeShapeType: "1",
      })),
      el("p:nvPr"),
    ]),
    el("p:blipFill", {}, el("a:blip", { "r:embed": media.id }) + el("a:stretch", {}, el("a:fillRect"))),
    el("p:spPr", {}, xfrm + el("a:prstGeom", { prst: "rect" }, el("a:avLst"))),
  ].join(""));
  return el("mc:AlternateContent", {
    "xmlns:mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
    "xmlns:cx4": "http://schemas.microsoft.com/office/drawing/2016/5/10/chartex",
  }, el("mc:Choice", { Requires: "cx4" }, graphicFrame) + el("mc:Fallback", {}, fallbackPic));
}
