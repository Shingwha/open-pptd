// ============================================================================
// writer/chart/frame.js — chart element → in-slide graphicFrame (including the chartEx mc wrapper)
// ----------------------------------------------------------------------------

import { el, escAttr } from "../xml.js";
import { chartRouteOf } from "../../model/chart.js";
import { TINY_PNG } from "./types.js";

/** Chart element → in-slide graphicFrame (references the chart part; media/parts are gathered by pptx.js).
 * heatmap/sankey image conversion (route image, caller passes imgRef) → p:pic (PNG placeholder +
 * svgBlip vector; PowerPoint 2016+/new WPS/LibreOffice show the vector, older versions the placeholder). */
export function chartXml(theme, chartEl, ctx, chartId, imgRef = null) {
  const [x, y, w, h] = chartEl.bounds;
  if (imgRef) {
    const frameId = ctx.nextId();
    const name = escAttr(chartEl.elementId);
    const xfrm =
      el("a:xfrm", {}, [
        el("a:off", { x: Math.round(x * 12700), y: Math.round(y * 12700) }),
        el("a:ext", { cx: Math.round(w * 12700), cy: Math.round(h * 12700) }),
      ].join(""));
    return el("p:pic", {}, [
      el("p:nvPicPr", {}, [
        el("p:cNvPr", { id: frameId, name }),
        el("p:cNvPicPr", {}, el("a:picLocks", { noChangeAspect: "1" })),
        el("p:nvPr"),
      ]),
      el("p:blipFill", {}, [
        el("a:blip", { "r:embed": imgRef.pngId }, el("a:extLst", {}, el("a:ext", { uri: "{96DAC541-7B7A-43D3-8B79-37D633B846F1}" }, el("asvg:svgBlip", {
          "r:embed": imgRef.svgId,
          "xmlns:asvg": "http://schemas.microsoft.com/office/drawing/2016/SVG/main",
        })))),
        el("a:stretch", {}, el("a:fillRect")),
      ].join("")),
      el("p:spPr", {}, xfrm + el("a:prstGeom", { prst: "rect" }, el("a:avLst"))),
    ].join(""));
  }
  // chartEx detection single source chartRouteOf (model CHART_META.route)
  const isChartEx = chartRouteOf(chartEl) === "chartex";
  const rId = ctx.chartRef ? ctx.chartRef(chartId, isChartEx ? "chartEx" : "chart") : "rIdChart1";
  const uri = isChartEx
    ? "http://schemas.microsoft.com/office/drawing/2014/chartex"
    : "http://schemas.openxmlformats.org/drawingml/2006/chart";
  const inner = isChartEx
    ? el("cx:chart", { "r:id": rId, "xmlns:cx": "http://schemas.microsoft.com/office/drawing/2014/chartex", "xmlns:r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships" })
    : el("c:chart", { "r:id": rId, "xmlns:c": "http://schemas.openxmlformats.org/drawingml/2006/chart" });
  const frameId = ctx.nextId();
  const name = escAttr(chartEl.elementId);
  // graphicFrame's p:xfrm holds off/ext directly (only a pic's spPr needs the a:xfrm wrapper —
  // double-wrapping is invalid and PowerPoint ignores the transform, leaving a zero-size invisible chart)
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
  // chartEx (PowerPoint 2016+ charts): official structure = an mc:AlternateContent wrapper with
  // Choice Requires="cx4" (the 2016/5/10 chartex namespace) + a Fallback preview image. Missing
  // Fallback violates the mc spec (which requires Choice + Fallback); the Fallback uses a 1×1
  // transparent PNG placeholder (a chart screenshot cannot be generated).
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
