// ============================================================================
// app/view/dom-measure.js — 浏览器离屏批量测量适配器（RP-C / M6 接线）
// ----------------------------------------------------------------------------
// packages/measure/adapters/dom.js 的接口桩在 RP-A/RP-B 波次是「只留桩」；本波次
// （RP-C）在**编辑器侧**给出实现并接进画布布局（packages/measure 是 RP-A 所有物，
// 本刀禁触，故实现放编辑器层；接口签名与 MeasurePort 一致）。
//
// 定位：对文本 run 做一次离屏 DOM 实测，精修 fontMetricsMeasure 的纯函数残差。
//   · 结果只进 layout（frame/overflow），**不进模型**（三铁律之「模型永不写回」）。
//   · 保守合成：取 max(纯函数估计, DOM 实测)——纯函数带安全余量（宁高勿低），
//     DOM 只是补足其低估；绝不因 DOM 测量收缩已算定的高度（避免编辑器与 headless
//     缩略图/黄金基线出现两套几何）。
//   · 含公式的 run 直接用纯函数（公式排版需 KaTeX，离屏 DOM 无法等价复现）。
//   · 字体未就绪（document.fonts 仍在 loading）时回退纯函数，避免用回退字体测量。
//   · 表格仍走纯函数：measureTable 由纯函数实现（表格精确行高已在 RP-B 单源化），
//     本适配器不复制 packages/model/table.js 的内部常量。
// ============================================================================

import { fontMetricsMeasure, familiesOf } from "../../../packages/measure/index.js";

let host = null;

/** 离屏测量宿主（单例，display 不可见但参与布局）。 */
function ensureHost() {
  if (host && host.isConnected) return host;
  host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;" +
    "margin:0;padding:0;border:0;box-sizing:content-box;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;";
  document.body.appendChild(host);
  return host;
}

function fontCss(style) {
  const families = familiesOf(style?.fontFamily);
  const css = [];
  if (style?.fontSize != null) css.push(`font-size:${Number(style.fontSize)}px`);
  if (style?.lineHeightPx != null) css.push(`line-height:${Number(style.lineHeightPx)}px`);
  else if (style?.lineHeight != null) css.push(`line-height:${Number(style.lineHeight)}`);
  if (families.length) css.push(`font-family:${families.map((f) => `"${String(f).replace(/"/g, '\\"')}"`).join(",")}`);
  return css.join(";");
}

/** 富文本 runs → 宿主 innerHTML（pre-wrap 下 \n 即换行；仅纯文本 run，公式已排除）。 */
function runsToHtml(runs, baseSize) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let html = "";
  for (const run of runs || []) {
    if (!run) continue;
    const text = esc(run.text ?? "");
    const st = run.style || {};
    const css = [];
    if (st.fontSize != null && st.fontSize !== baseSize) css.push(`font-size:${Number(st.fontSize)}px`);
    if (st.bold) css.push("font-weight:700");
    if (st.italic) css.push("font-style:italic");
    html += css.length ? `<span style="${css.join(";")}">${text}</span>` : text;
  }
  return html;
}

/** DOM 实测文本高度（px）；不可测返回 null。 */
function domTextHeight(runs, style, maxWidth) {
  if (typeof document === "undefined" || !document.body) return null;
  // 字体未就绪：用回退字体测量会偏差，交给纯函数
  if (document.fonts && document.fonts.status && document.fonts.status !== "loaded") return null;
  const el = ensureHost();
  el.style.cssText =
    "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;" +
    "margin:0;padding:0;border:0;box-sizing:content-box;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;" +
    (Number.isFinite(maxWidth) ? `width:${Math.max(1, maxWidth)}px;` : "width:auto;") +
    fontCss(style);
  el.innerHTML = runsToHtml(runs, style?.fontSize) || "";
  const h = el.getBoundingClientRect().height;
  el.innerHTML = "";
  return Number.isFinite(h) && h > 0 ? h : null;
}

/**
 * DOM 精修版 measureTextRuns：max(纯函数, DOM 实测)。
 * @param {Array} runs
 * @param {object} style
 * @param {number} maxWidth
 * @param {object} [fonts] 度量表（透传给纯函数）
 */
export function measureTextRunsDom(runs, style = {}, maxWidth = Infinity, fonts) {
  const base = fontMetricsMeasure.measureTextRuns(runs, style, maxWidth, fonts);
  if ((runs || []).some((r) => r && r.formula)) return base; // 公式：纯函数
  const dom = domTextHeight(runs, style, maxWidth);
  if (dom == null) return base;
  const height = Math.max(base.height, Math.round(dom * 100) / 100);
  return { ...base, height };
}

/** MeasurePort：文本 run 走 DOM 精修，其余（单元格/表格/行高系数）沿用纯函数。 */
export function createDomMeasure() {
  return {
    ...fontMetricsMeasure,
    measureTextRuns: measureTextRunsDom,
    /** 编辑器内重建布局时调用（切换项目/字体变化后丢弃缓存宿主高度）。 */
    reset() {
      if (host) {
        host.innerHTML = "";
      }
    },
  };
}

/** 适配器可用性：浏览器内即 true（Node 下调用方回退 fontMetricsMeasure）。 */
export function isDomMeasureAvailable() {
  return typeof document !== "undefined" && !!document.body;
}
