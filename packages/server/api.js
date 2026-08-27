// ============================================================================
// server/api.js — 写回与探活 API
// ----------------------------------------------------------------------------
//   POST /api/save  浏览器保存 → 写磁盘（仅 --project 挂载时可用）
//   GET  /api/ping  探活（本地 serve 独有，GitHub Pages 上 404）——画廊据此
//                   区分本地/线上模式
// ============================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { join, normalize, sep, dirname } from "node:path";

/**
 * 写回 API：body 为 { path, content } 单文件或 { files: [...] } 批量；
 * 图片条目为 { path, b64 }（persistDataUrlImages 产物）：base64 按二进制写。
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

/** 探活 API。 */
export function handlePing(res) {
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, mode: "local" }));
}
