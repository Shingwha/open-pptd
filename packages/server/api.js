// server/api.js — write-back and liveness API (/api/save, /api/ping)
// POST /api/save writes only with --project mount; GET /api/ping is local-serve only.
// Batch body: { files:[{path,text}|{path,b64}|{path,content}], expectedRevision? }. Paths
// are validated before any write (traversal → 403); a stale expectedRevision returns 409
// ERR_REVISION_CONFLICT without writing. The batch is atomic: backup → same-dir tmp →
// rename (manifest last), with rollback on failure. Single-file bodies stay accepted.

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
import * as yaml from "../model/vendor/js-yaml.mjs";
import { projectRevision } from "../runtime/index.js";
import { readBody, sendJson as json } from "./http-util.js";

const MAX_BODY = 64 * 1024 * 1024; // 64MB (images are base64-inflated by ~33%)

/** Project-relative path → absolute, refusing escapes. */
function targetOf(projectRoot, rel) {
  const filePath = normalize(join(projectRoot, rel));
  if (filePath !== projectRoot && !filePath.startsWith(projectRoot + sep)) return null;
  return filePath;
}

/** Read the current manifest + listed pages from disk (the revision domain). */
function readDiskProject(projectRoot, manifestRel) {
  const manifestPath = targetOf(projectRoot, manifestRel);
  const pageFiles = new Map();
  let manifestText = "";
  if (!manifestPath) return { manifestText, pageFiles };
  try {
    manifestText = readFileSync(manifestPath, "utf8");
  } catch {
    return { manifestText, pageFiles };
  }
  let manifest = null;
  try {
    manifest = yaml.load(manifestText) || {};
  } catch {
    manifest = {};
  }
  for (const rel of manifest.pages || []) {
    const abs = targetOf(projectRoot, String(rel));
    if (!abs) continue;
    try {
      pageFiles.set(String(rel), readFileSync(abs, "utf8"));
    } catch {
      /* a page missing on disk is not part of the current revision */
    }
  }
  return { manifestText, pageFiles };
}

/** Normalize the body into unique write entries ({rel, abs, data}) and the manifest path. */
function normalizeEntries(projectRoot, files) {
  const entries = [];
  const seen = new Map();
  for (const f of files) {
    const rel = String(f?.path || "").replace(/^\/+/, "");
    if (!rel) throw Object.assign(new Error("文件路径不能为空"), { status: 400 });
    const abs = targetOf(projectRoot, rel);
    if (!abs) throw Object.assign(new Error(`path outside project: ${rel}`), { status: 403 });
    const data = f.b64 != null ? Buffer.from(String(f.b64), "base64") : Buffer.from(String(f.content ?? ""), "utf8");
    if (seen.has(rel)) {
      seen.get(rel).data = data;
      continue;
    }
    const entry = { rel, abs, data };
    seen.set(rel, entry);
    entries.push(entry);
  }
  return entries;
}

/**
 * Atomic batch write: backup → tmp writes → renames (manifest last) → rollback on
 * any failure. Returns the number of files written (throws otherwise).
 */
function writeBatch(entries, manifestRel) {
  const backups = entries.map((e) => {
    try {
      return { existed: true, bytes: readFileSync(e.abs) };
    } catch {
      return { existed: false };
    }
  });
  const tmpOf = (abs) => `${abs}.${process.pid.toString(36)}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.tmp`;
  const knownTmps = new Set();
  const renamed = [];
  try {
    // 1. materialize every new file next to its target (no target touched yet)
    for (const e of entries) {
      mkdirSync(dirname(e.abs), { recursive: true });
      const tmp = tmpOf(e.abs);
      knownTmps.add(tmp);
      writeFileSync(tmp, e.data);
      e.tmp = tmp;
    }
    // 2. rename non-manifest files first, the manifest last
    const manifestIndex = entries.findIndex((e) => e.rel === manifestRel);
    const order = entries.map((_, i) => i).filter((i) => i !== manifestIndex);
    if (manifestIndex >= 0) order.push(manifestIndex);
    for (const i of order) {
      renameSync(entries[i].tmp, entries[i].abs);
      knownTmps.delete(entries[i].tmp);
      renamed.push(i);
    }
    return entries.length;
  } catch (err) {
    // Roll back renamed targets (best effort), then drop leftover temp files.
    for (let k = renamed.length - 1; k >= 0; k--) {
      const i = renamed[k];
      try {
        if (backups[i].existed) writeFileSync(entries[i].abs, backups[i].bytes);
        else if (existsSync(entries[i].abs)) unlinkSync(entries[i].abs);
      } catch {
        /* rollback is best effort; the error below still reports the failure */
      }
    }
    for (const tmp of knownTmps) {
      try {
        if (existsSync(tmp)) unlinkSync(tmp);
      } catch {
        /* temp cleanup is best effort */
      }
    }
    throw err;
  }
}

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
  readBody(req, { limit: MAX_BODY, status: 413 }).then(
    (body) => {
      try {
        const payload = JSON.parse(body || "{}");
        const files = payload.files || (payload.path ? [payload] : []);
        if (!files.length) {
          json(res, 400, { ok: false, error: { code: "ERR_EMPTY_SAVE", message: "没有待保存的文件" } });
          return;
        }
        const entries = normalizeEntries(projectRoot, files);
        const manifestEntry = entries.find((e) => /\.pptd$/i.test(e.rel));
        const manifestRel = manifestEntry ? manifestEntry.rel : "deck.pptd";
        const currentRevision = projectRevision(readDiskProject(projectRoot, manifestRel));

        // ---- revision gate (all paths already validated; nothing written yet) ----
        const expectedRevision = payload.expectedRevision;
        if (expectedRevision != null && String(expectedRevision) !== currentRevision) {
          json(res, 409, {
            ok: false,
            error: {
              code: "ERR_REVISION_CONFLICT",
              message: "项目已被外部修改，保存已取消（重新加载或选择覆盖）",
              currentRevision,
              expectedRevision: String(expectedRevision),
            },
          });
          return;
        }

        writeBatch(entries, manifestRel);
        const revision = projectRevision(readDiskProject(projectRoot, manifestRel));
        json(res, 200, { ok: true, count: entries.length, revision });
      } catch (err) {
        const status = Number(err?.status) || 500;
        if (status === 403) {
          res.writeHead(403).end(String(err?.message || err));
          return;
        }
        json(res, status, { ok: false, error: { code: status === 400 ? "ERR_INVALID_SAVE" : "ERR_SAVE_FAILED", message: String(err?.message || err) } });
      }
    },
    (err) => {
      const status = Number(err?.status) || 500;
      json(res, status, { ok: false, error: { code: "ERR_SAVE_FAILED", message: String(err?.message || err) } });
    }
  );
}

/** Liveness probe. */
export function handlePing(res) {
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, mode: "local" }));
}
