// ============================================================================
// writer/types/text.js — text 类型 toXml 分片注册（OOXML 导出）
// ============================================================================

import { registerType } from "../../model/registry.js";
import { textXml } from "../text.js";

registerType({ type: "text", toXml: textXml });
