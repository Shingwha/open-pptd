// editor/app/project/source.js — transport seam (ProjectSource contract + implementations)
// The editor depends only on this duck-typed interface for "where a project comes from
// and goes to": capabilities { writable, liveWatch, binary }, read(hint?), write(files),
// readMedia?(path), watch?(cb, hooks). Ships httpSource / directoryHandleSource /
// memorySource plus delegatingSource; applyDeck() applies a read result to editor state.

import { createHistory } from "../../interaction/history.js";
import { commitBaseline } from "../state.js";
import { fetchProjectTexts } from "./project-cache.js";
import { readProject, writeFiles, fingerprint, readImageAsDataUrl } from "./handle-io.js";
import {
  base64ToBytes,
  bytesToBase64,
  parseDeck,
  resolveTheme,
  syncElementId,
  yaml,
} from "../../../packages/model/index.js";
import { RevisionConflictError, assertRevision, projectRevision } from "../../../packages/runtime/index.js";
import { extToMime } from "../../../packages/writer/index.js";

// Editor site root (this file lives in <root>/editor/app/project/, so ../../../ is editor/)
const EDITOR_BASE = new URL("../../", import.meta.url).href;

/** Revision domain used by HTTP/handle saves: manifest + page texts (no media). */
export function revisionOfSourceFiles(files) {
  let manifestText = "";
  const pageFiles = new Map();
  for (const f of files || []) {
    if (typeof f?.text !== "string") continue;
    if (/\.pptd$/i.test(f.path)) manifestText = f.text;
    else if (/\.page$/i.test(f.path)) pageFiles.set(f.path, f.text);
  }
  return projectRevision({ manifestText, pageFiles });
}

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

/** Prefix a relative path with base (returned as-is when base is empty). */
function withBase(base, path) {
  if (!path) return path;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  return `${base}${path}`;
}

// Implementation 1: httpSource — serve fetch / SSE mode (parameterized base)
/**
 * @param {{ base?: string, deckUrl?: string }} [opts]
 *   base    site prefix (default "", i.e. the current serve behavior's root-absolute path)
 *   deckUrl project manifest location (absolute URL, a path relative to base, or () => string)
 */
export function httpSource({ base = "", deckUrl = null } = {}) {
  const deckUrlOf = () => (typeof deckUrl === "function" ? deckUrl() : deckUrl);
  // Manifest URL of the last read: readMedia resolves project-relative paths against
  // it (i.e. against the project directory), which is what preview/export expect.
  let manifestUrl = null;
  let lastRevision = null;

  const api = {
    // liveWatch is promised by the serve-mode capability marker only (server injects
    // window.__PPTD_LIVE__ into editor/index.html); on static hosting there is no
    // /events endpoint and the editor must not even attempt an EventSource.
    capabilities: {
      writable: true,
      liveWatch: typeof window !== "undefined" && window.__PPTD_LIVE__ === true,
      binary: true,
    },

    /** Revision of the last read/write (opaque; used by the saver after write). */
    get lastRevision() {
      return lastRevision;
    },

    /** hint names this read's project URL (optional; defaults to the deckUrl given at construction). */
    async read(hint) {
      manifestUrl = resolveDeckUrl(hint || deckUrlOf(), base);
      if (!manifestUrl) throw new Error("httpSource 未指定 deckUrl");
      const { manifestText, pageTexts, missing = 0 } = await fetchProjectTexts(manifestUrl, yaml.load);
      lastRevision = projectRevision({ manifestText, pageFiles: pageTexts });
      return { manifestText, pageFiles: pageTexts, missing, manifestPath: manifestUrl, revision: lastRevision };
    },

    /**
     * Batch write-back (POST /api/save; body shape matches the server: text content / image b64).
     * A stale expectedRevision surfaces as RevisionConflictError (server 409), never a silent overwrite.
     */
    async write(files, { expectedRevision } = {}) {
      const body = {
        files: files.map((f) =>
          f.bytes != null ? { path: f.path, b64: bytesToBase64(f.bytes) } : { path: f.path, content: f.text ?? "" }
        ),
      };
      if (expectedRevision != null) body.expectedRevision = expectedRevision;
      const res = await fetch(withBase(base, "/api/save"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          throw new RevisionConflictError(data?.error?.currentRevision ?? data?.currentRevision ?? null, expectedRevision);
        }
        throw new Error(data?.error?.message || `HTTP ${res.status}`);
      }
      if (typeof data.revision === "string") lastRevision = data.revision;
      return data.count ?? files.length;
    },

    async readMedia(path) {
      try {
        // project-relative path → URL: against the manifest read last (project dir);
        // before any read, against the construction-time deckUrl (gallery covers pass
        // already-parsed texts, no read happens), then against the site prefix.
        const hintUrl = manifestUrl || (deckUrlOf() ? resolveDeckUrl(deckUrlOf(), base) : null);
        const url = hintUrl ? new URL(path, hintUrl).href : withBase(base, path);
        const res = await fetch(url);
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
  return api;
}

// Implementation 2: directoryHandleSource — browser File System Access handle mode
/**
 * Wraps editor/app/project/handle-io.js (that file is unchanged; its duck-typed
 * design is already correct). File System Access has no push channel →
 * liveWatch=false; live-reload falls back to fingerprint polling.
 */
export function directoryHandleSource(handle) {
  const dir = handle;
  let lastRevision = null;
  const readRevision = async () => {
    const { manifestText, pageTexts } = await readProject(dir);
    return projectRevision({ manifestText, pageFiles: pageTexts });
  };
  const api = {
    capabilities: { writable: true, liveWatch: false, binary: true },

    get lastRevision() {
      return lastRevision;
    },

    async read() {
      const { manifestText, pageTexts, missing = 0 } = await readProject(dir);
      lastRevision = projectRevision({ manifestText, pageFiles: pageTexts });
      return { manifestText, pageFiles: pageTexts, missing, revision: lastRevision };
    },

    async write(files, { expectedRevision } = {}) {
      // Same revision domain as HTTP saves: manifest + page texts as read from disk.
      assertRevision(await readRevision(), expectedRevision);
      const count = await writeFiles(
        dir,
        files.map((f) =>
          f.bytes != null ? { path: f.path, b64: bytesToBase64(f.bytes) } : { path: f.path, content: f.text ?? "" }
        )
      );
      lastRevision = revisionOfSourceFiles(files);
      return count;
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
  return api;
}

// Implementation 3: memorySource — tests and embedding (no IO)
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
  /** Snapshot of the store in ProjectFiles shape (revision covers manifest + pages + media). */
  const snapshot = () => {
    const mPath = manifestPath();
    const pageFiles = new Map();
    const media = new Map();
    for (const [path, value] of store.entries()) {
      if (path === mPath) continue;
      if (typeof value === "string") pageFiles.set(path, value);
      else media.set(path, value);
    }
    return {
      manifestText: store.has(mPath) ? textOf(store.get(mPath)) : "",
      pageFiles,
      media,
    };
  };
  let lastRevision = projectRevision(snapshot());

  const api = {
    capabilities: { writable, liveWatch: false, binary: true },

    get lastRevision() {
      return lastRevision;
    },

    async read() {
      const data = snapshot();
      lastRevision = projectRevision(data);
      return {
        manifestText: data.manifestText,
        pageFiles: data.pageFiles,
        media: data.media.size ? data.media : undefined,
        revision: lastRevision,
      };
    },

    async write(files, { expectedRevision } = {}) {
      assertRevision(lastRevision, expectedRevision);
      for (const f of files) store.set(f.path, f.bytes != null ? f.bytes : f.text ?? "");
      lastRevision = projectRevision(snapshot());
      return files.length;
    },

    async readMedia(path) {
      const v = store.get(path);
      if (v == null) return null;
      return typeof v === "string" ? new TextEncoder().encode(v) : v;
    },
  };
  return api;
}

// Read result → editor state (shared by loader and external assembly)
/**
 * Apply a read project to editor state: reset history/selection/pages/image map/
 * id counter and render the statusbar (shared by loadDeck and manual refresh).
 * @param {{ manifestText, pageFiles, manifestPath?, handle?, projectName? }} deckData
 * @param {{ state, ops, images, renderStatusBar, setBrandFile }} ctx
 *        the injected editor context (ops document/selection writes, images.rebuildImageMap / topbar brand / statusbar)
 */
export function applyDeck(deckData, ctx) {
  const { state, ops, images, renderStatusBar, setBrandFile } = ctx;
  const { manifestText, pageFiles, manifestPath = "", handle = null, projectName = "", revision = null } = deckData;
  ops.replaceDeck(parseDeck(manifestText, pageFiles));
  state.manifestPath = manifestPath;
  state.projectHandle = handle;
  state.projectName = projectName;
  state.revision = revision; // revision the save conflict check is based on (null = unconditional)
  setBrandFile(handle ? projectName : manifestPath);
  // 主题：直接解析 deck.theme（3.2 不再迁移/规范化旧主题结构，colors 编辑由 loader.applyColors 负责）
  state.theme = resolveTheme(state.deck);
  state.themeRevision = (state.themeRevision || 0) + 1; // 新项目/重载：缩略图全量重画
  state.currentPage = 0;
  ops.clearSelection();
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
    get lastRevision() {
      return chosen()?.lastRevision ?? null;
    },
    read: (hint) => chosen().read(hint),
    write: (files, opts) => chosen().write(files, opts),
    readMedia: (path) => chosen().readMedia?.(path) ?? Promise.resolve(null),
    watch: (cb, hooks) => chosen().watch?.(cb, hooks) ?? (() => {}),
    fingerprint: () => chosen().fingerprint?.() ?? Promise.resolve(null),
    /** Handle-project read (used by loader.loadDeckFromHandle; falls back to a plain read when there is no handle). */
    readFromHandle: (handle) => handleSource(handle).read(),
  };
}
