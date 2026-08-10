// ============================================================================
// types/icon.js — 图标元素类型注册（内置图标库，SVG 图片嵌入导出）
// ============================================================================

import { registerType } from "./registry.js";
import { nextElementId } from "../core/model.js";
import { ICONS } from "../core/icon-library.js";
import { resolveIconName } from "../core/icon-name.js";
import { renderIcon, iconThumb } from "../renderer/icon.js";
import { iconXml } from "../writer/icon.js";
import { openIconPicker } from "../interaction/dialogs/icon-editor.js";

/** 图标默认模型（官方 iconName 格式："style:name"，bs: 为本地 Bootstrap 命名空间）。 */
function iconElement(key, bounds = [380, 200, 72, 72]) {
  return {
    elementId: nextElementId("icon"),
    elementType: "icon",
    iconName: `bs:${key}`,
    bounds,
    fill: { type: "solid", color: "$text" },
  };
}

/** 常用图标快捷菜单项。 */
function iconItem(key) {
  const def = ICONS[key];
  return {
    id: `icon-${key}`,
    label: def?.label || key,
    icon: iconThumb(key, { size: 22 }),
    create: () => iconElement(key),
  };
}

// 添加快捷项：高频图标直接插入，其余走选择器
const QUICK = ["check", "arrow-right", "arrow-up-right", "bar-chart", "graph-up", "lightbulb", "people", "envelope", "calendar", "bullseye", "search", "gear"];

registerType({
  type: "icon",
  label: "图标",

  menu: {
    group: "图标",
    items: [
      {
        id: "icon-pick",
        label: "选择图标…",
        icon: iconThumb("grid"),
        desc: "内置 192 个商务图标",
        onClick(addApi) {
          openIconPicker({
            onPick: (key) => addApi.addElement(iconElement(key)),
          });
        },
      },
      ...QUICK.map(iconItem),
    ],
  },

  create: () => iconElement("check"),
  render: renderIcon,
  toXml: iconXml,

  props(el, h) {
    const g = h.group("图标");
    const key = resolveIconName(el.iconName);
    const def = key ? ICONS[key] : null;
    const row = document.createElement("div");
    row.className = "icon-prop-row";
    const thumb = document.createElement("span");
    thumb.className = "icon-prop-thumb";
    thumb.innerHTML = key ? iconThumb(key, { size: 28 }) : "?";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm";
    btn.textContent = "更换图标…";
    btn.onclick = () => {
      h.beginChange();
      h.openEditor(el);
      h.endChange();
    };
    row.append(thumb, btn);
    g.appendChild(row);
    if (def) {
      const hint = document.createElement("div");
      hint.className = "prop-hint";
      hint.textContent = `${def.label} · ${def.cat} · 点击搜索框可快速筛选`;
      g.appendChild(hint);
    } else {
      const hint = document.createElement("div");
      hint.className = "prop-hint";
      hint.textContent = `未知图标 ${el.iconName}（官方 fas: 格式仅映射常见图标）`;
      g.appendChild(hint);
    }
    const grid = document.createElement("div");
    grid.className = "prop-grid";
    grid.appendChild(h.field("颜色", h.colorInput(el.fill?.color || "$text", (v) => (el.fill = { type: "solid", color: v }))));
    g.appendChild(grid);
    return [g];
  },

  quickbar(el, h) {
    h.label("颜色");
    h.color(el.fill?.color || "$text", (v) => h.change(() => (el.fill = { type: "solid", color: v })));
    h.textBtn("更换", "更换图标", () => h.change(() => h.openEditor(el)));
  },
});
