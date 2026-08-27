// ============================================================================
// renderer/headless/cdp.js — CDP 客户端（仅 Node 端使用）
// ----------------------------------------------------------------------------
// 基于 MiniWebSocket 的 Chrome DevTools Protocol 最小客户端：
// 方法调用（id 配对）、Runtime.evaluate 助手、/json 目标发现、渲染就绪轮询。
// http.get 默认无 keep-alive，响应读完连接即关，句柄完全可控。
// ============================================================================

import { get as httpGet } from "node:http";
import { MiniWebSocket } from "./ws.js";

export const READY_TITLE = "PPTD_READY";
export const ERROR_TITLE = "PPTD_ERROR";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    // 必须在 promise 完成时 clearTimeout，否则定时器会一直挂在事件循环上阻塞进程退出
    const timer = setTimeout(() => reject(new Error(`${label}超时（${ms}ms）`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/** http.get 取 JSON（默认无 keep-alive，响应读完连接即关；2s 超时）。 */
function httpGetJson(port, path) {
  return new Promise((resolveJson, reject) => {
    const req = httpGet({ host: "127.0.0.1", port, path }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolveJson(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(2000, () => req.destroy(new Error("连接调试端口超时")));
  });
}

function createCdp(ws) {
  let msgId = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  // 连接关闭（浏览器退出等）：settle 所有未完成请求，避免 await 永久挂起
  ws.onclose = () => {
    const err = new Error("CDP 连接已关闭");
    for (const res of pending.values()) res({ error: err });
    pending.clear();
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      const id = ++msgId;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    }).then((msg) => {
      if (msg.error) throw new Error(`CDP ${method} 失败: ${msg.error.message || JSON.stringify(msg.error)}`);
      return msg;
    });
  const evalJs = async (expression, timeoutMs = 0) => {
    const run = send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }).then((msg) => {
      const r = msg.result;
      if (r?.exceptionDetails) {
        throw new Error("页面执行出错: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      }
      return r?.result?.value;
    });
    return timeoutMs ? withTimeout(run, timeoutMs, "页面执行") : run;
  };
  return { send, evalJs, close: () => ws.close() };
}

/** 发现调试端口上的 page 目标并建立 CDP 会话。 */
export async function connectCdp(dbgPort, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let target = null;
  while (Date.now() < deadline) {
    try {
      const list = await httpGetJson(dbgPort, "/json");
      target = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (target) break;
    } catch {}
    await sleep(200);
  }
  if (!target) throw new Error("无法连接浏览器调试端口（浏览器未启动？）");

  const ws = new MiniWebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error("WebSocket 连接失败"));
  });
  return createCdp(ws);
}

/** 轮询 document.title 直到渲染就绪（或初始化失败）。 */
export async function waitReady(cdp, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let title = "";
    try {
      title = await cdp.evalJs("document.title");
    } catch {
      title = "";
    }
    if (title === READY_TITLE) return;
    if (title === ERROR_TITLE) throw new Error("页面初始化失败（shot 模式报错，见浏览器控制台）");
    await sleep(150);
  }
  throw new Error(`等待渲染就绪超时（${timeoutMs}ms）`);
}

export { sleep };
