// ============================================================================
// renderer/types/shape.js — shape 类型 render 分片注册（预览渲染）
// ============================================================================

import { registerType } from "../../model/registry.js";
import { renderShape } from "../shape.js";

registerType({ type: "shape", render: renderShape });
