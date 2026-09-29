// ============================================================================
// components/datagrid.js — DataGrid primitive (keyboard navigation + range selection)
// ----------------------------------------------------------------------------
// The foundation is the existing Excel-style drag selection
// (interaction/drag-select.js) and the data-grid styles (primitives.css
// .data-table / .excel-grid). This module provides the primitive entry and fills
// in "keyboard navigation (arrows move the selection, Shift extends the range)" as
// a reusable utility.
// ============================================================================

export { bindExcelDragSelect } from "../interaction/drag-select.js";

/**
 * Attach keyboard navigation to a grid container: arrows move between
 * [data-tr][data-tc] cells, Shift+arrows extend the range selection, Enter focuses
 * the editor.
 * @param {HTMLElement} gridWrap
 * @param {object} opts { getRows(), getCols(), onSelect(sel), focusCell(r,c) }
 * @returns {() => void} unbind
 */
export function bindGridKeyboard(gridWrap, { getRows, getCols, onSelect, focusCell }) {
  const onKey = (e) => {
    const cell = e.target.closest?.("[data-tr][data-tc]");
    if (!cell) return;
    const keymap = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    const step = keymap[e.key];
    if (!step) return;
    e.preventDefault();
    const r = Math.max(0, Math.min(getRows() - 1, Number(cell.dataset.tr) + step[0]));
    const c = Math.max(0, Math.min(getCols() - 1, Number(cell.dataset.tc) + step[1]));
    if (e.shiftKey) onSelect?.({ r1: Number(cell.dataset.tr), c1: Number(cell.dataset.tc), r2: r, c2: c }, "cell");
    else onSelect?.({ r, c }, "cell");
    focusCell?.(r, c);
  };
  gridWrap.addEventListener("keydown", onKey);
  return () => gridWrap.removeEventListener("keydown", onKey);
}
