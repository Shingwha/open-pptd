// ============================================================================
// renderer/types/text.js — text render shard (side-effect registration)
// ----------------------------------------------------------------------------
// Loaded statically by types/index.js and lazily by types/load.js (./<id>.js
// convention). Module cache makes double registration a no-op.
// ============================================================================

import { registerType } from "../../model/registry.js";
import { renderText } from "../text.js";

registerType({ type: "text", render: renderText });
