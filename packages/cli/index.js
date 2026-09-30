// ============================================================================
// cli/index.js — packages/cli package barrel (contract entry open-pptd/cli)
// ----------------------------------------------------------------------------
// Exposes the cli/bin.js orchestration as a programmatic API (bin.js is still the
// only CLI entry; this file only re-exports the underlying implementations and
// duplicates no logic). Node-only: node:* / fs allowed.
//
// One difference from bin.js: bin.js holds EXAMPLES_DIR (<pkg>/examples) and passes
// it to runGallery; programmatic callers usually don't care about the in-package
// examples dir, so this file wraps runGallery with a default examplesDir (argument
// semantics unchanged, still overridable).
// ============================================================================

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runGallery as runGalleryImpl } from "./gallery.js";

export { runCheck } from "./check.js";
export { exportDeck, exportProject } from "./export.js";
export { runRender, renderDeck } from "./render.js";
export { runFonts } from "./fonts.js";
export { runIcons } from "./icons.js";
export { runDoctor, runPaths, collectDoctorFacts } from "./doctor.js";
export { runAssets, extractZipTo, readZipEntries } from "./assets.js";
export { runEnsure, collectRequirements, checkResources, ensureResources } from "./ensure.js";

const EXAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "examples");

/** gallery scan|list; examplesDir defaults to the in-package examples/ (bin.js's value). */
export function runGallery(args, examplesDir = EXAMPLES_DIR) {
  return runGalleryImpl(args, examplesDir);
}
