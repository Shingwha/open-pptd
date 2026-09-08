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

import { el, esc, xmlHeader } from "../xml.js";
import { resolveChartSpec, CHART_META, resolveChartDirection, seriesAxisIndex, seriesChannels, chartDataTable, resolveDataLabels, colLetter } from "../../model/chart.js";
import { resolveFont, themeChartPalette } from "../../model/theme.js";
import { buildChartXlsx, buildSheetOrder } from "./xlsx.js";
import { fillXml, lnXml, txPrXml, chartSpaceSpPrXml, richCharStyleXml } from "./style.js";
import {
  barSerXml, lineSerXml, areaSerXml, scatterSerXml, bubbleSerXml,
  candlestickSerXml, upDownBarsXml, pieSerXml, radarSerXml,
} from "./ser.js";
import { buildAxesXml, buildRadarAxesXml } from "./axes.js";
import { buildChartExParts } from "./chartex.js";

/**
 * 构建图表部件（chartN.xml + rels + xlsx）。
 * @returns {{xml, relsXml, xlsx, unsupported: string[]} | null} unsupported 非空
 *  时 xml/rels 为空（预览正常，导出跳过该元素并警告）。
 */
export function buildChartParts(theme, chartEl, chartIndex) {
  // 有效语义单源（spec：归一化系列/标题/图例/布局/柱宽/气泡），本函数只做 OOXML 投影
  const spec = resolveChartSpec(theme, chartEl);
  const series = spec.series;
  const types = spec.types;
  const layout = spec.layout;
  // 路由单源 CHART_META.route：无 route = 未知类型（预览正常，导出跳过并警告）
  const unsupported = types.filter((t) => !CHART_META[t]?.route);
  if (unsupported.length) {
    console.warn(`[writer] 图表 ${chartEl.elementId} 类型 ${unsupported.join("/")} 暂不支持原生导出（待官方参考比对），已跳过`);
    return null;
  }
  // chartEx 体系（waterfall/treemap/sunburst 独占系列数组；路由单源 CHART_META.route）
  if (types.some((t) => CHART_META[t]?.route === "chartex")) {
    return buildChartExParts(spec, chartIndex);
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
  // 柱宽/槽宽语义（spec.barLayout 单源，renderer 预览投影同一结果）
  const barLayout = spec.barLayout;
  const isStacked = barLayout.stacked;
  const isPercent = barLayout.percent;
  const isStream = series.some((s) => s.stack === "stream");
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
          // 横向柱（barDir=bar）PowerPoint 自下而上绘制、图例倒序显示（Excel 经典行为），
          // 反转发射顺序可同时修正组内柱序与图例序（此前与预览双双相反，15 页实测）
          const ordered = horizontal ? [...groupSeries].reverse() : groupSeries;
          for (const s of ordered) {
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
      // smooth 已逐系列显式写（c:smooth 0/1），组级不再写——「任一系列平滑→全组连带平滑」废止
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
      // 气泡尺寸有效语义（spec.bubble 单源：预览直径与导出归一化写值、bubbleScale
      // 反解同一模型——此前 writer 复制一份映射并直接改写 s._values.size，model
      // 归一化结果被导出副作用污染）
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
  const primary = spec.primary;
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
    axes = buildRadarAxesXml(theme, catCfg, valCfg, chartEl.fontFamily);
  } else {
    // percentStacked 数值轴缺省格式 0%（预览渲染 0%-100%，General 会显示 0.2 小数）
    axes = buildAxesXml(theme, chartEl, series, horizontal, "catVal", { valNumFmt: isPercent ? "0%" : null });
  }

  // 标题（有效配置 spec.title；rich 字符样式与 chartEx 轴标题同源 richCharStyleXml）
  const t = spec.title;
  const titleXml = t.text
    ? (
      `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/>` +
      `<a:p><a:pPr/><a:r><a:rPr lang="zh-CN" sz="${Math.round(t.size * 100)}">${richCharStyleXml(theme, t)}</a:rPr><a:t>${esc(t.text)}</a:t></a:r></a:p>` +
      `</c:rich></c:tx><c:layout/></c:title>` +
      `<c:autoTitleDeleted val="0"/>`
    )
    : `<c:autoTitleDeleted val="1"/>`;

  // 图例（有效配置 spec.legend：开关/方位/字号单源；官方 LegendConfig 样式消费）
  const lg = spec.legend;
  let legendXml = "";
  if (lg.on) {
    const legendFontFamily = lg.fontFamily || chartEl.fontFamily;
    legendXml = `<c:legend><c:legendPos val="${lg.ooxmlPos}"/><c:overlay val="0"/>${txPrXml(theme, Math.round(lg.size * 100), "tx1", { ...(lg.color ? { color: lg.color } : {}), ...(legendFontFamily ? { fontFamily: legendFontFamily } : {}) })}</c:legend>`;
  }

  // nullHandling（多系列取第一个非空；官方 radar 默认 connect）
  const nh = series.map((s) => s.nullHandling).find((v) => v) || (primary === "radar" ? "connect" : "gap");
  const disp = nh === "zero" ? "zero" : nh === "connect" ? "span" : "gap";

  // 图表框（官方 Chart.fill/border/shadow → chartSpace spPr，独立于系列色；
  // 与 chartEx cx:spPr 同构共用 chartSpaceSpPrXml。对照用户参考：</c:chart> 后
  // c:spPr → c:txPr → c:externalData）
  const frameSpPr = chartSpaceSpPrXml(theme, chartEl, "c");

  // 绘图区几何单源（I19）：与预览同一布局模型投影 manualLayout（layoutTarget=inner，
  // x/y/w/h 为 chartSpace 0-1 分数）。此前写 <c:layout/> 让 PowerPoint 自动布局，
  // 绘图区几何与预览固定网格两套体系（01 页 PPT 绘图区更高更满、02 页饼显著更大）
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
