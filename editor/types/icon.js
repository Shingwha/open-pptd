// ============================================================================
// types/icon.js — 图标元素类型 UI 分片注册（内置图标库，SVG 图片嵌入导出）
// ----------------------------------------------------------------------------
// render/toXml 分片分别由 packages/renderer/types、packages/writer/types 注册；
// iconThumb 为 UI 用缩略图，由本侧直接从 renderer 引入。
// ============================================================================

import { registerType } from "../../packages/model/registry.js";
import { nextElementId } from "../../packages/model/model.js";
import { ICONS } from "../../packages/model/icon-library.js";
import { resolveIconName } from "../../packages/model/icon-name.js";
import { iconThumb } from "../../packages/renderer/icon.js";
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

// 全量注册（与 shape.js 的 187 种同款策略）：添加面板图标 Tab 从 ICONS 派生完整
// 目录，按 `icon-${key}` 查条目——此前只注册 12 个快捷图标，点其余 180 个时
// addItems[`icon-${key}`] 为 undefined，pick 崩（Cannot read properties of undefined）
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
      ...Object.entries(ICONS).map(([key]) => iconItem(key)),
    ],
  },

  create: () => iconElement("check"),

  props(el, h) {
    const key = resolveIconName(el.iconName);
    const def = key ? ICONS[key] : null;
    const fields = [
      { kind: "button", label: "更换图标…",
        onClick: () => { h.beginChange(); h.openEditor(el); h.endChange(); } },
      { kind: "color", label: "颜色",
        get: () => el.fill?.color || "$text",
        set: (v) => (el.fill = { type: "solid", color: v }) },
    ];
    if (def) {
      fields.push({ kind: "hint", text: `${def.label} · ${def.cat} · 点击搜索框可快速筛选` });
    } else {
      fields.push({ kind: "hint", text: `未知图标 ${el.iconName}（官方 fas: 格式仅映射常见图标）` });
    }
    return [{ title: "图标", fields }];
  },

  quickbar(el, h) {
    h.label("颜色");
    h.color(el.fill?.color || "$text", (v) => h.change(() => (el.fill = { type: "solid", color: v })));
    h.textBtn("更换", "更换图标", () => h.change(() => h.openEditor(el)));
  },
});
