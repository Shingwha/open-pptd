// cli/resources.js — deck resource requirements + on-demand fetch (Node adapter)
// Shared by `check` (read-only summary) and `build --fetch` (explicit download):
//   1 collect references  parse deck → font declarations / icon refs / media files
//   2 three-level compare  home/assets → in-package assets → ready | fetchable | system | missing
//   3 fetch on demand      only missing fonts with url/mirrors (cli/download.js)
//   4 re-check. `assets sync` installs assets; nothing downloads during a plain build/check.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseDeck } from "../model/pptd-io.js";
import { collectImageSrcs, walkElements } from "../model/walk.js";
import { findFont, findSystemFont } from "../model/font-registry.js";
import { resolveIconName } from "../model/icon-fa.js";
import { collectFontSpecs } from "../writer/font.js";
import { mergeUserFonts, userFontReady } from "../server/font-library.js";
import { readFontRegistry, readIconRegistry, fontFileReady } from "./resource-status.js";
import { downloadFonts } from "./download.js";
import { loadProjectFiles } from "./project.js";

const isRemote = (src) => /^(https?:|data:)/i.test(String(src || ""));

/** Readiness across both libraries: built-in/home roots vs the user font dir. */
function fontHitReady(hit) {
  if (!hit) return false;
  return hit.userFont ? userFontReady(hit) : fontFileReady(hit);
}

/**
 * 1. Collect the resources referenced by the deck.
 * @param {object} opts
 * @param {string} opts.manifest .pptd path
 * @returns {{ deckDir:string, fonts:object[], icons:object[], media:object[], fontRegistry:object, iconRegistry:object }}
 */
export function collectRequirements({ manifest }) {
  const { manifestText, deckDir, pageFiles } = loadProjectFiles(manifest);
  const deck = parseDeck(manifestText, pageFiles);
  const fontRegistry = mergeUserFonts(readFontRegistry());
  const iconRegistry = readIconRegistry();

  const fonts = collectFontSpecs(deck).map((spec) => {
    const hit = findFont(fontRegistry, spec.family);
    const sys = hit ? undefined : findSystemFont(fontRegistry, spec.family);
    let status;
    if (hit) {
      if (fontHitReady(hit)) status = "ready";
      // A stale user-library entry is not auto-downloaded into the user dir.
      else if (hit.userFont) status = "missing";
      else status = [spec.url, hit.url, ...(hit.mirrors || [])].filter(Boolean).length ? "fetchable" : "missing";
    } else status = sys ? "system" : "unknown";
    return { family: spec.family, key: hit?.key || null, file: hit?.file || spec.file || null, subset: hit ? (spec.subset == null ? hit.subset !== false : spec.subset) : false, status, known: !!hit };
  });

  const seenIcons = new Set();
  const icons = [];
  walkElements(deck.pages, (elm) => {
    if (elm.elementType !== "icon" || !elm.iconName || seenIcons.has(elm.iconName)) return;
    seenIcons.add(elm.iconName);
    const hit = resolveIconName(elm.iconName, iconRegistry);
    icons.push({ name: elm.iconName, known: !!hit });
  });

  const media = collectImageSrcs(deck.pages)
    .filter((src) => !isRemote(src))
    .map((src) => ({ src, exists: existsSync(join(deckDir, src)) }));

  return { deckDir, fonts, icons, media, fontRegistry, iconRegistry };
}

/** 2/4. Three-level compare: aggregate status. */
export function checkResources(reqs) {
  const fontsReady = reqs.fonts.filter((f) => f.status === "ready");
  const fontsFetchable = reqs.fonts.filter((f) => f.status === "fetchable");
  const fontsMissing = reqs.fonts.filter((f) => f.status === "missing");
  const fontsSystem = reqs.fonts.filter((f) => f.status === "system" || f.status === "unknown");
  const mediaMissing = reqs.media.filter((m) => !m.exists);
  // missing = fonts that will be skipped ("registry hit but no local bytes") + media missing inside the deck (real errors)
  const missing = [
    ...fontsFetchable.map((f) => ({ kind: "font", family: f.family, file: f.file, reason: "本地无字节（可下载）" })),
    ...fontsMissing.map((f) => ({ kind: "font", family: f.family, file: f.file, reason: "本地无字节且无可用下载源" })),
    ...mediaMissing.map((m) => ({ kind: "media", path: m.src, reason: "deck 引用文件不存在" })),
  ];
  return {
    checked: { fonts: reqs.fonts.length, icons: reqs.icons.length, media: reqs.media.length },
    fonts: { ready: fontsReady.length, fetchable: fontsFetchable.length, missing: fontsMissing.length, system: fontsSystem.length },
    icons: { known: reqs.icons.filter((i) => i.known).length, unknown: reqs.icons.filter((i) => !i.known).length },
    media: { ready: reqs.media.length - mediaMissing.length, missing: mediaMissing.length },
    missing,
  };
}

/**
 * 3. Fetch on demand (only missing fonts whose registry entry has url/mirrors) + 4. re-check.
 * @param {object} reqs collectRequirements result
 * @param {{offline?:boolean}} [opts]
 * @returns {Promise<{fetched:object[],failed:object[],summary:object}>}
 */
export async function ensureResources(reqs, { offline = false } = {}) {
  const fetched = [];
  const failed = [];
  const targets = reqs.fonts.filter((f) => f.status === "fetchable");
  if (!offline && targets.length) {
    const wanted = new Set(targets.map((t) => t.family));
    const subset = { ...reqs.fontRegistry, fonts: (reqs.fontRegistry.fonts || []).filter((f) => wanted.has(f.family) || wanted.has(f.key)) };
    await downloadFonts(subset, "all");
    // re-read readiness (downloadFonts has written to disk; ✗ not-on-disk ones go to failed)
    for (const t of targets) {
      const hit = findFont(reqs.fontRegistry, t.family);
      if (hit && fontHitReady(hit)) {
        fetched.push({ family: t.family, file: hit.file });
        t.status = "ready";
      } else {
        failed.push({ family: t.family, file: t.file });
      }
    }
  } else if (offline) {
    for (const t of targets) failed.push({ family: t.family, file: t.file, reason: "offline" });
  }
  return { fetched, failed, summary: checkResources(reqs) };
}
