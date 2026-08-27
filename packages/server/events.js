// ============================================================================
// server/events.js — SSE 变更推送（/events）
// ----------------------------------------------------------------------------
// 项目文件变更 → 广播给所有订阅的编辑器（EventSource）。
// 实现：服务端轮询目录指纹（fs.watch 在容器/网络盘等挂载场景不可靠），
// 指纹变化时向所有已连接客户端发送 message。零依赖（Node 原生）。
// ============================================================================

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const POLL_INTERVAL_MS = 800;

/**
 * 递归扫描目录，返回文件指纹（相对路径 + mtimeMs + size，排序后拼接）。
 * 排除隐藏目录（.git 等）与 node_modules，避免无关写入误触发刷新。
 */
export function dirFingerprint(root) {
  const parts = [];
  const walk = (dir, base) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), rel);
      } else if (entry.isFile()) {
        const st = statSync(join(dir, entry.name));
        parts.push(`${rel}:${st.mtimeMs}:${st.size}`);
      }
    }
  };
  walk(root, "");
  return parts.sort().join("|");
}

/**
 * 创建 SSE 推送中心。仅 --project 挂载时有意义（调用方保证 projectRoot 非空）。
 * @returns {{ handle(req, res): void }}
 */
export function createSseHub(projectRoot) {
  const clients = new Set();
  let timer = null;

  function startWatcher() {
    if (timer) return;
    let last = dirFingerprint(projectRoot);
    timer = setInterval(() => {
      const now = dirFingerprint(projectRoot);
      if (now !== last) {
        last = now;
        const msg = `data: changed\n\n`;
        for (const client of clients) {
          try {
            client.write(msg);
          } catch {
            clients.delete(client);
          }
        }
      }
    }, POLL_INTERVAL_MS);
    timer.unref?.(); // 不阻止进程退出
  }

  function handle(req, res) {
    startWatcher();
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    res.write("data: ready\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
  }

  return { handle };
}
