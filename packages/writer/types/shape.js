// ============================================================================
// writer/types/shape.js — shape toXml shard (side-effect registration)
// ============================================================================

import { registerType } from "../../model/registry.js";
import { shapeXml } from "../shape.js";

registerType({ type: "shape", toXml: shapeXml });
