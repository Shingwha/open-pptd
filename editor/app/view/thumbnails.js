// editor/app/view/thumbnails.js — bottom thumbnail bar: render + page switch (+ edit ops)
// Click switches the current page. Editor instances also get drag-sort (drop line,
// model written on release via api.movePage) and a per-card delete chip; previews
// (editable:false) only navigate. Cards are .thumb-item > .thumb + .thumb-num, sized
// by the CSS breakpoint and measured at render; pointer wiring is attached once
// (AbortController) while renderThumbnails only rebuilds content.
//
// Incremental updates: a full rebuild (dispose charts + innerHTML = "") runs only on
// load / page insert/delete/move / theme change. Content edits repaint the current
// card only (refreshCurrent) and a page switch just moves the active class
// (setActive). A page-order signature guards the incremental path: if the deck's
// pages were reordered/replaced (e.g. undoing a page operation), it falls back to a
// full rebuild so a card never shows another page's content.

import { deckSize } from "../../../packages/model/index.js";
import { disposeChartInstances } from "../../../packages/renderer/index.js";
import { paintModelPage } from "../paint-page.js";

// Fallback card box: used only when an element cannot be measured (e.g. rendered
// hidden); the real size is decided by the CSS breakpoint and measured at render.
const THUMB_W = 112;
const THUMB_H = 63;

export function createThumbnails({ state, api, ops, ui, editable = true, reload }) {
  const bar = ui.dom.pageThumbs;
  const pageCountEl = ui.dom.pageCount;
  const ac = new AbortController(); // lifetime: drag/wheel listeners are unbound once through this

  // Pointer wiring (drag-sort / horizontal drag-scroll / click switch)
  let thumbDrag = null; // { x, y, startScroll, moved, card, index, drop }
  let suppressClick = false;
  // Signature of the deck structure the bar currently maps 1:1 (page order + deck
  // size). Only page-level identity is included (page type + first element id), never
  // the element count: adding/pasting/deleting elements keeps the signature, while
  // insert/delete/move (or undoing one) changes it. A matching bar is repainted in
  // place; anything else is rebuilt.
  let builtSig = null;
  // Card box from the last build (one CSS breakpoint size); a change means the
  // responsive layout switched and the cards must be rebuilt.
  let cardW = THUMB_W;
  let cardH = THUMB_H;
  // Deferred paint queue. The card DOM (and its handlers/indexes) is always built
  // synchronously; the current card is painted synchronously too, while the other
  // cards are painted on the following frames within a small per-frame budget.
  // Painting 12 chart pages synchronously blocked the main thread for >100ms on every
  // full render; deferring keeps the interaction path short and spreads the work.
  const PAINT_BUDGET_MS = 24;
  let paintQueue = [];
  let paintRaf = 0;

  function pagesSignature(deck) {
    return (deck?.pages || []).map((pg) => `${pg?.pageType || ""}:${pg?.elements?.[0]?.elementId || ""}`).join("~");
  }

  function structureSig(deck) {
    return `${pagesSignature(deck)}|${deckSize(deck).join("x")}`;
  }

  /** A page drag must never select painted thumbnail text (the browser selection is document-wide). */
  function clearSelection() {
    try {
      window.getSelection?.()?.removeAllRanges();
    } catch {
      /* none */
    }
  }

  /** Painted deck images are content, not draggable documents: the pointer gesture belongs to the strip. */
  function pinDraggable(rootEl) {
    for (const img of rootEl.querySelectorAll("img")) img.draggable = false;
  }

  function thumbAt(x, y) {
    // Cards sit inside .thumb-item (page number underneath), so hit the item first
    return document.elementFromPoint(x, y)?.closest(".thumb-item")?.querySelector(".thumb") || null;
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
      // The strip is a drag surface: cancel the pointerdown default so no text/image
      // selection or native drag starts. Click still fires on release (page switch).
      e.preventDefault();
      clearSelection();
      const item = e.target.closest(".thumb-item");
      const card = item?.querySelector(".thumb") || null;
      thumbDrag = {
        x: e.clientX,
        y: e.clientY,
        startScroll: bar.scrollLeft,
        moved: false,
        card,
        index: item ? [...bar.children].indexOf(item) : -1,
        drop: null,
      };
    }, { signal: ac.signal });

    window.addEventListener("pointermove", (e) => {
      if (!thumbDrag) return;
      const dx = e.clientX - thumbDrag.x;
      const dy = e.clientY - thumbDrag.y;
      if (!thumbDrag.moved && Math.hypot(dx, dy) > 4) thumbDrag.moved = true;
      if (!thumbDrag.moved) return;
      if (editable && thumbDrag.index >= 0) {
        // Drag-sort: drop indicator (the model is written only on release)
        bar.classList.add("reordering");
        thumbDrag.drop = computeDropIndex(e.clientX, e.clientY);
        paintDrop(thumbDrag.drop);
        if (e.clientX < bar.getBoundingClientRect().left + 24) bar.scrollLeft -= 8;
        else if (e.clientX > bar.getBoundingClientRect().right - 24) bar.scrollLeft += 8;
      } else if (editable) {
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
      clearSelection(); // a drag that started before the selection was cleared may have re-selected
      setTimeout(() => (suppressClick = false), 160);
      if (!editable || d.index < 0 || !d.drop) return;
      // Target index conversion: after removing the original page, a drop point past it shifts by -1
      let to = d.drop.index;
      if (to > d.index) to -= 1;
      api.movePage(d.index, to);
    }, { signal: ac.signal });
    // No context menu on the thumbnail bar: outside the canvas the browser's native
    // menu stays (page ops live in the visible page menu / the ＋ button / the × chip)
  }

  // Rendering
  /** Scroll the strip only when the active card is not fully visible (scrollIntoView re-lays out the strip). */
  function ensureActiveVisible() {
    if (!bar) return;
    const item = bar.querySelector(".thumb.active")?.closest(".thumb-item");
    if (!item) return;
    const r = item.getBoundingClientRect();
    const br = bar.getBoundingClientRect();
    if (r.left < br.left || r.right > br.right) item.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function cancelPaintQueue() {
    if (paintRaf) cancelAnimationFrame(paintRaf);
    paintRaf = 0;
    paintQueue = [];
  }

  /** Paint one card now; a page that is still loading keeps its skeleton (refreshThumb lands later). */
  function paintCard(i) {
    const pg = state.deck?.pages?.[i];
    if (!pg || state.pagesPending?.has(pg)) return false;
    return paintThumbAt(i);
  }

  /** Frame-chunked drain: at most PAINT_BUDGET_MS of card painting per frame. */
  function flushPaintQueue() {
    paintRaf = 0;
    const t0 = performance.now();
    while (paintQueue.length && performance.now() - t0 < PAINT_BUDGET_MS) paintCard(paintQueue.shift());
    if (paintQueue.length) paintRaf = requestAnimationFrame(flushPaintQueue);
  }

  /** Queue every card except the current one (already painted synchronously). */
  function schedulePaint(indices) {
    cancelPaintQueue();
    paintQueue = indices.filter((i) => i !== state.currentPage);
    if (paintQueue.length) paintRaf = requestAnimationFrame(flushPaintQueue);
  }

  /** Repaint every card in place: theme change keeps the card DOM, handlers and indexes. */
  function repaintAll() {
    const total = state.deck.pages.length;
    paintCard(state.currentPage); // what the user sees now
    const rest = [];
    for (let i = 0; i < total; i++) if (i !== state.currentPage) rest.push(i);
    schedulePaint(rest);
    renderStat();
  }

  function renderThumbnails() {
    if (!state.deck) return;
    const deck = state.deck;
    if (!bar) {
      // Embedded preview skeletons have no page bar (canvas surface only)
      renderStat();
      return;
    }
    // Reuse path: strip and deck still match (same page order/size, same card box).
    // Repainting in place avoids rebuilding the card DOM, re-registering handlers,
    // disposing every chart instance and the GC churn that follows.
    if (builtSig === structureSig(deck) && bar.children.length === deck.pages.length) {
      const firstThumb = bar.children[0]?.querySelector?.(".thumb");
      if (firstThumb && firstThumb.clientWidth === cardW && firstThumb.clientHeight === cardH) {
        repaintAll();
        return;
      }
    }
    cancelPaintQueue(); // a rebuild replaces every card: drop any pending paint
    disposeChartInstances(bar);
    bar.innerHTML = "";
    const deferred = [];
    deck.pages.forEach((pg, i) => {
      // One page = card + page number underneath (the number is outside the card frame)
      const item = document.createElement("div");
      item.className = "thumb-item";
      const thumb = document.createElement("div");
      thumb.className = "thumb" + (i === state.currentPage ? " active" : "");
      thumb.dataset.pageIndex = String(i);
      thumb.title = `第 ${i + 1} 页`;
      thumb.draggable = false; // the strip owns the gesture (no native element drag)
      item.appendChild(thumb);
      // Insert before measuring: the card size is decided by the CSS breakpoint and measured at runtime
      bar.appendChild(item);
      const mini = document.createElement("div");
      mini.className = "thumb-canvas";
      mini.draggable = false;
      // Contain the canvas's real ratio into the measured card content box (16:9 fills exactly; a portrait poster
      // centers with top/bottom padding). Not a constant: the narrow-screen card box is smaller.
      const [pw, ph] = deckSize(deck);
      if (i === 0) {
        // One CSS size for every card: measure the first inserted card only (each
        // clientWidth read inside the loop would force a strip-wide layout)
        cardW = thumb.clientWidth || THUMB_W;
        cardH = thumb.clientHeight || THUMB_H;
      }
      const bw = cardW;
      const bh = cardH;
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
      else if (i === state.currentPage) {
        paintModelPage(mini, pg, deck, state.theme, { imageMap: state.imageMap, iconMap: state.iconMap });
        pinDraggable(mini);
      } else deferred.push(i); // painted on the next frames (frame-chunked below)

      thumb.append(mini, ...(skeleton ? [skeleton] : []));
      const num = document.createElement("span");
      num.className = "thumb-num";
      num.textContent = i + 1;
      item.appendChild(num);
      if (editable) {
        const del = document.createElement("button");
        del.className = "thumb-del";
        del.textContent = "✕";
        del.title = "删除页面";
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          api.deletePage(i);
        });
        thumb.appendChild(del);
      }
      thumb.addEventListener("click", (e) => onThumbClick(e, i));
    });
    schedulePaint(deferred);
    renderStat();
    // Scroll the current page into view (only when it is outside the visible strip)
    ensureActiveVisible();
    builtSig = structureSig(deck);
  }

  /** Click: switch the current page (single page model). */
  function onThumbClick(e, i) {
    if (suppressClick) return;
    state.currentPage = i;
    ops.clearSelection(); // page switch drops the element selection (single write entry)
    setActive(i); // the active card follows immediately (reload repaints the canvas)
    reload();
  }

  /** Statusbar stat: original style (current page / total). */
  function renderStat() {
    if (!pageCountEl) return;
    const total = state.deck?.pages?.length || 0;
    pageCountEl.textContent = `${state.currentPage + 1} / ${total}`;
  }

  /** Page switch: move .thumb.active + page number (no repaint, no bar rebuild). */
  function setActive(index = state.currentPage) {
    if (!state.deck) return;
    if (!bar) {
      renderStat();
      return;
    }
    const prev = bar.querySelector(".thumb.active");
    const next = bar.children[index]?.querySelector?.(".thumb") || null;
    if (prev && prev !== next) prev.classList.remove("active");
    if (next && !next.classList.contains("active")) {
      next.classList.add("active");
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    if (pageCountEl) pageCountEl.textContent = `${index + 1} / ${state.deck.pages.length}`;
  }

  /** Repaint one card in place (charts disposed, skeleton swapped out); false when the card is gone. */
  function paintThumbAt(i) {
    if (!bar) return false;
    const pg = state.deck?.pages?.[i];
    const thumb = bar.children[i]?.querySelector?.(".thumb");
    if (!pg || !thumb) return false;
    disposeChartInstances(thumb);
    thumb.querySelector(".thumb-skeleton")?.remove();
    const mini = thumb.querySelector(".thumb-canvas");
    if (!mini) return false;
    paintModelPage(mini, pg, state.deck, state.theme, { imageMap: state.imageMap, iconMap: state.iconMap });
    pinDraggable(thumb);
    return true;
  }

  /** Progressive-load targeted refresh: replace one page's thumbnail once its assets are ready (skeleton → real render). */
  function refreshThumb(pg) {
    if (!state.deck || !bar) return;
    const i = state.deck.pages.indexOf(pg);
    if (i < 0) return; // deleted or deck swapped while loading
    const queued = paintQueue.indexOf(i);
    if (queued >= 0) paintQueue.splice(queued, 1); // this page is ready now: paint it immediately
    paintThumbAt(i);
  }

  /** Content-edit refresh: repaint the current card only; a structural change falls back to a full rebuild. */
  function refreshCurrent() {
    if (!state.deck) return;
    if (!bar || structureSig(state.deck) !== builtSig) {
      renderThumbnails();
      return;
    }
    if (!paintThumbAt(state.currentPage)) renderThumbnails();
  }

  return {
    renderThumbnails,
    refreshThumb,
    refreshCurrent,
    setActive,
    /** Release: unbind drag/wheel listeners, dispose thumbnail chart instances and clear the bar DOM. */
    destroy() {
      ac.abort();
      cancelPaintQueue();
      thumbDrag = null;
      builtSig = null;
      if (bar) {
        disposeChartInstances(bar);
        bar.innerHTML = "";
      }
      if (pageCountEl) pageCountEl.textContent = "";
    },
  };
}
