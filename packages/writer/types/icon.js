// ============================================================================
// writer/types/icon.js — icon 类型 toXml 分片注册（OOXML 导出）
// ============================================================================

import { registerType } from "../../model/registry.js";
import { iconXml } from "../icon.js";

registerType({ type: "icon", toXml: iconXml });
