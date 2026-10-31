// ============================================================================
// cli/errors.js — coded CLI errors + stdout JSON helpers
// ----------------------------------------------------------------------------
// Every command reports failures (human stderr or `{ok:false,error:{code,message}}`
// on stdout with --json) and exits non-zero. Codes are stable strings consumed by
// agents/tests; messages stay human-facing.
// ============================================================================

/** Coded CLI error. */
export class CliError extends Error {
  /**
   * @param {string} code stable error code (ERR_*)
   * @param {string} message human-readable message
   */
  constructor(code, message) {
    super(message);
    this.name = "CliError";
    this.code = code;
  }
}

/** Write one JSON line to stdout (the only thing stdout ever carries with --json). */
export function jsonLine(payload) {
  process.stdout.write(JSON.stringify(payload) + "\n");
}

/** Emit an error in JSON (single line) or human (stderr) form. */
export function reportError(err, { json, log = (m) => console.error(m) } = {}) {
  if (json) jsonLine({ ok: false, error: { code: err?.code || "ERR_CLI", message: err?.message || String(err) } });
  else log(`✗ ${err?.message || err}`);
  process.exitCode = 1;
}
