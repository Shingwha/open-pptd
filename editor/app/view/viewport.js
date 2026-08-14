// ============================================================================
// app/view/viewport.js — 画布视口：缩放/平移状态 + transform 应用
// ----------------------------------------------------------------------------
// 触屏捏合 / Ctrl+滚轮 / 缩放控件 / 画布外拖拽平移（interaction/stage.js）
// 均经 setZoom / panBy 进入这里；平移量作用在 canvas-wrap 上（屏幕像素），
// 不影响元素命中与导出。1 = 适配视口。
// ============================================================================

import { PAGE_WIDTH, PAGE_HEIGHT } from "../../core/model.js";

export function createViewport({ stage, canvas, wrap, zoomLabel, controller, repaint }) {
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 4;
  // 平移余量：画布小于舞台（适配态）时仍允许轻微挪动的范围
  const PAN_SLACK = 60;

  /**
   * 锚点缩放：anchor（客户区坐标）下的内容点在缩放前后保持不动。
   * 捏合取两指中点、Ctrl+滚轮取光标位置；不传 anchor 则绕画布中心。
   * 推导：pan' = pan·k + (anchor − 舞台中心)·(1 − k)，k = 新旧缩放比。
   */
  function setZoom(z, anchor) {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    if (anchor) {
      const r = stage.getBoundingClientRect();
      const k = next / zoom;
      panX = panX * k + (anchor.x - r.left - r.width / 2) * (1 - k);
      panY = panY * k + (anchor.y - r.top - r.height / 2) * (1 - k);
    }
    zoom = next;
    repaint(); // 比例变了 → 重建画布（DOM 由调用方决定）
    renderZoom();
  }

  function panBy(dx, dy) {
    panX += dx;
    panY += dy;
    applyScale(); // 只重设 transform，不重建页面 DOM，拖拽逐帧可承受
  }

  // 还原到适配视图：缩放与平移一起归零
  function zoomReset() {
    panX = 0;
    panY = 0;
    setZoom(1);
  }

  // 缩放控件百分比显示
  function renderZoom() {
    if (zoomLabel) zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }

  function fitScale() {
    const w = Math.max(320, stage.clientWidth - 64);
    const h = Math.max(200, stage.clientHeight - 64);
    return Math.min(w / PAGE_WIDTH, h / PAGE_HEIGHT, 1.2);
  }

  // 计算并应用画布缩放（fitScale × zoom → transform + 控制器同步）
  // 平移 clamp 在此统一执行：画布超出舞台的部分可拖到边缘内，
  // 未超出（适配态）只允许 ±PAN_SLACK 的轻微挪动，画布永远不会拖离视野
  function applyScale() {
    const s = fitScale() * zoom;
    const mx = Math.max(0, (PAGE_WIDTH * s - stage.clientWidth) / 2 + PAN_SLACK);
    const my = Math.max(0, (PAGE_HEIGHT * s - stage.clientHeight) / 2 + PAN_SLACK);
    panX = Math.min(mx, Math.max(-mx, panX));
    panY = Math.min(my, Math.max(-my, panY));
    canvas.style.transform = `scale(${s})`;
    wrap.style.transform = `translate(${panX}px, ${panY}px)`;
    controller.setScale(s);
  }

  // 面板宽度动画期间逐帧跟随舞台宽度重算缩放：
  // 桌面收起/展开时 CSS 平滑改变 .inspector 宽度，stage 同步变宽，
  // 若只在动画开始时算一次，画布尺寸会与舞台脱节（视觉突变）。
  // 每帧只更新 transform，不重建页面 DOM，开销可忽略。
  let scaleRaf = 0;
  function followStageWidth(duration = 260) {
    cancelAnimationFrame(scaleRaf);
    const t0 = performance.now();
    const tick = () => {
      applyScale();
      if (performance.now() - t0 < duration) scaleRaf = requestAnimationFrame(tick);
    };
    scaleRaf = requestAnimationFrame(tick);
  }

  return {
    setZoom,
    panBy,
    zoomReset,
    renderZoom,
    applyScale,
    followStageWidth,
    zoomIn: () => setZoom(zoom * 1.25),
    zoomOut: () => setZoom(zoom / 1.25),
    getZoom: () => zoom,
  };
}
