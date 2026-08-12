// ============================================================================
// editor-server.js — open-pptd 本地静态服务器
// ----------------------------------------------------------------------------
// 零依赖（Node 内置 http/fs）。服务项目根：editor/、assets/ 等。
// 可选虚拟挂载：--project <目录> 把任意本地项目挂到 /project/ 下供浏览器预览。
// ============================================================================

import http from "http";
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join, normalize, resolve, sep, extname, dirname } from "path";
import { fileURLToPath } from "url";
import { buildManifest } from "./gallery.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = join(__dirname, "..");

/**
 * 递归扫描目录，返回文件指纹（相对路径 + mtimeMs + size，排序后拼接）。
 * 供 /events SSE 推送做 stat 轮询（fs.watch 在容器/网络盘等挂载场景不可靠）。
 * 排除隐藏目录（.git 等）与 node_modules，避免无关写入误触发刷新。
 */
function dirFingerprint(root) {
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

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pptd": "text/yaml; charset=utf-8",
  ".page": "text/yaml; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".ico": "image/x-icon",
};

export function createServer(options = {}) {
  const root = normalize(options.root || PROJECT_ROOT);
  // 可选虚拟挂载：/project/<path> → projectRoot 下的真实文件（--project <dir>）
  const projectRoot = options.projectRoot ? normalize(resolve(options.projectRoot)) : null;
  const serve = (base, pathname) => {
    const filePath = normalize(join(base, pathname));
    if (filePath !== base && !filePath.startsWith(base + sep)) return null; // 防路径穿越
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) return null;
    return filePath;
  };

  // ------------------------------------------------------------------------
  // SSE 推送：项目文件变更 → 广播给所有订阅的编辑器（EventSource）
  // 实现：服务端轮询目录指纹（fs.watch 在容器/网络盘不可靠，见 dirFingerprint），
  // 指纹变化时向所有已连接客户端发送 message。零依赖（Node 原生）。
  // ------------------------------------------------------------------------
  const sseClients = new Set();
  let sseTimer = null;
  function startWatcher() {
    if (!projectRoot || sseTimer) return;
    let last = dirFingerprint(projectRoot);
    sseTimer = setInterval(() => {
      const now = dirFingerprint(projectRoot);
      if (now !== last) {
        last = now;
        const msg = `data: changed\n\n`;
        for (const client of sseClients) {
          try {
            client.write(msg);
          } catch {
            sseClients.delete(client);
          }
        }
      }
    }, 800);
    sseTimer.unref?.(); // 不阻止进程退出
  }

  // ------------------------------------------------------------------------
  // 写回 API：浏览器保存 → 写磁盘（仅 --project 挂载时可用）
  // body: { path: "pages/1_cover.page", content: "..." }（或 { files: [...] } 批量）
  // ------------------------------------------------------------------------
  function handleSave(req, res) {
    if (!projectRoot) {
      res.writeHead(404).end("not found");
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        const files = payload.files || (payload.path ? [payload] : []);
        if (!files.length) {
          res.writeHead(400).end("empty");
          return;
        }
        let count = 0;
        for (const f of files) {
          const rel = String(f.path || "").replace(/^\//, "");
          const filePath = normalize(join(projectRoot, rel));
          if (filePath !== projectRoot && !filePath.startsWith(projectRoot + sep)) {
            res.writeHead(403).end(`path outside project: ${rel}`);
            return;
          }
          mkdirSync(dirname(filePath), { recursive: true });
          writeFileSync(filePath, String(f.content ?? ""), "utf8");
          count += 1;
        }
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, count }));
      } catch (err) {
        res.writeHead(500).end(String(err?.message || err));
      }
    });
  }

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
      if (pathname === "/events" && projectRoot) {
        startWatcher();
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
        });
        res.write("data: ready\n\n");
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        return;
      }
      // 写回 API：仅 --project 挂载时可用
      if (pathname === "/api/save" && req.method === "POST") {
        handleSave(req, res);
        return;
      }
      // 探活 API：本地 serve 独有（GitHub Pages 上 404）——画廊据此区分本地/线上模式
      if (pathname === "/api/ping") {
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, mode: "local" }));
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
      // 根路径：直接 serve 根 index.html（画廊端口；目录 index 逻辑见下，
      // 与 GitHub Pages 行为一致：<root>/index.html 即画廊）
      let filePath = serve(base, pathname);
      // 目录路径 → 目录内 index.html（GitHub Pages 同行为）
      if (!filePath && pathname.endsWith("/")) {
        filePath = serve(base, pathname + "index.html");
      }
      if (!filePath) {
        res.writeHead(404).end("not found: " + pathname);
        return;
      }
      const body = readFileSync(filePath);
      res.writeHead(200, {
        "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(body);
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
