// ============================================================================
// server/themes.js — /api/themes (local theme library API, Node-only)
// ----------------------------------------------------------------------------
//   GET    /api/themes                 list built-in + user themes
//   GET    /api/themes?id=<id>         read one theme; &export=1 returns JSON text
//   POST   /api/themes                 save {theme} | import {action:"import",json}
//                                      | export {action:"export",id}
//   PUT    /api/themes?id=<id>         save (id from query when the body has none)
//   DELETE /api/themes?id=<id>         delete a user theme (built-ins are read-only)
//
// Security: loopback-only, JSON body limit, ids validated by the store before any
// path is built; every error is JSON {ok:false,error:{code,message}}.
// ============================================================================

import { ThemeError } from "../model/theme-library.js";
import { createFileThemeStore } from "./theme-store.js";

const MAX_BODY = 1024 * 1024;

function isLoopback(req) {
  const addr = req.socket?.remoteAddress || "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

function sendJson(res, status, payload, extraHeaders = {}) {
  if (res.writableEnded) return;
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders });
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

function statusOf(err) {
  if (Number.isInteger(err?.status)) return err.status;
  switch (err?.code) {
    case "ERR_THEME_INVALID":
    case "ERR_THEME_ID":
    case "ERR_INVALID_JSON":
      return 400;
    case "ERR_BODY_TOO_LARGE":
      return 413;
    case "ERR_THEME_NOT_FOUND":
      return 404;
    case "ERR_THEME_BUILTIN_READONLY":
      return 403;
    case "ERR_THEME_STORE":
      return 500;
    default:
      return 500;
  }
}

/**
 * Handle /api/themes. Never throws (all failures become JSON errors).
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {URL} url
 * @param {{store?:object}} [options]
 */
export async function handleThemes(req, res, url, { store = null } = {}) {
  try {
    if (!isLoopback(req)) return sendError(res, 403, "ERR_FORBIDDEN", "主题库 API 仅允许本机 loopback 访问");
    const themes = store || createFileThemeStore();
    const method = String(req.method || "GET").toUpperCase();

    if (method === "GET") {
      const id = url.searchParams.get("id");
      if (id) {
        const theme = await themes.read(id);
        if (!theme) throw new ThemeError("ERR_THEME_NOT_FOUND", `主题不存在: ${id}`, { id });
        if (url.searchParams.get("export") === "1" || url.searchParams.get("format") === "json") {
          return sendJson(res, 200, { ok: true, id, json: await themes.export(id) });
        }
        return sendJson(res, 200, { ok: true, theme });
      }
      const list = await themes.list();
      const builtin = list.filter((t) => t.builtin).length;
      return sendJson(res, 200, { ok: true, themes: list, counts: { builtin, user: list.length - builtin } });
    }

    if (method === "POST") {
      const body = await readJsonBody(req, MAX_BODY);
      if (body.action === "import") {
        const input = body.json ?? body.theme ?? body;
        const originalId = typeof input === "object" && input ? input.id : null;
        const theme = await themes.import(input);
        return sendJson(res, 200, { ok: true, theme, renamed: !!originalId && theme.id !== originalId });
      }
      if (body.action === "export") {
        const id = body.id;
        if (!id) throw new ThemeError("ERR_THEME_ID", "export 需要 id");
        return sendJson(res, 200, { ok: true, id, json: await themes.export(id) });
      }
      const theme = await themes.save(body.theme ?? body);
      return sendJson(res, 200, { ok: true, theme });
    }

    if (method === "PUT") {
      const body = await readJsonBody(req, MAX_BODY);
      let input = body.theme ?? body;
      const id = url.searchParams.get("id");
      if (id && input && typeof input === "object" && !input.id) input = { ...input, id };
      const theme = await themes.save(input);
      return sendJson(res, 200, { ok: true, theme });
    }

    if (method === "DELETE") {
      let id = url.searchParams.get("id");
      if (!id) {
        const body = await readJsonBody(req, MAX_BODY);
        id = body.id || null;
      }
      if (!id) throw new ThemeError("ERR_THEME_ID", "DELETE 需要 id");
      await themes.remove(id);
      return sendJson(res, 200, { ok: true, id });
    }

    return sendJson(res, 405, { ok: false, error: { code: "ERR_METHOD", message: `不支持的方法: ${method}` } }, { Allow: "GET, POST, PUT, DELETE" });
  } catch (err) {
    sendError(res, statusOf(err), err?.code || "ERR_INTERNAL", err?.message || String(err));
  }
}
