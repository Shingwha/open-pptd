// ============================================================================
// types/text.js — text element UI boundary (label + create)
// ----------------------------------------------------------------------------
// Render/toXml come from packages/renderer/types + packages/writer/types. The
// content editor lives in interaction/text-editor.js (opened by double-click or
// the add menu after creation); there is no properties/quickbar panel in 3.0.
// ============================================================================

import { svgIcon } from "../ui.js";
import { nextElementId, registerType } from "../../packages/model/index.js";

registerType({
  type: "text",
  label: "文字",
  addIcon: svgIcon('<path d="M5 5h14M12 5v14M9 19h6"/>'),
  addHint: "双击编辑内容（支持富文本与公式）",
  create: () => ({
    elementId: nextElementId("text"),
    elementType: "text",
    bounds: [340, 220, 280, 60],
    content: { text: "双击编辑文字", align: ["center", "middle"] },
  }),
});
