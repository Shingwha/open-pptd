// ============================================================================
// app/view.js — 渲染编排（画布 / 缩略条 / 属性面板 / 快速条 / 按钮状态）
// ----------------------------------------------------------------------------
// 所有"把模型画到屏幕上"的入口集中在这里：render() 全量刷新，
// renderCanvas / renderThumbnails / renderProps / renderQuickbar / updateButtons
// 可单独调用（轻量选中、窗口缩放等场景）。
// ============================================================================

import { PAGE_WIDTH, PAGE_HEIGHT } from "../core/model.js";
import { estimateTableLayout } from "../core/table.js";
import { renderPage, disposeChartInstances } from "../renderer/page.js";
import { resolveColor } from "../core/theme.js";
import { getType } from "../types/index.js";
import { quickbarColor, quickbarSelect, quickbarBtn, quickbarTextBtn } from "../ui.js";

const THUMB_W = 140;
// 表格实测高度写回 bounds[3] 的容差：border-collapse 下渲染高度比 Σ最小行高多出
// 底边框开销（默认 1px，粗边框至多几 px）。实测与最小行高和之差在此容差内视为
// 「内容未超出」，不写回（否则行高按比例重算→渲染更高，每次点击/渲染累积 +1px
// 无界增长）。内容撑行超出容差才写回实测高度（自动增高）。
const TABLE_MEASURE_TOL = 8;
// 窄屏（≤900px）迷你缩略图宽度，与 styles.css 响应式块中的 .thumb 同步
const NARROW = () => window.matchMedia("(max-width: 900px)").matches;
const thumbW = () => (NARROW() ? 88 : THUMB_W);

export function createView({ state, page, selected, api, controller, props }) {
  const $ = (id) => document.getElementById(id);
  // 模块严格模式下裸调用 render() 时 this 为 undefined，统一经 viewObj 自引用
  const viewObj = {};
  // 方法表：render() 内部裸调用其他渲染函数，同时允许外部在 viewObj 上挂钩子
  Object.assign(viewObj, {
    render,
    renderCanvas,
    renderThumbnails,
    renderProps,
    renderQuickbar,
    updateButtons,
    renderZoom,
    setZoom,
    followStageWidth,
    zoomIn: () => setZoom(zoom * 1.25),
    zoomOut: () => setZoom(zoom / 1.25),
    zoomReset: () => setZoom(1),
    getZoom: () => zoom,
  });

  // --------------------------------------------------------------------------
  // 全量刷新
  // --------------------------------------------------------------------------
  function render() {
    if (!state.deck) return; // 加载失败/未完成时安全跳过（resize 等外部触发）
    renderThumbnails();
    renderCanvas();
    renderProps();
    renderQuickbar();
    updateButtons();
    renderZoom();
    // 外部注册的每渲染钩子（状态栏 dirty 圆点等），见 main.js 装配
    viewObj.afterRender?.();
  }

  // --------------------------------------------------------------------------
  // 画布缩放（1 = 适配视口）：触屏捏合 / Ctrl+滚轮 / 缩放控件均经 setZoom
  // --------------------------------------------------------------------------
  let zoom = 1;
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 4;

  function setZoom(z) {
    zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    renderCanvas();
    viewObj.renderZoom();
  }

  // 缩放控件百分比显示
  function renderZoom() {
    const label = $("zoom-label");
    if (label) label.textContent = `${Math.round(zoom * 100)}%`;
  }

  // --------------------------------------------------------------------------
  // 画布
  // --------------------------------------------------------------------------
  function fitScale() {
    const stage = $("stage");
    const w = Math.max(320, stage.clientWidth - 64);
    const h = Math.max(200, stage.clientHeight - 64);
    return Math.min(w / PAGE_WIDTH, h / PAGE_HEIGHT, 1.2);
  }

  // 计算并应用画布缩放（fitScale × zoom → transform + 控制器同步）
  function applyScale() {
    const canvas = $("canvas");
    const s = fitScale() * zoom;
    canvas.style.transform = `scale(${s})`;
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

  function renderCanvas() {
    if (!state.deck) return;
    const canvas = $("canvas");
    applyScale();
    // transform-origin 为 center：flex 居中 + 中心锚点缩放，视觉左右/上下对称，无需 margin 补偿
    const pg = page();
    renderPage(canvas, pg, state.deck, state.theme, { imageMap: state.imageMap });
    autoGrowTexts(pg, canvas);
    // 表格实测高度写回 bounds[3]（预览与选中框/导出高度一致）。
    // 行高为 min-height 语义：渲染高度 = Σ最小行高 + 边框开销（collapse 底边约 1px）。
    // 内容未超出最小行高时【不写回】——行高按 bounds[3] 比例重算（core/table.js），
    // 写回会把边框开销喂回行高，形成「写回→行高变高→渲染更高→再写回」反馈回路，
    // 每次渲染/点击累积 +1px 无界增长；内容超出最小行高才写回实测（自动撑行）。
    // 自动行高表（无 rowHeights）的实测与 bounds 无关，写回幂等，行为不变。
    for (const el of pg.elements || []) {
      if (el.elementType !== "table") continue;
      const node = canvas.querySelector(`[data-element-id="${CSS.escape(el.elementId)}"]`);
      if (!node || node.offsetHeight <= 0) continue;
      if (Array.isArray(el.rowHeights)) {
        const minTotal = estimateTableLayout(el).rowHeights.reduce((a, b) => a + b, 0);
        if (node.offsetHeight - minTotal > TABLE_MEASURE_TOL) el.bounds[3] = node.offsetHeight;
      } else {
        el.bounds[3] = node.offsetHeight;
      }
    }
    controller.refreshSelection();
  }

  /**
   * 文本框内容自适应高度：内容超出框高时自动增高（不裁剪、不溢出），
   * 并把新高度写回模型 —— 预览与导出（PPT spAutoFit）行为一致。
   * 仅在内容超过框高时增高，不缩回（用户可拖大框留白，vAlign 控制对齐）。
   */
  function autoGrowTexts(page, canvas) {
    for (const el of page.elements || []) {
      if (el.elementType !== "text") continue;
      const node = canvas.querySelector(`[data-element-id="${CSS.escape(el.elementId)}"]`);
      const inner = node?.firstElementChild;
      if (!inner) continue;
      const need = inner.scrollHeight;
      if (need > el.bounds[3] + 1) {
        el.bounds[3] = need;
        node.style.height = `${need}px`;
      }
    }
  }

  // --------------------------------------------------------------------------
  // 缩略条
  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // 缩略条拖拽滚动（页面多时横向拖动查看；自动跟随当前页）
  // --------------------------------------------------------------------------
  const thumbsBar = $("page-thumbs");
  let thumbDrag = null;
  if (thumbsBar) {
    // 垂直滚轮 → 横向滚动（容器无溢出时不劫持，避免影响页面滚动）
    thumbsBar.addEventListener(
      "wheel",
      (e) => {
        if (thumbsBar.scrollWidth <= thumbsBar.clientWidth) return;
        e.preventDefault();
        thumbsBar.scrollLeft += e.deltaY || e.deltaX;
      },
      { passive: false }
    );
    thumbsBar.addEventListener("pointerdown", (e) => {
      // 不拦截缩略图上的删除按钮（button 自带 mousedown 行为）
      if (e.target.closest("button")) return;
      thumbDrag = { x: e.clientX, startScroll: thumbsBar.scrollLeft, moved: false };
    });
    window.addEventListener("pointermove", (e) => {
      if (!thumbDrag) return;
      const dx = e.clientX - thumbDrag.x;
      if (Math.abs(dx) > 4) thumbDrag.moved = true;
      if (thumbDrag.moved) thumbsBar.scrollLeft = thumbDrag.startScroll - dx;
    });
    window.addEventListener("pointerup", () => {
      if (thumbDrag?.moved) {
        // 拖拽结束：吞掉紧随的一次 click（避免误切换页面）；
        // 限时移除，防止未合成 click 时监听器永久挂起吞掉后续点击
        const suppress = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
        };
        document.addEventListener("click", suppress, true);
        setTimeout(() => document.removeEventListener("click", suppress, true), 150);
      }
      thumbDrag = null;
    });
  }

  function renderThumbnails() {
    if (!state.deck) return;
    const bar = $("page-thumbs");
    disposeChartInstances(bar);
    bar.innerHTML = "";
    state.deck.pages.forEach((pg, i) => {
      const thumb = document.createElement("div");
      thumb.className = "thumb" + (i === state.currentPage ? " active" : "");
      const mini = document.createElement("div");
      mini.className = "thumb-canvas";
      const tw = thumbW();
      mini.style.transform = `scale(${tw / PAGE_WIDTH})`;
      renderPage(mini, pg, state.deck, state.theme, { imageMap: state.imageMap });

      const num = document.createElement("span");
      num.className = "thumb-num";
      num.textContent = i + 1;
      const del = document.createElement("button");
      del.className = "thumb-del";
      del.textContent = "✕";
      del.title = "删除页面";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        if (state.deck.pages.length <= 1) return;
        api.beginChange();
        state.deck.pages.splice(i, 1);
        if (state.currentPage >= state.deck.pages.length) state.currentPage = state.deck.pages.length - 1;
        state.selectedId = null;
        render();
      });
      thumb.addEventListener("click", () => {
        state.currentPage = i;
        state.selectedId = null;
        render();
      });
      thumb.append(mini, num, del);
      bar.appendChild(thumb);
    });
    $("page-count").textContent = `${state.currentPage + 1} / ${state.deck.pages.length}`;
    // 当前页自动滚入视野（页面多时保持可见，不强制滚动已可见的）
    bar.querySelector(".thumb.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
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

    // 控件助手：所有方法直接把控件挂到快速条（类型模块只管“调什么”，不管挂载）
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
    const cRect = canvas.getBoundingClientRect();
    const nRect = node.getBoundingClientRect();
    const sRect = stage.getBoundingClientRect();
    const x = cRect.left - sRect.left + (nRect.left - cRect.left) + nRect.width / 2;
    const y = cRect.top - sRect.top + (nRect.top - cRect.top);
    qb.classList.add("show");
    // 窄屏：吸底横滑定位由 CSS 负责，清掉残留的内联定位（跨断点拖动窗口时）
    if (NARROW()) {
      qb.style.left = "";
      qb.style.top = "";
      return;
    }
    // 边界 clamp：按快速条自身宽度（含 translateX(-50%)）约束，避免溢出画布区/屏幕
    const qbW = qb.offsetWidth;
    const half = qbW / 2;
    const minLeft = half + 8;
    const maxLeft = Math.max(minLeft, sRect.width - half - 8);
    qb.style.left = `${Math.max(minLeft, Math.min(x, maxLeft))}px`;
    qb.style.top = y - 46 >= 8 ? `${y - 46}px` : `${y + nRect.height + 8}px`;
    // 与底部中央缩放控件避让：矩形相交时上移到控件上方（元素恰好拖到画布底部时）
    const zc = $("zoom-ctl");
    if (zc) {
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
