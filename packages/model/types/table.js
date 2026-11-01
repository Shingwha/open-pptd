// packages/model/types/table.js — table element type descriptor (manifest metadata).
// layoutKey routes to the table layout hook; contentEditor marks the table data editor;
// render/toXml are registered by the renderer/writer shards.

export const tableType = {
  id: "table",
  label: "表格",
  layoutKey: "table",
  contentEditor: true,
  schema(el) {
    if (!Array.isArray(el.rows) || !el.rows.length) {
      return [{ message: "table 元素缺 rows（Cell 二维数组）" }];
    }
    const issues = [];
    // A stale rowHeights array (e.g. rows inserted/deleted without syncing) is a warning,
    // not an error: measurement falls back to content heights, but the mismatch must be
    // visible instead of silently applied to the wrong rows.
    if (Array.isArray(el.rowHeights) && el.rowHeights.length !== el.rows.length) {
      issues.push({
        level: "warning",
        message: `table.rowHeights 长度 ${el.rowHeights.length} 与 rows 行数 ${el.rows.length} 不一致（已按内容高度测量，请同步行高数组）`,
      });
    }
    return issues;
  },
};
