// ============================================================================
// writer/chart/classic.js — 经典 c:chartSpace 图表导出主装配
// ----------------------------------------------------------------------------
// C3 对齐官方（对照 tests/projects/chart/reference/test-chart-all.pptx 由 python-pptx 生成的
// 8 类型参考骨架）：
//   3. chart XML 必须声明 <c:externalData r:id="rId1"> → 指向嵌入 xlsx
//   4. strCache/numCache 必须写入（不打开数据表也能显示）
//   5. schema 元素顺序严格（PowerPoint 校验）
//   6. 图表文字用 +mn-lt/+mn-ea 绑定主题 minor 字体
// ============================================================================

import { el, esc, escAttr, xmlHeader, hexToRgbVal } from "../xml.js";
import { resolveChartSeries, resolveBarLayout, chartDataTable, resolveDataLabels, toAxisArray, resolveChartDirection, seriesAxisIndex, seriesChannels, CHART_DEFAULTS } from "../../model/chart.js";
import { resolveColor, resolveFont, themeChartPalette } from "../../model/theme.js";
import { buildFill, buildLn, buildShadow } from "../drawing.js";
import { buildChartXlsx, buildSheetOrder, colLetter } from "./xlsx.js";
import { fillXml, lnXml, txPrXml } from "./style.js";
import {
  barSerXml, lineSerXml, areaSerXml, scatterSerXml, bubbleSerXml,
  candlestickSerXml, upDownBarsXml, pieSerXml, radarSerXml,
} from "./ser.js";
import { buildAxesXml, buildRadarAxesXml } from "./axes.js";
import { buildChartExParts } from "./chartex.js";
import { EXPORTABLE_CHART_TYPES, CHARTEX_TYPES } from "./types.js";

/**
 * 构建图表部件（chartN.xml + rels + xlsx）。
 * @returns {{xml, relsXml, xlsx, unsupported: string[]} | null} unsupported 非空
 *  时 xml/rels 为空（预览正常，导出跳过该元素并警告）。
 */
export function buildChartParts(theme, chartEl, chartIndex) {
  const { series, cats, warn } = resolveChartSeries(theme, chartEl);
  const types = [...new Set(series.map((s) => s.type))];
  const unsupported = types.filter((t) => !EXPORTABLE_CHART_TYPES.includes(t) && !CHARTEX_TYPES.includes(t));
  if (unsupported.length) {
    console.warn(`[writer] 图表 ${chartEl.elementId} 类型 ${unsupported.join("/")} 暂不支持原生导出（待官方参考比对），已跳过`);
    return null;
  }
  // chartEx 体系（waterfall/treemap/sunburst 独占系列数组）
  if (types.some((t) => CHARTEX_TYPES.includes(t))) {
    return buildChartExParts(theme, chartEl, chartIndex);
  }

  const table = chartDataTable(chartEl);
  const rowCount = table.length;
  const dataRows = Math.max(0, rowCount - 1);
  // 方向（官方 §Chart 方向规则）：bar/waterfall 由 xAxis/yAxis.type 决定
  const horizontal = resolveChartDirection(chartEl, series);
  const sheetOrder = buildSheetOrder(chartEl, series, horizontal);
  // 重排后：原列号 → 新列号
  const newIdxOf = new Map(sheetOrder.map((old, ni) => [old, ni]));

  const sheetRange = (colIdx) => {
    const L = colLetter(newIdxOf.get(colIdx) ?? 0);
    return dataRows > 0 ? `Sheet1!$${L}$2:$${L}$${rowCount}` : `Sheet1!$${L}$1:$${L}$1`;
  };
  // 系列名引用列：按类型取主值列（分类列放 A，系列名列须为值列）
  const NAME_CH = { bar: "y", line: "y", area: "y", radar: "y", scatter: "y", bubble: "y", candlestick: "high", pie: "value" };
  sheetRange.nameCol = (s) => {
    // 水平柱：数值通道在 x
    const ch = horizontal && s.type === "bar" ? "x" : (NAME_CH[s.type] ?? "y");
    return newIdxOf.get(s._cols[ch]) ?? 0;
  };
  sheetRange.colHeader = (colIdx) => newIdxOf.get(colIdx) ?? 0; // 列头引用（股价图各通道列）
  sheetRange.rowEnd = () => rowCount;
  // 数据标签 + 全局 fontFamily 注入（官方链：label.fontFamily > Chart.fontFamily）
  const labelsOf = (s, type) => {
    const l = resolveDataLabels(chartEl, s, type);
    if (!l) return null;
    return { ...l, fontFamily: l.fontFamily || chartEl.fontFamily || null };
  };

  // 按类型分组输出 chartElems（混合图共享轴）
  const groups = new Map();
  for (const s of series) {
    if (!groups.has(s.type)) groups.set(s.type, []);
    groups.get(s.type).push(s);
  }

  const chartElems = [];
  let serCounter = 0;
  // 柱宽/槽宽语义单源（model resolveBarLayout：gapWidth/overlap/堆叠判定的唯一定义处，
  // renderer 预览投影同一结果）
  const barLayout = resolveBarLayout(chartEl, series);
  const isStacked = barLayout.stacked;
  const isPercent = barLayout.percent;
  const isStream = series.some((s) => s.stack === "stream");
  const hasSmooth = series.some((s) => s.smooth && (s.type === "line" || s.type === "area" || s.type === "radar"));
  // 组轴索引（官方 §5.3：垂直图 yAxisIndex / 水平图 xAxisIndex）
  const groupAxisId = (s) => {
    const i = seriesAxisIndex(s, horizontal);
    return [1 + i * 2, 2 + i * 2];
  };

  for (const [type, groupSeries] of groups) {
    const [catId, valId] = groupAxisId(groupSeries[0]);
    if (type === "bar") {
      const grouping = isPercent ? "percentStacked" : isStacked ? "stacked" : "clustered";
      const kids = [
        el("c:barDir", { val: horizontal ? "bar" : "col" }),
        el("c:grouping", { val: grouping }),
        el("c:varyColors", { val: "0" }),
        (() => {
          const ss = [];
          for (const s of groupSeries) {
            const chs = seriesChannels(s, horizontal);
            ss.push(barSerXml(theme, s, sheetRange, serCounter++, labelsOf(s, "bar"), chs));
          }
          return ss.join("");
        })(),
      ];
      // ECMA-376 CT_BarChart 顺序：… ser* → dLbls? → gapWidth? → overlap? → serLines? → axId×2
      // gapWidth 必须先于 overlap（PowerPoint 严格按 schema 解析，顺序颠倒会弹「修复」）
      if (barLayout.hasGapWidthConfig) kids.push(el("c:gapWidth", { val: barLayout.gapWidth }));
      if (barLayout.overlap != null) kids.push(el("c:overlap", { val: barLayout.overlap }));
      kids.push(el("c:axId", { val: catId }), el("c:axId", { val: valId }));
      chartElems.push(el("c:barChart", {}, kids.join("")));
    } else if (type === "line" || type === "area") {
      // grouping 与 bar 同源（model resolveBarLayout 判定 stack/percent）：
      // 此前写死 "standard"，stack: value/percent 导出丢失，叠积图变从 0 重叠绘制（04 页实测）
      const grouping = isPercent ? "percentStacked" : isStacked ? "stacked" : "standard";
      const kids = [
        el("c:grouping", { val: grouping }),
        el("c:varyColors", { val: "0" }),
        (() => {
          const ss = [];
          for (const s of groupSeries) {
            const chs = seriesChannels(s, false);
            ss.push(type === "line"
              ? lineSerXml(theme, s, sheetRange, serCounter++, labelsOf(s, "line"), chs)
              : areaSerXml(theme, s, sheetRange, serCounter++, labelsOf(s, "area"), chs));
          }
          return ss.join("");
        })(),
      ];
      if (hasSmooth && type === "line") kids.push(el("c:smooth", { val: "1" }));
      kids.push(el("c:axId", { val: catId }), el("c:axId", { val: valId }));
      chartElems.push(el(`c:${type === "area" ? "areaChart" : "lineChart"}`, {}, kids.join("")));
    } else if (type === "scatter") {
      chartElems.push(
        el("c:scatterChart", {}, [
          el("c:scatterStyle", { val: "lineMarker" }),
          el("c:varyColors", { val: "0" }),
          (() => {
            const ss = [];
            for (const s of groupSeries) ss.push(scatterSerXml(theme, s, sheetRange, serCounter++, labelsOf(s, "scatter"), null));
            return ss.join("");
          })(),
          el("c:axId", { val: catId }),
          el("c:axId", { val: valId }),
        ].join(""))
      );
    } else if (type === "bubble") {
      chartElems.push(
        el("c:bubbleChart", {}, [
          el("c:varyColors", { val: "0" }),
          (() => {
            const ss = [];
            for (const s of groupSeries) ss.push(bubbleSerXml(theme, s, sheetRange, serCounter++, labelsOf(s, "bubble")));
            return ss.join("");
          })(),
          el("c:axId", { val: catId }),
          el("c:axId", { val: valId }),
        ].join(""))
      );
    } else if (type === "candlestick") {
      // PowerPoint 原生 = c:stockChart：1 系列展开 3/4 个 c:ser + hiLowLines
      // + upDownBars（仅 OHLC）。overlay 系列（line 均线）走各自 chart 元素共享轴。
      const isOHLC = groupSeries[0]._cols.open != null;
      const colHeaders = chartEl.data?.cols || [];
      const kids = [];
      for (const s of groupSeries) {
        const n = s._cols.open != null ? 4 : 3;
        kids.push(candlestickSerXml(theme, s, sheetRange, serCounter, labelsOf(s, "candlestick"), colHeaders));
        serCounter += n;
      }
      const wick = series.find((s) => s.wickStyle)?.wickStyle;
      if (wick) {
        kids.push(el("c:hiLowLines", {}, el("c:spPr", {}, lnXml(theme, wick.color || "#666666", wick.width || 1))));
      } else {
        kids.push(el("c:hiLowLines", {}, el("c:spPr", {}, lnXml(theme, "#808080", 0.75))));
      }
      if (isOHLC) kids.push(upDownBarsXml(theme, groupSeries[0]));
      kids.push(el("c:axId", { val: catId }), el("c:axId", { val: valId }));
      chartElems.push(el("c:stockChart", {}, kids.join("")));
    } else if (type === "pie") {
      const s = groupSeries[0];
      const innerRadius = s.innerRadius || 0;
      const isDonut = innerRadius > 0;
      const kids = [el("c:varyColors", { val: "1" })];
      kids.push(pieSerXml(theme, s, sheetRange, serCounter++, labelsOf(s, "pie"), themeChartPalette(theme)));
      if (s.startAngle) kids.push(el("c:firstSliceAng", { val: Math.round(s.startAngle) }));
      if (isDonut) kids.push(el("c:holeSize", { val: Math.max(1, Math.min(90, Math.round(innerRadius * 100))) }));
      chartElems.push(el(`c:${isDonut ? "doughnutChart" : "pieChart"}`, {}, kids.join("")));
    } else if (type === "radar") {
      // radarStyle：marker=线+点，filled=带填充。PowerPoint 无 per-series 混合样式
      // （ filled 时全部系列填充），任一系列声明 areaColor（模型层缺省派生 lineColor
      // 半透明，与预览一致）即整图 filled；此前写死 marker 致填充丢失（08/20 页实测）
      const hasFill = groupSeries.some((s) => s.areaColor);
      chartElems.push(
        el("c:radarChart", {}, [
          el("c:radarStyle", { val: hasFill ? "filled" : "marker" }),
          el("c:varyColors", { val: "0" }),
          (() => {
            const ss = [];
            for (const s of groupSeries) {
              const chs = seriesChannels(s, false);
              ss.push(radarSerXml(theme, s, sheetRange, serCounter++, labelsOf(s, "radar"), chs));
            }
            return ss.join("");
          })(),
          el("c:axId", { val: catId }),
          el("c:axId", { val: valId }),
        ].join(""))
      );
    }
  }

  // 轴（官方 AxisConfig 全字段；radar 的 spokeAxis 映射到 catAx/valAx）
  const primary = types[0];
  let axes = "";
  if (primary === "pie") {
    axes = "";
  } else if (primary === "scatter" || primary === "bubble") {
    axes = buildAxesXml(theme, chartEl, series, false, "valVal");
  } else if (primary === "radar") {
    // spokeAxis：min/max → valAx scaling；label/axisLine/gridLine → 两轴；show:false → 双轴隐藏
    const spoke = (chartEl.spokeAxis && typeof chartEl.spokeAxis === "object" ? chartEl.spokeAxis : {});
    const catCfg = { ...(spoke.show === false ? { show: false } : {}), label: spoke.label, axisLine: spoke.axisLine };
    const valCfg = { min: spoke.min, max: spoke.max, label: spoke.label, axisLine: spoke.axisLine, gridLine: spoke.gridLine, ...(spoke.show === false ? { show: false } : {}) };
    axes = buildRadarAxesXml(theme, catCfg, valCfg);
  } else {
    axes = buildAxesXml(theme, chartEl, series, horizontal);
  }

  // 标题（官方 string | TitleConfig；样式 color/fontSize/fontFamily 全消费）
  const titleCfg = chartEl.title;
  const titleText = typeof titleCfg === "string" ? titleCfg : titleCfg?.text || "";
  const titleFonts = resolveFont(theme, titleCfg && typeof titleCfg === "object" ? titleCfg.fontFamily || chartEl.fontFamily : chartEl.fontFamily);
  const titleColor = titleCfg && typeof titleCfg === "object" && titleCfg.color ? resolveColor(theme, titleCfg.color) : null;
  const titleSz = titleCfg && typeof titleCfg === "object" && titleCfg.fontSize != null ? Math.round(titleCfg.fontSize * 100) : 1400;
  const titleXml = titleText
    ? (
      `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/>` +
      `<a:p><a:pPr/><a:r><a:rPr lang="zh-CN" sz="${titleSz}">` +
      (titleColor ? `<a:solidFill><a:srgbClr val="${hexToRgbVal(titleColor)}"/></a:solidFill>` : `<a:solidFill><a:schemeClr val="tx1"/></a:solidFill>`) +
      `<a:latin typeface="${escAttr(titleFonts.latin)}"/><a:ea typeface="${escAttr(titleFonts.ea)}"/></a:rPr><a:t>${esc(titleText)}</a:t></a:r></a:p>` +
      `</c:rich></c:tx><c:layout/></c:title>` +
      `<c:autoTitleDeleted val="0"/>`
    )
    : `<c:autoTitleDeleted val="1"/>`;

  // 图例（官方 LegendConfig：默认按类型表；legend:false 全局关；样式消费）
  const legendDefaultOff = new Set(CHART_DEFAULTS.legendOffTypes);
  const legendCfg = chartEl.legend;
  let legendXml = "";
  if (legendCfg !== false && !(legendCfg === undefined && types.every((t) => legendDefaultOff.has(t)))) {
    const pos = typeof legendCfg === "object" && legendCfg.position ? legendCfg.position : "bottom";
    const posVal = { top: "t", bottom: "b", left: "l", right: "r" }[pos] || "b";
    const legendLabel = typeof legendCfg === "object" ? legendCfg : null;
    const legendFontFamily = legendLabel?.fontFamily || chartEl.fontFamily;
    legendXml = `<c:legend><c:legendPos val="${posVal}"/><c:overlay val="0"/>${txPrXml(theme, legendLabel?.fontSize ? Math.round(legendLabel.fontSize * 100) : CHART_DEFAULTS.legendSize * 100, "tx1", { ...(legendLabel?.color ? { color: legendLabel.color } : {}), ...(legendFontFamily ? { fontFamily: legendFontFamily } : {}) })}</c:legend>`;
  }

  // nullHandling（多系列取第一个非空；官方 radar 默认 connect）
  const nh = series.map((s) => s.nullHandling).find((v) => v) || (primary === "radar" ? "connect" : "gap");
  const disp = nh === "zero" ? "zero" : nh === "connect" ? "span" : "gap";

  // 图表框（官方 Chart.fill/border/shadow → chartSpace spPr，独立于系列色；
  // 对照用户参考：</c:chart> 后 c:spPr → c:txPr → c:externalData）
  const frameSpPr = (chartEl.fill || chartEl.border || chartEl.shadow)
    ? el("c:spPr", {}, [
      chartEl.fill ? buildFill(theme, chartEl.fill) : "",
      chartEl.border ? buildLn(theme, chartEl.border) : "",
      chartEl.shadow ? buildShadow(theme, chartEl.shadow) : "",
    ].join(""))
    : "";

  const xml =
    xmlHeader() +
    `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ` +
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<c:date1904 val="0"/><c:lang val="zh-CN"/><c:roundedCorners val="0"/>` +
    `<c:chart>` +
    titleXml +
    `<c:plotArea><c:layout/>${chartElems.join("")}${axes}</c:plotArea>` +
    legendXml +
    `<c:plotVisOnly val="1"/><c:dispBlanksAs val="${disp}"/>` +
    `</c:chart>` +
    frameSpPr +
    `<c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData>` +
    `</c:chartSpace>`;

  const relsXml =
    xmlHeader() +
    el("Relationships", { xmlns: "http://schemas.openxmlformats.org/package/2006/relationships" }, [
      el("Relationship", {
        Id: "rId1",
        Type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/package",
        Target: `../embeddings/Microsoft_Excel_Sheet${chartIndex}.xlsx`,
      }),
    ].join(""));

  return { xml, relsXml, xlsx: buildChartXlsx(chartEl, resolveFont(theme, null), sheetOrder), unsupported: [] };
}
