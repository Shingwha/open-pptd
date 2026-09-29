// ============================================================================
// app/project/handle-io.js — local project handle IO (File System Access API)
// ----------------------------------------------------------------------------
// "Open local project" brings up the OS folder picker via showDirectoryPicker();
// once a DirectoryHandle is in hand the browser reads/writes the project files
// directly, with no disk path involved (web pages cannot obtain absolute paths —
// that is the browser security model; the handle is the grant). Recent-project
// handle persistence lives in handle-store.js (IndexedDB). Every function only
// depends on the handle interface (getFileHandle/getDirectoryHandle/getFile/
// createWritable/queryPermission), so Node tests can cover it with a mock handle.
// ============================================================================

import { base64ToBytes, yaml } from "../../../packages/model/index.js";
import { dataUrlOf } from "../../../packages/writer/index.js";

/** Bring up the OS folder picker (needs a user gesture). Returns null on cancel. */
export async function pickProjectFolder() {
  if (!window.showDirectoryPicker) throw new Error("当前浏览器不支持文件夹选择（需 Chrome/Edge）");
  try {
    return await window.showDirectoryPicker({ id: "open-pptd-project", mode: "readwrite", startIn: "documents" });
  } catch (err) {
    if (err?.name === "AbortError") return null; // user cancelled
    throw err;
  }
}

/** Ensure the handle has read/write permission (requestPermission needs a user gesture). */
export async function ensurePermission(handle) {
  if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") return true;
  return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
}

/** Relative path → file handle (descends segment by segment, optionally creating directories). */
async function fileHandleAt(dirHandle, relPath, { create = false } = {}) {
  const parts = relPath.split("/").filter(Boolean);
  let dir = dirHandle;
  for (const seg of parts.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(seg, { create });
  }
  return dir.getFileHandle(parts[parts.length - 1], { create });
}

/** Read a single text file; returns null when it does not exist. */
async function readText(dirHandle, relPath) {
  try {
    const fh = await fileHandleAt(dirHandle, relPath);
    return await (await fh.getFile()).text();
  } catch (err) {
    if (err?.name === "NotFoundError" || err?.code === 8) return null;
    throw err;
  }
}

/** Whether the handle has deck.pptd (gallery-side light check: wrong folder is flagged in place, no editor redirect). */
export async function hasDeck(dirHandle) {
  return (await readText(dirHandle, "deck.pptd")) != null;
}

/**
 * Read a whole project through the handle (manifest + pages/*.page), same contract
 * as project-cache's fetchProjectTexts: a missing page counts into `missing`
 * (Agent-mid-write "show each page as it lands").
 */
export async function readProject(dirHandle) {
  const manifestText = await readText(dirHandle, "deck.pptd");
  if (manifestText == null) throw new Error("所选文件夹里没有 deck.pptd（请选择 PPTD 项目文件夹）");
  const manifest = yaml.load(manifestText) || {};
  const pageTexts = new Map();
  let missing = 0;
  for (const rel of manifest.pages || []) {
    const text = await readText(dirHandle, rel);
    if (text == null) missing += 1;
    else pageTexts.set(rel, text);
  }
  return { manifestText, pageTexts, missing };
}

/** Project-relative image path → dataURL (image preload goes through the handle, not HTTP). */
export async function readImageAsDataUrl(dirHandle, src, mime) {
  try {
    const fh = await fileHandleAt(dirHandle, src);
    const buf = await (await fh.getFile()).arrayBuffer();
    return dataUrlOf(buf, mime);
  } catch {
    return null; // the render layer has a placeholder
  }
}

/** Batch-write files ({path, content|b64}, subdirectories auto-created) → write count. */
export async function writeFiles(dirHandle, files) {
  let count = 0;
  for (const f of files) {
    const fh = await fileHandleAt(dirHandle, f.path, { create: true });
    const writable = await fh.createWritable();
    await writable.write(f.b64 ? base64ToBytes(f.b64) : String(f.content ?? ""));
    await writable.close();
    count += 1;
  }
  return count;
}

/**
 * Fingerprint: lastModified/size of the manifest plus every page file it lists
 * (used by live-reload polling, same semantics as the server-side dirFingerprint —
 * text files are the main target of external writes).
 */
export async function fingerprint(dirHandle) {
  const manifestText = await readText(dirHandle, "deck.pptd");
  if (manifestText == null) return "no-deck";
  const manifest = yaml.load(manifestText) || {};
  const parts = ["deck"];
  for (const rel of manifest.pages || []) {
    try {
      const fh = await fileHandleAt(dirHandle, rel);
      const f = await fh.getFile();
      parts.push(`${rel}:${f.lastModified}:${f.size}`);
    } catch {
      parts.push(`${rel}:missing`);
    }
  }
  return parts.join("|");
}
