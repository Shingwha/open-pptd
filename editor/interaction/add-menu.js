// editor/interaction/add-menu.js — add control (text / table / chart / shape / line / image)
// Top-level entries follow ADD_TYPE_IDS. Shape expands an in-menu searchable, scrollable
// grid of the 187 presets (icons from the model evaluator); line expands its three
// styles. Image entries are dispatched to the caller, which owns local file picking.
// The popup (#add-list) is toggled by #btn-add and closes on outside pointerdown / Esc.

import { getType, ADD_TYPE_IDS, variantsOf } from "../types/index.js";
import { svgIcon } from "../ui.js";

const ICON_BACK = svgIcon('<path d="M15 6l-6 6 6 6"/>');

/** Small DOM helper: element with class and (optional) text. */
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

/**
 * Bind the add control.
 * @param {object} opts { fab, menu, onAdd: (type, variant?) => void }
 * @returns {{ destroy(): void }}
 */
export function bindAddMenu({ fab, menu, onAdd }) {
  if (!fab || !menu) return { destroy() {} };
  const ac = new AbortController();
  let built = false;
  let root = null; // top-level six entries
  let panel = null; // expanded variant panel (shape / line)
  let expandedType = null;

  const isOpen = () => !menu.hidden;

  function showRoot() {
    expandedType = null;
    if (panel) panel.hidden = true;
    if (root) root.hidden = false;
    menu.classList.remove("add-list-expanded");
    for (const item of root?.querySelectorAll(".add-item[aria-expanded]") || []) {
      item.setAttribute("aria-expanded", "false");
    }
  }

  function close() {
    menu.hidden = true;
    fab.classList.remove("active");
    fab.setAttribute("aria-expanded", "false");
    showRoot();
  }

  /** Create one element through the caller, closing the popup first (same as before). */
  function choose(type, variant) {
    close();
    onAdd?.(type, variant);
  }

  /** Build one variant button; `row` selects the line-style layout (icon + label + hint). */
  function variantButton(variant, type, row) {
    const btn = node("button", row ? "add-variant add-variant-row" : "add-variant");
    btn.type = "button";
    btn.dataset.variant = variant.id;
    if (variant.group) btn.dataset.variantGroup = variant.group;
    btn.title = variant.group ? `${variant.label} · ${variant.group}` : variant.label;
    btn.setAttribute("aria-label", variant.group ? `${variant.label}（${variant.group}）` : variant.label);
    if (variant.icon) {
      const ic = node("span", "add-variant-ic");
      ic.innerHTML = variant.icon;
      btn.appendChild(ic);
    }
    if (row) {
      const text = node("span", "add-variant-text");
      text.appendChild(node("span", "add-variant-label", variant.label));
      if (variant.hint) text.appendChild(node("span", "add-variant-hint", variant.hint));
      btn.appendChild(text);
    } else {
      btn.appendChild(node("span", "add-variant-label", variant.label));
    }
    btn.addEventListener("click", () => choose(type, variant.id), { signal: ac.signal });
    btn.dataset.search = `${variant.label || ""} ${variant.id} ${variant.group || ""}`.toLowerCase();
    return btn;
  }

  /** Shape panel: search + grouped 187-preset grid. */
  function buildShapePanel(list) {
    const search = node("input", "add-search");
    search.type = "search";
    search.placeholder = `搜索形状（${list.length}）`;
    search.setAttribute("aria-label", "搜索形状");
    panel.appendChild(search);

    const scroll = node("div", "add-variant-scroll");
    const groups = new Map(); // group label → grid (insertion order comes from the registry)
    for (const variant of list) {
      const group = variant.group || "基本";
      let grid = groups.get(group);
      if (!grid) {
        const section = node("div", "add-variant-group");
        section.dataset.variantGroup = group;
        section.appendChild(node("div", "add-variant-group-title", group));
        grid = node("div", "add-variant-grid");
        section.appendChild(grid);
        scroll.appendChild(section);
        groups.set(group, grid);
      }
      grid.appendChild(variantButton(variant, "shape", false));
    }
    panel.appendChild(scroll);

    const empty = node("div", "add-empty", "没有匹配的形状");
    empty.hidden = true;
    panel.appendChild(empty);

    search.addEventListener(
      "input",
      () => {
        const q = search.value.trim().toLowerCase();
        const buttons = scroll.querySelectorAll(".add-variant");
        let visible = 0;
        for (const btn of buttons) {
          const hit = !q || btn.dataset.search.includes(q);
          btn.hidden = !hit;
          if (hit) visible++;
        }
        for (const section of scroll.querySelectorAll(".add-variant-group")) {
          section.hidden = !section.querySelector(".add-variant:not([hidden])");
        }
        empty.hidden = visible > 0;
      },
      { signal: ac.signal }
    );
    // Enter picks the first remaining match (keyboard-only flow)
    search.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        scroll.querySelector(".add-variant:not([hidden])")?.click();
      },
      { signal: ac.signal }
    );
    queueMicrotask(() => search.focus());
  }

  /** Line panel: three style rows. */
  function buildLinePanel(list) {
    const box = node("div", "add-variant-list");
    for (const variant of list) box.appendChild(variantButton(variant, "line", true));
    panel.appendChild(box);
  }

  /** Expand the variant panel for a type (top-level entries stay in the DOM, hidden). */
  function openPanel(type) {
    const def = getType(type);
    const list = variantsOf(type);
    if (!list.length) {
      choose(type);
      return;
    }
    expandedType = type;
    panel.innerHTML = "";
    panel.dataset.type = type;
    const head = node("div", "add-panel-head");
    const back = node("button", "add-back");
    back.type = "button";
    back.setAttribute("aria-label", "返回添加菜单");
    back.innerHTML = ICON_BACK;
    back.addEventListener("click", () => {
      const previous = expandedType;
      showRoot();
      root?.querySelector(`.add-item[data-add-type="${previous}"]`)?.focus();
    }, { signal: ac.signal });
    head.append(back, node("span", "add-panel-title", def?.label || type));
    panel.appendChild(head);

    if (type === "shape") buildShapePanel(list);
    else buildLinePanel(list);

    root.hidden = true;
    panel.hidden = false;
    menu.classList.add("add-list-expanded");
    root.querySelector(`.add-item[data-add-type="${type}"]`)?.setAttribute("aria-expanded", "true");
  }

  function build() {
    root = node("div", "add-root");
    for (const id of ADD_TYPE_IDS) {
      const def = getType(id);
      if (!def) continue;
      const item = node("button", "add-item");
      item.type = "button";
      item.dataset.addType = id;
      if (def.addIcon) {
        const ic = node("span", "add-item-ic");
        ic.innerHTML = def.addIcon;
        item.appendChild(ic);
      }
      const text = node("span", "add-item-text");
      text.appendChild(node("span", "add-item-label", def.label || id));
      if (def.addHint) text.appendChild(node("span", "add-item-hint", def.addHint));
      item.appendChild(text);
      if (typeof def.addVariants === "function") {
        item.setAttribute("aria-expanded", "false");
        item.appendChild(node("span", "add-item-chev", "›"));
      }
      item.addEventListener("click", () => {
        if (typeof def.addVariants === "function") openPanel(id);
        else choose(id);
      }, { signal: ac.signal });
      root.appendChild(item);
    }
    menu.appendChild(root);
    panel = node("div", "add-panel");
    panel.hidden = true;
    menu.appendChild(panel);
    built = true;
  }

  function open() {
    if (!built) build();
    menu.hidden = false;
    fab.classList.add("active");
    fab.setAttribute("aria-expanded", "true");
  }

  fab.setAttribute("aria-haspopup", "menu");
  fab.setAttribute("aria-expanded", "false");
  fab.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isOpen()) close();
    else open();
  }, { signal: ac.signal });

  document.addEventListener("pointerdown", (e) => {
    if (!isOpen()) return;
    if (menu.contains(e.target) || e.target === fab) return;
    close();
  }, { signal: ac.signal });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) close();
  }, { signal: ac.signal });

  return {
    /** Release: detach listeners, close and clear the popup. */
    destroy() {
      ac.abort();
      close();
      menu.innerHTML = "";
      root = null;
      panel = null;
      built = false;
      fab.removeAttribute("aria-haspopup");
      fab.removeAttribute("aria-expanded");
    },
  };
}
