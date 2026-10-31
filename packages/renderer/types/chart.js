// ============================================================================
// renderer/types/chart.js — chart render shard (side-effect registration)
// ============================================================================

import { registerType } from "../../model/registry.js";
import { renderChart } from "../chart.js";

registerType({ type: "chart", render: renderChart });
