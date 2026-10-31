// ============================================================================
// app/project/export-service.js — browser adapter for packages/export
// ----------------------------------------------------------------------------
// One adapter for every browser export (interfaces.md §5, work order 09 §P2):
//   exportPptx({embedFonts, fullFonts})  → ExportService format=pptx
//   exportBundle()                       → ExportService format=bundle (snapshot)
//   exportPng({pages, scale, mode})      → ExportService format=png
//                                          (capture first, foreignObject fallback)
//
// It supplies the browser-side ResourceProvider (font library + built-in font
// registry, icon preload cache + icon registry, editing-session media) and a
// download sink (downloadBlob/downloadPptx). Page selection, scale validation,
// naming and reports stay in packages/export; this module only adapts the
// environment and packages multi-page PNG downloads (zip / individual files).
//
// Snapshot semantics: the bundle/PPTX/PNG inputs are the **current editing
// session** (possibly dirty). DataURL images are rewritten to media/ paths and
// carried in project.media (the same rule as the old save/export paths).
// ============================================================================

import {
  base64ToBytes,
  findFont,
  fetchFontBytes,
  fetchIconSvg,
  loadFontRegistry,
  loadIconRegistry,
  resolveIconName,
} from "../../../packages/model/index.js";
import { exportProject } from "../../../packages/export/index.js";
import {
  createBrowserRenderBackendFactory,
  createCaptureRenderBackendFactory,
  forceForeignObject,
  probeCapture,
} from "../render-backend-browser.js";
import { ZipWriter, downloadBlob, downloadPptx, safeFileName } from "../../../packages/writer/index.js";
import { mediaFilesOfDeck } from "./images.js";

/** MIME by export artifact name (PPTX vs project/image zip). */
function mimeOfName(name) {
  if (/\.pptx$/i.test(name)) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (/\.zip$/i.test(name)) return "application/zip";
  if (/\.png$/i.test(name)) return "image/png";
  return "application/octet-stream";
}

/** Download sink injected into ExportService (browser artifacts). */
export function createDownloadSink() {
  return {
    async writeFile(path, bytes) {
      const name = String(path).split(/[\\/]/).pop() || "export.bin";
      if (/\.pptx$/i.test(name)) downloadPptx(bytes, name);
      else downloadBlob(bytes, name, mimeOfName(name));
    },
    downloadBlob(bytes, name, mime) {
      downloadBlob(bytes, name, mime || mimeOfName(name));
    },
    downloadPptx(bytes, name) {
      downloadPptx(bytes, name);
    },
  };
}

/** Fetch a URL into bytes (used for url-only fonts / remote images). */
async function fetchBytes(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Browser ResourceProvider (interfaces.md §3).
 * Font resolution: editor font library (bytes/url) → built-in registry → system.
 * Icons: preload cache (normalized SVG text) → registry + local/CDN fetch.
 * Images: editing-session media map → remote fetch.
 */
export function createBrowserResources({ state, project }) {
  let fontRegistry = null;
  let iconRegistry = null;
  const fontRegistryLoaded = loadFontRegistry().then(
    (reg) => (fontRegistry = reg),
    () => null
  );
  const iconRegistryLoaded = loadIconRegistry().then(
    (reg) => (iconRegistry = reg),
    () => null
  );

  const libraryEntryFor = (ref) => {
    const byFamily = ref?.family ? state.fontLibrary?.[ref.family] : null;
    if (byFamily) return byFamily;
    if (!ref?.file) return null;
    return Object.values(state.fontLibrary || {}).find((entry) => entry?.file === ref.file) || null;
  };

  const registryHitFor = (ref) => {
    if (!fontRegistry) return null;
    const keys = [ref?.key, ref?.family, ref?.file].filter(Boolean);
    for (const key of keys) {
      const hit = findFont(fontRegistry, key);
      if (hit) return hit;
    }
    return null;
  };

  return {
    get fontRegistry() {
      return fontRegistry;
    },
    get iconRegistry() {
      return iconRegistry;
    },

    /** Preload both registries (ExportService reads fontRegistry synchronously). */
    async warmup() {
      await Promise.all([fontRegistryLoaded, iconRegistryLoaded]);
    },

    async fontBytes(ref) {
      const lib = libraryEntryFor(ref);
      if (lib?.bytes?.length) return new Uint8Array(lib.bytes);
      if (lib?.url) return fetchBytes(lib.url);
      if (ref?.url && !lib) {
        const bytes = await fetchBytes(ref.url);
        if (bytes) return bytes;
      }
      const hit = registryHitFor(ref);
      if (hit) {
        if (ref?.file && !hit.file) return fetchFontBytes({ ...hit, file: ref.file });
        return fetchFontBytes(hit);
      }
      return null;
    },

    async fontStatus(ref) {
      const lib = libraryEntryFor(ref);
      if (lib?.bytes?.length) return "ready";
      if (lib) return lib.url ? "fetchable" : "missing";
      if (ref?.url) return "fetchable";
      const hit = registryHitFor(ref);
      if (hit) return hit.file || hit.url ? "ready" : "system";
      if (ref?.file) return "missing";
      // A family only used by text (no declaration): treat it as a system font, the
      // browser cannot enumerate installed fonts (same outcome as the Node provider).
      return "system";
    },

    async iconSvg(name) {
      const cached = state.iconMap?.[name];
      if (cached?.inner) {
        const vx = cached.vx ?? 0;
        const vy = cached.vy ?? 0;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${cached.w} ${cached.h}">${cached.inner}</svg>`;
      }
      if (!iconRegistry) {
        await iconRegistryLoaded;
      }
      if (!iconRegistry) return null;
      const hit = resolveIconName(name, iconRegistry);
      if (!hit) return null;
      return fetchIconSvg(hit, iconRegistry);
    },

    async imageBytes(src) {
      if (project.media?.has(src)) return project.media.get(src);
      if (/^https?:/i.test(src)) return fetchBytes(src);
      return null;
    },

    fileExists(rel) {
      return project.media?.has(rel) || false;
    },
  };
}

/**
 * Current editing session → runtime Project (deck snapshot + media bytes).
 * @param {object} state editor state
 * @param {{carryFonts?: boolean}} [options] carryFonts writes library font bytes into
 *        the snapshot (capture backend needs them as project files; bundle must not
 *        carry fonts, per 3.0 non-goal)
 */
export function buildProjectSnapshot(state, { carryFonts = false } = {}) {
  const snapshot = JSON.parse(JSON.stringify(state.deck));
  const fonts = snapshot.fonts && typeof snapshot.fonts === "object" ? snapshot.fonts : (snapshot.fonts = {});
  // Mirror font-manager.syncToDeck on the snapshot (validation + library entries) without
  // mutating the live deck: exporting never changes the editing session.
  for (const key of Object.keys(fonts)) {
    const value = fonts[key];
    if (!value || typeof value !== "object" || !(value.family || value.name)) delete fonts[key];
  }
  for (const [family, f] of Object.entries(state.fontLibrary || {})) {
    if (!f?.embed) continue;
    const entry = { family, subset: !!f.subset };
    if (f.source === "url" && f.url) entry.url = f.url;
    else if (f.source === "local") entry.file = f.file || `fonts/${safeFileName(family)}.ttf`;
    fonts[family] = entry;
  }

  const media = new Map();
  for (const file of mediaFilesOfDeck(snapshot, state.imageMap)) media.set(file.path, base64ToBytes(file.b64));

  if (carryFonts) {
    for (const [family, f] of Object.entries(state.fontLibrary || {})) {
      if (!f?.embed || !f?.bytes?.length) continue;
      const rel = typeof f.file === "string" && f.file ? f.file : `fonts/${safeFileName(family)}.ttf`;
      fonts[family] = { family, subset: !!f.subset, file: rel };
      media.set(rel, new Uint8Array(f.bytes));
    }
  }

  return {
    manifestName: state.manifestPath?.split("/").pop() || "deck.pptd",
    manifestPath: state.manifestPath || "",
    baseDir: "",
    pageFiles: new Map(),
    media,
    deck: snapshot,
  };
}

/**
 * Create the browser export adapter.
 * @param {{state: object, fontManager?: object}} deps
 */
export function createBrowserExportService({ state } = {}) {
  const sink = createDownloadSink();

  /** Apply the editor font library to deck.fonts only inside the snapshot (see buildProjectSnapshot). */
  const snapshot = () => buildProjectSnapshot(state, { carryFonts: false });

  async function exportPptx({ embedFonts = true, fullFonts = false } = {}) {
    const project = snapshot();
    const resources = createBrowserResources({ state, project });
    await resources.warmup();
    return exportProject(
      project,
      { format: "pptx", embedFonts, fullFonts },
      { resources, sink }
    );
  }

  async function exportBundle() {
    const project = snapshot();
    const resources = createBrowserResources({ state, project });
    await resources.warmup();
    return exportProject(project, { format: "bundle", bundleMode: "snapshot" }, { resources, sink });
  }

  /**
   * PNG export: capture (server endpoint, one batch request) first, foreignObject
   * fallback. Returns { report, results, dropped, source } for UI/tests.
   * @param {{pages?: number[], scale?: number, mode?: "zip"|"files"}} options
   */
  async function exportPng({ pages = null, scale = 2, mode = "zip" } = {}) {
    if (!state.deck?.pages?.length) return { report: null, results: [], dropped: [], source: null };
    const total = state.deck.pages.length;
    const indices = (Array.isArray(pages) && pages.length ? pages : [state.currentPage]).filter(
      (i) => Number.isInteger(i) && i >= 0 && i < total
    );
    if (!indices.length) return { report: null, results: [], dropped: [], source: null };
    const pageNums = indices.map((i) => i + 1);
    const ratio = [1, 2, 3].includes(Number(scale)) ? Number(scale) : 2;

    const captureProject = buildProjectSnapshot(state, { carryFonts: true });
    const resources = createBrowserResources({ state, project: captureProject });
    await resources.warmup();

    let report = null;
    let source = null;
    let droppedBackend = null;
    if (!forceForeignObject() && (await probeCapture())) {
      try {
        report = await exportProject(
          captureProject,
          { format: "png", pages: pageNums, scale: ratio, backend: "capture", check: false },
          { resources, renderBackend: createCaptureRenderBackendFactory({ state }) }
        );
        if (report.ok && report.artifacts?.length) source = "capture";
        else report = null;
      } catch (err) {
        console.warn(`[export] capture 出图失败，回退 foreignObject：${err?.message || err}`);
        report = null;
      }
    }
    if (!report) {
      const factory = createBrowserRenderBackendFactory({ state });
      report = await exportProject(
        captureProject,
        { format: "png", pages: pageNums, scale: ratio, backend: "foreignObject", check: false },
        { resources, renderBackend: factory }
      );
      source = "foreignObject";
      droppedBackend = factory.getLastBackend();
    }
    if (!report.ok) {
      const err = new Error(report.errors?.join("；") || "PNG 导出失败");
      err.report = report;
      throw err;
    }

    const artifacts = (report.artifacts || []).map((a) => ({
      name: String(a.name).split(/[\\/]/).pop(),
      bytes: a.bytes,
    }));
    const results = artifacts.map((a, i) => {
      const page = pageNums[i];
      return {
        index: page - 1,
        png: a.bytes,
        droppedElements: droppedBackend?.droppedElementsFor(page) || [],
        source,
      };
    });
    const dropped = [];
    for (const r of results) for (const d of r.droppedElements || []) dropped.push({ page: r.index + 1, ...d });

    // Packaging: one download / individual files / zip — the only place browser PNGs zip.
    if (artifacts.length === 1 || mode === "files") {
      for (const a of artifacts) sink.downloadBlob(a.bytes, a.name, "image/png");
    } else {
      const zip = new ZipWriter();
      for (const a of artifacts) zip.add(a.name, a.bytes);
      const bytes = zip.build();
      const base = safeFileName(state.deck.title || "deck");
      sink.downloadBlob(bytes, `${base}-images.zip`, "application/zip");
    }

    state.lastImageExport = results; // walkthrough/tests read droppedElements
    return { report, results, dropped, source };
  }

  return { exportPptx, exportBundle, exportPng, buildSnapshot: snapshot, sink };
}
