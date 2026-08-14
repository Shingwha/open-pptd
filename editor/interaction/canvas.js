// ============================================================================
// interaction/canvas.js — 元素手势执行器（选中框 / 拖动 / 缩放 / 旋转 / 键盘微调）
// ----------------------------------------------------------------------------
// 手势的分类与仲裁在 interaction/stage.js（统一路由器），本模块只负责
// 「执行」元素手势：路由器判定目标后调用 startGesture，之后的
// pointermove/up 由这里自行监听。
// 关键设计：
//   - 拖动期间直接改模型 + DOM，结束才全量重渲染（流畅 + 一致）。
//   - pointercancel / window blur 兜底结束拖拽（鼠标在窗口外释放）。
//   - cancelGesture 供路由器在捏合接管时调用（提交已发生的位移）。
// ============================================================================

export function createCanvasController(canvas, opts) {
  const {
    getPage,
    beginChange,     // () => void  变更前快照
    endChange,       // () => void  变更结束（重渲染 + 属性面板刷新）
    getSelected,
    deleteSelected,  // 键盘 Delete/Backspace
  } = opts;

  let overlay = null;
  let drag = null;

  const scale = () => canvas._scale || 1;
  const findElement = (id) => (getPage().elements || []).find((el) => el.elementId === id);
  const nodeBy = (id) => canvas.querySelector(`[data-element-id="${CSS.escape(id)}"]`);

  // --------------------------------------------------------------------------
  // 选中框（边框 + 移动把手 + 缩放手柄）
  // --------------------------------------------------------------------------
  function refreshSelection() {
    if (overlay) overlay.remove();
    overlay = null;
    const id = getSelected();
    if (!id) return;
    const el = findElement(id);
    if (!el) return;
    overlay = document.createElement("div");
    overlay.dataset.selection = "true";
    overlay.style.cssText =
      `position:absolute;pointer-events:none;z-index:50;box-sizing:border-box;` +
      `border:1.5px solid #2563eb;`;
    const move = document.createElement("div");
    move.dataset.moveHandle = "1";
    move.style.cssText =
      `position:absolute;left:-7px;top:-7px;width:22px;height:22px;pointer-events:auto;` +
      `cursor:move;background:#fff;border:1.5px solid #2563eb;border-radius:6px;` +
      `display:flex;align-items:center;justify-content:center;` +
      `font-size:12px;color:#2563eb;line-height:1;touch-action:none;`;
    move.textContent = "✥";
    const resize = document.createElement("div");
    resize.dataset.handle = "se";
    resize.style.cssText =
      `position:absolute;right:-7px;bottom:-7px;width:16px;height:16px;` +
      `background:#2563eb;border:1.5px solid #fff;pointer-events:auto;cursor:nwse-resize;touch-action:none;`;
    overlay.append(move, resize);
    // 旋转把手（顶部中间；chart/table 官方不支持整体旋转，不显示）
    if (!["chart", "table"].includes(el.elementType)) {
      const rotate = document.createElement("div");
      rotate.dataset.rotateHandle = "1";
      rotate.style.cssText =
        `position:absolute;left:50%;top:-26px;width:14px;height:14px;transform:translateX(-50%);` +
        `background:#fff;border:1.5px solid #2563eb;border-radius:50%;` +
        `pointer-events:auto;cursor:grab;touch-action:none;` +
        `display:flex;align-items:center;justify-content:center;`;
      rotate.innerHTML = `<svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round"><path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2"/></svg>`;
      overlay.appendChild(rotate);
    }
    canvas.appendChild(overlay);
    updateSelectionBox();
  }

  /** 仅更新选中框几何（拖动中不重建 DOM）。表格用实测显示高度（内容自适应）。
   * 直接同步读 offsetHeight（读取即强制同步布局）：渲染后/拖动中任何时刻都准确，
   * 不依赖 ResizeObserver 的异步回调（重渲染瞬间新节点 dataset 尚未写入，
   * 回退 bounds[3] 会让选中框比实际渲染高度小一截）。 */
  function updateSelectionBox() {
    if (!overlay) return;
    const el = findElement(getSelected());
    if (!el) return;
    const [x, y, w, h] = el.bounds;
    let dispH = h;
    if (el.elementType === "table") {
      const node = nodeBy(el.elementId);
      if (node && node.offsetHeight > 0) dispH = node.offsetHeight;
    }
    overlay.style.left = `${x}px`;
    overlay.style.top = `${y}px`;
    overlay.style.width = `${w}px`;
    overlay.style.height = `${dispH}px`;
  }

  // --------------------------------------------------------------------------
  // 拖动 / 缩放 / 旋转（由 interaction/stage.js 路由进入）
  // --------------------------------------------------------------------------
  function startGesture(e, mode, id) {
    const rect = canvas.getBoundingClientRect();
    const s = scale();
    const el = findElement(id);
    if (!el) return;
    const start = {
      mode,
      id,
      clientX: e.clientX,
      clientY: e.clientY,
      pageX: (e.clientX - rect.left) / s,
      pageY: (e.clientY - rect.top) / s,
      origX: el.bounds[0],
      origY: el.bounds[1],
      origW: el.bounds[2],
      origH: el.bounds[3],
    };
    if (mode === "rotate") {
      // 旋转：以元素中心为基准，记录起始角度差
      const cx = el.bounds[0] + el.bounds[2] / 2;
      const cy = el.bounds[1] + el.bounds[3] / 2;
      start.cx = cx;
      start.cy = cy;
      start.startRot = el.rotation || 0;
      start.startAngle = Math.atan2(e.clientY - rect.top - cy * s, e.clientX - rect.left - cx * s);
    }
    drag = start;
    try {
      e.target.setPointerCapture?.(e.pointerId);
    } catch {
      /* 部分元素（SVG/ECharts）不支持时忽略 */
    }
    beginChange();
    // 自动行高的表格（无 rowHeights）拖缩放 → 写入均分行高比例，转为受控最小行高
    if (mode === "resize" && el.elementType === "table" && !Array.isArray(el.rowHeights)) {
      const n = Math.max(1, Array.isArray(el.rows) ? el.rows.length : 1);
      el.rowHeights = Array.from({ length: n }, () => 1 / n);
    }
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragEnd);
    window.addEventListener("pointercancel", onDragEnd);
    window.addEventListener("blur", onDragEnd);
  }

  function onDragMove(e) {
    if (!drag) return;
    const s = scale();
    const el = findElement(drag.id);
    if (!el) return;
    const rect = canvas.getBoundingClientRect();
    const dx = (e.clientX - drag.clientX) / s;
    const dy = (e.clientY - drag.clientY) / s;
    if (drag.mode === "rotate") {
      // 旋转角度 = 起始角度差（元素中心为原点），取整避免抖动
      const a = Math.atan2(e.clientY - rect.top - drag.cy * s, e.clientX - rect.left - drag.cx * s);
      let deg = drag.startRot + Math.round(((a - drag.startAngle) * 180) / Math.PI);
      deg = ((deg % 360) + 360) % 360; // 归一化到 [0, 360)
      el.rotation = deg;
      const node = nodeBy(drag.id);
      if (node) node.style.transform = `rotate(${deg}deg)`;
      return;
    }
    if (drag.mode === "move") {
      el.bounds[0] = Math.round(drag.origX + dx);
      el.bounds[1] = Math.round(drag.origY + dy);
      const node = nodeBy(drag.id);
      if (node) {
        node.style.left = `${el.bounds[0]}px`;
        node.style.top = `${el.bounds[1]}px`;
      }
      updateSelectionBox();
    } else {
      let nw = Math.max(8, Math.round(drag.origW + dx));
      let nh = Math.max(8, Math.round(drag.origH + dy));
      if (e.shiftKey && drag.origW > 0 && drag.origH > 0) {
        // Shift：等比缩放（以宽度为基准）
        const ratio = drag.origH / drag.origW;
        nh = Math.round(nw * ratio);
      }
      el.bounds[2] = nw;
      el.bounds[3] = nh;
      const node = nodeBy(drag.id);
      if (node) {
        node.style.width = `${nw}px`;
        node.style.height = `${nh}px`;
        syncSvgSize(node, [0, 0, nw, nh]);
      }
      updateSelectionBox();
    }
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
    drag = null;
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    window.removeEventListener("pointercancel", onDragEnd);
    window.removeEventListener("blur", onDragEnd);
    endChange(); // 全量重渲染校准（SVG 几何 / 图表重绘）
  }

  // --------------------------------------------------------------------------
  // 键盘：Delete 删除 / 方向键微调（空格平移等视口手势见 stage.js）
  // --------------------------------------------------------------------------
  document.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
    const id = getSelected();
    if (!id) return;
    const el = findElement(id);
    if (!el) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSelected && deleteSelected();
      return;
    }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const step = arrows[e.key];
    if (step) {
      e.preventDefault();
      beginChange();
      const n = e.shiftKey ? 10 : 1;
      el.bounds[0] += step[0] * n;
      el.bounds[1] += step[1] * n;
      const node = nodeBy(id);
      if (node) {
        node.style.left = `${el.bounds[0]}px`;
        node.style.top = `${el.bounds[1]}px`;
      }
      updateSelectionBox();
      endChange();
    }
  });

  return {
    refreshSelection,
    setScale(s) {
      canvas._scale = s;
    },
    startGesture,
    // 捏合接管时由路由器调用：与正常松手等价（提交已发生的位移并重渲染）
    cancelGesture: onDragEnd,
    isGestureActive: () => !!drag,
  };
}
