// ============================================================================
// server/fonts.js — /api/fonts (local global font library API, Node-only)
// ----------------------------------------------------------------------------
//   GET    /api/fonts                    list built-in + user fonts
//   GET    /api/fonts?key=<key>          read one entry (also ?family=)
//   POST   /api/fonts                    import {base64|url, family, key, file, license, subset}
//   DELETE /api/fonts?key=<key>          remove a user font (built-ins/system are read-only)
//
// Security: loopback-only, JSON body limit, basename/safe-file validation in the
// library; all errors are JSON {ok:false,error:{code,message}}.
// ============================================================================

import { FontLibraryError } from "../model/font-library.js";
import { createFileFontLibrary } from "./font-library.js";

/** Base64 body limit (a 64 MB font is ~85 MB encoded). */
const MAX_BODY = 96 * 1024 * 1024;

function isLoopback(req) {
  const addr = req.socket?.remoteAddress || "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

function sendJson(res, status, payload) {
  if (res.writableEnded) return;
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, code, message) {
  sendJson(res, status, { ok: false, error: { code, message } });
}

function readJsonBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    let done = false;
    req.on("data", (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0; // stop buffering; keep draining so a 413 response can still be sent
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (done) return;
      done = true;
      if (tooLarge) {
        reject(Object.assign(new Error(`请求体超过上限 ${limit} 字节`), { code: "ERR_BODY_TOO_LARGE", status: 413 }));
        return;
      }
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text.trim()) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch (err) {
        reject(Object.assign(new Error(`JSON 解析失败: ${err.message}`), { code: "ERR_INVALID_JSON", status: 400 }));
      }
    });
    req.on("error", (err) => {
      if (done) return;
      done = true;
      reject(Object.assign(err, { code: "ERR_INVALID_JSON", status: 400 }));
    });
  });
}

function decodeBase64(text) {
  const clean = String(text || "").replace(/\s+/g, "");
  if (!clean || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
    throw new FontLibraryError("ERR_FONT_INVALID", "字体 base64 内容不合法");
  }
  const buf = Buffer.from(clean, "base64");
  if (!buf.length) throw new FontLibraryError("ERR_FONT_INVALID", "字体 base64 解码后为空");
  return new Uint8Array(buf);
}

function statusOf(err) {
  if (Number.isInteger(err?.status)) return err.status;
  switch (err?.code) {
    case "ERR_FONT_INVALID":
    case "ERR_INVALID_JSON":
      return 400;
    case "ERR_BODY_TOO_LARGE":
      return 413;
    case "ERR_FONT_NOT_FOUND":
      return 404;
    case "ERR_FONT_BUILTIN_READONLY":
      return 403;
    case "ERR_FONT_FETCH":
      return 502;
    default:
      return 500;
  }
}

/**
 * Handle /api/fonts. Never throws (all failures become JSON errors).
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {URL} url
 * @param {{library?:object}} [options]
 */
export async function handleFonts(req, res, url, { library = null } = {}) {
  try {
    if (!isLoopback(req)) return sendError(res, 403, "ERR_FORBIDDEN", "字体库 API 仅允许本机 loopback 访问");
    const fonts = library || createFileFontLibrary();
    const method = String(req.method || "GET").toUpperCase();

    if (method === "GET") {
      const key = url.searchParams.get("key");
      const family = url.searchParams.get("family");
      if (key || family) {
        const font = await fonts.resolve(key ? { key, family } : family);
        if (!font) throw new FontLibraryError("ERR_FONT_NOT_FOUND", `字体不存在: ${key || family}`);
        return sendJson(res, 200, { ok: true, font });
      }
      const includeSystem = /^(1|true|yes)$/i.test(url.searchParams.get("includeSystem") || "");
      const list = await fonts.list({ includeSystem });
      const counts = { builtin: 0, user: 0, system: 0 };
      for (const f of list) {
        if (f.source === "system") counts.system += 1;
        else if (f.source === "builtin") counts.builtin += 1;
        else counts.user += 1;
      }
      return sendJson(res, 200, { ok: true, fonts: list, counts });
    }

    if (method === "POST") {
      const body = await readJsonBody(req, MAX_BODY);
      const meta = {
        family: typeof body.family === "string" ? body.family : undefined,
        key: typeof body.key === "string" ? body.key : undefined,
        file: typeof body.file === "string" ? body.file : undefined,
        license: typeof body.license === "string" ? body.license : undefined,
        subset: body.subset,
      };
      let font;
      if (body.base64) font = await fonts.importFile(decodeBase64(body.base64), meta);
      else if (body.url) font = await fonts.importUrl(body.url, meta);
      else throw new FontLibraryError("ERR_FONT_INVALID", "POST /api/fonts 需要 base64 或 url");
      return sendJson(res, 200, { ok: true, font });
    }

    if (method === "DELETE") {
      let key = url.searchParams.get("key");
      let family = url.searchParams.get("family");
      if (!key && !family) {
        const body = await readJsonBody(req, MAX_BODY);
        key = body.key || null;
        family = body.family || null;
      }
      if (!key && !family) throw new FontLibraryError("ERR_FONT_NOT_FOUND", "DELETE 需要 key 或 family");
      const entry = await fonts.resolve(key ? { key, family } : family);
      if (!entry) throw new FontLibraryError("ERR_FONT_NOT_FOUND", `字体不存在: ${key || family}`);
      if (entry.source !== "user" && entry.source !== "url") {
        throw new FontLibraryError("ERR_FONT_BUILTIN_READONLY", `字体 ${entry.family} 来自${entry.source === "system" ? "系统" : "内置库"}，不能删除`, { key: entry.key });
      }
      await fonts.remove(entry);
      return sendJson(res, 200, {
        ok: true,
        key: entry.key,
        family: entry.family,
        warning: "已删除用户字体；引用该字体的项目会显示缺失（未扫描项目）",
      });
    }

    return sendJson(res, 405, { ok: false, error: { code: "ERR_METHOD", message: `不支持的方法: ${method}` } });
  } catch (err) {
    sendError(res, statusOf(err), err?.code || "ERR_INTERNAL", err?.message || String(err));
  }
}
