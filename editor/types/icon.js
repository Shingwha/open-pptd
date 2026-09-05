// ============================================================================
// types/icon.js — 图标元素类型 UI 分片注册（Font Awesome 免费库，SVG 图片嵌入导出）
// ----------------------------------------------------------------------------
// render/toXml 分片分别由 packages/renderer/types、packages/writer/types 注册；
// 图标选择走 openIconPicker（搜索 + FA 官方分类，约 2000 图标）。
// ============================================================================

import { registerType } from "../../packages/model/registry.js";
import { nextElementId } from "../../packages/model/model.js";
import { resolveIconName } from "../../packages/model/icon-fa.js";
import { openIconPicker } from "../interaction/dialogs/icon-editor.js";
import { getIconRegistrySync } from "../app/project/icons.js";

/** 图标默认模型（官方 iconName 格式 "style:name"，前缀 fas/far/fab）。 */
export function iconElement(raw = "fas:star", bounds = [380, 200, 72, 72]) {
  return {
    elementId: nextElementId("icon"),
    elementType: "icon",
    iconName: raw,
    bounds,
    fill: { type: "solid", color: "$text" },
  };
}

registerType({
  type: "icon",
  label: "图标",

  menu: {
    group: "图标",
    items: [
      {
        id: "icon-pick",
        label: "搜索图标…",
        desc: "Font Awesome 免费库约 2000 个（fas 实心 / far 描边 / fab 品牌）",
        onClick(addApi) {
          openIconPicker({
            onPick: (raw) => addApi.addElement(iconElement(raw)),
          });
        },
      },
    ],
  },

  create: () => iconElement(),

  props(el, h) {
    const registry = getIconRegistrySync();
    const hit = registry ? resolveIconName(el.iconName, registry) : null;
    const fields = [
      { kind: "button", label: "更换图标…",
        onClick: () => { h.beginChange(); h.openEditor(el); h.endChange(); } },
      { kind: "color", label: "颜色",
        get: () => el.fill?.color || "$text",
        set: (v) => (el.fill = { type: "solid", color: v }) },
    ];
    if (hit) {
      fields.push({ kind: "hint", text: `${hit.prefix}:${hit.name} · Font Awesome 免费库` });
    } else if (registry) {
      fields.push({ kind: "hint", text: `未知图标 ${el.iconName}（命名以 fontawesome.com/search?ic=free 为准，前缀 fas/far/fab）` });
    }
    return [{ title: "图标", fields }];
  },

  quickbar(el, h) {
    h.label("颜色");
    h.color(el.fill?.color || "$text", (v) => h.change(() => (el.fill = { type: "solid", color: v })));
    h.textBtn("更换", "更换图标", () => h.change(() => h.openEditor(el)));
  },
});
