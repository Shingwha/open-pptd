// ============================================================================
// app/view/thumbnails.js — 底部缩略条：渲染 + 页面多选 + 拖排序 + 右键菜单
// ----------------------------------------------------------------------------
// B2（U2-lite 移植：a06f3c5 功能部分，布局/尺寸保持原版 140×79）：
//   - 页面多选：点选切换当前页并清空页选择；Shift = 范围选择；Ctrl/⌘ = 切换单页
//   - 拖动排序：拖卡片（阈值触发）→ 落点竖线指示（.drop-before/.drop-after）→ 松手
//     写入模型，走 api.movePage（beginChange 快照）→ 可 Ctrl+Z 撤销
//   - 右键菜单：复制页 / 删除页 / 新建页 / 页面背景…（多选时批量复制 N / 删除 N）
// 统计文案沿用原版式样（当前页 / 总页数）；缩略卡尺寸沿用原版 CSS 断点（140×79）。
// 关注点独立：指针接线在创建时挂一次（AbortController 生命周期），renderThumbnails 只重建卡片内容。
// ============================================================================

import { dom } from "../../dom.js";
import { deckSize } from "../../../packages/model/index.js";
import { disposeChartInstances, renderPage } from "../../../packages/renderer/index.js";
import { menuItem, menuSeparator, openMenuAt } from "../../components/menu.js";
import { openPageBackgroundDialog } from "../../interaction/dialogs/page-background.js";

// 兜底卡框：仅元素不可测（如隐藏态渲染）时使用；实际尺寸由 CSS 断点决定、渲染时实测
const THUMB_W = 140;
const THUMB_H = 79;

export function createThumbnails({ state, api, reload }) {
  const bar = dom.pageThumbs;
  const ac = new AbortController(); // 生命周期：拖拽/滚轮监听经此一次解绑

  /** 页面多选集合（存页对象引用；每次渲染剔除已不存在的页） */
  const pageSel = new Set();
  let anchorPage = null; // Shift 范围选择的锚点（最后一次点选的页）

  /** 页面索引（-1 = 不在当前 deck） */
  const indexOfPage = (pg) => (state.deck?.pages || []).indexOf(pg);

  /** 选中的页面索引（升序） */
  function selectedIndexes() {
    return [...pageSel].map(indexOfPage).filter((i) => i >= 0).sort((a, b) => a - b);
  }

  function pruneSelection() {
    for (const pg of [...pageSel]) if (indexOfPage(pg) < 0) pageSel.delete(pg);
    if (anchorPage && indexOfPage(anchorPage) < 0) anchorPage = null;
  }

  // --------------------------------------------------------------------------
  // 指针接线（拖排序 / 拖拽横向滚动 / 多选点击 / 右键菜单）
  // --------------------------------------------------------------------------
  let thumbDrag = null; // { x, y, startScroll, moved, card, index, drop }
  let suppressClick = false;

  function thumbAt(x, y) {
    return document.elementFromPoint(x, y)?.closest(".thumb") || null;
  }

  /** 落点：命中卡片的左半 → 插到它前面，右半 → 插到它后面。 */
  function computeDropIndex(x, y) {
    const target = thumbAt(x, y);
    const cards = [...bar.querySelectorAll(".thumb")];
    if (!target) return { index: cards.length, side: "after", card: null };
    const r = target.getBoundingClientRect();
    const before = x < r.left + r.width / 2;
    const i = cards.indexOf(target);
    return { index: before ? i : i + 1, side: before ? "before" : "after", card: target };
  }

  function paintDrop(drop) {
    for (const c of bar.querySelectorAll(".thumb")) c.classList.remove("drop-before", "drop-after");
    if (drop?.card) drop.card.classList.add(drop.side === "before" ? "drop-before" : "drop-after");
  }

  if (bar) {
    // 垂直滚轮 → 横向滚动（容器无溢出时不劫持，避免影响页面滚动）
    bar.addEventListener(
      "wheel",
      (e) => {
        if (bar.scrollWidth <= bar.clientWidth) return;
        e.preventDefault();
        bar.scrollLeft += e.deltaY || e.deltaX;
      },
      { passive: false, signal: ac.signal }
    );

    bar.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest("button")) return; // 删除按钮：正常点击
      const card = e.target.closest(".thumb");
      thumbDrag = {
        x: e.clientX,
        y: e.clientY,
        startScroll: bar.scrollLeft,
        moved: false,
        card,
        index: card ? [...bar.children].indexOf(card) : -1,
        drop: null,
      };
    }, { signal: ac.signal });

    window.addEventListener("pointermove", (e) => {
      if (!thumbDrag) return;
      const dx = e.clientX - thumbDrag.x;
      const dy = e.clientY - thumbDrag.y;
      if (!thumbDrag.moved && Math.hypot(dx, dy) > 4) thumbDrag.moved = true;
      if (!thumbDrag.moved) return;
      if (thumbDrag.index >= 0) {
        // 拖排序：落点指示（松手才写模型）
        bar.classList.add("reordering");
        thumbDrag.drop = computeDropIndex(e.clientX, e.clientY);
        paintDrop(thumbDrag.drop);
        if (e.clientX < bar.getBoundingClientRect().left + 24) bar.scrollLeft -= 8;
        else if (e.clientX > bar.getBoundingClientRect().right - 24) bar.scrollLeft += 8;
      } else {
        // 空白处拖动 = 横向滚动
        bar.scrollLeft = thumbDrag.startScroll - dx;
      }
    }, { signal: ac.signal });

    window.addEventListener("pointerup", () => {
      const d = thumbDrag;
      thumbDrag = null;
      if (!d) return;
      for (const c of bar.querySelectorAll(".thumb")) c.classList.remove("drop-before", "drop-after");
      bar.classList.remove("reordering");
      if (!d.moved) return;
      suppressClick = true; // 吞掉紧随的一次 click（避免误切换页面）
      setTimeout(() => (suppressClick = false), 160);
      if (d.index < 0 || !d.drop) return;
      // 目标索引换算：移除原页后，落点在其后的索引要 -1
      let to = d.drop.index;
      if (to > d.index) to -= 1;
      api.movePage(d.index, to);
    }, { signal: ac.signal });

    // 右键菜单（页面级）
    bar.addEventListener("contextmenu", (e) => {
      const card = e.target.closest(".thumb");
      e.preventDefault();
      const idx = card ? [...bar.children].indexOf(card) : -1;
      if (idx < 0) {
        openPageMenu(e.clientX, e.clientY, [], state.currentPage);
        return;
      }
      const pg = state.deck.pages[idx];
      if (!pageSel.has(pg)) {
        pageSel.clear();
        pageSel.add(pg);
        anchorPage = pg;
      }
      renderThumbnails();
      openPageMenu(e.clientX, e.clientY, selectedIndexes(), idx);
    }, { signal: ac.signal });
  }

  /** 页面级菜单：复制页 / 删除页 / 新建页 / 页面背景…（多选时给「N 页」批量项）。 */
  function openPageMenu(x, y, indexes, targetIndex) {
    const map = targetIndex >= 0 ? indexes : [];
    const n = map.length;
    const batch = n > 1;
    const run = (fn) => () => fn();
    const nodes = [
      menuItem(`复制页${batch ? `（${n} 页）` : ""}`, { disabled: n === 0, onClick: run(() => api.duplicatePages(map)) }),
      menuItem(`删除页${batch ? `（${n} 页）` : ""}`, { danger: true, disabled: n === 0, onClick: run(() => api.deletePages(map)) }),
      menuSeparator(),
      menuItem("新建页面", { onClick: run(() => api.addPage()) }),
      menuItem("页面背景…", {
        onClick: run(() => {
          const pg = state.deck.pages[targetIndex >= 0 ? targetIndex : state.currentPage];
          openPageBackgroundDialog({
            pg,
            theme: state.theme,
            beginChange: api.beginChange,
            endChange: api.endChange,
            refreshPreview: api.refreshPreview,
          });
        }),
      }),
      menuSeparator(),
      menuItem(`第 ${state.currentPage + 1} 页`, { disabled: true }),
    ];
    openMenuAt(x, y, nodes, { className: "thumb-menu" });
  }

  // --------------------------------------------------------------------------
  // 渲染
  // --------------------------------------------------------------------------
  function renderThumbnails() {
    if (!state.deck) return;
    pruneSelection();
    disposeChartInstances(bar);
    bar.innerHTML = "";
    state.deck.pages.forEach((pg, i) => {
      const multi = pageSel.has(pg);
      const thumb = document.createElement("div");
      thumb.className = "thumb" + (i === state.currentPage ? " active" : "") + (multi ? " multi" : "");
      thumb.dataset.pageIndex = String(i);
      thumb.title = `第 ${i + 1} 页`;
      bar.appendChild(thumb); // 先入条再测：卡框尺寸由 CSS 断点决定，运行时实测（含边框内容盒）
      const mini = document.createElement("div");
      mini.className = "thumb-canvas";
      // 按画布实际比例 contain 进卡框实测内容盒（16:9 恰好铺满；竖版海报左右居中、上下留边）。
      // 不能用常量：窄屏卡框更小，若按桌面 140×79 定位 mini 会下坠溢出。
      const [pw, ph] = deckSize(state.deck);
      const bw = thumb.clientWidth || THUMB_W;
      const bh = thumb.clientHeight || THUMB_H;
      const s = Math.min(bw / pw, bh / ph);
      mini.style.width = `${pw}px`;
      mini.style.height = `${ph}px`;
      mini.style.transform = `scale(${s})`;
      mini.style.position = "absolute";
      mini.style.left = `${Math.round((bw - pw * s) / 2)}px`;
      mini.style.top = `${Math.round((bh - ph * s) / 2)}px`;
      // 渐进加载中：骨架屏占位（页码/删除/点击照常；资产到位后 refreshThumb 定点替换）
      const skeleton = state.pagesPending?.has(pg) ? document.createElement("div") : null;
      if (skeleton) skeleton.className = "thumb-skeleton";
      else renderPage(mini, pg, state.deck, state.theme, { imageMap: state.imageMap, iconMap: state.iconMap });

      const num = document.createElement("span");
      num.className = "thumb-num";
      num.textContent = i + 1;
      const del = document.createElement("button");
      del.className = "thumb-del";
      del.textContent = "✕";
      del.title = "删除页面";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        api.deletePages([i]);
      });
      thumb.append(mini, ...(skeleton ? [skeleton] : []), num, del);
      thumb.addEventListener("click", (e) => onThumbClick(e, pg, i));
    });
    renderStat();
    // 当前页自动滚入视野（页面多时保持可见，不强制滚动已可见的）
    bar.querySelector(".thumb.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  /** 点击：Shift = 范围选择；Ctrl/⌘ = 切换单页；其余 = 切换当前页并清空页选择。 */
  function onThumbClick(e, pg, i) {
    if (suppressClick) return;
    if (e.shiftKey && anchorPage && indexOfPage(anchorPage) >= 0) {
      const a = indexOfPage(anchorPage);
      pageSel.clear();
      for (let k = Math.min(a, i); k <= Math.max(a, i); k += 1) pageSel.add(state.deck.pages[k]);
      state.currentPage = i;
      reload();
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      if (pageSel.has(pg)) pageSel.delete(pg);
      else pageSel.add(pg);
      anchorPage = pg;
      state.currentPage = i;
      reload();
      return;
    }
    pageSel.clear();
    anchorPage = pg;
    state.currentPage = i;
    state.selectedId = null;
    reload();
  }

  /** 状态条右侧统计：原版式样（当前页 / 总页数）。 */
  function renderStat() {
    if (!dom.pageCount) return;
    const total = state.deck?.pages?.length || 0;
    dom.pageCount.textContent = `${state.currentPage + 1} / ${total}`;
  }

  /** 渐进加载定点刷新：单页资产就绪后替换该页缩略图（骨架 → 实渲染）。 */
  function refreshThumb(pg) {
    if (!state.deck) return;
    const i = state.deck.pages.indexOf(pg);
    if (i < 0) return; // 加载中被删除/换 deck
    const thumb = bar.children[i];
    if (!thumb?.classList.contains("thumb")) return;
    disposeChartInstances(thumb);
    thumb.querySelector(".thumb-skeleton")?.remove();
    const mini = thumb.querySelector(".thumb-canvas");
    if (mini) renderPage(mini, pg, state.deck, state.theme, { imageMap: state.imageMap, iconMap: state.iconMap });
  }

  return {
    renderThumbnails,
    refreshThumb,
    /** 释放：解绑拖拽/滚轮监听、销毁缩略图图表实例并清空缩略条 DOM。 */
    destroy() {
      ac.abort();
      thumbDrag = null;
      pageSel.clear();
      anchorPage = null;
      if (bar) {
        disposeChartInstances(bar);
        bar.innerHTML = "";
      }
      if (dom.pageCount) dom.pageCount.textContent = "";
    },
  };
}
