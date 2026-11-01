// writer/types/icon.js — icon toXml shard (side-effect registration)

import { registerType } from "../../model/registry.js";
import { iconXml } from "../icon.js";

registerType({ type: "icon", toXml: iconXml });
