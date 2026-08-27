// ============================================================================
// renderer/types/line.js — line 类型 render 分片注册（预览渲染）
// ============================================================================

import { registerType } from "../../model/registry.js";
import { renderLine } from "../line.js";

registerType({ type: "line", render: renderLine });
