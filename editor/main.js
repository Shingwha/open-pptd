// ============================================================================
// main.js — standalone 入口（薄组合根）
// ----------------------------------------------------------------------------
// 只负责"从哪里打开、挂到哪、暴露哪些测试钩子"，编辑器装配全部在 editor.js：
//   - ?shot=1        → 无头截图模式（app/shot.js，跳过编辑器 UI）
//   - ?deck=<项目>    → createEditor + httpSource({ deckUrl })
//   - 有会话恢复标记  → 续开上次本地项目（授权有效直开，否则弹恢复卡片）
//   - 否则           → 空白编辑器
//
// 对外契约（零行为变化，消费端见 tests/e2e/incremental-load.mjs、
// packages/renderer/headless/shoot.js）：
//   window.__pptdEditor = ed.api   编辑器操作门面
//   window.__pptdIo     = ed.io    项目 IO（e2e 调 saveProject() 验证写回）
//   window.__pptdShot              shot 截图模式专用（由 app/shot.js 设置）
// ============================================================================

import { createEditor } from "./editor.js";
import { httpSource } from "./app/project/source.js";
import { showToast } from "./app/toast.js";
import { ensurePermission } from "./app/project/handle-io.js";
import {
  getRecent,
  getPendingProjectId,
  clearPendingProject,
  addRecent,
  setPendingProject,
} from "./app/project/handle-store.js";
import { showDialog } from "./interaction/dialogs/base.js";
import { SHOT_ERROR_TITLE } from "../packages/model/model.js";

// 仓库根 URL（本文件位于 <root>/editor/，../ 即站点根）
const ROOT = new URL("../", import.meta.url).href;

/**
 * 本地项目会话恢复：上次打开的本地项目（画廊跳转 / 编辑器刷新）——授权仍有效
 * 则直接续开；否则弹恢复卡片，点「打开」在用户手势里重新授权（浏览器要求）。
 * @param {object} io 编辑器 io 面
 * @param {string|null} pendingId 启动前捕获的待恢复条目 id（空白初始化会清标记）
 */
async function restorePendingProject(io, pendingId) {
  if (!pendingId) return false;
  const entry = await getRecent(pendingId);
  if (!entry?.handle) {
    clearPendingProject();
    return false;
  }
  let granted = false;
  try {
    granted = (await entry.handle.queryPermission({ mode: "readwrite" })) === "granted";
  } catch {
    /* 句柄失效 → 走卡片让用户确认 */
  }
  if (granted) {
    try {
      await io.loadDeckFromHandle(entry.handle);
      return true;
    } catch (err) {
      showToast(`恢复项目失败: ${err.message}`, "danger");
    }
  }
  showRestoreCard(io, entry);
  return true;
}

/** 恢复卡片：项目名 + [新建空白 / 打开项目]（打开在点击手势里请求授权）。
 * 走 showDialog 基础设施；无 ✕ / 遮罩关闭——必须显式二选一（误关会丢会话入口）。 */
function showRestoreCard(io, entry) {
  const hint = document.createElement("div");
  hint.className = "prop-hint";
  hint.textContent = `上次打开的「${entry.name}」。浏览器要求重新授权后才能访问该文件夹。`;

  const blankBtn = document.createElement("button");
  blankBtn.type = "button";
  blankBtn.className = "btn btn-sm";
  blankBtn.textContent = "新建空白演示";
  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "btn btn-primary btn-sm";
  openBtn.textContent = "打开项目";

  const { close } = showDialog("恢复本地项目", hint, {
    panelClass: "restore-card",
    closeBtn: false,
    overlayClose: false,
    buttons: [blankBtn, openBtn],
  });

  blankBtn.onclick = () => {
    clearPendingProject();
    close();
    showToast("已新建空白演示", "info");
  };
  openBtn.onclick = async () => {
    openBtn.disabled = true;
    try {
      if (!(await ensurePermission(entry.handle))) {
        openBtn.disabled = false;
        showToast("未获得文件夹访问授权", "danger");
        return;
      }
      await io.loadDeckFromHandle(entry.handle);
      const fresh = await addRecent(entry.handle);
      if (fresh) setPendingProject(fresh.id);
      close();
    } catch (err) {
      openBtn.disabled = false;
      showToast(`打开失败: ${err.message}`, "danger");
    }
  };
}

// ----------------------------------------------------------------------------
// 启动：?shot=1 截图；?deck= 加载指定项目；有会话恢复标记则续开；否则空白
// ----------------------------------------------------------------------------
async function boot() {
  const params = new URLSearchParams(location.search);
  const deckParam = params.get("deck");
  const deckUrl = deckParam ? (/^https?:/.test(deckParam) ? deckParam : new URL(deckParam, ROOT).href) : null;
  if (params.get("shot") === "1") {
    // 无头截图模式（open-pptd render 使用）：跳过编辑器 UI，只渲染页面
    import("./app/shot.js")
      .then((m) => m.initShot(deckUrl))
      .catch((err) => {
        console.error("[shot] 初始化失败:", err);
        document.title = SHOT_ERROR_TITLE;
      });
    return;
  }

  // 空白初始化会清掉会话标记，故先捕获待恢复 id
  const pendingId = deckUrl ? null : getPendingProjectId();
  const root = document.getElementById("pptd-root") || document.body;
  const ed = createEditor(root, {
    source: httpSource({ deckUrl }),
    deckUrl: deckUrl || null, // ?deck= 存在时加载它；否则 createEditor 静默空白
    chrome: "full",
  });

  // 对外测试钩子（ui-shots.mjs / incremental-load.mjs / shoot.js 依赖）
  window.__pptdEditor = ed.api;
  window.__pptdIo = ed.io;

  if (deckUrl) {
    clearPendingProject(); // URL 项目优先，清掉本地项目会话标记
    return;
  }
  if (await restorePendingProject(ed.io, pendingId)) return;
  showToast("已新建空白演示", "info");
}

boot();
