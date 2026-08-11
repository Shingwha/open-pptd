// ============================================================================
// app/present.js — 放映模式（全屏演示）
// ----------------------------------------------------------------------------
// 一键进入放映：黑场覆盖层 + 16:9 页面按视口等比缩放，复用 renderer/page.js
// 渲染（背景/文字/形状/图表/表格/图标/图片与编辑器预览一致）。
//
// 操作：
//   ← → / ↑ ↓ / 空格 / PageUp / PageDown / Home / End   翻页
//   点击右 2/3 → 下一页，左 1/3 → 上一页；滚轮翻页
//   F  切换浏览器全屏      B  黑屏（再按恢复）    Esc  退出放映
//
// 页面切换为淡入过渡（与导出 PPTX 的 fade 过渡一致），双缓冲图层交叉淡化。
// 实时刷新（SSE）触发编辑器重渲染时，当前放映页自动同步（present.sync）。
// ============================================================================

import { PAGE_WIDTH, PAGE_HEIGHT } from "../core/model.js";
import { renderPage, disposeChartInstances } from "../renderer/page.js";

const FADE_MS = 260; // 与导出 PPTX 的 <p:fade/> 过渡节奏一致
const UI_HIDE_MS = 1800; // 鼠标停止移动后隐藏底部工具条
const WHEEL_DEBOUNCE_MS = 600;

export function createPresent({ state, view }) {
  let root = null; // 覆盖层
  let stage = null; // 幻灯片视口（等比缩放容器）
  let layers = []; // 双缓冲图层（960x540，交叉淡化）
  let counterEl = null;
  let progressEl = null;
  let index = 0; // 当前放映页
  let curLayer = 0;
  let active = false;
  let blackout = false;
  let cleanTimer = 0;
  let wheelLock = 0;
  let hideTimer = 0;
  let resizeRaf = 0;

  const count = () => state.deck?.pages?.length || 0;
  const clamp = (i) => Math.max(0, Math.min(count() - 1, i));

  function isActive() {
    return active;
  }

  // --------------------------------------------------------------------------
  // DOM
  // --------------------------------------------------------------------------
  function buildDOM() {
    root = document.createElement("div");
    root.className = "present";
    root.innerHTML = `
      <div class="present-progress"><i></i></div>
      <div class="present-stage">
        <div class="present-slide"></div>
        <div class="present-slide"></div>
      </div>
      <div class="present-ui">
        <span class="present-counter">1 / 1</span>
        <div class="present-actions">
          <button type="button" class="present-btn present-btn-icon" data-act="fullscreen" title="全屏切换 (F)">
            <svg viewBox="0 0 24 24"><path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button type="button" class="present-btn" data-act="prev">‹ 上一页</button>
          <button type="button" class="present-btn" data-act="next">下一页 ›</button>
          <button type="button" class="present-btn present-btn-exit" data-act="exit">退出放映</button>
        </div>
      </div>
      <div class="present-hint">← → 翻页 · 空格 下一页 · F 全屏 · B 黑屏 · Esc 退出</div>`;
    stage = root.querySelector(".present-stage");
    layers = [...root.querySelectorAll(".present-slide")];
    counterEl = root.querySelector(".present-counter");
    progressEl = root.querySelector(".present-progress i");
    document.body.appendChild(root);
  }

  /** 渲染某页到图层（图表实例先释放，与编辑器画布同一渲染管线）。 */
  function renderLayer(layer, i) {
    disposeChartInstances(layer);
    layer.innerHTML = "";
    const pg = state.deck.pages[i];
    renderPage(layer, pg, state.deck, state.theme, { imageMap: state.imageMap });
    autoGrowTexts(pg, layer);
  }

  /**
   * 文本框内容自适应高度（与 view.js 预览同一规则）：
   * 内容超出框高时增高并写回模型，放映与预览/导出高度一致。
   */
  function autoGrowTexts(page, container) {
    for (const el of page.elements || []) {
      if (el.elementType !== "text") continue;
      const node = container.querySelector(`[data-element-id="${CSS.escape(el.elementId)}"]`);
      const inner = node?.firstElementChild;
      if (!inner) continue;
      const need = inner.scrollHeight;
      if (need > el.bounds[3] + 1) {
        el.bounds[3] = need;
        node.style.height = `${need}px`;
      }
    }
  }

  /** 切页：新页渲染进空闲图层 → 交叉淡化 → 清理旧图层。 */
  function showSlide(target, { instant = false } = {}) {
    const n = count();
    if (!n) return;
    index = clamp(target);
    const next = curLayer ^ 1;
    renderLayer(layers[next], index);
    if (instant) layers[next].classList.add("no-anim");
    layers[curLayer].classList.remove("on");
    layers[next].classList.add("on");
    curLayer = next;
    if (instant) {
      // 首帧无过渡，下一帧恢复过渡（后续切页有淡入）
      requestAnimationFrame(() => layers[curLayer]?.classList.remove("no-anim"));
    }
    updateMeta();
    clearTimeout(cleanTimer);
    cleanTimer = setTimeout(() => {
      if (!active) return;
      const old = layers[curLayer ^ 1];
      disposeChartInstances(old);
      old.innerHTML = "";
    }, FADE_MS + 80);
  }

  function updateMeta() {
    counterEl.textContent = `${index + 1} / ${count()}`;
    progressEl.style.width = `${((index + 1) / count()) * 100}%`;
  }

  /** 按视口等比缩放幻灯片（transform 缩放，图表等内部尺寸不变）。 */
  function fit() {
    if (!root) return;
    const vw = root.clientWidth;
    const vh = root.clientHeight;
    const s = Math.min(vw / PAGE_WIDTH, vh / PAGE_HEIGHT);
    stage.style.transform = `scale(${s})`;
  }

  // --------------------------------------------------------------------------
  // 操作
  // --------------------------------------------------------------------------
  function next() {
    showSlide(index + 1);
  }
  function prev() {
    showSlide(index - 1);
  }
  function goTo(i) {
    showSlide(i);
  }
  function getIndex() {
    return index;
  }

  function toggleBlackout() {
    blackout = !blackout;
    root.classList.toggle("blackout", blackout);
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    } else {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        /* 环境不允许全屏（iframe 权限等）：覆盖层放映不受影响 */
      }
    }
  }

  /**
   * 工具条显隐：只有鼠标移动才唤起（PowerPoint 习惯）；
   * 鼠标停止移动 UI_HIDE_MS 后自动隐藏；悬停在工具条上时保持显示。
   * 键盘/点击翻页等操作不唤起工具条。
   */
  function bumpUI() {
    root.classList.remove("ui-hidden");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (active) root.classList.add("ui-hidden");
    }, UI_HIDE_MS);
  }

  /** 鼠标悬停工具条：取消隐藏计时，保持显示（否则没法点击按钮）。 */
  function hoverUI() {
    clearTimeout(hideTimer);
    root.classList.remove("ui-hidden");
  }
  function unhoverUI() {
    bumpUI();
  }

  // --------------------------------------------------------------------------
  // 事件
  // --------------------------------------------------------------------------
  function onKey(e) {
    const k = e.key;
    if (k === "Escape") {
      e.preventDefault();
      stop();
      return;
    }
    if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown" || k === " " || k === "Enter") {
      e.preventDefault();
      next();
    } else if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp" || k === "Backspace") {
      e.preventDefault();
      prev();
    } else if (k === "Home") {
      e.preventDefault();
      goTo(0);
    } else if (k === "End") {
      e.preventDefault();
      goTo(count() - 1);
    } else if (k === "f" || k === "F") {
      e.preventDefault();
      toggleFullscreen();
    } else if (k === "b" || k === "B") {
      e.preventDefault();
      toggleBlackout();
    } else if (k === "Tab") {
      // Tab 不放行（避免焦点逃出覆盖层）
      e.preventDefault();
    } else {
      return;
    }
  }

  function onPointer(e) {
    // 工具条/进度条/提示条上的点击不翻页
    if (e.target.closest(".present-ui, .present-progress, .present-hint")) return;
    const rect = root.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.25) prev();
    else next();
  }

  function onWheel(e) {
    const now = performance.now();
    if (now - wheelLock < WHEEL_DEBOUNCE_MS) return;
    wheelLock = now;
    if (e.deltaY > 0 || e.deltaX > 0) next();
    else prev();
  }

  function onMouseMove() {
    bumpUI();
  }

  function onResize() {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(fit);
  }

  function bindEvents() {
    document.addEventListener("keydown", onKey);
    root.addEventListener("pointerdown", onPointer);
    root.addEventListener("wheel", onWheel, { passive: true });
    root.addEventListener("mousemove", onMouseMove);
    // 悬停工具条保持显示，移出后恢复自动隐藏
    root.addEventListener("mouseenter", hoverUI);
    root.addEventListener("mouseleave", unhoverUI);
    window.addEventListener("resize", onResize);
  }

  function unbindEvents() {
    document.removeEventListener("keydown", onKey);
    if (root) {
      root.removeEventListener("pointerdown", onPointer);
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("mousemove", onMouseMove);
      root.removeEventListener("mouseenter", hoverUI);
      root.removeEventListener("mouseleave", unhoverUI);
    }
    window.removeEventListener("resize", onResize);
  }

  // --------------------------------------------------------------------------
  // 生命周期
  // --------------------------------------------------------------------------
  function start() {
    if (active || !state.deck || !count()) return;
    active = true;
    index = clamp(state.currentPage); // 从编辑器当前页开始放映
    document.body.classList.add("presenting");
    buildDOM();
    fit();
    showSlide(index, { instant: true });
    bindEvents();
    // 工具条按钮
    for (const btn of root.querySelectorAll(".present-btn")) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const act = btn.dataset.act;
        if (act === "next") next();
        else if (act === "prev") prev();
        else if (act === "fullscreen") toggleFullscreen();
        else if (act === "exit") stop();
      });
    }
    // 进入放映不自动全屏：黑场覆盖层铺满窗口，需要全屏时按 F / 点全屏按钮
    root.classList.add("ui-hidden");
  }

  function stop() {
    if (!active) return;
    active = false;
    clearTimeout(cleanTimer);
    clearTimeout(hideTimer);
    document.body.classList.remove("presenting");
    // 退出放映：还原窗口状态（进入时未自动全屏，退出时同样还原，逻辑一致）
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    unbindEvents();
    if (root) {
      disposeChartInstances(root);
      root.remove();
      root = null;
    }
    // 编辑器同步到放映结束时的页面
    if (state.currentPage !== index) {
      state.currentPage = index;
      state.selectedId = null;
      view.render();
    }
  }

  /** 编辑器重渲染（实时刷新/窗口缩放等）时同步当前放映页。 */
  function sync() {
    if (active && root && layers[curLayer]) {
      renderLayer(layers[curLayer], index);
    }
  }

  return { start, stop, isActive, next, prev, goTo, getIndex, toggleBlackout, sync };
}
