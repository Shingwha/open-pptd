// ============================================================================
// app/export-image.js — PNG export UI adapter (backend lives in ExportService)
// ----------------------------------------------------------------------------
// The rasterization used to live here (capture-first + foreignObject fallback +
// per-element audit). W9 moved it behind the shared RenderBackend/ExportService
// path (editor/app/render-backend-browser.js + packages/export); this module now
// only drives the UI: progress toast, result download summary and the
// "elements that could not be embedded" warning. Page selection, scale, naming,
// zip packaging and reporting are handled by the export service.
// ============================================================================

/**
 * @param {{state: object, toast: object, exportService: {exportPng: Function}}} deps
 */
export function createImageExporter({ state, toast, exportService }) {
  /**
   * Export images. opts.pages: page indexes (0-based, default current page);
   * opts.scale: 1|2|3 (default 2); opts.mode: "zip" (default) / "files".
   * Returns ExportImageResult[] ({ index, png, droppedElements, source }).
   */
  async function exportImages(opts = {}) {
    if (!state.deck?.pages?.length) return [];
    const count = Array.isArray(opts.pages) && opts.pages.length ? opts.pages.length : 1;
    toast.show(count > 1 ? `正在导出 ${count} 页图片…` : "正在导出图片…", "info", 8000);
    try {
      const { results, dropped } = await exportService.exportPng(opts);
      if (!results.length) return [];
      const totalBytes = results.reduce((n, r) => n + (r.png?.length || 0), 0);
      const size = totalBytes >= 1048576 ? `${(totalBytes / 1048576).toFixed(1)} MB` : `${(totalBytes / 1024).toFixed(1)} KB`;
      toast.show(
        results.length === 1 ? `已导出 1 张图片（${size}）` : `已导出 ${results.length} 页图片${opts.mode === "files" ? "（逐张下载）" : ""}（${size}）`,
        "success"
      );
      if (dropped.length) {
        console.warn(`[export] ${dropped.length} 个元素未能导出：`, dropped);
        toast.show(`⚠ ${dropped.length} 个元素未能导出（清单见控制台）`, "danger", 6000);
      }
      return results;
    } catch (err) {
      toast.show(`导出图片失败: ${err.message}`, "danger");
      console.error(err);
      return [];
    }
  }

  return { exportImages };
}
