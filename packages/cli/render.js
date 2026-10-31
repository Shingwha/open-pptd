// ============================================================================
// cli/render.js — render command (headless render to PNG)
// ----------------------------------------------------------------------------
// Node adapter over ExportService format:"png": disk project + fs provider +
// headless RenderBackend + file sink. The command surface, human output, exit
// code and default output paths are unchanged.
// ============================================================================

import { resolve, dirname } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { startServer } from "../server/index.js";
import { createDiskProjectSource, createFsResourceProvider } from "../server/runtime-node.js";
import { createProject } from "../runtime/index.js";
import { findBrowser } from "../renderer/headless/browser.js";
import { renderDeck, resolveShotManifest } from "../renderer/headless/shoot.js";
import { createHeadlessRenderBackend } from "../renderer/headless/backend.js";
import { exportProject } from "../export/index.js";

// Programmatic API: expose the pure render pipeline for in-process consumers (e.g. an
// embedding host's render tool); runRender above stays the CLI entry (prints + process.exit).
export { renderDeck };

/** render subcommand entry. */
export async function runRender({ manifest, outPath, page, scale, browserPath, timeoutMs }) {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18) {
    console.error("✗ render 需要 Node 18+（当前 " + process.version + "）");
    process.exit(1);
  }
  if (major < 21) {
    console.warn("⚠ 当前 Node " + process.version + " < 21：render 将使用内置最小 WebSocket 客户端（推荐 Node 21+）");
  }
  try {
    const manifestPath = resolveShotManifest(manifest);
    const browser = findBrowser(browserPath);
    console.log(`渲染 ${manifestPath}（${browser}）`);

    const files = await createDiskProjectSource(manifestPath).read();
    const project = createProject(files);
    const resources = createFsResourceProvider({ baseDir: dirname(manifestPath) });

    const report = await exportProject(
      project,
      {
        format: "png",
        // Historical default: the deck directory (absolute), or the resolved -o path.
        outPath: outPath ? resolve(outPath) : dirname(manifestPath),
        pages: page === "all" ? "all" : page, // ExportService validates the raw value (historical message)
        scale,
        backend: "headless",
        browserPath,
        timeoutMs,
      },
      {
        resources,
        renderBackend: (req) => createHeadlessRenderBackend({ ...req, startServer, quiet: true }),
        sink: {
          writeFile(path, bytes) {
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, bytes);
          },
        },
        onProgress(evt) {
          if (evt.stage !== "page") return;
          console.log(
            `  ✓ 第 ${evt.page}/${evt.deckPages} 页 → ${evt.outPath}（${(evt.bytes / 1024).toFixed(0)}KB）`
          );
        },
      }
    );
    if (!report.ok) throw new Error(report.errors.join("\n"));
    console.log(`✓ 渲染完成，共 ${report.files.length} 张图片`);
  } catch (err) {
    console.error(`✗ 渲染失败: ${err.message}`);
    process.exit(1);
  }
}
