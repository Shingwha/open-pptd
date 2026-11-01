// packages/model/types/shape.js — shape element type descriptor (manifest metadata).
// schema only; render/toXml are registered by the renderer/writer shards.
// Part of the TypeManifest; its order follows types/index.js.

export const shapeType = {
  id: "shape",
  label: "形状",
  schema(el) {
    if (!el.shapeName) return [{ message: "shape 元素缺 shapeName" }];
    if (el.shapeName === "custom" && (!el.path || !Array.isArray(el.viewBox))) {
      return [{ message: "custom shape 缺 path 或 viewBox" }];
    }
    return [];
  },
};
