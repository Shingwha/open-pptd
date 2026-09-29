// ============================================================================
// renderer/headless/cdp.js — CDP 客户端（仅 Node 端使用）
// ----------------------------------------------------------------------------
// 基于 MiniWebSocket 的 Chrome DevTools Protocol 最小客户端：
// 方法调用（id 配对）、事件分发、Runtime.evaluate 助手、/json 目标发现、
// 渲染就绪（Runtime.addBinding 事件推送，无轮询）。
// http.get 默认无 keep-alive，响应读完连接即关，句柄完全可控。
// ============================================================================

import { get as httpGet } from "node:http";
import { MiniWebSocket } from "./ws.js";

/** 页面侧 paint 完成 → 调用本 CDP 绑定名通知宿主（与 editor/app/shot.js 同名约定）。 */
export const READY_BINDING = "pptdReady";

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
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
      return;
    }
    // 无 id = CDP 事件（Runtime.bindingCalled 等）→ 分发给订阅者
    if (msg.method) for (const l of [...listeners]) l(msg);
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
  /** 订阅 CDP 事件（返回退订函数）。 */
  const onEvent = (cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  };
  /** 等一条满足谓词的 CDP 事件（一次性；超时由调用方 withTimeout 兜底）。 */
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

/**
 * 注册渲染就绪绑定（供 shot 页 paint 完成后回调，替代 document.title 轮询）。
 * **必须在 Page.navigate 之前调用**：绑定先于文档脚本注入，页面首次 paint 完成
 * 的 bindingCalled 才不会丢失（否则只能靠二次探测）。
 */
export async function enableReady(cdp) {
  await cdp.send("Runtime.enable");
  await cdp.send("Runtime.addBinding", { name: READY_BINDING });
}

/**
 * 等待页面 paint 完成（shot 装配调用 pptdReady 绑定）。
 * 事件推送，无轮询；payload === "error" 视为页面初始化失败。
 * 调用前须先 enableReady，且应在导航前注册监听（见 enableReady 注释）。
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
