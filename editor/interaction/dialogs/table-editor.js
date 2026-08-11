// ============================================================================
// editor/dialogs/table-editor.js — 表格网格编辑器（Excel 式整体设计）
// ----------------------------------------------------------------------------
// 布局：
//   ┌ 工具条（常驻）：[＋行][＋列][删除行][删除列] | [合并][拆分] | [行高列宽…] ┐
//   ├ 表格区（可滚动占满）───────────────┬ 样式面板（右侧固定，选中单格显示）┤
//   │ 列头 A B C D（点击选整列/拖拽多列） │   B/I · 字号 · 字色 · 填充        │
//   │ 行头 1 2 3（点击选整行/拖拽多行）   │   水平/垂直对齐 · textStyle       │
//   │ 单元格网格（单击/拖拽选区域）       │                                   │
//   └────────────────────────────────────┴───────────────────────────────────┘
// 交互模型（统一选区 → 工具条操作）：
//   - 单元格：单击选中 / 拖拽区域（pointerdown 阻止文本选择，双击进入编辑）
//   - 行头/列头：点击选中整行/整列，拖拽扩展多行/多列
//   - 删除行/列：按当前选区覆盖区间删除（含合并保护，需先拆分）
//   - 合并：区域 >1×1 时启用（按钮显示「合并 N×M」）；拆分：选中合并格时启用
// 样式 = 右侧固定面板（不浮动不换行）；网格复用 renderer/table.js 完整样式链
// （cellFinal/tdCss/estimateTableLayout）——所见即所得。
// ============================================================================

import { showDialog, buildCellInput, button, select } from "./base.js";
import { tableGrid, tryMerge, trySplit, normalizeCells, validateDims, estimateTableLayout } from "../../core/table.js";
import { resolveColor, resolveTableStyle } from "../../core/theme.js";
import { colorField } from "../../ui.js";
import { cellFinal, tdCss } from "../../renderer/table.js";

const H_ALIGNS = [["left", "左"], ["center", "居中"], ["right", "右"], ["justify", "两端"]];
const V_ALIGNS = [["top", "上"], ["middle", "中"], ["bottom", "下"]];
const FONT_SIZES = [10, 12, 13, 14, 16, 18, 20, 24, 28, 32];

/** 当前编辑器主题（对话框内预览与画布同源）。 */
function editorTheme() {
  return window.__pptdEditor?.state?.theme || null;
}

export function openTableEditor(el, { onChange }) {
  const container = document.createElement("div");
  container.className = "table-editor";
  // 选中状态：单格 {r, c} 或区域 {r1, c1, r2, c2}
  let sel = null;
  let dragSel = null; // { mode: "cell"|"row"|"col", anchor: {r,c}, cur: {r,c} }

  function colCount() {
    const cols = el.columnWidths?.length;
    return cols || (el.rows?.[0]?.length) || 1;
  }

  function commit() {
    onChange();
  }

  const isRegion = () => sel && sel.r1 != null;
  const regionRows = () => (isRegion() ? sel.r2 - sel.r1 + 1 : 1);
  const regionCols = () => (isRegion() ? sel.c2 - sel.c1 + 1 : 1);

  /** 主题语义色 swatch（与属性面板 colorField 同源）。 */
  function themeSwatches() {
    const theme = editorTheme();
    const c = theme?.colors || {};
    const keys = ["primary", "accent", "text", "muted", "line", "success", "warning", "danger", "primaryDeep"];
    return keys.map((k) => ({ key: `$${k}`, value: resolveColor(theme, c[k]) || "#cccccc" }));
  }

  // --------------------------------------------------------------------------
  // 选区高亮（不重建 DOM，只切 class）
  // --------------------------------------------------------------------------
  function renderSelection() {
    const gridWrap = container.querySelector(".table-grid");
    if (!gridWrap) return;
    for (const td of gridWrap.querySelectorAll("td.grid-cell")) {
      const r = Number(td.dataset.tr);
      const c = Number(td.dataset.tc);
      if (Number.isNaN(r) || Number.isNaN(c)) continue;
      const single = !isRegion();
      const isSel = single && sel && sel.r === r && sel.c === c;
      const inRegion = isRegion() && r >= sel.r1 && r <= sel.r2 && c >= sel.c1 && c <= sel.c2;
      td.classList.toggle("cell-selected", isSel);
      td.classList.toggle("cell-region", inRegion);
    }
    // 行头/列头联动高亮
    for (const th of gridWrap.querySelectorAll("th.col-head")) {
      const c = Number(th.dataset.cc);
      th.classList.toggle("head-active", isRegion() && c >= sel.c1 && c <= sel.c2);
    }
    for (const td of gridWrap.querySelectorAll("td.row-head")) {
      const r = Number(td.dataset.rr);
      td.classList.toggle("head-active", isRegion() && r >= sel.r1 && r <= sel.r2);
    }
  }

  // --------------------------------------------------------------------------
  // 主渲染：工具条 + 网格 + 样式面板
  // --------------------------------------------------------------------------
  function render() {
    const rows = (el.rows = normalizeCells(el.rows));
    if (!rows.length) rows.push([{ text: "" }]);
    syncDims(el);
    const cols = colCount();
    const { grid: gd } = tableGrid(rows, cols);
    const theme = editorTheme();
    const ts = resolveTableStyle(theme, el.style);
    const { rowHeights, columnWidths } = estimateTableLayout(el);
    const rowCount = gd.length;

    container.innerHTML = "";

    // ---- 工具条（常驻） ----
    const toolbar = document.createElement("div");
    toolbar.className = "table-toolbar";
    const sep = () => {
      const s = document.createElement("span");
      s.className = "toolbar-sep";
      return s;
    };
    const mkBtn = (label, onClick, opts = {}) => {
      const b = button(label, onClick);
      if (opts.disabled) b.disabled = true;
      if (opts.title) b.title = opts.title;
      return b;
    };
    // 选区区间（单格 → 该行/该列）
    const selRows = () => (isRegion() ? [sel.r1, sel.r2] : [sel.r, sel.r]);
    const selCols = () => (isRegion() ? [sel.c1, sel.c2] : [sel.c, sel.c]);

    const addRowBtn = mkBtn("＋ 行", () => {
      rows.push(Array.from({ length: cols }, () => ({ text: "" })));
      syncDims(el); render(); commit();
    });
    const addColBtn = mkBtn("＋ 列", () => {
      for (const row of rows) row.push({ text: "" });
      syncDims(el); render(); commit();
    });
    const delRowBtn = mkBtn("删除行", () => {
      const [r1, r2] = selRows();
      if (rowCount <= 1) return;
      if (mergeGuard(rows, cols, r1, r2, "row")) return;
      rows.splice(r1, r2 - r1 + 1);
      sel = null;
      syncDims(el); render(); commit();
    }, { disabled: !sel, title: "删除选中行（选区覆盖的所有行）" });
    const delColBtn = mkBtn("删除列", () => {
      const [c1, c2] = selCols();
      if (cols <= 1) return;
      if (mergeGuard(rows, cols, c1, c2, "col")) return;
      for (const row of rows) row.splice(c1, c2 - c1 + 1);
      sel = null;
      syncDims(el); render(); commit();
    }, { disabled: !sel, title: "删除选中列（选区覆盖的所有列）" });
    const mergeBtn = mkBtn("合并", () => {
      if (!isRegion() || (regionRows() === 1 && regionCols() === 1)) return;
      const err = tryMerge(rows, sel.r1, sel.c1, sel.r2, sel.c2, cols);
      if (err) { alert(err); return; }
      sel = { r: sel.r1, c: sel.c1 };
      render(); commit();
    }, { disabled: !isRegion() || (regionRows() === 1 && regionCols() === 1) });
    if (isRegion()) mergeBtn.textContent = `合并 ${regionRows()}×${regionCols()}`;
    const splitBtn = mkBtn("拆分", () => {
      if (!sel || sel.r1 != null) return;
      const err = trySplit(rows, sel.r, sel.c, cols);
      if (err) { alert(err); return; }
      render(); commit();
    }, { disabled: true });
    const cellAt = sel && !isRegion() ? gd[sel.r]?.[sel.c]?.cell : null;
    const isMerged = cellAt && ((cellAt.rowSpan || 1) > 1 || (cellAt.colSpan || 1) > 1);
    splitBtn.disabled = !isMerged;
    splitBtn.title = isMerged ? "" : "选中合并单元格后可拆分";
    const dimBtn = mkBtn("行高/列宽…", () => editDims(el, commit, render));

    toolbar.append(addRowBtn, addColBtn, delRowBtn, delColBtn, sep(), mergeBtn, splitBtn, sep(), dimBtn);
    container.appendChild(toolbar);

    // ---- 主体：网格 + 样式面板 ----
    const body = document.createElement("div");
    body.className = "table-body";

    // 网格区（可滚动）
    const gridWrap = document.createElement("div");
    gridWrap.className = "table-grid";
    const table = document.createElement("table");
    table.className = "data-table";
    const colgroup = document.createElement("colgroup");
    // 行头列（固定窄列，必须占 colgroup 首位，否则数据列百分比错位挤爆行头）
    const headCol = document.createElement("col");
    headCol.style.width = "18px";
    colgroup.appendChild(headCol);
    columnWidths.forEach((cw) => {
      const col = document.createElement("col");
      col.style.width = `${(cw * 100).toFixed(3)}%`;
      colgroup.appendChild(col);
    });
    table.appendChild(colgroup);

    // 列头（Excel 式：A/B/C…，点击/拖拽选列）
    const thead = document.createElement("thead");
    const headTr = document.createElement("tr");
    const corner = document.createElement("th");
    corner.className = "head-corner";
    headTr.appendChild(corner);
    for (let c = 0; c < cols; c++) {
      const th = document.createElement("th");
      th.className = "col-head";
      th.dataset.cc = String(c);
      th.textContent = String.fromCharCode(65 + c);
      headTr.appendChild(th);
    }
    thead.appendChild(headTr);
    table.appendChild(thead);

    // 行体（行头 + 单元格）
    const tbody = document.createElement("tbody");
    gd.forEach((gRow, r) => {
      const tr = document.createElement("tr");
      tr.style.height = `${rowHeights[r] ?? 26}px`;
      const th0 = document.createElement("td");
      th0.className = "row-head";
      th0.dataset.rr = String(r);
      th0.textContent = String(r + 1);
      tr.appendChild(th0);

      gRow.forEach((g, c) => {
        const td = document.createElement("td");
        td.className = "grid-cell";
        td.dataset.tr = String(r);
        td.dataset.tc = String(c);
        const f = cellFinal(theme, ts, r, c, rowCount, cols, g.covered ? null : g.cell, el.fill);
        td.style.cssText = tdCss(theme, f, g.covered);
        if (g.covered) {
          td.classList.add("cell-covered");
          td.title = "被合并单元格覆盖";
          tr.appendChild(td);
          return;
        }
        td.title = `(${r + 1}, ${c + 1})${(g.cell?.rowSpan || 1) > 1 || (g.cell?.colSpan || 1) > 1 ? " · 合并格" : ""}`;
        if ((g.cell?.rowSpan || 1) > 1) td.rowSpan = g.cell.rowSpan;
        if ((g.cell?.colSpan || 1) > 1) td.colSpan = g.cell.colSpan;
        const input = buildCellInput(g.cell?.text ?? "", "双击编辑", () => {
          g.cell.text = input.value;
          commit();
        });
        td.appendChild(input);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    gridWrap.appendChild(table);
    body.appendChild(gridWrap);

    // 样式面板（右侧固定）
    container.appendChild(body);

    bindDragSelect(gridWrap);
    renderSelection();
    refreshStylePanel();
  }

  /** 合并保护：删除区间 [a1,a2] 与合并格冲突检查（axis: row 查 rowSpan / col 查 colSpan）。 */
  function mergeGuard(rows, cols, a1, a2, axis) {
    const { grid: gd } = tableGrid(rows, cols);
    for (let r = 0; r < gd.length; r++) {
      for (let c = 0; c < cols; c++) {
        const g = gd[r][c];
        if (!g || g.covered) continue;
        const span = axis === "row" ? g.cell?.rowSpan || 1 : g.cell?.colSpan || 1;
        if (span <= 1) continue;
        const s = axis === "row" ? r : c;
        const e = s + span - 1;
        // 主格在区间内但覆盖出区间，或主格在区间外但覆盖进区间 → 禁止
        if ((s >= a1 && s <= a2 && e > a2) || (s < a1 && e >= a1)) {
          alert(axis === "row" ? "选区涉及跨行合并单元格，请先拆分再删除行" : "选区涉及跨列合并单元格，请先拆分再删除列");
          return true;
        }
      }
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // 拖拽选区（单元格区域 / 行头整行 / 列头整列）
  // --------------------------------------------------------------------------
  function bindDragSelect(gridWrap) {
    let dragScrollRaf = 0;

    /** 按当前坐标更新选区（三种模式共用）。 */
    const updateDragSel = (clientX, clientY) => {
      if (!dragSel) return;
      const elAt = document.elementFromPoint(clientX, clientY);
      const rows = el.rows.length;
      const cols = colCount();
      if (dragSel.mode === "col") {
        const th = elAt?.closest?.("th.col-head");
        if (!th) return;
        const c = Math.min(cols - 1, Math.max(0, Number(th.dataset.cc)));
        if (c === dragSel.cur.c) return;
        dragSel.cur.c = c;
        sel = { r1: 0, c1: Math.min(dragSel.anchor.c, c), r2: rows - 1, c2: Math.max(dragSel.anchor.c, c) };
      } else if (dragSel.mode === "row") {
        const th0 = elAt?.closest?.("td.row-head");
        if (!th0) return;
        const r = Math.min(rows - 1, Math.max(0, Number(th0.dataset.rr)));
        if (r === dragSel.cur.r) return;
        dragSel.cur.r = r;
        sel = { r1: Math.min(dragSel.anchor.r, r), c1: 0, r2: Math.max(dragSel.anchor.r, r), c2: cols - 1 };
      } else {
        const td = elAt?.closest?.("td.grid-cell:not(.cell-covered)");
        if (!td) return;
        const r = Number(td.dataset.tr);
        const c = Number(td.dataset.tc);
        if (r === dragSel.cur.r && c === dragSel.cur.c) return;
        dragSel.cur = { r, c };
        sel = {
          r1: Math.min(dragSel.anchor.r, r), c1: Math.min(dragSel.anchor.c, c),
          r2: Math.max(dragSel.anchor.r, r), c2: Math.max(dragSel.anchor.c, c),
        };
      }
      renderSelection();
    };

    /** 边缘自动滚动（Excel 式）：鼠标贴容器边缘时持续滚动并扩展选区。 */
    const dragScrollTick = () => {
      if (!dragSel) { dragScrollRaf = 0; return; }
      const rect = gridWrap.getBoundingClientRect();
      const M = 26;
      let dx = 0;
      let dy = 0;
      if (dragSel.my < rect.top + M) dy = -14;
      else if (dragSel.my > rect.bottom - M) dy = 14;
      if (dragSel.mx < rect.left + M) dx = -14;
      else if (dragSel.mx > rect.right - M) dx = 14;
      if (dx || dy) {
        gridWrap.scrollTop += dy;
        gridWrap.scrollLeft += dx;
        updateDragSel(dragSel.mx, dragSel.my);
        dragScrollRaf = requestAnimationFrame(dragScrollTick);
      } else {
        dragScrollRaf = 0;
      }
    };

    gridWrap.addEventListener("pointerdown", (e) => {
      // 列头 → 整列模式
      const th = e.target.closest("th.col-head");
      if (th) {
        e.preventDefault();
        const c = Number(th.dataset.cc);
        dragSel = { mode: "col", anchor: { r: 0, c }, cur: { r: 0, c } };
        sel = { r1: 0, c1: c, r2: 0, c2: c }; // 行区间后续按行数扩展
        renderSelection();
        refreshStylePanel();
        return;
      }
      // 行头 → 整行模式
      const th0 = e.target.closest("td.row-head");
      if (th0) {
        e.preventDefault();
        const r = Number(th0.dataset.rr);
        dragSel = { mode: "row", anchor: { r, c: 0 }, cur: { r, c: 0 } };
        sel = { r1: r, c1: 0, r2: r, c2: colCount() - 1 };
        renderSelection();
        refreshStylePanel();
        return;
      }
      // 单元格 → 区域模式
      const td = e.target.closest("td.grid-cell:not(.cell-covered)");
      if (!td) return;
      const inp = td.querySelector("input");
      if (inp && document.activeElement === inp) return; // 编辑态：允许 input 内文本操作
      e.preventDefault();
      const r = Number(td.dataset.tr);
      const c = Number(td.dataset.tc);
      dragSel = { mode: "cell", anchor: { r, c }, cur: { r, c } };
      sel = { r, c };
      renderSelection();
      refreshStylePanel();
    });

    gridWrap.addEventListener("pointermove", (e) => {
      if (!dragSel) return;
      dragSel.mx = e.clientX;
      dragSel.my = e.clientY;
      updateDragSel(e.clientX, e.clientY);
      // 边缘自动滚动开关
      const rect = gridWrap.getBoundingClientRect();
      const M = 26;
      const inEdge =
        e.clientY < rect.top + M || e.clientY > rect.bottom - M ||
        e.clientX < rect.left + M || e.clientX > rect.right - M;
      if (inEdge) {
        if (!dragScrollRaf) dragScrollRaf = requestAnimationFrame(dragScrollTick);
      } else if (dragScrollRaf) {
        cancelAnimationFrame(dragScrollRaf);
        dragScrollRaf = 0;
      }
    });

    const endDrag = () => {
      if (dragScrollRaf) { cancelAnimationFrame(dragScrollRaf); dragScrollRaf = 0; }
      if (!dragSel) return;
      dragSel = null;
      if (isRegion()) render(); // 区域完成：重建（按钮态「合并 N×M」/删除行列启用）
    };
    gridWrap.addEventListener("pointerup", endDrag);
    gridWrap.addEventListener("pointercancel", endDrag);
    window.addEventListener("blur", endDrag);

    // 双击进入编辑（pointerdown 已阻止单击聚焦）
    gridWrap.addEventListener("dblclick", (e) => {
      const td = e.target.closest("td.grid-cell:not(.cell-covered)");
      const inp = td?.querySelector("input");
      if (inp) inp.focus();
    });
  }

  // --------------------------------------------------------------------------
  // 样式面板（右侧固定；选中单格时显示样式控件，其余显示提示）
  // --------------------------------------------------------------------------
  let stylePanel = null;
  function refreshStylePanel() {
    if (stylePanel) stylePanel.remove();
    stylePanel = renderStylePanel();
    container.querySelector(".table-body")?.appendChild(stylePanel);
  }

  function renderStylePanel() {
    const panel = document.createElement("div");
    panel.className = "style-panel";
    const title = document.createElement("div");
    title.className = "style-panel-title";
    title.textContent = "单元格样式";
    panel.appendChild(title);

    if (!sel || sel.r1 != null) {
      const hint = document.createElement("div");
      hint.className = "style-panel-hint";
      hint.textContent = "单击选中单元格后可编辑样式；拖拽选择区域后可合并/删除。";
      panel.appendChild(hint);
      return panel;
    }
    const cell = tableGrid(el.rows, colCount()).grid[sel.r]?.[sel.c]?.cell;
    if (!cell) return panel;

    const set = (fn) => { fn(cell); commit(); render(); };
    const F = (label, control) => {
      const w = document.createElement("div");
      w.className = "style-row";
      const l = document.createElement("label");
      l.textContent = label;
      w.append(l, control);
      return w;
    };

    // 文字样式
    const bBtn = button(cell.bold ? "B ✓" : "B", () => set((c) => { c.bold = !c.bold; }));
    bBtn.className += cell.bold ? " style-active" : "";
    const iBtn = button(cell.italic ? "I ✓" : "I", () => set((c) => { c.italic = !c.italic; }));
    iBtn.className += cell.italic ? " style-active" : "";
    const biWrap = document.createElement("div");
    biWrap.className = "style-bi";
    biWrap.append(bBtn, iBtn);
    panel.appendChild(F("文字", biWrap));

    const sizeSel = select(FONT_SIZES.map((n) => [String(n), `${n}pt`]), String(cell.fontSize || 13), (v) => set((c) => { c.fontSize = Number(v); }));
    panel.appendChild(F("字号", sizeSel));

    const colorCtl = colorField(cell.color || "$text", (v) => set((c) => { v ? (c.color = v) : delete c.color; }), {
      resolve: (val) => resolveColor(editorTheme(), val),
      swatches: themeSwatches(),
    });
    panel.appendChild(F("字色", colorCtl));

    const fillCtl = colorField(cell.fill?.color || "", (v) => set((c) => { v ? (c.fill = { type: "solid", color: v }) : delete c.fill; }), {
      resolve: (val) => resolveColor(editorTheme(), val),
      swatches: themeSwatches(),
    });
    panel.appendChild(F("填充", fillCtl));

    const hSel = select(H_ALIGNS, cell.align?.[0] || "", (v) => set((c) => { c.align = [v || "left", c.align?.[1] || "middle"]; }));
    panel.appendChild(F("水平", hSel));
    const vSel = select(V_ALIGNS, cell.align?.[1] || "", (v) => set((c) => { c.align = [c.align?.[0] || "left", v || "middle"]; }));
    panel.appendChild(F("垂直", vSel));

    const tsKeys = Object.keys(editorTheme()?.textStyles || {});
    const tsSel = select([["", "（无）"], ...tsKeys.map((k) => [k, `$${k}`])], cell.textStyle || "", (v) => set((c) => { v ? (c.textStyle = v) : delete c.textStyle; }));
    panel.appendChild(F("textStyle", tsSel));

    return panel;
  }

  function syncDims(el) {
    const rows = el.rows || [];
    const cols = colCount();
    if (!Array.isArray(el.columnWidths) || el.columnWidths.length !== cols) {
      el.columnWidths = Array.from({ length: cols }, () => 1 / cols);
    }
    if (!Array.isArray(el.rowHeights) || el.rowHeights.length !== rows.length) {
      el.rowHeights = Array.from({ length: rows.length }, () => 1 / rows.length);
    }
  }

  render();
  showDialog("表格编辑", container);
  // 加宽对话框（表格 + 右侧样式面板）
  const dlg = container.closest(".dialog");
  if (dlg) dlg.style.width = "min(880px, 96vw)";
}

/** 行高/列宽比例编辑对话框（滑块 + 数字；拖动一项按比例缩放其余项，保持和 = 1）。 */
function editDims(el, commit, rerender) {
  const body = document.createElement("div");
  body.style.cssText = "display:flex;flex-direction:column;gap:12px;min-width:340px;";
  const mk = (label, dims, onSet) => {
    const wrap = document.createElement("div");
    const title = document.createElement("div");
    title.style.cssText = "font-weight:600;margin-bottom:6px;font-size:13px;";
    title.textContent = label;
    const rows = dims.map((v, i) => {
      const r = document.createElement("div");
      r.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:4px;";
      const idx = document.createElement("span");
      idx.style.cssText = "width:44px;flex:none;font-size:12px;color:#6b7280;";
      idx.textContent = i === 0 ? "表头" : `第 ${i + 1} 项`;
      const range = document.createElement("input");
      range.type = "range";
      range.min = "1";
      range.max = "100";
      range.step = "1";
      range.value = String(Math.round(v * 100));
      range.style.cssText = "flex:1;min-width:0;";
      const num = document.createElement("input");
      num.type = "number";
      num.min = "1";
      num.max = "100";
      num.step = "1";
      num.value = String(Math.round(v * 100));
      num.style.cssText = "width:52px;flex:none;";
      num.title = "百分比";
      const apply = (pct) => {
        const next = Math.min(99, Math.max(1, Number(pct) || 1)) / 100;
        const old = dims[i];
        if (Math.abs(old - next) < 0.001) return;
        // 保持和 = 1：其余项等比缩放
        const others = dims.reduce((a, x, j) => a + (j === i ? 0 : x), 0);
        if (others > 0) {
          const scale = (1 - next) / others;
          dims.forEach((x, j) => { if (j !== i) dims[j] = Math.min(0.99, Math.max(0.01, x * scale)); });
        }
        dims[i] = next;
        refreshAll();
        onSet();
      };
      range.addEventListener("input", () => apply(range.value));
      num.addEventListener("change", () => apply(num.value));
      r.append(idx, range, num);
      return { r, range, num };
    });
    const refreshAll = () => {
      rows.forEach(({ range, num }, i) => {
        range.value = String(Math.round(dims[i] * 100));
        num.value = String(Math.round(dims[i] * 100));
      });
    };
    wrap.append(title);
    rows.forEach(({ r }) => wrap.appendChild(r));
    return wrap;
  };
  const dimsChanged = () => {
    validateDims(el.columnWidths, "columnWidths");
    validateDims(el.rowHeights, "rowHeights");
    commit();
    rerender();
  };
  body.append(
    mk("列宽比例（百分比，和 = 100%）", el.columnWidths, dimsChanged),
    mk("行高比例（百分比，和 = 100%）", el.rowHeights, dimsChanged)
  );
  showDialog("行高 / 列宽", body);
}
