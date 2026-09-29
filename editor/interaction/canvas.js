// ============================================================================
// interaction/canvas.js — 元素手势执行器（选中框 / 拖动 / 缩放 / 旋转 / 框选 / 键盘微调）
// ----------------------------------------------------------------------------
// 手势的分类与仲裁在 interaction/stage.js（统一路由器），本模块只负责
// 「执行」元素手势：路由器判定目标后调用 startGesture / startMarquee，之后的
// pointermove/up 由这里自行监听。
//
// U1 选择模型：
//   - 选中可以是「集合」（state.selection）。选中框渲染分两种形态（对齐设计稿
//     editor-design-reference.html §02 样机）：
//       单选 = .el-single 1px 实线环 + 四角 .h 方形控制点 + .rot 旋转柄
//       多选/组 = 每个成员一圈 .member 细边框 + 一个 .mbounds 虚线包围盒 + 四角手柄
//   - 框选 marquee（画布空白拖动）→ .marquee 虚线框，松手按 Shift 加选 / Ctrl 切换。
//   - Ctrl/Alt + 拖动 = 复制拖动（阈值判断：拖动即复制，未拖动 = Ctrl 点击切换选中）。
//   - 组元素（elementType:"group"）整体变换：移动/缩放同时作用于 children。
//   - 几何统一走 coords.js 的 overlayGeom（模型坐标 → wrap 图层），控件恒定屏幕尺寸。
// ============================================================================

import { overlayGeom, layoutElementOf } from "../coords.js";
import { ICON_ROTATE } from "../icons.js";

const CORNERS = ["nw", "ne", "sw", "se"];
const CORNER_CURSOR = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize" };
const CORNER_CLASS = { nw: "tl", ne: "tr", sw: "bl", se: "br" };
const GRID = 10; // 网格吸附步长（Shift+方向键）
const MOVE_THRESHOLD = 3; // 起手势的位移阈值（px）：低于它视为点击

export function createCanvasController(canvas, opts) {
  const {
    getPage,
    beginChange,       // () => void  变更前快照
    endChange,         // () => void  变更结束（重渲染 + 属性面板刷新）
    getSelected,       // () => id|null  主选中（兼容）
    getSelectedElements, // () => element[]  全部选中元素
    getSelection,      // () => id[]
    select,            // (id, mode) => void
    selectMany,        // (ids, mode) => void
    duplicateInPlace,  // () => void  复制选中（原位，供拖动复制）
    deleteSelected,    // 键盘 Delete/Backspace
    moveLayerEdge,     // (edge) => void  置于顶层/底层（键盘 ] / [）
  } = opts;

  const wrapLayer = canvas.parentElement; // canvas-wrap：不缩放图层
  let overlay = null;   // .sel-overlay（选中框 / 成员边框 / marquee 命中高亮）
  let box = null;       // .sel-box（单选框 or 多选/组包围盒，手柄挂在它上面）
  let memberNodes = []; // [{ el, node }] 多选成员细边框
  let sizeBadge = null;
  let marqueeEl = null; // .marquee 虚线框
  let marquee = null;   // 框选状态
  let drag = null;
  const ac = new AbortController(); // 生命周期：document 键盘监听经此一次解绑

  const scale = () => canvas._scale || 1;
  const elements = () => getPage().elements || [];
  const findElement = (id) => elements().find((el) => el.elementId === id);
  const nodeBy = (id) => canvas.querySelector(`[data-element-id="${CSS.escape(id)}"]`);

  /** 选中项 → 受影响元素（组展开为 children）+ 需要画细边框的成员。 */
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
   * 元素视觉几何 [x,y,w,h]（模型坐标）——选中框/成员边框/框选命中的统一几何来源。
   * 读 LayoutTree（RP-C / M6）：文本取 **declared**（作者框，可见内容锚定处；frame.h
   * 是撑高值，用它会让空框高出文字）；表格等无文本语义元素取 frame（撑高后的实际高，
   * 表格长高后选中框随之贴合）。布局树无该元素（如 group 组壳、模型未重绘）回退 el.bounds。
   */
  function geomOf(el) {
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

  /** 选中框几何（模型坐标）：单选 = 元素几何（文本 declared / 其余 frame）；多选/组 = 包围盒。 */
  function boxModelBounds() {
    const picked = getSelectedElements ? getSelectedElements() : [];
    if (picked.length === 0) return null;
    if (picked.length === 1 && picked[0].elementType !== "group") {
      return geomOf(picked[0]);
    }
    return unionOf(picked);
  }

  // --------------------------------------------------------------------------
  // 选中框
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

    // 多选/组：成员细边框（单选不画，避免与实线环重叠）
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

    // 四角控制点（方形，1px 主色描边；data-handle 供 stage.js 路由）
    for (const dir of CORNERS) {
      const h = document.createElement("div");
      h.dataset.handle = dir;
      h.className = "h " + CORNER_CLASS[dir];
      h.style.cursor = CORNER_CURSOR[dir];
      h.title = "拖动调整大小（Alt 等比）";
      box.appendChild(h);
    }

    // 旋转柄：仅单选（chart/table 不支持旋转）；置于框底中点（顶部让给快速条）
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

  /** 同步选中框 / 成员边框几何（拖动中高频调用，只改样式不重建 DOM）。 */
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

  /** 手势进行中显示 W×H（缩放）或角度（旋转）。 */
  function showBadge(text, rotation = 0) {
    if (!sizeBadge) return;
    sizeBadge.textContent = text;
    sizeBadge.style.transform = rotation ? `rotate(${-rotation}deg)` : "";
    overlay?.classList.add("resizing");
  }

  // --------------------------------------------------------------------------
  // 框选（marquee）：画布空白拖动
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

  /** 客户区坐标 → 模型坐标（canvas 以中心为 origin 缩放，rect 已含缩放）。 */
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
      .filter((el) => el.elementType !== "group") // 组成员由组代替命中
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
    // 命中高亮：临时成员细边框（接管 overlay，清除原选中框）
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
      select(null, "replace"); // 空白单击 = 取消选中
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
  // 拖动 / 缩放 / 旋转（由 interaction/stage.js 路由进入）
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
      changed: false, // 首次真实位移才快照（纯点击选中不标脏、不入历史）
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
    try {
      e.target.setPointerCapture?.(e.pointerId);
    } catch {
      /* 部分元素（SVG/ECharts）不支持时忽略 */
    }
    // 自动行高的表格（无 rowHeights）纵向拖缩放 → 写入均分行高比例，转为受控最小行高
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

  /** 拖动复制：把当前选中复制到原位（偏移 0），选中切到副本，并重设拖动基线。 */
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
    if (!node) return; // 组元素无独立节点
    node.style.left = `${el.bounds[0]}px`;
    node.style.top = `${el.bounds[1]}px`;
    node.style.width = `${el.bounds[2]}px`;
    node.style.height = `${el.bounds[3]}px`;
    syncSvgSize(node, el.bounds);
  }

  function onDragMove(e) {
    if (!drag) return;
    const s = scale();
    if (!drag.changed) {
      if (Math.hypot(e.clientX - drag.clientX, e.clientY - drag.clientY) < MOVE_THRESHOLD) return;
      drag.changed = true;
      beginChange(); // 首次真实位移前快照（orig 已捕获，模型尚未改动）
      if (drag.copyOnMove) {
        retargetToCopy(); // Ctrl/Alt 拖动复制：副本就位后从当前指针继续拖动
        drag.clientX = e.clientX;
        drag.clientY = e.clientY;
      }
    }
    const dx = (e.clientX - drag.clientX) / s;
    const dy = (e.clientY - drag.clientY) / s;

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
      for (const a of drag.affected) {
        a.el.bounds[0] = Math.round(a.x + dx);
        a.el.bounds[1] = Math.round(a.y + dy);
        updateNodeGeom(a.el);
      }
      updateSelectionBox();
      return;
    }

    // 缩放：以选中包围盒为基准，整体按比例作用于每个受影响元素
    const box0 = drag.box0;
    const m = drag.mode;
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
    // Alt + 角柄：等比缩放（以宽度为基准）
    if (e.altKey && CORNERS.includes(m) && box0[2] > 0 && box0[3] > 0) {
      nh = Math.max(8, Math.round(nw * (box0[3] / box0[2])));
      if (m.includes("n")) ny = box0[1] + box0[3] - nh;
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

  /** 拖动中保持 SVG 图形按比例缩放（viewBox 不变，width/height 变化）。 */
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
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    window.removeEventListener("pointercancel", onDragEnd);
    window.removeEventListener("blur", onDragEnd);
    overlay?.classList.remove("resizing");
    // Ctrl 点击已选中元素（未拖动）：切换为取消选中
    if (d.toggleOnTap && !d.changed && select) {
      select(d.id, "toggle");
      return;
    }
    if (d.changed) endChange(); // 全量重渲染校准（SVG 几何 / 图表重绘）
  }

  // --------------------------------------------------------------------------
  // 键盘：Delete 删除 / Esc 分层退出 / 方向键微调（1px / Alt 10px / Shift 网格吸附）
  // --------------------------------------------------------------------------
  document.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;

    // Esc 分层退出：先退框选 → 再退多选（收敛为主选中）→ 再取消选中
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
    // ] 置于顶层 / [ 置于底层（设计稿 §03 键位提示；B6）
    if (e.key === "]" || e.key === "[") {
      e.preventDefault();
      moveLayerEdge?.(e.key === "]" ? "front" : "back");
      return;
    }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const step = arrows[e.key];
    if (!step) return;
    e.preventDefault();
    const base = e.altKey ? 10 : 1; // Alt = 10px 大步微调
    let dx = step[0] * base;
    let dy = step[1] * base;
    if (e.shiftKey) {
      // Shift = 网格吸附：把主选中元素吸附到 10px 网格，其余随同一增量
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

  /** 释放（幂等）：解绑 document 键盘、结束进行中的手势、摘掉选中框与 marquee。 */
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
    // 捏合接管时由路由器调用：与正常松手等价（提交已发生的位移并重渲染）
    cancelGesture: onDragEnd,
    isGestureActive: () => !!drag,
    destroy,
  };
}
