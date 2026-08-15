// ============================================================================
// app/project/handle-io.js — 本地项目句柄读写（File System Access API）
// ----------------------------------------------------------------------------
// 「打开本地项目」用官方 showDirectoryPicker() 调起系统文件夹选择框，
// 拿到 DirectoryHandle 后浏览器直接读写项目文件，全程不需要磁盘路径
// （网页拿不到绝对路径是浏览器安全模型，句柄即授权）。
// 最近项目句柄的持久化见 handle-store.js（IndexedDB）。
// 所有函数只依赖句柄接口（getFileHandle/getDirectoryHandle/getFile/
// createWritable/queryPermission），Node 测试用 mock 句柄即可覆盖。
// ============================================================================

import * as yaml from "../../vendor/js-yaml.mjs";

/** 调起系统文件夹选择框（需用户手势）。取消返回 null。 */
export async function pickProjectFolder() {
  if (!window.showDirectoryPicker) throw new Error("当前浏览器不支持文件夹选择（需 Chrome/Edge）");
  try {
    return await window.showDirectoryPicker({ id: "open-pptd-project", mode: "readwrite", startIn: "documents" });
  } catch (err) {
    if (err?.name === "AbortError") return null; // 用户取消
    throw err;
  }
}

/** 确保句柄有读写权限（requestPermission 需用户手势）。 */
export async function ensurePermission(handle) {
  if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") return true;
  return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
}

/** 相对路径 → 文件句柄（逐级进入子目录，目录不存在时可选创建）。 */
async function fileHandleAt(dirHandle, relPath, { create = false } = {}) {
  const parts = relPath.split("/").filter(Boolean);
  let dir = dirHandle;
  for (const seg of parts.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(seg, { create });
  }
  return dir.getFileHandle(parts[parts.length - 1], { create });
}

/** 读单个文件文本；不存在返回 null。 */
async function readText(dirHandle, relPath) {
  try {
    const fh = await fileHandleAt(dirHandle, relPath);
    return await (await fh.getFile()).text();
  } catch (err) {
    if (err?.name === "NotFoundError" || err?.code === 8) return null;
    throw err;
  }
}

/** 句柄下是否有 deck.pptd（画廊侧轻校验，选错文件夹就地提示，不跳编辑器）。 */
export async function hasDeck(dirHandle) {
  return (await readText(dirHandle, "deck.pptd")) != null;
}

/**
 * 经句柄读整个项目（manifest + pages/*.page），契约同 project-cache 的
 * fetchProjectTexts：页面缺失计入 missing（Agent 写入中「有一页显示一页」）。
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

/** 项目内相对路径图片 → dataURL（图片预读走句柄，不经 HTTP）。 */
export async function readImageAsDataUrl(dirHandle, src, mime) {
  try {
    const fh = await fileHandleAt(dirHandle, src);
    const buf = await (await fh.getFile()).arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return `data:${mime};base64,${btoa(bin)}`;
  } catch {
    return null; // 渲染层有占位提示
  }
}

/** base64 → Uint8Array（媒体文件落盘用）。 */
function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** 批量写文件（{path, content|b64}，自动建子目录）→ 写入数。 */
export async function writeFiles(dirHandle, files) {
  let count = 0;
  for (const f of files) {
    const fh = await fileHandleAt(dirHandle, f.path, { create: true });
    const writable = await fh.createWritable();
    await writable.write(f.b64 ? b64ToBytes(f.b64) : String(f.content ?? ""));
    await writable.close();
    count += 1;
  }
  return count;
}

/**
 * 指纹：manifest + manifest 列出的全部页面文件的 lastModified/size
 * （实时刷新轮询用，语义同服务端 dirFingerprint——文本文件是外部写入主体）。
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
