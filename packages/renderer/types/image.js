// ============================================================================
// renderer/types/image.js — image 类型 render 分片注册（预览渲染）
// ============================================================================

import { registerType } from "../../model/registry.js";
import { renderImage } from "../image.js";

registerType({ type: "image", render: renderImage });
