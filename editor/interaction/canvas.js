// ============================================================================
// interaction/canvas.js — element gesture executor (selection box / drag / resize / rotate / marquee / keyboard nudge)
// ----------------------------------------------------------------------------
// Gesture classification and arbitration live in interaction/stage.js (the single
// router); this module only *executes* element gestures: the router decides the
// target and calls startGesture / startMarquee, after which this module listens
// for pointermove/up itself.
//
// Selection model:
//   - A selection is a set (state.selection). The selection box renders in two forms:
//       single = .el-single 1px solid ring + four .h square corner handles + .rot handle
//       multi/group = a thin .member border per member + one dashed .mbounds box + corner handles
//   - Marquee (drag on blank canvas) → dashed .marquee box; on release Shift adds / Ctrl toggles.
//   - Ctrl/Alt + drag = duplicate drag (threshold: a drag duplicates, no drag = Ctrl-click toggles).
//   - Group elements (elementType:"group") transform as a whole: move/resize apply to children.
//   - Geometry goes through coords.js overlayGeom (model coords → wrap layer); controls
//     keep a constant on-screen size.
// ============================================================================

import { overlayGeom, layoutElementOf } from "../coords.js";
import { ICON_ROTATE } from "../icons.js";
import { snapMove, snapResize, SNAP_SCREEN_PX } from "./align-guides.js";

const CORNERS = ["nw", "ne", "sw", "se"];
const CORNER_CURSOR = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize" };
const CORNER_CLASS = { nw: "tl", ne: "tr", sw: "bl", se: "br" };
const GRID = 10; // grid snap step (Shift+arrow)
const MOVE_THRESHOLD = 3; // px threshold to start a gesture; below it counts as a click

export function createCanvasController(canvas, opts) {
  const {
    getPage,
    beginChange,       // () => void  snapshot before a change
    endChange,         // () => void  end a change (re-render + property panel refresh)
    getSelected,       // () => id|null  primary selection (compat)
    getSelectedElements, // () => element[]  all selected elements
    getSelection,      // () => id[]
    select,            // (id, mode) => void
    selectMany,        // (ids, mode) => void
    duplicateInPlace,  // () => void  duplicate selection in place (for duplicate drag)
    deleteSelected,    // keyboard Delete/Backspace
    moveLayerEdge,     // (edge) => void  bring to front / send to back (keyboard ] / [)
  } = opts;

  const wrapLayer = canvas.parentElement; // canvas-wrap: the non-scaled layer
  let overlay = null;   // .sel-overlay (selection box / member borders / marquee hit highlight)
  let box = null;       // .sel-box (single box or multi/group bounds; handles hang off it)
  let memberNodes = []; // [{ el, node }] multi-selection member thin borders
  let sizeBadge = null;
  let marqueeEl = null; // .marquee dashed box
  let marquee = null;   // marquee state
  let drag = null;
  let guidesEl = null;  // .align-guides smart-guide layer (lazy; lives in wrapLayer, spans the canvas)
  const ac = new AbortController(); // lifecycle: document keyboard listener detached via this

  const scale = () => canvas._scale || 1;
  const elements = () => getPage().elements || [];
  const findElement = (id) => elements().find((el) => el.elementId === id);
  const nodeBy = (id) => canvas.querySelector(`[data-element-id="${CSS.escape(id)}"]`);

  /** Selection → affected elements (groups expand to children) + members needing a thin border. */
  function selectionUnits() {
    const picked = getSelectedElements ? getSelectedElements() : [];
    const affected = [];
    const members = [];
    for (const el of picked) {
      affected.push(el);
      if (el.elementType === "group" && Array.isArray(el.children)) {
        for (const cid of el.children) {
          const c = findElement(cid);
          if (c) {
            affected.push(c);
            members.push(c);
          }
        }
      } else {
        members.push(el);
      }
    }
    return { picked, affected, members };
  }

  /**
   * Visual geometry [x,y,w,h] (model coords) — the single source for selection
   * box / member borders / marquee hit tests. Reads the LayoutTree: text uses
   * **declared** (the author box the visible content is anchored to; frame.h is
   * the grown height and would leave the box taller than the text), while
   * non-text elements such as tables use frame (the grown height, so the
   * selection box hugs a table that grew). Falls back to el.bounds when the
   * layout tree has no entry (e.g. a group shell, or the model has not re-rendered).
   *
   * While a drag/resize/rotate gesture is in progress the affected elements read
   * the **live model bounds** instead: the gesture writes el.bounds per frame while
   * the layout tree only recomputes on repaint — using it would leave the overlay
   * one gesture behind. For move/rotate the layout's grown-height delta is carried
   * over (the content does not change mid-gesture); for resize the declared box is
   * correct mid-gesture and the repaint re-syncs on pointer-up.
   */
  function geomOf(el) {
    if (drag) {
      const hit = drag.affected.find((a) => a.el === el);
      if (hit) {
        const b = el.bounds || [0, 0, 0, 0];
        if (el.elementType === "text" || (drag.mode !== "move" && drag.mode !== "rotate")) return b;
        const le = layoutElementOf(el.elementId);
        const growth = le ? Math.max(0, le.frame.h - le.declared.h) : 0;
        return [b[0], b[1], b[2], b[3] + growth];
      }
    }
    const le = layoutElementOf(el.elementId);
    if (!le) return el.bounds || [0, 0, 0, 0];
    const b = el.elementType === "text" ? le.declared : le.frame;
    return [b.x, b.y, b.w, b.h];
  }

  const unionOf = (els) => {
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const el of els) {
      const b = geomOf(el);
      x1 = Math.min(x1, b[0]);
      y1 = Math.min(y1, b[1]);
      x2 = Math.max(x2, b[0] + b[2]);
      y2 = Math.max(y2, b[1] + b[3]);
    }
    return [x1, y1, x2 - x1, y2 - y1];
  };

  /** Selection-box geometry (model coords): single = element geom (text declared / others frame); multi/group = bounds. */
  function boxModelBounds() {
    const picked = getSelectedElements ? getSelectedElements() : [];
    if (picked.length === 0) return null;
    if (picked.length === 1 && picked[0].elementType !== "group") {
      return geomOf(picked[0]);
    }
    return unionOf(picked);
  }

  // --------------------------------------------------------------------------
  // Selection box
  // --------------------------------------------------------------------------
  function refreshSelection() {
    if (overlay) overlay.remove();
    overlay = null;
    box = null;
    memberNodes = [];
    sizeBadge = null;
    const { picked, members } = selectionUnits();
    if (picked.length === 0) return;

    overlay = document.createElement("div");
    overlay.className = "sel-overlay";
    const isSingle = picked.length === 1 && picked[0].elementType !== "group";

    // Multi/group: thin member borders (not drawn for single, to avoid overlapping the solid ring)
    if (!isSingle) {
      for (const el of members) {
        const m = document.createElement("div");
        m.className = "member";
        overlay.appendChild(m);
        memberNodes.push({ el, node: m });
      }
    }

    box = document.createElement("div");
    box.className = "sel-box " + (isSingle ? "el-single" : "mbounds");

    // Four corner handles (square, 1px accent outline; data-handle routed by stage.js)
    for (const dir of CORNERS) {
      const h = document.createElement("div");
      h.dataset.handle = dir;
      h.className = "h " + CORNER_CLASS[dir];
      h.style.cursor = CORNER_CURSOR[dir];
      h.title = "拖动调整大小（Alt 等比）";
      box.appendChild(h);
    }

    // Rotate handle: single selection only (chart/table cannot rotate); placed at
    // the box's bottom center (the top is left to the quickbar)
    if (isSingle && !["chart", "table"].includes(picked[0].elementType)) {
      const stem = document.createElement("div");
      stem.className = "sel-rotate-stem";
      const rot = document.createElement("div");
      rot.dataset.rotateHandle = "1";
      rot.className = "rot";
      rot.title = "拖动旋转（Shift 每 15° 吸附）";
      rot.innerHTML = `<span class="sel-rotate-ic">${ICON_ROTATE}</span>`;
      box.append(stem, rot);
    }

    sizeBadge = document.createElement("div");
    sizeBadge.className = "sel-size";
    box.appendChild(sizeBadge);

    overlay.appendChild(box);
    wrapLayer.appendChild(overlay);
    updateSelectionBox();
  }

  /** Sync selection box / member border geometry (called at high frequency while dragging; restyles, no DOM rebuild). */
  function updateSelectionBox() {
    if (!box) return;
    const picked = getSelectedElements ? getSelectedElements() : [];
    if (picked.length === 0) return;
    const mb = boxModelBounds();
    if (!mb) return;
    const g = overlayGeom(canvas, wrapLayer, mb);
    box.style.left = `${g.left}px`;
    box.style.top = `${g.top}px`;
    box.style.width = `${g.width}px`;
    box.style.height = `${g.height}px`;
    const single = picked.length === 1 && picked[0].elementType !== "group";
    box.style.transform = single && picked[0].rotation ? `rotate(${picked[0].rotation}deg)` : "";

    for (const { el, node } of memberNodes) {
      const mg = overlayGeom(canvas, wrapLayer, geomOf(el));
      node.style.left = `${mg.left}px`;
      node.style.top = `${mg.top}px`;
      node.style.width = `${mg.width}px`;
      node.style.height = `${mg.height}px`;
      node.style.transform = el.rotation ? `rotate(${el.rotation}deg)` : "";
    }
  }

  /** Show W×H (resize) or the angle (rotate) while a gesture is in progress. */
  function showBadge(text, rotation = 0) {
    if (!sizeBadge) return;
    sizeBadge.textContent = text;
    sizeBadge.style.transform = rotation ? `rotate(${-rotation}deg)` : "";
    overlay?.classList.add("resizing");
  }

  // --------------------------------------------------------------------------
  // Marquee selection: drag on blank canvas
  // --------------------------------------------------------------------------
  function startMarquee(e) {
    const cr = canvas.getBoundingClientRect();
    marquee = {
      cr,
      clientX: e.clientX,
      clientY: e.clientY,
      moved: false,
      additive: !!e.shiftKey,
      ctrl: !!(e.ctrlKey || e.metaKey),
    };
    window.addEventListener("pointermove", onMarqueeMove);
    window.addEventListener("pointerup", onMarqueeEnd);
    window.addEventListener("pointercancel", onMarqueeEnd);
  }

  /** Client coords → model coords (canvas scales about its center; rect already includes scale). */
  function toModel(clientX, clientY, cr, s) {
    return [(clientX - cr.left) / s, (clientY - cr.top) / s];
  }

  function marqueeModelRect(e) {
    const s = scale();
    const [ax, ay] = toModel(marquee.clientX, marquee.clientY, marquee.cr, s);
    const [bx, by] = toModel(e.clientX, e.clientY, marquee.cr, s);
    return [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)];
  }

  const hitTest = (rect) => {
    const [x, y, w, h] = rect;
    return elements()
      .filter((el) => el.elementType !== "group") // group members are hit via the group
      .filter((el) => {
        const b = geomOf(el);
        return b[0] < x + w && b[0] + b[2] > x && b[1] < y + h && b[1] + b[3] > y;
      })
      .map((el) => el.elementId);
  };

  function drawMarquee(rect, hitIds) {
    if (!marqueeEl) {
      marqueeEl = document.createElement("div");
      marqueeEl.className = "marquee";
      wrapLayer.appendChild(marqueeEl);
    }
    const g = overlayGeom(canvas, wrapLayer, rect);
    marqueeEl.style.left = `${g.left}px`;
    marqueeEl.style.top = `${g.top}px`;
    marqueeEl.style.width = `${g.width}px`;
    marqueeEl.style.height = `${g.height}px`;
    // Hit highlight: temporary member thin borders (take over the overlay, clearing the existing selection box)
    if (overlay) overlay.remove();
    overlay = document.createElement("div");
    overlay.className = "sel-overlay";
    box = null;
    memberNodes = [];
    sizeBadge = null;
    for (const id of hitIds) {
      const el = findElement(id);
      if (!el) continue;
      const m = document.createElement("div");
      m.className = "member";
      const mg = overlayGeom(canvas, wrapLayer, geomOf(el));
      m.style.left = `${mg.left}px`;
      m.style.top = `${mg.top}px`;
      m.style.width = `${mg.width}px`;
      m.style.height = `${mg.height}px`;
      overlay.appendChild(m);
    }
    wrapLayer.appendChild(overlay);
  }

  function onMarqueeMove(e) {
    if (!marquee) return;
    if (!marquee.moved && Math.hypot(e.clientX - marquee.clientX, e.clientY - marquee.clientY) > 4) {
      marquee.moved = true;
    }
    if (!marquee.moved) return;
    const rect = marqueeModelRect(e);
    drawMarquee(rect, hitTest(rect));
  }

  function clearMarqueeVisual() {
    marqueeEl?.remove();
    marqueeEl = null;
    overlay?.remove();
    overlay = null;
    box = null;
    memberNodes = [];
  }

  function onMarqueeEnd(e) {
    if (!marquee) return;
    const m = marquee;
    const rect = m.moved ? marqueeModelRect(e) : null;
    marquee = null;
    window.removeEventListener("pointermove", onMarqueeMove);
    window.removeEventListener("pointerup", onMarqueeEnd);
    window.removeEventListener("pointercancel", onMarqueeEnd);
    const ids = rect ? hitTest(rect) : [];
    clearMarqueeVisual();
    if (m.moved) {
      if (m.ctrl) selectMany(ids, "toggle");
      else if (m.additive) selectMany(ids, "add");
      else selectMany(ids, "replace");
    } else if (!m.additive && !m.ctrl) {
      select(null, "replace"); // single click on blank = deselect
    }
    refreshSelection();
  }

  function cancelMarquee() {
    if (!marquee) return;
    marquee = null;
    window.removeEventListener("pointermove", onMarqueeMove);
    window.removeEventListener("pointerup", onMarqueeEnd);
    window.removeEventListener("pointercancel", onMarqueeEnd);
    clearMarqueeVisual();
  }

  // --------------------------------------------------------------------------
  // Drag / resize / rotate (routed in from interaction/stage.js)
  //   mode = "move" | "rotate" | "nw"|"ne"|"sw"|"se"
  //   gopts = { copyOnMove, toggleOnTap }
  // --------------------------------------------------------------------------
  function startGesture(e, mode, id, gopts = {}) {
    const { affected } = selectionUnits();
    const box0 = boxModelBounds();
    if (affected.length === 0 || !box0) return;
    const start = {
      mode,
      id,
      clientX: e.clientX,
      clientY: e.clientY,
      box0,
      affected: affected.map((el) => ({ el, x: el.bounds[0], y: el.bounds[1], w: el.bounds[2], h: el.bounds[3] })),
      changed: false, // snapshot only on the first real movement (a pure select-click is not dirty and enters no history)
      copyOnMove: !!gopts.copyOnMove,
      toggleOnTap: !!gopts.toggleOnTap,
    };
    if (mode === "rotate") {
      const cx = box0[0] + box0[2] / 2;
      const cy = box0[1] + box0[3] / 2;
      const rect = canvas.getBoundingClientRect();
      const s = scale();
      start.cx = cx;
      start.cy = cy;
      start.startRot = affected[0].rotation || 0;
      start.startAngle = Math.atan2(e.clientY - rect.top - cy * s, e.clientX - rect.left - cx * s);
    }
    drag = start;
    // Smart guides need alignment targets for position gestures (rotate snaps by angle, not position);
    // start.affected is the mapped [{el, x, y, w, h}] list
    if (mode !== "rotate") start.snapCtx = snapContext(start.affected);
    try {
      e.target.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignored for elements that do not support it (SVG/ECharts) */
    }
    // Auto-height table (no rowHeights) resized vertically → write equal row-height
    // ratios, converting it to a controlled minimum row height
    if (
      mode !== "move" && mode !== "rotate" &&
      affected.length === 1 && affected[0].elementType === "table" && !Array.isArray(affected[0].rowHeights)
    ) {
      beginChange();
      drag.changed = true;
      const n = Math.max(1, Array.isArray(affected[0].rows) ? affected[0].rows.length : 1);
      affected[0].rowHeights = Array.from({ length: n }, () => 1 / n);
    }
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragEnd);
    window.addEventListener("pointercancel", onDragEnd);
    window.addEventListener("blur", onDragEnd);
  }

  /** Duplicate drag: copy the selection in place (offset 0), switch selection to the copy, and re-base the drag. */
  function retargetToCopy() {
    duplicateInPlace && duplicateInPlace();
    const { affected } = selectionUnits();
    const box0 = boxModelBounds();
    if (!box0) return;
    drag.box0 = box0;
    drag.affected = affected.map((el) => ({ el, x: el.bounds[0], y: el.bounds[1], w: el.bounds[2], h: el.bounds[3] }));
  }

  function updateNodeGeom(el) {
    const node = nodeBy(el.elementId);
    if (!node) return; // group elements have no standalone node
    node.style.left = `${el.bounds[0]}px`;
    node.style.top = `${el.bounds[1]}px`;
    node.style.width = `${el.bounds[2]}px`;
    node.style.height = `${el.bounds[3]}px`;
    syncSvgSize(node, el.bounds);
  }

  // --------------------------------------------------------------------------
  // Smart alignment guides (PowerPoint-style red lines): a layer over the canvas
  // in the un-scaled wrap, so a guide is always 1 screen px at any zoom
  // --------------------------------------------------------------------------
  function guidesLayer() {
    if (!guidesEl) {
      guidesEl = document.createElement("div");
      guidesEl.className = "align-guides";
      wrapLayer.appendChild(guidesEl);
    }
    return guidesEl;
  }

  function renderGuides(guides) {
    const layer = guidesLayer();
    layer.textContent = "";
    if (!guides.length) {
      layer.classList.remove("show");
      return;
    }
    const s = scale();
    const cr = canvas.getBoundingClientRect();
    const wr = wrapLayer.getBoundingClientRect();
    layer.style.left = `${cr.left - wr.left}px`;
    layer.style.top = `${cr.top - wr.top}px`;
    layer.style.width = `${cr.width}px`;
    layer.style.height = `${cr.height}px`;
    for (const g of guides) {
      const line = document.createElement("div");
      line.className = `align-guide ${g.axis === "x" ? "ag-v" : "ag-h"}`;
      if (g.axis === "x") line.style.left = `${g.pos * s - 0.5}px`;
      else line.style.top = `${g.pos * s - 0.5}px`;
      layer.appendChild(line);
    }
    layer.classList.add("show");
  }

  function clearGuides() {
    if (!guidesEl) return;
    guidesEl.textContent = "";
    guidesEl.classList.remove("show");
  }

  /** Alignment context for a drag: every non-affected element's box + the page size (deck px). */
  function snapContext(affected) {
    const skip = new Set(affected.map((a) => a.el.elementId));
    return {
      others: elements()
        .filter((el) => !skip.has(el.elementId) && Array.isArray(el.bounds))
        .map((el) => ({ x: el.bounds[0], y: el.bounds[1], w: el.bounds[2], h: el.bounds[3] })),
      page: { w: canvas.offsetWidth, h: canvas.offsetHeight },
    };
  }

  function onDragMove(e) {
    if (!drag) return;
    const s = scale();
    if (!drag.changed) {
      if (Math.hypot(e.clientX - drag.clientX, e.clientY - drag.clientY) < MOVE_THRESHOLD) return;
      drag.changed = true;
      beginChange(); // snapshot before the first real movement (orig captured, model unchanged)
      if (drag.copyOnMove) {
        retargetToCopy(); // Ctrl/Alt duplicate drag: once the copy is placed, keep dragging from the pointer
        drag.clientX = e.clientX;
        drag.clientY = e.clientY;
      }
    }
    const rawDx = (e.clientX - drag.clientX) / s;
    const rawDy = (e.clientY - drag.clientY) / s;

    if (drag.mode === "rotate") {
      const rect = canvas.getBoundingClientRect();
      const a = Math.atan2(e.clientY - rect.top - drag.cy * s, e.clientX - rect.left - drag.cx * s);
      const step = e.shiftKey ? 15 : 1;
      let deg = drag.startRot + Math.round((((a - drag.startAngle) * 180) / Math.PI) / step) * step;
      deg = ((deg % 360) + 360) % 360;
      for (const a2 of drag.affected) a2.el.rotation = deg;
      const node = nodeBy(drag.affected[0].el.elementId);
      if (node) node.style.transform = `rotate(${deg}deg)`;
      updateSelectionBox();
      showBadge(`${deg}°`, deg);
      return;
    }

    if (drag.mode === "move") {
      // Smart guides: probe the selection box at the raw position, snap to the nearest target
      let dx = rawDx;
      let dy = rawDy;
      if (drag.snapCtx) {
        const probe = { x: drag.box0[0] + dx, y: drag.box0[1] + dy, w: drag.box0[2], h: drag.box0[3] };
        // An axis without real movement stays passive: no snap, no guide (a zero-delta
        // coincidence like a shared left margin would otherwise draw a line on every drag)
        const axes = { x: Math.abs(rawDx) >= 1, y: Math.abs(rawDy) >= 1 };
        const snap = snapMove(probe, drag.snapCtx.others, drag.snapCtx.page, SNAP_SCREEN_PX / s, axes);
        dx += snap.dx;
        dy += snap.dy;
        renderGuides(snap.guides);
      }
      for (const a of drag.affected) {
        a.el.bounds[0] = Math.round(a.x + dx);
        a.el.bounds[1] = Math.round(a.y + dy);
        updateNodeGeom(a.el);
      }
      updateSelectionBox();
      return;
    }

    // Resize: relative to the selection bounding box, applied proportionally to each affected element
    const box0 = drag.box0;
    const m = drag.mode;
    let dx = rawDx;
    let dy = rawDy;
    let nx = box0[0];
    let ny = box0[1];
    let nw = box0[2];
    let nh = box0[3];
    if (m.includes("e")) nw = Math.max(8, Math.round(box0[2] + dx));
    if (m.includes("s")) nh = Math.max(8, Math.round(box0[3] + dy));
    if (m.includes("w")) {
      nw = Math.max(8, Math.round(box0[2] - dx));
      nx = box0[0] + box0[2] - nw;
    }
    if (m.includes("n")) {
      nh = Math.max(8, Math.round(box0[3] - dy));
      ny = box0[1] + box0[3] - nh;
    }
    // Alt + corner handle: uniform scale (based on width)
    if (e.altKey && CORNERS.includes(m) && box0[2] > 0 && box0[3] > 0) {
      nh = Math.max(8, Math.round(nw * (box0[3] / box0[2])));
      if (m.includes("n")) ny = box0[1] + box0[3] - nh;
    }
    // Smart guides: only the moving edges snap (east/west, south/north)
    if (drag.snapCtx) {
      const edges = {
        x: m.includes("e") ? "e" : m.includes("w") ? "w" : null,
        y: m.includes("s") ? "s" : m.includes("n") ? "n" : null,
      };
      const snap = snapResize({ x: nx, y: ny, w: nw, h: nh }, edges, drag.snapCtx.others, drag.snapCtx.page, SNAP_SCREEN_PX / s);
      if (edges.x === "e") nw = Math.max(8, nw + snap.dx);
      else if (edges.x === "w") { nx += snap.dx; nw = Math.max(8, nw - snap.dx); }
      if (edges.y === "s") nh = Math.max(8, nh + snap.dy);
      else if (edges.y === "n") { ny += snap.dy; nh = Math.max(8, nh - snap.dy); }
      renderGuides(snap.guides);
    }
    const sx = box0[2] ? nw / box0[2] : 1;
    const sy = box0[3] ? nh / box0[3] : 1;
    for (const a of drag.affected) {
      a.el.bounds[0] = Math.round(nx + (a.x - box0[0]) * sx);
      a.el.bounds[1] = Math.round(ny + (a.y - box0[1]) * sy);
      a.el.bounds[2] = Math.max(4, Math.round(a.w * sx));
      a.el.bounds[3] = Math.max(4, Math.round(a.h * sy));
      updateNodeGeom(a.el);
    }
    updateSelectionBox();
    const single = drag.affected.length === 1 ? drag.affected[0].el.rotation || 0 : 0;
    showBadge(`${nw} × ${nh}`, single);
  }

  /** Keep SVG shapes proportionally scaled while dragging (viewBox fixed, width/height change). */
  function syncSvgSize(node, bounds) {
    const svg = node.tagName === "svg" ? node : node.querySelector("svg");
    if (svg) {
      svg.setAttribute("width", bounds[2]);
      svg.setAttribute("height", bounds[3]);
    }
  }

  function onDragEnd() {
    if (!drag) return;
    const d = drag;
    drag = null;
    clearGuides();
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    window.removeEventListener("pointercancel", onDragEnd);
    window.removeEventListener("blur", onDragEnd);
    overlay?.classList.remove("resizing");
    // Ctrl-click on an already-selected element (no drag): toggle to deselect
    if (d.toggleOnTap && !d.changed && select) {
      select(d.id, "toggle");
      return;
    }
    if (d.changed) endChange(); // full re-render to calibrate (SVG geometry / chart redraw)
  }

  // --------------------------------------------------------------------------
  // Keyboard: Delete to delete / Esc to unwind layers / arrow-key nudge (1px / Alt 10px / Shift grid snap)
  // --------------------------------------------------------------------------
  document.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;

    // Esc unwinds layers: marquee → multi-selection (collapse to primary) → deselect
    if (e.key === "Escape") {
      if (marquee) {
        cancelMarquee();
        refreshSelection();
        e.preventDefault();
        return;
      }
      const sel = getSelection ? getSelection() : [];
      if (sel.length > 1) {
        select(sel[sel.length - 1], "replace");
        e.preventDefault();
      } else if (sel.length === 1) {
        select(null, "replace");
        e.preventDefault();
      }
      return;
    }

    const picked = getSelectedElements ? getSelectedElements() : [];
    if (picked.length === 0) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSelected && deleteSelected();
      return;
    }
    // ] bring to front / [ send to back
    if (e.key === "]" || e.key === "[") {
      e.preventDefault();
      moveLayerEdge?.(e.key === "]" ? "front" : "back");
      return;
    }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const step = arrows[e.key];
    if (!step) return;
    e.preventDefault();
    const base = e.altKey ? 10 : 1; // Alt = 10px coarse nudge
    let dx = step[0] * base;
    let dy = step[1] * base;
    if (e.shiftKey) {
      // Shift = grid snap: snap the primary element onto the 10px grid, others follow by the same delta
      const primary = picked[0];
      const tx = Math.round((primary.bounds[0] + dx) / GRID) * GRID;
      const ty = Math.round((primary.bounds[1] + dy) / GRID) * GRID;
      dx = tx - primary.bounds[0];
      dy = ty - primary.bounds[1];
    }
    beginChange();
    const { affected } = selectionUnits();
    for (const el of affected) {
      el.bounds[0] += dx;
      el.bounds[1] += dy;
      updateNodeGeom(el);
    }
    updateSelectionBox();
    endChange();
  }, { signal: ac.signal });

  /** Release (idempotent): detach the document keyboard listener, end in-flight gestures, remove overlay and marquee. */
  function destroy() {
    ac.abort();
    cancelMarquee();
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    window.removeEventListener("pointercancel", onDragEnd);
    window.removeEventListener("blur", onDragEnd);
    drag = null;
    overlay?.remove();
    overlay = null;
    box = null;
    sizeBadge = null;
    memberNodes = [];
  }

  return {
    refreshSelection,
    setScale(s) {
      canvas._scale = s;
    },
    startGesture,
    startMarquee,
    cancelMarquee,
    // Called by the router when pinch takes over: equivalent to a normal release
    // (commits the movement so far and re-renders)
    cancelGesture: onDragEnd,
    isGestureActive: () => !!drag,
    destroy,
  };
}
