// ============================================================================
// model/chart/option/matrix.js — 矩阵/层级/流系 option（heatmap / treemap /
// sunburst / sankey；纯函数）
// ----------------------------------------------------------------------------

import { resolveColor } from "../../theme.js";
import { hierarchyColor, hexA, labelColorOn } from "../colors.js";
import { parseHierarchy, resolveTreeLevels } from "../tree.js";
import { formatChartValue } from "../format.js";
import { resolveDataLabels } from "../labels.js";
import { AXIS_TEXT, chartStyleColors, echartsLabel } from "./shared.js";

/** 父子表 → ECharts 树（node 带 itemStyle 层级色；levels 裁剪与 writer 同源。
 * 标签字色按瓦片亮度自动选深/浅（labels.color 配置优先）——深色瓦片深字不可读）。 */
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
    // content: value 时标签同样显示（显示数值）——此前 show 只看 showName，
    // 配 value 会让预览整图无标签，与导出端 value=1 不一致
    const showLabel = showName || showValue;
    // treemap 铺满布局模型矩形（I26：ECharts 默认 80% 宽高居中留白，PPT 端铺满）
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
      // 网格 = 布局模型投影（色标条右带让位；此前此处写死 {48,40,16,36} 绕过模型）
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
        // 热力图 p.value = [xi, yi, value]：标签必须取第 3 位（echartsLabel 的
        // 散点口径取 p.value[1]，会把类目索引当数值渲染）
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
    // Kahn 拓扑序（官方：节点按拓扑序排列；DAG 校验在模型层，预览宽容补尾）
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
        // 透明度压低：漏斗类数据跨层交叉流多，0.45 时叠色发闷
        lineStyle: { color: "gradient", opacity: 0.3 },
      }],
    };
  }

  return null;
}
