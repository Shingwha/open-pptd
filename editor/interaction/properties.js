// ============================================================================
// interaction/properties.js — property panel (declarative field renderer)
// ----------------------------------------------------------------------------
// Layout template (one rule for every type):
//   [single] element head (badge + id + duplicate + delete)
//            → position & size (X/Y/W/H + align (page))
//            → transform (rotation/opacity + flip)
//            → type groups (declared by types/*.js props → groups)
//   [multi]  multi head (count + duplicate + delete)
//            → position & size (batch: editable when equal; a mixed placeholder, italic and read-only, when not)
//            → align (selection) + distribute (enabled at ≥3)
//            → layer + transform (batch / mixed)
//            → group / ungroup + type-specific (same type shows mixed placeholders)
//   [none]   presentation → page setup → hint
//
// Ambiguous align semantics: single → align to page; multi → align to the
// selection bounding box. The one and only arrangement implementation lives in
// interaction/arrange.js (shared with the context menu so they never drift).
// Group elements (elementType:"group") transform with their children.
//
// Field declarations: see interaction/fields.js — types only describe fields, the
// layout is decided uniformly by that renderer.
//
// Transaction model: first real commit → beginChange (snapshot); input → update;
// blur → endChange. Color controls resolve tokens ($primary etc.) via resolveColor
// so the current real color is shown.
// ============================================================================

import { getType } from "../types/index.js";
import * as ui from "../ui.js";
import { renderGroup, fieldHandlers } from "./fields.js";
import { ALIGN_MODES, alignSelection, distribute, translate } from "./arrange.js";
import { BACKGROUND_TYPES, backgroundColorFields, setBackgroundType } from "./dialogs/page-background.js";
import { PAGE_TYPES } from "../../packages/model/index.js";

/** Types without a transform section (no whole-element rotate/flip/opacity). */
const NO_TRANSFORM = new Set(["table", "chart", "group"]);

/** Whether a set of elements shares one value: returns it when equal, undefined when mixed (→ the mixed placeholder). */
const sameValueOf = (els, get) => {
  const vs = els.map(get);
  const first = JSON.stringify(vs[0]);
  return vs.every((v) => JSON.stringify(v) === first) ? vs[0] : undefined;
};

export function bindProperties(panel, api) {
  const { state, page, beginChange, endChange, deleteSelected, duplicateSelected, moveLayer } = api;
  const getSelectedElements = api.getSelectedElements || (() => (api.getSelectedElement() ? [api.getSelectedElement()] : []));

  // Input transaction: snapshot only on the first real commit (clicking into an
  // input without typing no longer marks dirty); blur ends the transaction
  let txActive = false;
  // Multi-selection batch transaction (same policy, separate flag so it cannot
  // interfere with the single-selection one)
  let multiTx = false;

  const list = () => page().elements || [];
  const translateEl = (el, dx, dy) => translate(el, dx, dy, list());

  /** Registry props controls (commit transaction + immediate canvas refresh; the panel is not rebuilt so focus is kept). */
  function helpers() {
    // Commit wrapper: snapshot before the first commit → change the model → refresh
    // just the canvas immediately (blur's endChange then re-aligns the whole panel)
    const commit = (fn) => (v) => {
      if (!txActive) {
        txActive = true;
        beginChange();
      }
      fn(v);
      api.refreshPreview();
    };
    const endTx = () => {
      if (!txActive) return; // no real commit: not dirty, not in history
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

  /** Multi-selection batch commit wrapper (snapshot on first commit; commit only refreshes the canvas, blur re-aligns the panel). */
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

  /** Element head: type badge + elementId + duplicate + delete. */
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
  // Align / distribute rows (single = page; multi = selection bounding box;
  // algorithm in arrange.js)
  // --------------------------------------------------------------------------
  /** Shared entry for single/multi: single aligns to the page, multi to the selection bounding box. */
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
    // Array order = paint order (later = on top): forward = index +1
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
  // Mixed placeholder (values differ; italic, read-only, disabled)
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

  /** Mixed placeholder inside a two-column cell (label on top). */
  function mixCellPlaceholder(label) {
    return ui.cell(label, mixNode());
  }

  /** Full-width mixed placeholder (label on the left). */
  function mixRow(label) {
    return ui.field(label, mixNode());
  }

  /**
   * Two-column cell: equal → editable number input (writes back to all selected);
   * not equal → the mixed placeholder.
   * @param get (el) => value; set (el, value) => void (already carries the transaction and refresh)
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

  /** Field declaration → displayed labels (for mixed placeholders; button/hint take no placeholder). */
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
  // Multi-selection panel: batch-settable properties are editable, the rest show
  // Mixed placeholders
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

    // Position & size (editable when equal, mixed otherwise)
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

    // Transform: batch when all support it (editable when equal / mixed); otherwise
    // keep the section with mixed placeholders and an explanation
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

  /** Multi transform section: rotation / opacity batchable (editable when equal / mixed) + flip (batch). */
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

  /** Multi selection including types without transform: keep the section + mixed placeholders + note. */
  function mixedTransformSection(els) {
    const g = ui.group("变换");
    const n = els.filter((e) => NO_TRANSFORM.has(e.elementType)).length;
    g.appendChild(mixRow("旋转"));
    g.appendChild(mixRow("透明度"));
    g.appendChild(hintBox(`含 ${n} 个不支持整体变换的元素（表格 / 图表 / 组），旋转与透明度不可批量设置。`));
    return g;
  }

  /** Flip toggle row (batch: each element is set to the target state). */
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

  /** Same-type multi selection: list mixed placeholders per the type declaration; multiple types get an explanation. */
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
  // Common groups: position & size + transform (single selection)
  // --------------------------------------------------------------------------
  function renderCommon(el) {
    const h = helpers();
    const isGroup = el.elementType === "group";

    // -- Position & size --
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

    // -- Transform --
    // Table/chart do not support whole-element rotation/flip/opacity; groups do not rotate as a whole
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
  // Page setup (when no element is selected)
  // --------------------------------------------------------------------------
  function renderPageProps() {
    const deck = state.deck;
    const pg = page();
    // Commit refreshes only the canvas (the panel is not rebuilt so input focus is
    // kept); text inputs such as the title re-align on blur
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
    g2.appendChild(
      ui.field("背景", ui.selectInput(BACKGROUND_TYPES, pg.background?.type || "none", (v) => commit(() => setBackgroundType(pg, v))))
    );
    // Color/angle fields share their source with the page-background dialog (dialogs/page-background.js)
    for (const node of backgroundColorFields(pg, { commit, theme: state.theme })) g2.appendChild(node);
    panel.appendChild(g2);

    const hint = document.createElement("div");
    hint.className = "prop-hint panel-hint";
    hint.textContent = "单击画布上的元素可编辑它的属性；空白处拖动可框选，Ctrl+A 全选，右下角 ＋ 可添加内容。";
    panel.appendChild(hint);
  }

  return {
    refresh,
    /** Release: clear the panel DOM (listeners hang off its children, so they are collected with it). */
    destroy() {
      panel.innerHTML = "";
      txActive = false;
      multiTx = false;
    },
  };
}
