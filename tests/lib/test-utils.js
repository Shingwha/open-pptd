// ============================================================================
// tests/lib/test-utils.js — shared test assertions, temp dirs and tree walk
// ----------------------------------------------------------------------------
// One suite runs per process (run-all spawns each script), so a module-level
// results array is enough. Suites print their own summary from `results`.
// ============================================================================

import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Assertions collected by the current suite. */
export const results = [];

/** Record + print one assertion (PASS/FAIL and optional detail). */
export function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
  return pass;
}

/**
 * Equality assertion: primitives compare with Object.is, objects/arrays with
 * JSON serialization (same semantics the suites used locally).
 */
export function checkEq(name, actual, expected, detail = "") {
  const pass = Object.is(actual, expected) || stringify(actual) === stringify(expected);
  check(name, pass, pass ? "" : detail || `实际=${stringify(actual)} 期望=${stringify(expected)}`);
}

function stringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Await fn() and assert it rejects with an error whose code matches. */
export async function throwsCode(name, fn, code) {
  try {
    await fn();
    check(name, false, "未抛出");
  } catch (err) {
    check(name, err?.code === code, `${err?.code || err?.name}: ${err?.message}`);
  }
}

/** Create a temp dir, run fn(dir), then remove it (fn may be sync or async). */
export async function withTempDir(prefix, fn) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Recursively list files under dir (absolute paths). */
export function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
