// ============================================================================
// model/walk.js — 页面元素遍历唯一实现（v3 #3）
// ----------------------------------------------------------------------------
// 图片收集、预读、落盘、导出等"逐页逐元素"遍历统一走这里，禁止再写
// 嵌套 for 循环副本。页面模型与原始 YAML 页对象同构（{ elements: [...] }），
// 编辑器、CLI 导出两侧通用。
// ============================================================================

/**
 * 逐页逐元素回调。
 * @param {Array} pages 页面数组（模型页或 YAML 页对象）
 * @param {(el: object, page: object, pageIndex: number) => void} fn
 */
export function walkElements(pages, fn) {
  let pageIndex = 0;
  for (const page of pages || []) {
    for (const el of page?.elements || []) fn(el, page, pageIndex);
    pageIndex += 1;
  }
}

/**
 * 收集图片元素 src（元素类型 image、src 非空），按出现顺序去重。
 * @param {Array} pages
 * @param {object} [opts]
 * @param {boolean} [opts.includeDataUrl] 是否包含 data: 内嵌（缺省排除）
 * @param {boolean} [opts.includeRemote] 是否包含 http(s) 远程 URL（缺省排除）
 * @returns {string[]}
 */
export function collectImageSrcs(pages, { includeDataUrl = false, includeRemote = false } = {}) {
  const out = [];
  const seen = new Set();
  walkElements(pages, (el) => {
    if (el.elementType !== "image" || typeof el.src !== "string" || !el.src) return;
    if (!includeDataUrl && el.src.startsWith("data:")) return;
    if (!includeRemote && /^https?:/.test(el.src)) return;
    if (seen.has(el.src)) return;
    seen.add(el.src);
    out.push(el.src);
  });
  return out;
}
