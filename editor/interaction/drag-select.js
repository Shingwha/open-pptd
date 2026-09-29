// ============================================================================
// interaction/drag-select.js — Excel-style drag selection (table/chart editors)
// ----------------------------------------------------------------------------
// Three modes: whole column (column header) / whole row (row header) / cell region.
// pointerdown records the anchor, pointermove tracks via elementFromPoint (no DOM
// rebuild, the callback only toggles highlight classes), and optional edge
// auto-scroll scrolls while the pointer hugs the container edge (Excel style).
// Selection shape (matches the table editor): 1×1 cell → {r, c}; otherwise
// → {r1,c1,r2,c2}. Consumers receive onSelect(sel, kind) where kind is
// "cell"|"row"|"col" during a drag or "end" at drag end (sel is null then, so the
// consumer can rebuild button state).
// ============================================================================

/** Selection shape: 1×1 → {r, c} (single cell), otherwise region {r1,c1,r2,c2}. */
function asSel(a, b) {
  if (a.r === b.r && a.c === b.c) return { r: a.r, c: a.c };
  return {
    r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c),
    r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c),
  };
}

/**
 * @param {HTMLElement} gridWrap grid container (listens for pointerdown/move/up here)
 * @param {object} opts
 *  - getRows(): row count
 *  - getCols(): column count
 *  - cellOf(elAt): hit cell → {r, c} | null (table excludes covered cells)
 *  - colOf(elAt): hit column header → column index | null
 *  - rowOf(elAt): hit row header → row index | null
 *  - onSelect(sel, kind): selection-change callback (sel = {r1,c1,r2,c2}; kind see above)
 *  - edgeScroll: edge auto-scroll (default true)
 */
export function bindExcelDragSelect(gridWrap, opts) {
  const { getRows, getCols, cellOf, colOf, rowOf, onSelect, edgeScroll = true } = opts;
  let dragSel = null;
  let dragScrollRaf = 0;

  /** Update the selection from the current point (shared by all three modes; clamped to the grid). */
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

  /** Edge auto-scroll (Excel style): while the pointer hugs the container edge, scroll and extend. */
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
    // Column header → whole-column mode
    const c = colOf(e.target);
    if (c != null) {
      e.preventDefault();
      dragSel = { mode: "col", anchor: { r: 0, c }, cur: { r: 0, c } };
      onSelect({ r1: 0, c1: c, r2: 0, c2: c }, "col"); // row range extends by row count later
      return;
    }
    // Row header → whole-row mode
    const r = rowOf(e.target);
    if (r != null) {
      e.preventDefault();
      dragSel = { mode: "row", anchor: { r, c: 0 }, cur: { r, c: 0 } };
      onSelect({ r1: r, c1: 0, r2: r, c2: getCols() - 1 }, "row");
      return;
    }
    // Cell → region mode
    const cell = cellOf(e.target);
    if (!cell) return;
    const inp = e.target.closest("input");
    if (inp && document.activeElement === inp) return; // editing: let the input handle text ops
    e.preventDefault();
    dragSel = { mode: "cell", anchor: cell, cur: cell };
    onSelect(asSel(cell, cell), "cell");
  });

  gridWrap.addEventListener("pointermove", (e) => {
    if (!dragSel) return;
    dragSel.mx = e.clientX;
    dragSel.my = e.clientY;
    updateDragSel(e.clientX, e.clientY);
    // Edge auto-scroll toggle
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

  // Double-click enters editing (pointerdown already blocked focus on single click)
  gridWrap.addEventListener("dblclick", (e) => {
    const cell = cellOf(e.target);
    const inp = cell ? gridWrap.querySelector(`td[data-tr="${cell.r}"][data-tc="${cell.c}"] input`) : null;
    if (inp) inp.focus();
  });
}
