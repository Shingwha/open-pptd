// export/report.js — ExportReport/CheckReport helpers and path utilities
// ExportReport: { ok, format, outPath?, pages?, checked:{fonts,icons,media}, fetched,
//   embedded, skipped, missing, warnings, errors }, plus additive optional fields:
//   check? (structured CheckReport), skippedIcons?, unsupported?, files?, artifacts?,
//   bytes? (total bytes written).
// issueLocation/formatIssue produce the CLI check wording (identical output in check/export).

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
