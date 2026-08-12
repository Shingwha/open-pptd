// ============================================================================
// lib/pptd-render.js — 无头渲染（open-pptd render）
// ----------------------------------------------------------------------------
// 零依赖：本地静态 server + 本机 Chrome/Edge headless + CDP（WebSocket）。
// 无浏览器窗口、无需用户操作；逐页输出 PNG，与编辑器预览同一条渲染管线
// （editor/?shot=1 → renderer/page.js，同一份字体文件与 imageMap）。
//
// CDP 传输说明：统一使用自研 MiniWebSocket（net.connect），**不**用 Node 全局
// WebSocket / fetch —— 内置 undici 的连接在远端（无头浏览器）退出后可能不释放
// socket 句柄，导致 Node 进程无法退出（实测 Node 24 仍复现）。http.get 同样
// 默认无 keep-alive，用完即关，句柄完全可控。

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync, statSync, mkdtempSync } from "node:fs";
import { join, dirname, basename, extname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createServer as createNetServer, connect as netConnect } from "node:net";
import { get as httpGet } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { startServer } from "./editor-server.js";
import { PAGE_WIDTH, PAGE_HEIGHT } from "../editor/core/model.js";

const READY_TITLE = "PPTD_READY";
const ERROR_TITLE = "PPTD_ERROR";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ----------------------------------------------------------------------------
// 浏览器发现（与 tests/e2e 同一候选策略；SMOKE_CHROME 可覆盖）
// ----------------------------------------------------------------------------
const BROWSER_CANDIDATES = [
  process.env.SMOKE_CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
].filter(Boolean);

export function findBrowser(browserPath = null) {
  if (browserPath) {
    if (!existsSync(browserPath)) throw new Error(`浏览器不存在: ${browserPath}`);
    return browserPath;
  }
  const hit = BROWSER_CANDIDATES.find((p) => existsSync(p));
  if (!hit) {
    throw new Error("未找到 Chrome/Edge。可用 --browser <路径> 指定，或设置环境变量 SMOKE_CHROME=<浏览器路径>");
  }
  return hit;
}

/** 取一个随机空闲端口（remote-debugging 用；竞态概率可忽略）。 */
function freePort() {
  return new Promise((resolvePort, reject) => {
    const srv = createNetServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolvePort(p));
    });
  });
}

// ----------------------------------------------------------------------------
// MiniWebSocket — RFC6455 客户端最小实现（Node 18/20 无全局 WebSocket 时兜底）
// 只覆盖 CDP 需要的部分：文本帧收发、ping→pong、close；客户端帧必须掩码。
// ----------------------------------------------------------------------------
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

class MiniWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this._handlers = { open: [], message: [], close: [], error: [] };
    this._buffer = Buffer.alloc(0);
    this._connect();
  }

  addEventListener(type, fn) {
    (this._handlers[type] ||= []).push(fn);
  }

  _emit(type, ev) {
    for (const fn of this._handlers[type] || []) fn(ev);
    this["on" + type]?.(ev);
  }

  _connect() {
    const u = new URL(this.url);
    const key = randomBytes(16).toString("base64");
    const expected = createHash("sha1").update(key + WS_GUID).digest("base64");
    const conn = netConnect(Number(u.port), u.hostname);
    this._conn = conn;
    let head = "";
    let done = false;

    conn.on("connect", () => {
      conn.write(
        `GET ${u.pathname}${u.search} HTTP/1.1\r\n` +
          `Host: ${u.host}\r\n` +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          `Sec-WebSocket-Key: ${key}\r\n` +
          "Sec-WebSocket-Version: 13\r\n\r\n"
      );
    });

    conn.on("data", (chunk) => {
      if (!done) {
        head += chunk.toString("latin1");
        const idx = head.indexOf("\r\n\r\n");
        if (idx === -1) return;
        done = true;
        const headerBlock = head.slice(0, idx);
        const statusLine = headerBlock.split("\r\n")[0];
        if (!/^HTTP\/1\.[01] 101/.test(statusLine)) {
          this._fail(new Error(`WebSocket 握手失败: ${statusLine}`));
          return;
        }
        const acceptLine = headerBlock.split("\r\n").find((l) => l.toLowerCase().startsWith("sec-websocket-accept:"));
        if (!acceptLine || acceptLine.slice(acceptLine.indexOf(":") + 1).trim() !== expected) {
          this._fail(new Error("WebSocket 握手失败: Sec-WebSocket-Accept 不匹配"));
          return;
        }
        this.readyState = 1; // OPEN
        this._emit("open", {});
        const rest = Buffer.from(head.slice(idx + 4), "latin1");
        if (rest.length) this._onData(rest);
        return;
      }
      this._onData(chunk);
    });

    conn.on("error", (err) => this._fail(err));
    conn.on("close", () => {
      if (this.readyState !== 3) {
        this.readyState = 3; // CLOSED
        this._emit("close", {});
      }
    });
  }

  /** 累积缓冲并按帧解析（服务端→客户端帧不掩码）。 */
  _onData(chunk) {
    this._buffer = Buffer.concat([this._buffer, chunk]);
    while (this._buffer.length >= 2) {
      const b0 = this._buffer[0];
      const b1 = this._buffer[1];
      const opcode = b0 & 0x0f;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this._buffer.length < 4) return;
        len = this._buffer.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this._buffer.length < 10) return;
        const big = this._buffer.readBigUInt64BE(2);
        if (big > BigInt(0x7fffffff)) return; // 防御：不处理超大帧
        len = Number(big);
        off = 10;
      }
      let mask = null;
      if (b1 & 0x80) {
        if (this._buffer.length < off + 4) return;
        mask = this._buffer.subarray(off, off + 4);
        off += 4;
      }
      if (this._buffer.length < off + len) return;
      const payload = Buffer.from(this._buffer.subarray(off, off + len));
      this._buffer = this._buffer.subarray(off + len);
      if (mask) {
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      if (opcode === 1) {
        this._emit("message", { data: payload.toString("utf8") });
      } else if (opcode === 8) {
        this._emit("close", {});
        this._conn.end();
        return;
      } else if (opcode === 9) {
        this._sendFrame(0x8a, payload); // ping → pong
      }
      // 0x0/0x2/0xA 等本场景不需要
    }
  }

  /** 发送文本帧（客户端帧必须掩码）。 */
  _sendFrame(opcode, payload) {
    let header;
    if (payload.length < 126) {
      header = Buffer.from([0x80 | opcode, 0x80 | payload.length]);
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    const mask = randomBytes(4);
    const masked = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i & 3];
    this._conn.write(Buffer.concat([header, mask, masked]));
  }

  send(data) {
    if (this.readyState !== 1) return;
    this._sendFrame(0x1, Buffer.from(String(data), "utf8"));
  }

  close() {
    try {
      this._sendFrame(0x8, Buffer.alloc(0));
    } catch {}
    this._conn.end();
  }

  _fail(err) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this._emit("error", err);
    this._emit("close", {});
    try {
      this._conn.destroy();
    } catch {}
  }
}

// ----------------------------------------------------------------------------
// CDP 客户端
// ----------------------------------------------------------------------------
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

function withTimeout(promise, ms, label) {
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

async function connectCdp(dbgPort, timeoutMs) {
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
async function waitReady(cdp, timeoutMs) {
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

// ----------------------------------------------------------------------------
// 主入口
// ----------------------------------------------------------------------------
/**
 * 逐页渲染 deck 为 PNG。
 * @param {object} opts
 * @param {string} opts.manifest .pptd 文件路径（或仅含一个 .pptd 的项目目录）
 * @param {string} [opts.outPath] 输出：目录（缺省 deck 同目录）；单页时若以 .png 结尾视为文件
 * @param {number|string} [opts.page] 页码（1 起）或 "all"（缺省 all）
 * @param {number} [opts.scale] 1|2|3（缺省 1 → 960×540）
 * @param {string} [opts.browserPath] 浏览器可执行文件路径（缺省自动发现）
 * @param {number} [opts.timeoutMs] 每步超时（缺省 30s）
 * @param {boolean} [opts.quiet] 静默（不打印中间日志）
 * @returns {Promise<{files: string[], count: number}>}
 */
export async function renderDeck({
  manifest,
  outPath = null,
  page = "all",
  scale = 1,
  browserPath = null,
  timeoutMs = 30000,
  quiet = false,
}) {
  // ---- 解析 manifest（目录 → 唯一 .pptd）----
  let manifestPath = manifest;
  if (!existsSync(manifestPath)) throw new Error(`文件不存在: ${manifestPath}`);
  if (statSync(manifestPath).isDirectory()) {
    const candidates = readdirSync(manifestPath).filter((f) => f.endsWith(".pptd"));
    if (candidates.length !== 1) {
      throw new Error(`目录 ${manifestPath} 下应有且仅有一个 .pptd 文件（实际 ${candidates.length} 个）`);
    }
    manifestPath = join(manifestPath, candidates[0]);
  }
  manifestPath = resolve(manifestPath);
  const deckDir = dirname(manifestPath);
  const deckBase = basename(manifestPath, extname(manifestPath));
  scale = Number(scale);
  if (![1, 2, 3].includes(scale)) throw new Error(`--scale 仅支持 1|2|3（当前 ${scale}）`);
  const pageSpec = page === "all" ? "all" : Number(page);
  if (pageSpec !== "all" && (!Number.isInteger(pageSpec) || pageSpec < 1)) {
    throw new Error(`--page 仅支持页码（1 起）或 all（当前 ${page}）`);
  }

  const browser = findBrowser(browserPath);
  const log = (msg) => {
    if (!quiet) console.log(msg);
  };

  // ---- 起临时 server（随机端口）----
  const server = await startServer({ port: 0, projectRoot: deckDir, deckUrl: null });
  const actualPort = server.address().port;
  const pageUrl = `http://127.0.0.1:${actualPort}/editor/?deck=project/${encodeURIComponent(basename(manifestPath))}&shot=1`;

  // ---- 无头启动浏览器 ----
  const dbgPort = await freePort();
  const profileDir = mkdtempSync(join(tmpdir(), "pptd-shot-"));
  const chrome = spawn(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      `--remote-debugging-port=${dbgPort}`,
      `--user-data-dir=${profileDir}`,
      "--window-size=960,540",
      pageUrl,
    ],
    { stdio: "ignore" }
  );
  chrome.unref(); // 浏览器进程不阻塞 Node 退出（清理失败时兜底）

  let cdp = null;
  try {
    log(`渲染 ${manifestPath}（${browser}）`);
    cdp = await connectCdp(dbgPort, timeoutMs);    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await waitReady(cdp, timeoutMs); // 首页就绪

    // 视口 = 画布原生尺寸 × scale（截图即页面像素）
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: PAGE_WIDTH * scale,
      height: PAGE_HEIGHT * scale,
      deviceScaleFactor: scale,
      mobile: false,
    });

    const count = await cdp.evalJs("window.__pptdShot.count");
    if (!Number.isInteger(count) || count < 1) throw new Error(`页面数异常: ${count}`);

    const indices =
      pageSpec === "all" ? Array.from({ length: count }, (_, i) => i) : [pageSpec - 1];
    for (const i of indices) {
      if (i < 0 || i >= count) throw new Error(`页码 ${i + 1} 超出范围（共 ${count} 页）`);
    }

    const files = [];
    const single = indices.length === 1;
    for (const i of indices) {
      if (i !== 0) {
        await cdp.evalJs(`window.__pptdShot.goto(${i})`, timeoutMs); // 页内切页，避免整页重载
      }
      const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
      if (!shot.result?.data) throw new Error(`第 ${i + 1} 页截图失败（无数据）`);
      const buf = Buffer.from(shot.result.data, "base64");

      let filePath;
      if (single && outPath && outPath.toLowerCase().endsWith(".png")) {
        filePath = resolve(outPath);
      } else {
        const dir = outPath ? resolve(outPath) : deckDir;
        mkdirSync(dir, { recursive: true });
        filePath = join(dir, `${deckBase}-${String(i + 1).padStart(2, "0")}.png`);
      }
      writeFileSync(filePath, buf);
      files.push(filePath);
      log(`  ✓ 第 ${i + 1}/${count} 页 → ${filePath}（${(buf.length / 1024).toFixed(0)}KB）`);
    }
    return { files, count };
  } finally {
    // ---- 清理：关浏览器、删临时 profile、关 server ----
    try {
      if (cdp) await withTimeout(cdp.send("Browser.close"), 2000, "关闭浏览器");
    } catch {}
    try {
      cdp?.close();
    } catch {}
    // 等浏览器自行退出（最多 1.5s），未退出再 kill
    const exited = new Promise((r) => chrome.once("exit", r));
    await Promise.race([exited, sleep(1500)]);
    try {
      chrome.kill();
    } catch {}
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {}
    // 强制断开全部连接（shot 模式的 SSE 长连接会让 server.close() 永远等不到）
    try {
      server.closeAllConnections?.();
    } catch {}
    server.close();
  }
}
