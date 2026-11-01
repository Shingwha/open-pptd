// editor/types/table.js — table element UI boundary (label + create)
// The content editor lives in interaction/dialogs/table-editor.js (grid, insert/delete,
// merge/split, cell text/color/fill); there is no style panel or row-height dialog.

import { svgIcon } from "../ui.js";
import { nextElementId, registerType } from "../../packages/model/index.js";

registerType({
  type: "table",
  label: "表格",
  addIcon: svgIcon('<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9.5h16M4 15h16M10 4v16"/>'),
  addHint: "创建后直接编辑单元格",
  create: () => ({
    elementId: nextElementId("table"),
    elementType: "table",
    bounds: [220, 150, 460, 120],
    style: "$default",
    columnWidths: [0.4, 0.3, 0.3],
    rows: [
      [{ text: "指标" }, { text: "数值" }, { text: "说明" }],
      [{ text: "示例" }, { text: "—" }, { text: "—" }],
      [{ text: "示例" }, { text: "—" }, { text: "—" }],
    ],
  }),
});
