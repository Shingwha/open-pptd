// renderer/types/shape.js — shape render shard (side-effect registration)

import { registerType } from "../../model/registry.js";
import { renderShape } from "../shape.js";

registerType({ type: "shape", render: renderShape });
