// ============================================================================
// interaction/drag-select.js — Excel 式拖拽选区（表格编辑器/图表编辑器共用）
// ----------------------------------------------------------------------------
// 三种模式：列头整列 / 行头整行 / 单元格区域。pointerdown 记录锚点，
// pointermove 用 elementFromPoint 追踪（不重建 DOM，回调里只切高亮 class），
// 可选边缘自动滚动（Excel 式：贴容器边缘持续滚动并扩展选区）。
// 选区形态（与表格编辑器一致）：1×1 单元格 → {r, c}；其余 → {r1,c1,r2,c2}。
// 消费方通过 onSelect(sel, kind) 接收：kind = "cell"|"row"|"col"（拖拽中）
// 或 "end"（拖拽结束，sel 为 null——消费方可在此重建按钮态等）。
// ============================================================================

/** 选区形态：1×1 → {r, c}（单格），否则区域 {r1,c1,r2,c2}。 */
function asSel(a, b) {
  if (a.r === b.r && a.c === b.c) return { r: a.r, c: a.c };
  return {
    r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c),
    r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c),
  };
}

/**
 * @param {HTMLElement} gridWrap 网格容器（监听 pointerdown/move/up 于此）
 * @param {object} opts
 *  - getRows(): 行数
 *  - getCols(): 列数
 *  - cellOf(elAt): 命中单元格 → {r, c} | null（表格排除 covered 格）
 *  - colOf(elAt): 命中列头 → 列号 | null
 *  - rowOf(elAt): 命中行头 → 行号 | null
 *  - onSelect(sel, kind): 选区变化回调（sel = {r1,c1,r2,c2}；kind 见上）
 *  - edgeScroll: 是否边缘自动滚动（默认 true）
 */
export function bindExcelDragSelect(gridWrap, opts) {
  const { getRows, getCols, cellOf, colOf, rowOf, onSelect, edgeScroll = true } = opts;
  let dragSel = null;
  let dragScrollRaf = 0;

  /** 按当前坐标更新选区（三种模式共用；clamp 到网格范围）。 */
  const updateDragSel = (clientX, clientY) => {
    if (!dragSel) return;
    const elAt = document.elementFromPoint(clientX, clientY);
    const rows = getRows();
    const cols = getCols();
    if (dragSel.mode === "col") {
      const c = colOf(elAt);
      if (c == null) return;
      const cc = Math.min(cols - 1, Math.max(0, c));
      if (cc === dragSel.cur.c) return;
      dragSel.cur.c = cc;
      onSelect({ r1: 0, c1: Math.min(dragSel.anchor.c, cc), r2: rows - 1, c2: Math.max(dragSel.anchor.c, cc) }, "col");
    } else if (dragSel.mode === "row") {
      const r = rowOf(elAt);
      if (r == null) return;
      const rr = Math.min(rows - 1, Math.max(0, r));
      if (rr === dragSel.cur.r) return;
      dragSel.cur.r = rr;
      onSelect({ r1: Math.min(dragSel.anchor.r, rr), c1: 0, r2: Math.max(dragSel.anchor.r, rr), c2: cols - 1 }, "row");
    } else {
      const cell = cellOf(elAt);
      if (!cell) return;
      if (cell.r === dragSel.cur.r && cell.c === dragSel.cur.c) return;
      dragSel.cur = { r: cell.r, c: cell.c };
      onSelect(asSel(dragSel.anchor, dragSel.cur), "cell");
    }
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
    const c = colOf(e.target);
    if (c != null) {
      e.preventDefault();
      dragSel = { mode: "col", anchor: { r: 0, c }, cur: { r: 0, c } };
      onSelect({ r1: 0, c1: c, r2: 0, c2: c }, "col"); // 行区间后续按行数扩展
      return;
    }
    // 行头 → 整行模式
    const r = rowOf(e.target);
    if (r != null) {
      e.preventDefault();
      dragSel = { mode: "row", anchor: { r, c: 0 }, cur: { r, c: 0 } };
      onSelect({ r1: r, c1: 0, r2: r, c2: getCols() - 1 }, "row");
      return;
    }
    // 单元格 → 区域模式
    const cell = cellOf(e.target);
    if (!cell) return;
    const inp = e.target.closest("input");
    if (inp && document.activeElement === inp) return; // 编辑态：允许 input 内文本操作
    e.preventDefault();
    dragSel = { mode: "cell", anchor: cell, cur: cell };
    onSelect(asSel(cell, cell), "cell");
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
    onSelect(null, "end");
  };
  gridWrap.addEventListener("pointerup", endDrag);
  gridWrap.addEventListener("pointercancel", endDrag);
  window.addEventListener("blur", endDrag);

  // 双击进入编辑（pointerdown 已阻止单击聚焦）
  gridWrap.addEventListener("dblclick", (e) => {
    const cell = cellOf(e.target);
    const inp = cell ? gridWrap.querySelector(`td[data-tr="${cell.r}"][data-tc="${cell.c}"] input`) : null;
    if (inp) inp.focus();
  });
}
