// ============================================================================
// renderer/headless/cdp.js — CDP client (Node-only)
// ----------------------------------------------------------------------------
// Minimal Chrome DevTools Protocol client over MiniWebSocket: method calls (id pairing),
// event dispatch, a Runtime.evaluate helper, /json target discovery, and render-ready
// signalling (Runtime.addBinding event push, no polling). http.get uses no keep-alive by
// default, so the connection closes once the response is read and handles stay controllable.
// ============================================================================

import { get as httpGet } from "node:http";
import { MiniWebSocket } from "./ws.js";

/** The page signals paint completion by calling this CDP binding name (agreed name with editor/app/shot.js). */
export const READY_BINDING = "pptdReady";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    // Must clearTimeout when the promise settles, otherwise the timer stays on the event loop and blocks process exit
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

/** http.get JSON (no keep-alive by default; the connection closes after the response; 2s timeout). */
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
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
      return;
    }
    // No id = a CDP event (Runtime.bindingCalled etc.) → dispatch to subscribers
    if (msg.method) for (const l of [...listeners]) l(msg);
  };
  // Connection closed (browser exit etc.): settle all pending requests so no await hangs forever
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
  /** Subscribe to CDP events (returns an unsubscribe function). */
  const onEvent = (cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  };
  /** Wait for one CDP event matching the predicate (one-shot; the caller's withTimeout handles the timeout). */
  const waitEvent = (method, pred = null) =>
    new Promise((resolve) => {
      const off = onEvent((msg) => {
        if (msg.method !== method) return;
        if (pred && !pred(msg.params)) return;
        off();
        resolve(msg.params);
      });
    });
  return { send, evalJs, onEvent, waitEvent, close: () => ws.close() };
}

/** Discover the page target on the debug port and establish a CDP session. */
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

/**
 * Register the render-ready binding (the shot page calls back after paint, replacing
 * document.title polling). MUST be called before Page.navigate: the binding is injected
 * before the document scripts, so the bindingCalled for the first paint is not lost
 * (otherwise it would require a second probe).
 */
export async function enableReady(cdp) {
  await cdp.send("Runtime.enable");
  await cdp.send("Runtime.addBinding", { name: READY_BINDING });
}

/**
 * Wait for the page to finish painting (the shot assembly calls the pptdReady binding).
 * Event push, no polling; payload === "error" means page init failed.
 * Must call enableReady first, and the listener should be registered before navigation
 * (see enableReady).
 */
export function waitReady(cdp, timeoutMs) {
  return withTimeout(
    cdp.waitEvent("Runtime.bindingCalled", (p) => p?.name === READY_BINDING).then((p) => {
      if (p.payload === "error") throw new Error("页面初始化失败（shot 模式报错，见浏览器控制台）");
      return p;
    }),
    timeoutMs,
    "等待渲染就绪"
  );
}

export { sleep };
