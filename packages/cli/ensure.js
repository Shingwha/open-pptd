// ============================================================================
// cli/ensure.js — export preflight resource check + on-demand fetch (integration-plan §3.6)
// ----------------------------------------------------------------------------
// Five steps:
//   1 collect references  parse deck → font declarations (registry-resolved) / icon refs / media files
//   2 three-level compare  home/assets → in-package assets → decide ready | fetchable | system | unknown | missing
//   3 fetch on demand      download only what is missing and has url/mirrors in the registry (reusing cli/download.js)
//   4 re-check             run step 2 again; list what is still missing
//   5 output manifest      {checked, fetched[], embedded[], skipped[], missing[]}
//
// Programmatic API: collectRequirements / checkResources / ensureResources (D.8).
// Soft-degrade contract: a network failure never affects export — warn and skip embedding only.
// ============================================================================

import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseDeck } from "../model/pptd-io.js";
import { collectImageSrcs, walkElements } from "../model/walk.js";
import { findFont, findSystemFont } from "../model/font-registry.js";
import { resolveIconName } from "../model/icon-fa.js";
import { collectFontSpecs } from "../writer/font.js";
import { loadProjectFiles } from "./export.js";
import { readFontRegistry, readIconRegistry, fontFileReady } from "./resource-status.js";
import { downloadFonts } from "./download.js";

const isRemote = (src) => /^(https?:|data:)/i.test(String(src || ""));

/**
 * 1. Collect the resources referenced by the deck.
 * @param {object} opts
 * @param {string} opts.manifest .pptd path
 * @returns {{ deckDir:string, fonts:object[], icons:object[], media:object[], fontRegistry:object, iconRegistry:object }}
 */
export function collectRequirements({ manifest }) {
  const { manifestText, deckDir, pageFiles } = loadProjectFiles(manifest);
  const deck = parseDeck(manifestText, pageFiles);
  const fontRegistry = readFontRegistry();
  const iconRegistry = readIconRegistry();

  const fonts = collectFontSpecs(deck).map((spec) => {
    const hit = findFont(fontRegistry, spec.family);
    const sys = hit ? undefined : findSystemFont(fontRegistry, spec.family);
    let status;
    if (hit) status = fontFileReady(hit) ? "ready" : [spec.url, hit.url, ...(hit.mirrors || [])].filter(Boolean).length ? "fetchable" : "missing";
    else status = sys ? "system" : "unknown";
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
      if (hit && fontFileReady(hit)) {
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

/** ensure subcommand entry (CLI product surface). */
export async function runEnsure(args) {
  const manifest = args[1];
  if (!manifest || !existsSync(manifest)) {
    console.error(`✗ 文件不存在: ${manifest}`);
    process.exit(1);
  }
  const json = args.includes("--json");
  const offline = args.includes("--offline");
  const strict = args.includes("--strict");
  const log = json ? console.error : console.log;

  const reqs = collectRequirements({ manifest });
  const pre = checkResources(reqs);
  log(`▸ 资源体检（${manifest} 引用：字体 ${pre.checked.fonts} · 图标 ${pre.checked.icons} · 媒体 ${pre.checked.media}）`);
  for (const f of reqs.fonts) {
    const mark = f.status === "ready" ? "✓" : f.status === "system" || f.status === "unknown" ? "○" : "✗";
    log(`    ${mark} ${f.family}（${f.file || f.status}）`);
  }
  if (!offline && pre.fonts.fetchable) log(`▸ 按需补齐 ${pre.fonts.fetchable} 个字体…`);
  const { fetched, failed } = await ensureResources(reqs, { offline });
  const post = checkResources(reqs);
  if (fetched.length) log(`    ✓ 已补齐 ${fetched.map((f) => f.family).join("、")}`);
  if (failed.length) log(`    ✗ 未补齐 ${failed.map((f) => f.family).join("、")}`);

  const result = { checked: post.checked, fonts: post.fonts, icons: post.icons, media: post.media, fetched, missing: post.missing, failed };
  if (json) process.stdout.write(JSON.stringify(result) + "\n");
  else {
    log(`▸ 结果：字体就绪 ${post.fonts.ready}/${post.checked.fonts}（系统/未注册 ${post.fonts.system}）· 图标 ${post.icons.known}/${post.checked.icons} · 媒体 ${post.media.ready}/${post.checked.media}`);
    if (post.missing.length) log(`⚠ 缺失 ${post.missing.length} 项（软降级：不阻塞导出，字体将跳过嵌入）`);
    else log("✓ 资源齐备");
  }
  if (strict && post.missing.length) process.exit(1);
}
