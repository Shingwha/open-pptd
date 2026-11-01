// runtime/revision.js — stable project revision (pure JS, no node:crypto)
// ProjectSource.read() returns an opaque revision and write() checks it (expectedRevision)
// so external edits are never silently overwritten. The hash must run unchanged in Node
// and the browser, hence a hand-written FNV-1a pair instead of crypto.subtle/node:crypto.
// Scope: manifest text + every page path/text + every media path/byte digest. Fields are
// length-prefixed and sorted, so map insertion order never changes the result.

const encoder = new TextEncoder();

/** Two independent 32-bit FNV-1a lanes + a byte counter. */
class RevisionHasher {
  constructor() {
    this.h1 = 0x811c9dc5;
    this.h2 = 0x9747b28c;
    this.length = 0;
  }

  byte(b) {
    this.h1 = Math.imul(this.h1 ^ b, 0x01000193) >>> 0;
    this.h2 = Math.imul(this.h2 ^ b, 0x5bd1e995) >>> 0;
    this.length = (this.length + 1) >>> 0;
  }

  bytes(u8) {
    for (let i = 0; i < u8.length; i++) this.byte(u8[i]);
  }

  text(value) {
    this.bytes(encoder.encode(value));
  }

  /** Length-prefixed field header — prevents field-boundary ambiguity. */
  frame(tag, path, byteLength) {
    this.text(`\u0000${tag}\u0000${path}\u0000${byteLength}\u0000`);
  }

  finish() {
    const a = this.h1.toString(16).padStart(8, "0");
    const b = this.h2.toString(16).padStart(8, "0");
    return `rev-${this.length.toString(16)}-${a}${b}`;
  }
}

function entriesOf(value) {
  if (value == null) return [];
  if (value instanceof Map) return [...value.entries()];
  if (typeof value === "object") return Object.entries(value);
  return [];
}

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === "string") return encoder.encode(value);
  return encoder.encode(String(value ?? ""));
}

const byPath = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Stable revision of a project's text + media state.
 * @param {object} files ProjectFiles-like ({manifestText, pageFiles, media}); Map or plain object
 * @returns {string} opaque revision string
 */
export function projectRevision(files) {
  const h = new RevisionHasher();
  h.text("pptd-revision-v1");

  const manifestText = typeof files?.manifestText === "string" ? files.manifestText : "";
  const manifestBytes = encoder.encode(manifestText);
  h.frame("manifest", "", manifestBytes.length);
  h.bytes(manifestBytes);

  const pages = entriesOf(files?.pageFiles).sort(byPath);
  for (const [path, text] of pages) {
    const value = typeof text === "string" ? text : String(text ?? "");
    const bytes = encoder.encode(value);
    h.frame("page", String(path), bytes.length);
    h.bytes(bytes);
  }

  const media = entriesOf(files?.media).sort(byPath);
  for (const [path, value] of media) {
    const bytes = toBytes(value);
    h.frame("media", String(path), bytes.length);
    h.bytes(bytes);
  }

  return h.finish();
}
