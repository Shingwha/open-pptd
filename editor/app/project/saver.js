// ============================================================================
// app/project/saver.js — 保存与导出
// ----------------------------------------------------------------------------
// 保存项目（统一入口 saveProject）：
//   - 本地挂载模式：POST /api/save 批量写回磁盘（文本 utf8 / 图片 base64）
//   - 部署模式（/api/save 不存在）：降级打包下载项目 zip 备份
// 导出 PPTX（exportPptx）：对话框勾选字体嵌入 → buildPptx → 下载。
// 依赖注入：images（dataURL 图片落盘）、fontManager（字体库同步/嵌入）、
// onSaved（保存成功后抑制 SSE 刷新回环）、renderStatusBar。
// ============================================================================

import { serializeDeck } from "../../../packages/model/pptd-io.js";
import { base64ToBytes } from "../../../packages/model/bytes.js";
import { buildPptx, downloadPptx } from "../../../packages/writer/pptx.js";
import { ZipWriter } from "../../../packages/writer/zip.js";
import { showToast } from "../toast.js";
import { showDialog } from "../../interaction/dialogs/base.js";
import { openFontPanel } from "../../interaction/font-panel.js";
import { writeFiles } from "./handle-io.js";
import { mediaFilesOfDeck } from "./images.js";

export function createProjectSaver({ state, images, fontManager, renderStatusBar, onSaved }) {
  /** 保存成功：当前 deck 记为已落盘基线（撤销回它即恢复干净，不再一律标脏）。 */
  const markSaved = () => {
    state.savedDeck = structuredClone(state.deck);
    state.dirty = false;
  };
  // --------------------------------------------------------------------------
  // 导出（PPTX 对话框 / 项目包 zip 直达，入口在顶栏「文件」菜单）
  // --------------------------------------------------------------------------
  /** 导出 PPTX 对话框：嵌入字体勾选（默认开）+ 字体管理入口。 */
  function openExportDialog() {
    const wrap = document.createElement("div");
    wrap.className = "export-pptx-opts";
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
    mgrBtn.addEventListener("click", () => {
      close();
      openFontPanel(); // 关导出框、开字体浮层（不再叠加两层遮罩）
    });
    wrap.appendChild(mgrBtn);
    const { close } = showDialog("导出 PPTX", wrap, {
      doneText: "导出",
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
          iconDefs: state.iconMap, // 图标预读缓存（icons.js；未预载项由 loadIconDefs 回源补齐）
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

  /**
   * 导出项目包（zip）：deck.pptd + pages/ + media/，命名与 CLI export-project 一致。
   * 语义说明（v3 #6）：与 CLI `export-project` 的差异是刻意的——CLI 原样打包
   * 磁盘文件（保留注释/格式，反映磁盘现状）；浏览器导出的是**当前编辑现场**
   * （可能含未保存修改），必须经模型重序列化，故注释/原始格式不保留。
   * 「磁盘原样」以 CLI 为准，「编辑现场快照」以浏览器为准，两侧不再对齐实现。
   */
  async function doExportZip() {
    try {
      fontManager.syncToDeck(); // 字体资源表 → deck.fonts，随包带上
      // 对快照做图片收集与序列化——导出不改变当前编辑现场
      // （imageMap 同时覆盖内嵌 dataURL 与已落盘化的相对路径引用，zip 里都有字节）
      const snapshot = JSON.parse(JSON.stringify(state.deck));
      const mediaFiles = mediaFilesOfDeck(snapshot, state.imageMap);
      const files = serializeDeck(snapshot, {
        manifestName: state.manifestPath?.split("/").pop() || "deck.pptd",
      });
      const zip = new ZipWriter();
      for (const f of files) zip.add(f.path, f.content);
      for (const m of mediaFiles) zip.add(m.path, base64ToBytes(m.b64));
      const bytes = zip.build();
      const name = (state.deck.title || "deck").replace(/[\\/:*?"<>|]/g, "_") + "-project.zip";
      downloadPptx(bytes, name);
      showToast(`项目包已导出 ${name}（${(bytes.length / 1024).toFixed(1)} KB）`, "success");
    } catch (err) {
      showToast(`导出项目包失败: ${err.message}`, "danger");
      console.error(err);
    }
  }

  function exportPptx() {
    openExportDialog();
  }

  // --------------------------------------------------------------------------
  // 保存项目
  // --------------------------------------------------------------------------
  /** zipFallback=false：写回失败直接抛错（供导出图片等需要区分降级语义的调用方）。 */
  async function saveProject(opts = {}) {
    const zipFallback = opts.zipFallback !== false;
    fontManager.syncToDeck(); // 字体库（嵌入勾选）→ deck.fonts 资源表，随项目落盘
    // dataURL 图片先落盘化（重写 el.src 为 media/ 路径），序列化后的页面干净引用媒体文件
    const mediaFiles = images.persistDataUrlImages();
    const files = serializeDeck(state.deck, {
      manifestName: state.manifestPath?.split("/").pop() || "deck.pptd",
    }).map((f) => ({ path: f.path, content: f.content }));
    files.push(...mediaFiles);
    // 本地项目句柄：直接经句柄写回所选文件夹（不经服务器）
    if (state.projectHandle) {
      try {
        const count = await writeFiles(state.projectHandle, files);
        markSaved();
        onSaved(); // 抑制轮询触发的自动刷新回环
        renderStatusBar();
        showToast(`已保存 ${count} 个文件到 ${state.projectName || "项目文件夹"}`, "success");
      } catch (err) {
        showToast(`保存失败: ${err.message}`, "danger");
        console.error(err);
      }
      return;
    }
    // URL 模式：POST /api/save 写回挂载目录
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      markSaved();
      onSaved(); // 抑制自己保存触发的 SSE 刷新
      renderStatusBar();
      showToast(`已保存 ${data.count} 个文件到项目目录`, "success");
    } catch (err) {
      // 部署模式（无 /api/save）或写回失败：降级为下载项目 zip
      if (!zipFallback) throw err;
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
      markSaved();
      renderStatusBar();
      showToast(`项目已打包下载（${(bytes.length / 1024).toFixed(1)} KB）`, "success");
    } catch (err) {
      showToast(`保存失败: ${err.message}`, "danger");
      console.error(err);
    }
  }

  // --------------------------------------------------------------------------
  // 导出图片（本地 serve 的 /api/render，与 CLI render 同一无头渲染管线）
  // --------------------------------------------------------------------------
  /** scope："current" 当前页 PNG；"all" 全部页 zip。渲染对象是磁盘上的项目，
   *  故导出前先把未保存修改写回（写回失败按最近保存版本导出并提示）。 */
  async function exportImages(scope) {
    // 渲染服务按项目路径寻址：本地文件夹模式（句柄）与空白项目无服务端路径
    if (state.projectHandle || !state.manifestPath) {
      showToast("导出图片需通过 serve 打开的 URL 项目使用（本地文件夹模式无渲染服务）", "danger", 6000);
      return;
    }
    if (state.dirty) {
      try {
        await saveProject({ zipFallback: false });
      } catch {
        showToast("修改未能写回磁盘：按最近保存的版本导出", "info", 6000);
      }
    }
    let deck;
    try {
      deck = decodeURIComponent(new URL(state.manifestPath).pathname).replace(/^\/+/, "");
    } catch {
      showToast(`无效的项目地址: ${state.manifestPath}`, "danger");
      return;
    }
    showToast("正在渲染图片…（每页数秒，取决于页数与图表复杂度）", "info", 10_000);
    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deck,
          page: scope === "all" ? "all" : state.currentPage + 1,
          scale: 2,
        }),
      });
      if (res.status === 404) {
        showToast("导出图片仅本地 serve 模式可用（线上部署无渲染服务）", "danger", 6000);
        return;
      }
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const dispo = res.headers.get("Content-Disposition") || "";
      const name =
        decodeURIComponent(
          /filename\*=UTF-8''([^;]+)/i.exec(dispo)?.[1] || /filename="?([^";]+)"?/i.exec(dispo)?.[1] || ""
        ) || "images.png";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`已导出 ${name}（${(blob.size / 1024).toFixed(1)} KB）`, "success");
    } catch (err) {
      showToast(`导出图片失败: ${err.message}`, "danger");
      console.error(err);
    }
  }

  return { exportPptx, exportProjectZip: doExportZip, exportImages, saveProject };
}
