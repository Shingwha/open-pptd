// ============================================================================
// renderer/types/text.js — text 类型 render 分片注册（预览渲染）
// ============================================================================

import { registerType } from "../../model/registry.js";
import { renderText } from "../text.js";

registerType({ type: "text", render: renderText });
