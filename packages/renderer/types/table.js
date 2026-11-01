// renderer/types/table.js — table render shard (side-effect registration)

import { registerType } from "../../model/registry.js";
import { renderTable } from "../table.js";

registerType({ type: "table", render: renderTable });
