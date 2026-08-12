// ============================================================================
// tests/util/run.js — 子进程执行辅助（run-all 用）
// ============================================================================

import { spawn } from "node:child_process";
import { resolve } from "node:path";

/** 执行命令（shell），返回 { code, stdout, stderr }。 */
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
