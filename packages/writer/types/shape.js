// ============================================================================
// writer/types/shape.js — shape 类型 toXml 分片注册（OOXML 导出）
// ============================================================================

import { registerType } from "../../model/registry.js";
import { shapeXml } from "../shape.js";

registerType({ type: "shape", toXml: shapeXml });
