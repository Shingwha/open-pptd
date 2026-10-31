// ============================================================================
// export/errors.js — ExportService error type and stable codes
// ----------------------------------------------------------------------------
// Every failure the service raises (as opposed to a check result in the report)
// carries a stable `code` so CLI/hosts can emit {ok:false,error:{code,message}}
// without string matching (same convention as runtime/errors.js).
// ============================================================================

/** Error codes used by ExportService. */
export const EXPORT_ERRORS = {
  INVALID_FORMAT: "ERR_INVALID_FORMAT",
  INVALID_OPTION: "ERR_INVALID_OPTION",
  NO_RESOURCES: "ERR_NO_RESOURCES",
  NO_RENDER_BACKEND: "ERR_NO_RENDER_BACKEND",
  RENDER_BACKEND: "ERR_RENDER_BACKEND",
  UNSUPPORTED_BACKEND: "ERR_UNSUPPORTED_BACKEND",
  PAGES: "ERR_PAGES",
  BUNDLE_RAW: "ERR_BUNDLE_RAW",
  EXPORT: "ERR_EXPORT",
};

/** A typed ExportService failure. `details` is optional structured context. */
export class ExportError extends Error {
  /**
   * @param {string} code one of EXPORT_ERRORS values
   * @param {string} message human-readable message
   * @param {{cause?: Error, details?: object}} [options]
   */
  constructor(code, message, { cause, details } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "ExportError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
