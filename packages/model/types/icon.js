// ============================================================================
// model/types/icon.js — icon element type descriptor (manifest metadata)
// ----------------------------------------------------------------------------
// schema only; render/toXml are registered by the renderer/writer shards.
// ============================================================================

export const iconType = {
  id: "icon",
  label: "图标",
  schema(el) {
    if (!el.iconName) return [{ message: "icon 元素缺 iconName" }];
    return [];
  },
};
