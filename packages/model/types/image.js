// packages/model/types/image.js — image element type descriptor (manifest metadata).
// schema only; render/toXml are registered by the renderer/writer shards.
// Part of the TypeManifest; its order follows types/index.js.

export const imageType = {
  id: "image",
  label: "图片",
  schema(el) {
    if (!el.src) return [{ message: "image 元素缺 src" }];
    return [];
  },
};
