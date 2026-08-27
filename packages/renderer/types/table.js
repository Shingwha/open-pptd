// ============================================================================
// renderer/types/table.js — table 类型 render 分片注册（预览渲染）
// ============================================================================

import { registerType } from "../../model/registry.js";
import { renderTable } from "../table.js";

registerType({ type: "table", render: renderTable });
