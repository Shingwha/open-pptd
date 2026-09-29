// ============================================================================
// app/present.js — present mode (fullscreen show)
// ----------------------------------------------------------------------------
// One click to enter a show: a black overlay layer plus the canvas scaled to the
// deck's real size, reusing renderer/page.js (background/text/shape/chart/table/
// icon/image, identical to the editor preview).
//
// Controls:
//   ← → / ↑ ↓ / Space / PageUp / PageDown / Home / End   paging
//   click right 2/3 → next, left 1/3 → previous; wheel pages too
//   F  toggle browser fullscreen      B  blackout (press again to restore)    Esc  exit
//
// Page changes fade in (same cadence as the PPTX fade transition), crossing two
// double-buffered layers. When live reload (SSE) re-renders the editor, the
// current show page syncs automatically (present.sync).
// ============================================================================

import { ICON_FULLSCREEN } from "../icons.js";
import { deckSize } from "../../packages/model/index.js";
import { disposeChartInstances, renderPage } from "../../packages/renderer/index.js";

const FADE_MS = 260; // matches the <p:fade/> cadence in the exported PPTX
const UI_HIDE_MS = 1800; // hide the bottom toolbar after the pointer stops moving
const WHEEL_DEBOUNCE_MS = 600;

export function createPresent({ state, view }) {
  let root = null; // overlay
  let stage = null; // slide viewport (scaled container)
  let layers = []; // double-buffered layers (deck's real canvas size, cross-faded)
  let counterEl = null;
  let progressEl = null;
  let index = 0; // current show page
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
            ${ICON_FULLSCREEN}
          </button>
          <button type="button" class="present-btn" data-act="prev">‹ 上一页</button>
          <button type="button" class="present-btn" data-act="next">下一页 ›</button>
          <button type="button" class="present-btn present-btn-exit" data-act="exit">退出放映</button>
        </div>
      </div>
      <div class="present-hint">← → 翻页 · 空格 下一页 · F 全屏 · B 黑屏 · Esc 退出</div>`;
    stage = root.querySelector(".present-stage");
    layers = [...root.querySelectorAll(".present-slide")];
    // Layer size follows the deck's real canvas (inline override of the 960×540 fallback in present.css)
    const [pw, ph] = deckSize(state.deck);
    stage.style.width = `${pw}px`;
    stage.style.height = `${ph}px`;
    for (const layer of layers) {
      layer.style.width = `${pw}px`;
      layer.style.height = `${ph}px`;
    }
    counterEl = root.querySelector(".present-counter");
    progressEl = root.querySelector(".present-progress i");
    document.body.appendChild(root);
  }

  /** Render a page into a layer (chart instances disposed first, same pipeline as the editor canvas).
   * Height comes from the layout frame and is never written back to the model (spec 10: the model is never written back). */
  function renderLayer(layer, i) {
    disposeChartInstances(layer);
    layer.innerHTML = "";
    const pg = state.deck.pages[i];
    renderPage(layer, pg, state.deck, state.theme, { imageMap: state.imageMap, iconMap: state.iconMap });
  }

  /** Change page: render the new page into the idle layer → cross-fade → clean up the old layer. */
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
      // No transition on the first frame; restore it next frame (later page changes fade in)
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

  /** Scale the slide to the viewport (transform scaling; chart internals keep their size). */
  function fit() {
    if (!root) return;
    const vw = root.clientWidth;
    const vh = root.clientHeight;
    const [pw, ph] = deckSize(state.deck);
    const s = Math.min(vw / pw, vh / ph);
    stage.style.transform = `scale(${s})`;
  }

  // --------------------------------------------------------------------------
  // Actions
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
        /* fullscreen not allowed (iframe permissions etc.): the overlay show is unaffected */
      }
    }
  }

  /**
   * Toolbar visibility: only pointer movement brings it up (PowerPoint muscle
   * memory); it auto-hides UI_HIDE_MS after movement stops, and stays visible
   * while the pointer hovers it. Keyboard/click paging does not bring it up.
   */
  function bumpUI() {
    root.classList.remove("ui-hidden");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (active) root.classList.add("ui-hidden");
    }, UI_HIDE_MS);
  }

  /** Pointer hovers the toolbar: cancel the hide timer and keep it visible (otherwise the buttons are unreachable). */
  function hoverUI() {
    clearTimeout(hideTimer);
    root.classList.remove("ui-hidden");
  }
  function unhoverUI() {
    bumpUI();
  }

  // --------------------------------------------------------------------------
  // Events
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
      // Swallow Tab (keeps focus from escaping the overlay)
      e.preventDefault();
    } else {
      return;
    }
  }

  function onPointer(e) {
    // Clicks on the toolbar/progress/hint bar do not page
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
    // Keep the toolbar visible while hovered; restore auto-hide on leave
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
  // Lifecycle
  // --------------------------------------------------------------------------
  function start() {
    if (active || !state.deck || !count()) return;
    active = true;
    index = clamp(state.currentPage); // start the show from the editor's current page
    document.body.classList.add("presenting");
    buildDOM();
    fit();
    showSlide(index, { instant: true });
    bindEvents();
    // Toolbar buttons
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
    // Entering the show does not auto-fullscreen: the black overlay fills the window; press F / tap the fullscreen button when needed
    root.classList.add("ui-hidden");
  }

  function stop() {
    if (!active) return;
    active = false;
    clearTimeout(cleanTimer);
    clearTimeout(hideTimer);
    document.body.classList.remove("presenting");
    // Exiting the show restores the window state (we never auto-fullscreened on entry, so exit is symmetric)
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    unbindEvents();
    if (root) {
      disposeChartInstances(root);
      root.remove();
      root = null;
    }
    // Sync the editor to the page the show ended on
    if (state.currentPage !== index) {
      state.currentPage = index;
      state.selectedId = null;
      view.render();
    }
  }

  /** Sync the current show page when the editor re-renders (live reload/window resize). */
  function sync() {
    if (active && root && layers[curLayer]) {
      renderLayer(layers[curLayer], index);
    }
  }

  return {
    start,
    stop,
    isActive,
    next,
    prev,
    goTo,
    getIndex,
    toggleBlackout,
    sync,
    /** Release (destroy): exit the show, unbind window/document listeners, clear timers and layer DOM. */
    destroy() {
      stop();
      clearTimeout(cleanTimer);
      clearTimeout(hideTimer);
      cancelAnimationFrame(resizeRaf);
    },
  };
}
