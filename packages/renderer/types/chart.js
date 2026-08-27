// ============================================================================
// renderer/types/chart.js — chart 类型 render 分片注册（预览渲染）
// ============================================================================

import { registerType } from "../../model/registry.js";
import { renderChart } from "../chart.js";

registerType({ type: "chart", render: renderChart });
