// ============================================================================
// writer/chart/chartex.js — chartEx 扩展体系（waterfall / treemap / sunburst）
// PowerPoint 2016+ 新图表（cx: 命名空间），对照用户手工参考
// （tests/projects/chart/reference/test-chart-all-powerpoint.pptx chartEx1/2/6）：
//   - 数据：cx:data > cx:strDim（每级一列，lvl 从最深到最浅）+ cx:numDim
//   - 层级：treemap/sunburst 用多级 lvl（扁平表 = 叶子路径行）；
//     waterfall 用 cx:subtotals idx 标记汇总行（官方 isTotal 语义）
//   - series layoutId 决定类型（treemap/sunburst/waterfall）
//   - 引用：slide graphicData uri=chartex + cx:chart；rels type chartEx；
//     ContentType application/vnd.ms-office.chartex+xml；
//     xlsx 命名 Microsoft_Excel_WorksheetN.xlsx
// ============================================================================

import { el, esc, escAttr, xmlHeader, hexToRgbVal } from "../xml.js";
import { resolveChartSeries, resolveDataLabels, hierarchyColor, CHART_DEFAULTS } from "../../model/chart.js";
import { resolveColor, resolveFont, DEFAULT_FONT } from "../../model/theme.js";
import { buildFill, buildLn, buildShadow } from "../drawing.js";
import { buildChartXlsx } from "./xlsx.js";
import { buildChartStyleXml, buildChartColorStyleXml } from "../chartex-style.js";

/** cx 富文本字符样式（字号/颜色/字体；a: 段与经典 c:title 的 rich 同构。
 * 参考文件里 chartEx 全是默认样式无实例可抄，结构按 chartex schema 写，
 * 由 COM 打开无修复弹窗 + 渲染生效验证。 */
function cxCharStyleXml(theme, { fontSize, color, fontFamily, defaultSize }) {
  const fonts = resolveFont(theme, fontFamily || null);
  const sz = Math.round((fontSize != null ? fontSize : defaultSize) * 100);
  const fill = color
    ? `<a:solidFill><a:srgbClr val="${hexToRgbVal(resolveColor(theme, color) || color)}"/></a:solidFill>`
    : `<a:solidFill><a:schemeClr val="tx1"/></a:solidFill>`;
  return { sz, inner: `${fill}<a:latin typeface="${escAttr(fonts.latin)}"/><a:ea typeface="${escAttr(fonts.ea)}"/>` };
}

/** cx:tx > cx:rich 富文本块（标题/轴标题样式承载，I27；有文本才调用——空元素泄漏占位）。 */
function cxRichXml(theme, text, style) {
  const { sz, inner } = cxCharStyleXml(theme, style);
  return `<cx:rich><a:bodyPr/><a:lstStyle/>` +
    `<a:p><a:pPr><a:defRPr sz="${sz}" b="0" i="0" u="none" strike="noStrike">${inner}</a:defRPr></a:pPr>` +
    `<a:r><a:rPr lang="zh-CN" sz="${sz}">${inner}</a:rPr><a:t>${esc(text)}</a:t></a:r></a:p></cx:rich>`;
}

/** 父子表 → 叶子路径行（[最深...最浅] 每级一列，浅层列用最浅值补齐）。
 *  levels: 官方 Treemap/Sunburst.levels——显示层级数；超出部分聚合到边界层。 */
export function buildHierarchyRows(el, s, maxLevels = null) {
  const data = el.data || {};
  const catCol = s._cols.category;
  const valCol = s._cols.value;
  const parentCol = s._cols.parent;
  const rows = data.rows || [];
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
  // 子树值合计（叶子 value；中间节点 = 子节点和，供 levels 裁剪后的聚合）
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
  const paths = [];
  const walk = (node, path) => {
    const p = [...path, node.name];
    const kids = childrenOf.get(node.name) || [];
    if (kids.length === 0 || (maxLevels != null && p.length >= maxLevels)) {
      paths.push({ path: p, value: kids.length === 0 ? node.value : subtreeSum(node) });
    } else {
      for (const k of kids) walk(k, p);
    }
  };
  for (const root of roots) walk(root, []);
  const depth = Math.max(0, ...paths.map((x) => x.path.length));
  // 每行：[叶子(最深) ... 根(最浅)]，浅路径用最浅值补齐
  const leafRows = paths.map(({ path, value }) => {
    const rev = [...path].reverse();
    while (rev.length < depth) rev.push(rev[rev.length - 1]);
    return { rev, value };
  });
  return { depth, leafRows };
}

/**
 * cx:strDim（多级分类，一个 strDim 含全部 lvl；f 引用整段列范围——对照用户
 * chartEx1：<cx:strDim type="cat"><cx:f>Sheet1!$A$2:$C$17</cx:f><cx:lvl>×N）。
 * levelValues: 每级一个数组（最深级在前，对应最左列）。
 */
function cxStrDimXml(colStart, colEnd, levelValues, rowCount) {
  const f = rowCount > 1
    ? `Sheet1!$${colStart}$2:$${colEnd}$${rowCount}`
    : `Sheet1!$${colStart}$1:$${colEnd}$1`;
  const lvls = levelValues
    .map((vals) =>
      `<cx:lvl ptCount="${vals.length}">` +
      vals.map((v, i) => `<cx:pt idx="${i}">${esc(String(v ?? ""))}</cx:pt>`).join("") +
      `</cx:lvl>`)
    .join("");
  return `<cx:strDim type="cat"><cx:f>${f}</cx:f>${lvls}</cx:strDim>`;
}

/** cx:numDim（type: "val" 数值 / "size" 面积——treemap/sunburst 用 size）。
 *  空值省略 cx:pt（对照 waterfall-color.pptx：ptCount 含空位但 pt 只写有值的）。 */
function cxNumDimXml(dimType, colLetter, values, formatCode, rowCount) {
  const f = rowCount > 1
    ? `Sheet1!$${colLetter}$2:$${colLetter}$${rowCount}`
    : `Sheet1!$${colLetter}$1:$${colLetter}$1`;
  const lvl =
    `<cx:lvl ptCount="${values.length}"${formatCode ? ` formatCode="${formatCode}"` : ""}>` +
    values.map((v, i) => (v == null || v === "" ? "" : `<cx:pt idx="${i}">${esc(String(v))}</cx:pt>`)).join("") +
    `</cx:lvl>`;
  return `<cx:numDim type="${dimType}"><cx:f>${f}</cx:f>${lvl}</cx:numDim>`;
}

/** 逐点色 cx:dataPt（对照用户 treemap-color.pptx 实测）：
 *  <cx:dataPt idx="N"><cx:spPr><a:solidFill><a:srgbClr …/></a:solidFill></cx:spPr></cx:dataPt> */
function cxDataPtXml(idx, color) {
  const rgb = /^#[0-9a-fA-F]{6}$/.test(color) ? color.slice(1) : null;
  if (!rgb) return "";
  const alpha = /^#[0-9a-fA-F]{8}$/.test(color) ? Math.round((parseInt(color.slice(7), 16) / 255) * 100000) : null;
  const colorEl = alpha == null
    ? `<a:srgbClr val="${rgb}"/>`
    : `<a:srgbClr val="${rgb}"><a:alpha val="${alpha}"/></a:srgbClr>`;
  return `<cx:dataPt idx="${idx}"><cx:spPr><a:solidFill>${colorEl}</a:solidFill></cx:spPr></cx:dataPt>`;
}

/**
 * treemap/sunburst fill → cx:dataPt 逐点色（对照用户 treemap-color.pptx 实测）。
 * idx = 整棵树先根 DFS 节点编号（根=0，含中间节点；叶子按其祖先链前置子树累加）。
 * 颜色按官方派生规则（hierarchyColor；与 renderer 同源）。
 */
function buildLeafDataPoints(theme, s, leafRows) {
  if (s.fill == null) return "";
  // 按 leafRows（每行 rev=[最深...根]）构建树（children 顺序 = 行序，与 PowerPoint 一致）
  const rootMap = new Map(); // 根名 → {name, children, isLeaf}
  const nodeOf = (name) => {
    if (!rootMap.has(name)) rootMap.set(name, { name, children: [], isLeaf: true });
    return rootMap.get(name);
  };
  for (const { rev } of leafRows) {
    // rev[0]=最深 ... rev[n-1]=根；从根向下挂（补齐产生的连续同名去重，防自挂环）
    const path = [];
    for (const name of [...rev].reverse()) {
      if (path[path.length - 1] !== name) path.push(name);
    }
    let parent = null;
    for (const name of path) {
      const node = nodeOf(name);
      if (parent) {
        if (!parent.children.includes(node)) parent.children.push(node);
      }
      parent = node;
    }
  }
  // 叶子 = 无子节点的节点（含 levels 聚合后的边界节点）
  for (const node of rootMap.values()) {
    node.isLeaf = node.children.length === 0;
  }
  const roots = [...new Set(leafRows.map(({ rev }) => rev[rev.length - 1]))]
    .map((name) => rootMap.get(name));
  const rootOrder = new Map(roots.map((r, i) => [r.name, i]));
  // 先根 DFS 编号
  let counter = 0;
  const idxOfNode = new Map();
  const walk = (node) => {
    idxOfNode.set(node, counter++);
    for (const ch of node.children) walk(ch);
  };
  for (const root of roots) walk(root);
  // 每个 leafRows 行（叶子路径）→ 该叶子节点的 idx
  const out = leafRows.map(({ rev }) => {
    const node = nodeOf(rev[0]); // rev[0] = 最深 = 该行叶子
    const c = hierarchyColor(theme, s, rootOrder.get(rev[rev.length - 1]), rev.length - 1);
    if (!c) return "";
    return cxDataPtXml(idxOfNode.get(node), c);
  }).join("");
  return out;
}

/** waterfall 三分类色 → cx:dataPt 逐点色（chartEx 无逐点边框，border 忽略）。 */
function buildWaterfallDataPoints(theme, s, rows) {
  const isTotalCol = s._cols.isTotal;
  return rows.map((r, i) => {
    const isTotal = isTotalCol != null ? r[isTotalCol] === true : false;
    const yv = Number(r[s._cols.y] ?? 0);
    const cfg = isTotal ? s.totalBars : yv >= 0 ? s.increaseBars : s.decreaseBars;
    if (!cfg || !cfg.fill) return "";
    const c = resolveColor(theme, cfg.fill);
    if (!c) return "";
    return cxDataPtXml(i, c);
  }).join("");
}

/**
 * chartEx 部件（waterfall/treemap/sunburst）。
 * @returns {{chartEx: true, xml, relsXml, xlsx, styleXml, colorsXml}} | null
 */
export function buildChartExParts(theme, chartEl, chartIndex) {
  const { series } = resolveChartSeries(theme, chartEl);
  const s = series[0];
  const type = s.type;
  const data = chartEl.data || { cols: [], rows: [] };
  const rows = data.rows || [];
  let rowCount = rows.length + 1; // +表头

  // 数据布局（dims XML）
  let dims = { main: "", extra: "" };
  let layoutPr = "";
  let dataLabels = "";
  let dataPoints = "";
  let sizeLetter = "B"; // treemap/sunburst 的 size 列（层级列后一列），series tx 引用
  const labels = resolveDataLabels(chartEl, s, type);

  if (type === "waterfall") {
    // xlsx: [A=cat, B=val, C=汇总列]；subtotals = isTotal 行索引（0-based）
    const cats = rows.map((r) => String(r[s._cols.x] ?? ""));
    const vals = rows.map((r) => Number(r[s._cols.y] ?? 0));
    const isTotalCol = s._cols.isTotal;
    const subIdx = isTotalCol != null
      ? rows.map((r, i) => (r[isTotalCol] === true ? i : -1)).filter((i) => i >= 0)
      : [];
    // 汇总列值（官方结构：isTotal 语义双通道——第二 dataset + 隐藏 series；
    // 对照用户 waterfall-color.pptx：data id=1 引用 C 列，true 行写 1）
    const totals = rows.map((r) => (isTotalCol != null && r[isTotalCol] === true ? 1 : null));
    const dataMain =
      cxStrDimXml("A", "A", [cats], rowCount) +
      cxNumDimXml("val", "B", vals, "G/通用格式", rowCount);
    const dataTotal = isTotalCol != null
      ? `<cx:data id="1">` +
        cxStrDimXml("A", "A", [cats], rowCount) +
        cxNumDimXml("val", "C", totals, "G/通用格式", rowCount) +
        `</cx:data>`
      : "";
    dims = { main: dataMain, extra: dataTotal };
    layoutPr = subIdx.length
      ? `<cx:layoutPr><cx:subtotals>${subIdx.map((i) => `<cx:idx val="${i}"/>`).join("")}</cx:subtotals></cx:layoutPr>`
      : `<cx:layoutPr><cx:aggregation/></cx:layoutPr>`;
    dataLabels = labels
      ? `<cx:dataLabels pos="outEnd"><cx:visibility seriesName="0" categoryName="${labels.content === "category" ? "1" : "0"}" value="${labels.content === "value" ? "1" : "0"}"/></cx:dataLabels>`
      : "";
    // 三分类色（官方 totalBars/increaseBars/decreaseBars → cx:dataPt 逐点色）
    dataPoints = buildWaterfallDataPoints(theme, s, rows);
  } else {
    // treemap / sunburst：xlsx = [级0(最深)...级N-1(根), size]
    // levels（官方）：显示层级数，超出部分聚合到边界层
    const maxLevels = Number.isFinite(s.levels) && s.levels > 0 ? Math.floor(s.levels) : null;
    const { depth, leafRows } = buildHierarchyRows(chartEl, s, maxLevels);
    if (depth === 0) return null;
    rowCount = leafRows.length + 1; // 层级表行数（叶子行 + 表头）
    const levelCols = [];
    for (let L = 0; L < depth; L++) {
      levelCols.push(leafRows.map((x) => x.rev[L] ?? ""));
    }
    const sizes = leafRows.map((x) => Number(x.value ?? 0));
    const colLetters = depth === 1 ? ["A"] : ["A", "B", "C", "D", "E", "F", "G", "H"].slice(0, depth);
    sizeLetter = String.fromCharCode(65 + depth); // 层级列后一列（A=65；depth 3 → D）
    dims = {
      main:
        cxStrDimXml("A", colLetters[depth - 1], levelCols, rowCount) +
        cxNumDimXml("size", sizeLetter, sizes, "G/通用格式", rowCount),
      extra: "",
    };
    layoutPr = type === "treemap" ? `<cx:layoutPr><cx:parentLabelLayout val="overlapping"/></cx:layoutPr>` : "";
    dataLabels = labels
      ? `<cx:dataLabels pos="${type === "sunburst" ? "ctr" : "inEnd"}"><cx:visibility seriesName="0" categoryName="${labels.content === "category" ? "1" : "0"}" value="${labels.content === "value" ? "1" : "0"}"/></cx:dataLabels>`
      : "";
    // fill 颜色（官方派生规则 → cx:dataPoint 逐叶色）：
    //   单值/1D 数组按根节点循环，子节点沿 HSL.L 每级 -10；2D 数组外层按根、内层按级
    dataPoints = buildLeafDataPoints(theme, s, leafRows);
  }

  const guid = () => `{${"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  })}}`;

  const titleCfg = chartEl.title;
  const titleText = typeof titleCfg === "string" ? titleCfg : titleCfg?.text || "";
  // 无标题时省略 cx:title——空元素 `<cx:title/>` 会让 PowerPoint 渲染「图表标题」
  // 占位文字（09/11/12/17/19/21 页实测；cx:title 在 cx:chart 下可省略，省略不触发修复）
  // 样式消费（I27）：cx:tx > cx:rich 承载字号/颜色/字体；此前 cx:txData 纯文本，
  // 样式全落 PowerPoint 默认
  const titleXml = titleText
    ? `<cx:title pos="t" align="ctr" overlay="0"><cx:tx>${cxRichXml(theme, titleText, {
      fontSize: titleCfg && typeof titleCfg === "object" ? titleCfg.fontSize : null,
      color: titleCfg && typeof titleCfg === "object" ? titleCfg.color : null,
      fontFamily: (titleCfg && typeof titleCfg === "object" ? titleCfg.fontFamily : null) || chartEl.fontFamily,
      defaultSize: 14,
    })}</cx:tx></cx:title>`
    : "";
  // 图例（I27）：pos 必须是 t/b/l/r 枚举（此前直传 "bottom" 等拼写值，枚举外）；
  // 配了字号/颜色/字体时以 cx:txPr 缺省字符样式承载（同经典 c:txPr 思路）
  const legendCfg = chartEl.legend;
  let legendXml = "";
  if (legendCfg === true || typeof legendCfg === "object") {
    const lc = typeof legendCfg === "object" ? legendCfg : {};
    const posVal = { top: "t", bottom: "b", left: "l", right: "r" }[lc.position] || "t";
    let legendTxPr = "";
    if (lc.fontSize != null || lc.color || lc.fontFamily) {
      const { sz, inner } = cxCharStyleXml(theme, {
        fontSize: lc.fontSize, color: lc.color,
        fontFamily: lc.fontFamily || chartEl.fontFamily, defaultSize: CHART_DEFAULTS.legendSize,
      });
      legendTxPr = `<cx:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="0" i="0" u="none" strike="noStrike">${inner}</a:defRPr></a:pPr><a:endParaRPr lang="zh-CN"/></a:p></cx:txPr>`;
    }
    legendXml = `<cx:legend pos="${posVal}" align="ctr" overlay="0">${legendTxPr}</cx:legend>`;
  }

  // 轴（waterfall：分类 + 数值）。轴标题映射（I28）：xAxis→类目轴、yAxis→数值轴，
  // 语义与预览 cartesianAxes 一致；有文本才写 cx:title（空元素泄漏「坐标轴标题」
  // 占位文字，坑 3）。schema（MS-ODRAWXML CT_Axis）：title 紧跟 scaling、在
  // gridlines/tickLabels 之前；CT_AxisTitle 无 pos/align/overlay 属性（带属性
  // PowerPoint 直接拒开），位置由平台沿轴自动排布
  let axes = "";
  if (type === "waterfall") {
    const cxAxisTitleXml = (axisCfg) => {
      const c = axisCfg && typeof axisCfg === "object" ? axisCfg : null;
      const tCfg = c ? (typeof c.title === "string" ? { text: c.title } : c.title || null) : null;
      const t = tCfg?.text;
      if (!t) return "";
      return `<cx:title><cx:tx>${cxRichXml(theme, t, {
        fontSize: tCfg.fontSize,
        color: tCfg.color,
        fontFamily: tCfg.fontFamily || chartEl.fontFamily,
        defaultSize: CHART_DEFAULTS.axisSize,
      })}</cx:tx></cx:title>`;
    };
    const xCfg = (Array.isArray(chartEl.xAxis) ? chartEl.xAxis[0] : chartEl.xAxis) || null;
    const yCfg = (Array.isArray(chartEl.yAxis) ? chartEl.yAxis[0] : chartEl.yAxis) || null;
    axes =
      `<cx:axis id="0"><cx:catScaling gapWidth="0.5"/>${cxAxisTitleXml(xCfg)}<cx:tickLabels/></cx:axis>` +
      `<cx:axis id="1"><cx:valScaling/>${cxAxisTitleXml(yCfg)}<cx:majorGridlines/><cx:tickLabels/></cx:axis>`;
  }

  // 系列默认格式覆盖（官方结构：cx:fmtOvrs > fmtOvr idx=0 → accent1，
  // 对照 waterfall-color.pptx）
  const fmtOvrs =
    `<cx:fmtOvrs><cx:fmtOvr idx="0"><cx:spPr><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></cx:spPr></cx:fmtOvr></cx:fmtOvrs>`;

  // 图表框（官方 Chart.fill/border/shadow → cx:chartSpace spPr；chartEx 同样适用）
  const frameSpPr = (chartEl.fill || chartEl.border || chartEl.shadow)
    ? `<cx:spPr>` +
      (chartEl.fill ? buildFill(theme, chartEl.fill) : "") +
      (chartEl.border ? buildLn(theme, chartEl.border) : "") +
      (chartEl.shadow ? buildShadow(theme, chartEl.shadow) : "") +
      `</cx:spPr>`
    : "";

  // 隐藏系列（waterfall 汇总列：hidden="1" + dataId=1，对照 waterfall-color.pptx）
  const isTotalCol = s._cols.isTotal;
  const totalSeriesXml = (type === "waterfall" && isTotalCol != null)
    ? `<cx:series layoutId="waterfall" hidden="1" uniqueId="${guid()}" formatIdx="1">` +
      `<cx:tx><cx:txData><cx:f>Sheet1!$C$1</cx:f><cx:v>${esc(String((data.cols || [])[isTotalCol] ?? "汇总"))}</cx:v></cx:txData></cx:tx>` +
      `<cx:dataId val="1"/>` +
      `<cx:layoutPr><cx:subtotals/></cx:layoutPr>` +
      `</cx:series>`
    : "";

  const xml =
    xmlHeader() +
    `<cx:chartSpace xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex">` +
    `<cx:chartData><cx:externalData r:id="rId1" cx:autoUpdate="0"/>` +
    `<cx:data id="0">${dims.main}</cx:data>${dims.extra}</cx:chartData>` +
    `<cx:chart>` +
    titleXml +
    `<cx:plotArea><cx:plotAreaRegion>` +
    `<cx:series layoutId="${type}" uniqueId="${guid()}" formatIdx="0">` +
    `<cx:tx><cx:txData><cx:f>Sheet1!$${type === "waterfall" ? "B" : sizeLetter}$1</cx:f><cx:v>${esc(s.name)}</cx:v></cx:txData></cx:tx>` +
    dataPoints +
    dataLabels +
    `<cx:dataId val="0"/>` +
    layoutPr +
    `</cx:series>` +
    totalSeriesXml +
    `</cx:plotAreaRegion>${axes}</cx:plotArea>` +
    legendXml +
    `</cx:chart>` +
    frameSpPr +
    fmtOvrs +
    `</cx:chartSpace>`;

  const relsXml =
    xmlHeader() +
    el("Relationships", { xmlns: "http://schemas.openxmlformats.org/package/2006/relationships" }, [
      el("Relationship", {
        Id: "rId1",
        Type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/package",
        Target: `../embeddings/Microsoft_Excel_Worksheet${chartIndex}.xlsx`,
      }),
      el("Relationship", {
        Id: "rId2",
        Type: "http://schemas.microsoft.com/office/2011/relationships/chartStyle",
        Target: `style${chartIndex}.xml`,
      }),
      el("Relationship", {
        Id: "rId3",
        Type: "http://schemas.microsoft.com/office/2011/relationships/chartColorStyle",
        Target: `colors${chartIndex}.xml`,
      }),
    ].join(""));

  return {
    chartEx: true,
    xml,
    relsXml,
    xlsx: buildChartExXlsx(chartEl, s, type),
    styleXml: buildChartStyleXml(),
    colorsXml: buildChartColorStyleXml(),
  };
}

/** chartEx 专用 xlsx：瀑布图 [cat, val, 汇总列]；树/旭日 [级0..级N, size]（叶子路径）。 */
function buildChartExXlsx(chartEl, s, type) {
  const fonts = { latin: DEFAULT_FONT };
  const data = chartEl.data || { cols: [], rows: [] };
  const rows = data.rows || [];
  let table;
  if (type === "waterfall") {
    // 表头 = 测试页列名（对照用户参考：A1=项目 B1=金额 C1=汇总）；
    // 汇总列 true 行写 1（isTotal 标记，官方数据布局）
    const srcCols = data.cols || [];
    const xIdx = s._cols.x ?? 0;
    const yIdx = s._cols.y ?? 1;
    const tIdx = s._cols.isTotal;
    const cats = rows.map((r) => String(r[xIdx] ?? ""));
    const vals = rows.map((r) => r[yIdx] ?? null);
    const header = [String(srcCols[xIdx] ?? "类别"), String(srcCols[yIdx] ?? "数值")];
    if (tIdx != null) header.push(String(srcCols[tIdx] ?? "汇总"));
    table = [header];
    rows.forEach((r, i) => {
      const row = [cats[i], vals[i]];
      if (tIdx != null) row.push(r[tIdx] === true ? 1 : null);
      table.push(row);
    });
  } else {
    const maxLevels = Number.isFinite(s.levels) && s.levels > 0 ? Math.floor(s.levels) : null;
    const { depth, leafRows } = buildHierarchyRows(chartEl, s, maxLevels);
    // xlsx 列序 = 根在前（PowerPoint 官方布局，对照 treemap-color.pptx：A=父…最右=叶子）
    const header = [];
    for (let L = depth - 1; L >= 0; L--) header.push(`级${L + 1}`); // 级depth(根)…级1(叶子)
    header.push("值");
    table = [header];
    for (const { rev, value } of leafRows) {
      table.push([...[...rev].reverse(), value ?? null]); // [根…叶子, 值]
    }
  }
  // 真实表头作为 cols（原 bug：map 成 C1/C2 单元格坐标 → xlsx 表头错乱）
  const cols = table[0];
  return buildChartXlsx({ data: { cols, rows: table.slice(1) } }, fonts, null);
}
