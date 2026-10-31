// ============================================================================
// writer/types/line.js — line toXml shard (side-effect registration)
// ============================================================================

import { registerType } from "../../model/registry.js";
import { lineXml } from "../line.js";

registerType({ type: "line", toXml: lineXml });
