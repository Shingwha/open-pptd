// ============================================================================
// app/project/live-reload.js — 实时刷新（SSE）+ 状态栏
// ----------------------------------------------------------------------------
// 订阅 server 的 /events 文件变更推送：无未保存修改时自动重载（保留当前页），
// 有未保存修改时跳过并提示。部署模式（GitHub Pages，无 /events 端点）自动
// 不启用。保存方经 suppressRefreshes 短暂抑制自己触发的刷新回环。
// 依赖注入：reload（= loader.loadDeck 的刷新调用）、manualReload（状态栏按钮）。
// ============================================================================

import { showToast } from "../toast.js";

export function createLiveReload({ state, reload, manualReload }) {
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
      reload().catch((err) => {
        // 加载失败（文件半成品）：保留当前视图，修复后下轮推送会再次触发
        showToast(`文件变更后加载失败（已保留当前视图）: ${err.message}`, "danger");
      });
    };
  }

  /** 保存后短暂抑制 SSE 刷新（避免自己保存触发的回环）。 */
  function suppressRefreshes() {
    suppressUntil = Date.now() + 1500;
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
    document.getElementById("btn-reload")?.addEventListener("click", manualReload);
  }

  return { connectLiveReload, suppressRefreshes, renderStatusBar };
}
