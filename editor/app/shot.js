// ============================================================================
// app/shot.js — headless screenshot driver (?shot=1, used by `open-pptd render`)
// ----------------------------------------------------------------------------
// No assembly of its own: it mounts createEditor with the non-interactive
// capability (chrome:"shot" → interactive:false) on a fixed, deck-sized
// #shot-root paint surface. State, api, project IO (load / fonts / images / live
// channel) and the paint channel (renderPage → layout → paintPage + the same
// imageMap / iconMap / theme / font files as the editor preview) are therefore
// the editor's own code path, not a parallel one (spec 22 S5).
//
// The driver only owns the CDP-facing contract:
//   window.__pptdShot = { count, goto(index), width, height }
//   window.pptdReady("ready")   = current page painted and stable, ready to shoot
//                                 (injected via CDP Runtime.addBinding; skipped outside CDP)
//   window.pptdReady("error")   = initialization failed
//   document.title === "PPTD_READY" / "PPTD_ERROR" is kept as an observable (manual/walkthrough use)
// ?shot=1 semantics are unchanged: .shot-mode on <html> (zero chrome, no
// transitions, #editor-app display:none) and a bare body-level #shot-root.
// This module is not loaded when the editor is opened normally (no ?shot=1).
// ============================================================================

import { createEditor } from "../editor.js";
import { httpSource } from "./project/source.js";
import { SHOT_READY_TITLE, deckSize } from "../../packages/model/index.js";

export const READY_TITLE = SHOT_READY_TITLE;

// CDP ready-binding name (same convention as READY_BINDING in
// packages/renderer/headless/cdp.js; must not import the headless module here —
// that is a Node-only path).
const READY_BINDING = "pptdReady";

/** Fire the CDP ready event (the global injected by addBinding; absent outside CDP → silently skipped). */
function notifyReady(payload = "ready") {
  try {
    if (typeof window[READY_BINDING] === "function") window[READY_BINDING](payload);
  } catch {
    /* binding unavailable (opened ?shot=1 by hand): observe via document.title only */
  }
}

export async function initShot(deckUrl) {
  try {
    return await runShot(deckUrl);
  } catch (err) {
    notifyReady("error");
    throw err;
  }
}

async function runShot(deckUrl) {
  if (!deckUrl) throw new Error("shot 模式需要 ?deck= 参数");
  document.documentElement.classList.add("shot-mode");

  // Paint surface: fixed at the viewport origin, sized to the deck by the
  // headless view (it doubles as createEditor's mount point).
  const root = document.createElement("div");
  root.id = "shot-root";
  document.body.appendChild(root);
  root.style.cssText = "position:fixed;left:0;top:0;overflow:hidden;background:#fff;";

  // Standard assembly, non-interactive. ready rejects when the deck cannot be
  // loaded (the headless bootstrap propagates instead of showing an error state).
  const { state, view, ready } = createEditor(root, {
    source: httpSource({}),
    deckUrl,
    chrome: "shot",
    interactive: false,
  });
  await ready;

  const [deckW, deckH] = deckSize(state.deck);

  /** Paint one page and wait for the frame to settle: fonts ready + images decoded + double rAF (charts drawn synchronously with animation:false). */
  async function goto(index) {
    const i = Math.max(0, Math.min(state.deck.pages.length - 1, index));
    view.render(i); // the headless paint view (renderPage over the shared pipeline)
    const imgs = [...root.querySelectorAll("img")];
    await Promise.all([
      document.fonts.ready,
      ...imgs.map((img) =>
        img.complete && img.naturalWidth > 0 ? Promise.resolve() : img.decode().catch(() => {})
      ),
    ]);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    document.title = READY_TITLE;
    notifyReady("ready"); // CDP ready event (replaces title polling)
    return i;
  }

  // Container width/height are set by the paint view; the contract reports the
  // deck's own size (960×540 fallback), supporting any canvas ratio (e.g. a 3:4 poster)
  window.__pptdShot = { count: state.deck.pages.length, goto, width: deckW, height: deckH };
  await goto(0); // CDP only starts per-page driving after the first page is ready
}
