// ============================================================================
// server/render.js — /api/render 图片导出（本地 serve 独有，GitHub Pages 无此端点）
// ----------------------------------------------------------------------------
// POST JSON { deck, page, scale }：
//   deck   项目清单路径（站点根 / --project 挂载根之下的相对路径，防穿越校验）
//   page   页码（1 起）或 "all"（缺省 all）
//   scale  1|2|3 输出倍率（缺省 2）
// 复用 CLI render 的无头渲染管线（renderer/headless/shoot.js，与预览/CLI 导出
// 同一渲染器，预览即所得）；单页回 PNG、多页回 zip（writer/zip，零依赖）。
// 渲染耗时数秒：串行化执行，同一时刻只跑一个无头浏览器。
// ============================================================================

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, normalize, sep, basename, extname } from "node:path";
import { tmpdir } from "node:os";
import { renderDeck } from "../renderer/headless/shoot.js";
import { ZipWriter } from "../writer/zip.js";

let busy = false;

function sendError(res, code, message) {
  res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" }).end(message);
}

function sendDownload(res, name, type, data) {
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": "no-store",
  });
  res.end(data);
}

/**
 * 图片导出处理器。base 为服务根（--project 挂载根，缺省站点根），deck 相对它解析；
 * startServer 注入静态服务工厂（保持 renderer → server 无反向依赖，同 cli/render）。
 */
export function handleRender(req, res, { base, projectRoot, startServer }) {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    let outDir = null;
    try {
      if (busy) return sendError(res, 409, "已有渲染任务进行中，请稍后再试");
      const payload = JSON.parse(body || "{}");
      // 防穿越：deck 必须落在服务根之内（/project/ 前缀仅在挂载模式下剥除，语义同静态服务）
      let rel = String(payload.deck || "").replace(/^\/+/, "");
      if (projectRoot) rel = rel.replace(/^project\//, "");
      if (!rel) return sendError(res, 400, "missing deck");
      const deckPath = normalize(join(base, rel));
      if (deckPath !== base && !deckPath.startsWith(base + sep)) {
        return sendError(res, 403, `path outside root: ${rel}`);
      }
      if (!/\.pptd$/i.test(deckPath)) return sendError(res, 400, "deck must be a .pptd manifest");

      const page = payload.page == null ? "all" : payload.page;
      if (page !== "all" && (!Number.isInteger(page) || page < 1)) {
        return sendError(res, 400, `bad page: ${payload.page}`);
      }
      const scale = Number(payload.scale) || 2;
      if (![1, 2, 3].includes(scale)) return sendError(res, 400, `bad scale: ${payload.scale}`);

      busy = true;
      outDir = mkdtempSync(join(tmpdir(), "pptd-api-"));
      const { files } = await renderDeck({
        manifest: deckPath,
        outPath: outDir,
        page,
        scale,
        quiet: true,
        startServer,
      });
      const deckBase = basename(deckPath, extname(deckPath)).replace(/[^\w.-]+/g, "_") || "deck";
      if (files.length === 1) {
        sendDownload(res, basename(files[0]), "image/png", readFileSync(files[0]));
      } else {
        const zip = new ZipWriter();
        for (const f of files) zip.add(basename(f), readFileSync(f));
        sendDownload(res, `${deckBase}-images.zip`, "application/zip", Buffer.from(zip.build()));
      }
    } catch (err) {
      sendError(res, 500, String(err?.message || err));
    } finally {
      if (outDir) rmSync(outDir, { recursive: true, force: true });
      busy = false;
    }
  });
}
