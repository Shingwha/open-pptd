// export/bundle.js — project bundle format router (ZipWriter, snapshot | raw)
// snapshot: runtime serialization (model serializeDeck) + project media; identical to
//           the editor "export project bundle" semantics.
// raw:      verbatim manifest/page texts + media bytes (Node disk source).
// This module only packs the FileBundle; page-model logic stays in runtime.

import { ZipWriter, safeFileName } from "../writer/index.js";
import { serializeProject } from "../runtime/index.js";
import { UnsupportedFormatError } from "../runtime/errors.js";
import { collectImageSrcs } from "../model/walk.js";
import { ExportError, EXPORT_ERRORS } from "./errors.js";
import { joinPath } from "./report.js";

/**
 * @param {object} ctx {project, deck, options, env, report}
 */
export async function exportBundle(ctx) {
  const { project, deck, options, env, report } = ctx;
  const mode = options.bundleMode === undefined ? "snapshot" : options.bundleMode;
  if (mode !== "snapshot" && mode !== "raw") {
    throw new ExportError(EXPORT_ERRORS.INVALID_OPTION, `bundleMode 仅支持 snapshot|raw（当前 ${mode}）`);
  }
  if (mode === "raw" && options.theme) {
    report.warnings.push("[bundle] raw 模式保留磁盘原文，theme override 不生效");
  }

  let bundle;
  try {
    bundle = serializeProject(project, { mode });
  } catch (err) {
    if (err instanceof UnsupportedFormatError) {
      throw new ExportError(EXPORT_ERRORS.BUNDLE_RAW, err.message, { cause: err });
    }
    throw err;
  }

  const zip = new ZipWriter();
  const bundled = new Set();
  for (const file of bundle.files) {
    bundled.add(file.path);
    if (typeof file.text === "string") zip.add(file.path, file.text);
    else if (file.bytes instanceof Uint8Array) zip.add(file.path, file.bytes);
    else throw new ExportError(EXPORT_ERRORS.EXPORT, `bundle 文件缺少内容: ${file.path}`);
  }
  // CLI convention: referenced images missing on disk are skipped, never fatal.
  for (const src of collectImageSrcs(deck.pages)) {
    if (typeof src !== "string" || !src || src.startsWith("data:") || /^https?:/i.test(src)) continue;
    if (!bundled.has(src)) report.warnings.push(`[export-project] 图片缺失，已跳过: ${src}`);
  }
  const bytes = zip.build();

  const outPath =
    options.outPath ||
    joinPath(project.baseDir || ".", `${safeFileName(deck.title || "deck")}-project.zip`);
  const sink = env.sink;
  if (typeof sink?.writeFile === "function") {
    await sink.writeFile(outPath, bytes);
  } else {
    report.artifacts = [{ name: outPath, bytes }];
  }

  report.outPath = outPath;
  report.files = [outPath];
  report.bytes = bytes.length;
}
