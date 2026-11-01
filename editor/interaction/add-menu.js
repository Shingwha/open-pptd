// editor/interaction/add-menu.js — minimal add control (text / table / chart)
// The editor adds only content-editable elements: each entry creates the element
// through its type shard; text is selected for immediate editing, table/chart open
// their content editor right away. The popup (#add-list) is toggled by #btn-add and
// closes on outside pointerdown / Esc.

import { getType, ADD_TYPE_IDS } from "../types/index.js";

/**
 * Bind the add control.
 * @param {object} opts { fab, menu, onAdd: (type) => void }
 * @returns {{ destroy(): void }}
 */
export function bindAddMenu({ fab, menu, onAdd }) {
  if (!fab || !menu) return { destroy() {} };
  const ac = new AbortController();
  let built = false;

  const isOpen = () => !menu.hidden;

  function close() {
    menu.hidden = true;
    fab.classList.remove("active");
    fab.setAttribute("aria-expanded", "false");
  }

  function build() {
    menu.innerHTML = "";
    for (const id of ADD_TYPE_IDS) {
      const def = getType(id);
      if (!def) continue;
      const item = document.createElement("button");
      item.type = "button";
      item.className = "add-item";
      item.dataset.addType = id;
      if (def.addIcon) {
        const ic = document.createElement("span");
        ic.className = "add-item-ic";
        ic.innerHTML = def.addIcon;
        item.appendChild(ic);
      }
      const text = document.createElement("span");
      text.className = "add-item-text";
      const label = document.createElement("span");
      label.className = "add-item-label";
      label.textContent = def.label || id;
      text.appendChild(label);
      if (def.addHint) {
        const hint = document.createElement("span");
        hint.className = "add-item-hint";
        hint.textContent = def.addHint;
        text.appendChild(hint);
      }
      item.appendChild(text);
      item.addEventListener("click", () => {
        close();
        onAdd?.(id);
      }, { signal: ac.signal });
      menu.appendChild(item);
    }
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
      built = false;
      fab.removeAttribute("aria-haspopup");
      fab.removeAttribute("aria-expanded");
    },
  };
}
