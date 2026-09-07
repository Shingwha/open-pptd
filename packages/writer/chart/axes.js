// ============================================================================
// writer/chart/axes.js — 轴 XML（官方 AxisConfig 全字段 → catAx/valAx；§5.3 轴数组规则）
// ----------------------------------------------------------------------------

import { el, esc, hexToRgbVal } from "../xml.js";
import { resolveColor } from "../../model/theme.js";
import { toAxisArray, seriesAxisIndex, CHART_DEFAULTS } from "../../model/chart.js";
import { txPrXml, srgbClrXml } from "./style.js";

/** LineStyleConfig | boolean → a:ln 元素（axisLine/gridLine 共用）。null = 不输出。 */
function axisLnXml(theme, cfg, fallbackColor, fallbackWidth = 0.75) {
  if (cfg === false) return null; // 调用方决定省略或 noFill
  const o = typeof cfg === "object" ? cfg : {};
  const color = o.color ? resolveColor(theme, o.color) : resolveColor(theme, fallbackColor) || "#6b7280";
  const kids = [el("a:solidFill", {}, srgbClrXml(color))];
  const dash = { dash: "dash", dot: "dot" }[o.style];
  if (dash) kids.push(el("a:prstDash", { val: dash }));
  // arrow（官方 axisLine.arrow → headEnd/tailEnd；CT_LineProperties 顺序 headEnd 在前）
  const arrow = typeof cfg === "object" ? cfg.arrow : null;
  const head = arrow === "start" || arrow === "both" || arrow === true ? "start" : null;
  const tail = arrow === "end" || arrow === "both" || arrow === true ? "end" : null;
  const arrowEl = (which) => el(`a:${which}End`, { type: "triangle", w: "med", len: "med" });
  if (head) kids.push(arrowEl("head"));
  if (tail) kids.push(arrowEl("tail"));
  return el("a:ln", { w: Math.round((o.width ?? fallbackWidth) * 12700), cap: "flat", cmpd: "sng", algn: "ctr" }, kids.join(""));
}

/** 轴标题（string | TitleConfig → c:title，schema 位置：axPos 之后）。 */
function axisTitleXml(theme, title) {
  const cfg = typeof title === "string" ? { text: title } : title || null;
  if (!cfg || !cfg.text) return "";
  const sz = cfg.fontSize ? Math.round(cfg.fontSize * 100) : 900;
  const kids = [el("a:bodyPr"), el("a:lstStyle")];
  const rPrKids = [];
  const col = cfg.color ? resolveColor(theme, cfg.color) : null;
  rPrKids.push(col ? el("a:solidFill", {}, el("a:srgbClr", { val: hexToRgbVal(col) })) : el("a:solidFill", {}, el("a:schemeClr", { val: "tx1" })));
  rPrKids.push(el("a:latin", { typeface: "+mn-lt" }), el("a:ea", { typeface: "+mn-ea" }));
  kids.push(
    el("a:p", {}, [
      el("a:pPr"),
      el("a:r", {}, [
        el("a:rPr", { lang: "zh-CN", sz }, rPrKids.join("")),
        el("a:t", {}, esc(cfg.text)),
      ].join("")),
    ].join(""))
  );
  return el("c:title", {}, [el("c:tx", {}, el("c:rich", {}, kids.join(""))), el("c:layout")].join(""));
}

/**
 * 单轴 XML（官方 AxisConfig 全字段）。
 * @param {object} p {theme, id, crossId, kind: "cat"|"val", pos, cfg, secondary, tickLabels, crosses}
 *   secondary: 次轴——类别轴 delete=1（数据不重复，仅用于配轴）；数值轴换侧
 */
function axisXml(theme, { id, crossId, kind, pos, cfg = {}, secondary = false, tickLabels = true, crosses = "autoZero" }) {
  const show = cfg.show !== false;
  const kids = [
    el("c:axId", { val: id }),
    // CT_Scaling 顺序：logBase → orientation → max → min
    el("c:scaling", {}, [
      cfg.reverse ? el("c:orientation", { val: "maxMin" }) : el("c:orientation", { val: "minMax" }),
      kind === "val" && cfg.max != null ? el("c:max", { val: cfg.max }) : "",
      kind === "val" && cfg.min != null ? el("c:min", { val: cfg.min }) : "",
    ].join("")),
    el("c:delete", { val: show && !secondary ? "0" : "1" }),
    el("c:axPos", { val: pos }),
    axisTitleXml(theme, cfg.title),
  ];
  // majorGridlines（数值轴；gridLine: false → 不输出）
  const gridCfg = kind === "val" ? cfg.gridLine : null;
  if (kind === "val" && gridCfg !== false) {
    const ln = axisLnXml(theme, gridCfg, theme.colors?.line || "#e5e7eb", 0.5);
    kids.push(el("c:majorGridlines", {}, ln ? el("c:spPr", {}, ln) : ""));
  }
  // numFmt（数值轴 label.numberFormat）
  const numFmt = kind === "val" && cfg.label && typeof cfg.label === "object" && cfg.label.numberFormat
    ? cfg.label.numberFormat
    : null;
  kids.push(el("c:numFmt", { formatCode: numFmt || "General", sourceLinked: numFmt ? "0" : "0" }));
  kids.push(el("c:majorTickMark", { val: "none" }), el("c:minorTickMark", { val: "none" }));
  // tickLblPos：label: false → none
  kids.push(el("c:tickLblPos", { val: tickLabels && cfg.label !== false ? "nextTo" : "none" }));
  // spPr：axisLine（默认画主题线；false → noFill 隐藏）
  const axisLn = cfg.axisLine === false ? el("a:ln", {}, el("a:noFill")) : axisLnXml(theme, cfg.axisLine, theme.colors?.line || "#d8dce1", 0.75);
  if (axisLn) kids.push(el("c:spPr", {}, axisLn));
  // txPr（label 样式）
  kids.push(txPrXml(theme, CHART_DEFAULTS.axisSize * 100, "tx1", cfg.label && typeof cfg.label === "object" ? cfg.label : null));
  kids.push(el("c:crossAx", { val: crossId }));
  // 次值轴必须 crosses=max（交叉在类目轴最大处=换侧成立）；autoZero 会让 PowerPoint 把次轴
  // 交叉到类目 0 位置，与 axPos 冲突导致次轴布局错乱（刻度串位、折线映射失效）
  kids.push(el("c:crosses", { val: crosses }));
  if (kind === "val") kids.push(el("c:crossBetween", { val: "between" }));
  else kids.push(el("c:auto", { val: "1" }), el("c:lblAlgn", { val: "ctr" }), el("c:lblOffset", { val: "100" }), el("c:noMultiLvlLbl", { val: "0" }));
  return el(`c:${kind === "cat" ? "catAx" : "valAx"}`, {}, kids.join(""));
}

/**
 * radar 轴组（spokeAxis 已折算为两个 AxisConfig；radar 无次轴，固定 cat(1)+val(2)）。
 */
export function buildRadarAxesXml(theme, catCfg, valCfg) {
  return axisXml(theme, { id: 1, crossId: 2, kind: "cat", pos: "b", cfg: catCfg }) +
    axisXml(theme, { id: 2, crossId: 1, kind: "val", pos: "l", cfg: valCfg });
}

/**
 * 整图轴组（官方 §5.3 轴数组规则）：主轴 (1,2)；有系列用 index>0 →
 * 次轴 (3,4)（数值轴换侧 + 隐藏类别轴），与用户参考 chart43/47/48 结构一致。
 * @param {object} p {theme, el, series, horizontal, axes: "catVal"|"valVal"|"radar"}
 */
export function buildAxesXml(theme, el, series, horizontal, mode = "catVal") {
  const maxIdx = Math.max(0, ...series.map((s) => seriesAxisIndex(s, horizontal)));
  // 轴配置：垂直图 = xAxis→类别 / yAxis→数值；水平图 = yAxis→类别 / xAxis→数值
  const xAxes = toAxisArray(el.xAxis);
  const yAxes = toAxisArray(el.yAxis);
  const catCfg = horizontal ? yAxes[0] : xAxes[0];
  const valCfg = horizontal ? xAxes[0] : yAxes[0];
  const catPos = horizontal ? "l" : "b";
  const valPos = horizontal ? "b" : "l";
  const secValPos = horizontal ? "t" : "r";
  const out = [];
  if (mode === "valVal") {
    // scatter/bubble：双数值轴
    out.push(axisXml(theme, { id: 1, crossId: 2, kind: "val", pos: "b", cfg: xAxes[0], gridOnValOnly: true }));
    out.push(axisXml(theme, { id: 2, crossId: 1, kind: "val", pos: "l", cfg: yAxes[0] }));
    for (let i = 1; i <= maxIdx; i++) {
      const id = 1 + i * 2;
      out.push(axisXml(theme, { id, crossId: id + 1, kind: "val", pos: "t", cfg: xAxes[i] || {}, crosses: "max" }));
      out.push(axisXml(theme, { id: id + 1, crossId: id, kind: "val", pos: "r", cfg: yAxes[i] || {}, crosses: "max" }));
    }
    return out.join("");
  }
  // catVal（bar/line/area/candlestick/radar 等）
  out.push(axisXml(theme, { id: 1, crossId: 2, kind: "cat", pos: catPos, cfg: catCfg }));
  out.push(axisXml(theme, { id: 2, crossId: 1, kind: "val", pos: valPos, cfg: valCfg }));
  for (let i = 1; i <= maxIdx; i++) {
    // 次轴 ID 分配必须与 groupAxisId 的约定一致（类别轴=1+i*2、数值轴=2+i*2）：
    // 图表组按"类别轴在前、数值轴在后"引用 [1+i*2, 2+i*2]，若 valAx 抢了 1+i*2，
    // PowerPoint 会把数值轴当类别轴解析，次轴对方位整体翻转（刻度横排、折线映射失效）
    const catId = 1 + i * 2;
    const valId = 2 + i * 2;
    // 次轴：数值轴换侧（crosses=max）+ 隐藏类别轴（配轴用，delete=1），对照原生 PowerPoint 结构
    out.push(axisXml(theme, { id: valId, crossId: catId, kind: "val", pos: secValPos, cfg: horizontal ? xAxes[i] || {} : yAxes[i] || {}, secondary: false, crosses: "max" }));
    out.push(axisXml(theme, { id: catId, crossId: valId, kind: "cat", pos: catPos, cfg: horizontal ? yAxes[i] || {} : xAxes[i] || {}, secondary: true }));
  }
  return out.join("");
}
