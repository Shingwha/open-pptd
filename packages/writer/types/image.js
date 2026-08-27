// ============================================================================
// writer/types/image.js — image 类型 toXml 分片注册（OOXML 导出）
// ============================================================================

import { registerType } from "../../model/registry.js";
import { imageXml } from "../image.js";

registerType({ type: "image", toXml: imageXml });
