// ============================================================================
// model/bytes.js — 字节编解码唯一实现（base64 / UTF-8，双端可用）
// ----------------------------------------------------------------------------
// 浏览器优先用原生 atob/btoa/TextEncoder，Node 回退 Buffer；不引用任何环境
// 全局的模块级副作用，model/writer/renderer/editor/CLI 全部经此收口（v3 #2）。
// ============================================================================

/** Uint8Array → base64（分块拼接防栈溢出）。 */
export function bytesToBase64(bytes) {
  if (typeof btoa === "function") {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  return Buffer.from(bytes).toString("base64"); // Node
}

/** base64 → Uint8Array。 */
export function base64ToBytes(b64) {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(b64, "base64")); // Node
}

/** 字符串 → UTF-8 字节。 */
export function encodeUtf8(str) {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
  return Buffer.from(str, "utf8"); // Node
}

