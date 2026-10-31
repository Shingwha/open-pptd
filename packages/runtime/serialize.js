// ============================================================================
// runtime/serialize.js — Project -> FileBundle (snapshot | raw)
// ----------------------------------------------------------------------------
// snapshot: the model serializer (model/pptd-io serializeDeck) — canonical PPTD,
//           used by the editor "export project bundle" and every round-trip test.
// raw:      the exact manifest/page texts read by the source plus the media bytes
//           carried by the project — Node disk behavior, no re-serialization.
//           Browser sources may still call it when they kept original texts, but
//           the intended producer is the disk source (CLI bundle --raw, W3/W10).
//
// FileBundle: { files: SourceFile[], manifestName } (interfaces.md §4).
// ============================================================================

import { serializeDeck } from "../model/pptd-io.js";
import { UnsupportedFormatError } from "./errors.js";

/**
 * @typedef {Object} FileBundle
 * @property {Array<{path:string, text?:string, bytes?:Uint8Array}>} files
 * @property {string} manifestName
 */

/**
 * @param {import("./parse.js").Project} project
 * @param {{mode?: "snapshot"|"raw"}} [options]
 * @returns {FileBundle}
 */
export function serializeProject(project, { mode = "snapshot" } = {}) {
  if (!project || typeof project !== "object") throw new TypeError("serializeProject 需要 Project");
  const manifestName = project.manifestName || "deck.pptd";

  if (mode === "snapshot") {
    if (!project.deck || typeof project.deck !== "object") {
      throw new TypeError("serializeProject(snapshot) 需要 project.deck");
    }
    const files = serializeDeck(project.deck, { manifestName }).map(({ path, content }) => ({ path, text: content }));
    for (const [path, bytes] of project.media || []) files.push({ path, bytes });
    return { files, manifestName };
  }

  if (mode === "raw") {
    if (typeof project.manifestText !== "string" || !(project.pageFiles instanceof Map)) {
      throw new UnsupportedFormatError("raw", "raw 序列化需要 source 提供的原始文本（Node 磁盘源）");
    }
    const files = [{ path: manifestName, text: project.manifestText }];
    for (const [path, text] of project.pageFiles) files.push({ path, text });
    for (const [path, bytes] of project.media || []) files.push({ path, bytes });
    return { files, manifestName };
  }

  throw new UnsupportedFormatError(String(mode), "支持 snapshot / raw");
}
