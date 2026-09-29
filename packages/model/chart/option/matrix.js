// ============================================================================
// model/chart/option/matrix.js — matrix / hierarchy / flow family option (heatmap /
// treemap / sunburst / sankey; pure functions)
// ----------------------------------------------------------------------------

import { resolveColor } from "../../theme.js";
import { hierarchyColor, hexA, labelColorOn } from "../colors.js";
import { parseHierarchy, resolveTreeLevels } from "../tree.js";
import { formatChartValue } from "../format.js";
import { resolveDataLabels } from "../labels.js";
import { AXIS_TEXT, chartStyleColors, echartsLabel } from "./shared.js";

/** Parent-child table -> ECharts tree (nodes carry itemStyle hierarchy colors; levels trimming
 * shares its source with the writer. The label color is picked dark/light from the tile
 * luminance (an explicit labels.color config wins) — dark text on a dark tile is unreadable). */
function buildEchartsTree(theme, el, s, labelCfg) {
  const { childrenOf, roots, subtreeSum } = parseHierarchy(el, s);
  const maxLevels = resolveTreeLevels(s);
  const { labelColor } = chartStyleColors(theme);
  const cfgColor = labelCfg?.color ? resolveColor(theme, labelCfg.color) || labelColor : null;
  const tree = [];
  const walk = (node, level, rootIdx) => {
    const kids = childrenOf.get(node.name) || [];
    const item = { name: node.name, value: kids.length === 0 ? node.value : subtreeSum(node) };
    const c = hierarchyColor(theme, s, rootIdx, level);
    if (c) item.itemStyle = { color: c };
    const lc = cfgColor || (c ? labelColorOn(c, labelColor) : labelColor);
    item.label = { color: lc };
    if (kids.length && (maxLevels == null || level + 1 < maxLevels)) {
      item.children = kids.map((k) => walk(k, level + 1, rootIdx));
    }
    return item;
  };
  roots.forEach((root, ri) => tree.push(walk(root, 0, ri)));
  return tree;
}

export function buildMatrix(ctx) {
  const { theme, el, series, cats, primary, common, layout } = ctx;

  if (primary === "treemap" || primary === "sunburst") {
    const s = series[0];
    const labelCfg = resolveDataLabels(el, s, primary);
    const tree = buildEchartsTree(theme, el, s, labelCfg);
    const showValue = labelCfg?.content === "value";
    const showName = labelCfg?.content === "category" || labelCfg == null;
    // With content: value the label is shown as well (displaying the number) — previously
    // show only looked at showName, so configuring value left the whole preview unlabeled,
    // disagreeing with the export side value=1
    const showLabel = showName || showValue;
    // treemap fills the layout-model rectangle (I26: the ECharts default is 80% width/height centered, leaving margins while PPT fills the space)
    const [, , bw, bh] = el.bounds || [0, 0, 0, 0];
    const treemapRect = {
      left: layout.grid.left,
      top: layout.grid.top,
      width: Math.max(1, Number(bw) - layout.grid.left - layout.grid.right),
      height: Math.max(1, Number(bh) - layout.grid.top - layout.grid.bottom),
    };
    return {
      ...common,
      tooltip: { trigger: "item", formatter: (p) => `${p.name}<br/>${p.value ?? ""}` },
      series: [{
        type: primary === "treemap" ? "treemap" : "sunburst",
        data: tree,
        ...(primary === "treemap"
          ? { ...treemapRect, roam: false, nodeClick: false, breadcrumb: { show: false }, label: { show: showLabel, formatter: (p) => (showValue ? String(p.value ?? "") : p.name) }, upperLabel: { show: false } }
          : { radius: ["12%", "85%"], label: { show: showLabel, rotate: "radial", formatter: (p) => (showValue ? String(p.value ?? "") : p.name) } }),
      }],
    };
  }

  if (primary === "heatmap") {
    const s = series[0];
    const labelCfg = resolveDataLabels(el, s, primary);
    const xCats = [...new Set((s._values.x || []).map((v) => String(v ?? "")))];
    const yCats = [...new Set((s._values.y || []).map((v) => String(v ?? "")))];
    const xi = new Map(xCats.map((c, i) => [c, i]));
    const yi = new Map(yCats.map((c, i) => [c, i]));
    const data = (s._values.x || []).map((xv, i) => [xi.get(String(xv ?? "")), yi.get(String(s._values.y?.[i] ?? "")), Number(s._values.value?.[i] ?? 0)]);
    const scheme = (Array.isArray(s.colorScheme) && s.colorScheme.length ? s.colorScheme : [hexA("#2563EB", 0.12), "#2563EB"]).map((c) => resolveColor(theme, c) || c);
    const scaleCfg = s.colorScale || {};
    const vals = data.map((d) => d[2]).filter((v) => Number.isFinite(v));
    const diverging = scaleCfg.type === "diverging";
    const m = Math.max(...vals.map((v) => Math.abs(v)), 1);
    const [lo, hi] = diverging ? [-m, m] : (Array.isArray(scaleCfg.domain) ? scaleCfg.domain : [Math.min(...vals, 0), Math.max(...vals, 1)]);
    const colorbar = s.colorbar !== false;
    const colorbarCfg = typeof s.colorbar === "object" ? s.colorbar : {};
    const { legendColor, axisColor, gridColor, labelColor } = chartStyleColors(theme);
    return {
      ...common,
      legend: { show: false },
      tooltip: { trigger: "item", formatter: (p) => `${xCats[p.value[0]]} / ${yCats[p.value[1]]}: ${p.value[2]}` },
      // Grid = projection from the layout model (right-band yield for the colorbar; this used to
      // hard-code {48,40,16,36}, bypassing the model)
      grid: layout.grid,
      xAxis: { type: "category", data: xCats, axisLine: { lineStyle: { color: axisColor } }, axisLabel: AXIS_TEXT, splitArea: { show: true, areaStyle: { color: ["#fff"] } } },
      yAxis: { type: "category", data: yCats, axisLine: { lineStyle: { color: axisColor } }, axisLabel: AXIS_TEXT, splitArea: { show: true, areaStyle: { color: ["#fff"] } } },
      visualMap: {
        min: lo, max: hi,
        calculable: false,
        orient: "vertical",
        right: 0, top: "center",
        show: colorbar,
        textStyle: { color: legendColor, fontSize: 10 },
        ...(colorbarCfg.position === "left" ? { orient: "vertical", left: 0, right: "auto" } : {}),
        inRange: { color: diverging && scheme.length >= 3 ? [...scheme] : scheme },
      },
      series: [{
        type: "heatmap",
        data,
        // Heatmap p.value = [xi, yi, value]: the label must take the third entry (the
        // echartsLabel scatter convention takes p.value[1] and would render a category index as the value)
        ...(labelCfg
          ? {
              label: {
                show: true,
                position: "inside",
                fontSize: labelCfg.fontSize || 9,
                color: labelCfg.color ? resolveColor(theme, labelCfg.color) || labelColor : labelColor,
                formatter: (p) => (labelCfg.numberFormat ? formatChartValue(p.value[2], labelCfg.numberFormat) : String(p.value[2])),
              },
            }
          : {}),
        itemStyle: { borderColor: "#fff", borderWidth: 1 },
      }],
    };
  }

  if (primary === "sankey") {
    const s = series[0];
    const srcs = (s._values.source || []).map((v) => String(v ?? ""));
    const tgts = (s._values.target || []).map((v) => String(v ?? ""));
    const flows = (s._values.flow || []).map((v) => Number(v ?? 0));
    const links = srcs.map((sr, i) => ({ source: sr, target: tgts[i], value: Math.max(0, flows[i]) }))
      .filter((l) => l.source !== l.target);
    // Kahn topological order (official: nodes are ordered topologically; DAG validation lives
    // in the model layer, the preview leniently appends the remainder)
    const firstSeen = new Map();
    for (const n of [...srcs, ...tgts]) if (!firstSeen.has(n)) firstSeen.set(n, firstSeen.size);
    const indeg = new Map();
    const adj = new Map();
    for (const { source: sr, target: tg } of links) {
      if (!adj.has(sr)) adj.set(sr, []);
      if (!indeg.has(sr)) indeg.set(sr, 0);
      if (!indeg.has(tg)) indeg.set(tg, 0);
      indeg.set(tg, indeg.get(tg) + 1);
      adj.get(sr).push(tg);
    }
    const order = [];
    const queue = [...indeg.keys()].filter((n) => indeg.get(n) === 0)
      .sort((a, b) => firstSeen.get(a) - firstSeen.get(b));
    while (queue.length) {
      const n = queue.shift();
      order.push(n);
      for (const t of adj.get(n) || []) {
        indeg.set(t, indeg.get(t) - 1);
        if (indeg.get(t) === 0) {
          queue.push(t);
          queue.sort((a, b) => firstSeen.get(a) - firstSeen.get(b));
        }
      }
    }
    for (const n of [...srcs, ...tgts]) if (!order.includes(n)) order.push(n);
    const fillArr = Array.isArray(s.fill) ? s.fill : null;
    const fillMap = s.fill && !Array.isArray(s.fill) && typeof s.fill === "object" ? s.fill : null;
    const { labelColor } = chartStyleColors(theme);
    const nodes = order.map((name, i) => {
      let color = null;
      if (fillMap && fillMap[name]) color = resolveColor(theme, fillMap[name]);
      else if (fillArr) color = resolveColor(theme, fillArr[i % fillArr.length]);
      return { name, itemStyle: color ? { color } : undefined };
    });
    return {
      ...common,
      tooltip: { trigger: "item", formatter: (p) => `${p.dataType === "edge" ? `${p.data.source} → ${p.data.target}` : p.name}: ${p.data.value ?? p.value}` },
      series: [{
        type: "sankey",
        data: nodes,
        links,
        nodeAlign: s.nodeAlign || "justify",
        nodeWidth: 14,
        nodeGap: 10,
        label: { show: true, color: labelColor, fontSize: 11 },
        // Opacity kept low: funnel-like data has many crossing flows, and 0.45 looks muddy when colors overlap
        lineStyle: { color: "gradient", opacity: 0.3 },
      }],
    };
  }

  return null;
}
