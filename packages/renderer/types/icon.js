// ============================================================================
// renderer/types/icon.js — icon render shard (side-effect registration)
// ============================================================================

import { registerType } from "../../model/registry.js";
import { renderIcon } from "../icon.js";

registerType({ type: "icon", render: renderIcon });
