// ============================================================================
// interaction/properties.js — 属性面板（声明式字段渲染器）
// ----------------------------------------------------------------------------
// 布局模板（统一规则，根治各类型各自为政的杂乱）：
//   [单选]   元素头（徽标 + id + 复制 + 删除）
//            → 位置与尺寸（X/Y/宽/高 + 对齐（页面））
//            → 变换（旋转/透明度 + 翻转）
//            → 类型分组（types/*.js 的 props 返回 groups 声明）
//   [多选]   多选头（数量 + 复制 + 删除）
//            → 对齐（选区）+ 分布（≥3 可用）
//            → 层级 + 组合 / 取消组合
//   [未选中] 演示文稿 → 页面设置 → 提示
//
// 对齐语义二义化（U1/PowerPoint）：单选 → 对齐页面；多选 → 对齐选区包围盒。
// 组合元素（elementType:"group"）随 children 一起变换。
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
import * as ui from "../ui.js";
import { renderGroup, fieldHandlers, themeSwatches } from "./fields.js";
import { PAGE_HEIGHT, PAGE_TYPES, PAGE_WIDTH, resolveColor } from "../../packages/model/index.js";

export function bindProperties(panel, api) {
  const { state, page, beginChange, endChange, deleteSelected, duplicateSelected, moveLayer } = api;
  const getSelectedElements = api.getSelectedElements || (() => (api.getSelectedElement() ? [api.getSelectedElement()] : []));

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
    const els = getSelectedElements();
    if (els.length === 0) {
      renderPageProps();
      return;
    }
    if (els.length > 1) {
      renderMulti(els);
      return;
    }
    const el = els[0];
    panel.appendChild(itemHead(el));
    renderCommon(el);
    const def = getType(el.elementType);
    if (def?.props) {
      const groups = def.props(el, helpers());
      (Array.isArray(groups) ? groups : []).forEach((g) => g && panel.appendChild(renderGroup(g, helpers())));
    }
  }

  // --------------------------------------------------------------------------
  // 组合辅助：组 → 展开为 children（变换随组一起作用）
  // --------------------------------------------------------------------------
  const membersOf = (el) => {
    if (el.elementType !== "group" || !Array.isArray(el.children)) return [];
    const list = page().elements || [];
    return el.children.map((id) => list.find((e) => e.elementId === id)).filter(Boolean);
  };
  /** 选中项 → 实际要位移的元素（组展开 children）。 */
  const affected = (els) => els.flatMap((el) => [el, ...membersOf(el)]);
  const unionBounds = (els) => {
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const el of els) {
      const b = el.bounds;
      x1 = Math.min(x1, b[0]);
      y1 = Math.min(y1, b[1]);
      x2 = Math.max(x2, b[0] + b[2]);
      y2 = Math.max(y2, b[1] + b[3]);
    }
    return [x1, y1, x2 - x1, y2 - y1];
  };
  const translate = (el, dx, dy) => {
    el.bounds[0] += dx;
    el.bounds[1] += dy;
    for (const m of membersOf(el)) translate(m, dx, dy);
  };

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
  // 对齐行 / 分布行（单选 = 页面；多选 = 选区包围盒）
  // --------------------------------------------------------------------------
  const ALIGN = [
    ["left", "←", "左对齐"], ["hcenter", "↔", "水平居中"], ["right", "→", "右对齐"],
    ["top", "↑", "顶对齐"], ["vcenter", "↕", "垂直居中"], ["bottom", "↓", "底对齐"],
  ];

  /** 单选/多选统一入口：单选对页面，多选对选区包围盒。 */
  function alignSelection(els, mode) {
    const ref = els.length > 1 ? unionBounds(els) : [0, 0, PAGE_WIDTH, PAGE_HEIGHT];
    for (const el of els) {
      const [bx, by, bw, bh] = el.bounds;
      let dx = 0;
      let dy = 0;
      if (mode === "left") dx = ref[0] - bx;
      else if (mode === "hcenter") dx = Math.round(ref[0] + (ref[2] - bw) / 2) - bx;
      else if (mode === "right") dx = ref[0] + ref[2] - bw - bx;
      else if (mode === "top") dy = ref[1] - by;
      else if (mode === "vcenter") dy = Math.round(ref[1] + (ref[3] - bh) / 2) - by;
      else if (mode === "bottom") dy = ref[1] + ref[3] - bh - by;
      translate(el, dx, dy);
    }
  }

  /** 分布（多选 ≥3）：水平/垂直方向等间距（保持两端元素不动）。 */
  function distribute(els, axis) {
    if (els.length < 3) return;
    const size = axis === "h" ? 2 : 3;
    const start = axis === "h" ? 0 : 1;
    const sorted = [...els].sort((a, b) => a.bounds[start] + a.bounds[size] / 2 - (b.bounds[start] + b.bounds[size] / 2));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const spanStart = first.bounds[start];
    const spanEnd = last.bounds[start] + last.bounds[size];
    const totalSize = sorted.reduce((s, e) => s + e.bounds[size], 0);
    const gap = (spanEnd - spanStart - totalSize) / (sorted.length - 1);
    let cursor = spanStart + first.bounds[size];
    for (let i = 1; i < sorted.length - 1; i += 1) {
      const el = sorted[i];
      const target = Math.round(cursor + gap);
      const d = target - el.bounds[start];
      if (axis === "h") translate(el, d, 0);
      else translate(el, 0, d);
      cursor = target + el.bounds[size];
    }
  }

  function alignRow(els, label) {
    const g = ui.group(label);
    const row = document.createElement("div");
    row.className = "prop-icon-row";
    for (const [mode, glyph, title] of ALIGN) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "prop-icon-btn";
      b.textContent = glyph;
      b.title = title;
      b.addEventListener("click", () => { beginChange(); alignSelection(els, mode); endChange(); });
      row.appendChild(b);
    }
    g.appendChild(row);
    if (els.length >= 3) {
      const row2 = document.createElement("div");
      row2.className = "prop-icon-row";
      const hb = ui.button("水平分布", () => { beginChange(); distribute(els, "h"); endChange(); }, { className: "btn btn-sm", title: "水平等间距（≥3 个）" });
      const vb = ui.button("垂直分布", () => { beginChange(); distribute(els, "v"); endChange(); }, { className: "btn btn-sm", title: "垂直等间距（≥3 个）" });
      row2.append(hb, vb);
      g.appendChild(row2);
    }
    return g;
  }

  function layerRow() {
    const g = ui.group("层级");
    const row = document.createElement("div");
    row.className = "prop-actions";
    row.append(
      ui.button("上移一层", () => { beginChange(); moveLayer(-1); endChange(); }),
      ui.button("下移一层", () => { beginChange(); moveLayer(1); endChange(); })
    );
    g.appendChild(row);
    return g;
  }

  function groupRow(els) {
    const g = ui.group("组合");
    const row = document.createElement("div");
    row.className = "prop-actions";
    const hasGroup = els.some((e) => e.elementType === "group");
    if (!hasGroup) {
      row.appendChild(ui.button("组合", () => { beginChange(); api.group(); endChange(); }, { title: "组合选中元素（Ctrl+G）" }));
    } else {
      row.appendChild(ui.button("取消组合", () => { beginChange(); api.ungroup(); endChange(); }, { title: "取消组合（Ctrl+Shift+G）" }));
    }
    g.appendChild(row);
    return g;
  }

  // --------------------------------------------------------------------------
  // 多选面板
  // --------------------------------------------------------------------------
  function renderMulti(els) {
    const head = document.createElement("div");
    head.className = "inspector-item";
    const badge = document.createElement("span");
    badge.className = "inspector-badge";
    badge.textContent = `已选 ${els.length}`;
    const id = document.createElement("code");
    id.className = "inspector-elid";
    id.textContent = "混合选中";
    const dup = ui.button("复制", () => { beginChange(); duplicateSelected(); endChange(); }, { className: "btn btn-sm", title: "复制（Ctrl+D）" });
    const del = ui.button("删除", () => { beginChange(); deleteSelected(); endChange(); }, { className: "btn btn-sm btn-danger" });
    head.append(badge, id, dup, del);
    panel.appendChild(head);

    panel.appendChild(alignRow(els, "对齐（选区）"));
    panel.appendChild(layerRow());
    panel.appendChild(groupRow(els));

    const hint = document.createElement("div");
    hint.className = "prop-hint panel-hint";
    hint.textContent = "多选：对齐相对选区包围盒；≥3 个可用分布。Ctrl+G 组合，Esc 退出多选。";
    panel.appendChild(hint);
  }

  // --------------------------------------------------------------------------
  // 通用组：位置与尺寸 + 变换（单选）
  // --------------------------------------------------------------------------
  function renderCommon(el) {
    const h = helpers();
    const isGroup = el.elementType === "group";

    // —— 位置与尺寸 ——
    const g = ui.group("位置与尺寸");
    const grid = document.createElement("div");
    grid.className = "prop-grid";
    const [x, y, w, hh] = el.bounds;
    grid.appendChild(ui.cell("X", h.numInput(x, (v) => translate(el, v - el.bounds[0], 0))));
    grid.appendChild(ui.cell("Y", h.numInput(y, (v) => translate(el, 0, v - el.bounds[1]))));
    grid.appendChild(ui.cell("宽", h.numInput(w, (v) => (el.bounds[2] = Math.max(4, v)), { min: 4 })));
    grid.appendChild(ui.cell("高", h.numInput(hh, (v) => (el.bounds[3] = Math.max(4, v)), { min: 4 })));
    g.appendChild(grid);
    panel.appendChild(g);

    panel.appendChild(alignRow([el], "对齐（页面）"));

    panel.appendChild(layerRow());
    if (isGroup) panel.appendChild(groupRow([el]));

    // —— 变换 ——
    // 官方限制：table/chart 不支持整体旋转/翻转/透明度（pptd.md §Table/§Chart limitation）；组不整体旋转
    if (["table", "chart", "group"].includes(el.elementType)) return;
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
    hint.textContent = "单击画布上的元素可编辑它的属性；空白处拖动可框选，Ctrl+A 全选，右下角 ＋ 可添加内容。";
    panel.appendChild(hint);
  }

  return {
    refresh,
    /** 释放：清空面板 DOM（绑定的监听都挂在面板子节点上，随之回收）。 */
    destroy() {
      panel.innerHTML = "";
      txActive = false;
    },
  };
}
