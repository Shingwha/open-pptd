// ============================================================================
// interaction/properties.js — 属性面板（元素属性 + 页面设置）
// ----------------------------------------------------------------------------
// 结构（平面分区，无卡片嵌套）：
//   [元素选中时] 元素头（类型徽标 + id + 删除）→ 位置与尺寸 → 类型专属分组
//   [未选中时]   演示文稿 → 页面设置 → 提示
// 元素专属分组由类型注册表分派（types/*.js 的 props，返回分组节点数组）。
// 交互模式：控件 focus → beginChange（快照）；input → update；blur → endChange。
// 颜色控件：令牌（$primary 等）经 resolveColor 解析回填，展示当前真实颜色。
// ============================================================================

import { getType } from "../types/index.js";
import { PAGE_TYPES } from "../core/model.js";
import { resolveColor } from "../core/theme.js";
import * as ui from "../ui.js";

export function bindProperties(panel, api) {
  const { state, page, getSelectedElement, beginChange, endChange, deleteSelected, moveLayer } = api;

  /** 注册表 props 用控件（focus/blur 事务 + 提交后即时刷新画布，面板不重建保焦点）。 */
  function helpers() {
    // 提交包装：改模型 → 立即只刷新画布（blur 时 endChange 再全量对齐面板）
    const commit = (fn) => (v) => { fn(v); api.refreshPreview(); };
    return {
      field: ui.field,
      group: ui.group,
      textInput: (v, c, o = {}) => ui.textInput(v, commit(c), { onFocus: beginChange, onBlur: endChange, ...o }),
      numInput: (v, c, o = {}) => ui.numInput(v, commit(c), { onFocus: beginChange, onBlur: endChange, ...o }),
      colorInput: (v, c, o = {}) =>
        ui.colorInput(v, commit(c), {
          title: typeof v === "string" ? v : "颜色",
          resolve: (val) => resolveColor(state.theme, val),
          onFocus: beginChange,
          onBlur: endChange,
          ...o,
        }),
      selectInput: (options, value, onCommit, o = {}) => ui.selectInput(options, value, commit(onCommit), { onFocus: beginChange, onBlur: endChange, ...o }),
      checkbox: (l, ch, c, o = {}) => ui.checkbox(l, ch, commit(c), { onFocus: beginChange, onBlur: endChange, ...o }),
      button: (label, onClick, opts) => ui.button(label, onClick, { className: "btn btn-sm", ...opts }),
      fontOptions: () => api.fontOptions?.() || [["", "默认"]],
      beginChange,
      endChange,
      openEditor: api.openEditor,
    };
  }

  function refresh() {
    panel.innerHTML = "";
    const el = getSelectedElement();
    if (!el) {
      renderPageProps();
      return;
    }
    panel.appendChild(itemHead(el));
    renderCommon(el);
    const def = getType(el.elementType);
    if (def?.props) {
      const nodes = def.props(el, helpers());
      (Array.isArray(nodes) ? nodes : [nodes]).forEach((n) => n && panel.appendChild(n));
    }
  }

  /** 元素头：类型徽标 + elementId + 删除。 */
  function itemHead(el) {
    const head = document.createElement("div");
    head.className = "inspector-item";
    const def = getType(el.elementType);
    const badge = document.createElement("span");
    badge.className = "inspector-badge";
    badge.textContent = def?.label || el.elementType;
    const id = document.createElement("code");
    id.className = "inspector-elid";
    id.textContent = el.elementId;
    const del = ui.button("删除", () => { beginChange(); deleteSelected(); endChange(); }, { className: "btn btn-sm btn-danger" });
    head.append(badge, id, del);
    return head;
  }

  /** 通用区：位置与尺寸 + 层序操作。 */
  function renderCommon(el) {
    const g = ui.group("位置与尺寸");
    const grid = document.createElement("div");
    grid.className = "prop-grid";
    const [x, y, w, h] = el.bounds;
    grid.appendChild(ui.field("X", ui.numInput(x, (v) => (el.bounds[0] = v), { onFocus: beginChange, onBlur: endChange })));
    grid.appendChild(ui.field("Y", ui.numInput(y, (v) => (el.bounds[1] = v), { onFocus: beginChange, onBlur: endChange })));
    grid.appendChild(ui.field("宽", ui.numInput(w, (v) => (el.bounds[2] = Math.max(4, v)), { min: 4, onFocus: beginChange, onBlur: endChange })));
    grid.appendChild(ui.field("高", ui.numInput(h, (v) => (el.bounds[3] = Math.max(4, v)), { min: 4, onFocus: beginChange, onBlur: endChange })));
    g.appendChild(grid);

    const layer = document.createElement("div");
    layer.className = "prop-actions";
    layer.append(
      ui.button("上移一层", () => { beginChange(); moveLayer(-1); endChange(); }, { className: "btn btn-sm" }),
      ui.button("下移一层", () => { beginChange(); moveLayer(1); endChange(); }, { className: "btn btn-sm" })
    );
    g.appendChild(layer);
    panel.appendChild(g);
  }

  /** 页面设置（未选中元素时）。 */
  function renderPageProps() {
    const deck = state.deck;
    const pg = page();
    // 提交即只刷新画布（面板不重建，输入焦点保持）；标题等文本框 blur 再全量对齐
    const commit = (fn) => { beginChange(); fn(); api.refreshPreview(); };

    const g1 = ui.group("演示文稿");
    g1.appendChild(
      ui.field("标题", ui.textInput(deck.title, (v) => { deck.title = v; }, { onFocus: beginChange, onBlur: endChange }))
    );
    panel.appendChild(g1);

    const g2 = ui.group("页面设置");
    g2.appendChild(
      ui.field("类型", ui.selectInput(PAGE_TYPES.map((t) => [t, t]), pg.pageType || "content", (v) => commit(() => { pg.pageType = v; })))
    );
    const bgType = pg.background?.type || "none";
    g2.appendChild(
      ui.field("背景", ui.selectInput([["none", "无"], ["solid", "纯色"], ["gradient", "渐变"]], bgType, (v) =>
        commit(() => {
          if (v === "none") delete pg.background;
          else if (v === "solid") pg.background = { type: "solid", color: pg.background?.color || "$bg" };
          else if (v === "gradient") {
            pg.background = {
              type: "gradient",
              gradientType: "linear",
              angle: 90,
              stops: [
                { position: 0, color: pg.background?.color || "$primary" },
                { position: 1, color: "#ffffff" },
              ],
            };
          }
        })
      ))
    );
    if (pg.background?.type === "solid") {
      g2.appendChild(
        ui.field("颜色", ui.colorInput(pg.background.color, (v) => commit(() => { pg.background.color = v; }), { resolve: (val) => resolveColor(state.theme, val) }))
      );
    } else if (pg.background?.type === "gradient") {
      g2.appendChild(
        ui.field("起始色", ui.colorInput(pg.background.stops?.[0]?.color, (v) => commit(() => { pg.background.stops[0].color = v; }), { resolve: (val) => resolveColor(state.theme, val) }))
      );
      g2.appendChild(
        ui.field("结束色", ui.colorInput(pg.background.stops?.[1]?.color, (v) => commit(() => { pg.background.stops[1].color = v; }), { resolve: (val) => resolveColor(state.theme, val) }))
      );
    }
    panel.appendChild(g2);

    const hint = document.createElement("div");
    hint.className = "prop-hint panel-hint";
    hint.textContent = "单击画布上的元素可编辑它的属性；右下角 ＋ 可添加文字、形状、图表与表格。";
    panel.appendChild(hint);
  }

  return { refresh };
}
