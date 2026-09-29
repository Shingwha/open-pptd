// ============================================================================
// layout/index.js — 布局阶段（方案 §2/§3.2，M2）
// ----------------------------------------------------------------------------
// layout(deck, measure?) → LayoutTree
//
// LayoutTree 是「每个元素最终的几何事实」——与 Deck 平行的纯数据树：
//   { pageSize: {w,h}, pages: [ { index, elements: [LayoutElement] } ] }
//   LayoutElement = {
//     elementId, elementType,
//     declared: {x,y,w,h},          // 作者声明（el.bounds，模型永不写回）
//     frame:    {x,y,w,h},          // 排版事实（h = 内容撑开后的实际值）
//     grown: boolean,               // frame.h > declared.h
//     text?:  { lines, contentHeight },
//     table?: { columnWidths, rowHeights, totalHeight },
//     overflow: { x, y, page, overlaps: [{elementId, rect}] },
//   }
//
// 三铁律：layout 之后无测量（paint 只读本树）；模型永不写回（只读 el.bounds）；
// MeasurePort 默认确定性纯函数。group 组壳跳过、逐成员布局（裁定 §2.4——
// 成员元素本就在 page.elements 中，renderer renderPage 对组壳返回 null 同语义）。
// 图表尺寸透传（model/chart/layout.js 单源保留，I20/I22 不动）。
// 双端纯函数：本文件禁 node:/fs/window./document.（dep-graph 强制）。
// ============================================================================

import { deckSize } from "../model/model.js";
import { normalizeTheme, resolveFont } from "../model/theme.js";
import { computeBaseStyle } from "../model/style.js";
import { fontMetricsMeasure, runsFromRichText, familiesOf } from "../measure/index.js";

const EPS = 0.5; // 高度增长判定容差（亚像素抖动不算增长）

/** 主题：已规范化（含 colors）则原样，否则 normalizeTheme。 */
function themeOf(deck) {
  const t = deck?.theme;
  if (t && typeof t === "object" && t.colors) return t;
  return normalizeTheme(t);
}

/** 元素声明几何 [x,y,w,h] → {x,y,w,h}（非法回退 0 尺寸）。 */
function declaredOf(el) {
  const b = Array.isArray(el?.bounds) ? el.bounds : [0, 0, 0, 0];
  return { x: num(b[0]), y: num(b[1]), w: Math.max(0, num(b[2])), h: Math.max(0, num(b[3])) };
}
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** 文本元素 → { frame, text }。 */
function layoutText(theme, el, measure) {
  const d = declaredOf(el);
  const content = el.content || {};
  const base = computeBaseStyle(theme, content);
  const font = resolveFont(theme, base.fontFamily) || {};
  const runs = runsFromRichText(content.text);
  const res = measure.measureTextRuns(
    runs,
    { fontSize: base.fontSize, lineHeight: base.lineHeight, lineHeightPx: base.lineHeightPx, fontFamily: familiesOf(font).length ? familiesOf(font) : base.fontFamily },
    d.w
  );
  const h = Math.max(d.h, res.height);
  return {
    frame: { x: d.x, y: d.y, w: d.w, h },
    grown: h > d.h + EPS,
    text: { lines: res.lines, contentHeight: res.height },
  };
}

/** 表格元素 → { frame, table }。 */
function layoutTable(el, measure) {
  const d = declaredOf(el);
  const t = measure.measureTable(el);
  const h = Math.max(d.h, t.totalHeight);
  return {
    frame: { x: d.x, y: d.y, w: d.w, h },
    grown: h > d.h + EPS,
    table: { columnWidths: t.columnWidths, rowHeights: t.rowHeights, totalHeight: t.totalHeight },
  };
}

/** 两个矩形相交区域（无交集返回 null）。 */
function intersection(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const btm = Math.min(a.y + a.h, b.y + b.h);
  if (r - x <= 0 || btm - y <= 0) return null;
  return { x, y, w: r - x, h: btm - y };
}

/**
 * 布局整个 deck。
 * @param {object} deck 解析后（或已 resolve）的 deck；theme 未规范化时内部处理
 * @param {typeof fontMetricsMeasure} [measure] MeasurePort（缺省确定性纯函数实现）
 * @returns {object} LayoutTree
 */
export function layout(deck, measure = fontMetricsMeasure) {
  const theme = themeOf(deck);
  const [W, H] = deckSize(deck);
  const pages = [];
  (deck?.pages || []).forEach((page, pi) => {
    const elements = [];
    for (const el of page?.elements || []) {
      if (!el) continue;
      if (el.elementType === "group") continue; // 组壳跳过，逐成员布局（成员本就在此数组）
      const d = declaredOf(el);
      let part;
      if (el.elementType === "text") part = layoutText(theme, el, measure);
      else if (el.elementType === "table") part = layoutTable(el, measure);
      else part = { frame: { ...d }, grown: false }; // shape/line/image/icon/chart：尺寸透传
      elements.push({
        elementId: el.elementId,
        elementType: el.elementType,
        declared: d,
        frame: part.frame,
        grown: part.grown,
        ...(part.text ? { text: part.text } : {}),
        ...(part.table ? { table: part.table } : {}),
        overflow: { x: false, y: false, page: false, overlaps: [] },
      });
    }
    // 越界事实 + 增长压下方元素检测
    for (const le of elements) {
      const f = le.frame;
      le.overflow.x = f.x < 0 || f.x + f.w > W;
      le.overflow.y = f.y < 0 || f.y + f.h > H;
      le.overflow.page = f.x + f.w <= 0 || f.y + f.h <= 0 || f.x >= W || f.y >= H;
      if (!le.grown) continue;
      // 增长区域 = 声明底边以下、实际底边以上的一条带（表格长高压下方元素的免费副产品）
      const strip = { x: f.x, y: le.declared.y + le.declared.h, w: f.w, h: f.h - le.declared.h };
      for (const other of elements) {
        if (other === le) continue;
        const hit = intersection(strip, other.frame);
        if (hit) le.overflow.overlaps.push({ elementId: other.elementId, rect: hit });
      }
    }
    pages.push({ index: pi, elements });
  });
  return { pageSize: { w: W, h: H }, pages };
}

export default layout;
