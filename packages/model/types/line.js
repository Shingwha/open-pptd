// packages/model/types/line.js — line element type descriptor (manifest metadata).
// geometry fields only; render/toXml are registered by the renderer/writer shards.
// Part of the TypeManifest; its order follows types/index.js.

export const lineType = {
  id: "line",
  label: "线条",
  schema(el) {
    const issues = [];
    if (typeof el.points !== "string" || el.points.trim().split(/\s+/).length < 2) {
      issues.push({ message: "line 元素 points 至少需要 2 个点" });
    }
    if (!Array.isArray(el.viewBox) || el.viewBox.length !== 2) {
      issues.push({ message: "line 元素缺 viewBox [w, h]" });
    }
    return issues;
  },
};
