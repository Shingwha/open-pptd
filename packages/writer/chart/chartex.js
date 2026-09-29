// ============================================================================
// writer/chart/chartex.js — chartEx extension system (waterfall / treemap / sunburst)
// PowerPoint 2016+ charts (cx: namespace):
//   - data: cx:data > cx:strDim (one column per level, lvl from deepest to shallowest) + cx:numDim
//   - hierarchy: treemap/sunburst use multi-level lvl (a flat table = leaf-path rows);
//     waterfall marks total rows via cx:subtotals idx (official isTotal semantics)
//   - series layoutId determines the type (treemap/sunburst/waterfall)
//   - references: slide graphicData uri=chartex + cx:chart; rels type chartEx;
//     ContentType application/vnd.ms-office.chartex+xml;
//     xlsx named Microsoft_Excel_WorksheetN.xlsx
// ============================================================================

import { el, esc, escAttr, xmlHeader, hexToRgbVal } from "../xml.js";
import { resolveDataLabels, hierarchyColor, parseHexColor, parseHierarchy, resolveTreeLevels, resolveTitleLike, labelColorOn, waterfallColorOf, colLetter, CHART_DEFAULTS } from "../../model/chart.js";
import { colorOr, resolveFont, DEFAULT_FONT } from "../../model/theme.js";
import { buildChartXlsx } from "./xlsx.js";
import { chartSpaceSpPrXml, richCharStyleXml } from "./style.js";
import { buildChartStyleXml, buildChartColorStyleXml } from "../chartex-style.js";

/** cx character style (size/color/font; the a: segment is isomorphic with the classic c:title
 * rich — the inner character style has a single source, richCharStyleXml). The structure follows
 * the chartex schema. */
function cxCharStyleXml(theme, { fontSize, color, fontFamily, defaultSize }) {
  const sz = Math.round((fontSize != null ? fontSize : defaultSize) * 100);
  return { sz, inner: richCharStyleXml(theme, { color, fontFamily }) };
}

/** cx:txPr — passes through dataLabels size/color/font (treemap/sunburst tile labels).
 * Schema (CT_DataLabels sequence): txPr precedes visibility — after it, PowerPoint's lenient parsing
 * would drop it. Omitted when nothing is configured. */
function dataLabelsTxPrXml(theme, labels) {
  if (labels.fontSize == null && !labels.color && !labels.fontFamily) return "";
  const fonts = resolveFont(theme, labels.fontFamily || null);
  const sz = Math.round((labels.fontSize ?? CHART_DEFAULTS.labelSize) * 100);
  const fill = labels.color
    ? `<a:solidFill><a:srgbClr val="${hexToRgbVal(colorOr(theme, labels.color, labels.color))}"/></a:solidFill>`
    : "";
  return `<cx:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}">${fill}<a:latin typeface="${escAttr(fonts.latin)}"/><a:ea typeface="${escAttr(fonts.ea)}"/></a:defRPr></a:pPr><a:endParaRPr lang="zh-CN"/></a:p></cx:txPr>`;
}

/** cx:tx > cx:rich rich-text block (carries title/axis-title styles; only called when there is text — an empty element leaks a placeholder). */
function cxRichXml(theme, text, style) {
  const { sz, inner } = cxCharStyleXml(theme, style);
  return `<cx:rich><a:bodyPr/><a:lstStyle/>` +
    `<a:p><a:pPr><a:defRPr sz="${sz}" b="0" i="0" u="none" strike="noStrike">${inner}</a:defRPr></a:pPr>` +
    `<a:r><a:rPr lang="zh-CN" sz="${sz}">${inner}</a:rPr><a:t>${esc(text)}</a:t></a:r></a:p></cx:rich>`;
}

/** Parent-child table → leaf-path rows ([deepest...shallowest], one column per level, shallow
 * columns padded with the shallowest value).
 *  levels: official Treemap/Sunburst.levels — the displayed level count; anything beyond aggregates
 *  to the boundary level. Node parsing / subtree sums share the preview's ECharts tree (model parseHierarchy). */
export function buildHierarchyRows(el, s, maxLevels = null) {
  const { childrenOf, roots, subtreeSum } = parseHierarchy(el, s);
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
    // Each row: [leaf(deepest) ... root(shallowest)], shallow positions padded with the shallowest value
  const leafRows = paths.map(({ path, value }) => {
    const rev = [...path].reverse();
    while (rev.length < depth) rev.push(rev[rev.length - 1]);
    return { rev, value };
  });
  return { depth, leafRows };
}

/**
 * cx:strDim (multi-level categories; one strDim carries every lvl, with f referencing the whole
 * column range: <cx:strDim type="cat"><cx:f>Sheet1!$A$2:$C$17</cx:f><cx:lvl>×N).
 * levelValues: one array per level (deepest first, corresponding to the leftmost column).
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

/** cx:numDim (type: "val" for values / "size" for area — treemap/sunburst use size).
 *  Empty values omit cx:pt (ptCount includes the slots, but only valued points are written). */
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

/** Per-point color cx:dataPt:
 *  <cx:dataPt idx="N"><cx:spPr><a:solidFill><a:srgbClr …/></a:solidFill></cx:spPr></cx:dataPt>
 *  HEX parsing goes through model parseHexColor (same source as the classic srgbClrXml; HEX8
 *  transparency also applies). */
function cxDataPtXml(idx, color) {
  const parsed = parseHexColor(color);
  if (!parsed) return "";
  const colorEl = parsed.alpha == null
    ? `<a:srgbClr val="${parsed.rgb}"/>`
    : `<a:srgbClr val="${parsed.rgb}"><a:alpha val="${Math.round(parsed.alpha * 100000)}"/></a:srgbClr>`;
  return `<cx:dataPt idx="${idx}"><cx:spPr><a:solidFill>${colorEl}</a:solidFill></cx:spPr></cx:dataPt>`;
}

/**
 * treemap/sunburst fill → per-point cx:dataPt colors + per-point label colors. idx = preorder DFS
 * node numbering over the whole tree (root=0, including intermediate nodes; leaves add the
 * preceding subtree of their ancestor chain). Colors follow the official derivation rule
 * (hierarchyColor, same source as the renderer). Labels: when labels.color is unset, dark tiles
 * (decided by labelColorOn) get per-point cx:dataLabel white text — the authoritative cs:dataLabel
 * slot can only hold one color for the whole chart, so progressively darker tiles need per-point
 * overrides (schema CT_DataLabel: idx + txPr).
 */
function buildTreePointsAndLabels(theme, s, leafRows, labels) {
  if (s.fill == null) return { dataPoints: "", pointLabels: "" };
  // Build the tree from leafRows (each rev=[deepest...root]); child order = row order, matching PowerPoint
  const rootMap = new Map(); // root name → {name, children, isLeaf}
  const nodeOf = (name) => {
    if (!rootMap.has(name)) rootMap.set(name, { name, children: [], isLeaf: true });
    return rootMap.get(name);
  };
  for (const { rev } of leafRows) {
    // rev[0]=deepest ... rev[n-1]=root; attach from the root down (dedupe consecutive duplicates from padding to avoid self-cycles)
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
  // Leaves = nodes with no children (including boundary nodes after levels aggregation)
  for (const node of rootMap.values()) {
    node.isLeaf = node.children.length === 0;
  }
  const roots = [...new Set(leafRows.map(({ rev }) => rev[rev.length - 1]))]
    .map((name) => rootMap.get(name));
  const rootOrder = new Map(roots.map((r, i) => [r.name, i]));
  // Preorder DFS numbering + record each node (level/root order) for per-point label color computation
  let counter = 0;
  const idxOfNode = new Map();
  const nodesInOrder = []; // {node, level, rootIdx}
  const walk = (node, level, rootIdx) => {
    idxOfNode.set(node, counter++);
    nodesInOrder.push({ node, level, rootIdx });
    for (const ch of node.children) walk(ch, level + 1, rootIdx);
  };
  for (const root of roots) walk(root, 0, rootOrder.get(root.name));
  // Each leafRows row (leaf path) → that leaf node's idx
  const dataPoints = leafRows.map(({ rev }) => {
    const node = nodeOf(rev[0]); // rev[0] = deepest = this row's leaf
    const c = hierarchyColor(theme, s, rootOrder.get(rev[rev.length - 1]), rev.length - 1);
    if (!c) return "";
    return cxDataPtXml(idxOfNode.get(node), c);
  }).join("");
  // Per-point white labels (dark tiles; effective when labels.color is unset)
  const autoLabel = labels && labels.color == null;
  const sz = Math.round(((labels?.fontSize ?? CHART_DEFAULTS.labelSize)) * 100);
  const pointLabels = autoLabel
    ? nodesInOrder.map(({ node, level, rootIdx }) => {
      const c = hierarchyColor(theme, s, rootIdx, level);
      if (!c || labelColorOn(c) !== "#FFFFFF") return "";
      return `<cx:dataLabel idx="${idxOfNode.get(node)}"><cx:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="0" i="0" u="none" strike="noStrike"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="zh-CN"/></a:p></cx:txPr></cx:dataLabel>`;
    }).join("")
    : "";
  return { dataPoints, pointLabels };
}

/** waterfall three-category colors → per-point cx:dataPt colors (chartEx has no per-point border;
 * border is ignored). Even without configured category colors, per-point colors are emitted
 * (waterfallColorOf's default theme palette), matching the preview. */
function buildWaterfallDataPoints(theme, s, rows) {
  const isTotalCol = s._cols.isTotal;
  return rows.map((r, i) => {
    const isTotal = isTotalCol != null ? r[isTotalCol] === true : false;
    const yv = Number(r[s._cols.y] ?? 0);
    return cxDataPtXml(i, waterfallColorOf(theme, s, isTotal, yv));
  }).join("");
}

/**
 * chartEx parts (waterfall/treemap/sunburst). Input is the spec single source (resolveChartSpec
 * result; semantics — title/legend/hierarchy tree/waterfall categories — all come from model;
 * this function only projects to the cx: dialect).
 * @returns {{chartEx: true, xml, relsXml, xlsx, styleXml, colorsXml}} | null
 */
export function buildChartExParts(spec, chartIndex) {
  const theme = spec.theme;
  const chartEl = spec.el;
  const series = spec.series;
  const s = series[0];
  const type = s.type;
  const data = chartEl.data || { cols: [], rows: [] };
  const rows = data.rows || [];
  let rowCount = rows.length + 1; // + header

  // Data layout (dims XML)
  let dims = { main: "", extra: "" };
  let layoutPr = "";
  let dataLabels = "";
  let dataPoints = "";
  let sizeLetter = "B"; // treemap/sunburst size column (one after the level columns), referenced by the series tx
  const labels = resolveDataLabels(chartEl, s, type);

  if (type === "waterfall") {
    // xlsx: [A=cat, B=val, C=total column]; subtotals = isTotal row indices (0-based)
    const cats = rows.map((r) => String(r[s._cols.x] ?? ""));
    const vals = rows.map((r) => Number(r[s._cols.y] ?? 0));
    const isTotalCol = s._cols.isTotal;
    const subIdx = isTotalCol != null
      ? rows.map((r, i) => (r[isTotalCol] === true ? i : -1)).filter((i) => i >= 0)
      : [];
    // Total-column values (official structure: isTotal is a dual channel — a second dataset + a
    // hidden series; data id=1 references column C and true rows write 1)
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
    // schema (CT_DataLabels sequence): txPr precedes visibility (written after it, PowerPoint's
    // lenient parsing would drop the element)
    dataLabels = labels
      ? `<cx:dataLabels pos="outEnd"><cx:visibility seriesName="0" categoryName="${labels.content === "category" ? "1" : "0"}" value="${labels.content === "value" ? "1" : "0"}"/></cx:dataLabels>`
      : "";
    // Three-category colors (official totalBars/increaseBars/decreaseBars → per-point cx:dataPt; even
    // without configuration, waterfallColorOf's default palette is emitted — leaving it empty would
    // fall to PowerPoint's default green/blue/orange, mismatching the preview's theme palette)
    dataPoints = buildWaterfallDataPoints(theme, s, rows);
  } else {
    // treemap / sunburst: xlsx = [level0(deepest)...levelN-1(root), size]
    // levels (official): the displayed level count; anything beyond aggregates to the boundary level
    const maxLevels = resolveTreeLevels(s);
    const { depth, leafRows } = buildHierarchyRows(chartEl, s, maxLevels);
    if (depth === 0) return null;
    rowCount = leafRows.length + 1; // level-table row count (leaf rows + header)
    const levelCols = [];
    for (let L = 0; L < depth; L++) {
      levelCols.push(leafRows.map((x) => x.rev[L] ?? ""));
    }
    const sizes = leafRows.map((x) => Number(x.value ?? 0));
    const colLetters = Array.from({ length: depth }, (_, i) => colLetter(i));
    sizeLetter = colLetter(depth); // one column after the level columns
    dims = {
      main:
        cxStrDimXml("A", colLetters[depth - 1], levelCols, rowCount) +
        cxNumDimXml("size", sizeLetter, sizes, "G/通用格式", rowCount),
      extra: "",
    };
    layoutPr = type === "treemap" ? `<cx:layoutPr><cx:parentLabelLayout val="overlapping"/></cx:layoutPr>` : "";
    // fill colors (official derivation → per-leaf cx:dataPoint): a single value / 1D array cycles per
    // root and children step -10 along HSL.L per level; a 2D array is outer-by-root, inner-by-level
    const { dataPoints: treePts, pointLabels } = buildTreePointsAndLabels(theme, s, leafRows, labels);
    dataPoints = treePts;
    // dataLabels (schema order: txPr → visibility → dataLabel*). With labels.color unset, dark tiles
    // get per-point white text (labelColorOn picks by luminance) and light tiles keep the platform default dark text
    dataLabels = labels
      ? `<cx:dataLabels pos="${type === "sunburst" ? "ctr" : "inEnd"}">${dataLabelsTxPrXml(theme, labels)}<cx:visibility seriesName="0" categoryName="${labels.content === "category" ? "1" : "0"}" value="${labels.content === "value" ? "1" : "0"}"/>${pointLabels}</cx:dataLabels>`
      : "";
  }

  const guid = () => `{${"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  })}}`;

  const titleXml = spec.title.text
    ? `<cx:title pos="t" align="ctr" overlay="0"><cx:tx>${cxRichXml(theme, spec.title.text, {
      fontSize: spec.title.size,
      color: spec.title.color,
      fontFamily: spec.title.fontFamily,
      defaultSize: CHART_DEFAULTS.titleSize,
    })}</cx:tx></cx:title>`
    : "";
  // Omit cx:title when there is no title — an empty `<cx:title/>` makes PowerPoint render the
  // "Chart Title" placeholder (cx:title is omittable under cx:chart without triggering repair).
  // Legend: pos must be one of t/b/l/r (spec.legend.ooxmlPos, default bottom); with a configured
  // size/color/font it is carried by a cx:txPr default character style (same idea as the classic c:txPr)
  const lg = spec.legend;
  let legendXml = "";
  if (lg.on) {
    let legendTxPr = "";
    if (lg.hasStyle) {
      const { sz, inner } = cxCharStyleXml(theme, {
        fontSize: lg.size, color: lg.color,
        fontFamily: lg.fontFamily || chartEl.fontFamily, defaultSize: CHART_DEFAULTS.legendSize,
      });
      legendTxPr = `<cx:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="0" i="0" u="none" strike="noStrike">${inner}</a:defRPr></a:pPr><a:endParaRPr lang="zh-CN"/></a:p></cx:txPr>`;
    }
    legendXml = `<cx:legend pos="${lg.ooxmlPos}" align="ctr" overlay="0">${legendTxPr}</cx:legend>`;
  }

  // Axes (waterfall: category + value). Axis-title mapping: xAxis→category axis, yAxis→value axis,
  // matching the preview's cartesianAxes; cx:title is written only when there is text (an empty
  // element leaks the "Axis Title" placeholder). Schema (MS-ODRAWXML CT_Axis): title immediately
  // follows scaling and precedes gridlines/tickLabels; CT_AxisTitle has no pos/align/overlay
  // attributes (those make PowerPoint refuse to open), and the platform places it along the axis
  let axes = "";
  if (type === "waterfall") {
    // Effective axis-title config (resolveTitleLike, same source as classic axis/chart titles)
    const cxAxisTitleXml = (axisCfg) => {
      const c = axisCfg && typeof axisCfg === "object" ? axisCfg : null;
      const t = c ? resolveTitleLike(c.title, { fallbackFontFamily: chartEl.fontFamily || null, defaultSize: CHART_DEFAULTS.axisSize }) : null;
      if (!t || !t.text) return "";
      return `<cx:title><cx:tx>${cxRichXml(theme, t.text, {
        fontSize: t.size,
        color: t.color,
        fontFamily: t.fontFamily,
        defaultSize: CHART_DEFAULTS.axisSize,
      })}</cx:tx></cx:title>`;
    };
    const xCfg = (Array.isArray(chartEl.xAxis) ? chartEl.xAxis[0] : chartEl.xAxis) || null;
    const yCfg = (Array.isArray(chartEl.yAxis) ? chartEl.yAxis[0] : chartEl.yAxis) || null;
    axes =
      `<cx:axis id="0"><cx:catScaling gapWidth="0.5"/>${cxAxisTitleXml(xCfg)}<cx:tickLabels/></cx:axis>` +
      `<cx:axis id="1"><cx:valScaling/>${cxAxisTitleXml(yCfg)}<cx:majorGridlines/><cx:tickLabels/></cx:axis>`;
  }

  // Series default format override (official structure: cx:fmtOvrs > fmtOvr idx=0 → accent1)
  const fmtOvrs =
    `<cx:fmtOvrs><cx:fmtOvr idx="0"><cx:spPr><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></cx:spPr></cx:fmtOvr></cx:fmtOvrs>`;

  // Chart frame (official Chart.fill/border/shadow → cx:chartSpace spPr; isomorphic with the classic
  // c:spPr and sharing chartSpaceSpPrXml)
  const frameSpPr = chartSpaceSpPrXml(theme, chartEl, "cx");

  // Hidden series (waterfall total column: hidden="1" + dataId=1)
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
    // Tile-label color source = the chartStyle part's cs:dataLabel slot (PowerPoint's only effective
    // label-color source). A configured labels.color overrides directly; otherwise the first root's
    // level-0 tile luminance auto-selects white/default (dark tiles would have unreadable dark text).
    // Per-point cx:dataLabel is emitted too (see buildTreePointsAndLabels) for renderers supporting it
    styleXml: buildChartStyleXml(labelSlotFor(theme, s, type, labels)),
    colorsXml: buildChartColorStyleXml(),
  };
}

/** treemap/sunburst tile-label slot override; other types return null (keep the default dark text).
 * A configured labels.color overrides directly; otherwise the text color follows the first root's
 * level-0 tile luminance (white for dark tiles, null for light tiles to keep the platform dark text);
 * a configured font size passes through. */
function labelSlotFor(theme, s, type, labels) {
  if ((type !== "treemap" && type !== "sunburst") || !labels) return null;
  const rootColor = hierarchyColor(theme, s, 0, 0);
  const autoColor = rootColor && labelColorOn(rootColor) === "#FFFFFF" ? "FFFFFF" : null;
  if (labels.color) {
    return { colorHex: hexToRgbVal(colorOr(theme, labels.color, labels.color)), fontSize: labels.fontSize };
  }
  if (labels.fontSize != null || autoColor) {
    return { colorHex: autoColor, fontSize: labels.fontSize };
  }
  return null;
}

/** chartEx-specific xlsx: waterfall [cat, val, total column]; tree/sunburst [level0..levelN, size] (leaf paths). */
function buildChartExXlsx(chartEl, s, type) {
  const fonts = { latin: DEFAULT_FONT };
  const data = chartEl.data || { cols: [], rows: [] };
  const rows = data.rows || [];
  let table;
  if (type === "waterfall") {
    // Header = the test page's column names (A1=item B1=amount C1=total); true rows in the total
    // column write 1 (the isTotal marker, official data layout)
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
    const maxLevels = resolveTreeLevels(s);
    const { depth, leafRows } = buildHierarchyRows(chartEl, s, maxLevels);
    // xlsx column order = root first (official layout: A=parent … rightmost=leaf)
    const header = [];
    for (let L = depth - 1; L >= 0; L--) header.push(`级${L + 1}`); // levelDepth(root)…level1(leaf)
    header.push("值");
    table = [header];
    for (const { rev, value } of leafRows) {
      table.push([...[...rev].reverse(), value ?? null]); // [root…leaf, value]
    }
  }
  // Real headers become cols (mapping them to C1/C2 cell coordinates would scramble the xlsx header)
  const cols = table[0];
  return buildChartXlsx({ data: { cols, rows: table.slice(1) } }, fonts, null);
}
