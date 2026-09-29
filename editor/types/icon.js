// ============================================================================
// types/icon.js — icon element UI shards (Font Awesome free set, SVG exported inline)
// ----------------------------------------------------------------------------
// The render/toXml shards are registered by packages/renderer/types and
// packages/writer/types. Icon picking goes through openIconPicker (search plus
// the official FA categories, ~2000 icons).
// ============================================================================

import { openIconPicker } from "../interaction/dialogs/icon-editor.js";
import { getIconRegistrySync } from "../app/project/icons.js";
import { nextElementId, registerType, resolveIconName } from "../../packages/model/index.js";

/** Default icon model (official iconName format "style:name", prefix fas/far/fab). */
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
