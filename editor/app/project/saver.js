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

import { serializeDeck } from "../../core/pptd-io.js";
import { buildPptx, downloadPptx } from "../../writer/pptx.js";
import { ZipWriter } from "../../writer/zip.js";
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

  /** 导出项目包（zip）：deck.pptd + pages/ + media/，命名与 CLI export-project 一致。 */
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
  async function saveProject() {
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

  /** base64 → Uint8Array（zip 打包用）。 */
  function base64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  return { exportPptx, exportProjectZip: doExportZip, saveProject };
}
