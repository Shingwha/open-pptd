// ============================================================================
// parts.js — PPTX 固定部件生成（Content_Types / rels / docProps /
//           presentation / slideMaster / slideLayout / theme）
// ----------------------------------------------------------------------------
// 经验要点（第一版实测）：
//   - sldMasterId id=2147483648，sldLayoutId id=2147483649（必须 >= 0x80000000）
//   - slideMaster rels 必须含 theme 关系（rId2）
//   - theme1.xml 的 clrScheme 决定"导出后在 PowerPoint 里换主题"的联动范围
// ============================================================================

import { esc, el, xmlHeader, hexToRgbVal } from "./xml.js";

export const NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
export const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
export const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const NS_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
export const NS_CONTENT_TYPES = "http://schemas.openxmlformats.org/package/2006/content-types";

// 默认字体（官方 Style Priority 默认值：fontFamily = "Microsoft YaHei"，系统自带、仅声明不嵌入）。
const FONT_DEFAULT = "Microsoft YaHei";
// 取字体：OOXML 三槽位统一用 latin，中文符号由 ea 槽承载。
const F = (fonts) => fonts?.latin || FONT_DEFAULT;

// ----------------------------------------------------------------------------
// [Content_Types].xml
// ----------------------------------------------------------------------------
export function buildContentTypes(slideCount, chartCount = 0, fontCount = 0, chartExIds = [], notesSlides = []) {
  const defaults = [
    el("Default", { Extension: "rels", ContentType: "application/vnd.openxmlformats-package.relationships+xml" }),
    el("Default", { Extension: "xml", ContentType: "application/xml" }),
    el("Default", { Extension: "png", ContentType: "image/png" }),
    el("Default", { Extension: "jpeg", ContentType: "image/jpeg" }),
    el("Default", { Extension: "jpg", ContentType: "image/jpeg" }),
    el("Default", { Extension: "gif", ContentType: "image/gif" }),
    el("Default", { Extension: "svg", ContentType: "image/svg+xml" }),
    el("Default", { Extension: "xlsx", ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  ];
  // ⚠️ fntdata Default 必须出现在 Types 内（根元素后）；插到根元素前 = 非法 XML（PowerPoint 0x80CB9110）
  if (fontCount > 0) defaults.push(el("Default", { Extension: "fntdata", ContentType: "application/x-fontdata" }));
  const overrides = [
    el("Override", { PartName: "/ppt/presentation.xml", ContentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml" }),
    el("Override", { PartName: "/ppt/slideMasters/slideMaster1.xml", ContentType: "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml" }),
    el("Override", { PartName: "/ppt/slideLayouts/slideLayout1.xml", ContentType: "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml" }),
    el("Override", { PartName: "/ppt/theme/theme1.xml", ContentType: "application/vnd.openxmlformats-officedocument.theme+xml" }),
    el("Override", { PartName: "/docProps/core.xml", ContentType: "application/vnd.openxmlformats-package.core-properties+xml" }),
    el("Override", { PartName: "/docProps/app.xml", ContentType: "application/vnd.openxmlformats-officedocument.extended-properties+xml" }),
  ];
  for (let i = 1; i <= slideCount; i++) {
    overrides.push(
      el("Override", { PartName: `/ppt/slides/slide${i}.xml`, ContentType: "application/vnd.openxmlformats-officedocument.presentationml.slide+xml" })
    );
  }
  for (let i = 1; i <= chartCount; i++) {
    overrides.push(
      el("Override", { PartName: `/ppt/charts/chart${i}.xml`, ContentType: "application/vnd.openxmlformats-officedocument.drawingml.chart+xml" })
    );
  }
  for (const id of chartExIds) {
    overrides.push(
      el("Override", { PartName: `/ppt/charts/chartEx${id}.xml`, ContentType: "application/vnd.ms-office.chartex+xml" })
    );
    overrides.push(
      el("Override", { PartName: `/ppt/charts/style${id}.xml`, ContentType: "application/vnd.ms-office.chartstyle+xml" })
    );
    overrides.push(
      el("Override", { PartName: `/ppt/charts/colors${id}.xml`, ContentType: "application/vnd.ms-office.chartcolorstyle+xml" })
    );
  }
  if (notesSlides.length > 0) {
    overrides.push(
      el("Override", { PartName: "/ppt/notesMasters/notesMaster1.xml", ContentType: "application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml" })
    );
    // notesMaster 引用独立 theme2.xml（PowerPoint 官方行为，对照 notes-ref.pptx）
    overrides.push(
      el("Override", { PartName: "/ppt/theme/theme2.xml", ContentType: "application/vnd.openxmlformats-officedocument.theme+xml" })
    );
    // 按实际带备注的页号声明（notesSlideN.xml ↔ slideN.xml，与文件命名一致）
    for (const n of notesSlides) {
      overrides.push(
        el("Override", { PartName: `/ppt/notesSlides/notesSlide${n}.xml`, ContentType: "application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml" })
      );
    }
  }
  return (
    xmlHeader() +
    el("Types", { xmlns: NS_CONTENT_TYPES }, defaults.join("") + overrides.join(""))
  );
}

// ----------------------------------------------------------------------------
// _rels/.rels
// ----------------------------------------------------------------------------
export function buildRootRels() {
  return (
    xmlHeader() +
    el("Relationships", { xmlns: NS_REL }, [
      el("Relationship", { Id: "rId1", Type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument", Target: "ppt/presentation.xml" }),
      el("Relationship", { Id: "rId2", Type: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", Target: "docProps/core.xml" }),
      el("Relationship", { Id: "rId3", Type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties", Target: "docProps/app.xml" }),
    ].join(""))
  );
}

// ----------------------------------------------------------------------------
// docProps
// ----------------------------------------------------------------------------
export function buildCoreProps(title) {
  const now = new Date().toISOString();
  return (
    xmlHeader() +
    el("cp:coreProperties", {
      "xmlns:cp": "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
      "xmlns:dc": "http://purl.org/dc/elements/1.1/",
      "xmlns:dcterms": "http://purl.org/dc/terms/",
      "xmlns:dcmitype": "http://purl.org/dc/dcmitype/",
      "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
    }, [
      el("dc:title", {}, esc(title)),
      el("dc:creator", {}, "open-pptd"),
      el("cp:lastModifiedBy", {}, "open-pptd"),
      el("dcterms:created", { "xsi:type": "dcterms:W3CDTF" }, now),
      el("dcterms:modified", { "xsi:type": "dcterms:W3CDTF" }, now),
    ].join(""))
  );
}

export function buildAppPropsV2(slideCount) {
  return (
    xmlHeader() +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ` +
    `xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    `<Application>open-pptd</Application>` +
    `<PresentationFormat>宽屏</PresentationFormat>` +
    `<Slides>${slideCount}</Slides>` +
    `<Notes>0</Notes>` +
    `<HiddenSlides>0</HiddenSlides>` +
    `<MMClips>0</MMClips>` +
    `<ScaleCrop>false</ScaleCrop>` +
    `<HeadingPairs><vt:vector size="4" baseType="variant"><vt:variant><vt:lpstr>Theme</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant><vt:variant><vt:lpstr>Slide Titles</vt:lpstr></vt:variant><vt:variant><vt:i4>${slideCount}</vt:i4></vt:variant></vt:vector></HeadingPairs>` +
    `<TitlesOfParts><vt:vector size="${slideCount}" baseType="lpstr">` +
    Array.from({ length: slideCount }, () => "<vt:lpstr>幻灯片</vt:lpstr>").join("") +
    `</vt:vector></TitlesOfParts>` +
    `</Properties>`
  );
}

// ----------------------------------------------------------------------------
// ppt/presentation.xml
// ----------------------------------------------------------------------------
export function buildPresentation(title, slideCount, size, fonts, embedded = null, hasNotes = false) {
  const f = F(fonts);
  const [w, h] = size;
  const cx = Math.round(w * 12700);
  const cy = Math.round(h * 12700);
  const sldIds = [];
  for (let i = 0; i < slideCount; i++) {
    sldIds.push(el("p:sldId", { id: String(256 + i), "r:id": `rId${i + 2}` }));
  }
  const attrs = embedded?.lstXml ? ` embedTrueTypeFonts="1"${embedded.subsetMode ? ' saveSubsetFonts="1"' : ""}` : "";
  // schema 顺序：sldMasterIdLst → notesMasterIdLst → sldIdLst → sldSz → notesSz（对照 notes-ref.pptx）
  const notesMasterIdLst = hasNotes
    ? `<p:notesMasterIdLst><p:notesMasterId r:id="rIdNotesMaster"/></p:notesMasterIdLst>`
    : "";
  return (
    xmlHeader() +
    `<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"${attrs}>` +
    `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
    notesMasterIdLst +
    `<p:sldIdLst>${sldIds.join("")}</p:sldIdLst>` +
    `<p:sldSz cx="${cx}" cy="${cy}" type="screen16x9"/>` +
    `<p:notesSz cx="6858000" cy="9144000"/>` +
    // embeddedFontLst 必须在 notesSz 之后（schema 顺序，坑 2）
    (embedded?.lstXml || "") +
    `<p:defaultTextStyle><a:defPPr><a:defRPr lang="zh-CN">` +
    `<a:latin typeface="${f}"/><a:ea typeface="${f}"/><a:cs typeface="${f}"/>` +
    `</a:defRPr></a:defPPr></p:defaultTextStyle>` +
    `<p:title>${esc(title)}</p:title>` +
    `</p:presentation>`
  );
}

export function buildPresentationRels(slideCount, fontRels = [], hasNotes = false) {
  const rels = [
    el("Relationship", { Id: "rId1", Type: `${NS_R}/slideMaster`, Target: "slideMasters/slideMaster1.xml" }),
  ];
  for (let i = 0; i < slideCount; i++) {
    rels.push(el("Relationship", { Id: `rId${i + 2}`, Type: `${NS_R}/slide`, Target: `slides/slide${i + 1}.xml` }));
  }
  if (hasNotes) {
    rels.push(el("Relationship", { Id: "rIdNotesMaster", Type: `${NS_R}/notesMaster`, Target: "notesMasters/notesMaster1.xml" }));
  }
  for (const r of fontRels) {
    rels.push(el("Relationship", { Id: r.id, Type: `${NS_R}/font`, Target: r.target }));
  }
  return xmlHeader() + el("Relationships", { xmlns: NS_REL }, rels.join(""));
}

// ----------------------------------------------------------------------------
// ppt/notesMasters/notesMaster1.xml（演讲者备注母版）
// 对照用户 notes-ref.pptx 实测：bgRef + 6 占位符（hdr/dt/sldImg/body/ftr/sldNum）
// + 9 级 notesStyle；rels 引用独立 theme2.xml（PowerPoint 官方行为）
// ----------------------------------------------------------------------------
export function buildNotesMaster(fonts) {
  const f = F(fonts);
  const ph = (id, name, phXml, body, extra = "") =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${phXml}</p:nvPr></p:nvSpPr>` +
    `<p:spPr>${extra}</p:spPr>` +
    `<p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/><a:p><a:endParaRPr lang="zh-CN" altLang="en-US"/></a:p></p:txBody></p:sp>`;
  const bodyPh = (id, name, phXml, body, extra = "") =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${phXml}</p:nvPr></p:nvSpPr>` +
    `<p:spPr>${extra}</p:spPr>` +
    `<p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/>${body}</p:txBody></p:sp>`;
  const xfrm = (x, y, w, h) =>
    `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`;
  // notesStyle 9 级（官方结构：marL 逐级递增 + 主题字体槽 +mn-lt/+mn-ea/+mn-cs）
  const lvl = (n, marL) =>
    `<a:lvl${n}pPr marL="${marL}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">` +
    `<a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill>` +
    `<a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl${n}pPr>`;
  const noteStyleLevels = [0, 457200, 914400, 1371600, 1828800, 2286000, 2743200, 3200400, 3657600]
    .map((marL, i) => lvl(i + 1, marL)).join("");
  return (
    xmlHeader() +
    `<p:notesMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">` +
    `<p:cSld>` +
    `<p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>` +
    `<p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    ph(2, "页眉占位符 1", `<p:ph type="hdr" sz="quarter"/>`, "", xfrm(0, 0, 2971800, 458788)) +
    ph(3, "日期占位符 2", `<p:ph type="dt" idx="1"/>`, "", xfrm(3884613, 0, 2971800, 458788)) +
    ph(4, "幻灯片图像占位符 3", `<p:ph type="sldImg" idx="2"/>`, "", xfrm(685800, 1143000, 5486400, 3086100) + `<a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln>`) +
    bodyPh(5, "备注占位符 4", `<p:ph type="body" sz="quarter" idx="3"/>`,
      `<a:p><a:pPr lvl="0"/><a:endParaRPr lang="zh-CN" altLang="en-US"/></a:p>`, xfrm(685800, 4400550, 5486400, 3600450)) +
    ph(6, "页脚占位符 5", `<p:ph type="ftr" sz="quarter" idx="4"/>`, "", xfrm(0, 8685213, 2971800, 458787)) +
    ph(7, "灯片编号占位符 6", `<p:ph type="sldNum" sz="quarter" idx="5"/>`, "", xfrm(3884613, 8685213, 2971800, 458787)) +
    `</p:spTree>` +
    `</p:cSld>` +
    `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
    `<p:notesStyle>${noteStyleLevels}</p:notesStyle>` +
    `</p:notesMaster>`
  );
}

export function buildNotesMasterRels() {
  return (
    xmlHeader() +
    el("Relationships", { xmlns: NS_REL }, [
      el("Relationship", { Id: "rId1", Type: `${NS_R}/theme`, Target: "../theme/theme2.xml" }),
    ].join(""))
  );
}

// ----------------------------------------------------------------------------
// ppt/slideMasters/slideMaster1.xml
// ----------------------------------------------------------------------------
export function buildSlideMaster(fonts) {
  const f = F(fonts);
  return (
    xmlHeader() +
    `<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">` +
    `<p:cSld>` +
    `<p:bg><p:bgPr><a:solidFill><a:sysClr val="window" lastClr="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>` +
    `<p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr/>` +
    `</p:spTree>` +
    `</p:cSld>` +
    `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
    `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>` +
    `<p:txStyles>` +
    `<p:titleStyle><a:lvl1pPr><a:defRPr sz="4400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="${f}"/><a:ea typeface="${f}"/><a:cs typeface="${f}"/></a:defRPr></a:lvl1pPr></p:titleStyle>` +
    `<p:bodyStyle><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="${f}"/><a:ea typeface="${f}"/><a:cs typeface="${f}"/></a:defRPr></a:lvl1pPr></p:bodyStyle>` +
    `<p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="${f}"/><a:ea typeface="${f}"/><a:cs typeface="${f}"/></a:defRPr></a:lvl1pPr></p:otherStyle>` +
    `</p:txStyles>` +
    `</p:sldMaster>`
  );
}

export function buildSlideMasterRels() {
  return (
    xmlHeader() +
    el("Relationships", { xmlns: NS_REL }, [
      el("Relationship", { Id: "rId1", Type: `${NS_R}/slideLayout`, Target: "../slideLayouts/slideLayout1.xml" }),
      el("Relationship", { Id: "rId2", Type: `${NS_R}/theme`, Target: "../theme/theme1.xml" }),
    ].join(""))
  );
}

// ----------------------------------------------------------------------------
// ppt/slideLayouts/slideLayout1.xml
// ----------------------------------------------------------------------------
export function buildSlideLayout() {
  return (
    xmlHeader() +
    `<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank" preserve="1">` +
    `<p:cSld name="Blank">` +
    `<p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr/>` +
    `</p:spTree>` +
    `</p:cSld>` +
    `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>` +
    `</p:sldLayout>`
  );
}

export function buildSlideLayoutRels() {
  return (
    xmlHeader() +
    el("Relationships", { xmlns: NS_REL }, [
      el("Relationship", { Id: "rId1", Type: `${NS_R}/slideMaster`, Target: "../slideMasters/slideMaster1.xml" }),
    ].join(""))
  );
}

// ----------------------------------------------------------------------------
// ppt/theme/theme1.xml
// ----------------------------------------------------------------------------
// clrScheme 语义槽位（第二版核心）：渲染器/导出器用同一映射，
// 元素默认色尽量写 schemeClr → 导出后在 PowerPoint 里可换主题。
export function themeColorSlots(theme) {
  const c = theme.colors;
  return {
    dk1: "windowText",
    lt1: "window",
    dk2: c.text,
    lt2: c.bg,
    accent1: c.primary,
    accent2: c.accent,
    // accent3-6：colors 显式键回退（success/warning/danger/primaryDeep 为默认主题推荐值）
    accent3: c.accent3 || c.success || c.primary,
    accent4: c.accent4 || c.warning || c.accent,
    accent5: c.accent5 || c.danger || c.primary,
    accent6: c.accent6 || c.primaryDeep || c.accent,
  };
}

export function buildTheme(theme) {
  const f = F(null);
  const c = theme.colors;
  const slots = themeColorSlots(theme);
  const srgb = (hex) => el("a:srgbClr", { val: hexToRgbVal(hex) });
  const sys = (val, last) => el("a:sysClr", { val, lastClr: last });

  const clrScheme =
    el("a:clrScheme", { name: "open-pptd" }, [
      el("a:dk1", {}, sys("windowText", "000000")),
      el("a:lt1", {}, sys("window", "FFFFFF")),
      el("a:dk2", {}, srgb(slots.dk2)),
      el("a:lt2", {}, srgb(slots.lt2)),
      el("a:accent1", {}, srgb(slots.accent1)),
      el("a:accent2", {}, srgb(slots.accent2)),
      el("a:accent3", {}, srgb(slots.accent3)),
      el("a:accent4", {}, srgb(slots.accent4)),
      el("a:accent5", {}, srgb(slots.accent5)),
      el("a:accent6", {}, srgb(slots.accent6)),
      el("a:hlink", {}, srgb("0563C1")),
      el("a:folHlink", {}, srgb("954F72")),
    ].join(""));

  const fontScheme =
    `<a:fontScheme name="open-pptd">` +
    `<a:majorFont><a:latin typeface="${f}"/><a:ea typeface="${f}"/><a:cs typeface=""/></a:majorFont>` +
    `<a:minorFont><a:latin typeface="${f}"/><a:ea typeface="${f}"/><a:cs typeface=""/></a:minorFont>` +
    `</a:fontScheme>`;

  const fmtScheme =
    `<a:fmtScheme name="Office">` +
    `<a:fillStyleLst>` +
    `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>` +
    `<a:gradFill rotWithShape="1"><a:gsLst>` +
    `<a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs>` +
    `<a:gs pos="35000"><a:schemeClr val="phClr"><a:tint val="37000"/><a:satMod val="300000"/></a:schemeClr></a:gs>` +
    `<a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="15000"/><a:satMod val="350000"/></a:schemeClr></a:gs>` +
    `</a:gsLst><a:lin ang="16200000" scaled="1"/></a:gradFill>` +
    `<a:gradFill rotWithShape="1"><a:gsLst>` +
    `<a:gs pos="0"><a:schemeClr val="phClr"><a:shade val="51000"/><a:satMod val="130000"/></a:schemeClr></a:gs>` +
    `<a:gs pos="80000"><a:schemeClr val="phClr"><a:shade val="93000"/><a:satMod val="130000"/></a:schemeClr></a:gs>` +
    `<a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="94000"/><a:satMod val="135000"/></a:schemeClr></a:gs>` +
    `</a:gsLst><a:lin ang="16200000" scaled="0"/></a:gradFill>` +
    `</a:fillStyleLst>` +
    `<a:lnStyleLst>` +
    `<a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"><a:shade val="95000"/><a:satMod val="105000"/></a:schemeClr></a:solidFill><a:prstDash val="solid"/></a:ln>` +
    `<a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>` +
    `<a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>` +
    `</a:lnStyleLst>` +
    `<a:effectStyleLst>` +
    `<a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="20000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="38000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle>` +
    `<a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle>` +
    `<a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle>` +
    `</a:effectStyleLst>` +
    `<a:bgFillStyleLst>` +
    `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>` +
    `<a:gradFill rotWithShape="1"><a:gsLst>` +
    `<a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="40000"/><a:satMod val="350000"/></a:schemeClr></a:gs>` +
    `<a:gs pos="40000"><a:schemeClr val="phClr"><a:tint val="45000"/><a:shade val="99000"/><a:satMod val="350000"/></a:schemeClr></a:gs>` +
    `<a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="20000"/><a:satMod val="255000"/></a:schemeClr></a:gs>` +
    `</a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="-80000" r="50000" b="180000"/></a:path></a:gradFill>` +
    `<a:gradFill rotWithShape="1"><a:gsLst>` +
    `<a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="80000"/><a:satMod val="300000"/></a:schemeClr></a:gs>` +
    `<a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="30000"/><a:satMod val="200000"/></a:schemeClr></a:gs>` +
    `</a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path></a:gradFill>` +
    `</a:bgFillStyleLst>` +
    `</a:fmtScheme>`;

  return (
    xmlHeader() +
    `<a:theme xmlns:a="${NS_A}" name="open-pptd">` +
    // tableStyleLst 属于 themeElements（fmtScheme 之后），不可放外面
    `<a:themeElements>${clrScheme}${fontScheme}${fmtScheme}` +
    `<a:tableStyleLst>` +
    `<a:tblStyle id="{00000000-0000-0000-0000-000000000000}" styleName="Blank">` +
    `<a:wholeTbl>` +
    `<a:tcTxStyle>` +
    `<a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef>` +
    `<a:schemeClr val="tx1"/>` +
    `</a:tcTxStyle>` +
    `</a:wholeTbl>` +
    `</a:tblStyle>` +
    `</a:tableStyleLst>` +
    `</a:themeElements>` +
    `<a:objectDefaults/>` +
    `<a:extraClrSchemeLst/>` +
    `</a:theme>`
  );
}
