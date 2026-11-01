// cli/index.js — packages/cli package barrel (Contract 3.0 entry open-pptd/cli)
// Node-only programmatic surface: exactly the five command entry points
// runOpen / runBuild / runCheck / runAssets / runDoctor.
// Lower-level adapters (buildDeck, checkDeck, project/resources helpers) live in their
// modules and are imported directly by tests; bin.js dispatches to these same functions.

export { runOpen } from "./open.js";
export { runBuild } from "./build.js";
export { runCheck } from "./check.js";
export { runAssets } from "./assets.js";
export { runDoctor } from "./doctor.js";
