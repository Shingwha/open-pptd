// ============================================================================
// app/view/thumbnails.js — 缩略条：渲染 + 拖拽/滚轮横向滚动 + 自动跟随当前页
// ----------------------------------------------------------------------------
// 关注点独立：拖拽滚动等 DOM 接线在创建时挂一次（窗口级监听），
// renderThumbnails 只重建缩略图内容；页面切换/删除经 reload 回调触发全量渲染。
// ============================================================================

import { PAGE_WIDTH } from "../../core/model.js";
import { renderPage, disposeChartInstances } from "../../renderer/page.js";
import { isNarrow } from "../../ui.js";

const THUMB_W = 140;
// 窄屏（≤900px）迷你缩略图宽度，与 styles.css 响应式块中的 .thumb 同步
const thumbW = () => (isNarrow() ? 88 : THUMB_W);

export function createThumbnails({ state, api, reload }) {
  const bar = document.getElementById("page-thumbs");

  // --------------------------------------------------------------------------
  // 拖拽滚动（页面多时横向拖动查看；自动跟随当前页）
  // --------------------------------------------------------------------------
  let thumbDrag = null;
  if (bar) {
    // 垂直滚轮 → 横向滚动（容器无溢出时不劫持，避免影响页面滚动）
    bar.addEventListener(
      "wheel",
      (e) => {
        if (bar.scrollWidth <= bar.clientWidth) return;
        e.preventDefault();
        bar.scrollLeft += e.deltaY || e.deltaX;
      },
      { passive: false }
    );
    bar.addEventListener("pointerdown", (e) => {
      // 不拦截缩略图上的删除按钮（button 自带 mousedown 行为）
      if (e.target.closest("button")) return;
      thumbDrag = { x: e.clientX, startScroll: bar.scrollLeft, moved: false };
    });
    window.addEventListener("pointermove", (e) => {
      if (!thumbDrag) return;
      const dx = e.clientX - thumbDrag.x;
      if (Math.abs(dx) > 4) thumbDrag.moved = true;
      if (thumbDrag.moved) bar.scrollLeft = thumbDrag.startScroll - dx;
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
    disposeChartInstances(bar);
    bar.innerHTML = "";
    state.deck.pages.forEach((pg, i) => {
      const thumb = document.createElement("div");
      thumb.className = "thumb" + (i === state.currentPage ? " active" : "");
      const mini = document.createElement("div");
      mini.className = "thumb-canvas";
      mini.style.transform = `scale(${thumbW() / PAGE_WIDTH})`;
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
        reload();
      });
      thumb.addEventListener("click", () => {
        state.currentPage = i;
        state.selectedId = null;
        reload();
      });
      thumb.append(mini, num, del);
      bar.appendChild(thumb);
    });
    document.getElementById("page-count").textContent = `${state.currentPage + 1} / ${state.deck.pages.length}`;
    // 当前页自动滚入视野（页面多时保持可见，不强制滚动已可见的）
    bar.querySelector(".thumb.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  return { renderThumbnails };
}
