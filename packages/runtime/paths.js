// runtime/paths.js — environment-free path helpers (internal)
// The runtime package may not import node:path (dual-end, dep-graph enforced), but
// project paths are slash-separated project-relative strings on both ends. These
// helpers normalize Windows separators and never touch the filesystem.

/** Backslashes -> slashes (project paths are always stored slash-separated). */
export function normalizePath(path) {
  return String(path ?? "").replace(/\\/g, "/");
}

/** Last path segment ("pages/1.page" -> "1.page", "a\\b" -> "b"). */
export function basename(path) {
  const p = normalizePath(path).replace(/\/+$/, "");
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

/** Directory part ("pages/1.page" -> "pages", "deck.pptd" -> ""). */
export function dirname(path) {
  const p = normalizePath(path).replace(/\/+$/, "");
  const i = p.lastIndexOf("/");
  if (i < 0) return "";
  return p.slice(0, i) || "/";
}

/** Lowercase extension without the dot ("" when absent). */
export function extname(path) {
  const base = basename(path);
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}
