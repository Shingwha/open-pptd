// ============================================================================
// interaction/dialogs/table-editor.js — table grid editor (minimal, editor-ux §4.2)
// ----------------------------------------------------------------------------
// Layout:
//   ┌ toolbar: [↑插行][↓插行][←插列][→插列] | [删除行][删除列] | [合并][拆分] ┐
//   ├ table area (Excel-style grid: column letters / row numbers / drag select) │
//   └ style panel (fixed right, only for a single selected cell): 字色 / 填充   ┘
// Kept: cell text, insert/delete row+column (merge protection), merge/split,
//       cell text color and cell fill.
// Removed with 3.0: table style panel (font / size / bold / italic / alignment /
//       border / textStyle) and the row-height / column-width dialog; row heights
//       come from measureTable's final values and vertical resize writes rowHeights.
// The grid reuses renderer/table.js's full style chain (cellFinal/tdCss) for a
// WYSIWYG cell surface.
// ============================================================================

import { resolveEditorTheme, showDialog } from "./base.js";
import { dialogs } from "../../dialogs.js";
import { createExcelGrid } from "../excel-grid.js";
import {
  colLetter,
  normalizeCells,
  resolveTableStyle,
  tableGrid,
  tryMerge,
  trySplit,
} from "../../../packages/model/index.js";
import { measureTable } from "../../../packages/measure/index.js";
import { cellFinal, tdCss } from "../../../packages/renderer/index.js";
import * as ui from "../../ui.js";
import { themeSwatches } from "../fields.js";
import { resolveColor } from "../../../packages/model/index.js";

export function openTableEditor(el, { onChange, beginChange, onDone } = {}) {
  const container = document.createElement("div");
  container.className = "table-editor";

  function colCount() {
    const cols = el.columnWidths?.length;
    return cols || (el.rows?.[0]?.length) || 1;
  }

  const commit = () => onChange?.();

  // Model snapshot (updated on render; grid callbacks reference it — same object
  // as the model, so input commits take effect directly)
  let rows = [];
  let cols = 1;
  let theme = null;
  let ts = null;
  let gd = [];
  let rowHeights = [];
  let columnWidths = [];

  // -- Excel-style data grid (shared interaction/excel-grid.js) --
  const grid = createExcelGrid({
    getRows: () => rows.length,
    getCols: () => cols,
    cellValue: (r, c) => gd[r]?.[c]?.cell?.text ?? "",
    onCellChange: (r, c, v) => {
      const g = gd[r]?.[c];
      if (g && !g.covered) {
        beginChange?.();
        g.cell ||= {};
        g.cell.text = v;
        commit();
      }
    },
    covered: (r, c) => !!gd[r]?.[c]?.covered,
    rowSpan: (r, c) => gd[r]?.[c]?.cell?.rowSpan || 1,
    colSpan: (r, c) => gd[r]?.[c]?.cell?.colSpan || 1,
    cellCss: (r, c) => {
      const g = gd[r]?.[c];
      if (!g) return "";
      return tdCss(theme, cellFinal(theme, ts, r, c, rows.length, cols, g.covered ? null : g.cell, el.fill), g.covered);
    },
    inputCss: (r, c) => {
      const g = gd[r]?.[c];
      if (!g || g.covered) return "";
      const hl = resolveColor(theme, cellFinal(theme, ts, r, c, rows.length, cols, g.cell, el.fill).backgroundColor);
      return hl ? `background:${hl}` : "";
    },
    rowHeight: (r) => rowHeights?.[r] ?? null,
    colWidths: () => columnWidths,
    colHeadContent: (c) => colLetter(c),
    cellTitle: (r, c) => {
      const g = gd[r]?.[c];
      if (!g) return "";
      if (g.covered) return "被合并单元格覆盖";
      const m = (g.cell?.rowSpan || 1) > 1 || (g.cell?.colSpan || 1) > 1;
      return `(${r + 1}, ${c + 1})${m ? " · 合并格" : ""}`;
    },
    cellPlaceholder: () => "双击编辑",
    canInsertRows: (at, n) => (insertGuard(rows, cols, at, "row") ? "插入位置与跨行合并单元格冲突，请先拆分" : null),
    canInsertCols: (at, n) => (insertGuard(rows, cols, at, "col") ? "插入位置与跨列合并单元格冲突，请先拆分" : null),
    canDeleteRows: (r1, r2) => (mergeGuard(rows, cols, r1, r2, "row") ? "选区涉及跨行合并单元格，请先拆分再删除行" : null),
    canDeleteCols: (c1, c2) => (mergeGuard(rows, cols, c1, c2, "col") ? "选区涉及跨列合并单元格，请先拆分再删除列" : null),
    onInsertRows: (at, n) => {
      beginChange?.();
      rows.splice(at, 0, ...Array.from({ length: n }, () => Array.from({ length: cols }, () => ({ text: "" }))));
      ({ grid: gd } = tableGrid(rows, cols));
      syncDims(el);
      commit();
    },
    onInsertCols: (at, n) => {
      beginChange?.();
      for (const row of rows) row.splice(at, 0, ...Array.from({ length: n }, () => ({ text: "" })));
      // Column count changed: insert into columnWidths too (neighbouring width), otherwise
      // colCount is pinned to the old length and the new column is displaced
      const cw = Array.isArray(el.columnWidths) ? [...el.columnWidths] : Array.from({ length: cols }, () => 1 / cols);
      const w = cw[Math.min(at, cw.length - 1)] ?? 1 / (cw.length + n);
      el.columnWidths = [...cw.slice(0, at), ...Array.from({ length: n }, () => w), ...cw.slice(at)];
      const total = el.columnWidths.reduce((a, b) => a + b, 0) || 1;
      el.columnWidths = el.columnWidths.map((x) => x / total); // renormalize so the sum = 1 (official constraint)
      cols = colCount(); // update the closure column count (read by getCols), else rebuilds use the old count
      ({ grid: gd } = tableGrid(rows, cols));
      syncDims(el);
      commit();
    },
    onDeleteRows: (r1, r2) => {
      beginChange?.();
      rows.splice(r1, r2 - r1 + 1);
      ({ grid: gd } = tableGrid(rows, cols));
      syncDims(el);
      commit();
    },
    onDeleteCols: (c1, c2) => {
      beginChange?.();
      for (const row of rows) row.splice(c1, c2 - c1 + 1);
      if (Array.isArray(el.columnWidths)) {
        el.columnWidths.splice(c1, c2 - c1 + 1);
        const total = el.columnWidths.reduce((a, b) => a + b, 0) || 1;
        el.columnWidths = el.columnWidths.map((x) => x / total);
      }
      cols = colCount(); // update the closure column count (read by getCols)
      ({ grid: gd } = tableGrid(rows, cols));
      syncDims(el);
      commit();
    },
    extraToolbar: (mkBtn, sep) => {
      const mergeBtn = mkBtn("合并", () => {
        if (!grid.isRegion() || (grid.regionRows() === 1 && grid.regionCols() === 1)) return;
        const s = grid.getSel();
        const err = tryMerge(rows, s.r1, s.c1, s.r2, s.c2, cols);
        if (err) { dialogs.alert(err); return; }
        beginChange?.();
        grid.setSel({ r: s.r1, c: s.c1 });
        render();
        commit();
      }, { disabled: !grid.isRegion() || (grid.regionRows() === 1 && grid.regionCols() === 1) });
      if (grid.isRegion()) mergeBtn.textContent = `合并 ${grid.regionRows()}×${grid.regionCols()}`;
      const splitBtn = mkBtn("拆分", () => {
        const s = grid.getSel();
        if (!s || s.r1 != null) return;
        const err = trySplit(rows, s.r, s.c, cols);
        if (err) { dialogs.alert(err); return; }
        beginChange?.();
        render();
        commit();
      }, { disabled: true });
      const s = grid.getSel();
      const cellAt = s && !grid.isRegion() ? gd[s.r]?.[s.c]?.cell : null;
      const isMerged = cellAt && ((cellAt.rowSpan || 1) > 1 || (cellAt.colSpan || 1) > 1);
      splitBtn.disabled = !isMerged;
      splitBtn.title = isMerged ? "" : "选中合并单元格后可拆分";
      return [mergeBtn, splitBtn, sep()];
    },
    onSelect: (next, kind) => {
      if (kind !== "end") refreshStylePanel(); // refresh the panel live with the selection
    },
    afterRender: () => refreshStylePanel(),
  });

  // --------------------------------------------------------------------------
  // Main render: toolbar + grid + cell panel
  // --------------------------------------------------------------------------
  function render() {
    rows = (el.rows = normalizeCells(el.rows));
    if (!rows.length) rows.push([{ text: "" }]);
    syncDims(el);
    cols = colCount();
    ({ grid: gd } = tableGrid(rows, cols));
    theme = resolveEditorTheme();
    ts = resolveTableStyle(theme, el.style);
    // Same final measure as layout/renderer/writer (style-aware, rowSpan-balanced),
    // so the grid rows show the exported heights rather than the model floor estimate.
    ({ rowHeights, columnWidths } = measureTable(el, { theme }));
    container.innerHTML = "";
    const body = document.createElement("div");
    body.className = "table-body";
    body.appendChild(grid.root); // toolbar + grid (the component rebuilds internally)
    container.appendChild(body);
    grid.render();
    refreshStylePanel(); // initial panel (afterRender already fired; guards the initial selection state)
  }

  /** Merge protection: check deletion span [a1,a2] against merged cells (axis: row reads rowSpan / col reads colSpan). */
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
        // Master inside the span but covering beyond it, or master outside covering into it → reject
        if ((s >= a1 && s <= a2 && e > a2) || (s < a1 && e >= a1)) {
          dialogs.alert(axis === "row" ? "选区涉及跨行合并单元格，请先拆分再删除行" : "选区涉及跨列合并单元格，请先拆分再删除列");
          return true;
        }
      }
    }
    return false;
  }

  /** Insert protection: check insert position `at` against merged cells (a master crossing it would misalign). */
  function insertGuard(rows, cols, at, axis) {
    const { grid: gd } = tableGrid(rows, cols);
    for (let r = 0; r < gd.length; r++) {
      for (let c = 0; c < cols; c++) {
        const g = gd[r][c];
        if (!g || g.covered) continue;
        const span = axis === "row" ? g.cell?.rowSpan || 1 : g.cell?.colSpan || 1;
        if (span <= 1) continue;
        const s = axis === "row" ? r : c;
        if (s < at && at <= s + span - 1) {
          dialogs.alert(axis === "row" ? "插入位置与跨行合并单元格冲突，请先拆分" : "插入位置与跨列合并单元格冲突，请先拆分");
          return true;
        }
      }
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // Cell panel (fixed right; only for a single selected cell): text color + fill
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

    const s = grid.getSel();
    if (!s || s.r1 != null) {
      const hint = document.createElement("div");
      hint.className = "prop-hint";
      hint.textContent = "单击选中单元格后可改字色/填充；拖拽选择区域后可合并或删除行列。";
      panel.appendChild(hint);
      return panel;
    }
    const cell = gd[s.r]?.[s.c]?.cell;
    if (!cell) return panel;

    const set = (fn) => {
      beginChange?.();
      fn(cell);
      commit();
      render();
    };
    const resolve = (val) => resolveColor(resolveEditorTheme(), val);
    const swatches = themeSwatches(resolveEditorTheme());

    panel.appendChild(
      ui.field(
        "字色",
        ui.colorField(cell.color || "$text", (v) => set((c) => (v ? (c.color = v) : delete c.color)), { resolve, swatches })
      )
    );
    panel.appendChild(
      ui.field(
        "填充",
        ui.colorField(
          cell.fill?.color || "",
          (v) => set((c) => (v ? (c.fill = { type: "solid", color: v }) : delete c.fill)),
          { resolve, swatches }
        )
      )
    );
    return panel;
  }

  function syncDims(el) {
    const rows = el.rows || [];
    const cols = colCount();
    if (!Array.isArray(el.columnWidths) || el.columnWidths.length !== cols) {
      el.columnWidths = Array.from({ length: cols }, () => 1 / cols);
    }
    // rowHeights is not auto-filled: absent = auto row height (computed from content
    // by the layout engine); canvas vertical resize writes rowHeights (canvas.js).
  }

  render();
  showDialog("表格编辑", container, { onClose: () => onDone?.() });
  // Widen the dialog (table + right cell panel)
  const dlg = container.closest(".dialog");
  if (dlg) dlg.style.width = "min(880px, 96vw)";
}
