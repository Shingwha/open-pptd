// ============================================================================
// server/index.js — open-pptd 本地服务器（装配根）
// ----------------------------------------------------------------------------
// 零依赖（Node 内置 http）。职责拆分：
//   static.js   静态文件服务（MIME + 防穿越解析）
//   api.js      /api/save 写回、/api/ping 探活
//   events.js   /events SSE 变更推送（目录指纹轮询）
//   gallery.js  /examples/manifest.json 动态画廊索引
// 对外接口（createServer/startServer 签名、端点、SSE 协议）与历史版本一致。
// 可选虚拟挂载：--project <目录> 把任意本地项目挂到 /project/ 下供浏览器预览。
// ============================================================================

import http from "node:http";
import { existsSync } from "node:fs";
import { join, normalize, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveFile, sendFile } from "./static.js";
import { handleSave, handlePing } from "./api.js";
import { createSseHub } from "./events.js";
import { buildManifest } from "./gallery.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = join(__dirname, "..", "..");

export function createServer(options = {}) {
  const root = normalize(options.root || PROJECT_ROOT);
  // 可选虚拟挂载：/project/<path> → projectRoot 下的真实文件（--project <dir>）
  const projectRoot = options.projectRoot ? normalize(resolve(options.projectRoot)) : null;
  const sse = projectRoot ? createSseHub(projectRoot) : null;

  return http.createServer((req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      let pathname = decodeURIComponent(url.pathname);
      let base = root;
      if (projectRoot && (pathname === "/project" || pathname.startsWith("/project/"))) {
        base = projectRoot;
        pathname = pathname === "/project" ? "/" : pathname.slice("/project".length);
      }
      // SSE 变更推送：仅 --project 挂载时可用
      if (pathname === "/events" && sse) {
        sse.handle(req, res);
        return;
      }
      // 写回 API：仅 --project 挂载时可用
      if (pathname === "/api/save" && req.method === "POST") {
        handleSave(req, res, projectRoot);
        return;
      }
      // 探活 API：本地 serve 独有（GitHub Pages 上 404）
      if (pathname === "/api/ping") {
        handlePing(res);
        return;
      }
      // 画廊索引：动态扫描 examples/ 生成（用户丢进文件夹即见；磁盘上的静态
      // manifest.json 仅供 GitHub Pages 使用，本地永远以动态扫描为准）
      if (pathname === "/examples/manifest.json") {
        const examplesDir = join(root, "examples");
        if (existsSync(examplesDir)) {
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
          res.end(JSON.stringify(buildManifest(examplesDir)));
        } else {
          res.writeHead(404).end("no examples");
        }
        return;
      }
      // 目录路径 → 目录内 index.html（GitHub Pages 同行为：<root>/index.html 即画廊）
      let filePath = resolveFile(base, pathname);
      if (!filePath && pathname.endsWith("/")) {
        filePath = resolveFile(base, pathname + "index.html");
      }
      if (!filePath) {
        res.writeHead(404).end("not found: " + pathname);
        return;
      }
      sendFile(res, filePath);
    } catch (err) {
      res.writeHead(500).end(String(err?.stack || err));
    }
  });
}

export function startServer(options = {}) {
  const basePort = options.port ?? 55173; // port: 0 = 随机空闲端口
  return new Promise((resolve, reject) => {
    const tryListen = (port) => {
      const server = createServer(options);
      server.once("error", (err) => {
        // 端口占用自动顺延（最多试 10 个），无需用户手动换
        if (err?.code === "EADDRINUSE" && port - basePort < 10) {
          tryListen(port + 1);
        } else {
          reject(err);
        }
      });
      server.listen(port, "127.0.0.1", () => {
        // port: 0 = 随机空闲端口（render 等一次性场景用）；实际端口以 address() 为准
        const actualPort = server.address().port;
        const base = `http://127.0.0.1:${actualPort}/`;
        // 编辑器入口在 /editor/（根路径是画廊，不处理 ?deck=）
        console.log(`open-pptd 已启动: ${options.deckUrl ? base + "editor/?deck=" + options.deckUrl : base + "editor/"}`);
        resolve(server);
      });
    };
    tryListen(basePort);
  });
}
