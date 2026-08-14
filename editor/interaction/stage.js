// ============================================================================
// interaction/stage.js — 舞台手势路由器（统一入口 / 状态仲裁）
// ----------------------------------------------------------------------------
// 所有指针 / 滚轮手势在此分类与仲裁，元素手势的执行委托给
// interaction/canvas.js（选中框 / 拖动 / 缩放 / 旋转），视口状态（zoom/pan）
// 的唯一持有者是 app/view.js，本模块只调用 panBy / setZoom / zoomReset。
//
// 路由规则（pointerdown 于 #stage，捕获阶段先于元素内部控件）：
//   1. 悬浮控件（缩放条 / 按钮组 / 添加菜单 / 快速条…）→ 放行，不接管
//   2. 空格按住 / 鼠标中键          → 平移（任意位置，包括元素上）
//   3. 选中框手柄（缩放/旋转/移动）  → 元素手势
//   4. 元素本体                      → 选中 + 移动手势
//   5. 空白（画布内 or 画布外）      → 位移≤4px=点击取消选中，>4px=平移
//   6. 任意时刻第二根手指落下        → 捏合缩放（终止一切进行中的手势，
//                                     锚点=两指中点）
// 滚轮：Ctrl/⌘=锚点缩放，否则=平移（浮层上放行，保持原生滚动）。
// 双击：元素 → 进编辑器；空白 → 还原适配视图。
// ============================================================================

export function createStageController(stage, opts) {
  const {
    element,      // interaction/canvas.js：{ startGesture, cancelGesture, isGestureActive }
    select,       // (id) => void  轻量选中
    getSelected,  // () => id | null
    deselect,     // () => void  点击空白取消选中
    onActivate,   // (id) => void  双击元素进编辑器
    panBy, setZoom, getZoom, zoomReset,
  } = opts;
  if (!stage) return;

  // 悬浮控件自带点击 / 滚动行为，不参与舞台手势
  const FLOATING =
    ".zoom-ctl, .fab-stack, .add-menu, .stage-status, .quickbar, " +
    "button, input, textarea, select, [contenteditable]";
  const isFloating = (t) => !!t.closest(FLOATING);

  // 选中框手柄 → 手势类型：缩放手柄的 data-handle 值本身就是方向
  // （n/s/e/w/nw/ne/sw/se，见 canvas.js），旋转手柄为 "rotate"
  const handleMode = (t) =>
    t.closest("[data-handle]")?.dataset.handle || (t.closest("[data-rotate-handle]") ? "rotate" : null);

  // 触屏：空白面阻止浏览器手势（页面回弹 / 双击缩放），指针事件才能完整送达。
  // 元素与手柄由 .canvas 的 touch-action:none 覆盖。
  stage.addEventListener(
    "touchstart",
    (e) => {
      if (!isFloating(e.target) && !handleMode(e.target) && !e.target.closest("[data-element-id]")) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  // --------------------------------------------------------------------------
  // 空格抓手（桌面）：按住空格后任意位置拖动均为平移
  // --------------------------------------------------------------------------
  let spacePan = false;
  const isTyping = (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
  };
  document.addEventListener("keydown", (e) => {
    // 输入控件与按钮上的空格保留原生行为（无障碍）
    if (e.code !== "Space" || e.repeat || isTyping(e) || e.target.closest?.("button")) return;
    spacePan = true;
    stage.classList.add("space-pan");
    e.preventDefault(); // 阻止页面滚动
  });
  document.addEventListener("keyup", (e) => {
    if (e.code !== "Space") return;
    spacePan = false;
    stage.classList.remove("space-pan");
  });

  // --------------------------------------------------------------------------
  // 手势状态机：pointers（活跃指针表）/ tapPan（空白按下）/ pinch（捏合）
  // --------------------------------------------------------------------------
  const pointers = new Map();
  let tapPan = null;
  let pinch = null;

  function startPan(e, tapDeselect = false) {
    tapPan = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, tapDeselect };
    stage.classList.add("panning");
    e.preventDefault(); // 阻止文本选择 / 聚焦 / 中键自动滚动
  }

  /** 第二指落下：终止一切进行中的手势（含元素拖动），切入捏合缩放。 */
  function beginPinch() {
    const wasDragging = element.isGestureActive?.();
    if (wasDragging) element.cancelGesture(); // 提交已发生的位移（同正常松手）
    tapPan = null;
    stage.classList.remove("panning");
    const [a, b] = [...pointers.values()];
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: getZoom?.() ?? 1 };
  }

  // 双击检测：第二击不再起新手势（避免多余历史快照），交由 dblclick 处理
  let lastTap = null;
  function isRepeatTap(e) {
    const now = performance.now();
    const repeat =
      lastTap &&
      now - lastTap.t < 350 &&
      Math.abs(e.clientX - lastTap.x) < 8 &&
      Math.abs(e.clientY - lastTap.y) < 8;
    lastTap = { t: now, x: e.clientX, y: e.clientY };
    return repeat;
  }

  stage.addEventListener(
    "pointerdown",
    (e) => {
      if (isFloating(e.target)) return;
      if (isRepeatTap(e)) return;

      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        beginPinch();
        e.preventDefault();
        return;
      }
      if (pointers.size > 2) return;

      // 1) 空格 / 中键 → 抓手平移（任意位置，包括元素上）
      if (spacePan || e.button === 1) {
        startPan(e);
        return;
      }
      // 2) 选中框手柄 → 元素缩放 / 旋转（canvas.js 执行）
      const mode = handleMode(e.target);
      if (mode) {
        const id = getSelected();
        if (id) {
          e.preventDefault();
          element.startGesture(e, mode, id);
        }
        return;
      }
      // 3) 元素本体 → 选中 + 移动手势（preventDefault 阻止拖动时选中内部文本）
      const node = e.target.closest("[data-element-id]");
      if (node) {
        const id = node.dataset.elementId;
        if (getSelected() !== id) select(id);
        e.preventDefault();
        element.startGesture(e, "move", id);
        return;
      }
      // 4) 空白（画布内 or 画布外）→ 点击取消选中 / 拖动平移
      startPan(e, true);
    },
    true // capture：先于 ECharts/zrender 等元素内部事件
  );

  window.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      // 捏合：锚点 = 两指中点（中点下的内容在缩放前后保持不动）
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > 0) {
        setZoom?.(pinch.zoom * (dist / pinch.dist), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
      return;
    }
    if (!tapPan) return;
    // 位移超过阈值才算拖动平移；否则保持「点击」语义（松手取消选中）
    if (!tapPan.moved && Math.hypot(e.clientX - tapPan.sx, e.clientY - tapPan.sy) > 4) tapPan.moved = true;
    if (!tapPan.moved) return;
    panBy?.(e.clientX - tapPan.x, e.clientY - tapPan.y);
    tapPan.x = e.clientX;
    tapPan.y = e.clientY;
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size > 0) return;
    // 点击（未拖动）空白 → 取消选中；pointercancel/系统打断不算点击
    if (tapPan && !tapPan.moved && e.type === "pointerup" && tapPan.tapDeselect) deselect?.();
    tapPan = null;
    stage.classList.remove("panning");
  }
  window.addEventListener("pointerup", endPointer);
  window.addEventListener("pointercancel", endPointer);
  window.addEventListener("blur", () => {
    pointers.clear();
    pinch = null;
    tapPan = null;
    spacePan = false;
    stage.classList.remove("panning", "space-pan");
  });

  // --------------------------------------------------------------------------
  // 滚轮：Ctrl/⌘ = 锚点缩放（防浏览器页面缩放），否则 = 平移
  // --------------------------------------------------------------------------
  stage.addEventListener(
    "wheel",
    (e) => {
      if (isFloating(e.target)) return; // 浮层（添加菜单列表等）保持原生滚动
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        setZoom?.((getZoom?.() ?? 1) * factor, { x: e.clientX, y: e.clientY });
      } else {
        panBy?.(e.deltaX, e.deltaY);
      }
    },
    { passive: false }
  );

  // --------------------------------------------------------------------------
  // 双击：元素 → 进编辑器；空白 → 还原适配视图（缩放 + 平移一起归零）
  // --------------------------------------------------------------------------
  stage.addEventListener(
    "dblclick",
    (e) => {
      if (isFloating(e.target)) return;
      const node = e.target.closest("[data-element-id]");
      if (node) onActivate?.(node.dataset.elementId);
      else zoomReset?.();
    },
    true
  );
}
