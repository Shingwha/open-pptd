// ============================================================================
// writer/types/image.js — image toXml shard (side-effect registration)
// ============================================================================

import { registerType } from "../../model/registry.js";
import { imageXml } from "../image.js";

registerType({ type: "image", toXml: imageXml });
