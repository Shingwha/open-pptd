// ============================================================================
// app/project/live-reload.js — 实时刷新（推送 / 指纹轮询）+ 顶栏状态指示
// ----------------------------------------------------------------------------
// 两种项目来源，同一条承诺——外部改文件后编辑器自动重载（保留当前页），
// 有未保存修改时跳过并提示，保存方经 suppressRefreshes 抑制刷新回环：
//   - source.capabilities.liveWatch 为真：订阅 source.watch()（HTTP 模式 = SSE
//     推送；部署模式（无 /events）由 httpSource 内部放弃，行为与既有「网页模式」一致）
//   - 否则（本地句柄项目）：轮询 manifest+pages 指纹（source.fingerprint，
//     语义同 handle-io.fingerprint / 服务端 dirFingerprint）
// 本模块不再出现 new EventSource("/events") 字面量：推送通道由 source 提供。
// 依赖注入：source（运输）、reload（URL 模式刷新）、reloadHandle（句柄模式刷新）、
// manualReload（顶栏「实时」标记点击 = 手动从磁盘重新加载，dirty 时确认）。
// ============================================================================

import { showToast } from "../toast.js";
import { fingerprint } from "./handle-io.js";

const POLL_MS = 900;

export function createLiveReload({ state, source, reload, reloadHandle, manualReload }) {
  let unwatch = null; // 推送通道退订函数（非空 = 已订阅）
  let pollTimer = null;
  let polledHandle = null;
  let liveMode = false; // 已确认可用的实时通道（推送 onopen / 首轮指纹成功）
  let suppressUntil = 0; // 保存后短暂抑制（避免自己保存触发的刷新）

  /** 项目就绪后订阅（幂等；随当前项目来源自动选轮询或推送；空白项目断开旧通道）。 */
  function connectLiveReload() {
    if (!state.projectHandle && !state.manifestPath) {
      stopPolling();
      stopWatch();
      return;
    }
    if (state.projectHandle) {
      stopWatch();
      startPolling();
      return;
    }
    stopPolling();
    connectWatch();
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
        const now = source.fingerprint ? await source.fingerprint() : await fingerprint(handle);
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

  // ---------------------------------------------------------------- 推送（URL 模式）
  function connectWatch() {
    if (!state.manifestPath || unwatch) return;
    if (!source?.watch || source.capabilities?.liveWatch === false) return; // 无推送通道：不启用
    unwatch =
      source.watch(() => onWatchMessage(), {
        onOpen: () => {
          liveMode = true;
          renderStatusBar();
        },
        onError: () => {
          // 部署模式：推送端点不存在 → 放弃（本地 serve 断线由实现自动重连）
          stopWatch();
          renderStatusBar();
        },
      }) || null;
  }

  function onWatchMessage() {
    if (!state.manifestPath || Date.now() < suppressUntil) return;
    if (state.dirty) return; // 有未保存修改：跳过重载（不打断用户编辑）
    reload().catch((err) => {
      // 加载失败（文件半成品）：保留当前视图，修复后下轮推送会再次触发
      showToast(`文件变更后加载失败（已保留当前视图）: ${err.message}`, "danger");
    });
  }

  function stopWatch() {
    unwatch?.();
    unwatch = null;
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
      const deploy = state.manifestPath && !state.projectHandle && !liveMode && !unwatch && !pollTimer;
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

  /** 释放实时通道（destroy 用）：停轮询、退订推送、摘掉「刷新」按钮监听。 */
  function destroy() {
    stopPolling();
    stopWatch();
    document.getElementById("btn-reload")?.removeEventListener("click", manualReload);
    const cluster = document.getElementById("tb-status");
    if (cluster?.dataset.bound) delete cluster.dataset.bound;
  }

  return { connectLiveReload, suppressRefreshes, renderStatusBar, destroy };
}
