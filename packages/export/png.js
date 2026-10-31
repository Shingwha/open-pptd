// ============================================================================
// export/png.js — PNG format router (page selection / scale / naming / report)
// ----------------------------------------------------------------------------
// Rasterization is injected (env.renderBackend, RenderBackend contract §6):
// this module only picks pages, validates scale, names files, writes through the
// sink and records the report. The same router therefore serves headless today
// and capture/foreignObject hosts later.
// ============================================================================

import { deckSize } from "../model/index.js";
import { ExportError, EXPORT_ERRORS } from "./errors.js";
import { joinPath, stripExt } from "./report.js";

/** "all" → every page; a page number/array → validated 1-based list (deduped, order kept). */
function normalizePages(pages, count) {
  if (pages == null || pages === "all") return Array.from({ length: count }, (_, i) => i + 1);
  const list = Array.isArray(pages) ? pages : [pages];
  const out = [];
  for (const raw of list) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) {
      throw new ExportError(EXPORT_ERRORS.PAGES, `--page 仅支持页码（1 起）或 all（当前 ${raw}）`);
    }
    if (n > count) {
      throw new ExportError(EXPORT_ERRORS.PAGES, `页码 ${n} 超出范围（共 ${count} 页）`);
    }
    if (!out.includes(n)) out.push(n);
  }
  if (!out.length) throw new ExportError(EXPORT_ERRORS.PAGES, "pages 不能为空");
  return out;
}

function progress(env, evt) {
  if (typeof env.onProgress !== "function") return;
  try {
    env.onProgress(evt);
  } catch {
    /* a host progress callback must never break the export */
  }
}

/**
 * @param {object} ctx {project, deck, options, env, report}
 */
export async function exportPng(ctx) {
  const { project, deck, options, env, report } = ctx;
  const scale = options.scale == null ? 1 : Number(options.scale);
  if (![1, 2, 3].includes(scale)) {
    throw new ExportError(EXPORT_ERRORS.INVALID_OPTION, `--scale 仅支持 1|2|3（当前 ${options.scale}）`);
  }
  if (typeof env.renderBackend !== "function") {
    throw new ExportError(
      EXPORT_ERRORS.NO_RENDER_BACKEND,
      "PNG 导出需要 env.renderBackend（headless/capture/foreignObject 工厂）"
    );
  }
  const [width, height] = deckSize(deck);
  const mode = options.backend || "headless";

  let backend;
  try {
    backend = await env.renderBackend({
      width,
      height,
      scale,
      mode,
      target: { project, deck },
      browserPath: options.browserPath,
      timeoutMs: options.timeoutMs,
    });
  } catch (err) {
    throw new ExportError(EXPORT_ERRORS.RENDER_BACKEND, `PNG 渲染后端不可用：${err?.message || err}`, {
      cause: err,
    });
  }
  if (!backend || typeof backend.prepare !== "function") {
    throw new ExportError(EXPORT_ERRORS.RENDER_BACKEND, "renderBackend 未返回 RenderBackend 实例");
  }

  const written = [];
  let totalBytes = 0;
  try {
    try {
      await backend.prepare();
    } catch (err) {
      throw new ExportError(EXPORT_ERRORS.RENDER_BACKEND, `PNG 渲染后端不可用：${err?.message || err}`, {
        cause: err,
      });
    }
    const info = backend.info || {};
    const count = Number.isInteger(info.count) ? info.count : Array.isArray(deck.pages) ? deck.pages.length : 0;
    if (!count) throw new ExportError(EXPORT_ERRORS.PAGES, "项目没有页面，无法导出 PNG");
    const pageNums = normalizePages(options.pages == null ? "all" : options.pages, count);
    progress(env, {
      stage: "backend-ready",
      format: "png",
      total: count,
      pages: pageNums,
      width,
      height,
      scale,
    });

    const singleFile = pageNums.length === 1 && options.outPath && /\.png$/i.test(options.outPath);
    const outDir = singleFile
      ? null
      : options.outPath || project.baseDir || ".";
    const deckBase = stripExt(project.manifestName || "deck");

    for (let idx = 0; idx < pageNums.length; idx++) {
      const page = pageNums[idx];
      try {
        await backend.paint(page, { pixelRatio: scale });
      } catch (err) {
        if (err instanceof ExportError) throw err;
        throw new ExportError(EXPORT_ERRORS.RENDER_BACKEND, `PNG 第 ${page} 页绘制失败：${err?.message || err}`, {
          cause: err,
        });
      }
      let bytes;
      try {
        bytes = await backend.capture();
      } catch (err) {
        if (err instanceof ExportError) throw err;
        throw new ExportError(EXPORT_ERRORS.RENDER_BACKEND, `PNG 第 ${page} 页截图失败：${err?.message || err}`, {
          cause: err,
        });
      }
      if (!(bytes instanceof Uint8Array) || !bytes.length) {
        throw new ExportError(EXPORT_ERRORS.RENDER_BACKEND, `PNG 第 ${page} 页截图无数据`);
      }
      const outPath = singleFile
        ? options.outPath
        : joinPath(outDir, `${deckBase}-${String(page).padStart(2, "0")}.png`);
      if (typeof env.sink?.writeFile === "function") {
        await env.sink.writeFile(outPath, bytes);
      } else {
        (report.artifacts ||= []).push({ name: outPath, bytes });
      }
      written.push(outPath);
      totalBytes += bytes.length;
      progress(env, {
        stage: "page",
        format: "png",
        page,
        index: idx + 1,
        total: pageNums.length,
        deckPages: count,
        outPath,
        bytes: bytes.length,
      });
    }
    report.pages = pageNums;
    report.outPath = singleFile ? options.outPath : outDir;
  } finally {
    try {
      await backend.dispose();
    } catch {
      /* cleanup failure must not mask the export result */
    }
  }

  report.files = written;
  report.bytes = totalBytes;
  progress(env, { stage: "done", format: "png", files: written });
}
