// ============================================================================
// server/api.js — write-back and liveness API
// ----------------------------------------------------------------------------
//   POST /api/save  browser save → disk (only with --project mount)
//   GET  /api/ping  liveness probe (local serve only, 404 on GitHub Pages) — the
//                   gallery uses it to tell local from online mode
// ============================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { join, normalize, sep, dirname } from "node:path";

/**
 * Write-back API: body is { path, content } for a single file or { files: [...] }
 * for a batch; image entries are { path, b64 } (persistDataUrlImages output):
 * base64 is written as binary.
 */
export function handleSave(req, res, projectRoot) {
  if (!projectRoot) {
    res.writeHead(404).end("not found");
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    try {
      const payload = JSON.parse(body || "{}");
      const files = payload.files || (payload.path ? [payload] : []);
      if (!files.length) {
        res.writeHead(400).end("empty");
        return;
      }
      let count = 0;
      for (const f of files) {
        const rel = String(f.path || "").replace(/^\//, "");
        const filePath = normalize(join(projectRoot, rel));
        if (filePath !== projectRoot && !filePath.startsWith(projectRoot + sep)) {
          res.writeHead(403).end(`path outside project: ${rel}`);
          return;
        }
        mkdirSync(dirname(filePath), { recursive: true });
        if (f.b64 != null) writeFileSync(filePath, Buffer.from(String(f.b64), "base64"));
        else writeFileSync(filePath, String(f.content ?? ""), "utf8");
        count += 1;
      }
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, count }));
    } catch (err) {
      res.writeHead(500).end(String(err?.message || err));
    }
  });
}

/** Liveness probe. */
export function handlePing(res) {
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, mode: "local" }));
}
