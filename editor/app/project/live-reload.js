// ============================================================================
// app/project/live-reload.js — 实时刷新（句柄轮询 / SSE）+ 顶栏状态指示
// ----------------------------------------------------------------------------
// 两种项目来源，同一条承诺——外部改文件后编辑器自动重载（保留当前页），
// 有未保存修改时跳过并提示，保存方经 suppressRefreshes 抑制刷新回环：
//   - 本地项目句柄（官方文件夹选择器打开）：轮询 manifest+pages 指纹
//     （handle-io.fingerprint，语义同服务端 dirFingerprint）
//   - URL 模式（serve --project 挂载）：订阅 server 的 /events SSE 推送；
//     部署模式（GitHub Pages，无 /events）自动不启用
// 依赖注入：reload（URL 模式刷新）、reloadHandle（句柄模式刷新）、
// manualReload（顶栏「实时」标记点击 = 手动从磁盘重新加载，dirty 时确认）。
// ============================================================================

import { showToast } from "../toast.js";
import { fingerprint } from "./handle-io.js";

const POLL_MS = 900;

export function createLiveReload({ state, reload, reloadHandle, manualReload }) {
  let sse = null;
  let pollTimer = null;
  let polledHandle = null;
  let liveMode = false; // 已确认可用的实时通道（SSE onopen / 首轮指纹成功）
  let suppressUntil = 0; // 保存后短暂抑制（避免自己保存触发的刷新）

  /** 项目就绪后订阅（幂等；随当前项目来源自动选轮询或 SSE；空白项目断开旧通道）。 */
  function connectLiveReload() {
    if (!state.projectHandle && !state.manifestPath) {
      stopPolling();
      stopSse();
      return;
    }
    if (state.projectHandle) {
      stopSse();
      startPolling();
      return;
    }
    stopPolling();
    connectSse();
  }

  // ---------------------------------------------------------------- 句柄轮询
  function startPolling() {
    const handle = state.projectHandle;
    if (pollTimer && polledHandle === handle) return; // 同一项目：幂等
    stopPolling();
    polledHandle = handle;
    let last = null;
    let busy = false;
    const tick = async () => {
      if (state.projectHandle !== handle) {
        stopPolling();
        return;
      }
      if (busy || Date.now() < suppressUntil) return;
      busy = true;
      try {
        const now = await fingerprint(handle);
        if (!liveMode) {
          liveMode = true; // 首轮指纹成功 = 通道确认可用，顶栏「实时」标记随之亮起
          renderStatusBar();
        }
        if (last == null) {
          last = now; // 首轮只建基线
          return;
        }
        if (now === last) return;
        last = now;
        if (!state.dirty) {
          await reloadHandle();
        }
      } catch (err) {
        last = null; // 读取失败（半成品/瞬断）：下轮重建基线，不打扰用户
        console.warn("[live-reload] 指纹读取失败:", err?.message);
      } finally {
        busy = false;
      }
    };
    pollTimer = setInterval(tick, POLL_MS);
    tick();
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    polledHandle = null;
  }

  // ---------------------------------------------------------------- SSE（URL 模式）
  function connectSse() {
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
      if (state.dirty) return; // 有未保存修改：跳过重载（不打断用户编辑）
      reload().catch((err) => {
        // 加载失败（文件半成品）：保留当前视图，修复后下轮推送会再次触发
        showToast(`文件变更后加载失败（已保留当前视图）: ${err.message}`, "danger");
      });
    };
  }

  function stopSse() {
    sse?.close();
    sse = null;
  }

  /** 保存后短暂抑制自动刷新（避免自己保存触发的回环）。 */
  function suppressRefreshes() {
    suppressUntil = Date.now() + 1500;
  }

  /**
   * 顶栏状态簇：●未保存 + 【刷新】按钮；另有部署模式提示
   * （URL 项目且无实时通道 = GitHub Pages：「网页模式 · 保存将下载项目包」）。
   * 本地项目实时刷新恒定生效，不再重复提示。
   */
  function renderStatusBar() {
    const hint = document.getElementById("status-hint");
    if (hint) {
      // 无实时通道的 URL 项目 = 部署模式（本地 serve/句柄项目都有实时刷新）
      const deploy = state.manifestPath && !state.projectHandle && !liveMode && !sse && !pollTimer;
      hint.hidden = !deploy;
      if (deploy) hint.textContent = "网页模式"; // 完整说明在 title（hover）
    }
    document.getElementById("status-dirty")?.toggleAttribute("hidden", !state.dirty);
    // 【刷新】按钮：行为与底部时期完全一致（dirty 时确认后从磁盘重载），只绑一次
    const cluster = document.getElementById("tb-status");
    if (cluster && !cluster.dataset.bound) {
      cluster.dataset.bound = "1";
      document.getElementById("btn-reload")?.addEventListener("click", manualReload);
    }
  }

  return { connectLiveReload, suppressRefreshes, renderStatusBar };
}
