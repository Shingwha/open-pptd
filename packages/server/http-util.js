// server/http-util.js — shared Node HTTP helpers for the local API endpoints
// One implementation of the loopback guard, JSON response/error shaping and capped body
// readers used by /api/{save,export-image,themes,fonts}:
//   sendJson/sendError  JSON responses (no-store; optional extra headers)
//   readJsonBody        JSON body (drains past the cap so a 413 can still be sent)
//   readBody            raw UTF-8 body (aborts the request when over the cap)

/** Loopback check for the local-only library APIs. */
export function isLoopback(req) {
  const addr = req.socket?.remoteAddress || "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

export function sendJson(res, status, payload, extraHeaders = {}) {
  if (res.writableEnded) return;
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders });
  res.end(JSON.stringify(payload));
}

export function sendError(res, status, code, message) {
  sendJson(res, status, { ok: false, error: { code, message } });
}

/**
 * Read a JSON body (empty body → {}). Over the cap the request keeps draining so
 * the caller can still answer 413; malformed JSON → ERR_INVALID_JSON.
 */
export function readJsonBody(req, limit) {
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

/**
 * Read a raw UTF-8 body, aborting the request when over `limit`. `status` (when
 * given) is attached to the rejection so callers can keep their status code.
 */
export function readBody(req, { limit, status } = {}) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        req.destroy();
        const err = new Error(`请求体过大（>${(limit / 1024 / 1024) | 0}MB）`);
        if (status) err.status = status;
        reject(err);
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
