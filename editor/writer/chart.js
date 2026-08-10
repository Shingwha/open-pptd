// ============================================================================
// writer/chart.js — 图表导出（原生可编辑 Chart XML + 嵌入 xlsx）
// ----------------------------------------------------------------------------
// 第一版经验（必须遵守）：
//   1. 嵌入 xlsx 必须完整部件（Content_Types/rels/docProps/xl workbook/worksheet/
//      sharedStrings/styles/theme）→ 缺部件 PowerPoint 报「数据文件已损毁」
//   2. 嵌入文件名必须 ASCII：Microsoft_Excel_SheetN.xlsx（WPS 严格解析）
//   3. chart XML 必须声明 <c:externalData r:id="rId1"> → 指向嵌入 xlsx
//   4. strCache/numCache 必须写入（不打开数据表也能显示）
//   5. schema 元素顺序严格（PowerPoint 校验）
//   6. 图表文字用 +mn-lt/+mn-ea 绑定主题 minor 字体
// ============================================================================

import { el, esc, escAttr, xmlHeader, hexToRgbVal } from "./xml.js";
import { resolveChartSeries, chartDataTable, isNumericColumn, CHART_META, shouldShowDataLabels } from "../core/chart.js";
import { resolveSeriesColors, resolveColor, resolveFont } from "../core/theme.js";
import { colorElement } from "./drawing.js";
import { ZipWriter } from "./zip.js";

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

export function buildChartXlsx(chartEl, fonts) {
  const f = fonts?.latin || "Microsoft YaHei";
  const table = chartDataTable(chartEl); // [表头行, 数据行...]
  const rows = table.length;
  const cols = table[0] ? table[0].length : 0;

  // sharedStrings
  const shared = [];
  const sharedIndex = new Map();
  const si = (text) => {
    const key = String(text);
    if (sharedIndex.has(key)) return sharedIndex.get(key);
    shared.push(key);
    sharedIndex.set(key, shared.length - 1);
    return shared.length - 1;
  };

  // 每列是否数值
  const numericCols = [];
  for (let c = 0; c < cols; c++) numericCols.push(isNumericColumn(table, c));

  const sheetRows = [];
  for (let r = 0; r < rows; r++) {
    const cells = [];
    for (let c = 0; c < cols; c++) {
      const v = table[r][c];
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
    `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:shade val="51000"/><a:satMod val="130000"/></a:schemeClr></a:gs><a:gs pos="80000"><a:schemeClr val="phClr"><a:shade val="93000"/><a:satMod val="130000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="94000"/><a:satMod val="135000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="16200000" scaled="0"/></a:gradFill>` +
    `</a:fillStyleLst>` +
    `<a:lnStyleLst><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"><a:shade val="95000"/><a:satMod val="105000"/></a:schemeClr></a:solidFill><a:prstDash val="solid"/></a:ln>` +
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
// Chart XML
// ----------------------------------------------------------------------------
function fillXml(color, alpha) {
  const inner =
    alpha == null
      ? el("a:srgbClr", { val: hexToRgbVal(color) })
      : el("a:srgbClr", { val: hexToRgbVal(color) }, el("a:alpha", { val: Math.round(alpha * 100000) }));
  return el("a:solidFill", {}, inner);
}

/** 系列线条（PPT 线条跟随主题系列色；widthPt 单位 pt）。 */
function lnXml(color, widthPt = 2) {
  return el(
    "a:ln",
    { w: Math.round(widthPt * 12700), cap: "flat", cmpd: "sng", algn: "ctr" },
    el("a:solidFill", {}, el("a:srgbClr", { val: hexToRgbVal(color) }))
  );
}

function txPrXml(theme, size = 900, color = "tx1") {
  // 图表组件字体（deck fonts.chart / 主题 chartStyles.fontFamily），缺省 = 主题默认字体
  const fonts = resolveFont(theme, theme.chartStyles?.fontFamily || null);
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

function catValSerXml(theme, idx, name, color, catRef, valRef, opts = {}) {
  const kids = [
    el("c:idx", { val: idx }),
    el("c:order", { val: idx }),
    seriesNameXml(name, 1 + idx), // 系列名在 B/C... 列首行
  ];
  const spPrKids = [];
  if (opts.kind === "area") {
    // 面积图：半透明填充（与预览一致）+ 主题色线条
    spPrKids.push(fillXml(color, opts.alpha ?? 0.22));
    spPrKids.push(lnXml(color, opts.lineWidth ?? 2));
  } else if (opts.kind === "line") {
    // 折线图：线条（PPT 的 lineChart 忽略 spPr fill，只认 ln）
    spPrKids.push(lnXml(color, opts.lineWidth ?? 2.5));
  } else {
    // 柱状/散点：实体填充
    spPrKids.push(fillXml(color));
  }
  if (spPrKids.length) kids.push(el("c:spPr", {}, spPrKids.join("")));
  // 数据标签（数值）：与预览一致
  if (opts.labels) kids.push(dLblsXml(theme));
  kids.push(el("c:cat", {}, catRef));
  kids.push(el("c:val", {}, valRef));
  return el("c:ser", {}, kids.join(""));
}

/** 数值数据标签（c:dLbls）。 */
function dLblsXml(theme, { percent = false } = {}) {
  return el("c:dLbls", {}, [
    el("c:showLegendKey", { val: "0" }),
    el("c:showVal", { val: percent ? "0" : "1" }),
    el("c:showCatName", { val: "0" }),
    el("c:showSerName", { val: "0" }),
    el("c:showPercent", { val: percent ? "1" : "0" }),
    el("c:showBubbleSize", { val: "0" }),
    txPrXml(theme, 900, "tx1"),
    el("c:separator", { val: ", " }),
  ].join(""));
}

/** 饼/环形图系列：每个数据点显式配色（与预览色板一致）+ 分类名/百分比数据标签。 */
function pieSerXml(theme, idx, name, color, catRef, valRef, palette, pointCount, showLabels = true) {
  const pts = Array.from({ length: pointCount }, (_, r) =>
    el("c:dPt", {}, [
      el("c:idx", { val: r }),
      el("c:bubble3D", { val: "0" }),
      el("c:spPr", {}, fillXml(palette[r % palette.length])),
    ].join(""))
  ).join("");
  const dLbls = showLabels
    ? el("c:dLbls", {}, [
        el("c:showLegendKey", { val: "0" }),
        el("c:showVal", { val: "0" }),
        el("c:showCatName", { val: "1" }),
        el("c:showSerName", { val: "0" }),
        el("c:showPercent", { val: "1" }),
        el("c:showBubbleSize", { val: "0" }),
        el("c:separator", { val: "\n" }),
      ].join(""))
    : "";
  return el("c:ser", {}, [
    el("c:idx", { val: idx }),
    el("c:order", { val: idx }),
    seriesNameXml(name, 1 + idx),
    el("c:spPr", {}, fillXml(color)),
    pts,
    dLbls,
    el("c:cat", {}, catRef),
    el("c:val", {}, valRef),
  ].join(""));
}

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
      // 轴线：主题轴色细线（雷达图放射线也变浅）
      el("c:spPr", {}, lnXml(resolveColor(theme, theme.chartStyles.axisColor) || "#d8dce1", 0.75)),
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
    // 网格线：主题网格色、0.5pt 细线（雷达图圆环线变浅变细，不密不黑）
    kids.push(
      el("c:majorGridlines", {}, el("c:spPr", {}, lnXml(resolveColor(theme, theme.chartStyles.gridColor) || "#e5e7eb", 0.5)))
    );
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

/**
 * 构建图表部件（chartN.xml + rels + xlsx）。
 * @returns {{ xml: string, relsXml: string, xlsx: Uint8Array }}
 */
export function buildChartParts(theme, chartEl, chartIndex) {
  const { series, cats, valuesBySeries, data } = resolveChartSeries(theme, chartEl);
  const table = chartDataTable(chartEl);
  const rowCount = table.length;
  const dataRows = Math.max(0, rowCount - 1);

  const sheetRange = (colIdx) => {
    const L = colLetter(colIdx);
    return dataRows > 0 ? `Sheet1!$${L}$2:$${L}$${rowCount}` : `Sheet1!$${L}$1:$${L}$1`;
  };

  // 按类型分组（bar/line/area 可混合共享轴；pie/doughnut/scatter/radar 单独）
  const groups = new Map();
  for (const s of series) {
    const key = s.type;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const types = [...groups.keys()];
  const primary = types[0];

  // 系列序号（跨类型连续）
  let globalIdx = 0;
  const chartElems = [];

  const catRef = () => {
    const catCol = series[0]?._catCol ?? 0;
    return strRefXml(sheetRange(catCol), cats);
  };

  const valRef = (s) => {
    const col = s._valCol >= 0 ? s._valCol : 1;
    const values = valuesBySeries[series.indexOf(s)];
    return numRefXml(sheetRange(col), values);
  };

  const isStacked = series.some((s) => s.stack && s.stack !== "percent");
  const isPercent = series.some((s) => s.stack === "percent");
  const isSmooth = series.some((s) => s.smooth);

  for (const [type, groupSeries] of groups) {
    const sers = groupSeries.map((s) => {
      const idx = globalIdx++;
      return catValSerXml(theme, idx, s.name, s.color, catRef(), valRef(s), {
        kind: type,
        labels: shouldShowDataLabels(el, type),
      });
    }).join("");

    if (type === "bar") {
      const grouping = isPercent ? "percentStacked" : isStacked ? "stacked" : "clustered";
      const kids = [
        el("c:barDir", { val: "col" }),
        el("c:grouping", { val: grouping }),
        el("c:varyColors", { val: "0" }),
        sers,
        el("c:gapWidth", { val: "120" }),
      ];
      if (isStacked || isPercent) kids.push(el("c:overlap", { val: "100" }));
      kids.push(el("c:axId", { val: "1" }), el("c:axId", { val: "2" }));
      chartElems.push(el("c:barChart", {}, kids.join("")));
    } else if (type === "line" || type === "area") {
      const kids = [
        el("c:grouping", { val: "standard" }),
        el("c:varyColors", { val: "0" }),
        sers,
      ];
      if (type === "line") {
        if (isSmooth) kids.push(el("c:smooth", { val: "1" }));
      }
      kids.push(el("c:axId", { val: "1" }), el("c:axId", { val: "2" }));
      chartElems.push(el(`c:${type === "area" ? "areaChart" : "lineChart"}`, {}, kids.join("")));
    } else if (type === "pie" || type === "doughnut") {
      // 每个扇区显式配色（dPt）+ 分类名/百分比标签（dLbls），与预览一致
      const palette = resolveSeriesColors(theme);
      const pieSers = groupSeries.map((s, i) => {
        const idx = globalIdx++;
        return pieSerXml(theme, idx, s.name, s.color, catRef(), valRef(s), palette, data.rows.length, shouldShowDataLabels(el, type));
      }).join("");
      const kids = [el("c:varyColors", { val: "0" }), pieSers];
      if (type === "doughnut") kids.push(el("c:holeSize", { val: "55" }));
      chartElems.push(el(`c:${type === "doughnut" ? "doughnutChart" : "pieChart"}`, {}, kids.join("")));
    } else if (type === "scatter") {
      const scatterSers = groupSeries.map((s, i) => {
        const idx = globalIdx++;
        const xCol = s._catCol >= 0 ? s._catCol : 0;
        const yCol = s._valCol >= 0 ? s._valCol : 1;
        const xVals = (data.rows || []).map((row) => Number(row[xCol] ?? 0));
        const yVals = valuesBySeries[series.indexOf(s)].map((v) => Number(v ?? 0));
        return el("c:ser", {}, [
          el("c:idx", { val: idx }),
          el("c:order", { val: idx }),
          seriesNameXml(s.name, 2 * i + 1),
          el("c:spPr", {}, fillXml(s.color)),
          shouldShowDataLabels(el, "scatter") ? dLblsXml(theme) : "",
          el("c:xVal", {}, numRefXml(sheetRange(xCol), xVals)),
          el("c:yVal", {}, numRefXml(sheetRange(yCol), yVals)),
        ].join(""));
      }).join("");
      chartElems.push(
        el("c:scatterChart", {}, [
          el("c:scatterStyle", { val: "lineMarker" }),
          el("c:varyColors", { val: "0" }),
          scatterSers,
          el("c:axId", { val: "1" }),
          el("c:axId", { val: "2" }),
        ].join(""))
      );
    } else if (type === "radar") {
      const radarSers = groupSeries.map((s, i) => {
        const idx = globalIdx++;
        return el("c:ser", {}, [
          el("c:idx", { val: idx }),
          el("c:order", { val: idx }),
          seriesNameXml(s.name, i + 1),
          // 雷达图：marker 点色 = 填充，连线 = 主题系列色 2pt
          el("c:spPr", {}, fillXml(s.color) + lnXml(s.color, 2)),
          shouldShowDataLabels(el, "radar") ? dLblsXml(theme) : "",
          el("c:cat", {}, catRef()),
          el("c:val", {}, valRef(s)),
        ].join(""));
      }).join("");
      chartElems.push(
        el("c:radarChart", {}, [
          el("c:radarStyle", { val: "marker" }),
          el("c:varyColors", { val: "0" }),
          radarSers,
          el("c:axId", { val: "1" }),
          el("c:axId", { val: "2" }),
        ].join(""))
      );
    }
  }

  // 轴
  let axes = "";
  if (primary === "pie" || primary === "doughnut") {
    axes = "";
  } else if (primary === "scatter") {
    axes = valAxXml(theme, 1, 2, { pos: "b", hideGrid: true }) + valAxXml(theme, 2, 1, {});
  } else {
    axes = catAxXml(theme, 1, 2) + valAxXml(theme, 2, 1, {});
  }

  // 标题
  const titleXml = chartEl.title
    ? (
      `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/>` +
      `<a:p><a:pPr/><a:r><a:rPr lang="zh-CN" sz="1400"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/></a:rPr><a:t>${esc(typeof chartEl.title === "string" ? chartEl.title : chartEl.title.text || "")}</a:t></a:r></a:p>` +
      `</c:rich></c:tx><c:layout/></c:title>` +
      `<c:autoTitleDeleted val="0"/>`
    )
    : `<c:autoTitleDeleted val="1"/>`;

  // 图例：多系列或饼/环形图显示（与预览一致）
  const showLegend = (series.length > 1 || primary === "pie" || primary === "doughnut") && chartEl.legend !== false;
  const legendXml = showLegend
    ? (
      `<c:legend><c:legendPos val="b"/><c:overlay val="0"/>` +
      txPrXml(theme, 900, "tx1") +
      `</c:legend>`
    )
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
    `<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>` +
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

  return { xml, relsXml, xlsx: buildChartXlsx(chartEl, resolveFont(theme, theme.chartStyles?.fontFamily || null)) };
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
