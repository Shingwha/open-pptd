// ============================================================================
// renderer/page.js — 页面绘制（paintPage 消费 LayoutTree + 旧 renderPage 适配器）
// ----------------------------------------------------------------------------
// 三段式渲染管线的第三段：resolve → layout → **paint**。
//   paintPage(layoutPage, ctx)  ← 唯一绘制入口：几何一律读 LayoutTree（位置/尺寸取
//                                 frame；文本盒高取 declared，见 withFrame），本文件
//                                 不测量、不写回模型（三铁律）
//   renderPage(container, page, deck, theme, opts)  ← 2.x 兼容适配器（内部
//                                 page → layout → paintPage），契约 4 导出面稳定
// 元素 → DOM 经类型注册表分派（packages/model/registry.js）；新增元素类型
// 只需在 renderer/types/ 注册 render 分片，无需改本文件。
// ============================================================================

import { getType } from "./types/index.js";
import { pageBackground } from "./background.js";
import { disposeChartInstances } from "./chart.js";
import { createElementShell } from "./shell.js";
import { layout } from "../layout/index.js";
import { normalizeTheme } from "../model/theme.js";

/** 已规范化（含 colors）则原样，否则 normalizeTheme（与 layout 的 themeOf 同规则）。 */
function themeOf(theme) {
  const t = theme;
  if (t && typeof t === "object" && t.colors) return t;
  return normalizeTheme(t);
}

/** 元素 → DOM（经注册表分派；未注册类型回退占位）。
 * @param {object} ctx 绘制上下文（{ imageMap, iconMap, pixelRatio }）
 */
function renderElement(theme, el, ctx = {}) {
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
 * LayoutElement + 元素模型 → 绘制视图对象。
 * 只做浅拷贝（**模型永不写回**）：bounds 取 layout 几何，分片签名保持不变
 * （`render(theme, el, ctx)`），内容/样式字段原样引用。
 *
 * 几何取舍（报告已列）：
 * - 表格：读 frame + layout.table 精确行高/列宽（M3 白名单行为变更）。
 * - 文本：x/y/w 取 frame，**盒高取 declared**（作者框）——PowerPoint「不自动调整」
 *   语义：文字溢出可见、框不随内容长高、行位置锚定作者框；若用 frame.h（撑高值），
 *   居中/底对齐文本会随盒高整体下移（实测 city-cycling#5 标题下移 17px）。
 *   文本不裁剪由 renderText 的 overflow:visible 保证（见 text.js）。
 * - 其余元素：frame == declared（尺寸透传）。
 */
function withFrame(el, le) {
  const f = le.frame;
  const h = el.elementType === "text" ? le.declared.h : f.h;
  const view = { ...el, bounds: [f.x, f.y, f.w, h] };
  if (le.table) view.layout = le; // 表格：layout 精确行高（renderTable 读 el.layout.table）
  return view;
}

/**
 * 绘制 LayoutTree 的一页（纯绘制：几何从 LayoutTree 读，无 DOM 测量）。
 * @param {object} layoutPage LayoutTree.pages[i]（{ index, elements }）
 * @param {object} ctx { container, page, theme, imageMap, iconMap, pixelRatio }
 *  - container 画布容器（必填）
 *  - page      该页模型（仅取 background / _parseError / 元素内容；几何一律取自 layoutPage）
 */
export function paintPage(layoutPage, ctx = {}) {
  const { container, page } = ctx;
  if (!container) throw new Error("paintPage 需要 ctx.container");
  const theme = themeOf(ctx.theme);
  disposeChartInstances(container);
  container.innerHTML = "";
  container.appendChild(pageBackground(theme, page?.background));
  if (page?._parseError) renderParseError(container, page);
  // 元素模型按 elementId 索引；layout 只含可绘制元素（group 组壳已被 layout 跳过）
  const byId = new Map();
  for (const el of page?.elements || []) if (el) byId.set(el.elementId, el);
  for (const le of layoutPage?.elements || []) {
    const el = byId.get(le.elementId);
    if (!el) continue;
    const node = renderElement(theme, withFrame(el, le), ctx);
    if (node) container.appendChild(node);
  }
}

/**
 * 兼容适配器（契约 4 导出面：2.x 期间不删）。
 * 内部 resolve 后的 deck/page → 单页 layout（默认 fontMetricsMeasure）→ paintPage。
 * 旧签名 (container, page, deck, theme, opts)；opts.measure 可注入 MeasurePort。
 * @deprecated 新代码请直接 layout(deck) + paintPage(layoutPage, ctx)。
 */
export function renderPage(container, page, deck, theme, opts = {}) {
  const th = theme ?? deck?.theme;
  const measure = opts.measure || undefined;
  const tree = layout({ ...(deck || {}), theme: themeOf(th), pages: [page] }, measure);
  paintPage(tree.pages[0], { ...opts, container, page, theme: th });
}

export { disposeChartInstances } from "./chart.js";

/**
 * @deprecated spec 10 T1/T2：布局之后无测量——盒高由 LayoutTree 决定（表格取精确
 * rowHeights、文本取作者框 + 溢出可见），尺寸不再是渲染期的 DOM 事实。本函数保留
 * 为空实现，仅为 2.x 契约 4 导出面兼容（renderer barrel 的 autoGrowTexts 符号）；
 * 3.0 随契约移除。全部调用方已改走 layout。
 */
export function autoGrowTexts() {}
