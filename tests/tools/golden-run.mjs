// ============================================================================
// tests/tools/golden-run.mjs — golden baseline shared runner (discovery / render / fingerprint)
// ----------------------------------------------------------------------------
// Shared by golden-render.mjs (writes the baseline) and golden-diff.mjs (compares) so the two
// cannot drift apart.
//   discoverProjects()            discover examples/* and tests/projects/* (with deck.pptd)
//   renderProject(entry, pngDir)  render every page to PNG via the live pipeline (renderDeck + headless CDP)
//   deckSourceHash(entry)         whole-project source hash (deck + pages, excluding out/)
//   pageFingerprint(pngPath)      → { dHash, aHash, w, h, bytes, sha256 }
// Only imports renderer/headless, never modifies it (boundary: calling is allowed, editing its files is not).
// ============================================================================

import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { renderDeck } from "../../packages/renderer/headless/shoot.js";
import { findBrowser } from "../../packages/renderer/headless/browser.js";
import { startServer } from "../../packages/server/index.js";
import { imageFingerprint, sha256 } from "./golden-lib.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
export { ROOT };

const SOURCES = ["examples", "tests/projects"];

/** Project key → PNG output dir name (/ replaced with __, filesystem-safe). */
export const pngDirName = (key) => key.replace(/[\\/]+/g, "__");

/** Discover every baseline project containing a deck.pptd (examples 15 + tests/projects 9 = 24). */
export function discoverProjects() {
  const out = [];
  for (const src of SOURCES) {
    const dir = join(ROOT, src);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      const projDir = join(dir, name);
      if (!statSync(projDir).isDirectory()) continue;
      const deck = join(projDir, "deck.pptd");
      if (!existsSync(deck)) continue;
      out.push({
        key: `${src}/${name}`,
        name,
        dir: projDir,
        deck,
        relDeck: `${src}/${name}/deck.pptd`,
        pngDir: pngDirName(`${src}/${name}`),
      });
    }
  }
  return out;
}

/** Whole-project source hash (deck + pages + media, excluding out/ and export artifacts). */
export function deckSourceHash(entry) {
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name === "out" || e.name === "node_modules") continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(pptd|page|json|png|jpe?g|gif|webp|svg|md|txt|ya?ml)$/i.test(e.name)) files.push(p);
    }
  };
  walk(entry.dir);
  const h = [];
  for (const p of files.sort()) {
    h.push(`${relative(entry.dir, p).split(sep).join("/")}:${sha256(readFileSync(p))}`);
  }
  return sha256(Buffer.from(h.join("\n"), "utf8"));
}

/**
 * Render every page of one project into pngDir (live pipeline: renderDeck + headless CDP).
 * @returns {Promise<{files: string[], count: number}>}
 */
export async function renderProject(entry, pngDir) {
  return renderDeck({
    manifest: entry.deck,
    outPath: pngDir,
    scale: 1,
    timeoutMs: 180000, // heavy projects such as font-embed (27 fonts, CDN fallback) need a longer readiness wait
    quiet: true,
    startServer,
  });
}

/** Page PNG → fingerprint. */
export function pageFingerprint(pngPath) {
  return imageFingerprint(readFileSync(pngPath));
}

/** Browser probe (required for the baseline); returns null and prints the reason when unavailable. */
export function probeBrowser() {
  try {
    return findBrowser();
  } catch (e) {
    console.error(`✗ 需要本机 Chrome/Edge（SMOKE_CHROME 可指定路径）: ${e.message}`);
    return null;
  }
}
