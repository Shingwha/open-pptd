// ============================================================================
// writer/types/line.js — line 类型 toXml 分片注册（OOXML 导出）
// ============================================================================

import { registerType } from "../../model/registry.js";
import { lineXml } from "../line.js";

registerType({ type: "line", toXml: lineXml });
