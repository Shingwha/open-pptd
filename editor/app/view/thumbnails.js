// ============================================================================
// app/view/thumbnails.js — bottom thumbnail bar: render + page multi-select + drag-sort + context menu
// ----------------------------------------------------------------------------
// B2 (U2-lite port: the feature part of a06f3c5, layout/size kept at the original 140×79):
//   - page multi-select: click switches the current page and clears the page selection;
//     Shift = range select; Ctrl/⌘ = toggle one page
//   - drag-sort: drag a card (threshold-triggered) → drop line indicator
//     (.drop-before/.drop-after) → release writes the model via api.movePage
//     (beginChange snapshot) → Ctrl+Z can undo
//   - context menu: duplicate page / delete page / new page / page background…
//     (batch duplicate N / delete N when multi-selected)
// The stat text keeps the original style (current page / total); thumbnail card
// size keeps the original CSS breakpoints (140×79). Concerns stay separate:
// pointer wiring is attached once at creation (AbortController lifetime) while
// renderThumbnails only rebuilds card content.
// ============================================================================

import { dom } from "../../dom.js";
import { deckSize } from "../../../packages/model/index.js";
import { disposeChartInstances, renderPage } from "../../../packages/renderer/index.js";
import { menuItem, menuSeparator, openMenuAt } from "../../components/menu.js";
import { openPageBackgroundDialog } from "../../interaction/dialogs/page-background.js";

// Fallback card box: used only when an element cannot be measured (e.g. rendered
// hidden); the real size is decided by the CSS breakpoint and measured at render.
const THUMB_W = 140;
const THUMB_H = 79;

export function createThumbnails({ state, api, reload }) {
  const bar = dom.pageThumbs;
  const ac = new AbortController(); // lifetime: drag/wheel listeners are unbound once through this

  /** Page multi-select set (stores page object refs; prunes pages that no longer exist on each render) */
  const pageSel = new Set();
  let anchorPage = null; // Shift range-select anchor (the last clicked page)

  /** Page index (-1 = not in the current deck) */
  const indexOfPage = (pg) => (state.deck?.pages || []).indexOf(pg);

  /** Selected page indexes (ascending) */
  function selectedIndexes() {
    return [...pageSel].map(indexOfPage).filter((i) => i >= 0).sort((a, b) => a - b);
  }

  function pruneSelection() {
    for (const pg of [...pageSel]) if (indexOfPage(pg) < 0) pageSel.delete(pg);
    if (anchorPage && indexOfPage(anchorPage) < 0) anchorPage = null;
  }

  // --------------------------------------------------------------------------
  // Pointer wiring (drag-sort / horizontal drag-scroll / multi-select click / context menu)
  // --------------------------------------------------------------------------
  let thumbDrag = null; // { x, y, startScroll, moved, card, index, drop }
  let suppressClick = false;

  function thumbAt(x, y) {
    return document.elementFromPoint(x, y)?.closest(".thumb") || null;
  }

  /** Drop point: left half of a hit card → insert before it, right half → insert after it. */
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
    // Vertical wheel → horizontal scroll (not hijacked when the container has no overflow, so page scroll is unaffected)
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
      if (e.target.closest("button")) return; // delete button: a normal click
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
        // Drag-sort: drop indicator (the model is written only on release)
        bar.classList.add("reordering");
        thumbDrag.drop = computeDropIndex(e.clientX, e.clientY);
        paintDrop(thumbDrag.drop);
        if (e.clientX < bar.getBoundingClientRect().left + 24) bar.scrollLeft -= 8;
        else if (e.clientX > bar.getBoundingClientRect().right - 24) bar.scrollLeft += 8;
      } else {
        // Dragging empty space = horizontal scroll
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
      suppressClick = true; // swallow the click that immediately follows (avoids an accidental page switch)
      setTimeout(() => (suppressClick = false), 160);
      if (d.index < 0 || !d.drop) return;
      // Target index conversion: after removing the original page, a drop point past it shifts by -1
      let to = d.drop.index;
      if (to > d.index) to -= 1;
      api.movePage(d.index, to);
    }, { signal: ac.signal });

    // Context menu (page level)
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

  /** Page-level menu: duplicate / delete / new / page background… (batch items labeled "N pages" when multi-selected). */
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
  // Rendering
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
      bar.appendChild(thumb); // insert before measuring: the card size is decided by the CSS breakpoint and measured at runtime (border-box content)
      const mini = document.createElement("div");
      mini.className = "thumb-canvas";
      // Contain the canvas's real ratio into the measured card content box (16:9 fills exactly; a portrait poster centers with top/bottom padding).
      // Not a constant: the narrow-screen card box is smaller, so positioning mini at the desktop 140×79 would sink and overflow.
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
      // Progressive loading: skeleton placeholder (page number/delete/click still work; refreshThumb swaps it in place once assets land)
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
    // Scroll the current page into view automatically (keeps it visible with many pages; visible cards are not force-scrolled)
    bar.querySelector(".thumb.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  /** Click: Shift = range select; Ctrl/⌘ = toggle one page; otherwise switch the current page and clear the page selection. */
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

  /** Statusbar stat: original style (current page / total). */
  function renderStat() {
    if (!dom.pageCount) return;
    const total = state.deck?.pages?.length || 0;
    dom.pageCount.textContent = `${state.currentPage + 1} / ${total}`;
  }

  /** Progressive-load targeted refresh: replace one page's thumbnail once its assets are ready (skeleton → real render). */
  function refreshThumb(pg) {
    if (!state.deck) return;
    const i = state.deck.pages.indexOf(pg);
    if (i < 0) return; // deleted or deck swapped while loading
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
    /** Release: unbind drag/wheel listeners, dispose thumbnail chart instances and clear the bar DOM. */
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
