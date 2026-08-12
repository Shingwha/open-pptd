// ============================================================================
// writer/chart.js — 图表导出（原生可编辑 Chart XML + 嵌入 xlsx）
// ----------------------------------------------------------------------------
// C3 对齐官方（对照 tests/projects/chart/reference/test-chart-all.pptx 由 python-pptx 生成的
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
import { resolveChartSeries, chartDataTable, isNumericColumn, resolveDataLabels, toAxisArray, resolveChartDirection, seriesAxisIndex, seriesChannels, hierarchyColor } from "../core/chart.js";
import { resolveColor, resolveFont, themeChartPalette } from "../core/theme.js";
import { buildFill, buildLn, buildShadow } from "./drawing.js";
import { ZipWriter } from "./zip.js";
import { buildChartStyleXml, buildChartColorStyleXml } from "./chartex-style.js";

/** 原生可导出的类型（经典 c:chartSpace 体系）。 */
export const EXPORTABLE_CHART_TYPES = ["bar", "line", "area", "scatter", "bubble", "candlestick", "pie", "radar"];

/** chartEx 扩展体系类型（PowerPoint 2016+ 新图表，cx: 命名空间）。 */
export const CHARTEX_TYPES = ["waterfall", "treemap", "sunburst"];

/** 1×1 透明 PNG（chartEx mc:Fallback 占位预览图）。 */
const TINY_PNG = (() => {
  const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
})();

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
 * 股价图按列范围识别；水平柱的分类列在 y 通道）：
 *   A 列 = 分类列；candlestick 列组连续；其余系列引用列按系列顺序；未引用列尾随。
 * @returns {number[]} 新列序（原列索引数组）
 */
export function buildSheetOrder(el, series, horizontal = false) {
  const cols = el.data?.cols || [];
  const order = [];
  const push = (ci) => { if (ci >= 0 && !order.includes(ci)) order.push(ci); };
  // 1. 分类列（第一个系列的 x/category；水平柱 = y 通道）
  const catSeries = series.find((s) => (horizontal ? s._cols.y != null : (s._cols.x != null || s._cols.category != null)));
  if (catSeries) push(horizontal ? catSeries._cols.y : (catSeries._cols.x ?? catSeries._cols.category));
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
  // 渐变对象（官方系列 fill 支持 GradientFill）→ buildFill；字符串色 → solidFill
  if (color && typeof color === "object") return buildFill(theme, color);
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

/** 系列线条（a:ln，主题色解析 + HEX8 + lineStyle → prstDash）。 */
function lnXml(theme, color, widthPt = 2, style = "solid") {
  // 渐变对象（官方 lineColor/areaColor 支持 GradientFill）→ buildFill
  if (color && typeof color === "object") {
    const kids = [buildFill(theme, color)];
    const dash = { dash: "dash", dot: "dot" }[style];
    if (dash) kids.push(el("a:prstDash", { val: dash }));
    return el("a:ln", { w: Math.round(widthPt * 12700), cap: "flat", cmpd: "sng", algn: "ctr" }, kids.join(""));
  }
  let c = resolveColor(theme, color) || "#000000";
  let a = null;
  if (/^#[0-9a-fA-F]{8}$/.test(c)) {
    c = c.slice(0, 7);
    a = parseInt(c.slice(7), 16) / 255;
  }
  const inner = a == null
    ? el("a:srgbClr", { val: hexToRgbVal(c) })
    : el("a:srgbClr", { val: hexToRgbVal(c) }, el("a:alpha", { val: Math.round(a * 100000) }));
  const kids = [el("a:solidFill", {}, inner)];
  const dash = { dash: "dash", dot: "dot" }[style];
  if (dash) kids.push(el("a:prstDash", { val: dash }));
  return el("a:ln", { w: Math.round(widthPt * 12700), cap: "flat", cmpd: "sng", algn: "ctr" }, kids.join(""));
}

/** 文本框属性（c:txPr；label 配置 → 字号/颜色/字体覆盖）。 */
function txPrXml(theme, size = 900, color = "tx1", label = null) {
  const fonts = resolveFont(theme, label?.fontFamily || null);
  const defRPrKids = [];
  const lblColor = label && typeof label === "object" && label.color ? resolveColor(theme, label.color) : null;
  if (lblColor) defRPrKids.push(el("a:solidFill", {}, el("a:srgbClr", { val: hexToRgbVal(lblColor) })));
  else defRPrKids.push(el("a:solidFill", {}, el("a:schemeClr", { val: color })));
  defRPrKids.push(
    el("a:latin", { typeface: fonts.latin }),
    el("a:ea", { typeface: fonts.ea }),
    el("a:cs", { typeface: fonts.ea })
  );
  const sz = label && typeof label === "object" && label.fontSize != null ? Math.round(label.fontSize * 100) : size;
  return (
    el("c:txPr", {}, [
      el("a:bodyPr"),
      el("a:lstStyle"),
      el("a:p", {}, el("a:pPr", {}, el("a:defRPr", { sz }, defRPrKids.join("")))),
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
      values.map((v, i) => el("c:pt", { idx: i }, el("c:v", {}, v == null ? "" : String(v)))).join(""),
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

/** 官方 dataLabels → c:dLbls（content: value/percentage/category + numberFormat + 样式）。 */
function dLblsXml(theme, cfg, globalFamily) {
  const content = cfg?.content || "value";
  const kids = [];
  if (cfg?.numberFormat) kids.push(el("c:numFmt", { formatCode: cfg.numberFormat, sourceLinked: "0" }));
  kids.push(
    el("c:spPr", {}, el("a:noFill")),
    txPrXml(theme, cfg?.fontSize ? Math.round(cfg.fontSize * 100) : 900, "tx1", { ...(cfg?.color ? { color: cfg.color } : {}), ...(cfg?.fontFamily || globalFamily ? { fontFamily: cfg?.fontFamily || globalFamily } : {}) }),
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

function catRefXml(ch, sheetRange) {
  return el("c:cat", {}, strRefXml(sheetRange(ch.col), ch.vals));
}

function valRefXml(ch, sheetRange) {
  return el("c:val", {}, numRefXml(sheetRange(ch.col), ch.vals));
}

// ----------------------------------------------------------------------------
// 各类型 series + chart 元素
// ----------------------------------------------------------------------------
function barSerXml(theme, s, sheetRange, idx, labels, chs) {
  const kids = [
    el("c:idx", { val: s._index }),
    el("c:order", { val: s._index }),
    seriesNameXml(s.name, sheetRange.nameCol(s)),
  ];
  // s.color = fill || 主题色循环默认（模型解析）；fillXml 统一字符串色 + 渐变
  if (s.color) {
    const spPr = [fillXml(theme, s.color)];
    if (s.border && s.border.color) {
      const w = Math.round((s.border.width ?? 1) * 12700);
      spPr.push(el("a:ln", { w, cap: "flat", cmpd: "sng", algn: "ctr" }, fillXml(theme, s.border.color)));
    }
    if (spPr.length) kids.push(el("c:spPr", {}, spPr.join("")));
  }
  if (labels) kids.push(dLblsXml(theme, labels));
  kids.push(catRefXml(chs.cat, sheetRange), valRefXml(chs.val, sheetRange));
  return el("c:ser", {}, kids.join(""));
}

function lineSerXml(theme, s, sheetRange, idx, labels, chs) {
  const kids = [
    el("c:idx", { val: idx }),
    el("c:order", { val: idx }),
    seriesNameXml(s.name, sheetRange.nameCol(s)),
  ];
  const spPr = [];
  if (s.lineColor) spPr.push(lnXml(theme, s.lineColor, s.width ?? 2, s.lineStyle));
  if (spPr.length) kids.push(el("c:spPr", {}, spPr.join("")));
  const marker = markerXml(theme, s.marker, s.color);
  if (marker) kids.push(marker);
  if (labels) kids.push(dLblsXml(theme, labels));
  kids.push(catRefXml(chs.cat, sheetRange), valRefXml(chs.val, sheetRange));
  if (s.smooth) kids.push(el("c:smooth", { val: "1" }));
  return el("c:ser", {}, kids.join(""));
}

function areaSerXml(theme, s, sheetRange, idx, labels, chs) {
  const kids = [
    el("c:idx", { val: idx }),
    el("c:order", { val: idx }),
    seriesNameXml(s.name, sheetRange.nameCol(s)),
  ];
  const spPr = [];
  const fill = s.areaColor || hexA(s.color, 0.22);
  if (s.areaColor && typeof s.areaColor === "object") spPr.push(buildFill(theme, s.areaColor));
  else spPr.push(fillXml(theme, fill));
  if (s.lineColor || s.color) spPr.push(lnXml(theme, s.lineColor || s.color, s.width ?? 2, s.lineStyle));
  if (spPr.length) kids.push(el("c:spPr", {}, spPr.join("")));
  if (labels) kids.push(dLblsXml(theme, labels));
  kids.push(catRefXml(chs.cat, sheetRange), valRefXml(chs.val, sheetRange));
  return el("c:ser", {}, kids.join(""));
}

function scatterSerXml(theme, s, sheetRange, idx, labels, chs) {
  const kids = [
    el("c:idx", { val: idx }),
    el("c:order", { val: idx }),
    seriesNameXml(s.name, sheetRange.nameCol(s)),
  ];
  // s.color = fill || 主题色循环默认（模型解析）——不配 fill 也要写 spPr，
  // 否则 PowerPoint 对 bubbleChart 等不自动区分系列色（06 页实测只有一种气泡）
  if (s.color) kids.push(el("c:spPr", {}, fillXml(theme, s.color)));
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
  // s.color = fill || 主题色循环默认（同 scatter）
  if (s.color) kids.push(el("c:spPr", {}, fillXml(theme, s.color)));
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
    const chs = { cat: { col: s._cols.x, vals: s._cats }, val: { col: s._cols[ch], vals: s._values[ch] } };
    kids.push(
      catRefXml(chs.cat, sheetRange),
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
  // 官方 fill：数组按点循环；单色字符串 = 所有点同色；缺省 = color 或主题色循环
  const ptFill = (r) => {
    if (typeof s.fill === "string") return s.fill;
    if (fills) return fills[r % fills.length];
    return s.color || palette[r % palette.length];
  };
  const pts = (s._values.value || []).map((_, r) => {
    const spPrKids = [fillXml(theme, ptFill(r))];
    if (s.border && s.border.color) {
      const w = Math.round((s.border.width ?? 1) * 12700);
      spPrKids.push(el("a:ln", { w, cap: "flat", cmpd: "sng", algn: "ctr" }, fillXml(theme, s.border.color)));
    }
    return el("c:dPt", {}, [
      el("c:idx", { val: r }),
      el("c:bubble3D", { val: "0" }),
      el("c:spPr", {}, spPrKids.join("")),
    ].join(""));
  }).join("");
  const kids = [
    el("c:idx", { val: idx }),
    el("c:order", { val: idx }),
    seriesNameXml(s.name, sheetRange.nameCol(s)),
    el("c:spPr", {}, fillXml(theme, s.color)),
    pts,
  ];
  if (labels) kids.push(dLblsXml(theme, labels));
  const chs = { cat: { col: s._cols.category, vals: s._cats }, val: { col: s._cols.value, vals: s._values.value } };
  kids.push(catRefXml(chs.cat, sheetRange), valRefXml(chs.val, sheetRange));
  return el("c:ser", {}, kids.join(""));
}

function radarSerXml(theme, s, sheetRange, idx, labels, chs) {
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
  if (s.lineColor || s.color) spPr.push(lnXml(theme, s.lineColor || s.color, s.width ?? 2, s.lineStyle));
  if (spPr.length) kids.push(el("c:spPr", {}, spPr.join("")));
  const marker = markerXml(theme, s.marker, s.color);
  if (marker) kids.push(marker);
  if (labels) kids.push(dLblsXml(theme, labels));
  kids.push(catRefXml(chs.cat, sheetRange), valRefXml(chs.val, sheetRange));
  if (s.smooth) kids.push(el("c:smooth", { val: "1" }));
  return el("c:ser", {}, kids.join(""));
}

// ----------------------------------------------------------------------------
// 轴（官方 AxisConfig 全字段 → catAx/valAx）
// ----------------------------------------------------------------------------
/** LineStyleConfig | boolean → a:ln 元素（axisLine/gridLine 共用）。null = 不输出。 */
function axisLnXml(theme, cfg, fallbackColor, fallbackWidth = 0.75) {
  if (cfg === false) return null; // 调用方决定省略或 noFill
  const o = typeof cfg === "object" ? cfg : {};
  const color = o.color ? resolveColor(theme, o.color) : resolveColor(theme, fallbackColor) || "#6b7280";
  let rgb = color;
  let alpha = null;
  if (/^#[0-9a-fA-F]{8}$/.test(rgb)) {
    alpha = parseInt(rgb.slice(7), 16) / 255;
    rgb = rgb.slice(0, 7);
  }
  const inner = alpha == null
    ? el("a:srgbClr", { val: hexToRgbVal(rgb) })
    : el("a:srgbClr", { val: hexToRgbVal(rgb) }, el("a:alpha", { val: Math.round(alpha * 100000) }));
  const kids = [el("a:solidFill", {}, inner)];
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
 * @param {object} p {theme, id, crossId, kind: "cat"|"val", pos, cfg, secondary, gridOnValOnly}
 *   secondary: 次轴——类别轴 delete=1（数据不重复，仅用于配轴）；数值轴换侧
 */
function axisXml(theme, { id, crossId, kind, pos, cfg = {}, secondary = false, tickLabels = true }) {
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
  kids.push(txPrXml(theme, 900, "tx1", cfg.label && typeof cfg.label === "object" ? cfg.label : null));
  kids.push(el("c:crossAx", { val: crossId }));
  kids.push(el("c:crosses", { val: "autoZero" }));
  if (kind === "val") kids.push(el("c:crossBetween", { val: "between" }));
  else kids.push(el("c:auto", { val: "1" }), el("c:lblAlgn", { val: "ctr" }), el("c:lblOffset", { val: "100" }), el("c:noMultiLvlLbl", { val: "0" }));
  return el(`c:${kind === "cat" ? "catAx" : "valAx"}`, {}, kids.join(""));
}

/**
 * 整图轴组（官方 §5.3 轴数组规则）：主轴 (1,2)；有系列用 index>0 →
 * 次轴 (3,4)（数值轴换侧 + 隐藏类别轴），与用户参考 chart43/47/48 结构一致。
 * @param {object} p {theme, el, series, horizontal, axes: "catVal"|"valVal"|"radar"}
 */
function buildAxesXml(theme, el, series, horizontal, mode = "catVal") {
  const maxIdx = Math.max(0, ...series.map((s) => seriesAxisIndex(s, horizontal)));
  const hasSecondary = maxIdx > 0;
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
      out.push(axisXml(theme, { id, crossId: id + 1, kind: "val", pos: "t", cfg: xAxes[i] || {} }));
      out.push(axisXml(theme, { id: id + 1, crossId: id, kind: "val", pos: "r", cfg: yAxes[i] || {} }));
    }
    return out.join("");
  }
  // catVal（bar/line/area/candlestick/radar 等）
  out.push(axisXml(theme, { id: 1, crossId: 2, kind: "cat", pos: catPos, cfg: catCfg }));
  out.push(axisXml(theme, { id: 2, crossId: 1, kind: "val", pos: valPos, cfg: valCfg }));
  for (let i = 1; i <= maxIdx; i++) {
    // 次轴：数值轴换侧 + 隐藏类别轴（配轴用，delete=1），对照用户参考 chart43/47/48
    const id = 1 + i * 2;
    out.push(axisXml(theme, { id, crossId: id + 1, kind: "val", pos: secValPos, cfg: horizontal ? xAxes[i] || {} : yAxes[i] || {}, secondary: false }));
    out.push(axisXml(theme, { id: id + 1, crossId: id, kind: "cat", pos: catPos, cfg: horizontal ? yAxes[i] || {} : xAxes[i] || {}, secondary: true }));
  }
  return out.join("");
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
  const isStacked = series.some((s) => s.stack && s.stack !== "percent" && (s.type === "bar" || s.type === "area"));
  const isPercent = series.some((s) => s.stack === "percent");
  const isStream = series.some((s) => s.stack === "stream");
  const hasSmooth = series.some((s) => s.smooth && (s.type === "line" || s.type === "area" || s.type === "radar"));
  // 柱宽/槽宽（官方 barWidth → gapWidth；categoryGap 保持 ×750 校准约定）
  const gapWidthVal = chartEl.barWidth != null
    ? Math.round((1 - chartEl.barWidth) / chartEl.barWidth * 100)
    : chartEl.categoryGap != null ? Math.round(chartEl.categoryGap * 750) : 150;
  const hasBarWidth = chartEl.barWidth != null || chartEl.categoryGap != null;
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
      if (isStacked || isPercent) kids.push(el("c:overlap", { val: "100" }));
      else if (chartEl.barGap != null) kids.push(el("c:overlap", { val: -Math.round(chartEl.barGap * 100) }));
      if (hasBarWidth) kids.push(el("c:gapWidth", { val: gapWidthVal }));
      kids.push(el("c:axId", { val: catId }), el("c:axId", { val: valId }));
      chartElems.push(el("c:barChart", {}, kids.join("")));
    } else if (type === "line" || type === "area") {
      const kids = [
        el("c:grouping", { val: "standard" }),
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
      const kids = [];
      for (const s of groupSeries) {
        const n = s._cols.open != null ? 4 : 3;
        kids.push(candlestickSerXml(theme, s, sheetRange, serCounter, labelsOf(s, "candlestick")));
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
      chartElems.push(
        el("c:radarChart", {}, [
          el("c:radarStyle", { val: "marker" }),
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
    axes = axisXml(theme, { id: 1, crossId: 2, kind: "cat", pos: "b", cfg: catCfg }) +
      axisXml(theme, { id: 2, crossId: 1, kind: "val", pos: "l", cfg: valCfg });
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
  const legendDefaultOff = new Set(["waterfall", "treemap", "sunburst", "sankey", "heatmap"]);
  const legendCfg = chartEl.legend;
  let legendXml = "";
  if (legendCfg !== false && !(legendCfg === undefined && types.every((t) => legendDefaultOff.has(t)))) {
    const pos = typeof legendCfg === "object" && legendCfg.position ? legendCfg.position : "bottom";
    const posVal = { top: "t", bottom: "b", left: "l", right: "r" }[pos] || "b";
    const legendLabel = typeof legendCfg === "object" ? legendCfg : null;
    const legendFontFamily = legendLabel?.fontFamily || chartEl.fontFamily;
    legendXml = `<c:legend><c:legendPos val="${posVal}"/><c:overlay val="0"/>${txPrXml(theme, legendLabel?.fontSize ? Math.round(legendLabel.fontSize * 100) : 900, "tx1", { ...(legendLabel?.color ? { color: legendLabel.color } : {}), ...(legendFontFamily ? { fontFamily: legendFontFamily } : {}) })}</c:legend>`;
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

/** 图表元素 → slide 内 graphicFrame（引用 chart part，媒体/部件由 pptx.js 汇总）。 */
export function chartXml(theme, chartEl, ctx, chartId) {
  const [x, y, w, h] = chartEl.bounds;
  const isChartEx = CHARTEX_TYPES.includes(chartEl.series?.[0]?.type);
  const rId = ctx.chartRef ? ctx.chartRef(chartId, isChartEx ? "chartEx" : "chart") : "rIdChart1";
  const uri = isChartEx
    ? "http://schemas.microsoft.com/office/drawing/2014/chartex"
    : "http://schemas.openxmlformats.org/drawingml/2006/chart";
  const inner = isChartEx
    ? el("cx:chart", { "r:id": rId, "xmlns:cx": "http://schemas.microsoft.com/office/drawing/2014/chartex", "xmlns:r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships" })
    : el("c:chart", { "r:id": rId, "xmlns:c": "http://schemas.openxmlformats.org/drawingml/2006/chart" });
  const frameId = ctx.nextId();
  const name = escAttr(chartEl.elementId);
  const xfrm =
    el("a:off", { x: Math.round(x * 12700), y: Math.round(y * 12700) }) +
    el("a:ext", { cx: Math.round(w * 12700), cy: Math.round(h * 12700) });
  const graphicFrame = el("p:graphicFrame", {}, [
    el("p:nvGraphicFramePr", {}, [
      el("p:cNvPr", { id: frameId, name }),
      el("p:cNvGraphicFramePr", {}, el("a:graphicFrameLocks", { noGrp: "1" })),
      el("p:nvPr"),
    ]),
    el("p:xfrm", {}, xfrm),
    el("a:graphic", {}, el("a:graphicData", { uri }, inner)),
  ].join(""));
  if (!isChartEx) return graphicFrame;
  // chartEx（PowerPoint 2016+ 新图表）：官方结构 = mc:AlternateContent 包裹，
  // Choice Requires="cx4"（2016/5/10 chartex 命名空间）+ Fallback 预览图
  // （对照用户 waterfall-color.pptx 实测）。缺 Fallback 违反 mc 规范（必含
  // Choice + Fallback），Fallback 用 1×1 透明 PNG 占位（生成不了图表截图）。
  const media = ctx.addMedia(TINY_PNG, "png");
  const fallbackPic = el("p:pic", {}, [
    el("p:nvPicPr", {}, [
      el("p:cNvPr", { id: frameId, name }),
      el("p:cNvPicPr", {}, el("a:picLocks", {
        noGrp: "1", noRot: "1", noChangeAspect: "1", noMove: "1", noResize: "1",
        noEditPoints: "1", noAdjustHandles: "1", noChangeArrowheads: "1", noChangeShapeType: "1",
      })),
      el("p:nvPr"),
    ]),
    el("p:blipFill", {}, el("a:blip", { "r:embed": media.id }) + el("a:stretch", {}, el("a:fillRect"))),
    el("p:spPr", {}, xfrm + el("a:prstGeom", { prst: "rect" }, el("a:avLst"))),
  ].join(""));
  return el("mc:AlternateContent", {
    "xmlns:mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
    "xmlns:cx4": "http://schemas.microsoft.com/office/drawing/2016/5/10/chartex",
  }, el("mc:Choice", { Requires: "cx4" }, graphicFrame) + el("mc:Fallback", {}, fallbackPic));
}

// ----------------------------------------------------------------------------
// chartEx（waterfall / treemap / sunburst）——PowerPoint 2016+ 扩展体系
// 对照用户手工参考（tests/projects/chart/reference/test-chart-all-powerpoint.pptx chartEx1/2/6）：
//   - 数据：cx:data > cx:strDim（每级一列，lvl 从最深到最浅）+ cx:numDim
//   - 层级：treemap/sunburst 用多级 lvl（扁平表 = 叶子路径行）；
//     waterfall 用 cx:subtotals idx 标记汇总行（官方 isTotal 语义）
//   - series layoutId 决定类型（treemap/sunburst/waterfall）
//   - 引用：slide graphicData uri=chartex + cx:chart；rels type chartEx；
//     ContentType application/vnd.ms-office.chartex+xml；
//     xlsx 命名 Microsoft_Excel_WorksheetN.xlsx
// ----------------------------------------------------------------------------

/** 父子表 → 叶子路径行（[最深...最浅] 每级一列，浅层列用最浅值补齐）。
 *  levels: 官方 Treemap/Sunburst.levels——显示层级数；超出部分聚合到边界层。 */
function buildHierarchyRows(el, s, maxLevels = null) {
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


/**
 * treemap/sunburst fill → cx:dataPt 逐点色（对照用户 treemap-color.pptx 实测）：
 *   <cx:dataPt idx="N"><cx:spPr><a:solidFill><a:srgbClr val="RRGGBB"/></a:solidFill></cx:spPr></cx:dataPt>
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
  const leafIdx = new Map(); // 叶子节点名（路径标识）→ idx。同一路径可能重复？用节点对象标识
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
    const rgb = /^#[0-9a-fA-F]{6}$/.test(c) ? c.slice(1) : null;
    if (!rgb) return "";
    const alpha = /^#[0-9a-fA-F]{8}$/.test(c) ? Math.round((parseInt(c.slice(7), 16) / 255) * 100000) : null;
    const color = alpha == null
      ? `<a:srgbClr val="${rgb}"/>`
      : `<a:srgbClr val="${rgb}"><a:alpha val="${alpha}"/></a:srgbClr>`;
    return `<cx:dataPt idx="${idxOfNode.get(node)}"><cx:spPr><a:solidFill>${color}</a:solidFill></cx:spPr></cx:dataPt>`;
  }).join("");
  return out;
}

/**
 * chartEx 部件（waterfall/treemap/sunburst）。
 * @returns {{chartEx: true, xml, relsXml, xlsx}} | null
 */
function buildChartExParts(theme, chartEl, chartIndex) {
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
    // 三分类色（官方 totalBars/increaseBars/decreaseBars → cx:dataPt 逐点色；
    // 对照用户 waterfall-color.pptx 实测：<cx:dataPt idx="N"><cx:spPr><a:solidFill>…
    // chartEx 无逐点边框，border 忽略）
    dataPoints = rows.map((r, i) => {
      const isTotal = isTotalCol != null ? r[isTotalCol] === true : false;
      const yv = Number(r[s._cols.y] ?? 0);
      const cfg = isTotal ? s.totalBars : yv >= 0 ? s.increaseBars : s.decreaseBars;
      if (!cfg || !cfg.fill) return "";
      const c = resolveColor(theme, cfg.fill);
      if (!c) return "";
      const rgb = /^#[0-9a-fA-F]{6}$/.test(c) ? c.slice(1) : null;
      if (!rgb) return "";
      const alpha = /^#[0-9a-fA-F]{8}$/.test(c) ? Math.round((parseInt(c.slice(7), 16) / 255) * 100000) : null;
      const color = alpha == null
        ? `<a:srgbClr val="${rgb}"/>`
        : `<a:srgbClr val="${rgb}"><a:alpha val="${alpha}"/></a:srgbClr>`;
      return `<cx:dataPt idx="${i}"><cx:spPr><a:solidFill>${color}</a:solidFill></cx:spPr></cx:dataPt>`;
    }).join("");
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
      ? `<cx:dataLabels pos="${type === "sunburst" ? "ctr" : "inEnd"}"><cx:visibility seriesName="0" categoryName="1" value="0"/></cx:dataLabels>`
      : "";
    // fill 颜色（官方派生规则 → cx:dataPoint 逐叶色）：
    //   单值/1D 数组按根节点循环，子节点沿 HSL.L 每级 -10；2D 数组外层按根、内层按级
    dataPoints = buildLeafDataPoints(theme, s, leafRows);
  }

  // —— 层级列数据写入 xlsx：chartEx 的 xlsx 由 buildChartExXlsx 专用构建（见下） ——

  const guid = () => `{${"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  })}}`;

  const titleText = typeof chartEl.title === "string" ? chartEl.title : chartEl.title?.text || "";
  // 官方结构：cx:title 始终存在（无标题时空元素带定位属性，对照 waterfall-color.pptx）
  const titleXml = titleText
    ? `<cx:title pos="t" align="ctr" overlay="0"><cx:tx><cx:txData><cx:v>${esc(titleText)}</cx:v></cx:txData></cx:tx></cx:title>`
    : `<cx:title pos="t" align="ctr" overlay="0"/>`;
  const legendCfg = chartEl.legend;
  const legendXml = legendCfg === true || typeof legendCfg === "object"
    ? `<cx:legend pos="${typeof legendCfg === "object" && legendCfg.position ? legendCfg.position : "t"}" align="ctr" overlay="0"/>`
    : "";

  // 轴（waterfall：分类 + 数值；官方结构 axis 内带空 cx:title）
  let axes = "";
  if (type === "waterfall") {
    axes =
      `<cx:axis id="0"><cx:catScaling gapWidth="0.5"/><cx:title/><cx:tickLabels/></cx:axis>` +
      `<cx:axis id="1"><cx:valScaling/><cx:title/><cx:majorGridlines/><cx:tickLabels/></cx:axis>`;
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
  const fonts = { latin: "Microsoft YaHei" };
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
