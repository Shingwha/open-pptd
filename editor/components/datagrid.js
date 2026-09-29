// ============================================================================
// components/datagrid.js — DataGrid 原语（键盘导航 + 范围选择）
// ----------------------------------------------------------------------------
// 基础是既有 Excel 式拖拽选区（interaction/drag-select.js）与数据网格样式
// （primitives.css 的 .data-table / .excel-grid）。本模块给出原语入口，
// 并把「键盘导航（方向键移动选中、范围扩展）」补成通用工具。
// ============================================================================

export { bindExcelDragSelect } from "../interaction/drag-select.js";

/**
 * 给网格容器挂键盘导航：方向键在 [data-tr][data-tc] 单元格间移动，
 * Shift+方向键扩展范围选择，Enter 聚焦编辑。
 * @param {HTMLElement} gridWrap
 * @param {object} opts { getRows(), getCols(), onSelect(sel), focusCell(r,c) }
 * @returns {() => void} 解绑
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
