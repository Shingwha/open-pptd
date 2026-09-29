// ============================================================================
// app/project/live-reload.js — live reload (push / fingerprint polling) + topbar status indicator
// ----------------------------------------------------------------------------
// Two project sources, one promise — the editor auto-reloads after external file
// changes (keeping the current page), skips and warns when there are unsaved
// changes, and the saving side suppresses the refresh loop via suppressRefreshes:
//   - source.capabilities.liveWatch is true: subscribe to source.watch() (SSE push
//     in HTTP mode; in deploy mode (no /events) httpSource gives up internally,
//     matching the existing "web mode" behavior)
//   - otherwise (local handle project): poll the manifest+pages fingerprint
//     (source.fingerprint, same semantics as handle-io.fingerprint / server dirFingerprint)
// This module no longer contains a new EventSource("/events") literal: the push
// channel is provided by the source. Dependency injection: source (transport),
// reload (URL-mode refresh), reloadHandle (handle-mode refresh), manualReload
// (topbar "live" marker click = manual reload from disk, confirmed when dirty).
// ============================================================================

import { showToast } from "../toast.js";
import { fingerprint } from "./handle-io.js";
import { dom } from "../../dom.js";

const POLL_MS = 900;

export function createLiveReload({ state, source, reload, reloadHandle, manualReload }) {
  let unwatch = null; // push-channel unsubscribe (non-null = subscribed)
  let pollTimer = null;
  let polledHandle = null;
  let liveMode = false; // live channel confirmed usable (push onopen / first successful fingerprint)
  let suppressUntil = 0; // brief suppression after saving (avoids a refresh triggered by our own save)

  /** Subscribe once the project is ready (idempotent; picks polling or push by the current source; a blank project disconnects the old channel). */
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

  // ---------------------------------------------------------------- handle polling
  function startPolling() {
    const handle = state.projectHandle;
    if (pollTimer && polledHandle === handle) return; // same project: idempotent
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
          liveMode = true; // first successful fingerprint = channel confirmed, topbar "live" marker lights up
          renderStatusBar();
        }
        if (last == null) {
          last = now; // first round just establishes the baseline
          return;
        }
        if (now === last) return;
        last = now;
        if (!state.dirty) {
          await reloadHandle();
        }
      } catch (err) {
        last = null; // read failure (half-written/transient): rebuild the baseline next round, don't bother the user
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

  // ---------------------------------------------------------------- push (URL mode)
  function connectWatch() {
    if (!state.manifestPath || unwatch) return;
    if (!source?.watch || source.capabilities?.liveWatch === false) return; // no push channel: disabled
    unwatch =
      source.watch(() => onWatchMessage(), {
        onOpen: () => {
          liveMode = true;
          renderStatusBar();
        },
        onError: () => {
          // Deploy mode: the push endpoint does not exist → give up (a local serve drop reconnects inside the impl)
          stopWatch();
          renderStatusBar();
        },
      }) || null;
  }

  function onWatchMessage() {
    if (!state.manifestPath || Date.now() < suppressUntil) return;
    if (state.dirty) return; // unsaved changes: skip the reload (don't interrupt editing)
    reload().catch((err) => {
      // Load failure (half-written file): keep the current view; the next push retries after the fix
      showToast(`文件变更后加载失败（已保留当前视图）: ${err.message}`, "danger");
    });
  }

  function stopWatch() {
    unwatch?.();
    unwatch = null;
  }

  /** Briefly suppress auto-refresh after saving (avoids a refresh loop triggered by our own save). */
  function suppressRefreshes() {
    suppressUntil = Date.now() + 1500;
  }

  /**
   * Topbar status cluster: ●unsaved + the Refresh button, plus a deploy-mode hint
   * (a URL project with no live channel = GitHub Pages: "web mode · save downloads
   * a project zip"). Local projects always have live reload, so no repeated hint.
   */
  function renderStatusBar() {
    const hint = dom.statusHint;
    if (hint) {
      // A URL project with no live channel = deploy mode (local serve / handle projects both have live reload)
      const deploy = state.manifestPath && !state.projectHandle && !liveMode && !unwatch && !pollTimer;
      hint.hidden = !deploy;
      if (deploy) hint.textContent = "网页模式"; // full explanation in title (hover)
    }
    dom.statusDirty?.toggleAttribute("hidden", !state.dirty);
    // Refresh button: behavior identical to the bottom-bar era (confirm when dirty, then reload from disk), bound once
    const cluster = dom.tbStatus;
    if (cluster && !cluster.dataset.bound) {
      cluster.dataset.bound = "1";
      dom.btnReload?.addEventListener("click", manualReload);
    }
  }

  /** Release the live channel (destroy): stop polling, unsubscribe push, drop the Refresh button listener. */
  function destroy() {
    stopPolling();
    stopWatch();
    dom.btnReload?.removeEventListener("click", manualReload);
    const cluster = dom.tbStatus;
    if (cluster?.dataset.bound) delete cluster.dataset.bound;
  }

  return { connectLiveReload, suppressRefreshes, renderStatusBar, destroy };
}
