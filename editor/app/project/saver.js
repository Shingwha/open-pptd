// ============================================================================
// app/project/saver.js — 保存与导出
// ----------------------------------------------------------------------------
// 保存项目（统一入口 saveProject）：
//   - 本地挂载模式：POST /api/save 批量写回磁盘（文本 utf8 / 图片 base64）
//   - 部署模式（/api/save 不存在）：降级打包下载项目 zip 备份
// 导出 PPTX（exportPptx）：对话框勾选字体嵌入 + 嵌入范围（子集/完整）→ buildPptx → 下载。
// 依赖注入：images（dataURL 图片落盘）、fontManager（字体库同步/嵌入）、
// onSaved（保存成功后抑制 SSE 刷新回环）、renderStatusBar。
// ============================================================================

import { serializeDeck } from "../../../packages/model/pptd-io.js";
import { base64ToBytes } from "../../../packages/model/bytes.js";
import { deckSize } from "../../../packages/model/model.js";
import { buildPptx, downloadPptx, downloadBlob } from "../../../packages/writer/pptx.js";
import { safeFileName } from "../../../packages/writer/util.js";
import { ZipWriter } from "../../../packages/writer/zip.js";
import { showToast } from "../toast.js";
import { showDialog } from "../../interaction/dialogs/base.js";
import { openFontPanel } from "../../interaction/font-panel.js";
import { writeFiles } from "./handle-io.js";
import { createImageExporter } from "../export-image.js";
import { mediaFilesOfDeck } from "./images.js";

/** 字节数 → 人类可读（MB 一位小数 / KB 取整）。 */
const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

export function createProjectSaver({ state, images, fontManager, renderStatusBar, onSaved }) {
  /** 保存成功：当前 deck 记为已落盘基线（撤销回它即恢复干净，不再一律标脏）。 */
  const markSaved = () => {
    state.savedDeck = structuredClone(state.deck);
    state.dirty = false;
  };
  // --------------------------------------------------------------------------
  // 导出（PPTX 对话框 / 项目包 zip 直达，入口在顶栏「文件」菜单）
  // --------------------------------------------------------------------------
  /** 导出 PPTX 对话框：嵌入字体勾选（默认开）+ 嵌入范围（子集/完整）+ 字体管理入口。 */
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

    // —— 嵌入范围：子集（缺省，仅已用字形）/ 完整（全量，导出后可继续编辑新文字）——
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
        // 全量增量按字体库字节估算（个别字体字节未预载时为下限）
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
      openFontPanel(); // 关导出框、开字体浮层（不再叠加两层遮罩）
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
          iconDefs: state.iconMap, // 图标预读缓存（icons.js；未预载项由 loadIconDefs 回源补齐）
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
      downloadBlob(bytes, "project.zip", "application/zip");
      markSaved();
      renderStatusBar();
      showToast(`项目已打包下载（${(bytes.length / 1024).toFixed(1)} KB）`, "success");
    } catch (err) {
      showToast(`保存失败: ${err.message}`, "danger");
      console.error(err);
    }
  }

  // 图片导出（纯前端，独立模块：离屏渲染 → foreignObject → 按倍率 PNG）
  const imageExporter = createImageExporter({ state });

  /** 导出图片对话框：任意勾选页面（多选）+ 倍率（1x/2x/3x，默认 2x，按画布尺寸显示输出像素）。 */
  function openImageExportDialog() {
    const [dw, dh] = deckSize(state.deck);
    const wrap = document.createElement("div");
    wrap.className = "export-img-opts";

    // —— 范围：页面 chips 多选（默认当前页），全选/清空快捷钮 + 已选计数 ——
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

    // —— 打包方式：zip 打包（缺省）/ 逐张下载 ——
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

    // —— 倍率：单选 chips，标注输出像素 ——
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
