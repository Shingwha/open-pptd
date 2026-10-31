// ============================================================================
// export/report.js — ExportReport/CheckReport helpers and path utilities
// ----------------------------------------------------------------------------
// ExportReport (interfaces.md §5, frozen for W3 → W9/W10 reuse):
//   { ok, format, outPath?, pages?, checked:{fonts,icons,media}, fetched, embedded,
//     skipped, missing, warnings, errors }
// Extensions this wave adds (documented, additive):
//   check?          structured CheckReport (CLI formats warnings from it)
//   skippedIcons?   icon skips [{iconName, reason}]
//   unsupported?    runtime/unsupported diagnostics [{kind,ref,format}]
//   files?          written/artifact output paths (png multi-file)
//   artifacts?      [{name, bytes}] when no env.sink (in-memory hosts/tests)
//   bytes?          total bytes written (single artifact convenience)
//
// issueLocation/formatIssue mirror the historical CLI wording so `open-pptd check`
// and the export gate keep byte-identical human output.
// ============================================================================

/** "page N elementId" prefix used by CLI/check output (either part optional). */
export function issueLocation(issue) {
  return [issue?.page != null ? `第${issue.page}页` : null, issue?.elementId].filter(Boolean).join(" ");
}

/** One validation issue → "[rule] 第N页 id message" (no icon prefix). */
export function formatIssue(issue) {
  const at = issueLocation(issue);
  return `[${issue?.rule || "issue"}]${at ? ` ${at}` : ""} ${issue?.message || ""}`.trim();
}

/** Empty ExportReport for a format. */
export function createReport(format) {
  return {
    ok: true,
    format,
    checked: { fonts: 0, icons: 0, media: 0 },
    fetched: [],
    embedded: [],
    skipped: [],
    skippedIcons: [],
    missing: [],
    warnings: [],
    errors: [],
  };
}

/** Join with the separator style of the directory (Windows paths keep backslashes). */
export function joinPath(dir, name) {
  const base = dir == null ? "" : String(dir);
  if (!base || base === ".") return String(name);
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return `${base.replace(/[\\/]+$/, "")}${sep}${name}`;
}

/** Last path segment ("a/b/c.pptx" → "c.pptx"). */
export function basenamePath(path) {
  const s = String(path ?? "");
  const idx = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  return idx >= 0 ? s.slice(idx + 1) : s;
}

/** Drop the final extension ("deck.pptd" → "deck"). */
export function stripExt(name) {
  const base = basenamePath(name);
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(0, i) : base;
}
