// ============================================================================
// server/events.js — SSE change push (/events)
// ----------------------------------------------------------------------------
// Project file change → broadcast to every subscribed editor (EventSource).
// Implementation: the server polls a directory fingerprint (fs.watch is
// unreliable on container/network mounts) and sends message to all connected
// clients when the fingerprint changes. Zero dependencies (Node built-ins).
// ============================================================================

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const POLL_INTERVAL_MS = 800;

/**
 * Recursively scan a directory and return a fingerprint (relative path + mtimeMs
 * + size, sorted and joined). Hidden dirs (.git etc.) and node_modules are
 * excluded so unrelated writes do not trigger a refresh.
 *
 * Intentionally not shared with editor/app/project/handle-io.js#fingerprint: same change
 * semantics, but this one walks Node fs (server-side polling) while that one iterates a
 * browser FileSystemDirectoryHandle. Unifying would force a shared package across the
 * editor→packages boundary for no runtime gain (different APIs, different environments).
 */
export function dirFingerprint(root) {
  const parts = [];
  const walk = (dir, base) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), rel);
      } else if (entry.isFile()) {
        const st = statSync(join(dir, entry.name));
        parts.push(`${rel}:${st.mtimeMs}:${st.size}`);
      }
    }
  };
  walk(root, "");
  return parts.sort().join("|");
}

/**
 * Create the SSE push hub. Only meaningful with --project mount (the caller
 * guarantees a non-empty projectRoot).
 * @returns {{ handle(req, res): void }}
 */
export function createSseHub(projectRoot) {
  const clients = new Set();
  let timer = null;

  function startWatcher() {
    if (timer) return;
    let last = dirFingerprint(projectRoot);
    timer = setInterval(() => {
      const now = dirFingerprint(projectRoot);
      if (now !== last) {
        last = now;
        const msg = `data: changed\n\n`;
        for (const client of clients) {
          try {
            client.write(msg);
          } catch {
            clients.delete(client);
          }
        }
      }
    }, POLL_INTERVAL_MS);
    timer.unref?.(); // do not keep the process alive
  }

  function handle(req, res) {
    startWatcher();
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    res.write("data: ready\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
  }

  return { handle };
}
