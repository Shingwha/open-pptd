// ============================================================================
// renderer/types/image.js — image render shard (side-effect registration)
// ============================================================================

import { registerType } from "../../model/registry.js";
import { renderImage } from "../image.js";

registerType({ type: "image", render: renderImage });
