// ============================================================================
// model/chart/option/matrix.js — 矩阵/层级/流系 option（heatmap / treemap /
// sunburst / sankey；纯函数）
// ----------------------------------------------------------------------------

import { resolveColor } from "../../theme.js";
import { hierarchyColor, hexA } from "../colors.js";
import { resolveDataLabels } from "../labels.js";
import { AXIS_TEXT, chartStyleColors, echartsLabel } from "./shared.js";

/** 父子表 → ECharts 树（node 带 itemStyle 层级色；levels 裁剪与 writer 同源）。 */
function buildEchartsTree(theme, el, s) {
  const data = el.data || {};
  const rows = data.rows || [];
  const catCol = s._cols.category;
  const valCol = s._cols.value;
  const parentCol = s._cols.parent;
  const nodes = new Map();
  const childrenOf = new Map();
  const roots = [];
  for (const r of rows) {
    const name = String(r[catCol] ?? "").trim();
    if (!name) continue;
    nodes.set(name, { name, value: r[valCol] ?? null, parent: parentCol != null ? r[parentCol] : null });
    if (!childrenOf.has(name)) childrenOf.set(name, []);
  }
  for (const node of nodes.values()) {
    const p = node.parent == null || node.parent === "" ? null : String(node.parent);
    if (p == null || !nodes.has(p)) roots.push(node);
    else childrenOf.get(p).push(node);
  }
  const sumCache = new Map();
  const subtreeSum = (node) => {
    if (sumCache.has(node.name)) return sumCache.get(node.name);
    const kids = childrenOf.get(node.name) || [];
    const v = kids.length === 0
      ? (Number.isFinite(Number(node.value)) ? Number(node.value) : 0)
      : kids.reduce((acc, k) => acc + subtreeSum(k), 0);
    sumCache.set(node.name, v);
    return v;
  };
  const maxLevels = Number.isFinite(s.levels) && s.levels > 0 ? Math.floor(s.levels) : null;
  const tree = [];
  const walk = (node, level, rootIdx) => {
    const kids = childrenOf.get(node.name) || [];
    const item = { name: node.name, value: kids.length === 0 ? node.value : subtreeSum(node) };
    const c = hierarchyColor(theme, s, rootIdx, level);
    if (c) item.itemStyle = { color: c };
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
    const tree = buildEchartsTree(theme, el, s);
    const labelCfg = resolveDataLabels(el, s, primary);
    const showValue = labelCfg?.content === "value";
    const showName = labelCfg?.content === "category" || labelCfg == null;
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
          ? { ...treemapRect, roam: false, nodeClick: false, breadcrumb: { show: false }, label: { show: showName, formatter: (p) => (showValue ? String(p.value ?? "") : p.name) }, upperLabel: { show: false } }
          : { radius: ["12%", "85%"], label: { show: showName, rotate: "radial", formatter: (p) => (showValue ? String(p.value ?? "") : p.name) } }),
      }],
    };
  }

  if (primary === "heatmap") {
    const s = series[0];
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
    const { legendColor, axisColor, gridColor } = chartStyleColors(theme);
    return {
      ...common,
      legend: { show: false },
      tooltip: { trigger: "item", formatter: (p) => `${xCats[p.value[0]]} / ${yCats[p.value[1]]}: ${p.value[2]}` },
      grid: { left: 48, right: colorbar ? 40 : 24, top: 16, bottom: 36 },
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
        label: echartsLabel(theme, el, s, { position: "inside" }),
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
        lineStyle: { color: "gradient", opacity: 0.45 },
      }],
    };
  }

  return null;
}
