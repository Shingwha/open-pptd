// ============================================================================
// app/project/saver.js — saving and exporting
// ----------------------------------------------------------------------------
// Save project (single entry saveProject): writes always go through the injected
// ProjectSource (app/project/source.js); this module no longer contains a
// fetch("/api/save") literal:
//   - source.capabilities.writable === false → degrade straight to "download project zip"
//   - write() throws (no /api/save endpoint in deploy mode) → degrade to zip too (behavior kept)
//   - a write-back failure for a local handle project → explicit error (no silent degrade, behavior kept)
//   - revision conflict (ERR_REVISION_CONFLICT) → explicit 覆盖 / 重新加载 / 取消 dialog
// Export (PPTX / bundle / PNG) is delegated to the browser ExportService adapter
// (./export-service.js): no zip/preflight/report logic remains in this module.
// Dependency injection: images (dataURL image persistence), fontManager, source
// (transport), onSaved (suppress the SSE refresh loop after a successful save),
// renderStatusBar, reload (conflict "重新加载"), onError.
// ============================================================================

import { commitBaseline } from "../state.js";
import { createImageExporter, formatBytes } from "../export-image.js";
import { createBrowserExportService } from "./export-service.js";
import { base64ToBytes, deckSize, serializeDeck } from "../../../packages/model/index.js";
import { revisionOfSourceFiles } from "./source.js";

/** Export dialog chip (single-select / multi-select share the same construction). */
function makeChip(text, { active = false, onClick } = {}) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "export-chip" + (active ? " on" : "");
  chip.textContent = text;
  if (onClick) chip.onclick = onClick;
  return chip;
}

export function createProjectSaver({ state, images, fontManager, source, ui, renderStatusBar, onSaved, onError, reload }) {
  const { toast, dialogs } = ui;
  /** Save succeeded: record the current deck as the on-disk baseline (undo back to it = clean, not blanket-dirty). */
  const markSaved = () => commitBaseline(state);
  /** Browser ExportService adapter: PPTX / bundle / PNG all go through packages/export. */
  const exportService = createBrowserExportService({ state, fontManager });
  const baseNameOf = (path) => String(path || "").split(/[\\/]/).pop() || "export.bin";
  const reportError = (report, fallback) => new Error(report?.errors?.join("；") || fallback);
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
      const chip = makeChip(text, {
        active: val === fullFonts,
        onClick: () => {
          fullFonts = val;
          scopeChips.forEach((c) => c.classList.toggle("on", c === chip));
          renderHint();
        },
      });
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
        if (bytes) text += `；完整模式预计 +${formatBytes(bytes)}`;
      }
      hint.textContent = text;
    };
    renderHint();
    wrap.appendChild(hint);
    const mgrBtn = document.createElement("button");
    mgrBtn.className = "btn btn-sm";
    mgrBtn.textContent = "字体管理…";
    mgrBtn.title = "打开「设计 → 字体」";
    mgrBtn.addEventListener("click", () => {
      close();
      // Decoupled jump: the editor toolbar owns the Design panel deps
      window.dispatchEvent(new CustomEvent("pptd:open-design", { detail: { tab: "fonts" } }));
    });
    wrap.appendChild(mgrBtn);
    const { close } = dialogs.showDialog("导出 PPTX", wrap, {
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
        toast.show("正在导出 PPTX…", "info", 8000);
        const report = await exportService.exportPptx({ embedFonts, fullFonts });
        if (!report.ok) throw reportError(report, "PPTX 导出失败");
        const name = baseNameOf(report.files?.[0]) || "deck.pptx";
        toast.show(`已导出 ${name}（${formatBytes(report.bytes || 0)}）`, "success");
        if (report.skipped?.length) {
          console.warn(`[export] ${report.skipped.length} 个字体未嵌入:`, report.skipped);
          toast.show(
            `⚠ ${report.skipped.length} 个字体未嵌入（${report.skipped.map((s) => s.family).join(", ")}），打开时可能回退系统字体`,
            "danger",
            6000
          );
        }
        if (report.missing?.length) {
          console.warn("[export] 缺失资源:", report.missing);
        }
      } catch (err) {
        toast.show(`导出失败: ${err.message}`, "danger");
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
   * two no longer align implementations. Packaging itself now lives in
   * packages/export (bundle format), not here.
   */
  async function doExportZip() {
    try {
      toast.show("正在导出项目包…", "info", 8000);
      const report = await exportService.exportBundle();
      if (!report.ok) throw reportError(report, "项目包导出失败");
      const name = baseNameOf(report.files?.[0]) || "project.zip";
      toast.show(`项目包已导出 ${name}（${formatBytes(report.bytes || 0)}）`, "success");
    } catch (err) {
      toast.show(`导出项目包失败: ${err.message}`, "danger");
      console.error(err);
    }
  }

  function exportPptx() {
    openExportDialog();
  }

  // --------------------------------------------------------------------------
  // Save project
  // --------------------------------------------------------------------------
  /** Write through the source, updating the editor revision on success. */
  async function writeSources(sources, { skipRevision = false } = {}) {
    const expectedRevision = skipRevision ? undefined : state.revision ?? undefined;
    const count = await source.write(sources, expectedRevision == null ? undefined : { expectedRevision });
    // Server/handle sources report the authoritative revision; fall back to the texts we wrote.
    state.revision = source.lastRevision || revisionOfSourceFiles(sources);
    return count;
  }

  /** Conflict dialog: overwrite / reload / cancel (must be explicit — never a silent overwrite). */
  function askConflict(err) {
    return new Promise((resolve) => {
      const wrap = document.createElement("div");
      wrap.className = "prop-hint";
      wrap.textContent =
        `项目已在其他窗口或磁盘上被修改（当前版本 ${err?.currentRevision ?? "未知"}）。` +
        "覆盖保存会丢弃对方的修改；重新加载会放弃当前编辑并读取磁盘版本。";
      const make = (text, className, value) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `btn btn-sm${className ? ` ${className}` : ""}`;
        btn.textContent = text;
        btn.onclick = () => {
          close();
          resolve(value);
        };
        return btn;
      };
      const { close } = dialogs.showDialog("项目已被外部修改", wrap, {
        buttons: [
          make("取消", "", "cancel"),
          make("重新加载磁盘版本", "", "reload"),
          make("覆盖保存", "btn-danger", "overwrite"),
        ],
        closeBtn: false,
        overlayClose: false,
      });
    });
  }

  async function saveProject() {
    fontManager.syncToDeck(); // font library (embed checkboxes) → deck.fonts resource table, persisted with the project
    // Persist dataURL images first (rewrite el.src to media/ paths); the serialized pages reference media files cleanly
    const mediaFiles = images.persistDataUrlImages();
    const files = serializeDeck(state.deck, {
      manifestName: state.manifestPath?.split("/").pop() || "deck.pptd",
    }).map((f) => ({ path: f.path, content: f.content }));
    files.push(...mediaFiles);
    const sources = files.map(toSourceFile);
    // Transport seam: ProjectSource.write (HTTP POST /api/save or handle write-back, decided by assembly)
    const writable = source && source.capabilities?.writable !== false;
    if (writable) {
      try {
        const count = await writeSources(sources);
        markSaved();
        onSaved(); // suppress the auto-refresh loop triggered by polling/push
        renderStatusBar();
        toast.show(
          state.projectHandle
            ? `已保存 ${count} 个文件到 ${state.projectName || "项目文件夹"}`
            : `已保存 ${count} 个文件到项目目录`,
          "success"
        );
        return;
      } catch (err) {
        if (err?.code === "ERR_REVISION_CONFLICT") {
          const action = await askConflict(err);
          if (action === "overwrite") {
            try {
              const count = await writeSources(sources, { skipRevision: true });
              markSaved();
              onSaved();
              renderStatusBar();
              toast.show(`已覆盖保存 ${count} 个文件（外部修改已被当前版本替换）`, "success");
            } catch (err2) {
              toast.show(`保存失败: ${err2.message}`, "danger");
              console.error(err2);
              onError?.(err2);
            }
            return;
          }
          if (action === "reload") {
            try {
              await reload?.();
              toast.show("已重新加载磁盘版本（当前编辑已放弃）", "info");
            } catch (err2) {
              toast.show(`重新加载失败: ${err2.message}`, "danger");
              console.error(err2);
              onError?.(err2);
            }
            return;
          }
          toast.show("已取消保存", "info");
          return;
        }
        if (state.projectHandle) {
          // Handle write-back failed: report explicitly (no degrade-to-download, behavior kept)
          toast.show(`保存失败: ${err.message}`, "danger");
          console.error(err);
          onError?.(err);
          return;
        }
        // URL-mode write-back failed (no /api/save in deploy mode): degrade to downloading the project zip
      }
    }
    saveProjectAsZip();
  }

  /** Internal save entry → ProjectSource.write contract (text / bytes). */
  function toSourceFile(f) {
    return f.b64 != null ? { path: f.path, bytes: base64ToBytes(f.b64) } : { path: f.path, text: f.content };
  }

  /** Deploy-mode save: download the editing-session bundle (same packaging as "导出项目文件"). */
  async function saveProjectAsZip() {
    try {
      const report = await exportService.exportBundle();
      if (!report.ok) throw reportError(report, "项目包导出失败");
      const name = baseNameOf(report.files?.[0]) || "project.zip";
      markSaved();
      renderStatusBar();
      toast.show(`项目已打包下载 ${name}（${formatBytes(report.bytes || 0)}）`, "success");
    } catch (err) {
      toast.show(`保存失败: ${err.message}`, "danger");
      console.error(err);
    }
  }

  // Image export (PNG packaging paths live in the ExportService adapter; this keeps the UI toasts)
  const imageExporter = createImageExporter({ state, toast, exportService });

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
      const chip = makeChip(i + 1, {
        active: selected.has(i),
        onClick: () => {
          selected.has(i) ? selected.delete(i) : selected.add(i);
          chip.classList.toggle("on", selected.has(i));
          renderHead();
        },
      });
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
      const chip = makeChip(text, {
        active: val === mode,
        onClick: () => {
          mode = val;
          modeChips.forEach((c) => c.classList.toggle("on", c === chip));
        },
      });
      modeBox.appendChild(chip);
      return chip;
    });

    // —— Multiplier: single-select chips annotated with output pixels ——
    let scale = 2;
    const scaleBox = document.createElement("div");
    scaleBox.className = "export-img-chips";
    const scaleChips = [1, 2, 3].map((n) => {
      const chip = makeChip(`${n}x · ${dw * n}×${dh * n}`, {
        active: n === scale,
        onClick: () => {
          scale = n;
          scaleChips.forEach((c, m) => c.classList.toggle("on", [1, 2, 3][m] === n));
        },
      });
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

    const { close } = dialogs.showDialog("导出图片", wrap, {
      doneText: "导出",
      onDone() {
        if (!selected.size) {
          toast.show("请至少选择一页", "danger");
          return;
        }
        close();
        imageExporter.exportImages({ pages: [...selected].sort((a, b) => a - b), scale, mode });
      },
    });
  }

  return { exportPptx, exportProjectZip: doExportZip, exportImages: openImageExportDialog, saveProject };
}
