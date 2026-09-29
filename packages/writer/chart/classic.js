// ============================================================================
// writer/chart/classic.js — classic c:chartSpace chart export main assembly
// ----------------------------------------------------------------------------
// Aligned with the official (python-pptx-generated 8-type reference skeleton):
//   - the chart XML must declare <c:externalData r:id="rId1"> → pointing at the embedded xlsx
//   - strCache/numCache must be written (so values show without opening the data sheet)
//   - schema element order is strict (PowerPoint validates it)
//   - chart text binds the theme minor font via +mn-lt/+mn-ea
// ============================================================================

import { el, esc, xmlHeader } from "../xml.js";
import { resolveChartSpec, CHART_META, resolveChartDirection, seriesAxisIndex, seriesChannels, chartDataTable, resolveDataLabels, colLetter } from "../../model/chart.js";
import { resolveFont, themeChartPalette } from "../../model/theme.js";
import { buildChartXlsx, buildSheetOrder } from "./xlsx.js";
import { lnXml, txPrXml, chartSpaceSpPrXml, richCharStyleXml } from "./style.js";
import {
  barSerXml, lineSerXml, areaSerXml, scatterSerXml, bubbleSerXml,
  candlestickSerXml, upDownBarsXml, pieSerXml, radarSerXml,
} from "./ser.js";
import { buildAxesXml, buildRadarAxesXml } from "./axes.js";
import { buildChartExParts } from "./chartex.js";

/**
 * Build chart parts (chartN.xml + rels + xlsx).
 * @returns {{xml, relsXml, xlsx, unsupported: string[]} | null} when unsupported is non-empty,
 *  xml/rels are empty (the preview is fine; export skips this element with a warning).
 */
export function buildChartParts(theme, chartEl, chartIndex) {
  // Effective-semantics single source (spec: normalized series/title/legend/layout/bar-width/bubble); this function only projects to OOXML
  const spec = resolveChartSpec(theme, chartEl);
  const series = spec.series;
  const types = spec.types;
  const layout = spec.layout;
  // Route single source CHART_META.route: no route = unknown type (preview is fine; export skips with a warning)
  const unsupported = types.filter((t) => !CHART_META[t]?.route);
  if (unsupported.length) {
    console.warn(`[writer] 图表 ${chartEl.elementId} 类型 ${unsupported.join("/")} 暂不支持原生导出（待官方参考比对），已跳过`);
    return null;
  }
  // chartEx system (waterfall/treemap/sunburst take over the series array; route single source CHART_META.route)
  if (types.some((t) => CHART_META[t]?.route === "chartex")) {
    return buildChartExParts(spec, chartIndex);
  }

  const table = chartDataTable(chartEl);
  const rowCount = table.length;
  const dataRows = Math.max(0, rowCount - 1);
  // Direction (official chart direction rules): for bar/waterfall it comes from xAxis/yAxis.type
  const horizontal = resolveChartDirection(chartEl, series);
  const sheetOrder = buildSheetOrder(chartEl, series, horizontal);
  // After reordering: old column index → new column index
  const newIdxOf = new Map(sheetOrder.map((old, ni) => [old, ni]));

  const sheetRange = (colIdx) => {
    const L = colLetter(newIdxOf.get(colIdx) ?? 0);
    return dataRows > 0 ? `Sheet1!$${L}$2:$${L}$${rowCount}` : `Sheet1!$${L}$1:$${L}$1`;
  };
  // Series-name reference column: the primary value column per type (the category column goes to A; the series-name column must be a value column)
  const NAME_CH = { bar: "y", line: "y", area: "y", radar: "y", scatter: "y", bubble: "y", candlestick: "high", pie: "value" };
  sheetRange.nameCol = (s) => {
    // Horizontal bars: the value channel is x
    const ch = horizontal && s.type === "bar" ? "x" : (NAME_CH[s.type] ?? "y");
    return newIdxOf.get(s._cols[ch]) ?? 0;
  };
  sheetRange.colHeader = (colIdx) => newIdxOf.get(colIdx) ?? 0; // column-header reference (candlestick channels)
  sheetRange.rowEnd = () => rowCount;
  // Data labels + global fontFamily injection (official chain: label.fontFamily > Chart.fontFamily)
  const labelsOf = (s, type) => {
    const l = resolveDataLabels(chartEl, s, type);
    if (!l) return null;
    return { ...l, fontFamily: l.fontFamily || chartEl.fontFamily || null };
  };

  // Group chartElems by type (mixed charts share axes)
  const groups = new Map();
  for (const s of series) {
    if (!groups.has(s.type)) groups.set(s.type, []);
    groups.get(s.type).push(s);
  }

  const chartElems = [];
  let serCounter = 0;
  // Bar/slot width semantics (spec.barLayout single source; the renderer preview projects the same result)
  const barLayout = spec.barLayout;
  const isStacked = barLayout.stacked;
  const isPercent = barLayout.percent;
  const isStream = series.some((s) => s.stack === "stream");
  // Group axis indices (vertical charts use yAxisIndex, horizontal use xAxisIndex)
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
          // Horizontal bars (barDir=bar) are drawn bottom-up by PowerPoint and show the legend in
          // reverse (classic Excel behavior); reversing the emission order fixes both the in-group
          // bar order and the legend order at once
          const ordered = horizontal ? [...groupSeries].reverse() : groupSeries;
          for (const s of ordered) {
            const chs = seriesChannels(s, horizontal);
            ss.push(barSerXml(theme, s, sheetRange, serCounter++, labelsOf(s, "bar"), chs));
          }
          return ss.join("");
        })(),
      ];
      // ECMA-376 CT_BarChart order: … ser* → dLbls? → gapWidth? → overlap? → serLines? → axId×2
      // gapWidth must precede overlap (PowerPoint parses strictly by schema; reversed order pops a repair dialog)
      if (barLayout.hasGapWidthConfig) kids.push(el("c:gapWidth", { val: barLayout.gapWidth }));
      if (barLayout.overlap != null) kids.push(el("c:overlap", { val: barLayout.overlap }));
      kids.push(el("c:axId", { val: catId }), el("c:axId", { val: valId }));
      chartElems.push(el("c:barChart", {}, kids.join("")));
    } else if (type === "line" || type === "area") {
      // grouping shares the bar source (model resolveBarLayout decides stack/percent); hardcoding
      // "standard" would drop stack: value/percent and redraw stacked charts overlapping from 0
      const grouping = isPercent ? "percentStacked" : isStacked ? "stacked" : "standard";
      const kids = [
        el("c:grouping", { val: grouping }),
        el("c:varyColors", { val: "0" }),
          (() => {
            const ss = [];
            for (const s of groupSeries) {
              const chs = seriesChannels(s, false);
              // Candlestick overlay line (moving average): without a marker, symbol none is written
              // explicitly; omitting the element lets PowerPoint show its default ✕ marker
              ss.push(type === "line"
                ? lineSerXml(theme, s, sheetRange, serCounter++, labelsOf(s, "line"), chs, { suppressMarker: spec.primary === "candlestick" })
                : areaSerXml(theme, s, sheetRange, serCounter++, labelsOf(s, "area"), chs));
            }
            return ss.join("");
          })(),
      ];
      // smooth is written explicitly per series (c:smooth 0/1); the group-level value is gone, so "any smoothed series smooths the whole group" no longer applies
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
      // Effective bubble-size semantics (spec.bubble single source: preview diameter and export
      // normalized values, bubbleScale inverted from the same model; previously the writer duplicated
      // the mapping and mutated s._values.size, polluting the model result as an export side effect)
      const bub = spec.bubble;
      chartElems.push(
        el("c:bubbleChart", {}, [
          el("c:varyColors", { val: "0" }),
          (() => {
            const ss = [];
            let bi = 0;
            for (const s of groupSeries) ss.push(bubbleSerXml(theme, s, sheetRange, serCounter++, labelsOf(s, "bubble"), bub.writes[bi++]));
            return ss.join("");
          })(),
          el("c:bubbleScale", { val: bub.bubbleScale }),
          el("c:sizeRepresents", { val: "area" }),
          el("c:axId", { val: catId }),
          el("c:axId", { val: valId }),
        ].join(""))
      );
    } else if (type === "candlestick") {
      // PowerPoint native = c:stockChart: 1 series expands into 3/4 c:ser + hiLowLines +
      // upDownBars (OHLC only). Overlay series (line moving averages) use their own chart element
      // sharing the axes.
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
      // radarStyle: marker = line + dots, filled = filled. PowerPoint has no per-series mixed style
      // (filled means every series is filled); any series declaring areaColor (the model derives a
      // translucent lineColor by default, matching the preview) makes the whole chart filled
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

  // Axes (full official AxisConfig; radar's spokeAxis maps to catAx/valAx)
  const primary = spec.primary;
  let axes = "";
  if (primary === "pie") {
    axes = "";
  } else if (primary === "scatter" || primary === "bubble") {
    axes = buildAxesXml(theme, chartEl, series, false, "valVal");
  } else if (primary === "radar") {
    // spokeAxis: min/max → valAx scaling; label/axisLine/gridLine → both axes; show:false → hide both
    const spoke = (chartEl.spokeAxis && typeof chartEl.spokeAxis === "object" ? chartEl.spokeAxis : {});
    const catCfg = { ...(spoke.show === false ? { show: false } : {}), label: spoke.label, axisLine: spoke.axisLine };
    const valCfg = { min: spoke.min, max: spoke.max, label: spoke.label, axisLine: spoke.axisLine, gridLine: spoke.gridLine, ...(spoke.show === false ? { show: false } : {}) };
    axes = buildRadarAxesXml(theme, catCfg, valCfg, chartEl.fontFamily);
  } else {
    // percentStacked value-axis default format 0% (the preview renders 0%-100%; General would show decimals like 0.2)
    axes = buildAxesXml(theme, chartEl, series, horizontal, "catVal", { valNumFmt: isPercent ? "0%" : null });
  }

  // Title (effective config spec.title; the rich character style shares richCharStyleXml with chartEx axis titles)
  const t = spec.title;
  const titleXml = t.text
    ? (
      `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/>` +
      `<a:p><a:pPr/><a:r><a:rPr lang="zh-CN" sz="${Math.round(t.size * 100)}">${richCharStyleXml(theme, t)}</a:rPr><a:t>${esc(t.text)}</a:t></a:r></a:p>` +
      `</c:rich></c:tx><c:layout/></c:title>` +
      `<c:autoTitleDeleted val="0"/>`
    )
    : `<c:autoTitleDeleted val="1"/>`;

  // Legend (effective config spec.legend: on/position/size single source; consumes official LegendConfig)
  const lg = spec.legend;
  let legendXml = "";
  if (lg.on) {
    const legendFontFamily = lg.fontFamily || chartEl.fontFamily;
    legendXml = `<c:legend><c:legendPos val="${lg.ooxmlPos}"/><c:overlay val="0"/>${txPrXml(theme, Math.round(lg.size * 100), "tx1", { ...(lg.color ? { color: lg.color } : {}), ...(legendFontFamily ? { fontFamily: legendFontFamily } : {}) })}</c:legend>`;
  }

  // nullHandling (first non-null across series; official radar default is connect)
  const nh = series.map((s) => s.nullHandling).find((v) => v) || (primary === "radar" ? "connect" : "gap");
  const disp = nh === "zero" ? "zero" : nh === "connect" ? "span" : "gap";

  // Chart frame (official Chart.fill/border/shadow → chartSpace spPr, independent of series colors;
  // isomorphic with chartEx cx:spPr and sharing chartSpaceSpPrXml). Order after </c:chart>:
  // c:spPr → c:txPr → c:externalData
  const frameSpPr = chartSpaceSpPrXml(theme, chartEl, "c");

  // Plot-area geometry single source: project manualLayout from the same layout model as the preview
  // (layoutTarget=inner; x/y/w/h are chartSpace 0-1 fractions). Letting PowerPoint auto-layout with
  // <c:layout/> would be a second geometry system diverging from the preview's fixed grid
  const frac5 = (v) => String(Number(v.toFixed(5)));
  const plotAreaLayoutXml =
    `<c:layout><c:manualLayout>` +
    `<c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/>` +
    `<c:x val="${frac5(layout.plot.x)}"/><c:y val="${frac5(layout.plot.y)}"/>` +
    `<c:w val="${frac5(layout.plot.w)}"/><c:h val="${frac5(layout.plot.h)}"/>` +
    `</c:manualLayout></c:layout>`;

  const xml =
    xmlHeader() +
    `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ` +
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<c:date1904 val="0"/><c:lang val="zh-CN"/><c:roundedCorners val="0"/>` +
    `<c:chart>` +
    titleXml +
    `<c:plotArea>${plotAreaLayoutXml}${chartElems.join("")}${axes}</c:plotArea>` +
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
