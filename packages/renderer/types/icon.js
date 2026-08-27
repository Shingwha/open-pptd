// ============================================================================
// renderer/types/icon.js — icon 类型 render 分片注册（预览渲染）
// ============================================================================

import { registerType } from "../../model/registry.js";
import { renderIcon } from "../icon.js";

registerType({ type: "icon", render: renderIcon });
