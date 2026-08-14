// ============================================================================
// renderer/page.js — 页面渲染（背景 + 元素分派 + 缩放）
// ----------------------------------------------------------------------------
// 元素 → DOM 经类型注册表分派（types/registry.js）；新增元素类型
// 只需注册 render，无需改本文件。
// ============================================================================

import { getType } from "../types/index.js";
import { pageBackground } from "./background.js";
import { disposeChartInstances } from "./chart.js";
import { createElementShell } from "./shell.js";

/** 元素 → DOM（经注册表分派；未注册类型回退占位）。
 * @param {object} ctx 渲染上下文（{ imageMap: { [src]: dataUrl } }）
 */
export function renderElement(theme, el, ctx = {}) {
  const def = getType(el.elementType);
  if (def && def.render) return def.render(theme, el, ctx);
  return placeholder(el);
}

function placeholder(el) {
  const div = createElementShell(el, {
    css:
      `display:flex;align-items:center;justify-content:center;` +
      `border:1px dashed #c4cbd4;color:#8a94a3;font-size:13px;background:#f8fafc;`,
  });
  div.textContent = `[${el.elementType} · 编辑能力开发中]`;
  return div;
}

/** 解析失败页：红色错误框（文件路径 + 行号 + 摘要，超 160 字符截断）。 */
function renderParseError(container, page) {
  const div = document.createElement("div");
  div.className = "page-error";
  const line = page._parseErrorLine ? ` · 第 ${page._parseErrorLine} 行` : "";
  const msg = String(page._parseError || "未知解析错误").replace(/\s+/g, " ").trim();
  const summary = msg.length > 160 ? msg.slice(0, 160) + "…" : msg;
  div.textContent = `[页面解析失败] ${page._path || "?"}${line}\n${summary}`;
  container.appendChild(div);
}

/**
 * 渲染整页到容器。
 * @param {HTMLElement} container 画布容器（960x540 逻辑尺寸）
 * @param {object} page 页面模型
 * @param {object} deck deck（含 size）
 * @param {object} theme 规范化主题
 * @param {object} [opts] 渲染上下文 { imageMap: { [src]: dataUrl } }（图片元素解析相对路径用）
 */
export function renderPage(container, page, deck, theme, opts = {}) {
  disposeChartInstances(container);
  container.innerHTML = "";
  container.appendChild(pageBackground(theme, page.background));
  if (page._parseError) renderParseError(container, page);
  for (const el of page.elements || []) {
    const node = renderElement(theme, el, opts);
    if (node) container.appendChild(node);
  }
}

export { disposeChartInstances } from "./chart.js";
