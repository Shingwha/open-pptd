// ============================================================================
// app/view/view.js — 渲染编排（画布 / 缩略条 / 属性面板 / 快速条 / 按钮状态）
// ----------------------------------------------------------------------------
// 所有"把模型画到屏幕上"的入口集中在这里：render() 全量刷新，
// renderCanvas / renderThumbnails / renderProps / renderQuickbar / updateButtons
// 可单独调用（轻量选中、窗口缩放等场景）。
// 视口（缩放/平移）与缩略条是独立关注点，拆在 viewport.js / thumbnails.js，
// 各自持有状态与 DOM 接线，这里只做编排与画布重建。
// ============================================================================

import { renderPage } from "../../renderer/page.js";
import { resolveColor } from "../../core/theme.js";
import { getType } from "../../types/index.js";
import { quickbarColor, quickbarSelect, quickbarBtn, quickbarTextBtn, isNarrow } from "../../ui.js";
import { relRect } from "../../coords.js";
import { applyMeasurements } from "./measure.js";
import { createViewport } from "./viewport.js";
import { createThumbnails } from "./thumbnails.js";

export function createView({ state, page, selected, api, controller, props }) {
  const $ = (id) => document.getElementById(id);
  // 模块严格模式下裸调用 render() 时 this 为 undefined，统一经 viewObj 自引用
  const viewObj = {};

  // 视口：缩放/平移状态与 transform 应用。缩放后比例变了需重建画布，
  // 平移只改 transform —— repaint 回调由这里注入。
  const viewport = createViewport({
    stage: $("stage"),
    canvas: $("canvas"),
    wrap: $("canvas-wrap"),
    zoomLabel: $("zoom-label"),
    controller,
    repaint: () => renderCanvas(),
  });
  // 缩略条：页面切换/删除后需全量刷新，经 reload 回调回到 render()
  const thumbnails = createThumbnails({ state, api, reload: () => viewObj.render() });

  // 方法表：render() 内部裸调用其他渲染函数，同时允许外部在 viewObj 上挂钩子
  Object.assign(viewObj, {
    render,
    renderCanvas,
    renderProps,
    renderQuickbar,
    updateButtons,
    renderZoom: viewport.renderZoom,
    setZoom: viewport.setZoom,
    panBy: viewport.panBy,
    followStageWidth: viewport.followStageWidth,
    zoomIn: viewport.zoomIn,
    zoomOut: viewport.zoomOut,
    zoomReset: viewport.zoomReset,
    getZoom: viewport.getZoom,
    renderThumbnails: thumbnails.renderThumbnails,
  });

  // --------------------------------------------------------------------------
  // 全量刷新
  // --------------------------------------------------------------------------
  function render() {
    if (!state.deck) return; // 加载失败/未完成时安全跳过（resize 等外部触发）
    thumbnails.renderThumbnails();
    renderCanvas();
    renderProps();
    renderQuickbar();
    updateButtons();
    viewport.renderZoom();
    // 外部注册的每渲染钩子（状态栏 dirty 圆点等），见 main.js 装配
    viewObj.afterRender?.();
  }

  // --------------------------------------------------------------------------
  // 画布
  // --------------------------------------------------------------------------
  function renderCanvas() {
    if (!state.deck) return;
    const canvas = $("canvas");
    viewport.applyScale();
    // transform-origin 为 center：flex 居中 + 中心锚点缩放，视觉左右/上下对称，无需 margin 补偿
    const pg = page();
    renderPage(canvas, pg, state.deck, state.theme, { imageMap: state.imageMap });
    applyMeasurements(pg, canvas);
    controller.refreshSelection();
  }

  // --------------------------------------------------------------------------
  // 属性面板（元素属性 + 页面设置）
  // --------------------------------------------------------------------------
  function renderProps() {
    const el = selected();
    const badge = $("inspector-badge");
    const def = el ? getType(el.elementType) : null;
    if (el && def) {
      badge.hidden = false;
      badge.textContent = def.label;
    } else {
      badge.hidden = true;
    }
    $("inspector-title").textContent = state.selectedId ? "元素属性" : "页面设置";
    props.refresh();
  }

  // --------------------------------------------------------------------------
  // 浮动快调条（选中元素时跟随显示的高频操作）
  // --------------------------------------------------------------------------
  function renderQuickbar() {
    const qb = $("quickbar");
    const el = selected();
    const canvas = $("canvas");
    const stage = $("stage");
    const node = el ? canvas.querySelector(`[data-element-id="${CSS.escape(el.elementId)}"]`) : null;
    if (!el || !node) {
      qb.classList.remove("show");
      qb.innerHTML = "";
      return;
    }
    qb.innerHTML = "";

    // 控件助手：所有方法直接把控件挂到快速条（类型模块只管"调什么"，不管挂载）
    const h = {
      label(text) {
        const s = document.createElement("span");
        s.className = "qb-label";
        s.textContent = text;
        qb.appendChild(s);
      },
      // 颜色：令牌（$primary 等）解析为具体 hex 回填，展示当前真实颜色
      color(value, onCommit) {
        qb.appendChild(quickbarColor(resolveColor(state.theme, value) || "", onCommit));
      },
      select: (options, value, onCommit) => qb.appendChild(quickbarSelect(options, value, onCommit)),
      fontOptions: () => api.fontOptions?.() || [["", "默认"]],
      btn: (label, title, onClick, active) => qb.appendChild(quickbarBtn(label, title, onClick, active)),
      textBtn: (label, title, onClick) => qb.appendChild(quickbarTextBtn(label, title, onClick)),
      change(fn) {
        api.beginChange();
        fn();
        render();
      },
      openEditor: api.openEditor,
    };

    // 类型徽标 + 类型专属控件 + 删除
    const def = getType(el.elementType);
    const badge = document.createElement("span");
    badge.className = "qb-type";
    badge.textContent = def?.label || el.elementType;
    qb.appendChild(badge);
    if (def?.quickbar) def.quickbar(el, h);
    qb.appendChild(quickbarTextBtn("删除", "删除元素", () => api.deleteSelected()));

    // 定位：元素上方居中；空间不足（贴近画布顶部）时放到元素下方
    // （节点 → 舞台坐标换算统一走 coords.js）
    const r = relRect(node.getBoundingClientRect(), stage.getBoundingClientRect());
    const x = r.left + r.width / 2;
    const y = r.top;
    qb.classList.add("show");
    // 窄屏：吸底横滑定位由 CSS 负责，清掉残留的内联定位（跨断点拖动窗口时）
    if (isNarrow()) {
      qb.style.left = "";
      qb.style.top = "";
      return;
    }
    // 边界 clamp：按快速条自身宽度（含 translateX(-50%)）约束，避免溢出画布区/屏幕
    const qbW = qb.offsetWidth;
    const half = qbW / 2;
    const minLeft = half + 8;
    const maxLeft = Math.max(minLeft, stage.getBoundingClientRect().width - half - 8);
    qb.style.left = `${Math.max(minLeft, Math.min(x, maxLeft))}px`;
    // 上方定位：紧贴元素顶缘（旋转手柄在框底，顶部空间整个让给快速条）；
    // 放不下时翻到元素下方，需让出底边旋转手柄区（连接杆 16 + 手柄 26 + 间距 10 = 52px）
    const topY = y - qb.offsetHeight - 12;
    qb.style.top = topY >= 8 ? `${topY}px` : `${y + r.height + 52}px`;
    // 与底部中央缩放控件避让：矩形相交时上移到控件上方（元素恰好拖到画布底部时）。
    // 舞台坐标以 sRect 为基准换算（zoom-ctl 的 rect 是客户区坐标）
    const zc = $("zoom-ctl");
    if (zc) {
      const sRect = stage.getBoundingClientRect();
      const zr = zc.getBoundingClientRect();
      const qr = qb.getBoundingClientRect();
      if (qr.left < zr.right && qr.right > zr.left && qr.bottom > zr.top && qr.top < zr.bottom) {
        qb.style.top = `${zr.top - sRect.top - qr.height - 10}px`;
      }
    }
  }

  // --------------------------------------------------------------------------
  // 按钮状态
  // --------------------------------------------------------------------------
  function updateButtons() {
    $("btn-undo").disabled = !state.history.canUndo();
    $("btn-redo").disabled = !state.history.canRedo();
  }

  return viewObj;
}
