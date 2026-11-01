// writer/types/text.js — text toXml shard (side-effect registration)
// Loaded statically by types/index.js and lazily by types/load.js (./<id>.js convention);
// the module cache makes double registration a no-op.

import { registerType } from "../../model/registry.js";
import { textXml } from "../text.js";

registerType({ type: "text", toXml: textXml });
