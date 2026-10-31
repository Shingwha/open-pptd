// ============================================================================
// model/types/table.js — table element type descriptor (manifest metadata)
// ----------------------------------------------------------------------------
// layoutKey routes to the table layout hook; contentEditor marks the table data
// editor; render/toXml are registered by the renderer/writer shards.
// ============================================================================

export const tableType = {
  id: "table",
  label: "表格",
  layoutKey: "table",
  contentEditor: true,
  schema(el) {
    if (!Array.isArray(el.rows) || !el.rows.length) {
      return [{ message: "table 元素缺 rows（Cell 二维数组）" }];
    }
    return [];
  },
};
