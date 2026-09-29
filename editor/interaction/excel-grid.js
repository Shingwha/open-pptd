// ============================================================================
// interaction/excel-grid.js — Excel-style data grid component (table/chart editors)
// ----------------------------------------------------------------------------
// Modelled on the table editor's grid, parameterizing the differences (merged
// cells / column widths / column-header content / extra toolbar buttons / cell
// styles). Table and chart share one DOM structure, selection model and interaction:
//   - toolbar: ↑insert row ↓insert row ←insert col →insert col | delete row delete col [+ consumer extras]
//   - grid: colgroup (fixed 18px row-header column + data column widths) + letter
//     column headers + numeric row headers + input cells
//   - selection: single cell {r,c} / region {r1,c1,r2,c2} (same semantics as the
//     table editor); dragging selects whole rows/columns/regions (shared
//     interaction/drag-select.js, including edge auto-scroll)
// Insert/delete go through callbacks so the consumer mutates the model (it may
// return an error string to reject, e.g. the table's merge protection); the
// component owns the new selection and rebuild. External hooks such as style
// panels run through afterRender / onSelect.
// ============================================================================

import { button, buildCellInput } from "./dialogs/base.js";
import { dialogs } from "../dialogs.js";
import { bindExcelDragSelect } from "./drag-select.js";
import { colLetter } from "../../packages/model/index.js";

/** Minimum data-column width (px): Excel-style fixed column widths — many columns overflow and scroll horizontally, never squeeze. */
const MIN_COL_W = 96;
/** Logical column-width base (px): columnWidths ratio × base = actual width (same ratio for preview and export). */
const COL_BASE_W = 560;

/**
 * @param {object} opts
 *  Data access:
 *   - getRows(): row count
 *   - getCols(): column count
 *   - cellValue(r, c): cell display text (string)
 *   - onCellChange(r, c, v): input commit (consumer mutates the model)
 *   - covered(r, c): whether the cell is a merge placeholder (default false)
 *   - rowSpan(r, c) / colSpan(r, c): merge master span (default 1)
 *   - cellCss(r, c): td style cssText (table = tdCss; chart empty)
 *   - inputCss(r, c): input style cssText (table = highlight background; chart empty)
 *   - rowHeight(r): row height px (default empty)
 *   - colWidths(): data-column width ratio array 0-1 (default even)
 *   - colHeadContent(c): column-header content (Node|string; default letters)
 *   - cellTitle(r, c): cell title (default empty)
 *   - cellPlaceholder(r, c): input placeholder (default empty; the table editor supplies its own)
 *  Operations (the consumer mutates the model and commits; an error string rejects):
 *   - canInsertRows(at, n) / canInsertCols(at, n)
 *   - canDeleteRows(r1, r2) / canDeleteCols(c1, c2)
 *   - onInsertRows(at, n) / onInsertCols(at, n)
 *   - onDeleteRows(r1, r2) / onDeleteCols(c1, c2)
 *  Hooks:
 *   - extraToolbar(mkBtn, sep): extra toolbar buttons (table: merge/split/row-col size)
 *   - onSelect(sel, kind): selection-change callback (kind = cell|row|col|end; sel is null at end)
 *   - afterRender(): called after every rebuild (table: refresh the style panel)
 */
export function createExcelGrid(opts) {
  const {
    getRows, getCols,
    cellValue, onCellChange,
    covered = () => false,
    rowSpan = () => 1, colSpan = () => 1,
    cellCss = () => "", inputCss = () => "",
    rowHeight = () => null, colWidths = null,
    colHeadContent = null, cellTitle = () => "", cellPlaceholder = () => "",
    canInsertRows = null, canInsertCols = null,
    canDeleteRows = null, canDeleteCols = null,
    onInsertRows, onInsertCols, onDeleteRows, onDeleteCols,
    extraToolbar = null, onSelect = null, afterRender = null,
  } = opts;

  const root = document.createElement("div");
  root.className = "excel-grid";

  // Selection (single cell {r,c} / region {r1,c1,r2,c2}; Excel-style active cell A1)
  let sel = { r: 0, c: 0 };

  const isRegion = () => sel && sel.r1 != null;
  const regionRows = () => (isRegion() ? sel.r2 - sel.r1 + 1 : 1);
  const regionCols = () => (isRegion() ? sel.c2 - sel.c1 + 1 : 1);
  const selRows = () => (isRegion() ? [sel.r1, sel.r2] : [sel.r, sel.r]);
  const selCols = () => (isRegion() ? [sel.c1, sel.c2] : [sel.c, sel.c]);

  /** Directional insert (Excel style): at = insert position, n = count (= selection span). */
  const insertRows = (at, n) => {
    const err = canInsertRows ? canInsertRows(at, n) : null;
    if (err) { dialogs.alert(err); return; }
    onInsertRows(at, n);
    sel = { r1: at, c1: 0, r2: at + n - 1, c2: getCols() - 1 }; // select the inserted rows
    render();
  };
  const insertCols = (at, n) => {
    const err = canInsertCols ? canInsertCols(at, n) : null;
    if (err) { dialogs.alert(err); return; }
    onInsertCols(at, n);
    sel = { r1: 0, c1: at, r2: getRows() - 1, c2: at + n - 1 }; // select the inserted columns
    render();
  };
  const deleteRows = (r1, r2) => {
    if (getRows() <= 1) return;
    const err = canDeleteRows ? canDeleteRows(r1, r2) : null;
    if (err) { dialogs.alert(err); return; }
    onDeleteRows(r1, r2);
    sel = { r: Math.min(r1, getRows() - 1), c: 0 }; // fall back to the adjacent row's first column (matches the table baseline)
    render();
  };
  const deleteCols = (c1, c2) => {
    if (getCols() <= 1) return;
    const err = canDeleteCols ? canDeleteCols(c1, c2) : null;
    if (err) { dialogs.alert(err); return; }
    onDeleteCols(c1, c2);
    sel = { r: 0, c: Math.min(c1, getCols() - 1) }; // fall back to the first row's adjacent column
    render();
  };

  /** Full rebuild (toolbar + grid). Call after the consumer changes the model. */
  function render() {
    root.innerHTML = "";
    const cols = getCols();
    const rows = getRows();

    // ---- Toolbar (always visible) ----
    const toolbar = document.createElement("div");
    toolbar.className = "table-toolbar";
    const sep = () => {
      const s = document.createElement("span");
      s.className = "toolbar-sep";
      return s;
    };
    const mkBtn = (label, onClick, opts2 = {}) => {
      const b = button(label, onClick);
      if (opts2.disabled) b.disabled = true;
      if (opts2.title) b.title = opts2.title;
      return b;
    };
    toolbar.append(
      mkBtn("↑ 插行", () => { const [r1, r2] = selRows(); insertRows(r1, r2 - r1 + 1); }, { title: "在选区上方插入行" }),
      mkBtn("↓ 插行", () => { const [r1, r2] = selRows(); insertRows(r2 + 1, r2 - r1 + 1); }, { title: "在选区下方插入行" }),
      mkBtn("← 插列", () => { const [c1, c2] = selCols(); insertCols(c1, c2 - c1 + 1); }, { title: "在选区左侧插入列" }),
      mkBtn("→ 插列", () => { const [c1, c2] = selCols(); insertCols(c2 + 1, c2 - c1 + 1); }, { title: "在选区右侧插入列" }),
      sep(),
      mkBtn("删除行", () => { const [r1, r2] = selRows(); deleteRows(r1, r2); }, { title: "删除选区覆盖的所有行" }),
      mkBtn("删除列", () => { const [c1, c2] = selCols(); deleteCols(c1, c2); }, { title: "删除选区覆盖的所有列" })
    );
    if (extraToolbar) toolbar.append(sep(), ...extraToolbar(mkBtn, sep));
    root.appendChild(toolbar);

    // ---- Grid area (scrollable) ----
    const gridWrap = document.createElement("div");
    gridWrap.className = "excel-grid-scroll";
    const table = document.createElement("table");
    table.className = "data-table";
    // fixed layout: widths come entirely from colgroup (the row header stays 18px; header input content cannot widen a column)
    table.style.tableLayout = "fixed";
    // Table width = content width (never stretched to the container): spare space when
    // few columns, horizontal scroll when many (Excel style)
    table.style.width = "max-content";
    const colgroup = document.createElement("colgroup");
    // Row-header column (fixed narrow; must be first in colgroup or data-column percentages misalign and crush it)
    const headCol = document.createElement("col");
    headCol.style.width = "18px";
    colgroup.appendChild(headCol);
    const widths = colWidths ? colWidths() : null;
    for (let c = 0; c < cols; c++) {
      const col = document.createElement("col");
      // Excel-style fixed width (px): ratio × logical base, minimum 96px — many columns scroll instead of squeezing
      const w = widths ? Math.max(MIN_COL_W, widths[c] * COL_BASE_W) : MIN_COL_W;
      col.style.width = `${w.toFixed(0)}px`;
      col.style.minWidth = `${MIN_COL_W}px`;
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);

    // Column headers (Excel style: letters; click/drag to select columns)
    const thead = document.createElement("thead");
    const headTr = document.createElement("tr");
    const corner = document.createElement("th");
    corner.className = "head-corner";
    headTr.appendChild(corner);
    for (let c = 0; c < cols; c++) {
      const th = document.createElement("th");
      th.className = "col-head";
      th.dataset.cc = String(c);
      const content = colHeadContent ? colHeadContent(c) : null;
      th.append(content ?? colLetter(c));
      headTr.appendChild(th);
    }
    thead.appendChild(headTr);
    table.appendChild(thead);

    // Body (row headers + cells)
    const tbody = document.createElement("tbody");
    for (let r = 0; r < rows; r++) {
      const tr = document.createElement("tr");
      const rh = rowHeight(r);
      if (rh) tr.style.height = `${rh}px`;
      const th0 = document.createElement("td");
      th0.className = "row-head";
      th0.dataset.rr = String(r);
      th0.textContent = String(r + 1);
      tr.appendChild(th0);

      for (let c = 0; c < cols; c++) {
        const td = document.createElement("td");
        td.className = "grid-cell";
        td.dataset.tr = String(r);
        td.dataset.tc = String(c);
        const css = cellCss(r, c);
        if (css) td.style.cssText = css;
        td.title = cellTitle(r, c);
        const rs = rowSpan(r, c);
        const cs = colSpan(r, c);
        if (covered(r, c)) {
          td.classList.add("cell-covered");
          tr.appendChild(td);
          continue;
        }
        if (rs > 1) td.rowSpan = rs;
        if (cs > 1) td.colSpan = cs;
        // Shared cell input: focus-select + Enter moves to the cell below
        const input = buildCellInput(cellValue(r, c), cellPlaceholder(r, c), () => onCellChange(r, c, input.value));
        const icss = inputCss(r, c);
        if (icss) input.style.cssText = icss;
        td.appendChild(input);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    gridWrap.appendChild(table);
    root.appendChild(gridWrap);

    // ---- Selection highlight + dragging (same semantics as the table editor: single-cell outline / region shading; headers light up only for regions) ----
    const selRange = () => (isRegion() ? sel : { r1: sel.r, c1: sel.c, r2: sel.r, c2: sel.c });
    const paint = () => {
      const single = !isRegion();
      const s = selRange();
      for (const td of gridWrap.querySelectorAll("td.grid-cell")) {
        const r = Number(td.dataset.tr);
        const c = Number(td.dataset.tc);
        td.classList.toggle("cell-selected", single && sel.r === r && sel.c === c);
        td.classList.toggle("cell-region", !single && r >= s.r1 && r <= s.r2 && c >= s.c1 && c <= s.c2);
      }
      for (const td of gridWrap.querySelectorAll("td.row-head")) {
        const r = Number(td.dataset.rr);
        td.classList.toggle("head-active", !single && r >= s.r1 && r <= s.r2);
      }
      for (const th of gridWrap.querySelectorAll("th.col-head")) {
        const c = Number(th.dataset.cc);
        th.classList.toggle("head-active", !single && c >= s.c1 && c <= s.c2);
      }
    };
    bindExcelDragSelect(gridWrap, {
      getRows,
      getCols,
      cellOf: (t) => {
        const td = t?.closest?.("td.grid-cell:not(.cell-covered)");
        return td ? { r: Number(td.dataset.tr), c: Number(td.dataset.tc) } : null;
      },
      colOf: (t) => {
        const th = t?.closest?.("th.col-head");
        return th ? Number(th.dataset.cc) : null;
      },
      rowOf: (t) => {
        const td = t?.closest?.("td.row-head");
        return td ? Number(td.dataset.rr) : null;
      },
      onSelect: (next, kind) => {
        if (kind === "end") {
          if (onSelect) onSelect(null, "end");
          if (isRegion()) render(); // region complete: rebuild (button state "merge N×M" / delete row-col enabled)
          return;
        }
        sel = next;
        paint();
        if (onSelect) onSelect(next, kind);
      },
    });
    paint();
    if (afterRender) afterRender();
  }

  return {
    root,
    render,
    getSel: () => sel,
    setSel: (s) => { sel = s; },
    isRegion,
    regionRows,
    regionCols,
    selRows,
    selCols,
  };
}
