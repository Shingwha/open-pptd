// ============================================================================
// app/project/saver.js — saving and exporting
// ----------------------------------------------------------------------------
// Save project (single entry saveProject): writes always go through the injected
// ProjectSource (app/project/source.js); this module no longer contains a
// fetch("/api/save") literal:
//   - source.capabilities.writable === false → degrade straight to "download project zip"
//   - write() throws (no /api/save endpoint in deploy mode) → degrade to zip too (behavior kept)
//   - a write-back failure for a local handle project → explicit error (no silent degrade, behavior kept)
// Export PPTX (exportPptx): dialog with the font-embed checkbox + embed scope
// (subset/full) → buildPptx → download. Dependency injection: images (dataURL
// image persistence), fontManager (font library sync/embed), source (transport),
// onSaved (suppress the SSE refresh loop after a successful save), renderStatusBar.
// ============================================================================

import { showToast } from "../toast.js";
import { commitBaseline } from "../state.js";
import { showDialog } from "../../interaction/dialogs/base.js";
import { openFontPanel } from "../../interaction/font-panel.js";
import { createImageExporter } from "../export-image.js";
import { mediaFilesOfDeck } from "./images.js";
import { base64ToBytes, deckSize, serializeDeck } from "../../../packages/model/index.js";
import { ZipWriter, buildPptx, downloadBlob, downloadPptx, safeFileName } from "../../../packages/writer/index.js";

/** Byte count → human-readable (MB to one decimal / KB rounded). */
const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

export function createProjectSaver({ state, images, fontManager, renderStatusBar, onSaved, onError, source }) {
  /** Save succeeded: record the current deck as the on-disk baseline (undo back to it = clean, not blanket-dirty). */
  const markSaved = () => commitBaseline(state);
  // --------------------------------------------------------------------------
  // Export (PPTX dialog / project zip direct; entry points in the topbar File menu)
  // --------------------------------------------------------------------------
  /** Export PPTX dialog: font-embed checkbox (on by default) + embed scope (subset/full) + font-manager entry. */
  function openExportDialog() {
    const wrap = document.createElement("div");
    wrap.className = "export-pptx-opts";
    const embedCb = document.createElement("input");
    embedCb.type = "checkbox";
    embedCb.checked = true;
    const label = document.createElement("label");
    label.className = "prop-check";
    label.append(embedCb, document.createTextNode("嵌入字体（文件更大，换机打开不丢字体）"));
    wrap.appendChild(label);

    // —— Embed scope: subset (default, only used glyphs) / full (everything, so new text can be edited after export) ——
    let fullFonts = false;
    const scope = document.createElement("div");
    scope.className = "export-pptx-scope";
    const scopeLabel = document.createElement("div");
    scopeLabel.className = "export-img-label";
    scopeLabel.textContent = "嵌入范围";
    const scopeBox = document.createElement("div");
    scopeBox.className = "export-img-chips";
    const scopeChips = [
      [false, "子集（体积小）"],
      [true, "完整（可编辑）"],
    ].map(([val, text]) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "export-chip" + (val === fullFonts ? " on" : "");
      chip.textContent = text;
      chip.onclick = () => {
        fullFonts = val;
        scopeChips.forEach((c) => c.classList.toggle("on", c === chip));
        renderHint();
      };
      scopeBox.appendChild(chip);
      return chip;
    });
    scope.append(scopeLabel, scopeBox);
    wrap.appendChild(scope);
    embedCb.addEventListener("change", () => scope.classList.toggle("off", !embedCb.checked));

    const hint = document.createElement("div");
    hint.className = "prop-hint";
    const renderHint = () => {
      const embedded = Object.keys(state.fontLibrary).filter((k) => state.fontLibrary[k].embed);
      let text = embedded.length
        ? `当前 ${embedded.length} 个字体将嵌入（${embedded.join(" / ")}）`
        : "当前没有待嵌入字体；可在「字体管理」中添加本地或网络字体。";
      if (fullFonts && embedded.length) {
        // The full-scope delta is estimated from font-library bytes (a lower bound when some font bytes are not preloaded)
        const bytes = embedded.reduce((n, k) => n + (state.fontLibrary[k].bytes?.length || 0), 0);
        if (bytes) text += `；完整模式预计 +${fmtSize(bytes)}`;
      }
      hint.textContent = text;
    };
    renderHint();
    wrap.appendChild(hint);
    const mgrBtn = document.createElement("button");
    mgrBtn.className = "btn btn-sm";
    mgrBtn.textContent = "字体管理…";
    mgrBtn.addEventListener("click", () => {
      close();
      openFontPanel(); // close the export box, open the font popover (no stacked masks)
    });
    wrap.appendChild(mgrBtn);
    const { close } = showDialog("导出 PPTX", wrap, {
      doneText: "导出",
      onDone() {
        close();
        doExport(embedCb.checked, fullFonts);
      },
    });
  }

  function doExport(embedFonts, fullFonts = false) {
    (async () => {
      try {
        const skipped = [];
        const bytes = await buildPptx(state.deck, {
          imageMap: state.imageMap,
          iconDefs: state.iconMap, // icon preload cache (icons.js; loadIconDefs fills in un-preloaded entries)
          fontFiles: embedFonts ? fontManager.exportFontFiles() : null,
          embedFonts,
          fullFonts,
          onFontSkipped: (list) => skipped.push(...list),
        });
        const name = safeFileName(state.deck.title || "deck") + ".pptx";
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
   * Export the project bundle (zip): deck.pptd + pages/ + media/, named the same
   * as CLI export-project. Semantics note (v3 #6): the difference from CLI
   * `export-project` is intentional — the CLI packages disk files as-is (keeping
   * comments/formatting, reflecting disk state); the browser exports the
   * **current editing session** (possibly with unsaved changes), which must be
   * re-serialized from the model, so comments/raw formatting are not preserved.
   * "Disk as-is" is the CLI's job, "editing-session snapshot" the browser's; the
   * two no longer align implementations.
   */
  async function doExportZip() {
    try {
      fontManager.syncToDeck(); // font resource table → deck.fonts, carried in the bundle
      // Collect images and serialize the snapshot — exporting does not change the current editing session
      // (imageMap covers both inline dataURLs and persisted relative-path references, so the zip has all bytes)
      const snapshot = JSON.parse(JSON.stringify(state.deck));
      const mediaFiles = mediaFilesOfDeck(snapshot, state.imageMap);
      const files = serializeDeck(snapshot, {
        manifestName: state.manifestPath?.split("/").pop() || "deck.pptd",
      });
      const zip = new ZipWriter();
      for (const f of files) zip.add(f.path, f.content);
      for (const m of mediaFiles) zip.add(m.path, base64ToBytes(m.b64));
      const bytes = zip.build();
      const name = safeFileName(state.deck.title || "deck") + "-project.zip";
      downloadBlob(bytes, name, "application/zip");
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
  // Save project
  // --------------------------------------------------------------------------
  async function saveProject() {
    fontManager.syncToDeck(); // font library (embed checkboxes) → deck.fonts resource table, persisted with the project
    // Persist dataURL images first (rewrite el.src to media/ paths); the serialized pages reference media files cleanly
    const mediaFiles = images.persistDataUrlImages();
    const files = serializeDeck(state.deck, {
      manifestName: state.manifestPath?.split("/").pop() || "deck.pptd",
    }).map((f) => ({ path: f.path, content: f.content }));
    files.push(...mediaFiles);
    // Transport seam: ProjectSource.write (HTTP POST /api/save or handle write-back, decided by assembly)
    const writable = source && source.capabilities?.writable !== false;
    if (writable) {
      try {
        const count = await source.write(files.map(toSourceFile));
        markSaved();
        onSaved(); // suppress the auto-refresh loop triggered by polling/push
        renderStatusBar();
        showToast(
          state.projectHandle
            ? `已保存 ${count} 个文件到 ${state.projectName || "项目文件夹"}`
            : `已保存 ${count} 个文件到项目目录`,
          "success"
        );
        return;
      } catch (err) {
        if (state.projectHandle) {
          // Handle write-back failed: report explicitly (no degrade-to-download, behavior kept)
          showToast(`保存失败: ${err.message}`, "danger");
          console.error(err);
          onError?.(err);
          return;
        }
        // URL-mode write-back failed (no /api/save in deploy mode): degrade to downloading the project zip
      }
    }
    saveProjectAsZip(files);
  }

  /** Internal save entry → ProjectSource.write contract (text / bytes). */
  function toSourceFile(f) {
    return f.b64 != null ? { path: f.path, bytes: base64ToBytes(f.b64) } : { path: f.path, text: f.content };
  }

  /** Deploy-mode save: package and download (the zip path of the original saveProject). */
  async function saveProjectAsZip(files) {
    try {
      const zip = new ZipWriter();
      for (const f of files) {
        zip.add(f.path, f.b64 ? base64ToBytes(f.b64) : f.content);
      }
      const bytes = zip.build();
      downloadBlob(bytes, "project.zip", "application/zip");
      markSaved();
      renderStatusBar();
      showToast(`项目已打包下载（${(bytes.length / 1024).toFixed(1)} KB）`, "success");
    } catch (err) {
      showToast(`保存失败: ${err.message}`, "danger");
      console.error(err);
    }
  }

  // Image export (pure front end, standalone module: offscreen render → foreignObject → PNG at the chosen multiplier)
  const imageExporter = createImageExporter({ state });

  /** Image-export dialog: arbitrary page checkboxes (multi-select) + multiplier (1x/2x/3x, default 2x, showing output pixels for the canvas size). */
  function openImageExportDialog() {
    const [dw, dh] = deckSize(state.deck);
    const wrap = document.createElement("div");
    wrap.className = "export-img-opts";

    // —— Scope: page chips (default current page), select-all/clear shortcuts + selected count ——
    const selected = new Set([state.currentPage]);
    const pagesHead = document.createElement("div");
    pagesHead.className = "export-img-head";
    const toggleAll = document.createElement("button");
    toggleAll.type = "button";
    toggleAll.className = "btn btn-sm";
    const countEl = document.createElement("span");
    countEl.className = "export-img-count";
    const renderHead = () => {
      countEl.textContent = `已选 ${selected.size} / ${state.deck.pages.length} 页`;
      toggleAll.textContent = selected.size === state.deck.pages.length ? "清空" : "全选";
    };
    toggleAll.onclick = () => {
      selected.size === state.deck.pages.length ? selected.clear() : state.deck.pages.forEach((_, i) => selected.add(i));
      chips.forEach((c, i) => c.classList.toggle("on", selected.has(i)));
      renderHead();
    };
    pagesHead.append(toggleAll, countEl);

    const chipsBox = document.createElement("div");
    chipsBox.className = "export-img-chips";
    const chips = state.deck.pages.map((_, i) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "export-chip" + (selected.has(i) ? " on" : "");
      chip.textContent = i + 1;
      chip.onclick = () => {
        selected.has(i) ? selected.delete(i) : selected.add(i);
        chip.classList.toggle("on", selected.has(i));
        renderHead();
      };
      chipsBox.appendChild(chip);
      return chip;
    });
    renderHead();

    // —— Packaging: zip bundle (default) / one download each ——
    let mode = "zip";
    const modeBox = document.createElement("div");
    modeBox.className = "export-img-chips";
    const modeChips = [
      ["zip", "zip 打包"],
      ["files", "逐张下载"],
    ].map(([val, text]) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "export-chip" + (val === mode ? " on" : "");
      chip.textContent = text;
      chip.onclick = () => {
        mode = val;
        modeChips.forEach((c) => c.classList.toggle("on", c === chip));
      };
      modeBox.appendChild(chip);
      return chip;
    });

    // —— Multiplier: single-select chips annotated with output pixels ——
    let scale = 2;
    const scaleBox = document.createElement("div");
    scaleBox.className = "export-img-chips";
    const scaleChips = [1, 2, 3].map((n) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "export-chip" + (n === scale ? " on" : "");
      chip.textContent = `${n}x · ${dw * n}×${dh * n}`;
      chip.onclick = () => {
        scale = n;
        scaleChips.forEach((c, m) => c.classList.toggle("on", [1, 2, 3][m] === n));
      };
      scaleBox.appendChild(chip);
      return chip;
    });

    const hint = document.createElement("div");
    hint.className = "prop-hint";
    hint.textContent = `倍率是输出图片相对画布尺寸的放大倍数，越大越清晰、文件也越大；分享场景 2x 已足够。所选页面按当前编辑现场渲染，多页可 zip 打包或逐张下载。`;

    wrap.append(
      Object.assign(document.createElement("div"), { className: "export-img-label", textContent: "导出页面" }),
      pagesHead,
      chipsBox,
      Object.assign(document.createElement("div"), { className: "export-img-label", textContent: "倍率" }),
      scaleBox,
      Object.assign(document.createElement("div"), { className: "export-img-label", textContent: "打包方式" }),
      modeBox,
      hint
    );

    const { close } = showDialog("导出图片", wrap, {
      doneText: "导出",
      onDone() {
        if (!selected.size) {
          showToast("请至少选择一页", "danger");
          return;
        }
        close();
        imageExporter.exportImages({ pages: [...selected].sort((a, b) => a - b), scale, mode });
      },
    });
  }

  return { exportPptx, exportProjectZip: doExportZip, exportImages: openImageExportDialog, saveProject };
}
