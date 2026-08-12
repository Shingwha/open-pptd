// ============================================================================
// interaction/dialogs/icon-editor.js — 图标选择器（搜索 + 分类分组网格）
// ============================================================================

import { showDialog } from "./base.js";
import { ICONS } from "../../core/icon-library.js";
import { iconThumb } from "../../renderer/icon.js";

/**
 * 打开图标选择器。
 * @param {object} opts { current 当前图标 key, onPick(key) 选中回调 }
 */
export function openIconPicker({ current = null, onPick } = {}) {
  const root = document.createElement("div");
  root.className = "icon-picker";

  const search = document.createElement("input");
  search.type = "text";
  search.className = "icon-search";
  search.placeholder = "搜索图标（如：图表、箭头、对勾）…";
  root.appendChild(search);

  const grid = document.createElement("div");
  grid.className = "icon-grid";
  root.appendChild(grid);

  const CATS = ["方向", "状态", "图表", "文档", "沟通", "人员", "财务", "时间", "位置", "概念", "工具", "安全", "设备"];
  const byCat = new Map();
  for (const cat of CATS) byCat.set(cat, []);
  for (const [key, def] of Object.entries(ICONS)) {
    const list = byCat.get(def.cat);
    if (list) list.push([key, def]);
  }

  function render(filter) {
    grid.innerHTML = "";
    const q = (filter || "").trim().toLowerCase();
    for (const cat of CATS) {
      const items = (byCat.get(cat) || []).filter(
        ([key, def]) => !q || key.includes(q) || def.label.includes(q) || cat.includes(q)
      );
      if (!items.length) continue;
      const title = document.createElement("div");
      title.className = "icon-grid-cat";
      title.textContent = cat;
      grid.appendChild(title);
      const row = document.createElement("div");
      row.className = "icon-grid-row";
      for (const [key, def] of items) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "icon-cell" + (key === current ? " active" : "");
        btn.title = def.label;
        btn.innerHTML = iconThumb(key);
        btn.onclick = () => {
          current = key;
          onPick?.(key);
          btn.closest(".dialog-overlay")?.remove();
        };
        row.appendChild(btn);
      }
      grid.appendChild(row);
    }
    if (!grid.children.length) {
      const empty = document.createElement("div");
      empty.className = "icon-empty";
      empty.textContent = "没有匹配的图标";
      grid.appendChild(empty);
    }
  }

  search.addEventListener("input", () => render(search.value));
  render("");

  showDialog("选择图标", root, { onDone: () => {} });
  search.focus();
}
