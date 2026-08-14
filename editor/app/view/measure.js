// ============================================================================
// app/view/measure.js — 渲染后测量写回：文本自适应增高 + 表格实测高度
// ----------------------------------------------------------------------------
// 预览渲染完成后，把 DOM 实测高度写回模型 bounds[3]，让预览、选中框与
// 导出（PPT spAutoFit / 行高语义）高度一致。纯测量函数，不接触 transform。
// ============================================================================

import { estimateTableLayout } from "../../core/table.js";

// 表格实测高度写回 bounds[3] 的容差：border-collapse 下渲染高度比 Σ最小行高多出
// 底边框开销（默认 1px，粗边框至多几 px）。实测与最小行高和之差在此容差内视为
// 「内容未超出」，不写回（否则行高按比例重算→渲染更高，每次点击/渲染累积 +1px
// 无界增长）。内容撑行超出容差才写回实测高度（自动增高）。
const TABLE_MEASURE_TOL = 8;

/**
 * 文本框内容自适应高度：内容超出框高时自动增高（不裁剪、不溢出），
 * 并把新高度写回模型 —— 预览与导出（PPT spAutoFit）行为一致。
 * 仅在内容超过框高时增高，不缩回（用户可拖大框留白，vAlign 控制对齐）。
 */
function autoGrowTexts(page, canvas) {
  for (const el of page.elements || []) {
    if (el.elementType !== "text") continue;
    const node = canvas.querySelector(`[data-element-id="${CSS.escape(el.elementId)}"]`);
    const inner = node?.firstElementChild;
    if (!inner) continue;
    const need = inner.scrollHeight;
    if (need > el.bounds[3] + 1) {
      el.bounds[3] = need;
      node.style.height = `${need}px`;
    }
  }
}

/**
 * 表格实测高度写回 bounds[3]（预览与选中框/导出高度一致）。
 * 行高为 min-height 语义：渲染高度 = Σ最小行高 + 边框开销（collapse 底边约 1px）。
 * 内容未超出最小行高时【不写回】——行高按 bounds[3] 比例重算（core/table.js），
 * 写回会把边框开销喂回行高，形成「写回→行高变高→渲染更高→再写回」反馈回路，
 * 每次渲染/点击累积 +1px 无界增长；内容超出最小行高才写回实测（自动撑行）。
 * 自动行高表（无 rowHeights）的实测与 bounds 无关，写回幂等，行为不变。
 */
function writebackTableHeights(page, canvas) {
  for (const el of page.elements || []) {
    if (el.elementType !== "table") continue;
    const node = canvas.querySelector(`[data-element-id="${CSS.escape(el.elementId)}"]`);
    if (!node || node.offsetHeight <= 0) continue;
    if (Array.isArray(el.rowHeights)) {
      const minTotal = estimateTableLayout(el).rowHeights.reduce((a, b) => a + b, 0);
      if (node.offsetHeight - minTotal > TABLE_MEASURE_TOL) el.bounds[3] = node.offsetHeight;
    } else {
      el.bounds[3] = node.offsetHeight;
    }
  }
}

/** 页面渲染后的统一测量写回（文本增高 + 表格高度），在 renderPage 之后调用。 */
export function applyMeasurements(page, canvas) {
  autoGrowTexts(page, canvas);
  writebackTableHeights(page, canvas);
}
