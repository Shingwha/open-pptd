// ============================================================================
// writer/chart.js — 图表导出（原生可编辑 Chart XML + 嵌入 xlsx）
// ----------------------------------------------------------------------------
// C3 对齐官方（对照 tests/reference/test-chart-all.pptx 由 python-pptx 生成的
// 8 类型参考骨架）：
//   1. 嵌入 xlsx 必须完整部件（Content_Types/rels/docProps/xl workbook/worksheet/
//      sharedStrings/styles/theme）→ 缺部件 PowerPoint 报「数据文件已损毁」
//   2. 嵌入文件名必须 ASCII：Microsoft_Excel_SheetN.xlsx（WPS 严格解析）
//   3. chart XML 必须声明 <c:externalData r:id="rId1"> → 指向嵌入 xlsx
//   4. strCache/numCache 必须写入（不打开数据表也能显示）
//   5. schema 元素顺序严格（PowerPoint 校验）
//   6. 图表文字用 +mn-lt/+mn-ea 绑定主题 minor 字体
//
// 类型出口（官方 13 类）：
//   ✅ bar / line / area / scatter / bubble / candlestick / pie(含 innerRadius→
//      doughnutChart) / radar —— 原生导出
//   ⏳ waterfall / treemap / sunburst —— 结构需 PowerPoint 手工参考（树/瀑布
//      父子数据在私有扩展，待用户手动创建后入库比对）
//   ⏳ heatmap / sankey —— PowerPoint 无原生类型，待定（图片化或近似）
// ============================================================================

import { el, esc, escAttr, xmlHeader, hexToRgbVal } from "./xml.js";
import { resolveChartSeries, chartDataTable, isNumericColumn, resolveDataLabels, DEFAULT_CHART_PALETTE } from "../core/chart.js";
import { resolveColor, resolveFont } from "../core/theme.js";
import { ZipWriter } from "./zip.js";

/** 原生可导出的类型。 */
export const EXPORTABLE_CHART_TYPES = ["bar", "line", "area", "scatter", "bubble", "candlestick", "pie", "radar"];

// ----------------------------------------------------------------------------
// 数据 → xlsx 工作表
// ----------------------------------------------------------------------------
function colLetter(n) {
  let s = "";
  n += 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * 工作表列重排（candlestick 需要 open/high/low/close 连续 4 列，PowerPoint
 * 股价图按列范围识别）：
 *   A 列 = 分类列；candlestick 列组连续；其余系列引用列按系列顺序；未引用列尾随。
 * @returns {number[]} 新列序（原列索引数组）
 */
export function buildSheetOrder(el, series) {
  const cols = el.data?.cols || [];
  const order = [];
  const push = (ci) => { if (ci >= 0 && !order.includes(ci)) order.push(ci); };
  // 1. 分类列（第一个系列的 x/category）
  const catSeries = series.find((s) => s._cols.x != null || s._cols.category != null);
  if (catSeries) push(catSeries._cols.x ?? catSeries._cols.category);
  // 2. candlestick 列组
  for (const s of series) {
    if (s.type !== "candlestick") continue;
    for (const ch of ["open", "high", "low", "close"]) push(s._cols[ch]);
  }
  // 3. 其余系列引用列
  for (const s of series) {
    if (s.type === "candlestick") continue;
    for (const ch of Object.keys(s._cols)) push(s._cols[ch]);
  }
  // 4. 未引用列尾随
  cols.forEach((_, ci) => push(ci));
  return order;
}

export function buildChartXlsx(chartEl, fonts, sheetOrder) {
  const f = fonts?.latin || "Microsoft YaHei";
  const table = chartDataTable(chartEl); // [表头行, 数据行...]
  // 列重排（candlestick 等）
  const order = sheetOrder || table[0].map((_, i) => i);
  const reordered = table.map((row) => order.map((ci) => row[ci]));
  const rows = reordered.length;
  const cols = reordered[0] ? reordered[0].length : 0;

  const shared = [];
  const sharedIndex = new Map();
  const si = (text) => {
    const key = String(text);
    if (sharedIndex.has(key)) return sharedIndex.get(key);
    shared.push(key);
    sharedIndex.set(key, shared.length - 1);
    return shared.length - 1;
  };

  const numericCols = [];
  for (let c = 0; c < cols; c++) numericCols.push(isNumericColumn(reordered, c));

  const sheetRows = [];
  for (let r = 0; r < rows; r++) {
    const cells = [];
    for (let c = 0; c < cols; c++) {
      const v = reordered[r][c];
      const ref = colLetter(c) + (r + 1);
      if (v == null || v === "") {
        cells.push(el("c", { r: ref }));
      } else if (r === 0 || !numericCols[c]) {
        cells.push(el("c", { r: ref, t: "s" }, el("v", {}, si(v))));
      } else {
        cells.push(el("c", { r: ref }, el("v", {}, String(Number(v)))));
      }
    }
    sheetRows.push(el("row", { r: r + 1 }, cells.join("")));
  }

  const sheetXml = (
    xmlHeader() +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetData>${sheetRows.join("")}</sheetData></worksheet>`
  );

  const sstXml = (
    xmlHeader() +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">` +
    shared.map((s) => `<si><t>${esc(s)}</t></si>`).join("") +
    `</sst>`
  );

  const workbookXml = (
    xmlHeader() +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`
  );

  const workbookRels = (
    xmlHeader() +
    el("Relationships", { xmlns: "http://schemas.openxmlformats.org/package/2006/relationships" }, [
      el("Relationship", { Id: "rId1", Type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet", Target: "worksheets/sheet1.xml" }),
      el("Relationship", { Id: "rId2", Type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme", Target: "theme/theme1.xml" }),
      el("Relationship", { Id: "rId3", Type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles", Target: "styles.xml" }),
      el("Relationship", { Id: "rId4", Type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings", Target: "sharedStrings.xml" }),
    ].join(""))
  );

  const contentTypes = (
    xmlHeader() +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
    `</Types>`
  );

  const rootRels = (
    xmlHeader() +
    el("Relationships", { xmlns: "http://schemas.openxmlformats.org/package/2006/relationships" }, [
      el("Relationship", { Id: "rId1", Type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument", Target: "xl/workbook.xml" }),
      el("Relationship", { Id: "rId2", Type: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", Target: "docProps/core.xml" }),
      el("Relationship", { Id: "rId3", Type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties", Target: "docProps/app.xml" }),
    ].join(""))
  );

  const coreXml = (
    xmlHeader() +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ` +
    `xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:creator>open-pptd</dc:creator></cp:coreProperties>`
  );

  const appXml = (
    xmlHeader() +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ` +
    `xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    `<Application>open-pptd</Application></Properties>`
  );

  const stylesXml = (
    xmlHeader() +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`
  );

  const xlTheme = (
    xmlHeader() +
    `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office">` +
    `<a:themeElements>` +
    `<a:clrScheme name="Office">` +
    `<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>` +
    `<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>` +
    `<a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2>` +
    `<a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2>` +
    `<a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4>` +
    `<a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6>` +
    `<a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink>` +
    `</a:clrScheme>` +
    `<a:fontScheme name="Office">` +
    `<a:majorFont><a:latin typeface="${f}"/><a:ea typeface="${f}"/><a:cs typeface=""/></a:majorFont>` +
    `<a:minorFont><a:latin typeface="${f}"/><a:ea typeface="${f}"/><a:cs typeface=""/></a:minorFont>` +
    `</a:fontScheme>` +
    `<a:fmtScheme name="Office">` +
    `<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>` +
    `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="16200000" scaled="1"/></a:gradFill>` +
    `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="16200000" scaled="1"/></a:gradFill>` +
    `</a:fillStyleLst>` +
    `<a:lnStyleLst><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>` +
    `<a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>` +
    `<a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>` +
    `</a:lnStyleLst>` +
    `<a:effectStyleLst><a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="20000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="38000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle>` +
    `<a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle>` +
    `<a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle>` +
    `</a:effectStyleLst>` +
    `<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>` +
    `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="40000"/><a:satMod val="350000"/></a:schemeClr></a:gs><a:gs pos="40000"><a:schemeClr val="phClr"><a:tint val="45000"/><a:shade val="99000"/><a:satMod val="350000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="20000"/><a:satMod val="255000"/></a:schemeClr></a:gs></a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="-80000" r="50000" b="180000"/></a:path></a:gradFill>` +
    `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="80000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="30000"/><a:satMod val="200000"/></a:schemeClr></a:gs></a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path></a:gradFill>` +
    `</a:bgFillStyleLst>` +
    `</a:fmtScheme>` +
    `</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`
  );

  const zip = new ZipWriter();
  zip.add("[Content_Types].xml", contentTypes);
  zip.add("_rels/.rels", rootRels);
  zip.add("docProps/core.xml", coreXml);
  zip.add("docProps/app.xml", appXml);
  zip.add("xl/workbook.xml", workbookXml);
  zip.add("xl/_rels/workbook.xml.rels", workbookRels);
  zip.add("xl/worksheets/sheet1.xml", sheetXml);
  zip.add("xl/sharedStrings.xml", sstXml);
  zip.add("xl/styles.xml", stylesXml);
  zip.add("xl/theme/theme1.xml", xlTheme);
  return zip.build();
}

// ----------------------------------------------------------------------------
// Chart XML 公共片段
// ----------------------------------------------------------------------------
/** 主题色解析 + HEX8 透明度 → a:solidFill。 */
function fillXml(theme, color, alpha) {
  let c = resolveColor(theme, color);
  if (!c) c = "#000000";
  let rgb = c;
  let a = alpha;
  if (/^#[0-9a-fA-F]{8}$/.test(c)) {
    rgb = c.slice(0, 7);
    a = parseInt(c.slice(7), 16) / 255;
  }
  const inner =
    a == null
      ? el("a:srgbClr", { val: hexToRgbVal(rgb) })
      : el("a:srgbClr", { val: hexToRgbVal(rgb) }, el("a:alpha", { val: Math.round(a * 100000) }));
  return el("a:solidFill", {}, inner);
}

/** 系列线条（a:ln，主题色解析 + HEX8）。 */
function lnXml(theme, color, widthPt = 2) {
  let c = resolveColor(theme, color) || "#000000";
  let a = null;
  if (/^#[0-9a-fA-F]{8}$/.test(c)) {
    c = c.slice(0, 7);
    a = parseInt(c.slice(7), 16) / 255;
  }
  const inner = a == null
    ? el("a:srgbClr", { val: hexToRgbVal(c) })
    : el("a:srgbClr", { val: hexToRgbVal(c) }, el("a:alpha", { val: Math.round(a * 100000) }));
  return el("a:ln", { w: Math.round(widthPt * 12700), cap: "flat", cmpd: "sng", algn: "ctr" }, el("a:solidFill", {}, inner));
}

function txPrXml(theme, size = 900, color = "tx1") {
  const fonts = resolveFont(theme, null);
  return (
    el("c:txPr", {}, [
      el("a:bodyPr"),
      el("a:lstStyle"),
      el("a:p", {}, el("a:pPr", {}, el("a:defRPr", { sz: size }, [
        el("a:solidFill", {}, el("a:schemeClr", { val: color })),
        el("a:latin", { typeface: fonts.latin }),
        el("a:ea", { typeface: fonts.ea }),
        el("a:cs", { typeface: fonts.ea }),
      ].join("")))),
    ].join(""))
  );
}

function strRefXml(sheetRef, values) {
  return el("c:strRef", {}, [
    el("c:f", {}, sheetRef),
    el("c:strCache", {}, [
      el("c:ptCount", { val: values.length }),
      values.map((v, i) => el("c:pt", { idx: i }, el("c:v", {}, esc(String(v ?? ""))))).join(""),
    ].join("")),
  ].join(""));
}

function numRefXml(sheetRef, values, format = "General") {
  return el("c:numRef", {}, [
    el("c:f", {}, sheetRef),
    el("c:numCache", {}, [
      el("c:formatCode", {}, format),
      el("c:ptCount", { val: values.length }),
      values.map((v, i) => el("c:pt", { idx: i }, el("c:v", {}, String(v ?? 0)))).join(""),
    ].join("")),
  ].join(""));
}

function seriesNameXml(name, colIdx) {
  const ref = `Sheet1!$${colLetter(colIdx)}$1`;
  return el("c:tx", {}, el("c:strRef", {}, [
    el("c:f", {}, ref),
    el("c:strCache", {}, [
      el("c:ptCount", { val: 1 }),
      el("c:pt", { idx: 0 }, el("c:v", {}, esc(name))),
    ].join("")),
  ].join("")));
}

/** 官方 dataLabels → c:dLbls（content: value/percentage/category + numberFormat）。 */
function dLblsXml(theme, cfg) {
  const content = cfg?.content || "value";
  const kids = [];
  if (cfg?.numberFormat) kids.push(el("c:numFmt", { formatCode: cfg.numberFormat, sourceLinked: "0" }));
  kids.push(
    el("c:spPr", {}, el("a:noFill")),
    txPrXml(theme, 900, "tx1"),
    el("c:showLegendKey", { val: "0" }),
    el("c:showVal", { val: content === "value" ? "1" : "0" }),
    el("c:showCatName", { val: content === "category" ? "1" : "0" }),
    el("c:showSerName", { val: "0" }),
    el("c:showPercent", { val: content === "percentage" ? "1" : "0" }),
    el("c:showBubbleSize", { val: "0" }),
  );
  if (content === "category" && cfg?.separator) kids.push(el("c:separator", { val: cfg.separator }));
  return el("c:dLbls", {}, kids.join(""));
}

/** 系列 marker（官方 MarkerConfig → c:marker）。 */
function markerXml(theme, marker, color) {
  if (!marker || marker === false) return "";
  const cfg = typeof marker === "object" ? marker : {};
  const shape = { circle: "circle", rect: "square", diamond: "diamond", triangle: "triangle" }[cfg.shape] || "circle";
  const kids = [el("c:symbol", { val: shape })];
  if (cfg.size != null) kids.push(el("c:size", { val: Math.max(2, Math.round(cfg.size)) }));
  const fill = cfg.fill || color;
  if (fill) kids.push(el("c:spPr", {}, fillXml(theme, fill)));
  return el("c:marker", {}, kids.join(""));
}

function catRefXml(series, sheetRange) {
  const ci = series._cols.category ?? series._cols.x;
  return el("c:cat", {}, strRefXml(sheetRange(ci), series._cats));
}

function valRefXml(series, sheetRange, channel = "y") {
  return el("c:val", {}, numRefXml(sheetRange(series._cols[channel]), series._values[channel]));
}

// ----------------------------------------------------------------------------
// 各类型 series + chart 元素
// ----------------------------------------------------------------------------
function barSerXml(theme, s, sheetRange, idx, labels) {
  const kids = [
    el("c:idx", { val: s._index }),
    el("c:order", { val: s._index }),
    seriesNameXml(s.name, sheetRange.nameCol(s)),
  ];
  if (s.fill) {
    const fill = typeof s.fill === "string" ? fillXml(theme, s.fill) : null;
    const spPr = [];
    if (fill) spPr.push(fill);
    if (s.border && s.border.color) {
      const w = Math.round((s.border.width ?? 1) * 12700);
      spPr.push(el("a:ln", { w, cap: "flat", cmpd: "sng", algn: "ctr" }, fillXml(theme, s.border.color)));
    }
    if (spPr.length) kids.push(el("c:spPr", {}, spPr.join("")));
  }
  if (labels) kids.push(dLblsXml(theme, labels));
  kids.push(catRefXml(s, sheetRange), valRefXml(s, sheetRange));
  return el("c:ser", {}, kids.join(""));
}

function lineSerXml(theme, s, sheetRange, idx, labels) {
  const kids = [
    el("c:idx", { val: idx }),
    el("c:order", { val: idx }),
    seriesNameXml(s.name, sheetRange.nameCol(s)),
  ];
  const spPr = [];
  if (s.lineColor) spPr.push(lnXml(theme, s.lineColor, s.width ?? 2));
  if (spPr.length) kids.push(el("c:spPr", {}, spPr.join("")));
  const marker = markerXml(theme, s.marker, s.color);
  if (marker) kids.push(marker);
  if (labels) kids.push(dLblsXml(theme, labels));
  kids.push(catRefXml(s, sheetRange), valRefXml(s, sheetRange));
  if (s.smooth) kids.push(el("c:smooth", { val: "1" }));
  return el("c:ser", {}, kids.join(""));
}

function areaSerXml(theme, s, sheetRange, idx, labels) {
  const kids = [
    el("c:idx", { val: idx }),
    el("c:order", { val: idx }),
    seriesNameXml(s.name, sheetRange.nameCol(s)),
  ];
  const spPr = [];
  const fill = s.areaColor || hexA(s.color, 0.22);
  if (s.areaColor && typeof s.areaColor === "object") spPr.push(buildFill(theme, s.areaColor));
  else spPr.push(fillXml(theme, fill));
  if (s.lineColor || s.color) spPr.push(lnXml(theme, s.lineColor || s.color, s.width ?? 2));
  if (spPr.length) kids.push(el("c:spPr", {}, spPr.join("")));
  if (labels) kids.push(dLblsXml(theme, labels));
  kids.push(catRefXml(s, sheetRange), valRefXml(s, sheetRange));
  return el("c:ser", {}, kids.join(""));
}

function scatterSerXml(theme, s, sheetRange, idx, labels) {
  const kids = [
    el("c:idx", { val: idx }),
    el("c:order", { val: idx }),
    seriesNameXml(s.name, sheetRange.nameCol(s)),
  ];
  if (s.fill) kids.push(el("c:spPr", {}, fillXml(theme, s.fill)));
  const marker = markerXml(theme, s.marker, s.color);
  if (marker) kids.push(marker);
  if (labels) kids.push(dLblsXml(theme, labels));
  kids.push(
    el("c:xVal", {}, numRefXml(sheetRange(s._cols.x), s._values.x)),
    el("c:yVal", {}, numRefXml(sheetRange(s._cols.y), s._values.y))
  );
  return el("c:ser", {}, kids.join(""));
}

function bubbleSerXml(theme, s, sheetRange, idx, labels) {
  const kids = [
    el("c:idx", { val: idx }),
    el("c:order", { val: idx }),
    seriesNameXml(s.name, sheetRange.nameCol(s)),
  ];
  if (s.fill) kids.push(el("c:spPr", {}, fillXml(theme, s.fill)));
  if (labels) kids.push(dLblsXml(theme, labels));
  kids.push(
    el("c:xVal", {}, numRefXml(sheetRange(s._cols.x), s._values.x)),
    el("c:yVal", {}, numRefXml(sheetRange(s._cols.y), s._values.y)),
    el("c:bubbleSize", {}, numRefXml(sheetRange(s._cols.size), s._values.size)),
    el("c:bubble3D", { val: "0" })
  );
  return el("c:ser", {}, kids.join(""));
}

/** 股价图系列：cat + val（open-high-low-close 连续列范围；open 缺失 = HLC 3 列）。 */
/**
 * 股价图系列（对照用户 PowerPoint 手工文件 chart45/46：**1 个 candlestick 系列
 * 展开为 3/4 个 c:ser**——HLC（无 open）或 OHLC 每列一个 ser，cat 共享）：
 *   ser: idx/order + tx(列头) + spPr(ln noFill) + marker(symbol none) + cat + val + smooth 0
 */
function candlestickSerXml(theme, s, sheetRange, serIdx, labels) {
  const chs = s._cols.open != null ? ["open", "high", "low", "close"] : ["high", "low", "close"];
  return chs.map((ch, i) => {
    const idx = serIdx + i;
    const kids = [
      el("c:idx", { val: idx }),
      el("c:order", { val: idx }),
      seriesNameXml(s.name, sheetRange.colHeader(s._cols[ch])),
      el("c:spPr", {}, el("a:ln", { w: "38100", cap: "rnd" }, el("a:noFill"), el("a:round"))),
      el("c:marker", {}, el("c:symbol", { val: "none" })),
    ];
    if (labels) kids.push(dLblsXml(theme, labels));
    kids.push(
      catRefXml(s, sheetRange),
      el("c:val", {}, numRefXml(sheetRange(s._cols[ch]), s._values[ch]))
    );
    kids.push(el("c:smooth", { val: "0" }));
    return el("c:ser", {}, kids.join(""));
  }).join("");
}

/** upBars/downBars（对照用户文件 chart46：Excel 默认 up=lt1 白底灰边 / down=dk1 75% 黑底灰边）。 */
function upDownBarsXml(theme, s) {
  const up = s.upBars || {};
  const down = s.downBars || {};
  const upSpPr = [fillXml(theme, up.fill || "#FFFFFF")];
  const upLn = el("a:ln", { w: Math.round((up.border?.width ?? 1) * 12700), cap: "flat", cmpd: "sng", algn: "ctr" }, fillXml(theme, up.border?.color || "#666666"));
  upSpPr.push(upLn);
  const downSpPr = [fillXml(theme, down.fill || "#404040")];
  const downLn = el("a:ln", { w: Math.round((down.border?.width ?? 1) * 12700), cap: "flat", cmpd: "sng", algn: "ctr" }, fillXml(theme, down.border?.color || "#666666"));
  downSpPr.push(downLn);
  return el("c:upDownBars", {}, [
    el("c:gapWidth", { val: "150" }),
    el("c:upBars", {}, el("c:spPr", {}, upSpPr.join(""))),
    el("c:downBars", {}, el("c:spPr", {}, downSpPr.join(""))),
  ].join(""));
}

function pieSerXml(theme, s, sheetRange, idx, labels, palette) {
  const fills = Array.isArray(s.fill) ? s.fill : null;
  const pts = (s._values.value || []).map((_, r) =>
    el("c:dPt", {}, [
      el("c:idx", { val: r }),
      el("c:bubble3D", { val: "0" }),
      el("c:spPr", {}, fillXml(theme, fills ? fills[r % fills.length] : palette[r % palette.length])),
    ].join(""))
  ).join("");
  const kids = [
    el("c:idx", { val: idx }),
    el("c:order", { val: idx }),
    seriesNameXml(s.name, sheetRange.nameCol(s)),
    el("c:spPr", {}, fillXml(theme, s.color)),
    pts,
  ];
  if (labels) kids.push(dLblsXml(theme, labels));
  kids.push(catRefXml(s, sheetRange), valRefXml(s, sheetRange, "value"));
  return el("c:ser", {}, kids.join(""));
}

function radarSerXml(theme, s, sheetRange, idx, labels) {
  const kids = [
    el("c:idx", { val: idx }),
    el("c:order", { val: idx }),
    seriesNameXml(s.name, sheetRange.nameCol(s)),
  ];
  const spPr = [];
  if (s.areaColor || s.color) {
    if (s.areaColor && typeof s.areaColor === "object") spPr.push(buildFill(theme, s.areaColor));
    else spPr.push(fillXml(theme, s.areaColor || hexA(s.color, 0.22)));
  }
  if (s.lineColor || s.color) spPr.push(lnXml(theme, s.lineColor || s.color, s.width ?? 2));
  if (spPr.length) kids.push(el("c:spPr", {}, spPr.join("")));
  const marker = markerXml(theme, s.marker, s.color);
  if (marker) kids.push(marker);
  if (labels) kids.push(dLblsXml(theme, labels));
  kids.push(catRefXml(s, sheetRange), valRefXml(s, sheetRange));
  if (s.smooth) kids.push(el("c:smooth", { val: "1" }));
  return el("c:ser", {}, kids.join(""));
}

// ----------------------------------------------------------------------------
// 轴
// ----------------------------------------------------------------------------
function catAxXml(theme, id, crossId) {
  return (
    el("c:catAx", {}, [
      el("c:axId", { val: id }),
      el("c:scaling", {}, el("c:orientation", { val: "minMax" })),
      el("c:delete", { val: "0" }),
      el("c:axPos", { val: "b" }),
      el("c:numFmt", { formatCode: "General", sourceLinked: "0" }),
      el("c:majorTickMark", { val: "none" }),
      el("c:minorTickMark", { val: "none" }),
      el("c:tickLblPos", { val: "nextTo" }),
      el("c:spPr", {}, lnXml(theme, theme.colors?.line || "#d8dce1", 0.75)),
      txPrXml(theme, 900, "tx1"),
      el("c:crossAx", { val: crossId }),
      el("c:crosses", { val: "autoZero" }),
      el("c:auto", { val: "1" }),
      el("c:lblAlgn", { val: "ctr" }),
      el("c:lblOffset", { val: "100" }),
      el("c:noMultiLvlLbl", { val: "0" }),
    ].join(""))
  );
}

function valAxXml(theme, id, crossId, opts = {}) {
  const kids = [
    el("c:axId", { val: id }),
    el("c:scaling", {}, el("c:orientation", { val: "minMax" })),
    el("c:delete", { val: "0" }),
    el("c:axPos", { val: opts.pos || "l" }),
  ];
  if (!opts.hideGrid) {
    kids.push(el("c:majorGridlines", {}, el("c:spPr", {}, lnXml(theme, theme.colors?.line || "#e5e7eb", 0.5))));
  }
  kids.push(
    el("c:numFmt", { formatCode: "General", sourceLinked: "0" }),
    el("c:majorTickMark", { val: "none" }),
    el("c:minorTickMark", { val: "none" }),
    el("c:tickLblPos", { val: "nextTo" }),
    txPrXml(theme, 900, "tx1"),
    el("c:crossAx", { val: crossId }),
    el("c:crosses", { val: "autoZero" }),
    el("c:crossBetween", { val: "between" })
  );
  return el("c:valAx", {}, kids.join(""));
}

// ----------------------------------------------------------------------------
// 主入口
// ----------------------------------------------------------------------------
/**
 * 构建图表部件（chartN.xml + rels + xlsx）。
 * @returns {{xml, relsXml, xlsx, unsupported: string[]} | null} unsupported 非空
 *  时 xml/rels 为空（预览正常，导出跳过该元素并警告）。
 */
export function buildChartParts(theme, chartEl, chartIndex) {
  const { series, cats, warn } = resolveChartSeries(theme, chartEl);
  const types = [...new Set(series.map((s) => s.type))];
  const unsupported = types.filter((t) => !EXPORTABLE_CHART_TYPES.includes(t));
  if (unsupported.length) {
    console.warn(`[writer] 图表 ${chartEl.elementId} 类型 ${unsupported.join("/")} 暂不支持原生导出（待官方参考比对），已跳过`);
    return null;
  }

  const table = chartDataTable(chartEl);
  const rowCount = table.length;
  const dataRows = Math.max(0, rowCount - 1);
  const sheetOrder = buildSheetOrder(chartEl, series);
  // 重排后：原列号 → 新列号
  const newIdxOf = new Map(sheetOrder.map((old, ni) => [old, ni]));

  const sheetRange = (colIdx) => {
    const L = colLetter(newIdxOf.get(colIdx) ?? 0);
    return dataRows > 0 ? `Sheet1!$${L}$2:$${L}$${rowCount}` : `Sheet1!$${L}$1:$${L}$1`;
  };
  // 系列名引用列：按类型取主值列（分类列放 A，系列名列须为值列）
  const NAME_CH = { bar: "y", line: "y", area: "y", radar: "y", scatter: "y", bubble: "y", candlestick: "high", pie: "value" };
  sheetRange.nameCol = (s) => newIdxOf.get(s._cols[NAME_CH[s.type] ?? "y"]) ?? 0;
  sheetRange.colHeader = (colIdx) => newIdxOf.get(colIdx) ?? 0; // 列头引用（股价图各通道列）
  sheetRange.rowEnd = () => rowCount;

  // 按类型分组输出 chartElems（混合图共享轴）
  const groups = new Map();
  for (const s of series) {
    if (!groups.has(s.type)) groups.set(s.type, []);
    groups.get(s.type).push(s);
  }

  const chartElems = [];
  let serCounter = 0;
  const isStacked = series.some((s) => s.stack && s.stack !== "percent" && (s.type === "bar" || s.type === "area"));
  const isPercent = series.some((s) => s.stack === "percent");
  const isStream = series.some((s) => s.stack === "stream");
  const hasSmooth = series.some((s) => s.smooth && (s.type === "line" || s.type === "area" || s.type === "radar"));

  for (const [type, groupSeries] of groups) {
    if (type === "bar") {
      const grouping = isPercent ? "percentStacked" : isStacked ? "stacked" : "clustered";
      const kids = [
        el("c:barDir", { val: "col" }),
        el("c:grouping", { val: grouping }),
        el("c:varyColors", { val: "0" }),
        (() => {
          const ss = [];
          for (const s of groupSeries) ss.push(barSerXml(theme, s, sheetRange, serCounter++, resolveDataLabels(chartEl, s, "bar")));
          return ss.join("");
        })(),
      ];
      if (isStacked || isPercent) kids.push(el("c:overlap", { val: "100" }));
      kids.push(el("c:axId", { val: "1" }), el("c:axId", { val: "2" }));
      chartElems.push(el("c:barChart", {}, kids.join("")));
    } else if (type === "line" || type === "area") {
      const kids = [
        el("c:grouping", { val: "standard" }),
        el("c:varyColors", { val: "0" }),
        (() => {
          const ss = [];
          for (const s of groupSeries) {
            ss.push(type === "line"
              ? lineSerXml(theme, s, sheetRange, serCounter++, resolveDataLabels(chartEl, s, "line"))
              : areaSerXml(theme, s, sheetRange, serCounter++, resolveDataLabels(chartEl, s, "area")));
          }
          return ss.join("");
        })(),
      ];
      if (hasSmooth && type === "line") kids.push(el("c:smooth", { val: "1" }));
      kids.push(el("c:axId", { val: "1" }), el("c:axId", { val: "2" }));
      chartElems.push(el(`c:${type === "area" ? "areaChart" : "lineChart"}`, {}, kids.join("")));
    } else if (type === "scatter") {
      chartElems.push(
        el("c:scatterChart", {}, [
          el("c:scatterStyle", { val: "lineMarker" }),
          el("c:varyColors", { val: "0" }),
          (() => {
            const ss = [];
            for (const s of groupSeries) ss.push(scatterSerXml(theme, s, sheetRange, serCounter++, resolveDataLabels(chartEl, s, "scatter")));
            return ss.join("");
          })(),
          el("c:axId", { val: "1" }),
          el("c:axId", { val: "2" }),
        ].join(""))
      );
    } else if (type === "bubble") {
      chartElems.push(
        el("c:bubbleChart", {}, [
          el("c:varyColors", { val: "0" }),
          (() => {
            const ss = [];
            for (const s of groupSeries) ss.push(bubbleSerXml(theme, s, sheetRange, serCounter++, resolveDataLabels(chartEl, s, "bubble")));
            return ss.join("");
          })(),
          el("c:axId", { val: "1" }),
          el("c:axId", { val: "2" }),
        ].join(""))
      );
    } else if (type === "candlestick") {
      // PowerPoint 原生 = c:stockChart：1 系列展开 3/4 个 c:ser + hiLowLines
      // + upDownBars（仅 OHLC）。overlay 系列（line 均线）走各自 chart 元素共享轴。
      const isOHLC = groupSeries[0]._cols.open != null;
      const kids = [];
      for (const s of groupSeries) {
        const n = s._cols.open != null ? 4 : 3;
        kids.push(candlestickSerXml(theme, s, sheetRange, serCounter, resolveDataLabels(chartEl, s, "candlestick")));
        serCounter += n;
      }
      const wick = series.find((s) => s.wickStyle)?.wickStyle;
      if (wick) {
        kids.push(el("c:hiLowLines", {}, el("c:spPr", {}, lnXml(theme, wick.color || "#666666", wick.width || 1))));
      } else {
        kids.push(el("c:hiLowLines", {}, el("c:spPr", {}, lnXml(theme, "#808080", 0.75))));
      }
      if (isOHLC) kids.push(upDownBarsXml(theme, groupSeries[0]));
      kids.push(el("c:axId", { val: "1" }), el("c:axId", { val: "2" }));
      chartElems.push(el("c:stockChart", {}, kids.join("")));
    } else if (type === "pie") {
      const s = groupSeries[0];
      const innerRadius = s.innerRadius || 0;
      const isDonut = innerRadius > 0;
      const kids = [el("c:varyColors", { val: "1" })];
      kids.push(pieSerXml(theme, s, sheetRange, serCounter++, resolveDataLabels(chartEl, s, "pie"), DEFAULT_CHART_PALETTE));
      if (s.startAngle) kids.push(el("c:firstSliceAng", { val: Math.round(s.startAngle) }));
      if (isDonut) kids.push(el("c:holeSize", { val: Math.max(1, Math.min(90, Math.round(innerRadius * 100))) }));
      chartElems.push(el(`c:${isDonut ? "doughnutChart" : "pieChart"}`, {}, kids.join("")));
    } else if (type === "radar") {
      chartElems.push(
        el("c:radarChart", {}, [
          el("c:radarStyle", { val: "marker" }),
          el("c:varyColors", { val: "0" }),
          (() => {
            const ss = [];
            for (const s of groupSeries) ss.push(radarSerXml(theme, s, sheetRange, serCounter++, resolveDataLabels(chartEl, s, "radar")));
            return ss.join("");
          })(),
          el("c:axId", { val: "1" }),
          el("c:axId", { val: "2" }),
        ].join(""))
      );
    }
  }

  // 轴
  const primary = types[0];
  let axes = "";
  if (primary === "pie") {
    axes = "";
  } else if (primary === "scatter" || primary === "bubble") {
    axes = valAxXml(theme, 1, 2, { pos: "b", hideGrid: true }) + valAxXml(theme, 2, 1, {});
  } else {
    axes = catAxXml(theme, 1, 2) + valAxXml(theme, 2, 1, {});
  }

  // 标题（官方 string | TitleConfig）
  const titleCfg = chartEl.title;
  const titleText = typeof titleCfg === "string" ? titleCfg : titleCfg?.text || "";
  const titleXml = titleText
    ? (
      `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/>` +
      `<a:p><a:pPr/><a:r><a:rPr lang="zh-CN" sz="1400"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/></a:rPr><a:t>${esc(titleText)}</a:t></a:r></a:p>` +
      `</c:rich></c:tx><c:layout/></c:title>` +
      `<c:autoTitleDeleted val="0"/>`
    )
    : `<c:autoTitleDeleted val="1"/>`;

  // 图例（官方 LegendConfig：默认按类型表；legend:false 全局关）
  const legendDefaultOff = new Set(["waterfall", "treemap", "sunburst", "sankey", "heatmap"]);
  const legendCfg = chartEl.legend;
  let legendXml = "";
  if (legendCfg !== false && !(legendCfg === undefined && types.every((t) => legendDefaultOff.has(t)))) {
    const pos = typeof legendCfg === "object" && legendCfg.position ? legendCfg.position : "bottom";
    const posVal = { top: "t", bottom: "b", left: "l", right: "r" }[pos] || "b";
    legendXml = `<c:legend><c:legendPos val="${posVal}"/><c:overlay val="0"/>${txPrXml(theme, 900, "tx1")}</c:legend>`;
  }

  // nullHandling（多系列取第一个非空；官方 radar 默认 connect）
  const nh = series.map((s) => s.nullHandling).find((v) => v) || (primary === "radar" ? "connect" : "gap");
  const disp = nh === "zero" ? "zero" : nh === "connect" ? "span" : "gap";

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

/** 图表元素 → slide 内 graphicFrame（引用 chart part，媒体/部件由 pptx.js 汇总）。 */
export function chartXml(theme, chartEl, ctx, chartId) {
  const [x, y, w, h] = chartEl.bounds;
  const rId = ctx.chartRef ? ctx.chartRef(chartId) : "rIdChart1";
  return (
    el("p:graphicFrame", {}, [
      el("p:nvGraphicFramePr", {}, [
        el("p:cNvPr", { id: ctx.nextId(), name: escAttr(chartEl.elementId) }),
        el("p:cNvGraphicFramePr", {}, el("a:graphicFrameLocks", { noGrp: "1" })),
        el("p:nvPr"),
      ]),
      el("p:xfrm", {}, [
        el("a:off", { x: Math.round(x * 12700), y: Math.round(y * 12700) }),
        el("a:ext", { cx: Math.round(w * 12700), cy: Math.round(h * 12700) }),
      ]),
      el("a:graphic", {}, el("a:graphicData", { uri: "http://schemas.openxmlformats.org/drawingml/2006/chart" }, el("c:chart", { "r:id": rId, "xmlns:c": "http://schemas.openxmlformats.org/drawingml/2006/chart" }))),
    ].join(""))
  );
}
