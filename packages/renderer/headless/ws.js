// ============================================================================
// renderer/headless/ws.js — MiniWebSocket（仅 Node 端使用）
// ----------------------------------------------------------------------------
// RFC6455 客户端最小实现，只覆盖 CDP 需要的部分：文本帧收发、ping→pong、
// close；客户端帧必须掩码。
//
// 为什么自研：**不**用 Node 全局 WebSocket / fetch —— 内置 undici 的连接在
// 远端（无头浏览器）退出后可能不释放 socket 句柄，导致 Node 进程无法退出
// （实测 Node 24 仍复现）。net.connect 句柄完全可控。
// ============================================================================

import { connect as netConnect } from "node:net";
import { randomBytes, createHash } from "node:crypto";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export class MiniWebSocket {
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
