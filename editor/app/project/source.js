// ============================================================================
// app/project/source.js — transport seam (ProjectSource contract + three implementations)
// ----------------------------------------------------------------------------
// The editor depends only on this duck-typed interface for "where a project comes
// from and goes to" (same idea as handle-io.js); no more root-absolute path
// literals like fetch("/api/save") or new EventSource("/events") — a host
// (same-origin iframe / IPC / memory) can inject its own implementation.
//
// ProjectSource (contract v2):
//   capabilities: { writable, liveWatch, binary }
//   read(hint?):  Promise<{ manifestText, pageFiles: Map, media?, missing? }>
//   write(files): Promise<number>   files: [{ path, text? , bytes? }]
//   readMedia?(path): Promise<Uint8Array|null>
//   watch?(cb, hooks?): () => void  returns an unsubscribe function
//
// The engine ships three implementations (httpSource / directoryHandleSource /
// memorySource); the adapter repo's dshSource is implemented out of tree against
// the same test cases.
//
// Also exports applyDeck(deckData, ctx): applies a read result to the editor
// state (loader.js and external assembly share one implementation).
// ============================================================================

import { createHistory } from "../../interaction/history.js";
import { commitBaseline } from "../state.js";
import { fetchProjectTexts } from "./project-cache.js";
import { readProject, writeFiles, fingerprint, readImageAsDataUrl } from "./handle-io.js";
import {
  DEFAULT_THEME,
  base64ToBytes,
  bytesToBase64,
  parseDeck,
  resolveTheme,
  syncElementId,
  yaml,
} from "../../../packages/model/index.js";
import { extToMime } from "../../../packages/writer/index.js";

// Editor site root (this file lives in <root>/editor/app/project/, so ../../../ is editor/)
const EDITOR_BASE = new URL("../../", import.meta.url).href;

/** Normalize a deckUrl to an absolute URL (http(s) as-is; otherwise resolved against base or the editor site root). */
function resolveDeckUrl(deckUrl, base = "") {
  if (!deckUrl) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(deckUrl)) return deckUrl; // already an absolute URL
  if (base) {
    try {
      return new URL(deckUrl, new URL(base, document.baseURI || EDITOR_BASE)).href;
    } catch {
      /* fall through to the editor site root */
    }
  }
  return new URL(deckUrl, EDITOR_BASE).href;
}

/** Prefix a relative path with base (returned as-is when base is empty, matching the old root-absolute behavior). */
function withBase(base, path) {
  if (!path) return path;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  return `${base}${path}`;
}

// ----------------------------------------------------------------------------
// Implementation 1: httpSource — the existing serve fetch / SSE mode (parameterized base)
// ----------------------------------------------------------------------------
/**
 * @param {{ base?: string, deckUrl?: string }} [opts]
 *   base    site prefix (default "", i.e. the current serve behavior's root-absolute path)
 *   deckUrl project manifest location (absolute URL, a path relative to base, or () => string)
 */
export function httpSource({ base = "", deckUrl = null } = {}) {
  const deckUrlOf = () => (typeof deckUrl === "function" ? deckUrl() : deckUrl);

  return {
    capabilities: { writable: true, liveWatch: true, binary: true },

    /** hint names this read's project URL (optional; defaults to the deckUrl given at construction). */
    async read(hint) {
      const manifestUrl = resolveDeckUrl(hint || deckUrlOf(), base);
      if (!manifestUrl) throw new Error("httpSource 未指定 deckUrl");
      const { manifestText, pageTexts, missing = 0 } = await fetchProjectTexts(manifestUrl, yaml.load);
      return { manifestText, pageFiles: pageTexts, missing, manifestPath: manifestUrl };
    },

    /** Batch write-back (POST /api/save; body shape matches the existing server: text content / image b64). */
    async write(files) {
      const res = await fetch(withBase(base, "/api/save"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: files.map((f) =>
            f.bytes != null ? { path: f.path, b64: bytesToBase64(f.bytes) } : { path: f.path, content: f.text ?? "" }
          ),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({}));
      return data.count ?? files.length;
    },

    async readMedia(path) {
      try {
        const res = await fetch(withBase(base, path));
        if (!res.ok) return null;
        return new Uint8Array(await res.arrayBuffer());
      } catch {
        return null;
      }
    },

    /**
     * Subscribe to server change pushes (SSE).
     * @param {() => void} cb invoked on a change push
     * @param {{ onOpen?: () => void, onError?: () => void }} [hooks]
     * @returns {() => void} unsubscribe function
     */
    watch(cb, hooks = {}) {
      let es = null;
      try {
        es = new EventSource(withBase(base, "/events"));
      } catch {
        return () => {}; // no /events endpoint (deploy mode) or an exotic environment: disabled
      }
      let opened = false;
      es.onopen = () => {
        opened = true;
        hooks.onOpen?.();
      };
      es.onerror = () => {
        // Deploy mode: /events 404 → give up if it never opened (a local serve drop is auto-reconnected by EventSource)
        if (!opened && es) {
          es.close();
          es = null;
          hooks.onError?.();
        }
      };
      es.onmessage = () => cb();
      return () => {
        es?.close();
        es = null;
      };
    },
  };
}

// ----------------------------------------------------------------------------
// Implementation 2: directoryHandleSource — browser File System Access handle mode
// ----------------------------------------------------------------------------
/**
 * Wraps editor/app/project/handle-io.js (that file is unchanged; its duck-typed
 * design is already correct). File System Access has no push channel →
 * liveWatch=false; live-reload falls back to fingerprint polling.
 */
export function directoryHandleSource(handle) {
  const dir = handle;
  return {
    capabilities: { writable: true, liveWatch: false, binary: true },

    async read() {
      const { manifestText, pageTexts, missing = 0 } = await readProject(dir);
      return { manifestText, pageFiles: pageTexts, missing };
    },

    async write(files) {
      return writeFiles(
        dir,
        files.map((f) =>
          f.bytes != null ? { path: f.path, b64: bytesToBase64(f.bytes) } : { path: f.path, content: f.text ?? "" }
        )
      );
    },

    async readMedia(path) {
      const mime = extToMime(/\.([a-z0-9]+)$/i.exec(path)?.[1]);
      if (!mime) return null;
      const dataUrl = await readImageAsDataUrl(dir, path, mime);
      if (!dataUrl) return null;
      const comma = dataUrl.indexOf(",");
      return comma < 0 ? null : base64ToBytes(dataUrl.slice(comma + 1));
    },

    /** Fingerprint (used by live-reload polling; same semantics as handle-io.fingerprint). */
    fingerprint() {
      return fingerprint(dir);
    },
  };
}

// ----------------------------------------------------------------------------
// Implementation 3: memorySource — tests and embedding (no IO)
// ----------------------------------------------------------------------------
/**
 * @param {{ files?: Record<string, string|Uint8Array>, writable?: boolean }} [opts]
 *   files an in-memory project keyed by path ("deck.pptd" + "pages/*.page" + binary media)
 */
export function memorySource({ files = {}, writable = true } = {}) {
  const store = new Map();
  for (const [path, value] of Object.entries(files)) store.set(path, value);

  const textOf = (v) => (typeof v === "string" ? v : new TextDecoder().decode(v));
  const manifestPath = () => {
    if (store.has("deck.pptd")) return "deck.pptd";
    for (const key of store.keys()) if (/\.pptd$/i.test(key)) return key;
    return "deck.pptd";
  };

  return {
    capabilities: { writable, liveWatch: false, binary: true },

    async read() {
      const mPath = manifestPath();
      const manifestText = store.has(mPath) ? textOf(store.get(mPath)) : "";
      const pageFiles = new Map();
      const media = new Map();
      for (const [path, value] of store.entries()) {
        if (path === mPath) continue;
        if (typeof value === "string") pageFiles.set(path, value);
        else media.set(path, value);
      }
      return { manifestText, pageFiles, media: media.size ? media : undefined };
    },

    async write(files) {
      for (const f of files) store.set(f.path, f.bytes != null ? f.bytes : f.text ?? "");
      return files.length;
    },

    async readMedia(path) {
      const v = store.get(path);
      if (v == null) return null;
      return typeof v === "string" ? new TextEncoder().encode(v) : v;
    },
  };
}

// ----------------------------------------------------------------------------
// Read result → editor state (shared by loader and external assembly)
// ----------------------------------------------------------------------------
/**
 * Apply a read project to editor state: reset history/selection/pages/image map/
 * id counter and render the statusbar (shared by loadDeck and manual refresh).
 * @param {{ manifestText, pageFiles, manifestPath?, handle?, projectName? }} deckData
 * @param {{ state, images, renderStatusBar, setBrandFile, applyTheme? }} ctx
 *        the injected editor context (images.rebuildImageMap / topbar brand / statusbar)
 */
export function applyDeck(deckData, ctx) {
  const { state, images, renderStatusBar, setBrandFile } = ctx;
  const { manifestText, pageFiles, manifestPath = "", handle = null, projectName = "" } = deckData;
  state.deck = parseDeck(manifestText, pageFiles);
  state.manifestPath = manifestPath;
  state.projectHandle = handle;
  state.projectName = projectName;
  setBrandFile(handle ? projectName : manifestPath);
  // Theme: prefer loader's applyTheme (stays the single implementation); external callers without that dep use the inline equivalent
  if (typeof ctx.applyTheme === "function") {
    ctx.applyTheme(state.deck.theme || DEFAULT_THEME);
  } else {
    const themeInput = state.deck.theme || DEFAULT_THEME;
    state.deck.theme =
      themeInput && typeof themeInput === "object"
        ? JSON.parse(JSON.stringify(themeInput))
        : JSON.parse(JSON.stringify(DEFAULT_THEME));
    state.theme = resolveTheme(state.deck);
  }
  state.currentPage = 0;
  state.selectedId = null;
  state.history = createHistory();
  commitBaseline(state); // load baseline: undo/redo back to it means no unsaved changes
  syncElementId(state.deck);
  images.rebuildImageMap();
  renderStatusBar();
}

/**
 * Delegating source: routes reads/writes to the "current project source"
 * (handle mode wins, otherwise the source injected at assembly). createIo uses it
 * to converge standalone's two sources ("URL project ↔ local handle project")
 * onto one ProjectSource facade, which loader/saver/live-reload only know.
 */
export function delegatingSource({ base, handleSource, currentHandle }) {
  const chosen = () => (currentHandle() ? handleSource(currentHandle()) : base);
  return {
    get capabilities() {
      return chosen()?.capabilities || { writable: false, liveWatch: false, binary: false };
    },
    read: (hint) => chosen().read(hint),
    write: (files) => chosen().write(files),
    readMedia: (path) => chosen().readMedia?.(path) ?? Promise.resolve(null),
    watch: (cb, hooks) => chosen().watch?.(cb, hooks) ?? (() => {}),
    fingerprint: () => chosen().fingerprint?.() ?? Promise.resolve(null),
    /** Handle-project read (used by loader.loadDeckFromHandle; falls back to a plain read when there is no handle). */
    readFromHandle: (handle) => handleSource(handle).read(),
  };
}
