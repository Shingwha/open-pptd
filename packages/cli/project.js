// cli/project.js — Node project adapter shared by build / check / resources
// One place that turns a manifest path into the runtime Project + ResourceProvider:
//   loadProjectFiles(manifest)  sync read (regression helpers use this shape)
//   prepareProject(manifest)    async read with media bytes (export path)
//   captureSink()               file sink that also keeps the last bytes (tests/CLI)
// Runtime owns parsing/resolution; this file only does Node disk IO.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createDiskProjectSource, createFsResourceProvider } from "../server/runtime-node.js";
import { createProject } from "../runtime/index.js";

/**
 * Read the manifest plus all page files (shared by regression/layout consumers).
 * Delegates to the runtime disk source; returns the shape regression helpers expect.
 * @param {string} manifest .pptd file path
 * @returns {{ manifestText: string, manifestObj: object, deckDir: string, pageFiles: Map<string,string> }}
 */
export function loadProjectFiles(manifest) {
  const files = createDiskProjectSource(manifest).readSync();
  return {
    manifestText: files.manifestText,
    manifestObj: files.manifestObj,
    deckDir: dirname(manifest),
    pageFiles: files.pageFiles,
  };
}

/**
 * Runtime Project + fs/registry ResourceProvider for a manifest on disk.
 * @param {string} manifest
 * @returns {Promise<{project: object, resources: object, files: object}>}
 */
export async function prepareProject(manifest) {
  const source = createDiskProjectSource(manifest);
  const files = await source.read(); // media bytes for referenced images
  const project = createProject(files);
  const resources = createFsResourceProvider({ baseDir: files.baseDir });
  return { project, resources, files };
}

/**
 * File sink for ExportService that creates parent dirs and remembers the last bytes.
 * @returns {{sink:{writeFile:Function}, bytes:()=>Uint8Array|null}}
 */
export function captureSink() {
  let last = null;
  return {
    sink: {
      writeFile(path, data) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, data);
        last = data;
      },
    },
    bytes: () => last,
  };
}
