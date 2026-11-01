// writer/types/table.js — table toXml shard (side-effect registration)

import { registerType } from "../../model/registry.js";
import { tableXml } from "../table.js";

registerType({ type: "table", toXml: tableXml });
