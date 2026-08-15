// ============================================================================
// interaction/properties.js — 属性面板（声明式字段渲染器）
// ----------------------------------------------------------------------------
// 布局模板（统一规则，根治各类型各自为政的杂乱）：
//   [元素选中时] 元素头（徽标 + id + 复制 + 删除）
//                → 位置与尺寸（X/Y/宽/高 + 对齐工具行 + 层序）
//                → 变换（旋转/透明度 + 翻转）
//                → 类型分组（types/*.js 的 props 返回 groups 声明）
//   [未选中时]   演示文稿 → 页面设置 → 提示
//
// 字段声明（types 只描述，布局由本渲染器统一决定）：
//   num      双列紧凑格（label 上置），两两成行     {kind:"num", label, get, set, min?, max?, step?}
//   text     整行文本框                            {kind:"text", label, get, set, placeholder?}
//   textarea 整行多行文本                          {kind:"textarea", label, get, set, placeholder?}
//   select   整行下拉                              {kind:"select", label, options, get, set}
//   color    整行颜色（色块弹层 + 取色器 + hex）    {kind:"color", label, get, set}
//   checks   整行复选框组                          {kind:"checks", items:[{label, get, set}]}
//   button   整行按钮                              {kind:"button", label, onClick, className?}
//   hint     整行提示                              {kind:"hint", text}
//
// 事务模式：首次实际提交 → beginChange（快照）；input → update；blur → endChange。
// 颜色控件：令牌（$primary 等）经 resolveColor 解析回填，展示当前真实颜色。
// ============================================================================

import { getType } from "../types/index.js";
import { PAGE_TYPES, PAGE_WIDTH, PAGE_HEIGHT } from "../core/model.js";
import { resolveColor } from "../core/theme.js";
import * as ui from "../ui.js";
import { renderGroup, fieldHandlers, themeSwatches } from "./fields.js";

export function bindProperties(panel, api) {
  const { state, page, getSelectedElement, beginChange, endChange, deleteSelected, duplicateSelected, moveLayer } = api;

  // 输入事务：首次实际提交才快照（点进输入框不输入不再误标脏），blur 结束事务
  let txActive = false;

  /** 注册表 props 用控件（提交事务 + 提交后即时刷新画布，面板不重建保焦点）。 */
  function helpers() {
    // 提交包装：首次提交前快照 → 改模型 → 立即只刷新画布（blur 时 endChange 再全量对齐面板）
    const commit = (fn) => (v) => {
      if (!txActive) {
        txActive = true;
        beginChange();
      }
      fn(v);
      api.refreshPreview();
    };
    const endTx = () => {
      if (!txActive) return; // 无实际提交：不标脏、不入历史
      txActive = false;
      endChange();
    };
    return fieldHandlers({
      theme: () => state.theme,
      wrap: commit,
      onBlur: endTx,
      extra: {
        fontOptions: () => api.fontOptions?.() || [["", "默认"]],
        beginChange,
        endChange,
        openEditor: api.openEditor,
      },
    });
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
      const groups = def.props(el, helpers());
      (Array.isArray(groups) ? groups : []).forEach((g) => g && panel.appendChild(renderGroup(g, helpers())));
    }
  }

  /** 元素头：类型徽标 + elementId + 复制 + 删除。 */
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
    const dup = ui.button("复制", () => { beginChange(); duplicateSelected(); endChange(); }, { className: "btn btn-sm", title: "复制元素（Ctrl+D）" });
    const del = ui.button("删除", () => { beginChange(); deleteSelected(); endChange(); }, { className: "btn btn-sm btn-danger" });
    head.append(badge, id, dup, del);
    return head;
  }

  // --------------------------------------------------------------------------
  // 通用组：位置与尺寸 + 变换（所有组件一致）
  // --------------------------------------------------------------------------
  function renderCommon(el) {
    const h = helpers();

    // —— 位置与尺寸 ——
    const g = ui.group("位置与尺寸");
    const grid = document.createElement("div");
    grid.className = "prop-grid";
    const [x, y, w, hh] = el.bounds;
    grid.appendChild(ui.cell("X", h.numInput(x, (v) => (el.bounds[0] = v))));
    grid.appendChild(ui.cell("Y", h.numInput(y, (v) => (el.bounds[1] = v))));
    grid.appendChild(ui.cell("宽", h.numInput(w, (v) => (el.bounds[2] = Math.max(4, v)), { min: 4 })));
    grid.appendChild(ui.cell("高", h.numInput(hh, (v) => (el.bounds[3] = Math.max(4, v)), { min: 4 })));
    g.appendChild(grid);

    // 对齐工具行（相对页面）
    const ALIGN = [
      ["left", "←", "左对齐"], ["hcenter", "↔", "水平居中"], ["right", "→", "右对齐"],
      ["top", "↑", "顶对齐"], ["vcenter", "↕", "垂直居中"], ["bottom", "↓", "底对齐"],
    ];
    const alignRow = document.createElement("div");
    alignRow.className = "prop-icon-row";
    for (const [mode, glyph, title] of ALIGN) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "prop-icon-btn";
      b.textContent = glyph;
      b.title = title;
      b.addEventListener("click", () => { beginChange(); alignElement(el, mode); endChange(); });
      alignRow.appendChild(b);
    }
    g.appendChild(alignRow);

    const layer = document.createElement("div");
    layer.className = "prop-actions";
    layer.append(
      h.button("上移一层", () => { beginChange(); moveLayer(-1); endChange(); }),
      h.button("下移一层", () => { beginChange(); moveLayer(1); endChange(); })
    );
    g.appendChild(layer);
    panel.appendChild(g);

    // —— 变换 ——
    // 官方限制：table/chart 不支持整体旋转/翻转/透明度（pptd.md §Table/§Chart limitation），不显示
    if (["table", "chart"].includes(el.elementType)) return;
    const g2 = ui.group("变换");
    const grid2 = document.createElement("div");
    grid2.className = "prop-grid";
    grid2.appendChild(ui.cell("旋转", h.numInput(el.rotation ?? 0, (v) => (el.rotation = v), { min: -360, max: 360 })));
    grid2.appendChild(ui.cell("透明度", h.numInput(el.opacity ?? 1, (v) => (el.opacity = Math.min(1, Math.max(0, v))), { min: 0, max: 1, step: 0.05 })));
    g2.appendChild(grid2);
    const checks = document.createElement("div");
    checks.className = "prop-checks";
    checks.append(
      h.checkbox("水平翻转", !!el.flip?.[0], (v) => (el.flip = [v, !!el.flip?.[1]])),
      h.checkbox("垂直翻转", !!el.flip?.[1], (v) => (el.flip = [!!el.flip?.[0], v]))
    );
    g2.appendChild(checks);
    panel.appendChild(g2);
  }

  /** 元素对齐到页面（mode: left/hcenter/right/top/vcenter/bottom）。 */
  function alignElement(el, mode) {
    const [bx, by, bw, bh] = el.bounds;
    if (mode === "left") el.bounds[0] = 0;
    else if (mode === "hcenter") el.bounds[0] = Math.round((PAGE_WIDTH - bw) / 2);
    else if (mode === "right") el.bounds[0] = PAGE_WIDTH - bw;
    else if (mode === "top") el.bounds[1] = 0;
    else if (mode === "vcenter") el.bounds[1] = Math.round((PAGE_HEIGHT - bh) / 2);
    else if (mode === "bottom") el.bounds[1] = PAGE_HEIGHT - bh;
  }

  // --------------------------------------------------------------------------
  // 声明式分组渲染（渲染器在 fields.js，与表格样式面板共用同一套布局）
  // --------------------------------------------------------------------------

  // --------------------------------------------------------------------------
  // 页面设置（未选中元素时）
  // --------------------------------------------------------------------------
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
        ui.field("颜色", ui.colorField(pg.background.color, (v) => commit(() => { pg.background.color = v; }), { resolve: (val) => resolveColor(state.theme, val), swatches: themeSwatches(state.theme) }))
      );
    } else if (pg.background?.type === "gradient") {
      g2.appendChild(
        ui.field("起始色", ui.colorField(pg.background.stops?.[0]?.color, (v) => commit(() => { pg.background.stops[0].color = v; }), { resolve: (val) => resolveColor(state.theme, val), swatches: themeSwatches(state.theme) }))
      );
      g2.appendChild(
        ui.field("结束色", ui.colorField(pg.background.stops?.[1]?.color, (v) => commit(() => { pg.background.stops[1].color = v; }), { resolve: (val) => resolveColor(state.theme, val), swatches: themeSwatches(state.theme) }))
      );
      g2.appendChild(
        ui.field("角度", ui.numInput(pg.background.angle ?? 0, (v) => commit(() => { pg.background.angle = v; }), { min: 0, max: 360, step: 15 }))
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
