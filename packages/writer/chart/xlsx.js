// ============================================================================
// writer/chart/xlsx.js — 嵌入 xlsx 工作表构建（完整部件，缺一 PowerPoint 报损）
// ----------------------------------------------------------------------------
// 硬约束（对照 python-pptx 参考骨架 + WPS 实测）：
//   - 必须完整部件（Content_Types/rels/docProps/xl workbook/worksheet/
//     sharedStrings/styles/theme）→ 缺部件 PowerPoint 报「数据文件已损毁」
//   - 嵌入文件名必须 ASCII：Microsoft_Excel_SheetN.xlsx（WPS 严格解析）
// ============================================================================

import { el, esc, xmlHeader } from "../xml.js";
import { chartDataTable, isNumericColumn, colLetter } from "../../model/chart.js";
import { DEFAULT_FONT } from "../../model/theme.js";
import { ZipWriter } from "../zip.js";

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
  const f = fonts?.latin || DEFAULT_FONT;
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
