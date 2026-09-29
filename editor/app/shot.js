// ============================================================================
// app/shot.js — headless screenshot mode (?shot=1, used by `open-pptd render`)
// ----------------------------------------------------------------------------
// Skips the whole editor UI and paints each page straight into a bare container
// sized to the deck itself (960×540 when size is missing) — same paint pipeline
// as the editor preview (layout → renderer/page.js paintPage + the same font
// files + the same imageMap).
// Public contract (for the CDP driver in packages/renderer/headless/shoot.js):
//   window.__pptdShot = { count, goto(index), width, height }
//   window.pptdReady("ready")   = current page painted and stable, ready to shoot
//                                 (injected via CDP Runtime.addBinding; skipped outside CDP)
//   window.pptdReady("error")   = initialization failed
//   document.title === "PPTD_READY" / "PPTD_ERROR" is kept as an observable (manual/walkthrough use)
// This module is not loaded when the editor is opened normally (no ?shot=1).
// ============================================================================

import { createEditorState } from "./state.js";
import { createIo } from "./project/io.js";
import { httpSource } from "./project/source.js";
import { SHOT_READY_TITLE, deckSize } from "../../packages/model/index.js";
import { renderPage } from "../../packages/renderer/index.js";

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

  // Minimal assembly: state + io (only the load/font/image pipeline; view is a
  // stub and all UI stays hidden. refreshPage is called by finishLoad's
  // progressive load, so the stub must provide it).
  const { state, ops } = createEditorState();
  // Single read source: screenshot mode always goes over HTTP (loadDeck passes deckUrl as the read hint)
  const io = createIo({ state, ops, view: { render() {}, refreshPage() {} }, source: httpSource({}) });

  const root = document.createElement("div");
  root.id = "shot-root";
  document.body.appendChild(root);
  root.style.cssText = "position:fixed;left:0;top:0;overflow:hidden;background:#fff;";

  /** Paint one page and wait for the frame to settle: fonts ready + images decoded + double rAF (charts drawn synchronously with animation:false). */
  async function render(index) {
    const page = state.deck.pages[index];
    renderPage(root, page, state.deck, state.theme, { imageMap: state.imageMap, iconMap: state.iconMap });
    const imgs = [...root.querySelectorAll("img")];
    await Promise.all([
      document.fonts.ready,
      ...imgs.map((img) =>
        img.complete && img.naturalWidth > 0 ? Promise.resolve() : img.decode().catch(() => {})
      ),
    ]);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  async function goto(index) {
    const i = Math.max(0, Math.min(state.deck.pages.length - 1, index));
    await render(i);
    document.title = READY_TITLE;
    notifyReady("ready"); // CDP ready event (replaces title polling)
    return i;
  }

  await io.loadDeck(deckUrl, { silent: true });
  // Container = the deck's own size (960×540 fallback when size is missing/invalid), supporting any canvas ratio (e.g. a 3:4 poster)
  const [deckW, deckH] = deckSize(state.deck);
  root.style.width = `${deckW}px`;
  root.style.height = `${deckH}px`;
  window.__pptdShot = { count: state.deck.pages.length, goto, width: deckW, height: deckH };
  await goto(0); // CDP only starts per-page driving after the first page is ready
}
