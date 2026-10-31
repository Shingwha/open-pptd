// ============================================================================
// runtime/errors.js — unified runtime errors (contract: interfaces.md §14)
// ----------------------------------------------------------------------------
// Every public error carries a stable `code` string so JSON output can emit
// {ok:false,error:{code,message}} without string matching. The classes stay
// environment-free (no node:/DOM), usable from browser and Node callers.
//
//   RevisionConflictError  — write with a stale expectedRevision (never overwrite)
//   ResourceMissingError   — font/icon/image byte source exhausted
//   UnsupportedFormatError — image/export/serialization format not supported
// ============================================================================

/** Save conflict: the source changed since the caller read it. */
export class RevisionConflictError extends Error {
  /**
   * @param {string|null} currentRevision revision currently held by the source
   * @param {string|null} [expectedRevision] revision the caller based its write on
   */
  constructor(currentRevision, expectedRevision = null) {
    super(
      `项目已被修改（当前版本 ${currentRevision ?? "(未知)"}，期望版本 ${expectedRevision ?? "(未指定)"}），请重新加载后再保存`
    );
    this.name = "RevisionConflictError";
    this.code = "ERR_REVISION_CONFLICT";
    this.currentRevision = currentRevision ?? null;
    this.expectedRevision = expectedRevision ?? null;
  }
}

/** A font/icon/image resource could not be resolved anywhere in the provider chain. */
export class ResourceMissingError extends Error {
  /**
   * @param {"font"|"icon"|"image"} kind
   * @param {object|string} ref resource reference (FontRef / iconName / image src)
   */
  constructor(kind, ref) {
    const label = typeof ref === "string" ? ref : ref?.family || ref?.key || ref?.src || JSON.stringify(ref);
    super(`缺少${kind === "font" ? "字体" : kind === "icon" ? "图标" : "图片"}资源: ${label}`);
    this.name = "ResourceMissingError";
    this.code = "ERR_RESOURCE_MISSING";
    this.kind = kind;
    this.ref = ref;
  }
}

/** A resource/export/serialization format is not supported by the core. */
export class UnsupportedFormatError extends Error {
  /**
   * @param {string} format unsupported format id (e.g. "webp", "raw", "pptx")
   * @param {string} [detail] optional human detail
   */
  constructor(format, detail = "") {
    super(`不支持的格式: ${format}${detail ? `（${detail}）` : ""}`);
    this.name = "UnsupportedFormatError";
    this.code = "ERR_UNSUPPORTED_FORMAT";
    this.format = format;
  }
}

/**
 * Revision-conflict gate shared by every writable source.
 * A null/undefined expectedRevision means "unconditional write".
 * @param {string|null} currentRevision
 * @param {string|null|undefined} expectedRevision
 * @returns {void}
 */
export function assertRevision(currentRevision, expectedRevision) {
  if (expectedRevision == null) return;
  if (String(expectedRevision) !== String(currentRevision ?? "")) {
    throw new RevisionConflictError(currentRevision, expectedRevision);
  }
}

/**
 * Strict resource accessor for export/service paths: null/undefined -> throw.
 * @template T
 * @param {T|null|undefined} value
 * @param {"font"|"icon"|"image"} kind
 * @param {object|string} ref
 * @returns {T}
 */
export function requireResource(value, kind, ref) {
  if (value == null) throw new ResourceMissingError(kind, ref);
  return value;
}
