// editor/app/shot.js — headless screenshot driver (?shot=1, `open-pptd build --format png`)
// Mounts createPreview in headless paint mode on a fixed deck-sized #shot-root, so
// state, project IO and paint (layout → paintPage) are the shared preview path, not a
// parallel one. Owns the CDP contract: window.__pptdShot = { count, goto, width,
// height }, window.pptdReady("ready"|"error"), and document.title PPTD_READY/ERROR.
// ?shot=1 adds .shot-mode and renders no shell; normal editor loads never import it.

import { createPreview } from "../preview.js";
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

  // Shared preview core in headless mode: no skeleton, no chrome, no interaction.
  // ready rejects when the deck cannot be loaded (the bootstrap propagates instead
  // of showing an error state). chrome "embedded" keeps the theme on the mount point
  // instead of the document root.
  const { state, view, ready } = createPreview(root, {
    source: httpSource({}),
    deckUrl,
    chrome: "embedded",
    headless: true,
  });
  await ready;

  const [deckW, deckH] = deckSize(state.deck);

  /** Paint one page and wait for the frame to settle: fonts ready + images decoded + double rAF (charts drawn synchronously with animation:false). */
  async function goto(index) {
    const i = Math.max(0, Math.min(state.deck.pages.length - 1, index));
    view.render(i); // the headless paint view (layout → paintPage over the shared pipeline)
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
