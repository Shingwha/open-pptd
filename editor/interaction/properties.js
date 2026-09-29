// ============================================================================
// interaction/properties.js — 属性面板（声明式字段渲染器）
// ----------------------------------------------------------------------------
// 布局模板（统一规则，根治各类型各自为政的杂乱）：
//   [单选]   元素头（徽标 + id + 复制 + 删除）
//            → 位置与尺寸（X/Y/宽/高 + 对齐（页面））
//            → 变换（旋转/透明度 + 翻转）
//            → 类型分组（types/*.js 的 props 返回 groups 声明）
//   [多选]   多选头（数量 + 复制 + 删除）
//            → 位置与尺寸（可批量：值一致可编辑；不一致「混合」斜体只读）
//            → 对齐（选区）+ 分布（≥3 可用）
//            → 层级 + 变换（可批量 / 混合）
//            → 组合 / 取消组合 + 类型专属（同类型列「混合」占位）
//   [未选中] 演示文稿 → 页面设置 → 提示
//
// 对齐语义二义化（U1/PowerPoint）：单选 → 对齐页面；多选 → 对齐选区包围盒。
// 排列算法唯一实现于 interaction/arrange.js（与右键菜单共用，避免两处漂移）。
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
import { ALIGN_MODES, alignSelection, distribute, translate } from "./arrange.js";
import { PAGE_TYPES, resolveColor } from "../../packages/model/index.js";

/** 无「变换」分区的类型（官方限制：不支持整体旋转/翻转/透明度）。 */
const NO_TRANSFORM = new Set(["table", "chart", "group"]);

/** 一组元素的取值是否一致：一致返回该值，不一致返回 undefined（→「混合」）。 */
const sameValueOf = (els, get) => {
  const vs = els.map(get);
  const first = JSON.stringify(vs[0]);
  return vs.every((v) => JSON.stringify(v) === first) ? vs[0] : undefined;
};

export function bindProperties(panel, api) {
  const { state, page, beginChange, endChange, deleteSelected, duplicateSelected, moveLayer } = api;
  const getSelectedElements = api.getSelectedElements || (() => (api.getSelectedElement() ? [api.getSelectedElement()] : []));

  // 输入事务：首次实际提交才快照（点进输入框不输入不再误标脏），blur 结束事务
  let txActive = false;
  // 多选批量事务（同一策略，独立标志避免与单选项互相干扰）
  let multiTx = false;

  const list = () => page().elements || [];
  const translateEl = (el, dx, dy) => translate(el, dx, dy, list());

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

  /** 多选批量提交包装（首提交快照；提交只刷画布，blur 再全量对齐面板）。 */
  const multiCommit = (apply) => {
    if (!multiTx) {
      multiTx = true;
      beginChange();
    }
    apply();
    api.refreshPreview();
  };
  const multiEndTx = () => {
    if (!multiTx) return;
    multiTx = false;
    endChange();
  };

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
  // 对齐行 / 分布行（单选 = 页面；多选 = 选区包围盒；算法见 arrange.js）
  // --------------------------------------------------------------------------
  /** 单选/多选统一入口：单选对页面，多选对选区包围盒。 */
  const alignSel = (els, mode) => alignSelection(els, mode, list());

  function alignRow(els, label) {
    const g = ui.group(label);
    const row = document.createElement("div");
    row.className = "prop-icon-row";
    for (const [mode, glyph, title] of ALIGN_MODES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "prop-icon-btn";
      b.textContent = glyph;
      b.title = title;
      b.addEventListener("click", () => { beginChange(); alignSel(els, mode); endChange(); });
      row.appendChild(b);
    }
    g.appendChild(row);
    if (els.length >= 3) {
      const row2 = document.createElement("div");
      row2.className = "prop-icon-row";
      const hb = ui.button("水平分布", () => { beginChange(); distribute(els, "h", list()); endChange(); }, { className: "btn btn-sm", title: "水平等间距（≥3 个）" });
      const vb = ui.button("垂直分布", () => { beginChange(); distribute(els, "v", list()); endChange(); }, { className: "btn btn-sm", title: "垂直等间距（≥3 个）" });
      row2.append(hb, vb);
      g.appendChild(row2);
    }
    return g;
  }

  function layerRow() {
    const g = ui.group("层级");
    const row = document.createElement("div");
    row.className = "prop-actions";
    // 数组顺序 = 绘制顺序（越靠后越在上层）：上移 = 索引 +1（B5 修正，此前与 z 序相反）
    row.append(
      ui.button("上移一层", () => { beginChange(); moveLayer(1); endChange(); }),
      ui.button("下移一层", () => { beginChange(); moveLayer(-1); endChange(); })
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
  // 混合占位（「混合」= 各元素取值不同；斜体、只读、禁用）
  // --------------------------------------------------------------------------
  function mixNode() {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "mix";
    input.value = "混合";
    input.readOnly = true;
    input.disabled = true;
    input.tabIndex = -1;
    return input;
  }

  /** 双列格里的混合占位（label 上置）。 */
  function mixCellPlaceholder(label) {
    return ui.cell(label, mixNode());
  }

  /** 整行混合占位（label 左置）。 */
  function mixRow(label) {
    return ui.field(label, mixNode());
  }

  /**
   * 双列格：值一致 → 可编辑数字输入（写回全部选中）；不一致 → 「混合」占位。
   * @param get (el) => value；set (el, value) => void（内部已带事务与刷新）
   */
  function mixCell(label, els, get, set, opts = {}) {
    const v = sameValueOf(els, get);
    if (v === undefined) return mixCellPlaceholder(label);
    return ui.cell(
      label,
      ui.numInput(v, (nv) => { for (const e of els) set(e, nv); }, { ...opts, onBlur: multiEndTx })
    );
  }

  function hintBox(text) {
    const d = document.createElement("div");
    d.className = "prop-hint";
    d.textContent = text;
    return d;
  }

  /** 字段声明 → 展示标签列表（混合占位用；button/hint 类不占位）。 */
  function fieldLabels(f) {
    switch (f?.kind) {
      case "checks":
        return (f.items || []).map((i) => i.label).filter(Boolean);
      case "hint":
      case "button":
        return [];
      default:
        return f?.label ? [f.label] : [];
    }
  }

  // --------------------------------------------------------------------------
  // 多选面板：可批量设置的属性可编辑，其余「混合」占位
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

    // 位置与尺寸（值一致可批量编辑，不一致「混合」）
    const g = ui.group("位置与尺寸");
    const grid = document.createElement("div");
    grid.className = "prop-grid";
    grid.appendChild(mixCell("X", els, (e) => e.bounds[0], (e, v) => multiCommit(() => translateEl(e, v - e.bounds[0], 0))));
    grid.appendChild(mixCell("Y", els, (e) => e.bounds[1], (e, v) => multiCommit(() => translateEl(e, 0, v - e.bounds[1]))));
    grid.appendChild(mixCell("宽", els, (e) => e.bounds[2], (e, v) => multiCommit(() => (e.bounds[2] = Math.max(4, v))), { min: 4 }));
    grid.appendChild(mixCell("高", els, (e) => e.bounds[3], (e, v) => multiCommit(() => (e.bounds[3] = Math.max(4, v))), { min: 4 }));
    g.appendChild(grid);
    panel.appendChild(g);

    panel.appendChild(alignRow(els, "对齐（选区）"));
    panel.appendChild(layerRow());

    // 变换：全部支持则批量（一致可编辑/混合）；含不支持类型则保留分区 + 混合占位 + 说明
    if (els.every((e) => !NO_TRANSFORM.has(e.elementType))) panel.appendChild(multiTransformSection(els));
    else panel.appendChild(mixedTransformSection(els));

    panel.appendChild(groupRow(els));
    const typeSec = mixedTypeSection(els);
    if (typeSec) panel.appendChild(typeSec);

    const hint = document.createElement("div");
    hint.className = "prop-hint panel-hint";
    hint.textContent = "多选：对齐相对选区包围盒；≥3 个可用分布。「混合」= 各元素取值不同。Ctrl+G 组合，Esc 退出多选。";
    panel.appendChild(hint);
  }

  /** 多选变换分区：旋转 / 透明度可批量（一致可编辑 / 不一致混合）+ 翻转（批量）。 */
  function multiTransformSection(els) {
    const g = ui.group("变换");
    const grid = document.createElement("div");
    grid.className = "prop-grid";
    grid.appendChild(mixCell("旋转", els, (e) => e.rotation ?? 0, (e, v) => multiCommit(() => (e.rotation = v)), { min: -360, max: 360 }));
    grid.appendChild(
      mixCell("透明度", els, (e) => e.opacity ?? 1, (e, v) => multiCommit(() => (e.opacity = Math.min(1, Math.max(0, v)))), { min: 0, max: 1, step: 0.05 })
    );
    g.appendChild(grid);
    g.appendChild(flipRow(els));
    return g;
  }

  /** 多选但含不支持变换的类型：分区保留 + 混合占位 + 说明。 */
  function mixedTransformSection(els) {
    const g = ui.group("变换");
    const n = els.filter((e) => NO_TRANSFORM.has(e.elementType)).length;
    g.appendChild(mixRow("旋转"));
    g.appendChild(mixRow("透明度"));
    g.appendChild(hintBox(`含 ${n} 个不支持整体变换的元素（表格 / 图表 / 组），旋转与透明度不可批量设置。`));
    return g;
  }

  /** 翻转开关行（批量：各元素各自置为目标态）。 */
  function flipRow(els) {
    const row = document.createElement("div");
    row.className = "prop-checks";
    const mk = (axis, label) => {
      const all = els.every((e) => !!(e.flip || [])[axis === "h" ? 0 : 1]);
      return ui.checkbox(label, all, (v) => {
        beginChange();
        for (const e of els) {
          const f = Array.isArray(e.flip) ? e.flip : [false, false];
          e.flip = axis === "h" ? [v, !!f[1]] : [!!f[0], v];
        }
        endChange();
      });
    };
    row.append(mk("h", "水平翻转"), mk("v", "垂直翻转"));
    return row;
  }

  /** 同类型多选：按类型声明列出「混合」占位（对齐设计稿 mix 态）；多种类型给出说明。 */
  function mixedTypeSection(els) {
    const types = [...new Set(els.map((e) => e.elementType))];
    if (types.length > 1) {
      const g = ui.group("类型专属");
      g.appendChild(hintBox(`已选 ${types.length} 种类型（${types.map((t) => getType(t)?.label || t).join(" / ")}），类型专属属性请在单选下编辑。`));
      return g;
    }
    const def = getType(types[0]);
    if (!def?.props) return null;
    const g = ui.group(def.label || types[0]);
    let groups = [];
    try {
      groups = def.props(els[0], helpers()) || [];
    } catch {
      groups = [];
    }
    let any = false;
    for (const gr of groups) {
      for (const f of gr?.fields || []) {
        for (const label of fieldLabels(f)) {
          g.appendChild(mixRow(label));
          any = true;
        }
      }
    }
    if (!any) g.appendChild(mixRow("属性"));
    return g;
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
    grid.appendChild(ui.cell("X", h.numInput(x, (v) => translateEl(el, v - el.bounds[0], 0))));
    grid.appendChild(ui.cell("Y", h.numInput(y, (v) => translateEl(el, 0, v - el.bounds[1]))));
    grid.appendChild(ui.cell("宽", h.numInput(w, (v) => (el.bounds[2] = Math.max(4, v)), { min: 4 })));
    grid.appendChild(ui.cell("高", h.numInput(hh, (v) => (el.bounds[3] = Math.max(4, v)), { min: 4 })));
    g.appendChild(grid);
    panel.appendChild(g);

    panel.appendChild(alignRow([el], "对齐（页面）"));

    panel.appendChild(layerRow());
    if (isGroup) panel.appendChild(groupRow([el]));

    // —— 变换 ——
    // 官方限制：table/chart 不支持整体旋转/翻转/透明度（pptd.md §Table/§Chart limitation）；组不整体旋转
    if (NO_TRANSFORM.has(el.elementType)) return;
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
      multiTx = false;
    },
  };
}
