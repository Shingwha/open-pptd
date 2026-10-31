// ============================================================================
// renderer/types/line.js — line render shard (side-effect registration)
// ============================================================================

import { registerType } from "../../model/registry.js";
import { renderLine } from "../line.js";

registerType({ type: "line", render: renderLine });
