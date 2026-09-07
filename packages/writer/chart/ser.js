// ============================================================================
// writer/chart/ser.js — 各类型 c:ser 系列构造（对照 python-pptx 参考骨架）
// ----------------------------------------------------------------------------

import { el, esc } from "../xml.js";
import { hexA } from "../../model/chart.js";
import { buildFill } from "../drawing.js";
import { fillXml, lnXml, dLblsXml, markerXml } from "./style.js";
import { colLetter } from "./xlsx.js";

export function strRefXml(sheetRef, values) {
  return el("c:strRef", {}, [
    el("c:f", {}, sheetRef),
    el("c:strCache", {}, [
      el("c:ptCount", { val: values.length }),
      values.map((v, i) => el("c:pt", { idx: i }, el("c:v", {}, esc(String(v ?? ""))))).join(""),
    ].join("")),
  ].join(""));
}

export function numRefXml(sheetRef, values, format = "General") {
  return el("c:numRef", {}, [
    el("c:f", {}, sheetRef),
    el("c:numCache", {}, [
      el("c:formatCode", {}, format),
      el("c:ptCount", { val: values.length }),
      values.map((v, i) => el("c:pt", { idx: i }, el("c:v", {}, v == null ? "" : String(v)))).join(""),
    ].join("")),
  ].join(""));
}

export function seriesNameXml(name, colIdx) {
  const ref = `Sheet1!$${colLetter(colIdx)}$1`;
  return el("c:tx", {}, el("c:strRef", {}, [
    el("c:f", {}, ref),
    el("c:strCache", {}, [
      el("c:ptCount", { val: 1 }),
      el("c:pt", { idx: 0 }, el("c:v", {}, esc(name))),
    ].join("")),
  ].join("")));
}

export function catRefXml(ch, sheetRange) {
  return el("c:cat", {}, strRefXml(sheetRange(ch.col), ch.vals));
}

export function valRefXml(ch, sheetRange) {
  return el("c:val", {}, numRefXml(sheetRange(ch.col), ch.vals));
}

export function barSerXml(theme, s, sheetRange, idx, labels, chs) {
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

export function lineSerXml(theme, s, sheetRange, idx, labels, chs) {
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

export function areaSerXml(theme, s, sheetRange, idx, labels, chs) {
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

export function scatterSerXml(theme, s, sheetRange, idx, labels, chs) {
  const kids = [
    el("c:idx", { val: idx }),
    el("c:order", { val: idx }),
    seriesNameXml(s.name, sheetRange.nameCol(s)),
  ];
  // s.color = fill || 主题色循环默认（模型解析）——不配 fill 也要写 spPr，
  // 否则 PowerPoint 对 bubbleChart 等不自动区分系列色（06 页实测只有一种气泡）。
  // 散点语义 = 仅 marker 不连线：scatterStyle 虽为 lineMarker（OOXML 无纯散点值），
  // 原生「仅带数据标记的散点图」即靠 ser 级 ln noFill 抑制连线，缺省会被连线（05 页实测）。
  // CT_ScatterSer 只允许一个 spPr（fill + ln 同元素，写两个会触发 PowerPoint 修复）。
  const spPrKids = [];
  if (s.color) spPrKids.push(fillXml(theme, s.color));
  spPrKids.push(el("a:ln", {}, el("a:noFill")));
  kids.push(el("c:spPr", {}, spPrKids.join("")));
  const marker = markerXml(theme, s.marker, s.color);
  if (marker) kids.push(marker);
  if (labels) kids.push(dLblsXml(theme, labels));
  kids.push(
    el("c:xVal", {}, numRefXml(sheetRange(s._cols.x), s._values.x)),
    el("c:yVal", {}, numRefXml(sheetRange(s._cols.y), s._values.y))
  );
  return el("c:ser", {}, kids.join(""));
}

export function bubbleSerXml(theme, s, sheetRange, idx, labels) {
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

/**
 * 股价图系列（对照用户 PowerPoint 手工文件 chart45/46：**1 个 candlestick 系列
 * 展开为 3/4 个 c:ser**——HLC（无 open）或 OHLC 每列一个 ser，cat 共享）：
 *   ser: idx/order + tx(列头) + spPr(ln noFill) + marker(symbol none) + cat + val + smooth 0
 */
export function candlestickSerXml(theme, s, sheetRange, serIdx, labels) {
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
    const chs2 = { cat: { col: s._cols.x, vals: s._cats }, val: { col: s._cols[ch], vals: s._values[ch] } };
    kids.push(
      catRefXml(chs2.cat, sheetRange),
      el("c:val", {}, numRefXml(sheetRange(s._cols[ch]), s._values[ch]))
    );
    kids.push(el("c:smooth", { val: "0" }));
    return el("c:ser", {}, kids.join(""));
  }).join("");
}

/** upBars/downBars（对照用户文件 chart46：Excel 默认 up=lt1 白底灰边 / down=dk1 75% 黑底灰边）。 */
export function upDownBarsXml(theme, s) {
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

export function pieSerXml(theme, s, sheetRange, idx, labels, palette) {
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

export function radarSerXml(theme, s, sheetRange, idx, labels, chs) {
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
