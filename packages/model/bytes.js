// ============================================================================
// model/bytes.js — sole byte codec (base64 / UTF-8, browser + Node)
// ----------------------------------------------------------------------------
// Browsers use native atob/btoa/TextEncoder; Node falls back to Buffer. No
// environment global is touched at module scope: model/writer/renderer/editor/CLI
// all funnel through here (v3 #2).
// ============================================================================

/** Uint8Array -> base64 (chunked concat avoids stack overflow). */
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

/** base64 -> Uint8Array. */
export function base64ToBytes(b64) {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(b64, "base64")); // Node
}

/** String -> UTF-8 bytes. */
export function encodeUtf8(str) {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
  return Buffer.from(str, "utf8"); // Node
}

