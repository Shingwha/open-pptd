// ============================================================================
// app/io.js — 加载 / 保存 / 导出 / 图片 / 实时刷新（统一「项目模式」）
// ----------------------------------------------------------------------------
// 单一模型：项目文件在磁盘（serve --project 挂载目录），浏览器经 HTTP 读写。
//   - 加载：fetch 项目文件（/project/deck.pptd + pages/*.page）
//   - 保存：POST /api/save 写回磁盘（端点不存在 = 部署模式，降级为下载 zip）
//   - 实时刷新：EventSource("/events") 订阅文件变更（server 推送），
//     无未保存修改时自动重载（保留当前页）；有未保存修改时跳过并提示
//   - 图片：统一由 preloadRemoteImages 预读为 dataURL（不再有 FS Access 路径）
// 部署模式（GitHub Pages）：无 /events 与 /api/save，加载/导出照常，
// 保存 = 下载项目 zip（备份），实时刷新不启用。
// ============================================================================

import * as yaml from "../vendor/js-yaml.mjs";
import { parseDeck, serializeDeck } from "../core/pptd-io.js";
import { normalizeTheme, mergeFonts, DEFAULT_THEME } from "../core/theme.js";
import { syncElementId } from "../core/model.js";
import { buildPptx, downloadPptx } from "../writer/pptx.js";
import { ZipWriter } from "../writer/zip.js";
import { decodeDataUrl, extToMime } from "../writer/util.js";
import { createHistory } from "../interaction/history.js";
import { showToast } from "./toast.js";
import { fetchProjectTexts } from "./project-cache.js";
import { createFontManager } from "./font-manager.js";
import { showDialog } from "../interaction/dialogs/base.js";

export function createIo({ state, view }) {
  const $ = (id) => document.getElementById(id);
  const fontManager = createFontManager(state);

  // --------------------------------------------------------------------------
  // 主题与状态应用
  // --------------------------------------------------------------------------
  function applyTheme(themeInput) {
    // 官方 theme 永远是对象（v1 字符串 key 兼容已删）；深拷贝隔离默认主题引用
    state.deck.theme = themeInput && typeof themeInput === "object"
      ? JSON.parse(JSON.stringify(themeInput))
      : JSON.parse(JSON.stringify(DEFAULT_THEME));
    // deck 级字体声明覆盖主题字体（无声明则用主题默认，如微软雅黑）
    state.theme = mergeFonts(normalizeTheme(state.deck.theme), state.deck.fonts);
  }

  /** 把撤销/重做快照应用到当前状态。 */
  function applyHistory(deckSnapshot) {
    if (!deckSnapshot) return;
    state.deck = deckSnapshot;
    state.theme = mergeFonts(normalizeTheme(state.deck.theme), state.deck.fonts);
    if (state.currentPage >= state.deck.pages.length) state.currentPage = state.deck.pages.length - 1;
    state.selectedId = null;
    state.dirty = true; // 撤销/重做后状态偏离磁盘，视为未保存修改
    syncElementId(state.deck);
    rebuildImageMap();
    view.render();
  }

  // --------------------------------------------------------------------------
  // 加载
  // --------------------------------------------------------------------------
  function setBrandFile(text) {
    $("brand-file").textContent = text;
  }

  /**
   * 应用一份已解析的 PPTD 项目到编辑器状态：
   * 重置历史/选中/页面/图片映射/id 计数器并渲染（loadDeck 与手动刷新共用）。
   */
  function applyDeck(manifestText, pageFiles, { manifestPath = "" } = {}) {
    state.deck = parseDeck(manifestText, pageFiles);
    state.manifestPath = manifestPath;
    setBrandFile(manifestPath);
    applyTheme(state.deck.theme || DEFAULT_THEME);
    state.currentPage = 0;
    state.selectedId = null;
    state.history = createHistory();
    state.dirty = false; // 刚从磁盘/服务器加载，无未保存修改
    syncElementId(state.deck);
    rebuildImageMap();
    renderStatusBar();
  }

  /**
   * 加载项目（URL 或挂载路径）。keepPage：保留当前页（自动刷新/手动刷新）；
   * silent：不弹加载 toast（自动刷新场景）。
   */
  async function loadDeck(manifestUrl, { keepPage = false, silent = false } = {}) {
    const prevPage = state.currentPage;
    // 跨会话缓存：二次打开同一项目直接命中（画廊与编辑器共用，见 project-cache.js）
    const { manifestText, pageTexts, missing = 0 } = await fetchProjectTexts(manifestUrl, yaml.load);
    applyDeck(manifestText, pageTexts, { manifestPath: manifestUrl });
    if (keepPage) state.currentPage = Math.min(prevPage, Math.max(0, state.deck.pages.length - 1));
    await preloadRemoteImages();
    await fontManager.restoreFromDeck(); // 资源表 url 字体自动拉取注册（file 字体待用户重选）
    view.render();
    connectLiveReload(); // 项目就绪后订阅实时刷新（幂等；部署模式自动不启用）
    if (!silent) {
      // 缺失页面提示：Agent 写入中的项目「有一页显示一页」，不阻断预览
      const suffix = missing > 0 ? ` · ${missing} 页缺失（写入中？）` : "";
      showToast(`已加载 · ${state.deck.pages.length} 页 · 主题已应用${suffix}`, missing > 0 ? "info" : "info");
    }
  }

  /** 手动刷新：dirty 时需确认放弃未保存修改。 */
  function manualReload() {
    if (state.dirty && !window.confirm("编辑器有未保存的修改，重新加载将放弃这些修改。确定继续？")) return;
    if (!state.manifestPath) return;
    loadDeck(state.manifestPath, { keepPage: true, silent: true })
      .then(() => showToast("已从磁盘重新加载", "success"))
      .catch((err) => showToast(`刷新失败: ${err.message}`, "danger"));
  }

  // --------------------------------------------------------------------------
  // 实时刷新（项目模式）：server 推送文件变更 → 自动重载（保留当前页）
  // --------------------------------------------------------------------------
  let sse = null;
  let liveMode = false; // true = 本地挂载模式（/events 可用）；false = 部署模式
  let suppressUntil = 0; // 保存后短暂抑制（避免自己保存触发的刷新）

  function connectLiveReload() {
    if (!state.manifestPath || sse) return;
    try {
      sse = new EventSource("/events");
    } catch {
      return; // 部署模式（无 /events 端点）或异常环境：不启用实时刷新
    }
    sse.onopen = () => {
      liveMode = true;
      renderStatusBar();
    };
    sse.onerror = () => {
      // 部署模式：/events 404 → EventSource 进入错误态；本地 serve 断线则自动重连
      if (!liveMode) {
        sse?.close();
        sse = null;
        renderStatusBar();
      }
    };
    sse.onmessage = () => {
      if (!state.manifestPath || Date.now() < suppressUntil) return;
      if (state.dirty) {
        // 有未保存修改：跳过重载（不打断用户编辑）
        return;
      }
      loadDeck(state.manifestPath, { keepPage: true, silent: true }).catch((err) => {
        // 加载失败（文件半成品）：保留当前视图，修复后下轮推送会再次触发
        showToast(`文件变更后加载失败（已保留当前视图）: ${err.message}`, "danger");
      });
    };
  }

  /** 状态栏：模式（挂载/部署）+ dirty 点 + 实时刷新状态 + 刷新按钮。 */
  function renderStatusBar() {
    const el = document.getElementById("stage-status");
    if (!el) return;
    const projectMode = liveMode || !!sse;
    el.className = `stage-status ${projectMode ? "mode-project" : "mode-deploy"}`;
    const parts = [
      `<span class="mode-dot"></span>${projectMode ? `已连接项目：${state.manifestPath || ""}` : "网页模式 · 保存将下载项目包"}`,
    ];
    if (projectMode && sse) parts.push('<span class="status-hint">实时刷新</span>');
    if (state.dirty) parts.push(`<span class="status-dirty" title="编辑器有未保存的修改">● 未保存</span>`);
    parts.push(`<button type="button" class="status-btn" id="btn-reload" title="从磁盘重新加载当前项目">刷新</button>`);
    el.innerHTML = parts.join(" ");
    $("btn-reload")?.addEventListener("click", manualReload);
  }

  // --------------------------------------------------------------------------
  // 图片（统一 HTTP 预读；dataURL 内嵌无需处理）
  // --------------------------------------------------------------------------
  function dataUrlOf(buf, mime) {
    const bytes = new Uint8Array(buf);
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return `data:${mime};base64,${btoa(bin)}`;
  }

  /**
   * 把项目内相对路径图片预读为 dataURL 进 imageMap。
   * 预览渲染（img.src = map[el.src]）与导出（buildPptx 走 imageMap）共用同一数据源。
   */
  async function preloadRemoteImages() {
    if (!state.manifestPath) return;
    const base = state.manifestPath.replace(/[^/]*$/, "");
    const todo = [];
    const seen = new Set();
    for (const page of state.deck.pages) {
      for (const el of page.elements || []) {
        if (el.elementType !== "image" || !el.src || el.src.startsWith("data:")) continue;
        if (state.imageMap[el.src] || seen.has(el.src)) continue;
        seen.add(el.src);
        todo.push(el.src);
      }
    }
    await Promise.all(
      todo.map(async (src) => {
        try {
          const res = await fetch(base + src);
          if (!res.ok) return;
          const mime = extToMime(/\.([a-z0-9]+)$/i.exec(src)?.[1]);
          if (!mime) return;
          state.imageMap[src] = dataUrlOf(await res.arrayBuffer(), mime);
        } catch (err) {
          console.warn(`[io] 图片预载失败 ${src}: ${err.message}`); // 静默降级，渲染层有占位提示
        }
      })
    );
  }

  /** 重建图片映射：dataURL 引用自映射；相对路径引用保留已有映射。 */
  function rebuildImageMap() {
    const next = {};
    for (const page of state.deck.pages) {
      for (const el of page.elements || []) {
        if (el.elementType !== "image" || !el.src) continue;
        if (el.src.startsWith("data:")) next[el.src] = el.src;
        else if (state.imageMap[el.src]) next[el.src] = state.imageMap[el.src];
      }
    }
    state.imageMap = next;
  }

  // --------------------------------------------------------------------------
  // 导出 / 保存
  // --------------------------------------------------------------------------
  /** 导出对话框：嵌入字体勾选（默认开）+ 字体管理入口。 */
  function openExportDialog() {
    // 注意：body 内容必须独立构造（showDialog 参数在返回前求值，不能引用返回值）
    const wrap = document.createElement("div");
    wrap.className = "export-options";
    const embedCb = document.createElement("input");
    embedCb.type = "checkbox";
    embedCb.checked = true;
    const label = document.createElement("label");
    label.className = "prop-check";
    label.append(embedCb, document.createTextNode("嵌入字体（文件更大，换机打开不丢字体；子集化后体积可控）"));
    wrap.appendChild(label);
    const hint = document.createElement("div");
    hint.className = "prop-hint";
    const embedded = Object.keys(state.fontLibrary).filter((k) => state.fontLibrary[k].embed);
    hint.textContent = embedded.length
      ? `当前 ${embedded.length} 个字体将嵌入（${embedded.join(" / ")}）`
      : "当前没有待嵌入字体；可在「字体管理」中添加本地或网络字体。";
    wrap.appendChild(hint);
    const mgrBtn = document.createElement("button");
    mgrBtn.className = "btn btn-sm";
    mgrBtn.textContent = "字体管理…";
    mgrBtn.addEventListener("click", () => fontManager.openManagerDialog());
    wrap.appendChild(mgrBtn);
    const { close } = showDialog("导出 PPTX", wrap, {
      onDone() {
        close();
        doExport(embedCb.checked);
      },
    });
  }

  function doExport(embedFonts) {
    (async () => {
      try {
        const skipped = [];
        const bytes = await buildPptx(state.deck, {
          imageMap: state.imageMap,
          fontFiles: embedFonts ? fontManager.exportFontFiles() : null,
          embedFonts,
          onFontSkipped: (list) => skipped.push(...list),
        });
        const name = (state.deck.title || "deck").replace(/[\\/:*?"<>|]/g, "_") + ".pptx";
        downloadPptx(bytes, name);
        showToast(`已导出 ${name}（${(bytes.length / 1024).toFixed(1)} KB）`, "success");
        if (skipped.length) {
          console.warn(`[export] ${skipped.length} 个字体未嵌入:`, skipped);
          showToast(`⚠ ${skipped.length} 个字体未嵌入（${skipped.map((s) => s.family).join(", ")}），打开时可能回退系统字体`, "danger", 6000);
        }
      } catch (err) {
        showToast(`导出失败: ${err.message}`, "danger");
        console.error(err);
      }
    })();
  }

  function exportPptx() {
    openExportDialog();
  }

  /** dataURL → { mime, ext, bytes }（mime 由解码结果推断，与 writer 侧共享实现）。 */
  function decodeDataUrlInfo(dataUrl) {
    const decoded = decodeDataUrl(dataUrl);
    if (!decoded) return null;
    return { mime: extToMime(decoded.ext), ext: decoded.ext, bytes: decoded.bytes };
  }

  /** 收集 deck 中所有 dataURL 图片（去重），供落盘/打包。 */
  function collectDataUrlImages() {
    const seen = new Set();
    const out = [];
    for (const page of state.deck.pages) {
      for (const el of page.elements || []) {
        if (el.elementType === "image" && el.src && el.src.startsWith("data:") && !seen.has(el.src)) {
          seen.add(el.src);
          const info = decodeDataUrlInfo(el.src);
          if (!info) continue; // svg/webp 等 PPT 不支持格式：保留内嵌，不落盘
          out.push({ el, src: el.src, ...info });
        }
      }
    }
    return out;
  }

  /** 把 dataURL 图片落为 media/ 文件并重写 el.src（下载 zip 与写回挂载目录共用）。 */
  async function persistDataUrlImages({ writeFile }) {
    const images = collectDataUrlImages();
    for (const img of images) {
      const rel = `media/${img.el.elementId}.${img.ext}`;
      await writeFile(rel, img.bytes);
      state.imageMap[rel] = img.src; // 新路径 → 原 dataURL，预览保持可用
      img.el.src = rel;
    }
  }

  /** 把 Uint8Array → base64（/api/save 传输用）。 */
  function bytesToBase64(bytes) {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  /**
   * 保存项目（统一入口）：
   *   - 本地挂载模式：POST /api/save 批量写回磁盘（文本 utf8 / 图片 base64）
   *   - 部署模式（/api/save 不存在）：打包下载 zip 备份
   */
  async function saveProject() {
    fontManager.syncToDeck(); // 字体库（嵌入勾选）→ deck.fonts 资源表，随项目落盘
    const files = serializeDeck(state.deck, {
      manifestName: state.manifestPath?.split("/").pop() || "deck.pptd",
    }).map((f) => ({ path: f.path, content: f.content }));
    // dataURL 图片 → media/ 文件（base64）
    for (const img of collectDataUrlImages()) {
      const rel = `media/${img.el.elementId}.${img.ext}`;
      files.push({ path: rel, b64: bytesToBase64(img.bytes) });
      state.imageMap[rel] = img.src;
      img.el.src = rel;
    }
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.dirty = false;
      suppressUntil = Date.now() + 1500; // 抑制自己保存触发的 SSE 刷新
      renderStatusBar();
      showToast(`已保存 ${data.count} 个文件到项目目录`, "success");
    } catch (err) {
      // 部署模式（无 /api/save）或写回失败：降级为下载项目 zip
      saveProjectAsZip(files);
    }
  }

  /** 部署模式保存：打包下载（原实现 saveProject 的 zip 路径）。 */
  async function saveProjectAsZip(files) {
    try {
      const zip = new ZipWriter();
      for (const f of files) {
        zip.add(f.path, f.b64 ? base64ToBytes(f.b64) : f.content);
      }
      const bytes = zip.build();
      downloadPptx(bytes, "project.zip");
      state.dirty = false;
      renderStatusBar();
      showToast(`项目已打包下载（${(bytes.length / 1024).toFixed(1)} KB）`, "success");
    } catch (err) {
      showToast(`保存失败: ${err.message}`, "danger");
      console.error(err);
    }
  }

  /** base64 → Uint8Array（zip 打包用）。 */
  function base64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  return {
    applyTheme,
    applyHistory,
    loadDeck,
    manualReload,
    connectLiveReload,
    rebuildImageMap,
    exportPptx,
    saveProject,
    preloadRemoteImages,
    renderStatusBar,
    fontManager,
  };
}
