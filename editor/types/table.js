// ============================================================================
// types/table.js — 表格元素类型注册
// ============================================================================

import { registerType } from "./registry.js";
import { nextElementId } from "../core/model.js";
import { renderTable } from "../renderer/table.js";
import { tableXml } from "../writer/table.js";
import { svgIcon } from "../ui.js";

registerType({
  type: "table",
  label: "表格",

  menu: {
    group: "数据",
    items: [
      {
        id: "table",
        label: "表格",
        desc: "双击编辑内容",
        icon: svgIcon(
          '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9.5h16M4 15h16M10 4v16"/>'
        ),
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
      },
    ],
  },

  render: renderTable,
  toXml: tableXml,

  props(el, h) {
    return [{
      title: "表格",
      fields: [
        { kind: "button", label: "编辑表格内容…",
          onClick: () => { h.beginChange(); h.openEditor(el); h.endChange(); } },
        { kind: "hint", text: "表格高度随内容自适应；也可在画布上双击进入编辑。" },
      ],
    }];
  },

  quickbar(el, h) {
    h.textBtn("数据…", "编辑表格内容", () => h.change(() => h.openEditor(el)));
  },
});
