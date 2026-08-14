// ============================================================================
// interaction/canvas.js — 元素手势执行器（选中框 / 拖动 / 缩放 / 旋转 / 键盘微调）
// ----------------------------------------------------------------------------
// 手势的分类与仲裁在 interaction/stage.js（统一路由器），本模块只负责
// 「执行」元素手势：路由器判定目标后调用 startGesture，之后的
// pointermove/up 由这里自行监听。
// 关键设计：
//   - 选中框渲染在 canvas-wrap 的不缩放图层（.sel-overlay）：几何按
//     canvas._scale 换算，边框 / 手柄在任何缩放下恒定屏幕尺寸（行业惯例，
//     否则放大后手柄巨大、缩小时点不中）。样式在 styles.css 的 .sel-* 体系。
//   - 手柄 8 向（四角 + 四边中点），data-handle 值即缩放方向；
//     旋转手柄带连接杆，随元素一起旋转；Shift = 角柄等比 / 旋转 15° 吸附。
//   - 拖动期间直接改模型 + DOM，结束才全量重渲染（流畅 + 一致）。
//   - pointercancel / window blur 兜底结束拖拽（鼠标在窗口外释放）。
//   - cancelGesture 供路由器在捏合接管时调用（提交已发生的位移）。
// ============================================================================

import { overlayGeom } from "../coords.js";

// 手柄方向 → 悬停光标（四角对角线 / 四边单轴）
const HANDLE_CURSOR = {
  nw: "nwse-resize", se: "nwse-resize",
  ne: "nesw-resize", sw: "nesw-resize",
  n: "ns-resize", s: "ns-resize",
  e: "ew-resize", w: "ew-resize",
};

export function createCanvasController(canvas, opts) {
  const {
    getPage,
    beginChange,     // () => void  变更前快照
    endChange,       // () => void  变更结束（重渲染 + 属性面板刷新）
    getSelected,
    deleteSelected,  // 键盘 Delete/Backspace
  } = opts;

  const wrapLayer = canvas.parentElement; // canvas-wrap：不缩放图层
  let overlay = null; // .sel-overlay（含 sel-box + 手柄）
  let box = null;     // .sel-box（边框矩形，手柄都挂在它上面随元素旋转）
  let sizeBadge = null;
  let drag = null;

  const scale = () => canvas._scale || 1;
  const findElement = (id) => (getPage().elements || []).find((el) => el.elementId === id);
  const nodeBy = (id) => canvas.querySelector(`[data-element-id="${CSS.escape(id)}"]`);

  // --------------------------------------------------------------------------
  // 选中框（恒定屏幕尺寸：几何 × scale，控件 1:1）
  // --------------------------------------------------------------------------
  function refreshSelection() {
    if (overlay) overlay.remove();
    overlay = null;
    box = null;
    const id = getSelected();
    if (!id) return;
    const el = findElement(id);
    if (!el) return;

    overlay = document.createElement("div");
    overlay.className = "sel-overlay";
    box = document.createElement("div");
    box.className = "sel-box";

    // 8 向缩放手柄：四角 = 白底圆点，四边中点 = 胶囊条（形状暗示可拉方向）。
    // 底边中点（s）不设手柄：该位置让给旋转手柄（Canva 式布局，
    // 顶部留给快速条；高度调整由四角承担）
    for (const dir of Object.keys(HANDLE_CURSOR)) {
      if (dir === "s") continue;
      const h = document.createElement("div");
      h.dataset.handle = dir;
      h.className = "sel-handle" + (dir === "n" ? " sel-handle--h" : "") +
        (dir === "e" || dir === "w" ? " sel-handle--v" : "");
      h.style.cursor = HANDLE_CURSOR[dir];
      h.title = "拖动调整大小（Shift 等比）";
      box.appendChild(h);
    }

    // 旋转手柄（底部中间，连接杆 + 圆形箭头；chart/table 不支持整体旋转）
    if (!["chart", "table"].includes(el.elementType)) {
      const stem = document.createElement("div");
      stem.className = "sel-rotate-stem";
      const rotate = document.createElement("div");
      rotate.dataset.rotateHandle = "1";
      rotate.className = "sel-rotate";
      rotate.title = "拖动旋转（Shift 每 15° 吸附）";
      rotate.innerHTML =
        `<span class="sel-rotate-ic"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" ` +
        `stroke-linecap="round"><path d="M4.5 12a7.5 7.5 0 0 1 13-5.2L20 9.3M19.5 12a7.5 7.5 0 0 1-13 5.2L4 14.7" ` +
        `stroke="currentColor"/></svg></span>`;
      box.append(stem, rotate);
    }

    // 尺寸 / 角度角标（仅手势进行中显示，见 .resizing）
    sizeBadge = document.createElement("div");
    sizeBadge.className = "sel-size";
    box.appendChild(sizeBadge);

    overlay.appendChild(box);
    wrapLayer.appendChild(overlay);
    updateSelectionBox();
  }

  /** 同步选中框几何（拖动中高频调用，只改样式不重建 DOM）。
   * 模型坐标 → wrap 图层视觉坐标统一走 coords.js（中心锚点缩放偏移、
   * 平移抵消都在那里处理）。表格用实测显示高度（内容自适应）：
   * offsetHeight 是未缩放的布局像素，与 bounds 同一坐标系。 */
  function updateSelectionBox() {
    if (!box) return;
    const el = findElement(getSelected());
    if (!el) return;
    let dispH = el.bounds[3];
    if (el.elementType === "table") {
      const node = nodeBy(el.elementId);
      if (node && node.offsetHeight > 0) dispH = node.offsetHeight;
    }
    const g = overlayGeom(canvas, wrapLayer, [el.bounds[0], el.bounds[1], el.bounds[2], dispH]);
    box.style.left = `${g.left}px`;
    box.style.top = `${g.top}px`;
    box.style.width = `${g.width}px`;
    box.style.height = `${g.height}px`;
    // 元素旋转时框随手柄一起转（手柄挂在 box 上，自动跟随）
    box.style.transform = el.rotation ? `rotate(${el.rotation}deg)` : "";
  }

  /** 手势进行中显示 W×H（缩放）或角度（旋转）。
   * 角标挂在 sel-box 上会随元素旋转，按当前角度反向补偿保持水平。 */
  function showBadge(text, rotation = 0) {
    if (!sizeBadge) return;
    sizeBadge.textContent = text;
    sizeBadge.style.transform = rotation ? `rotate(${-rotation}deg)` : "";
    overlay.classList.add("resizing");
  }

  // --------------------------------------------------------------------------
  // 拖动 / 缩放 / 旋转（由 interaction/stage.js 路由进入）
  //   mode = "move" | "rotate" | "n"|"s"|"e"|"w"|"nw"|"ne"|"sw"|"se"
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
    // 自动行高的表格（无 rowHeights）纵向拖缩放 → 写入均分行高比例，转为受控最小行高
    if (mode !== "move" && mode !== "rotate" && el.elementType === "table" && !Array.isArray(el.rowHeights)) {
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
      // 旋转角度 = 起始角度差（元素中心为原点）；Shift 吸附 15° 步进
      const a = Math.atan2(e.clientY - rect.top - drag.cy * s, e.clientX - rect.left - drag.cx * s);
      const step = e.shiftKey ? 15 : 1;
      let deg = drag.startRot + Math.round((((a - drag.startAngle) * 180) / Math.PI) / step) * step;
      deg = ((deg % 360) + 360) % 360; // 归一化到 [0, 360)
      el.rotation = deg;
      const node = nodeBy(drag.id);
      if (node) node.style.transform = `rotate(${deg}deg)`;
      showBadge(`${deg}°`, deg);
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
      return;
    }
    // 缩放：mode 含 n/s/e/w 才调整对应轴，锚点是反向边 / 角（固定不动）
    const m = drag.mode;
    let nx = drag.origX;
    let ny = drag.origY;
    let nw = drag.origW;
    let nh = drag.origH;
    if (m.includes("e")) nw = Math.max(8, Math.round(drag.origW + dx));
    if (m.includes("s")) nh = Math.max(8, Math.round(drag.origH + dy));
    if (m.includes("w")) {
      nw = Math.max(8, Math.round(drag.origW - dx));
      nx = drag.origX + drag.origW - nw;
    }
    if (m.includes("n")) {
      nh = Math.max(8, Math.round(drag.origH - dy));
      ny = drag.origY + drag.origH - nh;
    }
    // Shift + 角柄：等比缩放（以宽度为基准，高度按原始比例联动）
    if (e.shiftKey && /[ns]/.test(m) && /[ew]/.test(m) && drag.origW > 0 && drag.origH > 0) {
      nh = Math.max(8, Math.round(nw * (drag.origH / drag.origW)));
      if (m.includes("n")) ny = drag.origY + drag.origH - nh;
    }
    el.bounds[0] = nx;
    el.bounds[1] = ny;
    el.bounds[2] = nw;
    el.bounds[3] = nh;
    const node = nodeBy(drag.id);
    if (node) {
      node.style.left = `${nx}px`;
      node.style.top = `${ny}px`;
      node.style.width = `${nw}px`;
      node.style.height = `${nh}px`;
      syncSvgSize(node, [nx, ny, nw, nh]);
    }
    updateSelectionBox();
    showBadge(`${nw} × ${nh}`, el.rotation || 0);
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
    overlay?.classList.remove("resizing");
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
