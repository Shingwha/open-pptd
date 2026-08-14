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

export function createProjectSaver({ state, images, fontManager, renderStatusBar, onSaved }) {
  // --------------------------------------------------------------------------
  // 导出 PPTX
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

  // --------------------------------------------------------------------------
  // 保存项目
  // --------------------------------------------------------------------------
  async function saveProject() {
    fontManager.syncToDeck(); // 字体库（嵌入勾选）→ deck.fonts 资源表，随项目落盘
    const files = serializeDeck(state.deck, {
      manifestName: state.manifestPath?.split("/").pop() || "deck.pptd",
    }).map((f) => ({ path: f.path, content: f.content }));
    // dataURL 图片 → media/ 文件条目（路径重写与映射更新在 persistDataUrlImages 内完成）
    files.push(...images.persistDataUrlImages());
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.dirty = false;
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

  return { exportPptx, saveProject };
}
