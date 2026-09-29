// ============================================================================
// tests/lib/run.js — subprocess helper for the regression runner
// ============================================================================

import { spawn } from "node:child_process";
import { resolve } from "node:path";

/** Run a shell command, resolve with { code, stdout, stderr }. */
export function run(cmd, { timeout = 300000 } = {}) {
  return new Promise((done) => {
    const child = spawn(cmd, { shell: true, cwd: resolve(".") });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code, stdout, stderr });
    });
  });
}
